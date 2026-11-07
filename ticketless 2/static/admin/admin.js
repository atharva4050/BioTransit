/**
 * ==============================================================================
 * BioTransit AI - Enterprise Admin Control Panel Engine
 * Centralized Dashboard, Commuters, Attendance, Feedback, Stations & Analytics
 * ==============================================================================
 */

// Application State
const state = {
  admin: null,
  token: null,
  currentTab: 'dashboard',
  userFilter: { q: '', status: 'all', kind: 'all', page: 1, limit: 25 },
  attendanceFilter: { q: '', date: '', status: 'all', station_id: 'all' },
  feedbackFilter: { q: '', category: 'all', rating: 'all', status: 'all' },
  auditFilter: { q: '', action: 'all' },
  reportPeriod: 'daily',
  stations: [],
  charts: {
    attendance: null,
    mode: null
  }
};

// ==============================================================================
// 1. Initialization & Session Authentication
// ==============================================================================

document.addEventListener("DOMContentLoaded", async () => {
  // Theme check
  const savedTheme = localStorage.getItem("biotransit_admin_theme") || "dark";
  document.documentElement.setAttribute("data-theme", savedTheme);
  updateThemeIcon(savedTheme);

  // Auth verification
  state.token = localStorage.getItem("biotransit_admin_token");
  if (!state.token) {
    window.location.replace("/admin/login");
    return;
  }

  try {
    const res = await apiRequest("/api/admin/me");
    if (!res.ok || !res.admin) {
      throw new Error("Session expired or unauthorized");
    }
    state.admin = res.admin;
    renderAdminProfileHeader();
    await loadInitialStations();
    await loadDashboardTelemetry();
  } catch (err) {
    console.error("Auth check failed:", err);
    localStorage.removeItem("biotransit_admin_token");
    window.location.replace("/admin/login");
  }
});

function renderAdminProfileHeader() {
  if (!state.admin) return;
  const name = state.admin.name || "Administrator";
  const initials = name.split(" ").map(w => w[0]).join("").slice(0, 2).toUpperCase() || "AD";
  
  document.getElementById("sidebar-admin-name").textContent = name;
  document.getElementById("sidebar-admin-avatar").textContent = initials;
  document.getElementById("sidebar-admin-role").textContent = state.admin.role || "Super Admin";
  document.getElementById("header-admin-name").textContent = name.split(" ")[0];
  document.getElementById("header-admin-avatar").textContent = initials;
}

async function performAdminLogout() {
  try {
    await apiRequest("/api/admin/logout", "POST");
  } catch (e) {
    // Ignore network error on logout
  }
  localStorage.removeItem("biotransit_admin_token");
  localStorage.removeItem("biotransit_admin_user");
  window.location.replace("/admin/login");
}

// API Request Helper with Bearer Token Injection
async function apiRequest(endpoint, method = "GET", data = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${state.token}`
    }
  };
  if (data && method !== "GET") {
    options.body = JSON.stringify(data);
  }
  const response = await fetch(endpoint, options);
  if (response.status === 401) {
    localStorage.removeItem("biotransit_admin_token");
    window.location.replace("/admin/login");
    throw new Error("Unauthorized");
  }
  return await response.json();
}

async function loadInitialStations() {
  try {
    const res = await apiRequest("/api/stations");
    state.stations = res || [];
    populateStationDropdowns();
  } catch (e) {
    console.warn("Failed loading stations:", e);
  }
}

function populateStationDropdowns() {
  const attSelect = document.getElementById("att-station-filter");
  if (!attSelect) return;
  
  attSelect.innerHTML = `<option value="all">All Stations (${state.stations.length})</option>`;
  state.stations.forEach(st => {
    attSelect.innerHTML += `<option value="${st.id}">${escapeHtml(st.name)} (${st.mode} - Zone ${st.zone})</option>`;
  });
}

// ==============================================================================
// 2. Navigation & View Routing
// ==============================================================================

function switchNavTab(tabName) {
  state.currentTab = tabName;

  // Update sidebar active link
  document.querySelectorAll(".sidebar-nav .nav-item").forEach(item => {
    item.classList.toggle("active", item.getAttribute("data-tab") === tabName);
  });

  // Update tab panes
  document.querySelectorAll(".tab-pane").forEach(pane => {
    pane.classList.remove("active");
  });
  const targetPane = document.getElementById(`pane-${tabName}`);
  if (targetPane) {
    targetPane.classList.add("active");
  }

  // Update breadcrumb
  const breadcrumb = document.getElementById("breadcrumb-current");
  if (breadcrumb) {
    const titles = {
      dashboard: "Executive Dashboard",
      users: "Commuters & Users",
      attendance: "Attendance Hub",
      feedback: "Feedback Center",
      data: "Website & Stations CMS",
      audit: "Audit & Activity Log",
      reports: "Intelligence Reports",
      settings: "Fare Rules & Settings"
    };
    breadcrumb.textContent = titles[tabName] || "Dashboard";
  }

  // Close mobile sidebar if open
  closeMobileSidebar();

  // Load relevant data for selected tab
  if (tabName === "dashboard") loadDashboardTelemetry();
  else if (tabName === "users") loadUsersList();
  else if (tabName === "attendance") { loadAttendanceStats(); loadAttendanceRecords(); }
  else if (tabName === "feedback") loadFeedbackRecords();
  else if (tabName === "data") { loadAdminStationsList(); loadAdminNoticesList(); loadLiveActivities(); }
  else if (tabName === "audit") loadAuditLogs();
  else if (tabName === "reports") loadReportPeriod(state.reportPeriod);
  else if (tabName === "settings") loadFareSettings();
}

function toggleSidebar() {
  document.getElementById("admin-sidebar").classList.toggle("open");
}

function closeMobileSidebar() {
  document.getElementById("admin-sidebar").classList.remove("open");
}

function toggleAdminTheme() {
  const current = document.documentElement.getAttribute("data-theme") || "dark";
  const newTheme = current === "dark" ? "light" : "dark";
  document.documentElement.setAttribute("data-theme", newTheme);
  localStorage.setItem("biotransit_admin_theme", newTheme);
  updateThemeIcon(newTheme);
  
  // Re-render charts with updated theme colors if on dashboard
  if (state.currentTab === "dashboard") {
    loadDashboardTelemetry();
  }
}

function updateThemeIcon(theme) {
  const icon = document.getElementById("theme-icon");
  if (icon) icon.textContent = theme === "dark" ? "🌙" : "☀️";
}

// ==============================================================================
// 3. Tab 1: Dashboard & Telemetry
// ==============================================================================

async function loadDashboardTelemetry() {
  try {
    const data = await apiRequest("/api/admin/dashboard/stats");
    if (!data.ok) return;

    const s = data.stats || {};

    // 1. KPI Cards
    document.getElementById("kpi-total-users").textContent = (s.total_users || 0).toLocaleString();
    document.getElementById("kpi-active-users").textContent = (s.active_users || 0).toLocaleString();
    document.getElementById("kpi-inactive-users").textContent = (s.inactive_users || 0).toLocaleString();
    document.getElementById("kpi-total-listings").textContent = (s.total_listings || 0).toLocaleString();
    document.getElementById("kpi-listings-sub").textContent = `${s.stations_count || 0} Stations · ${s.notices_count || 0} Notices`;
    document.getElementById("kpi-total-feedback").textContent = (s.total_feedback || 0).toLocaleString();
    document.getElementById("kpi-feedback-sub").textContent = `${s.pending_feedback || 0} Pending Reply`;
    document.getElementById("kpi-total-attendance").textContent = (s.total_attendance || 0).toLocaleString();
    document.getElementById("kpi-attendance-sub").textContent = `${s.today_attendance || 0} Logged Today`;

    // Secondary KPI bar
    document.getElementById("kpi-total-revenue").textContent = `₹ ${(s.total_revenue || 0).toFixed(2)}`;
    document.getElementById("kpi-open-journeys").textContent = `${s.open_journeys || 0} Commuters`;
    document.getElementById("kpi-active-alerts").textContent = `${s.active_alerts || 0} Active`;
    document.getElementById("kpi-total-journeys").textContent = `${s.total_journeys || 0} Trips`;

    // Sidebar & Header Badges
    document.getElementById("nav-users-count").textContent = s.total_users || 0;
    document.getElementById("nav-attendance-count").textContent = s.total_attendance || 0;
    document.getElementById("nav-feedback-pending").textContent = s.pending_feedback || 0;
    document.getElementById("header-alerts-badge").textContent = s.active_alerts || 0;

    // Gate override active mode
    const gateRes = await apiRequest("/api/admin/config");
    if (gateRes.ok && gateRes.config) {
      updateGateOverrideButtons(gateRes.config.gate_override || "normal");
    }

    // 2. Interactive Charts
    renderCharts(data.charts || {});

    // 3. Recent Users Table
    renderRecentUsersTable(data.recent_users || []);

    // 4. Busiest Hubs Table
    renderBusiestHubsTable(data.charts?.busiest_stations || []);

  } catch (err) {
    console.error("Failed loading dashboard telemetry:", err);
    showToast("Error retrieving dashboard telemetry", "error");
  }
}

function updateGateOverrideButtons(mode) {
  document.getElementById("btn-gate-normal")?.classList.toggle("active", mode === "normal");
  document.getElementById("btn-gate-emergency")?.classList.toggle("active", mode === "emergency_open");
  document.getElementById("btn-gate-lockdown")?.classList.toggle("active", mode === "lockdown");
}

async function applyGateOverrideMode(mode) {
  try {
    const res = await apiRequest("/api/admin/gate-override", "POST", { mode });
    if (res.ok) {
      updateGateOverrideButtons(mode);
      showToast(`Gate protocol activated: ${mode.toUpperCase()}`, "success");
    } else {
      showToast(res.msg || "Failed to set gate override", "error");
    }
  } catch (e) {
    showToast("Gate override error", "error");
  }
}

function quickEmergencyEvacuate() {
  if (confirm("🚨 EMERGENCY PROTOCOL: Unlock all turnstile gates across the entire transit network immediately?")) {
    applyGateOverrideMode("emergency_open");
  }
}

function renderCharts(chartData) {
  const isDark = (document.documentElement.getAttribute("data-theme") || "dark") === "dark";
  const gridColor = isDark ? "rgba(255, 255, 255, 0.06)" : "rgba(0, 0, 0, 0.06)";
  const textColor = isDark ? "#94a3b8" : "#64748b";

  // 1. Attendance & Ridership Trend Line Chart
  const trendCtx = document.getElementById("chart-attendance-trend");
  if (trendCtx) {
    if (state.charts.attendance) state.charts.attendance.destroy();

    const trend = chartData.attendance_trend || [];
    const labels = trend.map(t => t.date.slice(5)); // MM-DD
    const totalData = trend.map(t => t.count);
    const completedData = trend.map(t => t.completed);

    state.charts.attendance = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: labels.length ? labels : ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Today"],
        datasets: [
          {
            label: "Total Gate Check-ins",
            data: totalData.length ? totalData : [4, 6, 5, 8, 7, 9, 10],
            borderColor: "#06b6d4",
            backgroundColor: "rgba(6, 182, 212, 0.15)",
            tension: 0.35,
            fill: true,
            pointBackgroundColor: "#22d3ee",
            pointRadius: 4
          },
          {
            label: "Completed Journeys",
            data: completedData.length ? completedData : [3, 5, 4, 7, 6, 8, 8],
            borderColor: "#10b981",
            backgroundColor: "transparent",
            borderDash: [5, 5],
            tension: 0.35,
            pointBackgroundColor: "#34d399",
            pointRadius: 3
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { labels: { color: textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } } }
        },
        scales: {
          x: { grid: { color: gridColor }, ticks: { color: textColor } },
          y: { grid: { color: gridColor }, ticks: { color: textColor, stepSize: 2 }, beginAtZero: true }
        }
      }
    });
  }

  // 2. Multimodal Split Doughnut Chart
  const modeCtx = document.getElementById("chart-mode-distribution");
  if (modeCtx) {
    if (state.charts.mode) state.charts.mode.destroy();

    const modes = chartData.mode_distribution || [];
    const labels = modes.map(m => m.mode || "Metro");
    const counts = modes.map(m => m.count || 0);

    state.charts.mode = new Chart(modeCtx, {
      type: "doughnut",
      data: {
        labels: labels.length ? labels : ["Metro", "Bus Rapid", "Suburban Train"],
        datasets: [{
          data: counts.length ? counts : [12, 6, 4],
          backgroundColor: ["#3b82f6", "#f59e0b", "#10b981", "#8b5cf6"],
          borderWidth: 2,
          borderColor: isDark ? "#0d1424" : "#ffffff"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "right", labels: { color: textColor, font: { family: "'Plus Jakarta Sans', sans-serif" } } }
        },
        cutout: "68%"
      }
    });
  }
}

function renderRecentUsersTable(users) {
  const tbody = document.querySelector("#table-recent-users tbody");
  if (!tbody) return;
  if (!users.length) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No commuters registered yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="user-meta-cell">
          <div class="commuter-avatar">${escapeHtml(u.name.slice(0, 2).toUpperCase())}</div>
          <div>
            <div class="commuter-name">${escapeHtml(u.name)}</div>
            <div class="commuter-sub">${escapeHtml(u.email)}</div>
          </div>
        </div>
      </td>
      <td><span class="category-tag ${u.kind === 'tourist' ? 'tourist' : 'resident'}">${escapeHtml(u.kind || 'resident')}</span></td>
      <td><strong>₹ ${(u.balance || 0).toFixed(2)}</strong></td>
      <td><span class="status-badge ${u.status === 'inactive' ? 'inactive' : 'active'}">${u.status || 'active'}</span></td>
      <td>
        <div class="table-actions">
          <button class="btn-table-action" onclick="openUserProfileModal(${u.id})" title="View Details">👁️</button>
          <button class="btn-table-action" onclick="openEditUserModal(${u.id})" title="Edit Details">✏️</button>
        </div>
      </td>
    </tr>
  `).join("");
}

function renderBusiestHubsTable(hubs) {
  const tbody = document.querySelector("#table-busiest-hubs tbody");
  if (!tbody) return;
  if (!hubs.length) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No traffic records yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = hubs.map(h => `
    <tr>
      <td><strong>${escapeHtml(h.name)}</strong></td>
      <td><span class="category-tag ${h.mode?.toLowerCase() || 'metro'}">${escapeHtml(h.mode || 'Metro')}</span></td>
      <td><span style="font-family:var(--font-mono);">Zone ${h.zone || 1}</span></td>
      <td><strong>${h.traffic || 0} passengers</strong></td>
    </tr>
  `).join("");
}

// ==============================================================================
// 4. Tab 2: User Management
// ==============================================================================

let userSearchTimeout = null;
function handleUserSearchInput() {
  clearTimeout(userSearchTimeout);
  userSearchTimeout = setTimeout(() => {
    state.userFilter.q = document.getElementById("user-search-input").value.trim();
    loadUsersList();
  }, 250);
}

function filterUserStatus(status, btn) {
  state.userFilter.status = status;
  btn.parentElement.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  loadUsersList();
}

function filterUserKind(kind, btn) {
  state.userFilter.kind = kind;
  btn.parentElement.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
  btn.classList.add("active");
  loadUsersList();
}

async function loadUsersList() {
  try {
    const params = new URLSearchParams({
      q: state.userFilter.q,
      status: state.userFilter.status,
      kind: state.userFilter.kind,
      page: state.userFilter.page,
      limit: state.userFilter.limit
    });

    const res = await apiRequest(`/api/admin/users?${params.toString()}`);
    const tbody = document.querySelector("#table-users-list tbody");
    if (!tbody) return;

    if (!res.ok || !res.users || !res.users.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-dim); padding:2rem;">No commuters found matching filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = res.users.map(u => {
      const isInactive = u.status === "inactive";
      const passBadge = u.has_pass 
        ? `<span class="status-badge present">Pass Active (${u.pass_expiry?.slice(0, 10)})</span>`
        : `<span style="color:var(--text-dim); font-size:0.75rem;">Pay-as-you-go</span>`;

      return `
        <tr>
          <td>
            <div class="user-meta-cell">
              <div class="commuter-avatar">${escapeHtml(u.name.slice(0, 2).toUpperCase())}</div>
              <div>
                <div class="commuter-name">${escapeHtml(u.name)}</div>
                <div class="commuter-sub">ID: #${u.id}</div>
              </div>
            </div>
          </td>
          <td>
            <div style="font-size:0.84rem;">${escapeHtml(u.email)}</div>
            <div class="commuter-sub">${escapeHtml(u.phone || 'No phone')}</div>
          </td>
          <td>
            <span class="category-tag ${u.kind === 'tourist' ? 'tourist' : 'resident'}">
              ${escapeHtml(u.kind || 'resident')}
            </span>
          </td>
          <td>
            <strong style="color:${u.balance < 10 ? 'var(--rose-glow)' : 'var(--text-main)'};">
              ₹ ${(u.balance || 0).toFixed(2)}
            </strong>
          </td>
          <td>${passBadge}</td>
          <td>
            <span class="status-badge ${isInactive ? 'inactive' : 'active'}">
              ${isInactive ? 'Inactive' : 'Active'}
            </span>
          </td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">
            ${u.created ? u.created.replace("T", " ") : "N/A"}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn-table-action" onclick="openUserProfileModal(${u.id})" title="View Profile">
                <span>👁️</span> View
              </button>
              <button class="btn-table-action" onclick="openEditUserModal(${u.id})" title="Edit Details">
                <span>✏️</span> Edit
              </button>
              <button class="btn-table-action ${isInactive ? 'emerald' : ''}" onclick="toggleUserStatus(${u.id}, '${isInactive ? 'active' : 'inactive'}')" title="${isInactive ? 'Activate Account' : 'Deactivate Account'}">
                <span>${isInactive ? '🟢' : '⛔'}</span> ${isInactive ? 'Activate' : 'Deactivate'}
              </button>
              <button class="btn-table-action danger" onclick="openDeleteUserModal(${u.id}, '${escapeHtml(u.name)}')" title="Delete Commuter">
                <span>🗑️</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Error loading users:", err);
    showToast("Error retrieving commuters directory", "error");
  }
}

async function toggleUserStatus(uid, newStatus) {
  try {
    const res = await apiRequest(`/api/admin/user/${uid}/status`, "POST", { status: newStatus });
    if (res.ok) {
      showToast(`User status updated to ${newStatus.toUpperCase()}`, "success");
      loadUsersList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to toggle status", "error");
    }
  } catch (e) {
    showToast("Status change error", "error");
  }
}

// ==============================================================================
// 5. User Modals: View Profile, Edit, Delete
// ==============================================================================

async function openUserProfileModal(uid) {
  try {
    const res = await apiRequest(`/api/admin/user/${uid}`);
    if (!res.ok || !res.user) {
      showToast("Could not load user profile", "error");
      return;
    }
    const u = res.user;
    const stats = res.stats || {};
    const attendance = res.attendance || [];
    const journeys = res.journeys || [];
    const txns = res.transactions || [];
    const feedback = res.feedback || [];

    const modalHost = document.getElementById("modal-host");
    modalHost.innerHTML = `
      <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
        <div class="modal-card wide">
          <div class="modal-header">
            <h3 class="modal-title"><span>👤</span> Commuter Profile &amp; Biometric Records</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>

          <div class="modal-body">
            <!-- Hero User Info -->
            <div class="profile-hero">
              <div class="profile-hero-avatar">${escapeHtml(u.name.slice(0, 2).toUpperCase())}</div>
              <div style="flex:1;">
                <div style="display:flex; align-items:center; gap:0.6rem; flex-wrap:wrap;">
                  <h3 style="font-family:var(--font-display); font-size:1.35rem; font-weight:800; color:var(--text-main);">
                    ${escapeHtml(u.name)}
                  </h3>
                  <span class="status-badge ${u.status === 'inactive' ? 'inactive' : 'active'}">${u.status}</span>
                  <span class="category-tag ${u.kind === 'tourist' ? 'tourist' : 'resident'}">${escapeHtml(u.kind)}</span>
                </div>
                <div style="color:var(--text-muted); font-size:0.84rem; margin-top:0.25rem;">
                  📧 ${escapeHtml(u.email)} · 📞 ${escapeHtml(u.phone || 'No phone recorded')} · ID: #${u.id}
                </div>
                <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-top:0.25rem;">
                  Enrolled: ${u.created ? u.created.replace("T", " ") : "N/A"}
                </div>
              </div>
            </div>

            <!-- Profile Stats Strip -->
            <div class="profile-stats-grid">
              <div class="profile-stat-box">
                <small>Wallet Balance</small>
                <strong style="color:var(--emerald-glow);">₹ ${(u.balance || 0).toFixed(2)}</strong>
              </div>
              <div class="profile-stat-box">
                <small>Attendance %</small>
                <strong style="color:var(--cyan-bright);">${stats.attendance_percentage || 0}%</strong>
              </div>
              <div class="profile-stat-box">
                <small>Days Present</small>
                <strong>${stats.days_present || 0} / ${stats.total_working_days || 0}</strong>
              </div>
              <div class="profile-stat-box">
                <small>Total Journeys</small>
                <strong>${stats.total_journeys || 0}</strong>
              </div>
            </div>

            <!-- Attendance Progress Bar -->
            <div style="background:var(--bg-input); padding:0.85rem 1.15rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle); margin-bottom:1.5rem;">
              <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem;">
                <span style="font-family:var(--font-mono); color:var(--text-muted);">Attendance Compliance Rate</span>
                <strong>${stats.attendance_percentage || 0}% (${stats.days_present} days logged)</strong>
              </div>
              <div class="att-bar-track">
                <div class="att-bar-fill" style="width:${Math.min(100, stats.attendance_percentage || 0)}%;"></div>
              </div>
            </div>

            <!-- Sub Section 1: Recent Gate Attendance Check-ins -->
            <h4 style="font-family:var(--font-display); font-size:0.98rem; margin-bottom:0.6rem; color:var(--text-main);">
              🕒 Recent Gate Attendance Records (${attendance.length})
            </h4>
            <div class="table-responsive" style="margin-bottom:1.25rem; max-height:180px;">
              <table class="cyber-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Station</th>
                    <th>Check In</th>
                    <th>Check Out</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${attendance.length ? attendance.map(a => `
                    <tr>
                      <td style="font-family:var(--font-mono); font-size:0.8rem;">${a.date}</td>
                      <td>${escapeHtml(a.station_name || 'Turnstile')}</td>
                      <td style="font-family:var(--font-mono); font-size:0.75rem;">${a.check_in_time?.slice(11) || 'N/A'}</td>
                      <td style="font-family:var(--font-mono); font-size:0.75rem;">${a.check_out_time?.slice(11) || 'IN_TRANSIT'}</td>
                      <td><span class="status-badge ${a.status === 'Completed' ? 'completed' : 'in-transit'}">${a.status}</span></td>
                    </tr>
                  `).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:1rem;">No attendance records found.</td></tr>`}
                </tbody>
              </table>
            </div>

            <!-- Sub Section 2: Transit Journeys -->
            <h4 style="font-family:var(--font-display); font-size:0.98rem; margin-bottom:0.6rem; color:var(--text-main);">
              🚆 Transit Journeys Ledger (${journeys.length})
            </h4>
            <div class="table-responsive" style="margin-bottom:1.25rem; max-height:180px;">
              <table class="cyber-table">
                <thead>
                  <tr>
                    <th>Trip ID</th>
                    <th>Route</th>
                    <th>Time</th>
                    <th>Fare</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  ${journeys.length ? journeys.map(j => `
                    <tr>
                      <td style="font-family:var(--font-mono);">#${j.id}</td>
                      <td>${escapeHtml(j.entry_name || 'Entry')} ➔ ${escapeHtml(j.exit_name || 'In-Transit')}</td>
                      <td style="font-family:var(--font-mono); font-size:0.75rem;">${j.entry_time?.slice(0, 16).replace("T", " ") || 'N/A'}</td>
                      <td><strong>₹ ${(j.fare || 0).toFixed(2)}</strong></td>
                      <td><span class="status-badge ${j.status === 'closed' ? 'completed' : 'in-transit'}">${j.status}</span></td>
                    </tr>
                  `).join("") : `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:1rem;">No journeys recorded.</td></tr>`}
                </tbody>
              </table>
            </div>

            <!-- Sub Section 3: Feedback Submissions -->
            ${feedback.length ? `
              <h4 style="font-family:var(--font-display); font-size:0.98rem; margin-bottom:0.6rem; color:var(--text-main);">
                💬 Submitted Feedback &amp; Reviews (${feedback.length})
              </h4>
              <div style="display:flex; flex-direction:column; gap:0.5rem; margin-bottom:1rem;">
                ${feedback.map(fb => `
                  <div style="background:var(--bg-input); padding:0.75rem 1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle);">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                      <strong>${escapeHtml(fb.subject || 'Feedback')}</strong>
                      <span style="color:var(--amber-glow); font-size:0.8rem;">${'★'.repeat(fb.rating || 5)}</span>
                    </div>
                    <p style="font-size:0.82rem; color:var(--text-muted); margin:0.3rem 0;">${escapeHtml(fb.message)}</p>
                    ${fb.reply ? `<div style="font-size:0.78rem; color:var(--cyan-bright); background:rgba(6,182,212,0.1); padding:0.35rem 0.6rem; border-radius:4px;">Admin Reply: ${escapeHtml(fb.reply)}</div>` : ''}
                  </div>
                `).join("")}
              </div>
            ` : ''}

          </div>

          <div class="modal-footer">
            <button class="btn-cyber secondary" onclick="openEditUserModal(${u.id})">✏️ Edit Commuter</button>
            <button class="btn-cyber" onclick="closeModal()">Close Profile</button>
          </div>
        </div>
      </div>
    `;
  } catch (e) {
    console.error("Profile modal error:", e);
    showToast("Failed to load user profile modal", "error");
  }
}

async function openEditUserModal(uid) {
  try {
    const res = await apiRequest(`/api/admin/user/${uid}`);
    if (!res.ok || !res.user) return;
    const u = res.user;

    const modalHost = document.getElementById("modal-host");
    modalHost.innerHTML = `
      <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title"><span>✏️</span> Edit Commuter Profile</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>

          <form onsubmit="submitEditUser(event, ${u.id})">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="edit-name">Full Legal Name</label>
                <input id="edit-name" type="text" class="form-input" value="${escapeHtml(u.name)}" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-email">Email Address</label>
                <input id="edit-email" type="email" class="form-input" value="${escapeHtml(u.email)}" required>
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-phone">Mobile Phone Number</label>
                <input id="edit-phone" type="text" class="form-input" value="${escapeHtml(u.phone || '')}">
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-kind">Commuter Category</label>
                <select id="edit-kind" class="form-select">
                  <option value="resident" ${u.kind === 'resident' ? 'selected' : ''}>Resident</option>
                  <option value="tourist" ${u.kind === 'tourist' ? 'selected' : ''}>Tourist</option>
                  <option value="student" ${u.kind === 'student' ? 'selected' : ''}>Student</option>
                  <option value="senior" ${u.kind === 'senior' ? 'selected' : ''}>Senior Citizen</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-balance">Wallet Balance (₹)</label>
                <input id="edit-balance" type="number" step="0.5" class="form-input" value="${u.balance || 0}">
              </div>

              <div class="form-group">
                <label class="form-label" for="edit-status">Account Authorization Status</label>
                <select id="edit-status" class="form-select">
                  <option value="active" ${u.status === 'active' ? 'selected' : ''}>Active (Passage Allowed)</option>
                  <option value="inactive" ${u.status === 'inactive' ? 'selected' : ''}>Inactive (Turnstiles Blocked)</option>
                </select>
              </div>
            </div>

            <div class="modal-footer">
              <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
              <button type="submit" class="btn-cyber">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    `;
  } catch (e) {
    showToast("Error opening edit modal", "error");
  }
}

async function submitEditUser(e, uid) {
  e.preventDefault();
  const name = document.getElementById("edit-name").value.trim();
  const email = document.getElementById("edit-email").value.trim();
  const phone = document.getElementById("edit-phone").value.trim();
  const kind = document.getElementById("edit-kind").value;
  const balance = parseFloat(document.getElementById("edit-balance").value) || 0;
  const status = document.getElementById("edit-status").value;

  try {
    const res = await apiRequest(`/api/admin/user/${uid}`, "PUT", {
      name, email, phone, kind, balance, status
    });
    if (res.ok) {
      showToast("Commuter profile updated successfully", "success");
      closeModal();
      loadUsersList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to update commuter", "error");
    }
  } catch (err) {
    showToast("Update error", "error");
  }
}

function openDeleteUserModal(uid, name) {
  const modalHost = document.getElementById("modal-host");
  modalHost.innerHTML = `
    <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title" style="color:var(--rose-glow);"><span>⚠️</span> Confirm Commuter Deletion</h3>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">
          <p style="margin-bottom:1rem; font-size:0.92rem; color:var(--text-main);">
            Are you sure you want to permanently delete the profile and transit records for <strong>${escapeHtml(name)}</strong>?
          </p>
          <div style="background:rgba(244,63,94,0.1); border:1px solid rgba(244,63,94,0.3); border-radius:8px; padding:0.85rem; font-size:0.82rem; color:#fda4af;">
            ⚠️ This will cascade delete all biometric descriptors, wallet transaction logs, journeys, and attendance records associated with this commuter. This action cannot be undone.
          </div>
        </div>
        <div class="modal-footer">
          <button class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-cyber danger" onclick="confirmDeleteUser(${uid})">Permanently Delete</button>
        </div>
      </div>
    </div>
  `;
}

async function confirmDeleteUser(uid) {
  try {
    const res = await apiRequest(`/api/admin/user/${uid}`, "DELETE");
    if (res.ok) {
      showToast("Commuter profile deleted", "success");
      closeModal();
      loadUsersList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to delete user", "error");
    }
  } catch (e) {
    showToast("Delete error", "error");
  }
}

// Quick Add User Modal
function openAddUserModal() {
  const modalHost = document.getElementById("modal-host");
  modalHost.innerHTML = `
    <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title"><span>➕</span> Register New Transit Commuter</h3>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="submitNewUser(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="add-user-name">Full Name</label>
              <input id="add-user-name" type="text" class="form-input" placeholder="e.g. Rahul Patil" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="add-user-email">Email Address</label>
              <input id="add-user-email" type="email" class="form-input" placeholder="e.g. rahul@example.com" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="add-user-phone">Phone Number</label>
              <input id="add-user-phone" type="text" class="form-input" placeholder="e.g. 9876543210">
            </div>
            <div class="form-group">
              <label class="form-label" for="add-user-kind">Category</label>
              <select id="add-user-kind" class="form-select">
                <option value="resident">Resident</option>
                <option value="tourist">Tourist</option>
                <option value="student">Student</option>
              </select>
            </div>
            <div style="font-size:0.8rem; color:var(--text-dim); background:var(--bg-input); padding:0.75rem; border-radius:6px;">
              💡 <em>Note:</em> Biometric 128-D facial vector will be linked on first gate camera scan or via the Commuter Registration terminal. Initial ₹50 welcome bonus applied automatically.
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-cyber">Create Account</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitNewUser(e) {
  e.preventDefault();
  const name = document.getElementById("add-user-name").value.trim();
  const email = document.getElementById("add-user-email").value.trim();
  const phone = document.getElementById("add-user-phone").value.trim();
  const kind = document.getElementById("add-user-kind").value;

  // Mock standard descriptor vector for admin-created profiles until they calibrate in gate
  const mockDescriptor = Array(128).fill(0).map(() => (Math.random() - 0.5) * 0.1);

  try {
    const res = await fetch("/api/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, phone, kind, descriptor: mockDescriptor })
    });
    const data = await res.json();
    if (data.ok) {
      showToast(`Commuter ${name} registered successfully!`, "success");
      closeModal();
      loadUsersList();
      loadDashboardTelemetry();
    } else {
      showToast(data.msg || "Registration failed", "error");
    }
  } catch (err) {
    showToast("Server error during registration", "error");
  }
}

// ==============================================================================
// 6. Tab 3: Attendance Management
// ==============================================================================

async function loadAttendanceStats() {
  try {
    const res = await apiRequest("/api/admin/attendance/stats");
    if (!res.ok) return;

    document.getElementById("att-stats-total").textContent = (res.total_checkins || 0).toLocaleString();
    document.getElementById("att-stats-days").textContent = `${res.total_dates || 0} Days`;
    document.getElementById("att-stats-rate").textContent = `${res.overall_rate || 0}%`;

    // Render User Compliance Table
    const tbody = document.querySelector("#table-user-attendance-stats tbody");
    if (!tbody) return;

    const users = res.users || [];
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(u => `
      <tr>
        <td>
          <div class="user-meta-cell">
            <div class="commuter-avatar">${escapeHtml(u.name.slice(0, 2).toUpperCase())}</div>
            <div>
              <div class="commuter-name">${escapeHtml(u.name)}</div>
              <div class="commuter-sub">${escapeHtml(u.email)}</div>
            </div>
          </div>
        </td>
        <td><span class="category-tag ${u.kind === 'tourist' ? 'tourist' : 'resident'}">${escapeHtml(u.kind || 'resident')}</span></td>
        <td><strong>${u.days_present || 0} / ${u.total_dates || 0} days</strong></td>
        <td>${u.total_checkins || 0} check-ins</td>
        <td>
          <div class="att-bar-container">
            <div class="att-bar-track">
              <div class="att-bar-fill" style="width:${Math.min(100, u.attendance_pct || 0)}%;"></div>
            </div>
            <span class="att-bar-pct">${u.attendance_pct || 0}%</span>
          </div>
        </td>
        <td><span class="status-badge ${u.status === 'inactive' ? 'inactive' : 'active'}">${u.status || 'active'}</span></td>
        <td>
          <button class="btn-table-action" onclick="openUserProfileModal(${u.id})">👁️ Full Log</button>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Attendance stats error:", err);
  }
}

async function loadAttendanceRecords() {
  try {
    const q = document.getElementById("att-search-input")?.value.trim() || "";
    const date = document.getElementById("att-date-filter")?.value || "";
    const status = document.getElementById("att-status-filter")?.value || "all";
    const station_id = document.getElementById("att-station-filter")?.value || "all";

    const params = new URLSearchParams({ q, date, status, station_id });
    const res = await apiRequest(`/api/admin/attendance?${params.toString()}`);
    const tbody = document.querySelector("#table-attendance-records tbody");
    if (!tbody) return;

    const list = res.attendance || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="10" style="text-align:center; color:var(--text-dim); padding:2rem;">No gate attendance records found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(a => `
      <tr>
        <td style="font-family:var(--font-mono);">#${a.id}</td>
        <td>
          <div class="commuter-name">${escapeHtml(a.user_name || 'Commuter')}</div>
          <div class="commuter-sub">${escapeHtml(a.user_email || '')}</div>
        </td>
        <td>
          <div><strong>${escapeHtml(a.station_name || 'Station')}</strong></div>
          <span class="category-tag ${a.station_mode?.toLowerCase() || 'metro'}">${escapeHtml(a.station_mode || 'Metro')}</span>
        </td>
        <td style="font-family:var(--font-mono); font-size:0.82rem;">${a.date}</td>
        <td style="font-family:var(--font-mono); font-size:0.78rem;">${a.check_in_time ? a.check_in_time.replace("T", " ").slice(11) : "N/A"}</td>
        <td style="font-family:var(--font-mono); font-size:0.78rem;">${a.check_out_time ? a.check_out_time.replace("T", " ").slice(11) : "<span style='color:var(--amber-glow);'>In-Transit</span>"}</td>
        <td><span class="status-badge ${a.status === 'Completed' ? 'completed' : 'in-transit'}">${a.status}</span></td>
        <td style="font-size:0.78rem; color:var(--text-muted);">${escapeHtml(a.verification_method || 'Biometric')}</td>
        <td style="font-size:0.78rem; color:var(--text-dim);">${escapeHtml(a.notes || '')}</td>
        <td>
          <button class="btn-table-action danger" onclick="deleteAttendanceRecord(${a.id})" title="Delete Record">🗑️</button>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Attendance records error:", err);
  }
}

function resetAttendanceFilters() {
  document.getElementById("att-search-input").value = "";
  document.getElementById("att-date-filter").value = "";
  document.getElementById("att-status-filter").value = "all";
  document.getElementById("att-station-filter").value = "all";
  loadAttendanceRecords();
}

async function deleteAttendanceRecord(aid) {
  if (!confirm(`Delete attendance record #${aid}?`)) return;
  try {
    const res = await apiRequest(`/api/admin/attendance/${aid}`, "DELETE");
    if (res.ok) {
      showToast("Attendance record removed", "success");
      loadAttendanceRecords();
      loadAttendanceStats();
      loadDashboardTelemetry();
    } else {
      showToast("Failed to delete attendance record", "error");
    }
  } catch (e) {
    showToast("Delete error", "error");
  }
}

async function openMarkAttendanceModal() {
  try {
    const usersRes = await apiRequest("/api/admin/users?limit=100");
    const users = usersRes.users || [];

    const todayStr = new Date().toISOString().split("T")[0];

    const modalHost = document.getElementById("modal-host");
    modalHost.innerHTML = `
      <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title"><span>🕒</span> Mark Manual Commuter Attendance</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>
          <form onsubmit="submitManualAttendance(event)">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="manual-att-user">Select Commuter</label>
                <select id="manual-att-user" class="form-select" required>
                  <option value="">-- Choose Commuter --</option>
                  ${users.map(u => `<option value="${u.id}">${escapeHtml(u.name)} (${escapeHtml(u.email)})</option>`).join("")}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="manual-att-station">Transit Station</label>
                <select id="manual-att-station" class="form-select" required>
                  ${state.stations.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${s.mode} - Zone ${s.zone})</option>`).join("")}
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="manual-att-date">Attendance Date</label>
                <input id="manual-att-date" type="date" class="form-input" value="${todayStr}" required>
              </div>

              <div class="two-col-grid" style="margin-bottom:0; gap:0.75rem;">
                <div class="form-group">
                  <label class="form-label" for="manual-att-checkin">Check-In Time</label>
                  <input id="manual-att-checkin" type="time" class="form-input" value="09:00" required>
                </div>
                <div class="form-group">
                  <label class="form-label" for="manual-att-checkout">Check-Out Time</label>
                  <input id="manual-att-checkout" type="time" class="form-input" value="18:00">
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="manual-att-status">Status</label>
                <select id="manual-att-status" class="form-select">
                  <option value="Completed">Completed</option>
                  <option value="Present">Present</option>
                  <option value="In-Transit">In-Transit</option>
                </select>
              </div>

              <div class="form-group">
                <label class="form-label" for="manual-att-notes">Administrative Notes</label>
                <input id="manual-att-notes" type="text" class="form-input" placeholder="e.g. Manual turnstile bypass authorized by supervisor">
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
              <button type="submit" class="btn-cyber">Save Attendance</button>
            </div>
          </form>
        </div>
      </div>
    `;
  } catch (e) {
    showToast("Error opening attendance modal", "error");
  }
}

async function submitManualAttendance(e) {
  e.preventDefault();
  const user_id = parseInt(document.getElementById("manual-att-user").value);
  const station_id = parseInt(document.getElementById("manual-att-station").value);
  const date = document.getElementById("manual-att-date").value;
  const check_in_raw = document.getElementById("manual-att-checkin").value;
  const check_out_raw = document.getElementById("manual-att-checkout").value;
  const status = document.getElementById("manual-att-status").value;
  const notes = document.getElementById("manual-att-notes").value.trim();

  const check_in_time = check_in_raw ? `${date}T${check_in_raw}:00` : null;
  const check_out_time = check_out_raw ? `${date}T${check_out_raw}:00` : null;

  try {
    const res = await apiRequest("/api/admin/attendance", "POST", {
      user_id, station_id, date, check_in_time, check_out_time, status, notes
    });
    if (res.ok) {
      showToast("Manual attendance logged successfully", "success");
      closeModal();
      loadAttendanceStats();
      loadAttendanceRecords();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to mark attendance", "error");
    }
  } catch (err) {
    showToast("Attendance logging error", "error");
  }
}

// ==============================================================================
// 7. Tab 4: Feedback Management
// ==============================================================================

async function loadFeedbackRecords() {
  try {
    const q = document.getElementById("feedback-search-input")?.value.trim() || "";
    const category = document.getElementById("feedback-cat-filter")?.value || "all";
    const rating = document.getElementById("feedback-rating-filter")?.value || "all";
    const status = document.getElementById("feedback-status-filter")?.value || "all";

    const params = new URLSearchParams({ q, category, rating, status });
    const res = await apiRequest(`/api/admin/feedback?${params.toString()}`);
    const tbody = document.querySelector("#table-feedback-list tbody");
    if (!tbody) return;

    const list = res.feedback || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; color:var(--text-dim); padding:2rem;">No commuter feedback matches the filter criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(fb => {
      const isReplied = fb.status === "replied";
      const stars = "★".repeat(fb.rating || 5) + "☆".repeat(5 - (fb.rating || 5));

      return `
        <tr>
          <td>
            <div class="commuter-name">${escapeHtml(fb.name)}</div>
            <div class="commuter-sub">${escapeHtml(fb.email || 'Anonymous')}</div>
          </td>
          <td><span style="color:var(--amber-glow); font-size:0.95rem; letter-spacing:1px;">${stars}</span></td>
          <td><span class="category-tag resident">${escapeHtml(fb.category || 'General')}</span></td>
          <td>
            <strong style="color:var(--text-main); display:block; margin-bottom:2px;">${escapeHtml(fb.subject || 'Commuter Review')}</strong>
            <p style="font-size:0.82rem; color:var(--text-muted); max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
              ${escapeHtml(fb.message)}
            </p>
          </td>
          <td><span class="status-badge ${isReplied ? 'replied' : 'new'}">${isReplied ? 'Replied' : 'New / Pending'}</span></td>
          <td style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-dim);">${fb.created_at ? fb.created_at.slice(0, 16).replace("T", " ") : "N/A"}</td>
          <td>
            ${fb.reply ? `<div style="font-size:0.8rem; color:var(--cyan-bright); background:rgba(6,182,212,0.1); padding:0.35rem 0.6rem; border-radius:6px; max-width:260px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(fb.reply)}</div>` : `<span style="color:var(--text-dim); font-size:0.75rem;">None</span>`}
          </td>
          <td>
            <div class="table-actions">
              <button class="btn-table-action" onclick="openReplyFeedbackModal(${fb.id})" title="Reply to Feedback">
                <span>💬</span> Reply
              </button>
              <button class="btn-table-action danger" onclick="deleteFeedbackRecord(${fb.id})" title="Delete Inappropriate Feedback">
                <span>🗑️</span>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Feedback loading error:", err);
  }
}

async function openReplyFeedbackModal(fid) {
  try {
    const res = await apiRequest(`/api/admin/feedback`);
    const fb = (res.feedback || []).find(f => f.id === fid);
    if (!fb) return;

    const modalHost = document.getElementById("modal-host");
    modalHost.innerHTML = `
      <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title"><span>💬</span> Reply to Passenger Feedback</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>
          <form onsubmit="submitFeedbackReply(event, ${fb.id})">
            <div class="modal-body">
              <div style="background:var(--bg-input); padding:1rem; border-radius:var(--radius-md); border:1px solid var(--border-subtle); margin-bottom:1.25rem;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.4rem;">
                  <strong>${escapeHtml(fb.name)} (${escapeHtml(fb.email || 'N/A')})</strong>
                  <span style="color:var(--amber-glow);">${'★'.repeat(fb.rating || 5)}</span>
                </div>
                <div style="font-size:0.88rem; font-weight:600; color:var(--text-main); margin-bottom:0.25rem;">
                  ${escapeHtml(fb.subject || '')}
                </div>
                <p style="font-size:0.84rem; color:var(--text-muted); line-height:1.4;">
                  "${escapeHtml(fb.message)}"
                </p>
                <div style="font-size:0.72rem; color:var(--text-dim); font-family:var(--font-mono); margin-top:0.5rem;">
                  Submitted on ${fb.created_at?.replace("T", " ")} · Category: ${escapeHtml(fb.category)}
                </div>
              </div>

              <div class="form-group">
                <label class="form-label" for="reply-text">Administrator Official Response</label>
                <textarea id="reply-text" class="form-textarea" placeholder="Type your response to the commuter..." required>${escapeHtml(fb.reply || '')}</textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
              <button type="submit" class="btn-cyber">Send Official Reply</button>
            </div>
          </form>
        </div>
      </div>
    `;
  } catch (e) {
    showToast("Error opening reply modal", "error");
  }
}

async function submitFeedbackReply(e, fid) {
  e.preventDefault();
  const reply = document.getElementById("reply-text").value.trim();
  if (!reply) return;

  try {
    const res = await apiRequest(`/api/admin/feedback/${fid}/reply`, "POST", { reply });
    if (res.ok) {
      showToast("Reply sent and recorded", "success");
      closeModal();
      loadFeedbackRecords();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to submit reply", "error");
    }
  } catch (err) {
    showToast("Reply error", "error");
  }
}

async function deleteFeedbackRecord(fid) {
  if (!confirm(`Delete feedback #${fid}? This will permanently remove inappropriate or spam submissions.`)) return;
  try {
    const res = await apiRequest(`/api/admin/feedback/${fid}`, "DELETE");
    if (res.ok) {
      showToast("Feedback removed", "success");
      loadFeedbackRecords();
      loadDashboardTelemetry();
    } else {
      showToast("Failed to delete feedback", "error");
    }
  } catch (e) {
    showToast("Delete error", "error");
  }
}

// ==============================================================================
// 8. Tab 5: Website Data, Stations & Notices CMS
// ==============================================================================

async function loadAdminStationsList() {
  try {
    const res = await apiRequest("/api/admin/stations");
    const tbody = document.querySelector("#table-admin-stations tbody");
    if (!tbody) return;

    const list = res.stations || [];
    state.stations = list;
    populateStationDropdowns();

    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No stations found.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(s => `
      <tr>
        <td><strong>${escapeHtml(s.name)}</strong></td>
        <td><span class="category-tag ${s.mode?.toLowerCase() || 'metro'}">${escapeHtml(s.mode)}</span></td>
        <td><span style="font-family:var(--font-mono);">Zone ${s.zone}</span></td>
        <td><strong>${s.traffic_count || 0} trips</strong></td>
        <td>₹ ${(s.total_fare_collected || 0).toFixed(2)}</td>
        <td>
          <div class="table-actions">
            <button class="btn-table-action" onclick="openEditStationModal(${s.id})" title="Edit Station">✏️ Edit</button>
            <button class="btn-table-action danger" onclick="deleteStationRecord(${s.id})" title="Delete Station">🗑️</button>
          </div>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Stations CMS error:", err);
  }
}

function openAddStationModal() {
  const modalHost = document.getElementById("modal-host");
  modalHost.innerHTML = `
    <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title"><span>🚆</span> Add Transit Corridor Station</h3>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="submitNewStation(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="new-st-name">Station Name</label>
              <input id="new-st-name" type="text" class="form-input" placeholder="e.g. Pune University Hub" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-st-mode">Transit Mode</label>
              <select id="new-st-mode" class="form-select">
                <option value="Metro">Metro Rapid Transit</option>
                <option value="Bus">Bus Rapid Transit (BRTS)</option>
                <option value="Train">Suburban Train</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="new-st-zone">Fare Zone Number (1 to 10)</label>
              <input id="new-st-zone" type="number" min="1" max="10" class="form-input" value="1" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-cyber">Add to Grid</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitNewStation(e) {
  e.preventDefault();
  const name = document.getElementById("new-st-name").value.trim();
  const mode = document.getElementById("new-st-mode").value;
  const zone = parseInt(document.getElementById("new-st-zone").value) || 1;

  try {
    const res = await apiRequest("/api/admin/station", "POST", { name, mode, zone });
    if (res.ok) {
      showToast(`Station '${name}' added to grid`, "success");
      closeModal();
      loadAdminStationsList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to add station", "error");
    }
  } catch (err) {
    showToast("Station add error", "error");
  }
}

async function openEditStationModal(sid) {
  const st = state.stations.find(s => s.id === sid);
  if (!st) return;

  const modalHost = document.getElementById("modal-host");
  modalHost.innerHTML = `
    <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title"><span>✏️</span> Edit Station Parameters</h3>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="submitEditStation(event, ${sid})">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="edit-st-name">Station Name</label>
              <input id="edit-st-name" type="text" class="form-input" value="${escapeHtml(st.name)}" required>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-st-mode">Transit Mode</label>
              <select id="edit-st-mode" class="form-select">
                <option value="Metro" ${st.mode === 'Metro' ? 'selected' : ''}>Metro Rapid Transit</option>
                <option value="Bus" ${st.mode === 'Bus' ? 'selected' : ''}>Bus Rapid Transit (BRTS)</option>
                <option value="Train" ${st.mode === 'Train' ? 'selected' : ''}>Suburban Train</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="edit-st-zone">Fare Zone</label>
              <input id="edit-st-zone" type="number" min="1" max="10" class="form-input" value="${st.zone}" required>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-cyber">Save Changes</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitEditStation(e, sid) {
  e.preventDefault();
  const name = document.getElementById("edit-st-name").value.trim();
  const mode = document.getElementById("edit-st-mode").value;
  const zone = parseInt(document.getElementById("edit-st-zone").value) || 1;

  try {
    const res = await apiRequest(`/api/admin/station/${sid}`, "PUT", { name, mode, zone });
    if (res.ok) {
      showToast("Station updated", "success");
      closeModal();
      loadAdminStationsList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to update station", "error");
    }
  } catch (err) {
    showToast("Update error", "error");
  }
}

async function deleteStationRecord(sid) {
  if (!confirm("Remove this station from the transit grid?")) return;
  try {
    const res = await apiRequest(`/api/admin/station/${sid}`, "DELETE");
    if (res.ok) {
      showToast("Station removed", "success");
      loadAdminStationsList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Cannot delete station with active journeys", "error");
    }
  } catch (e) {
    showToast("Delete error", "error");
  }
}

// Announcements / Notices CMS
async function loadAdminNoticesList() {
  try {
    const res = await apiRequest("/api/admin/content");
    const tbody = document.querySelector("#table-admin-notices tbody");
    if (!tbody) return;

    const list = res.notices || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No published notices.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(n => `
      <tr>
        <td><strong>${escapeHtml(n.title)}</strong></td>
        <td><span class="category-tag resident">${escapeHtml(n.category)}</span></td>
        <td style="font-size:0.82rem; color:var(--text-muted); max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          ${escapeHtml(n.content)}
        </td>
        <td><span class="status-badge ${n.priority === 'urgent' ? 'inactive' : 'present'}">${n.priority || 'normal'}</span></td>
        <td><span class="status-badge active">${n.status || 'published'}</span></td>
        <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${n.created_at?.slice(0, 10) || 'N/A'}</td>
        <td>
          <div class="table-actions">
            <button class="btn-table-action" onclick="openEditNoticeModal(${n.id})" title="Edit Notice">✏️</button>
            <button class="btn-table-action danger" onclick="deleteNoticeRecord(${n.id})" title="Delete Notice">🗑️</button>
          </div>
        </td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Notices loading error:", err);
  }
}

function openAddNoticeModal() {
  const modalHost = document.getElementById("modal-host");
  modalHost.innerHTML = `
    <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
      <div class="modal-card">
        <div class="modal-header">
          <h3 class="modal-title"><span>📢</span> Post Public Announcement</h3>
          <button class="modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <form onsubmit="submitNewNotice(event)">
          <div class="modal-body">
            <div class="form-group">
              <label class="form-label" for="notice-title">Announcement Title</label>
              <input id="notice-title" type="text" class="form-input" placeholder="e.g. Pune Metro Line 3 Operational Update" required>
            </div>
            <div class="two-col-grid" style="margin-bottom:0; gap:0.75rem;">
              <div class="form-group">
                <label class="form-label" for="notice-category">Category</label>
                <select id="notice-category" class="form-select">
                  <option value="Update">Update</option>
                  <option value="Alert">Alert</option>
                  <option value="Maintenance">Maintenance</option>
                  <option value="Policy">Policy</option>
                </select>
              </div>
              <div class="form-group">
                <label class="form-label" for="notice-priority">Priority</label>
                <select id="notice-priority" class="form-select">
                  <option value="normal">Normal</option>
                  <option value="urgent">Urgent</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </div>
            <div class="form-group">
              <label class="form-label" for="notice-content">Content &amp; Notice Details</label>
              <textarea id="notice-content" class="form-textarea" placeholder="Enter message for commuters..." required></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
            <button type="submit" class="btn-cyber">Publish Announcement</button>
          </div>
        </form>
      </div>
    </div>
  `;
}

async function submitNewNotice(e) {
  e.preventDefault();
  const title = document.getElementById("notice-title").value.trim();
  const category = document.getElementById("notice-category").value;
  const priority = document.getElementById("notice-priority").value;
  const content = document.getElementById("notice-content").value.trim();

  try {
    const res = await apiRequest("/api/admin/content", "POST", { title, category, priority, content });
    if (res.ok) {
      showToast("Announcement published successfully", "success");
      closeModal();
      loadAdminNoticesList();
      loadDashboardTelemetry();
    } else {
      showToast(res.msg || "Failed to publish announcement", "error");
    }
  } catch (err) {
    showToast("Publish error", "error");
  }
}

async function openEditNoticeModal(cid) {
  try {
    const res = await apiRequest("/api/admin/content");
    const n = (res.notices || []).find(item => item.id === cid);
    if (!n) return;

    const modalHost = document.getElementById("modal-host");
    modalHost.innerHTML = `
      <div class="modal-overlay" onclick="closeModalOnBackdrop(event)">
        <div class="modal-card">
          <div class="modal-header">
            <h3 class="modal-title"><span>✏️</span> Edit Announcement</h3>
            <button class="modal-close-btn" onclick="closeModal()">✕</button>
          </div>
          <form onsubmit="submitEditNotice(event, ${cid})">
            <div class="modal-body">
              <div class="form-group">
                <label class="form-label" for="edit-notice-title">Title</label>
                <input id="edit-notice-title" type="text" class="form-input" value="${escapeHtml(n.title)}" required>
              </div>
              <div class="two-col-grid" style="margin-bottom:0; gap:0.75rem;">
                <div class="form-group">
                  <label class="form-label" for="edit-notice-category">Category</label>
                  <select id="edit-notice-category" class="form-select">
                    <option value="Update" ${n.category === 'Update' ? 'selected' : ''}>Update</option>
                    <option value="Alert" ${n.category === 'Alert' ? 'selected' : ''}>Alert</option>
                    <option value="Maintenance" ${n.category === 'Maintenance' ? 'selected' : ''}>Maintenance</option>
                    <option value="Policy" ${n.category === 'Policy' ? 'selected' : ''}>Policy</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label" for="edit-notice-priority">Priority</label>
                  <select id="edit-notice-priority" class="form-select">
                    <option value="normal" ${n.priority === 'normal' ? 'selected' : ''}>Normal</option>
                    <option value="urgent" ${n.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                    <option value="low" ${n.priority === 'low' ? 'selected' : ''}>Low</option>
                  </select>
                </div>
              </div>
              <div class="form-group">
                <label class="form-label" for="edit-notice-content">Content</label>
                <textarea id="edit-notice-content" class="form-textarea" required>${escapeHtml(n.content)}</textarea>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
              <button type="submit" class="btn-cyber">Save Changes</button>
            </div>
          </form>
        </div>
      </div>
    `;
  } catch (e) {
    showToast("Error opening edit modal", "error");
  }
}

async function submitEditNotice(e, cid) {
  e.preventDefault();
  const title = document.getElementById("edit-notice-title").value.trim();
  const category = document.getElementById("edit-notice-category").value;
  const priority = document.getElementById("edit-notice-priority").value;
  const content = document.getElementById("edit-notice-content").value.trim();

  try {
    const res = await apiRequest(`/api/admin/content/${cid}`, "PUT", { title, category, priority, content });
    if (res.ok) {
      showToast("Announcement updated", "success");
      closeModal();
      loadAdminNoticesList();
    } else {
      showToast(res.msg || "Failed to update notice", "error");
    }
  } catch (err) {
    showToast("Update error", "error");
  }
}

async function deleteNoticeRecord(cid) {
  if (!confirm("Permanently delete this announcement?")) return;
  try {
    const res = await apiRequest(`/api/admin/content/${cid}`, "DELETE");
    if (res.ok) {
      showToast("Announcement deleted", "success");
      loadAdminNoticesList();
      loadDashboardTelemetry();
    } else {
      showToast("Failed to delete notice", "error");
    }
  } catch (e) {
    showToast("Delete error", "error");
  }
}

// Live Passenger Activity Stream
async function loadLiveActivities() {
  try {
    const res = await apiRequest("/api/admin/activities");
    const tbody = document.querySelector("#table-activity-stream tbody");
    if (!tbody) return;

    const list = res.activities || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; color:var(--text-dim); padding:1.5rem;">No recent activities logged.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(a => {
      const isJourney = a.type === "journey";
      return `
        <tr>
          <td><span class="category-tag ${isJourney ? 'metro' : 'resident'}">${isJourney ? '🚆 Turnstile Scan' : '💳 Wallet Txn'}</span></td>
          <td><strong>${escapeHtml(a.user_name || 'Passenger')}</strong></td>
          <td style="font-size:0.84rem;">${escapeHtml(a.description || '')}</td>
          <td>
            <strong style="color:${a.fare > 0 ? 'var(--emerald-glow)' : 'var(--text-main)'};">
              ${a.fare ? `₹ ${Math.abs(a.fare).toFixed(2)}` : 'Pass'}
            </strong>
          </td>
          <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">
            ${a.timestamp ? a.timestamp.replace("T", " ") : "Just now"}
          </td>
        </tr>
      `;
    }).join("");

  } catch (err) {
    console.error("Live activities error:", err);
  }
}

// ==============================================================================
// 9. Tab 6: Audit Logs & Security
// ==============================================================================

async function loadAuditLogs() {
  try {
    const q = document.getElementById("audit-search-input")?.value.trim() || "";
    const action = document.getElementById("audit-action-filter")?.value || "all";

    const params = new URLSearchParams({ q, action });
    const res = await apiRequest(`/api/admin/audit-logs?${params.toString()}`);
    const tbody = document.querySelector("#table-audit-logs tbody");
    if (!tbody) return;

    // Populate action filter dropdown once
    const select = document.getElementById("audit-action-filter");
    if (select && select.children.length <= 1 && res.actions) {
      res.actions.forEach(act => {
        select.innerHTML += `<option value="${act}">${act}</option>`;
      });
    }

    const list = res.logs || [];
    if (!list.length) {
      tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-dim); padding:2rem;">No audit logs match criteria.</td></tr>`;
      return;
    }

    tbody.innerHTML = list.map(log => `
      <tr>
        <td style="font-family:var(--font-mono); font-size:0.8rem;">#${log.id}</td>
        <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">
          ${log.created_at ? log.created_at.replace("T", " ") : "N/A"}
        </td>
        <td><strong>${escapeHtml(log.admin_name || 'System')}</strong></td>
        <td><span class="category-tag tourist">${escapeHtml(log.action)}</span></td>
        <td style="font-size:0.8rem; color:var(--text-muted);">${escapeHtml(log.target_type)} #${log.target_id || ''}</td>
        <td style="font-size:0.82rem; color:var(--text-main);">${escapeHtml(log.details)}</td>
        <td style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim);">${escapeHtml(log.ip_address || '127.0.0.1')}</td>
      </tr>
    `).join("");

  } catch (err) {
    console.error("Audit log error:", err);
  }
}

// ==============================================================================
// 10. Tab 7: Reports & Analytics
// ==============================================================================

async function loadReportPeriod(period, btn) {
  state.reportPeriod = period;

  if (btn) {
    btn.parentElement.querySelectorAll(".filter-pill").forEach(p => p.classList.remove("active"));
    btn.classList.add("active");
  }

  try {
    const res = await apiRequest(`/api/admin/reports?period=${period}`);
    if (!res.ok) return;

    document.getElementById("report-title-text").textContent = res.title || "Transit Intelligence Report";
    document.getElementById("report-timestamp-pill").textContent = `Generated: ${res.generated_at?.replace("T", " ") || "Just now"}`;

    const m = res.metrics || {};
    document.getElementById("rep-trips").textContent = (m.completed_trips || 0).toLocaleString();
    document.getElementById("rep-revenue").textContent = `₹ ${(m.total_revenue || 0).toFixed(2)}`;
    document.getElementById("rep-attendance").textContent = `${m.total_attendance || 0} check-ins`;
    document.getElementById("rep-users").textContent = `+${m.new_registrations || 0} commuters`;
    document.getElementById("rep-satisfaction").textContent = `${m.avg_satisfaction_rating || 5.0} ★`;

    // Modal breakdown in report
    const tbody = document.querySelector("#table-report-modal tbody");
    if (tbody) {
      const breakdown = res.modal_breakdown || [];
      if (!breakdown.length) {
        tbody.innerHTML = `<tr><td colspan="3" style="text-align:center; color:var(--text-dim); padding:1rem;">No multimodal trips in this period.</td></tr>`;
      } else {
        tbody.innerHTML = breakdown.map(b => `
          <tr>
            <td><strong>${escapeHtml(b.mode || 'Metro')}</strong></td>
            <td>${b.journeys || 0} trips completed</td>
            <td><strong>₹ ${(b.revenue || 0).toFixed(2)}</strong></td>
          </tr>
        `).join("");
      }
    }

  } catch (err) {
    console.error("Reports loading error:", err);
  }
}

function printReportCard() {
  window.print();
}

// ==============================================================================
// 11. Tab 8: Fare Settings & Credentials
// ==============================================================================

async function loadFareSettings() {
  try {
    const res = await apiRequest("/api/admin/config");
    if (!res.ok || !res.config) return;

    const c = res.config;
    document.getElementById("setting-base-fare").value = c.base_fare || 10;
    document.getElementById("setting-per-zone").value = c.per_zone_fare || 5;
    document.getElementById("setting-min-balance").value = c.min_balance || 10;
    document.getElementById("setting-antipassback").value = c.anti_passback_sec || 20;
  } catch (err) {
    console.error("Fare config error:", err);
  }
}

async function saveFareSettingsAction() {
  const base_fare = parseFloat(document.getElementById("setting-base-fare").value);
  const per_zone_fare = parseFloat(document.getElementById("setting-per-zone").value);
  const min_balance = parseFloat(document.getElementById("setting-min-balance").value);
  const anti_passback_sec = parseInt(document.getElementById("setting-antipassback").value);

  try {
    const res = await apiRequest("/api/admin/config", "POST", {
      base_fare, per_zone_fare, min_balance, anti_passback_sec
    });
    if (res.ok) {
      showToast("Fare rules and security parameters saved successfully", "success");
    } else {
      showToast(res.msg || "Failed to update fare settings", "error");
    }
  } catch (err) {
    showToast("Fare settings save error", "error");
  }
}

async function updateAdminKeyAction() {
  const admin_key = document.getElementById("setting-admin-key").value.trim();
  if (admin_key.length < 4) {
    showToast("Master key must be at least 4 characters long", "error");
    return;
  }

  try {
    const res = await apiRequest("/api/admin/config", "POST", { admin_key });
    if (res.ok) {
      showToast("Master access key updated successfully", "success");
      document.getElementById("setting-admin-key").value = "";
    } else {
      showToast(res.msg || "Failed to update key", "error");
    }
  } catch (err) {
    showToast("Key update error", "error");
  }
}

async function rechargeAllDemoWallets() {
  if (!confirm("Add ₹200 testing balance to all registered commuter wallets?")) return;
  try {
    const usersRes = await apiRequest("/api/admin/users?limit=100");
    const users = usersRes.users || [];

    for (const u of users) {
      await apiRequest(`/api/admin/user/${u.id}/balance`, "POST", {
        amount: 200,
        note: "Admin batch demo testing recharge (+₹200)"
      });
    }

    showToast(`Recharged ${users.length} commuter wallets by ₹200 each!`, "success");
    loadDashboardTelemetry();
  } catch (e) {
    showToast("Recharge error", "error");
  }
}

// ==============================================================================
// 12. CSV Export Handlers
// ==============================================================================

function exportUsersCsv() {
  window.open(`/api/admin/export/users?token=${state.token}`, "_blank");
  showToast("Downloading Commuters CSV...", "info");
}

function exportAttendanceCsv() {
  window.open(`/api/admin/export/attendance?token=${state.token}`, "_blank");
  showToast("Downloading Attendance CSV...", "info");
}

function exportJourneysCsv() {
  window.open(`/api/admin/export/journeys?token=${state.token}`, "_blank");
  showToast("Downloading Journeys CSV...", "info");
}

function exportFeedbackCsv() {
  window.open(`/api/admin/export/feedback?token=${state.token}`, "_blank");
  showToast("Downloading Feedback CSV...", "info");
}

function exportAuditLogsCsv() {
  window.open(`/api/admin/export/audit-logs?token=${state.token}`, "_blank");
  showToast("Downloading Audit Logs CSV...", "info");
}

// ==============================================================================
// 13. UI Utilities: Toast Notifications & Modal Helpers
// ==============================================================================

function showToast(msg, type = "info") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  const icon = type === "success" ? "✓" : type === "error" ? "⚠️" : "ℹ️";
  toast.innerHTML = `<span style="font-size:1.1rem;">${icon}</span> <span>${escapeHtml(msg)}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(40px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function closeModal() {
  const host = document.getElementById("modal-host");
  if (host) host.innerHTML = "";
}

function closeModalOnBackdrop(e) {
  if (e.target.classList.contains("modal-overlay")) {
    closeModal();
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

