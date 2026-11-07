import sqlite3, json, math, csv, io, secrets, os
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, g, Response, redirect, send_from_directory
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB = os.path.join(BASE_DIR, "transit.db")
app = Flask(__name__, static_folder="static", static_url_path="")
DEFAULT_ADMIN_KEY = "admin123"
THRESHOLD = 0.5          # face distance: lower = stricter
PASSES = {
    "1-day": (1, 150),
    "3-day": (3, 350),
    "7-day": (7, 700),
    "30-day-vip": (30, 2000)
}

SCHEMA = """
CREATE TABLE IF NOT EXISTS users(id INTEGER PRIMARY KEY, name TEXT, email TEXT UNIQUE, phone TEXT,
  kind TEXT, descriptor TEXT, balance REAL DEFAULT 0, pass_expiry TEXT, created TEXT, status TEXT DEFAULT 'active');
CREATE TABLE IF NOT EXISTS stations(id INTEGER PRIMARY KEY, name TEXT, mode TEXT, zone INTEGER);
CREATE TABLE IF NOT EXISTS journeys(id INTEGER PRIMARY KEY, user_id INT, entry_station INT, exit_station INT,
  entry_time TEXT, exit_time TEXT, fare REAL, status TEXT);
CREATE TABLE IF NOT EXISTS transactions(id INTEGER PRIMARY KEY, user_id INT, amount REAL, kind TEXT, note TEXT, time TEXT);
CREATE TABLE IF NOT EXISTS alerts(id INTEGER PRIMARY KEY, user_id INT, message TEXT, time TEXT, resolved INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS admins(
    id INTEGER PRIMARY KEY,
    name TEXT,
    email TEXT UNIQUE,
    password_hash TEXT,
    role TEXT DEFAULT 'Super Admin',
    status TEXT DEFAULT 'active',
    created_at TEXT,
    last_login TEXT
);
CREATE TABLE IF NOT EXISTS admin_sessions(
    token TEXT PRIMARY KEY,
    admin_id INTEGER,
    created_at TEXT,
    expires_at TEXT
);
CREATE TABLE IF NOT EXISTS attendance(
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    station_id INTEGER,
    journey_id INTEGER,
    date TEXT,
    check_in_time TEXT,
    check_out_time TEXT,
    status TEXT DEFAULT 'Present',
    verification_method TEXT DEFAULT 'Biometric Face Scan',
    notes TEXT
);
CREATE TABLE IF NOT EXISTS feedback(
    id INTEGER PRIMARY KEY,
    user_id INTEGER,
    name TEXT,
    email TEXT,
    category TEXT,
    rating INTEGER,
    subject TEXT,
    message TEXT,
    status TEXT DEFAULT 'new',
    reply TEXT,
    created_at TEXT,
    replied_at TEXT
);
CREATE TABLE IF NOT EXISTS notices(
    id INTEGER PRIMARY KEY,
    title TEXT,
    category TEXT,
    content TEXT,
    status TEXT DEFAULT 'published',
    priority TEXT DEFAULT 'normal',
    author TEXT DEFAULT 'Transit Admin',
    created_at TEXT,
    updated_at TEXT
);
CREATE TABLE IF NOT EXISTS admin_logs(
    id INTEGER PRIMARY KEY,
    admin_id INTEGER,
    admin_name TEXT,
    action TEXT,
    target_type TEXT,
    target_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT
);
"""

SEED = [
    ("Swargate", "Bus", 1),
    ("Shivajinagar", "Metro", 2),
    ("Pune Junction", "Train", 3),
    ("Deccan", "Metro", 3),
    ("Hinjewadi", "Bus", 5),
    ("Pimpri", "Train", 6)
]

DEFAULT_SETTINGS = {
    "base_fare": "10",
    "per_zone_fare": "5",
    "min_balance": "10",
    "anti_passback_sec": "20",
    "gate_override": "normal",   # 'normal', 'emergency_open', 'lockdown'
    "admin_key": DEFAULT_ADMIN_KEY
}

def db():
    if "db" not in g:
        g.db = sqlite3.connect(DB)
        g.db.row_factory = sqlite3.Row
    return g.db

@app.teardown_appcontext
def close(_):
    d = g.pop("db", None)
    if d:
        d.close()

now = lambda: datetime.now().isoformat(timespec="seconds")
rows = lambda q, a=(): [dict(r) for r in db().execute(q, a).fetchall()]

def one(q, a=()):
    r = db().execute(q, a).fetchone()
    return dict(r) if r else None

def get_setting(key, default=None):
    r = one("SELECT value FROM settings WHERE key=?", (key,))
    return r["value"] if r else default

def set_setting(key, value):
    db().execute("INSERT OR REPLACE INTO settings(key, value) VALUES(?,?)", (key, str(value)))
    db().commit()

def alert(uid, msg):
    db().execute("INSERT INTO alerts(user_id,message,time,resolved) VALUES(?,?,?,0)", (uid, msg, now()))
    db().commit()

def txn(uid, amt, kind, note):
    db().execute("INSERT INTO transactions(user_id,amount,kind,note,time) VALUES(?,?,?,?,?)", (uid, amt, kind, note, now()))

def has_pass(u):
    return bool(u.get("pass_expiry")) and u["pass_expiry"] > now()

def public(u):
    return {k: v for k, v in u.items() if k not in ("descriptor", "password_hash")} | {"has_pass": has_pass(u)}

def match(desc):
    best, bd = None, 9
    for u in rows("SELECT * FROM users"):
        try:
            d = math.dist(desc, json.loads(u["descriptor"]))
            if d < bd:
                best, bd = u, d
        except Exception:
            continue
    return (best, bd) if bd <= THRESHOLD else (None, bd)

def fare_between(a, b):
    try:
        base = float(get_setting("base_fare", 10))
        per_zone = float(get_setting("per_zone_fare", 5))
    except Exception:
        base, per_zone = 10.0, 5.0
    return max(0.0, base + per_zone * abs(a["zone"] - b["zone"]))

def get_current_admin():
    auth_header = request.headers.get("Authorization", "")
    token = None
    if auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1].strip()
    elif request.args.get("token"):
        token = request.args.get("token")
    
    if token:
        sess = one("SELECT * FROM admin_sessions WHERE token=?", (token,))
        if sess:
            if sess["expires_at"] > now():
                admin = one("SELECT id, name, email, role, status FROM admins WHERE id=?", (sess["admin_id"],))
                if admin and admin["status"] == "active":
                    return admin
            else:
                db().execute("DELETE FROM admin_sessions WHERE token=?", (token,))
                db().commit()
    
    # Backward compatibility with legacy X-Admin-Key
    configured_key = get_setting("admin_key", DEFAULT_ADMIN_KEY)
    req_key = request.headers.get("X-Admin-Key") or request.args.get("key")
    if req_key and (req_key == configured_key or req_key == DEFAULT_ADMIN_KEY):
        return {"id": 1, "name": "Transit Chief Administrator", "email": "admin@biotransit.com", "role": "Super Admin", "status": "active"}
    
    return None

def admin_only():
    return bool(get_current_admin())

def log_admin_action(admin, action, target_type, target_id, details):
    try:
        aid = admin["id"] if admin else None
        aname = admin["name"] if admin else "System"
        ip = request.remote_addr or "127.0.0.1"
        db().execute(
            "INSERT INTO admin_logs(admin_id, admin_name, action, target_type, target_id, details, ip_address, created_at) "
            "VALUES(?,?,?,?,?,?,?,?)",
            (aid, aname, action, target_type, str(target_id) if target_id else "", details, ip, now())
        )
        db().commit()
    except Exception as e:
        print("Log error:", e)

def init_db():
    c = sqlite3.connect(DB)
    c.executescript(SCHEMA)
    
    # Migrate alerts table if 'resolved' column missing
    try:
        c.execute("ALTER TABLE alerts ADD COLUMN resolved INTEGER DEFAULT 0")
    except sqlite3.OperationalError:
        pass

    # Migrate users table for 'status' column
    try:
        c.execute("ALTER TABLE users ADD COLUMN status TEXT DEFAULT 'active'")
    except sqlite3.OperationalError:
        pass
    c.execute("UPDATE users SET status='active' WHERE status IS NULL OR status=''")

    # Seed default stations if empty
    if not c.execute("SELECT 1 FROM stations").fetchone():
        c.executemany("INSERT INTO stations(name,mode,zone) VALUES(?,?,?)", SEED)
    
    # Seed default settings
    for k, v in DEFAULT_SETTINGS.items():
        if not c.execute("SELECT 1 FROM settings WHERE key=?", (k,)).fetchone():
            c.execute("INSERT INTO settings(key, value) VALUES(?,?)", (k, v))
            
    # Seed default super admin if not exists
    if not c.execute("SELECT 1 FROM admins WHERE email='admin@biotransit.com'").fetchone():
        pw_hash = generate_password_hash("admin123")
        c.execute("INSERT INTO admins(name, email, password_hash, role, status, created_at) VALUES(?,?,?,?,?,?)",
                  ("Transit Chief Administrator", "admin@biotransit.com", pw_hash, "Super Admin", "active", now()))

    # Backfill attendance from journeys if empty
    if c.execute("SELECT COUNT(*) FROM attendance").fetchone()[0] == 0:
        c.row_factory = sqlite3.Row
        journeys = c.execute("SELECT * FROM journeys ORDER BY id ASC").fetchall()
        for j in journeys:
            j_date = j["entry_time"][:10] if j["entry_time"] else datetime.now().strftime("%Y-%m-%d")
            j_status = "Completed" if j["status"] == "closed" else "In-Transit"
            c.execute("""
                INSERT INTO attendance(user_id, station_id, journey_id, date, check_in_time, check_out_time, status, verification_method, notes)
                VALUES(?,?,?,?,?,?,?,?,?)
            """, (j["user_id"], j["entry_station"], j["id"], j_date, j["entry_time"], j["exit_time"], j_status, "Biometric Face Scan", f"Journey #{j['id']} automatic sync"))
        
        # Add past dates attendance records for demo users
        sample_dates = ["2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30"]
        for i, date_str in enumerate(sample_dates):
            for uid in [1, 2, 4]:
                c.execute("""
                    INSERT INTO attendance(user_id, station_id, journey_id, date, check_in_time, check_out_time, status, verification_method, notes)
                    VALUES(?,?,?,?,?,?,?,?,?)
                """, (uid, (uid + i) % 6 + 1, None, date_str, f"{date_str}T08:{30 + uid*5}:00", f"{date_str}T17:{45 + uid*3}:00", "Completed", "Biometric Face Scan", "Daily commute verification"))

    # Seed feedback if empty
    if c.execute("SELECT COUNT(*) FROM feedback").fetchone()[0] == 0:
        seed_feedback = [
            (1, "ATHARV SHINDE", "atharvshinde145@gmail.com", "General", 5, "Amazing touchless gate experience", "The face scan opened the Swargate turnstile in under a second! No card needed.", "replied", "Thank you Atharv! We are thrilled that the sub-second turnstiles are working great for your daily commute.", "2026-10-10T11:20:00", "2026-10-10T14:30:00"),
            (2, "PIYUSH MAREWAD", "piyushmarewad@gmail.com", "Payment", 4, "Tourist pass discount query", "I purchased the 3-day tourist pass. Can I also use it on Pune Suburban Trains as well as Metro?", "replied", "Yes Piyush, all tourist passes include unlimited multimodal access across Metro, Bus, and Suburban trains.", "2026-10-12T09:15:00", "2026-10-12T10:00:00"),
            (4, "Aniket Bhosale", "aniketbhosale08@gmail.com", "Gate Issue", 3, "Lighting reflection at Hinjewadi scanner", "During bright sunlight at 1 PM, the biometric camera at Hinjewadi gate took 2 scans to recognise me.", "new", None, "2026-10-28T13:45:00", None),
            (5, "Adesh Mahale", "adesh@gmail.com", "Suggestion", 5, "Add monthly student transit subsidy", "Would be fantastic if college students could get a special monthly pass rate linked to college ID.", "new", None, "2026-10-29T16:10:00", None),
            (3, "Sk", "sk123@gmaill.com", "Transit Bug", 4, "Wallet balance update delay", "Balance updated after gate exit took about 3 seconds to reflect on the smartcard display.", "new", None, "2026-10-30T18:22:00", None)
        ]
        c.executemany("""
            INSERT INTO feedback(user_id, name, email, category, rating, subject, message, status, reply, created_at, replied_at)
            VALUES(?,?,?,?,?,?,?,?,?,?,?)
        """, seed_feedback)

    # Seed notices if empty
    if c.execute("SELECT COUNT(*) FROM notices").fetchone()[0] == 0:
        seed_notices = [
            ("Pune Metro Line 3 Hinjewadi Phase Commences Biometric Gate Trial", "Update", "Central Transit Command has activated AI facial recognition turnstiles at Hinjewadi IT Park Station for peak-hour commuter flow testing.", "published", "urgent", "Central Admin", "2026-10-25T09:00:00", "2026-10-25T09:00:00"),
            ("Diwali Holiday Unlimited Pass Special Concession", "Policy", "All commuters traveling between Swargate and Deccan corridors can avail 30% bonus wallet credits during the festive week.", "published", "normal", "Central Admin", "2026-10-27T10:30:00", "2026-10-27T10:30:00"),
            ("Biometric Scanner Calibration & Maintenance Schedule", "Maintenance", "Routine sensor recalibration will take place at Pune Junction terminal between 01:00 AM and 03:30 AM this Sunday. Regular service will not be interrupted.", "published", "low", "Central Admin", "2026-10-29T14:00:00", "2026-10-29T14:00:00")
        ]
        c.executemany("""
            INSERT INTO notices(title, category, content, status, priority, author, created_at, updated_at)
            VALUES(?,?,?,?,?,?,?,?)
        """, seed_notices)

    # Seed admin logs if empty
    if c.execute("SELECT COUNT(*) FROM admin_logs").fetchone()[0] == 0:
        seed_logs = [
            (1, "Transit Chief Administrator", "SYSTEM_INIT", "system", "0", "Separate Admin Control Panel database schema initialized and activated", "127.0.0.1", "2026-10-31T14:00:00"),
            (1, "Transit Chief Administrator", "AUTH_LOGIN", "auth", "1", "Administrator authenticated via security credentials", "127.0.0.1", "2026-10-31T14:05:00"),
            (1, "Transit Chief Administrator", "STATION_UPDATE", "station", "5", "Verified Hinjewadi multimodal interchange fare zone parameters", "127.0.0.1", "2026-10-31T14:10:00")
        ]
        c.executemany("""
            INSERT INTO admin_logs(admin_id, admin_name, action, target_type, target_id, details, ip_address, created_at)
            VALUES(?,?,?,?,?,?,?,?)
        """, seed_logs)

    c.commit()
    c.close()

# ==========================================
# --- Public Main Website Endpoints ---
# ==========================================

@app.get("/")
def home():
    return app.send_static_file("index.html")

# Dedicated Separate Admin Routes
@app.get("/admin")
@app.get("/admin/")
def admin_root():
    return redirect("/admin/dashboard")

@app.get("/admin/login")
def admin_login_page():
    return app.send_static_file("admin/login.html")

@app.get("/admin/dashboard")
def admin_dashboard_page():
    return app.send_static_file("admin/dashboard.html")

@app.get("/api/stations")
def stations():
    return jsonify(rows("SELECT * FROM stations ORDER BY zone ASC, name ASC"))

@app.get("/api/notices")
def public_notices():
    return jsonify(rows("SELECT id, title, category, content, priority, created_at FROM notices WHERE status='published' ORDER BY id DESC LIMIT 8"))

@app.get("/api/feedback/recent")
def public_recent_feedback():
    return jsonify(rows("SELECT id, name, category, rating, subject, message, reply, created_at, replied_at FROM feedback ORDER BY id DESC LIMIT 8"))

@app.get("/api/demo-profiles")
def demo_profiles():
    users = rows("SELECT id, name, kind, balance, descriptor, pass_expiry, COALESCE(status, 'active') as status FROM users")
    res = []
    for u in users:
        try:
            res.append({
                "id": u["id"],
                "name": u["name"],
                "kind": u["kind"],
                "balance": u["balance"],
                "status": u["status"],
                "has_pass": has_pass(u),
                "pass_expiry": u["pass_expiry"],
                "descriptor": json.loads(u["descriptor"])
            })
        except Exception:
            pass
    return jsonify(res)

@app.post("/api/register")
def register():
    d = request.json or {}
    if not all(d.get(k) for k in ("name", "email", "descriptor")):
        return jsonify(ok=False, msg="Please provide your name, email, and biometric scan"), 400
    u, _ = match(d["descriptor"])
    if u:
        return jsonify(ok=False, msg=f"This biometric face is already linked to {u['name']}"), 409
    try:
        cur = db().execute(
            "INSERT INTO users(name,email,phone,kind,descriptor,balance,created,status) VALUES(?,?,?,?,?,?,?,'active')",
            (d["name"].strip(), d["email"].strip().lower(), d.get("phone", "").strip(),
             d.get("kind", "resident"), json.dumps(d["descriptor"]), 50.0, now())
        )
        # Give welcoming sign-up bonus of Rs 50
        uid = cur.lastrowid
        txn(uid, 50.0, "bonus", "Welcome Commuter Registration Bonus")
        db().commit()
    except sqlite3.IntegrityError:
        return jsonify(ok=False, msg="Email address is already registered in transit database"), 409
    return jsonify(ok=True, msg=f"Welcome {d['name']}! Biometric profile created with ₹50 bonus.", user_id=cur.lastrowid)

@app.post("/api/identify")
def identify():
    d = request.json or {}
    if "user_id" in d and not d.get("descriptor"):
        u = one("SELECT * FROM users WHERE id=?", (d["user_id"],))
        dist = 0.0
    else:
        if not d.get("descriptor"):
            return jsonify(ok=False, msg="Biometric descriptor missing"), 400
        u, dist = match(d["descriptor"])
    if not u:
        return jsonify(ok=False, msg="Face not recognised in database"), 404

    # Attendance statistics for commuter
    total_dates_recorded = one("SELECT COUNT(DISTINCT date) as c FROM attendance")["c"] or 1
    user_days_present = one("SELECT COUNT(DISTINCT date) as c FROM attendance WHERE user_id=?", (u["id"],))["c"] or 0
    att_pct = min(100.0, round((user_days_present / total_dates_recorded) * 100, 1))

    user_attendance = rows("""
        SELECT a.*, s.name as station_name, s.mode as station_mode
        FROM attendance a
        LEFT JOIN stations s ON s.id=a.station_id
        WHERE a.user_id=? ORDER BY a.id DESC LIMIT 15
    """, (u["id"],))

    user_feedback = rows("""
        SELECT * FROM feedback WHERE user_id=? OR email=? ORDER BY id DESC LIMIT 10
    """, (u["id"], u["email"]))

    return jsonify(
        ok=True,
        user=public(u),
        distance=round(dist, 3),
        journeys=rows("SELECT j.*, a.name AS entry_name, b.name AS exit_name FROM journeys j "
                      "LEFT JOIN stations a ON a.id=j.entry_station LEFT JOIN stations b ON b.id=j.exit_station "
                      "WHERE user_id=? ORDER BY j.id DESC LIMIT 25", (u["id"],)),
        transactions=rows("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 25", (u["id"],)),
        attendance=user_attendance,
        attendance_stats={
            "days_present": user_days_present,
            "total_days": total_dates_recorded,
            "percentage": att_pct
        },
        feedback=user_feedback
    )

@app.post("/api/topup")
def topup():
    d = request.json or {}
    try:
        amt = float(d.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify(ok=False, msg="Invalid numeric amount"), 400
    if amt <= 0 or amt > 10000:
        return jsonify(ok=False, msg="Top-up amount must be between ₹1 and ₹10,000"), 400
    u = one("SELECT * FROM users WHERE id=?", (d.get("user_id"),))
    if not u:
        return jsonify(ok=False, msg="User not found"), 404
    db().execute("UPDATE users SET balance=balance+? WHERE id=?", (amt, u["id"]))
    txn(u["id"], amt, "topup", f"Transit Wallet Top-up (₹{amt:.2f})")
    db().commit()
    return jsonify(ok=True, user=public(one("SELECT * FROM users WHERE id=?", (u["id"],))))

@app.post("/api/pass")
def buy_pass():
    d = request.json or {}
    plan = PASSES.get(d.get("plan"))
    u = one("SELECT * FROM users WHERE id=?", (d.get("user_id"),))
    if not plan or not u:
        return jsonify(ok=False, msg="Invalid pass plan or commuter"), 400
    days, price = plan
    if u["balance"] < price:
        return jsonify(ok=False, msg=f"Insufficient balance. Pass requires ₹{price}. Please top up."), 402
    
    start = max(datetime.now(), datetime.fromisoformat(u["pass_expiry"]) if has_pass(u) else datetime.now())
    exp = (start + timedelta(days=days)).isoformat(timespec="seconds")
    db().execute("UPDATE users SET balance=balance-?, pass_expiry=? WHERE id=?", (price, exp, u["id"]))
    txn(u["id"], -price, "pass", f"Tourist Pass Purchase: {d['plan'].upper()}")
    db().commit()
    return jsonify(ok=True, user=public(one("SELECT * FROM users WHERE id=?", (u["id"],))))

@app.post("/api/gate")
def gate():
    d = request.json or {}
    station_id = d.get("station_id")
    st = one("SELECT * FROM stations WHERE id=?", (station_id,))
    if not st:
        return jsonify(ok=False, msg="Invalid transit station specified"), 400

    # 1. Check Global Gate Override Modes
    override = get_setting("gate_override", "normal")
    if override == "emergency_open":
        return jsonify(
            ok=True,
            action="EMERGENCY_OPEN",
            user={"name": "Emergency Commuter", "balance": 0.0, "has_pass": True},
            msg="🚨 EMERGENCY PROTOCOL ACTIVE: All turnstiles open for immediate evacuation."
        )
    if override == "lockdown":
        alert(None, f"Security lockdown prevented passage attempt at {st['name']}")
        return jsonify(
            ok=False,
            msg="🔒 SYSTEM LOCKDOWN: Turnstile closed by Central Transit Command."
        ), 403

    # 2. Biometric matching
    if not d.get("descriptor"):
        return jsonify(ok=False, msg="No biometric descriptor received"), 400
    u, dist = match(d["descriptor"])
    if not u:
        alert(None, f"Unrecognised biometric identity attempt at {st['name']}")
        return jsonify(ok=False, msg="Face not recognised - Turnstile barrier locked"), 403

    # Check commuter account status
    if u.get("status") == "inactive":
        alert(u["id"], f"Gate passage denied: Account deactivated for {u['name']} at {st['name']}")
        return jsonify(
            ok=False,
            msg=f"⛔ ACCESS DENIED: Account for {u['name']} is deactivated. Please contact transit administration.",
            user=public(u)
        ), 403

    min_bal = float(get_setting("min_balance", 10))
    anti_passback_sec = int(get_setting("anti_passback_sec", 20))

    oj = one("SELECT * FROM journeys WHERE user_id=? AND status='open' ORDER BY id DESC", (u["id"],))
    if not oj:
        # === ENTRY SCAN ===
        if not has_pass(u) and u["balance"] < min_bal:
            alert(u["id"], f"Entry denied (low balance ₹{u['balance']:.2f} < ₹{min_bal:.2f}) at {st['name']}")
            return jsonify(
                ok=False,
                msg=f"{u['name']}: Balance too low (₹{u['balance']:.2f}). Minimum ₹{min_bal:.0f} required.",
                user=public(u)
            ), 402

        # Anti-passback check: rapid entry right after last exit
        last = one("SELECT * FROM journeys WHERE user_id=? AND status='closed' ORDER BY id DESC", (u["id"],))
        if last and last.get("exit_time"):
            try:
                diff = datetime.now() - datetime.fromisoformat(last["exit_time"])
                if diff < timedelta(seconds=anti_passback_sec):
                    alert(u["id"], f"Anti-passback alert: rapid re-entry ({diff.seconds}s < {anti_passback_sec}s) for {u['name']} at {st['name']}")
            except Exception:
                pass

        cur = db().execute("INSERT INTO journeys(user_id,entry_station,entry_time,status) VALUES(?,?,?,'open')",
                           (u["id"], st["id"], now()))
        jid = cur.lastrowid
        
        # Sync entry to Attendance Management table
        today_date = datetime.now().strftime("%Y-%m-%d")
        db().execute("""
            INSERT INTO attendance(user_id, station_id, journey_id, date, check_in_time, status, verification_method, notes)
            VALUES(?,?,?,?,?,'In-Transit','Biometric Face Scan',?)
        """, (u["id"], st["id"], jid, today_date, now(), f"Turnstile Entry at {st['name']} ({st['mode']})"))
        db().commit()

        return jsonify(
            ok=True,
            action="ENTRY",
            fare=0.0,
            msg=f"Welcome {u['name']}! Authorized Entry at {st['name']} ({st['mode']} - Zone {st['zone']})",
            user=public(u)
        )

    # === EXIT SCAN ===
    entry_st = one("SELECT * FROM stations WHERE id=?", (oj["entry_station"],)) or st
    fare = 0.0 if has_pass(u) else fare_between(entry_st, st)

    # Check journey prolonged duration > 6 hours
    try:
        dur = datetime.now() - datetime.fromisoformat(oj["entry_time"])
        if dur > timedelta(hours=6):
            alert(u["id"], f"Commute duration exceeded 6 hours ({dur.seconds // 3600}h) for {u['name']}")
    except Exception:
        pass

    db().execute("UPDATE journeys SET exit_station=?, exit_time=?, fare=?, status='closed' WHERE id=?",
                 (st["id"], now(), fare, oj["id"]))
    if fare > 0:
        db().execute("UPDATE users SET balance=balance-? WHERE id=?", (fare, u["id"]))
        txn(u["id"], -fare, "fare", f"{entry_st['name']} -> {st['name']}")
        
    # Sync exit to Attendance Management table
    db().execute("UPDATE attendance SET check_out_time=?, status='Completed' WHERE journey_id=?",
                 (now(), oj["id"]))
    db().commit()

    u_after = one("SELECT * FROM users WHERE id=?", (u["id"],))
    if u_after["balance"] < 0:
        alert(u["id"], f"Negative balance (₹{u_after['balance']:.2f}) recorded for {u['name']}")

    fare_str = "₹ 0.00 (Tourist Pass)" if has_pass(u) else f"₹ {fare:.2f}"
    return jsonify(
        ok=True,
        action="EXIT",
        fare=fare,
        user=public(u_after),
        msg=f"Goodbye {u['name']}! {entry_st['name']} ➔ {st['name']} completed. Fare deducted: {fare_str}"
    )

# Public feedback submission
@app.post("/api/feedback")
def api_public_submit_feedback():
    d = request.json or {}
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    category = (d.get("category") or "General").strip()
    subject = (d.get("subject") or "").strip()
    message = (d.get("message") or "").strip()
    try:
        rating = max(1, min(5, int(d.get("rating", 5))))
    except (ValueError, TypeError):
        rating = 5
        
    if not name or not message:
        return jsonify(ok=False, msg="Please provide your name and feedback message"), 400
        
    user_id = None
    if email:
        u = one("SELECT id FROM users WHERE email=?", (email,))
        if u:
            user_id = u["id"]
            
    cur = db().execute("""
        INSERT INTO feedback(user_id, name, email, category, rating, subject, message, status, created_at)
        VALUES(?,?,?,?,?,?,?,'new',?)
    """, (user_id, name, email, category, rating, subject, message, now()))
    db().commit()
    
    return jsonify(ok=True, msg="Thank you! Your feedback has been received by Central Transit Command.", id=cur.lastrowid)

# ==========================================
# --- Dedicated Admin Control Panel APIs ---
# ==========================================

# 1. Admin Authentication & Session Management
@app.post("/api/admin/login")
def api_admin_login():
    d = request.json or {}
    email = (d.get("email") or "").strip().lower()
    password = (d.get("password") or "").strip()
    if not email or not password:
        return jsonify(ok=False, msg="Email and password are required"), 400
    
    admin = one("SELECT * FROM admins WHERE email=?", (email,))
    if not admin or not check_password_hash(admin["password_hash"], password):
        log_admin_action(None, "AUTH_FAILED", "auth", None, f"Failed login attempt for {email}")
        return jsonify(ok=False, msg="Invalid admin email address or password"), 401
    
    if admin.get("status") != "active":
        return jsonify(ok=False, msg="This administrator account is currently suspended"), 403
    
    # Generate secure 64-character token
    token = secrets.token_hex(32)
    expires = (datetime.now() + timedelta(days=7)).isoformat(timespec="seconds")
    db().execute("INSERT INTO admin_sessions(token, admin_id, created_at, expires_at) VALUES(?,?,?,?)",
                 (token, admin["id"], now(), expires))
    db().execute("UPDATE admins SET last_login=? WHERE id=?", (now(), admin["id"]))
    db().commit()
    
    log_admin_action(admin, "AUTH_LOGIN", "auth", admin["id"], f"Administrator {admin['name']} signed in")
    return jsonify(
        ok=True,
        msg="Authenticated successfully",
        token=token,
        admin={
            "id": admin["id"],
            "name": admin["name"],
            "email": admin["email"],
            "role": admin["role"],
            "status": admin["status"],
            "last_login": now()
        }
    )

@app.post("/api/admin/logout")
def api_admin_logout():
    admin = get_current_admin()
    auth_header = request.headers.get("Authorization", "")
    token = auth_header.split(" ", 1)[1].strip() if auth_header.startswith("Bearer ") else request.args.get("token")
    if token:
        db().execute("DELETE FROM admin_sessions WHERE token=?", (token,))
        db().commit()
    if admin:
        log_admin_action(admin, "AUTH_LOGOUT", "auth", admin["id"], "Administrator signed out")
    return jsonify(ok=True, msg="Signed out successfully")

@app.get("/api/admin/me")
def api_admin_me():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Not authenticated as admin"), 401
    return jsonify(ok=True, admin=admin)

@app.post("/api/admin/verify")
def admin_verify():
    if not admin_only():
        return jsonify(ok=False, msg="Invalid Admin Credentials"), 401
    return jsonify(ok=True, msg="Admin authenticated successfully")

# 2. Executive Dashboard Statistics
@app.get("/api/admin/dashboard/stats")
def api_admin_dashboard_stats():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    # User counts
    total_users = one("SELECT COUNT(*) AS c FROM users")["c"]
    active_users = one("SELECT COUNT(*) AS c FROM users WHERE status='active' OR status IS NULL")["c"]
    inactive_users = one("SELECT COUNT(*) AS c FROM users WHERE status='inactive'")["c"]
    
    # Listings & Content
    stations_count = one("SELECT COUNT(*) AS c FROM stations")["c"]
    notices_count = one("SELECT COUNT(*) AS c FROM notices")["c"]
    total_listings = stations_count + notices_count
    
    # Feedback & Attendance
    total_feedback = one("SELECT COUNT(*) AS c FROM feedback")["c"]
    pending_feedback = one("SELECT COUNT(*) AS c FROM feedback WHERE status='new'")["c"]
    total_attendance = one("SELECT COUNT(*) AS c FROM attendance")["c"]
    
    # Journeys & Revenue
    total_journeys = one("SELECT COUNT(*) AS c FROM journeys")["c"]
    open_journeys = one("SELECT COUNT(*) AS c FROM journeys WHERE status='open'")["c"]
    fare_revenue = one("SELECT COALESCE(SUM(fare), 0) AS s FROM journeys")["s"]
    topup_revenue = one("SELECT COALESCE(SUM(amount), 0) AS s FROM transactions WHERE kind='topup'")["s"]
    pass_revenue = one("SELECT COALESCE(SUM(ABS(amount)), 0) AS s FROM transactions WHERE kind='pass'")["s"]
    total_revenue = fare_revenue + pass_revenue
    
    # Security alerts
    active_alerts = one("SELECT COUNT(*) AS c FROM alerts WHERE resolved=0")["c"]
    
    # Attendance today
    today_prefix = datetime.now().strftime("%Y-%m-%d")
    today_attendance = one("SELECT COUNT(*) AS c FROM attendance WHERE date=?", (today_prefix,))["c"]
    
    # Recent users
    recent_users = rows("""
        SELECT id, name, email, phone, kind, balance, pass_expiry, 
               COALESCE(status, 'active') as status, created
        FROM users ORDER BY id DESC LIMIT 6
    """)
    for u in recent_users:
        u["has_pass"] = has_pass(u)
    
    # Charts data
    att_trend = rows("""
        SELECT date, COUNT(id) as count,
               COUNT(CASE WHEN status='Completed' THEN 1 END) as completed
        FROM attendance
        GROUP BY date
        ORDER BY date DESC LIMIT 7
    """)
    att_trend.reverse()
    
    mode_distribution = rows("""
        SELECT s.mode, COUNT(j.id) as count
        FROM stations s
        LEFT JOIN journeys j ON j.entry_station = s.id
        GROUP BY s.mode
    """)
    
    user_distribution = rows("""
        SELECT kind, COUNT(id) as count
        FROM users
        GROUP BY kind
    """)
    
    feedback_ratings = rows("""
        SELECT rating, COUNT(id) as count
        FROM feedback
        GROUP BY rating
        ORDER BY rating ASC
    """)
    
    busiest_stations = rows("""
        SELECT s.name, s.mode, s.zone, COUNT(j.id) as traffic
        FROM stations s
        LEFT JOIN journeys j ON j.entry_station = s.id OR j.exit_station = s.id
        GROUP BY s.id
        ORDER BY traffic DESC LIMIT 5
    """)
    
    return jsonify(
        ok=True,
        stats={
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": inactive_users,
            "total_listings": total_listings,
            "stations_count": stations_count,
            "notices_count": notices_count,
            "total_feedback": total_feedback,
            "pending_feedback": pending_feedback,
            "total_attendance": total_attendance,
            "today_attendance": today_attendance,
            "total_journeys": total_journeys,
            "open_journeys": open_journeys,
            "fare_revenue": fare_revenue,
            "topup_revenue": topup_revenue,
            "pass_revenue": pass_revenue,
            "total_revenue": total_revenue,
            "active_alerts": active_alerts
        },
        recent_users=recent_users,
        charts={
            "attendance_trend": att_trend,
            "mode_distribution": mode_distribution,
            "user_distribution": user_distribution,
            "feedback_ratings": feedback_ratings,
            "busiest_stations": busiest_stations
        }
    )

@app.get("/api/admin/overview")
def admin_overview():
    if not admin_only():
        return jsonify(ok=False, msg="Wrong admin key"), 401
    
    stats = one("""
        SELECT 
          (SELECT COUNT(*) FROM users) AS users,
          (SELECT COUNT(*) FROM journeys) AS journeys,
          (SELECT COUNT(*) FROM journeys WHERE status='open') AS open_journeys,
          (SELECT COALESCE(SUM(fare),0) FROM journeys) AS fare_revenue,
          (SELECT COALESCE(SUM(amount),0) FROM transactions WHERE kind='topup') AS total_topups,
          (SELECT COALESCE(SUM(ABS(amount)),0) FROM transactions WHERE kind='pass') AS pass_revenue,
          (SELECT COUNT(*) FROM alerts WHERE resolved=0) AS active_alerts,
          (SELECT COUNT(*) FROM stations) AS stations
    """) or {}

    mode_counts = rows("""
        SELECT s.mode, COUNT(j.id) as journeys, COALESCE(SUM(j.fare), 0) as revenue
        FROM stations s
        LEFT JOIN journeys j ON j.entry_station = s.id
        GROUP BY s.mode
    """)

    busiest = rows("""
        SELECT s.name, s.mode, s.zone, COUNT(j.id) as traffic
        FROM stations s
        LEFT JOIN journeys j ON j.entry_station = s.id OR j.exit_station = s.id
        GROUP BY s.id
        ORDER BY traffic DESC LIMIT 5
    """)

    return jsonify(
        ok=True,
        stats=stats,
        modes=mode_counts,
        busiest=busiest,
        gate_override=get_setting("gate_override", "normal"),
        fare_rules={
            "base_fare": float(get_setting("base_fare", 10)),
            "per_zone_fare": float(get_setting("per_zone_fare", 5)),
            "min_balance": float(get_setting("min_balance", 10)),
            "anti_passback_sec": int(get_setting("anti_passback_sec", 20))
        }
    )

# 3. User Management CRUD & Detailed Profile
@app.get("/api/admin/users")
def api_admin_get_users():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    q_search = (request.args.get("q") or "").strip().lower()
    status_filter = request.args.get("status") or "all"
    kind_filter = request.args.get("kind") or "all"
    page = max(1, int(request.args.get("page", 1)))
    limit = max(5, min(100, int(request.args.get("limit", 25))))
    offset = (page - 1) * limit
    
    clauses = ["1=1"]
    params = []
    
    if q_search:
        clauses.append("(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR u.phone LIKE ? OR CAST(u.id AS TEXT) = ?)")
        like_p = f"%{q_search}%"
        params.extend([like_p, like_p, like_p, q_search])
    
    if status_filter != "all":
        clauses.append("COALESCE(u.status, 'active') = ?")
        params.append(status_filter)
        
    if kind_filter != "all":
        clauses.append("u.kind = ?")
        params.append(kind_filter)
        
    where = " AND ".join(clauses)
    total = db().execute(f"SELECT COUNT(*) AS c FROM users u WHERE {where}", params).fetchone()["c"]
    
    sql = f"""
        SELECT u.id, u.name, u.email, u.phone, u.kind, u.balance, u.pass_expiry, 
               COALESCE(u.status, 'active') AS status, u.created,
               COUNT(DISTINCT j.id) AS journey_count,
               COUNT(DISTINCT a.id) AS attendance_count,
               COALESCE(SUM(j.fare), 0) AS total_fare_spent
        FROM users u
        LEFT JOIN journeys j ON j.user_id = u.id
        LEFT JOIN attendance a ON a.user_id = u.id
        WHERE {where}
        GROUP BY u.id
        ORDER BY u.id DESC
        LIMIT ? OFFSET ?
    """
    user_rows = db().execute(sql, params + [limit, offset]).fetchall()
    
    result = []
    for r in user_rows:
        item = dict(r)
        item["has_pass"] = has_pass(item)
        result.append(item)
        
    return jsonify(
        ok=True,
        users=result,
        total=total,
        page=page,
        limit=limit,
        total_pages=math.ceil(total / limit) if total > 0 else 1
    )

@app.get("/api/admin/user/<int:uid>")
def api_admin_get_user_profile(uid):
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    u = one("SELECT id, name, email, phone, kind, balance, pass_expiry, COALESCE(status, 'active') as status, created FROM users WHERE id=?", (uid,))
    if not u:
        return jsonify(ok=False, msg="Commuter not found"), 404
    u["has_pass"] = has_pass(u)
    
    attendance_records = rows("""
        SELECT a.*, s.name as station_name, s.mode as station_mode
        FROM attendance a
        LEFT JOIN stations s ON s.id = a.station_id
        WHERE a.user_id=?
        ORDER BY a.id DESC LIMIT 15
    """, (uid,))
    
    journeys_list = rows("""
        SELECT j.*, a.name AS entry_name, b.name AS exit_name, a.mode AS entry_mode, b.mode AS exit_mode
        FROM journeys j
        LEFT JOIN stations a ON a.id = j.entry_station
        LEFT JOIN stations b ON b.id = j.exit_station
        WHERE j.user_id=?
        ORDER BY j.id DESC LIMIT 15
    """, (uid,))
    
    txns = rows("SELECT * FROM transactions WHERE user_id=? ORDER BY id DESC LIMIT 15", (uid,))
    user_feedback = rows("SELECT * FROM feedback WHERE user_id=? OR email=? ORDER BY id DESC", (uid, u["email"]))
    
    total_dates_recorded = one("SELECT COUNT(DISTINCT date) as c FROM attendance")["c"] or 1
    user_days_present = one("SELECT COUNT(DISTINCT date) as c FROM attendance WHERE user_id=?", (uid,))["c"] or 0
    att_pct = min(100.0, round((user_days_present / total_dates_recorded) * 100, 1))
    
    return jsonify(
        ok=True,
        user=u,
        attendance=attendance_records,
        journeys=journeys_list,
        transactions=txns,
        feedback=user_feedback,
        stats={
            "days_present": user_days_present,
            "total_working_days": total_dates_recorded,
            "attendance_percentage": att_pct,
            "total_journeys": len(journeys_list),
            "total_transactions": len(txns)
        }
    )

@app.post("/api/admin/user/<int:uid>/status")
def api_admin_toggle_user_status(uid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    d = request.json or {}
    new_status = d.get("status")
    if new_status not in ("active", "inactive"):
        return jsonify(ok=False, msg="Status must be 'active' or 'inactive'"), 400
        
    u = one("SELECT * FROM users WHERE id=?", (uid,))
    if not u:
        return jsonify(ok=False, msg="User not found"), 404
        
    db().execute("UPDATE users SET status=? WHERE id=?", (new_status, uid))
    db().commit()
    
    log_admin_action(admin, "USER_STATUS_CHANGE", "user", uid, f"Changed status of {u['name']} ({u['email']}) to {new_status}")
    return jsonify(ok=True, msg=f"User status updated to {new_status.capitalize()}", status=new_status)

@app.put("/api/admin/user/<int:uid>")
def admin_update_user(uid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    name = (d.get("name") or "").strip()
    email = (d.get("email") or "").strip().lower()
    phone = (d.get("phone") or "").strip()
    kind = (d.get("kind") or "resident").strip()
    status_str = (d.get("status") or "active").strip()
    
    if not name or not email:
        return jsonify(ok=False, msg="Name and email required"), 400
    try:
        if "balance" in d:
            balance = float(d["balance"])
            db().execute("UPDATE users SET name=?, email=?, phone=?, kind=?, status=?, balance=? WHERE id=?",
                         (name, email, phone, kind, status_str, balance, uid))
        else:
            db().execute("UPDATE users SET name=?, email=?, phone=?, kind=?, status=? WHERE id=?",
                         (name, email, phone, kind, status_str, uid))
        db().commit()
    except sqlite3.IntegrityError:
        return jsonify(ok=False, msg="Email address is already registered to another commuter"), 409
        
    log_admin_action(admin, "USER_UPDATE", "user", uid, f"Updated commuter profile for {name} ({email})")
    return jsonify(ok=True, msg="Commuter details updated successfully")

@app.delete("/api/admin/user/<int:uid>")
def admin_delete_user(uid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    u = one("SELECT name, email FROM users WHERE id=?", (uid,))
    db().execute("DELETE FROM attendance WHERE user_id=?", (uid,))
    db().execute("DELETE FROM journeys WHERE user_id=?", (uid,))
    db().execute("DELETE FROM transactions WHERE user_id=?", (uid,))
    db().execute("DELETE FROM alerts WHERE user_id=?", (uid,))
    db().execute("DELETE FROM feedback WHERE user_id=?", (uid,))
    db().execute("DELETE FROM users WHERE id=?", (uid,))
    db().commit()
    
    log_admin_action(admin, "USER_DELETE", "user", uid, f"Deleted user #{uid} ({u['name'] if u else 'Unknown'})")
    return jsonify(ok=True, msg="Commuter profile and all associated transit records deleted")

@app.post("/api/admin/user/<int:uid>/balance")
def admin_user_balance(uid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    try:
        amt = float(d.get("amount", 0))
    except (ValueError, TypeError):
        return jsonify(ok=False, msg="Invalid numeric amount"), 400
    note = d.get("note") or f"Admin manual balance adjustment by {admin['name']}"
    u = one("SELECT * FROM users WHERE id=?", (uid,))
    if not u:
        return jsonify(ok=False, msg="Commuter not found"), 404
    db().execute("UPDATE users SET balance=balance+? WHERE id=?", (amt, uid))
    txn(uid, amt, "admin_adj", note)
    db().commit()
    log_admin_action(admin, "USER_BALANCE_ADJ", "user", uid, f"Adjusted balance by ₹{amt:+.2f} for {u['name']}")
    return jsonify(ok=True, msg=f"Balance adjusted by ₹{amt:+.2f}", user=public(one("SELECT * FROM users WHERE id=?", (uid,))))

@app.post("/api/admin/user/<int:uid>/pass")
def admin_grant_pass(uid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    days = int(d.get("days", 7))
    u = one("SELECT * FROM users WHERE id=?", (uid,))
    if not u:
        return jsonify(ok=False, msg="User not found"), 404
    start = max(datetime.now(), datetime.fromisoformat(u["pass_expiry"]) if has_pass(u) else datetime.now())
    exp = (start + timedelta(days=days)).isoformat(timespec="seconds")
    db().execute("UPDATE users SET pass_expiry=? WHERE id=?", (exp, uid))
    txn(uid, 0.0, "admin_pass", f"Admin {admin['name']} granted {days}-day unlimited pass")
    db().commit()
    log_admin_action(admin, "USER_GRANT_PASS", "user", uid, f"Granted {days}-day unlimited pass to {u['name']}")
    return jsonify(ok=True, msg=f"Granted {days}-day pass until {exp.split('T')[0]}", user=public(one("SELECT * FROM users WHERE id=?", (uid,))))

# 4. Attendance Management
@app.get("/api/admin/attendance")
def api_admin_get_attendance():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    q_search = (request.args.get("q") or "").strip().lower()
    date_filter = request.args.get("date") or ""
    status_filter = request.args.get("status") or "all"
    station_filter = request.args.get("station_id") or "all"
    user_id_filter = request.args.get("user_id") or ""
    
    clauses = ["1=1"]
    params = []
    
    if q_search:
        clauses.append("(LOWER(u.name) LIKE ? OR LOWER(u.email) LIKE ? OR CAST(a.user_id AS TEXT) = ?)")
        like_p = f"%{q_search}%"
        params.extend([like_p, like_p, q_search])
        
    if date_filter:
        clauses.append("a.date = ?")
        params.append(date_filter)
        
    if status_filter != "all":
        clauses.append("a.status = ?")
        params.append(status_filter)
        
    if station_filter != "all" and station_filter.isdigit():
        clauses.append("a.station_id = ?")
        params.append(int(station_filter))
        
    if user_id_filter and user_id_filter.isdigit():
        clauses.append("a.user_id = ?")
        params.append(int(user_id_filter))
        
    where = " AND ".join(clauses)
    
    sql = f"""
        SELECT a.*, u.name as user_name, u.email as user_email, u.phone as user_phone,
               s.name as station_name, s.mode as station_mode, s.zone as station_zone
        FROM attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN stations s ON s.id = a.station_id
        WHERE {where}
        ORDER BY a.date DESC, a.check_in_time DESC, a.id DESC
        LIMIT 200
    """
    records = rows(sql, params)
    return jsonify(ok=True, attendance=records, count=len(records))

@app.get("/api/admin/attendance/stats")
def api_admin_get_attendance_stats():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    distinct_dates = [r["date"] for r in rows("SELECT DISTINCT date FROM attendance ORDER BY date DESC")]
    total_dates = len(distinct_dates) or 1
    
    user_stats = rows("""
        SELECT u.id, u.name, u.email, u.kind, COALESCE(u.status, 'active') as status,
               COUNT(a.id) as total_checkins,
               COUNT(DISTINCT a.date) as days_present
        FROM users u
        LEFT JOIN attendance a ON a.user_id = u.id
        GROUP BY u.id
        ORDER BY days_present DESC, total_checkins DESC
    """)
    for s in user_stats:
        s["total_dates"] = total_dates
        s["attendance_pct"] = round((s["days_present"] / total_dates) * 100, 1)
    
    all_users_count = len(user_stats) or 1
    total_possible_attendances = all_users_count * total_dates
    actual_attendances = one("SELECT COUNT(DISTINCT user_id || '_' || date) as c FROM attendance")["c"]
    overall_rate = round((actual_attendances / total_possible_attendances) * 100, 1) if total_possible_attendances > 0 else 100.0
    
    return jsonify(
        ok=True,
        total_dates=total_dates,
        dates=distinct_dates[:14],
        users=user_stats,
        overall_rate=overall_rate,
        total_checkins=one("SELECT COUNT(*) as c FROM attendance")["c"]
    )

@app.post("/api/admin/attendance")
def api_admin_add_attendance():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    d = request.json or {}
    user_id = d.get("user_id")
    station_id = d.get("station_id")
    date_str = d.get("date") or datetime.now().strftime("%Y-%m-%d")
    check_in = d.get("check_in_time") or f"{date_str}T09:00:00"
    check_out = d.get("check_out_time") or f"{date_str}T18:00:00"
    status_str = d.get("status") or "Present"
    notes = d.get("notes") or f"Manual attendance entered by {admin['name']}"
    
    u = one("SELECT * FROM users WHERE id=?", (user_id,))
    if not u:
        return jsonify(ok=False, msg="User not found"), 404
        
    cur = db().execute("""
        INSERT INTO attendance(user_id, station_id, journey_id, date, check_in_time, check_out_time, status, verification_method, notes)
        VALUES(?,?,?,?,?,?,?,?,?)
    """, (user_id, station_id, None, date_str, check_in, check_out, status_str, "Manual Admin Override", notes))
    db().commit()
    
    log_admin_action(admin, "ATTENDANCE_MANUAL", "attendance", cur.lastrowid, f"Manually recorded attendance for {u['name']} on {date_str}")
    return jsonify(ok=True, msg=f"Attendance recorded for {u['name']} on {date_str}", id=cur.lastrowid)

@app.delete("/api/admin/attendance/<int:aid>")
def api_admin_delete_attendance(aid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    db().execute("DELETE FROM attendance WHERE id=?", (aid,))
    db().commit()
    log_admin_action(admin, "ATTENDANCE_DELETE", "attendance", aid, f"Deleted attendance record #{aid}")
    return jsonify(ok=True, msg=f"Attendance record #{aid} deleted")

# 5. Feedback Management
@app.get("/api/admin/feedback")
def api_admin_get_feedback():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    q_search = (request.args.get("q") or "").strip().lower()
    category = request.args.get("category") or "all"
    rating = request.args.get("rating") or "all"
    status_filter = request.args.get("status") or "all"
    
    clauses = ["1=1"]
    params = []
    
    if q_search:
        clauses.append("(LOWER(name) LIKE ? OR LOWER(email) LIKE ? OR LOWER(subject) LIKE ? OR LOWER(message) LIKE ?)")
        like_p = f"%{q_search}%"
        params.extend([like_p, like_p, like_p, like_p])
        
    if category != "all":
        clauses.append("category = ?")
        params.append(category)
        
    if rating != "all" and rating.isdigit():
        clauses.append("rating = ?")
        params.append(int(rating))
        
    if status_filter != "all":
        clauses.append("status = ?")
        params.append(status_filter)
        
    where = " AND ".join(clauses)
    fb_list = rows(f"SELECT * FROM feedback WHERE {where} ORDER BY id DESC LIMIT 100", params)
    categories = [r["category"] for r in rows("SELECT DISTINCT category FROM feedback WHERE category IS NOT NULL")]
    return jsonify(ok=True, feedback=fb_list, categories=categories, count=len(fb_list))

@app.post("/api/admin/feedback/<int:fid>/reply")
def api_admin_reply_feedback(fid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    d = request.json or {}
    reply_text = (d.get("reply") or "").strip()
    if not reply_text:
        return jsonify(ok=False, msg="Reply text cannot be empty"), 400
        
    fb = one("SELECT * FROM feedback WHERE id=?", (fid,))
    if not fb:
        return jsonify(ok=False, msg="Feedback entry not found"), 404
        
    db().execute("UPDATE feedback SET reply=?, status='replied', replied_at=? WHERE id=?",
                 (reply_text, now(), fid))
    db().commit()
    
    log_admin_action(admin, "FEEDBACK_REPLY", "feedback", fid, f"Replied to feedback #{fid} from {fb['name']}")
    return jsonify(ok=True, msg=f"Reply saved and sent for feedback #{fid}")

@app.delete("/api/admin/feedback/<int:fid>")
def api_admin_delete_feedback(fid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    db().execute("DELETE FROM feedback WHERE id=?", (fid,))
    db().commit()
    log_admin_action(admin, "FEEDBACK_DELETE", "feedback", fid, f"Deleted feedback #{fid}")
    return jsonify(ok=True, msg=f"Feedback #{fid} deleted")

# 6. Station & Corridor Network Management
@app.get("/api/admin/stations")
def api_admin_get_stations():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    stations_data = rows("""
        SELECT s.*, 
               COUNT(j.id) as traffic_count,
               COALESCE(SUM(j.fare), 0) as total_fare_collected
        FROM stations s
        LEFT JOIN journeys j ON j.entry_station = s.id OR j.exit_station = s.id
        GROUP BY s.id
        ORDER BY s.zone ASC, s.name ASC
    """)
    return jsonify(ok=True, stations=stations_data)

@app.post("/api/admin/station")
def add_station():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    name = (d.get("name") or "").strip()
    mode = (d.get("mode") or "Metro").strip()
    try:
        zone = int(d.get("zone", 1))
    except (ValueError, TypeError):
        return jsonify(ok=False, msg="Invalid zone"), 400
    if not name:
        return jsonify(ok=False, msg="Station name is required"), 400
    cur = db().execute("INSERT INTO stations(name,mode,zone) VALUES(?,?,?)", (name, mode, zone))
    db().commit()
    log_admin_action(admin, "STATION_CREATE", "station", cur.lastrowid, f"Added station '{name}' ({mode}, Zone {zone})")
    return jsonify(ok=True, msg=f"Station '{name}' successfully added to grid", id=cur.lastrowid)

@app.put("/api/admin/station/<int:sid>")
def update_station(sid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    name = (d.get("name") or "").strip()
    mode = (d.get("mode") or "Metro").strip()
    zone = int(d.get("zone", 1))
    if not name:
        return jsonify(ok=False, msg="Station name required"), 400
    db().execute("UPDATE stations SET name=?, mode=?, zone=? WHERE id=?", (name, mode, zone, sid))
    db().commit()
    log_admin_action(admin, "STATION_UPDATE", "station", sid, f"Updated station '{name}' ({mode}, Zone {zone})")
    return jsonify(ok=True, msg="Station updated successfully")

@app.delete("/api/admin/station/<int:sid>")
def delete_station(sid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    open_count = one("SELECT COUNT(*) as c FROM journeys WHERE (entry_station=? OR exit_station=?) AND status='open'", (sid, sid))["c"]
    if open_count > 0:
        return jsonify(ok=False, msg="Cannot delete station while active open journeys are registered there!"), 409
    st = one("SELECT name FROM stations WHERE id=?", (sid,))
    db().execute("DELETE FROM stations WHERE id=?", (sid,))
    db().commit()
    log_admin_action(admin, "STATION_DELETE", "station", sid, f"Deleted station '{st['name'] if st else sid}'")
    return jsonify(ok=True, msg="Station deleted from transit grid")

# 7. Website Content & Notices Management
@app.get("/api/admin/content")
def api_admin_get_content():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    return jsonify(ok=True, notices=rows("SELECT * FROM notices ORDER BY id DESC"))

@app.post("/api/admin/content")
def api_admin_add_content():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    d = request.json or {}
    title = (d.get("title") or "").strip()
    category = (d.get("category") or "Update").strip()
    content = (d.get("content") or "").strip()
    status_str = d.get("status") or "published"
    priority = d.get("priority") or "normal"
    
    if not title or not content:
        return jsonify(ok=False, msg="Title and content are required"), 400
        
    cur = db().execute("""
        INSERT INTO notices(title, category, content, status, priority, author, created_at, updated_at)
        VALUES(?,?,?,?,?,?,?,?)
    """, (title, category, content, status_str, priority, admin["name"], now(), now()))
    db().commit()
    
    log_admin_action(admin, "CONTENT_CREATE", "content", cur.lastrowid, f"Published notice: '{title}'")
    return jsonify(ok=True, msg=f"Announcement '{title}' published successfully", id=cur.lastrowid)

@app.put("/api/admin/content/<int:cid>")
def api_admin_update_content(cid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    d = request.json or {}
    title = (d.get("title") or "").strip()
    category = (d.get("category") or "Update").strip()
    content = (d.get("content") or "").strip()
    status_str = d.get("status") or "published"
    priority = d.get("priority") or "normal"
    
    if not title or not content:
        return jsonify(ok=False, msg="Title and content are required"), 400
        
    db().execute("""
        UPDATE notices SET title=?, category=?, content=?, status=?, priority=?, updated_at=?
        WHERE id=?
    """, (title, category, content, status_str, priority, now(), cid))
    db().commit()
    
    log_admin_action(admin, "CONTENT_UPDATE", "content", cid, f"Updated announcement #{cid}: '{title}'")
    return jsonify(ok=True, msg=f"Announcement #{cid} updated successfully")

@app.delete("/api/admin/content/<int:cid>")
def api_admin_delete_content(cid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    db().execute("DELETE FROM notices WHERE id=?", (cid,))
    db().commit()
    log_admin_action(admin, "CONTENT_DELETE", "content", cid, f"Deleted announcement #{cid}")
    return jsonify(ok=True, msg=f"Announcement #{cid} deleted")

# 8. Real-time Activities & Audit Logs
@app.get("/api/admin/activities")
def api_admin_get_activities():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    recent_journeys = rows("""
        SELECT j.id, 'journey' as type, u.name as user_name, j.entry_time as timestamp,
               a.name || ' -> ' || COALESCE(b.name, 'In-Transit') as description,
               j.fare, j.status
        FROM journeys j
        JOIN users u ON u.id = j.user_id
        LEFT JOIN stations a ON a.id = j.entry_station
        LEFT JOIN stations b ON b.id = j.exit_station
        ORDER BY j.id DESC LIMIT 20
    """)
    recent_txns = rows("""
        SELECT t.id, 'transaction' as type, u.name as user_name, t.time as timestamp,
               t.note as description, t.amount as fare, t.kind as status
        FROM transactions t
        JOIN users u ON u.id = t.user_id
        ORDER BY t.id DESC LIMIT 20
    """)
    activities = sorted(recent_journeys + recent_txns, key=lambda x: x["timestamp"] or "", reverse=True)[:30]
    return jsonify(ok=True, activities=activities)

@app.get("/api/admin/audit-logs")
def api_admin_get_audit_logs():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    q_search = (request.args.get("q") or "").strip().lower()
    action_filter = request.args.get("action") or "all"
    limit = max(10, min(200, int(request.args.get("limit", 100))))
    
    clauses = ["1=1"]
    params = []
    
    if q_search:
        clauses.append("(LOWER(admin_name) LIKE ? OR LOWER(details) LIKE ? OR LOWER(target_type) LIKE ?)")
        like_p = f"%{q_search}%"
        params.extend([like_p, like_p, like_p])
        
    if action_filter != "all":
        clauses.append("action = ?")
        params.append(action_filter)
        
    where = " AND ".join(clauses)
    logs = rows(f"SELECT * FROM admin_logs WHERE {where} ORDER BY id DESC LIMIT ?", params + [limit])
    actions = [r["action"] for r in rows("SELECT DISTINCT action FROM admin_logs")]
    return jsonify(ok=True, logs=logs, actions=actions, count=len(logs))

# 9. Daily, Weekly, and Monthly Reports
@app.get("/api/admin/reports")
def api_admin_get_reports():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    
    period = request.args.get("period") or "daily"
    now_dt = datetime.now()
    if period == "daily":
        start_date = now_dt.strftime("%Y-%m-%d")
        period_title = f"Daily Operations Report ({start_date})"
    elif period == "weekly":
        start_date = (now_dt - timedelta(days=7)).strftime("%Y-%m-%d")
        period_title = f"Weekly Transit Performance Report ({start_date} to {now_dt.strftime('%Y-%m-%d')})"
    else:
        start_date = (now_dt - timedelta(days=30)).strftime("%Y-%m-%d")
        period_title = f"Monthly Executive Summary ({start_date} to {now_dt.strftime('%Y-%m-%d')})"
    
    journeys_in_period = rows("""
        SELECT COUNT(id) as total_trips,
               COALESCE(SUM(fare), 0) as fare_sum,
               COUNT(CASE WHEN status='closed' THEN 1 END) as completed_trips
        FROM journeys
        WHERE entry_time >= ?
    """, (start_date,))[0]
    
    attendance_in_period = rows("""
        SELECT COUNT(id) as total_checkins,
               COUNT(DISTINCT user_id) as unique_commuters,
               COUNT(DISTINCT date) as operational_days
        FROM attendance
        WHERE date >= ?
    """, (start_date,))[0]
    
    topups_in_period = one("SELECT COALESCE(SUM(amount), 0) as s FROM transactions WHERE kind='topup' AND time >= ?", (start_date,))["s"]
    passes_in_period = one("SELECT COALESCE(SUM(ABS(amount)), 0) as s FROM transactions WHERE kind='pass' AND time >= ?", (start_date,))["s"]
    new_users = one("SELECT COUNT(*) as c FROM users WHERE created >= ?", (start_date,))["c"]
    
    feedback_stats = rows("""
        SELECT COUNT(id) as total_feedback,
               COALESCE(AVG(rating), 5.0) as avg_rating,
               COUNT(CASE WHEN rating >= 4 THEN 1 END) as positive_feedback
        FROM feedback
        WHERE created_at >= ?
    """, (start_date,))[0]
    
    modal_breakdown = rows("""
        SELECT s.mode, COUNT(j.id) as journeys, COALESCE(SUM(j.fare), 0) as revenue
        FROM stations s
        JOIN journeys j ON j.entry_station = s.id
        WHERE j.entry_time >= ?
        GROUP BY s.mode
    """, (start_date,))
    
    return jsonify(
        ok=True,
        period=period,
        title=period_title,
        generated_at=now(),
        metrics={
            "total_trips": journeys_in_period["total_trips"],
            "completed_trips": journeys_in_period["completed_trips"],
            "fare_revenue": journeys_in_period["fare_sum"],
            "topup_revenue": topups_in_period,
            "pass_revenue": passes_in_period,
            "total_revenue": journeys_in_period["fare_sum"] + passes_in_period,
            "total_attendance": attendance_in_period["total_checkins"],
            "unique_commuters": attendance_in_period["unique_commuters"],
            "operational_days": attendance_in_period["operational_days"],
            "new_registrations": new_users,
            "total_feedback": feedback_stats["total_feedback"],
            "avg_satisfaction_rating": round(feedback_stats["avg_rating"], 2),
            "positive_feedback_count": feedback_stats["positive_feedback"]
        },
        modal_breakdown=modal_breakdown
    )

# 10. Legacy & Extended Admin Routes
@app.get("/api/admin/<what>")
def admin_legacy_list(what):
    if not admin_only():
        return jsonify(ok=False, msg="Wrong admin key"), 401
    if what == "users":
        q = """
            SELECT u.id, u.name, u.email, u.phone, u.kind, u.balance, u.pass_expiry, u.created,
                   COALESCE(u.status, 'active') as status,
                   COUNT(j.id) AS journey_count, COALESCE(SUM(j.fare), 0) AS total_fare_paid
            FROM users u
            LEFT JOIN journeys j ON j.user_id = u.id
            GROUP BY u.id
            ORDER BY u.id DESC
        """
    elif what == "journeys":
        q = """
            SELECT j.*, u.name, a.name AS entry_name, b.name AS exit_name, a.mode AS entry_mode, b.mode AS exit_mode
            FROM journeys j
            JOIN users u ON u.id = j.user_id
            LEFT JOIN stations a ON a.id = j.entry_station
            LEFT JOIN stations b ON b.id = j.exit_station
            ORDER BY j.id DESC LIMIT 150
        """
    elif what == "alerts":
        q = "SELECT a.*, u.name AS commuter_name FROM alerts a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.id DESC LIMIT 150"
    elif what == "stats":
        q = """
            SELECT (SELECT COUNT(*) FROM users) users,
                   (SELECT COUNT(*) FROM journeys) journeys,
                   (SELECT COALESCE(SUM(fare),0) FROM journeys) revenue,
                   (SELECT COUNT(*) FROM alerts WHERE resolved=0) alerts
        """
    else:
        return jsonify(ok=False, msg="Unknown dataset"), 404
    return jsonify(rows(q))

@app.post("/api/admin/journey/<int:jid>/force-close")
def admin_force_close_journey(jid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    j = one("SELECT * FROM journeys WHERE id=?", (jid,))
    if not j:
        return jsonify(ok=False, msg="Journey record not found"), 404
    if j["status"] == "closed":
        return jsonify(ok=False, msg="Journey is already closed"), 400
    
    exit_station_id = d.get("exit_station_id") or j["entry_station"]
    st = one("SELECT * FROM stations WHERE id=?", (exit_station_id,))
    fare = float(d.get("fare", 10.0))
    
    db().execute("UPDATE journeys SET exit_station=?, exit_time=?, fare=?, status='closed' WHERE id=?",
                 (exit_station_id, now(), fare, jid))
    db().execute("UPDATE attendance SET check_out_time=?, status='Completed' WHERE journey_id=?",
                 (now(), jid))
    if fare > 0:
        db().execute("UPDATE users SET balance=balance-? WHERE id=?", (fare, j["user_id"]))
        txn(j["user_id"], -fare, "fare_override", f"Admin settled journey #{jid}")
    db().commit()
    log_admin_action(admin, "JOURNEY_SETTLE", "journey", jid, f"Force-closed journey #{jid}")
    return jsonify(ok=True, msg=f"Journey #{jid} closed successfully (Settled at {st['name'] if st else 'Gate'})")

@app.delete("/api/admin/journey/<int:jid>")
def admin_delete_journey(jid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    db().execute("DELETE FROM attendance WHERE journey_id=?", (jid,))
    db().execute("DELETE FROM journeys WHERE id=?", (jid,))
    db().commit()
    log_admin_action(admin, "JOURNEY_DELETE", "journey", jid, f"Deleted journey record #{jid}")
    return jsonify(ok=True, msg=f"Journey record #{jid} deleted")

@app.post("/api/admin/alert/<int:aid>/resolve")
def admin_resolve_alert(aid):
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    db().execute("UPDATE alerts SET resolved=1 WHERE id=?", (aid,))
    db().commit()
    log_admin_action(admin, "ALERT_RESOLVE", "alert", aid, f"Resolved security alert #{aid}")
    return jsonify(ok=True, msg=f"Alert #{aid} marked as resolved")

@app.post("/api/admin/alerts/clear")
def admin_clear_alerts():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    db().execute("UPDATE alerts SET resolved=1")
    db().commit()
    log_admin_action(admin, "ALERT_CLEAR_ALL", "alert", None, "Acknowledged and resolved all active alerts")
    return jsonify(ok=True, msg="All alerts cleared and acknowledged")

@app.post("/api/admin/gate-override")
def admin_gate_override():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    mode = d.get("mode", "normal")
    if mode not in ("normal", "emergency_open", "lockdown"):
        return jsonify(ok=False, msg="Invalid override mode"), 400
    set_setting("gate_override", mode)
    alert(None, f"Central Transit Command activated Gate Override Mode: {mode.upper()}")
    log_admin_action(admin, "GATE_OVERRIDE", "gate", None, f"Changed gate override mode to {mode.upper()}")
    return jsonify(ok=True, mode=mode, msg=f"Gate override mode set to: {mode.upper()}")

@app.get("/api/admin/config")
def admin_get_config():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    cfg = {
        "base_fare": float(get_setting("base_fare", 10)),
        "per_zone_fare": float(get_setting("per_zone_fare", 5)),
        "min_balance": float(get_setting("min_balance", 10)),
        "anti_passback_sec": int(get_setting("anti_passback_sec", 20)),
        "gate_override": get_setting("gate_override", "normal"),
        "admin_key": get_setting("admin_key", DEFAULT_ADMIN_KEY)
    }
    return jsonify(ok=True, config=cfg)

@app.post("/api/admin/config")
def admin_set_config():
    admin = get_current_admin()
    if not admin:
        return jsonify(ok=False, msg="Unauthorized"), 401
    d = request.json or {}
    if "base_fare" in d:
        set_setting("base_fare", float(d["base_fare"]))
    if "per_zone_fare" in d:
        set_setting("per_zone_fare", float(d["per_zone_fare"]))
    if "min_balance" in d:
        set_setting("min_balance", float(d["min_balance"]))
    if "anti_passback_sec" in d:
        set_setting("anti_passback_sec", int(d["anti_passback_sec"]))
    if "admin_key" in d and len(str(d["admin_key"]).strip()) >= 4:
        set_setting("admin_key", str(d["admin_key"]).strip())
    log_admin_action(admin, "CONFIG_UPDATE", "config", None, "Updated fare rules and security settings")
    return jsonify(ok=True, msg="Transit configuration updated successfully")

# 11. Comprehensive CSV Export
@app.get("/api/admin/export/journeys")
def export_journeys():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Journey ID", "Commuter Name", "Entry Station", "Exit Station", "Entry Time", "Exit Time", "Fare (INR)", "Status"])
    
    journeys_data = rows("""
        SELECT j.id, u.name, a.name AS entry_name, b.name AS exit_name, j.entry_time, j.exit_time, j.fare, j.status
        FROM journeys j
        JOIN users u ON u.id = j.user_id
        LEFT JOIN stations a ON a.id = j.entry_station
        LEFT JOIN stations b ON b.id = j.exit_station
        ORDER BY j.id DESC
    """)
    for r in journeys_data:
        writer.writerow([r["id"], r["name"], r["entry_name"] or "N/A", r["exit_name"] or "N/A",
                         r["entry_time"], r["exit_time"] or "IN_TRANSIT", r["fare"] or 0.0, r["status"]])
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=biotransit_journeys_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@app.get("/api/admin/export/users")
def export_users():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["User ID", "Full Name", "Email", "Phone", "Category", "Wallet Balance (INR)", "Tourist Pass Expiry", "Status", "Enrolled Date"])
    
    users_data = rows("SELECT id, name, email, phone, kind, balance, pass_expiry, COALESCE(status, 'active') as status, created FROM users ORDER BY id DESC")
    for r in users_data:
        writer.writerow([r["id"], r["name"], r["email"], r["phone"] or "N/A", r["kind"], r["balance"], r["pass_expiry"] or "None", r["status"], r["created"]])
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=biotransit_commuters_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@app.get("/api/admin/export/attendance")
def export_attendance_csv():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Attendance ID", "Commuter Name", "Email", "Phone", "Station Name", "Mode", "Date", "Check In Time", "Check Out Time", "Status", "Method", "Notes"])
    
    data = rows("""
        SELECT a.id, u.name, u.email, u.phone, s.name as station_name, s.mode as station_mode,
               a.date, a.check_in_time, a.check_out_time, a.status, a.verification_method, a.notes
        FROM attendance a
        JOIN users u ON u.id = a.user_id
        LEFT JOIN stations s ON s.id = a.station_id
        ORDER BY a.date DESC, a.id DESC
    """)
    for r in data:
        writer.writerow([r["id"], r["name"], r["email"], r["phone"] or "N/A", r["station_name"] or "N/A",
                         r["station_mode"] or "N/A", r["date"], r["check_in_time"] or "N/A",
                         r["check_out_time"] or "IN_TRANSIT", r["status"], r["verification_method"], r["notes"] or ""])
    
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=attendance_records_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@app.get("/api/admin/export/feedback")
def export_feedback_csv():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Feedback ID", "Commuter Name", "Email", "Category", "Rating (1-5)", "Subject", "Message", "Status", "Admin Reply", "Submitted At", "Replied At"])
    
    data = rows("SELECT * FROM feedback ORDER BY id DESC")
    for r in data:
        writer.writerow([r["id"], r["name"], r["email"] or "N/A", r["category"], r["rating"],
                         r["subject"] or "", r["message"], r["status"], r["reply"] or "N/A",
                         r["created_at"], r["replied_at"] or "N/A"])
        
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=feedback_export_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

@app.get("/api/admin/export/audit-logs")
def export_audit_logs_csv():
    if not admin_only():
        return jsonify(ok=False, msg="Unauthorized"), 401
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["Log ID", "Admin ID", "Admin Name", "Action", "Target Type", "Target ID", "Details", "IP Address", "Timestamp"])
    
    data = rows("SELECT * FROM admin_logs ORDER BY id DESC")
    for r in data:
        writer.writerow([r["id"], r["admin_id"] or "System", r["admin_name"], r["action"],
                         r["target_type"] or "", r["target_id"] or "", r["details"],
                         r["ip_address"] or "127.0.0.1", r["created_at"]])
        
    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": f"attachment;filename=admin_audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"}
    )

if __name__ == "__main__":
    init_db()
    app.run(debug=True, port=5000)
