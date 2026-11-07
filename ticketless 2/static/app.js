/**
 * BioTransit AI - Frontend Application Controller
 * Handles Biometric AI, 3D Gate Interaction, Holographic Visuals,
 * Audio Synthesis, Network Route Planning, and Security Admin Command Center.
 */

// --- 1. Web Audio API High-Tech Sound Synthesizer ---
const SoundEngine = (function () {
  let ctx = null;
  let muted = false;

  function getCtx() {
    if (!ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) ctx = new AudioCtx();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume();
    }
    return ctx;
  }

  function playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1) {
    if (muted) return;
    try {
      const c = getCtx();
      if (!c) return;
      const osc = c.createOscillator();
      const gain = c.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, c.currentTime);
      gain.gain.setValueAtTime(gainVal, c.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + duration);
      osc.connect(gain);
      gain.connect(c.destination);
      osc.start();
      osc.stop(c.currentTime + duration);
    } catch (e) {}
  }

  function playSuccess() {
    if (muted) return;
    try {
      const c = getCtx();
      if (!c) return;
      const now = c.currentTime;
      [659.25, 830.61, 987.77].forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.08);
        gain.gain.setValueAtTime(0.12, now + idx * 0.08);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.08 + 0.35);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now + idx * 0.08);
        osc.stop(now + idx * 0.08 + 0.35);
      });
    } catch (e) {}
  }

  function playError() {
    if (muted) return;
    try {
      const c = getCtx();
      if (!c) return;
      const now = c.currentTime;
      [140, 95].forEach((freq, idx) => {
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.14, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.12 + 0.22);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.22);
      });
    } catch (e) {}
  }

  function playScan() {
    playTone(1760, 'sine', 0.08, 0.08);
  }

  function playClick() {
    playTone(1200, 'sine', 0.04, 0.04);
  }

  function toggleMute() {
    muted = !muted;
    const btn = document.getElementById('sound-toggle-btn');
    if (btn) {
      btn.innerHTML = muted ? '🔇' : '🔊';
      btn.title = muted ? 'Unmute Sound' : 'Mute Sound';
    }
    showToast("Audio Engine", muted ? "Sound effects muted" : "Sound effects enabled", "info");
    return muted;
  }

  return { playSuccess, playError, playScan, playClick, toggleMute };
})();

// --- 2. Cyber Toast Notification System ---
function showToast(title, msg, type = 'info', duration = 3500) {
  const container = document.getElementById('cyber-toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const typeCls = type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : (type === 'warning' ? 'toast-warning' : ''));
  toast.className = `cyber-toast ${typeCls}`;

  let icon = 'ℹ️';
  if (type === 'success') {
    icon = '✓';
    SoundEngine.playSuccess();
  } else if (type === 'error') {
    icon = '⚠️';
    SoundEngine.playError();
  } else if (type === 'warning') {
    icon = '⚠️';
  }

  toast.innerHTML = `
    <div class="cyber-toast-icon">${icon}</div>
    <div class="cyber-toast-content">
      <div class="cyber-toast-title">${title}</div>
      <div class="cyber-toast-msg">${msg}</div>
    </div>
    <button class="cyber-toast-close" onclick="this.parentElement.remove()">✕</button>
  `;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 250);
  }, duration);
}

// --- 3. Cyber Modal Dialog System ---
function openModal({ title, bodyHtml, confirmText = 'Confirm', onConfirm = null }) {
  const host = document.getElementById('cyber-modal-host');
  if (!host) return;

  host.innerHTML = `
    <div class="cyber-modal-backdrop" id="active-cyber-modal" onclick="if(event.target===this) closeModal()">
      <div class="cyber-modal">
        <div class="cyber-modal-header">
          <div class="cyber-modal-title">${title}</div>
          <button class="cyber-modal-close-btn" onclick="closeModal()">✕</button>
        </div>
        <div class="cyber-modal-body">
          ${bodyHtml}
        </div>
        <div class="cyber-modal-footer">
          <button class="btn-cyber secondary" onclick="closeModal()">Cancel</button>
          <button class="btn-cyber emerald" id="cyber-modal-confirm-btn">${confirmText}</button>
        </div>
      </div>
    </div>
  `;

  const btn = document.getElementById('cyber-modal-confirm-btn');
  if (btn && onConfirm) {
    btn.onclick = async () => {
      SoundEngine.playClick();
      await onConfirm();
    };
  }
}

function closeModal() {
  const host = document.getElementById('cyber-modal-host');
  if (host) host.innerHTML = '';
}

// --- 4. Application State & REST Client ---
const MODELS_URI = "https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.13/model/";
let currentStream = null;
let currentView = 'gate';
let autoScanTimer = null;
let activeUserId = null;
let registeredStations = [];
let demoProfiles = [];
let detectionInterval = null;

// Admin cache
let cachedAdminUsers = [];
let cachedAdminJourneys = [];
let currentAdminSubTab = 'overview';

const $ = id => document.getElementById(id);

const api = (url, method = "GET", body, headers = {}) =>
  fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok && !data.msg) {
      data.msg = `HTTP Error ${r.status}`;
    }
    return data;
  });

function getStoredAdminKey() {
  return sessionStorage.getItem('biotransit_admin_key') || ($("admin-key-input")?.value || "admin123");
}

function getAdminHeaders() {
  return { "X-Admin-Key": getStoredAdminKey() };
}

function showMsg(containerId, isSuccess, message) {
  const el = $(containerId);
  if (!el) return;
  const cls = isSuccess ? 'ok' : 'bad';
  const icon = isSuccess ? '✓' : '⚠';
  el.innerHTML = `
    <div class="cyber-msg-box ${cls}">
      <span style="font-size:1.1rem; line-height:1;">${icon}</span>
      <div>${message}</div>
    </div>
  `;
}

// --- 5. App Initialization ---
async function initApp() {
  updateStatus("Loading Biometric AI Core...");

  try {
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODELS_URI),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODELS_URI),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODELS_URI)
    ]);
    updateStatus("AI Biometrics Online", true);
  } catch (err) {
    console.warn("face-api model remote load failed, running in resilient mode:", err);
    updateStatus("AI Models Ready (Local Mode)", true);
  }

  // Initialize Three.js 3D Turnstile Gate
  Gate3D.init("gate-threejs-container");

  // Load Station Directory & Demo Profiles
  await loadStations();
  await loadDemoProfiles();

  // Setup Holographic 3D Tilt Card in My Account
  setupCardPerspectiveTilt();

  // Setup Navigation Tabs
  setupNavigation();

  // Load Public Transit Advisories & Community Reviews
  loadPublicNotices();
  loadPublicFeedbackFeed();

  // Switch to default Gate Simulator view and start camera
  switchTab("gate");
}

function updateStatus(text, ready = false) {
  const stText = $("system-status-text");
  const stDot = $("system-status-dot");
  if (stText) stText.textContent = text;
  if (stDot) {
    if (ready) stDot.classList.add("ready");
    else stDot.classList.remove("ready");
  }
}

// --- 6. Camera & Facial Reticle HUD Stream ---
async function startCameraForView(viewName) {
  stopCamera();
  currentView = viewName;

  const videoEl = $(`v-${viewName}`);
  const canvasEl = $(`c-${viewName}`);
  if (!videoEl) return;

  try {
    currentStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: "user" }
    });
    videoEl.srcObject = currentStream;

    if (canvasEl) {
      startFaceTrackingLoop(videoEl, canvasEl);
    }
  } catch (err) {
    console.warn("Webcam access offline or denied:", err);
    const hudBadge = document.querySelector(`#${viewName} .hud-status-badge span`);
    if (hudBadge) hudBadge.textContent = "Camera Offline (Use Demo Commuter)";
  }
}

function stopCamera() {
  if (detectionInterval) {
    clearInterval(detectionInterval);
    detectionInterval = null;
  }
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
  clearInterval(autoScanTimer);
  const autoCheckbox = $("auto-scan-toggle");
  if (autoCheckbox) autoCheckbox.checked = false;
}

function startFaceTrackingLoop(videoEl, canvasEl) {
  const ctx = canvasEl.getContext('2d');

  detectionInterval = setInterval(async () => {
    if (!videoEl || videoEl.paused || videoEl.ended || !faceapi) return;

    if (canvasEl.width !== videoEl.videoWidth && videoEl.videoWidth > 0) {
      canvasEl.width = videoEl.videoWidth;
      canvasEl.height = videoEl.videoHeight;
    }

    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

    try {
      const detection = await faceapi.detectSingleFace(
        videoEl,
        new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })
      ).withFaceLandmarks();

      if (detection) {
        const box = detection.detection.box;
        const landmarks = detection.landmarks.positions;

        ctx.strokeStyle = '#00f2fe';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f2fe';
        ctx.shadowBlur = 10;

        const len = 20;
        // Top Left
        ctx.beginPath();
        ctx.moveTo(box.x, box.y + len);
        ctx.lineTo(box.x, box.y);
        ctx.lineTo(box.x + len, box.y);
        ctx.stroke();

        // Top Right
        ctx.beginPath();
        ctx.moveTo(box.x + box.width - len, box.y);
        ctx.lineTo(box.x + box.width, box.y);
        ctx.lineTo(box.x + box.width, box.y + len);
        ctx.stroke();

        // Bottom Left
        ctx.beginPath();
        ctx.moveTo(box.x, box.y + box.height - len);
        ctx.lineTo(box.x, box.y + box.height);
        ctx.lineTo(box.x + len, box.y + box.height);
        ctx.stroke();

        // Bottom Right
        ctx.beginPath();
        ctx.moveTo(box.x + box.width - len, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height);
        ctx.lineTo(box.x + box.width, box.y + box.height - len);
        ctx.stroke();

        // Landmarks
        ctx.fillStyle = '#22d3ee';
        ctx.shadowBlur = 6;
        for (let i = 0; i < landmarks.length; i += 2) {
          ctx.beginPath();
          ctx.arc(landmarks[i].x, landmarks[i].y, 2.2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } catch (e) {}
  }, 100);
}

// Generate high dimensional biometric descriptor
async function getDescriptor() {
  const selectId = currentView === 'gate' ? 'sim-profile-select' : (currentView === 'me' ? 'me-sim-profile-select' : null);
  const simSelect = selectId ? $(selectId) : null;
  const simVal = simSelect ? simSelect.value : 'webcam';

  // 1. Simulated unknown stranger
  if (simVal === 'unknown') {
    return Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.15);
  }

  // 2. Simulated registered passenger profile
  if (simVal && simVal.startsWith('user_')) {
    const uid = parseInt(simVal.replace('user_', ''), 10);
    const p = demoProfiles.find(x => x.id === uid);
    if (p && p.descriptor) {
      return p.descriptor;
    }
  }

  // 3. Real webcam acquisition
  const vid = $(`v-${currentView}`);
  if (!vid || vid.readyState < 2) return null;

  try {
    const res = await faceapi
      .detectSingleFace(vid, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 }))
      .withFaceLandmarks()
      .withFaceDescriptor();

    return res ? Array.from(res.descriptor) : null;
  } catch (err) {
    console.error("Descriptor extraction failed:", err);
    return null;
  }
}

// --- 7. Station Loading & Route Calculations ---
async function loadStations() {
  try {
    registeredStations = await api("/api/stations");
    const gateSelect = $("gs");
    const fromSelect = $("route-from");
    const toSelect = $("route-to");

    const optionsHtml = registeredStations.map(s => {
      let icon = '🚊';
      const m = s.mode.toLowerCase();
      if (m.includes('bus')) icon = '🚌';
      else if (m.includes('train')) icon = '🚆';
      else if (m.includes('hyper')) icon = '⚡';
      return `<option value="${s.id}">${icon} ${s.name} (${s.mode} · Zone ${s.zone})</option>`;
    }).join("");

    if (gateSelect) gateSelect.innerHTML = optionsHtml;
    if (fromSelect) fromSelect.innerHTML = optionsHtml;
    if (toSelect) toSelect.innerHTML = optionsHtml;

    if (toSelect && registeredStations.length > 1) {
      toSelect.selectedIndex = 1;
    }

    updateRouteCalculation();
    renderNetworkStationGrid();
  } catch (err) {
    console.error("Failed loading stations:", err);
  }
}

async function loadDemoProfiles() {
  try {
    demoProfiles = await api("/api/demo-profiles");
    const gateSelect = $("sim-profile-select");
    const meSelect = $("me-sim-profile-select");
    const chipsContainer = $("gate-commuter-chips");

    const userOpts = demoProfiles.map(u => 
      `<option value="user_${u.id}">👤 Test Commuter: ${u.name} (Balance: ₹${u.balance})</option>`
    ).join("");

    if (gateSelect) {
      gateSelect.innerHTML = `
        <option value="webcam">🎥 Live Webcam (Face-API AI)</option>
        ${userOpts}
        <option value="unknown">🚫 Simulated Stranger (Fraud Test / Lock Gate)</option>
      `;
    }

    if (meSelect) {
      meSelect.innerHTML = `
        <option value="webcam">🎥 Live Webcam (Face-API AI)</option>
        ${userOpts}
      `;
    }

    // Populate quick commuter switcher chips on Gate tab
    if (chipsContainer) {
      chipsContainer.innerHTML = `
        <div class="commuter-chip active" onclick="selectCommuterChip('webcam', this)">🎥 Webcam</div>
        ${demoProfiles.slice(0, 5).map(u => `
          <div class="commuter-chip" onclick="selectCommuterChip('user_${u.id}', this)">
            ⚡ ${u.name} (₹${u.balance})
          </div>
        `).join('')}
        <div class="commuter-chip stranger" onclick="selectCommuterChip('unknown', this)">🚫 Stranger (Fraud)</div>
      `;
    }
  } catch (err) {
    console.warn("Could not load demo profiles:", err);
  }
}

function selectCommuterChip(val, el) {
  SoundEngine.playClick();
  const select = $("sim-profile-select");
  if (select) select.value = val;
  document.querySelectorAll(".commuter-chip").forEach(c => c.classList.remove("active"));
  if (el) el.classList.add("active");
}

function updateRouteCalculation() {
  const fromId = +$("route-from")?.value;
  const toId = +$("route-to")?.value;
  if (!fromId || !toId || !registeredStations.length) return;

  const s1 = registeredStations.find(s => s.id === fromId);
  const s2 = registeredStations.find(s => s.id === toId);
  if (!s1 || !s2) return;

  const zoneDiff = Math.abs(s1.zone - s2.zone);
  const fare = 10 + 5 * zoneDiff;
  const estMins = 12 + zoneDiff * 6;

  $("route-fare-badge").textContent = `₹ ${fare}`;
  $("route-zone-diff").textContent = `Zone Diff: ${zoneDiff} (|Z${s1.zone} - Z${s2.zone}|)`;
  $("route-time-est").textContent = `~ ${estMins} mins travel time`;
}

function setPlannedRouteToGate() {
  SoundEngine.playClick();
  const fromId = $("route-from")?.value;
  if (fromId && $("gs")) {
    $("gs").value = fromId;
  }
  switchTab("gate");
  showToast("Station Selected", "Gate set to departure station. Ready for biometric scan!", "info");
}

function renderNetworkStationGrid() {
  const container = $("network-station-grid");
  if (!container) return;

  container.innerHTML = registeredStations.map(s => {
    let modeCls = 'metro';
    let icon = '🚇';
    const m = s.mode.toLowerCase();
    if (m.includes('bus')) { modeCls = 'bus'; icon = '🚌'; }
    else if (m.includes('train')) { modeCls = 'train'; icon = '🚆'; }
    else if (m.includes('hyper')) { modeCls = 'train'; icon = '⚡'; }

    return `
      <div class="station-admin-card">
        <div class="station-card-top">
          <span class="station-mode-tag ${modeCls}">${icon} ${s.mode}</span>
          <span class="brand-badge" style="font-size:0.75rem;">Zone ${s.zone}</span>
        </div>
        <h4>${s.name}</h4>
        <div class="station-traffic-row">
          <span>Pune Transit Corridor</span>
          <button class="btn-table-action" onclick="$('gs').value='${s.id}'; switchTab('gate');">Travel Here</button>
        </div>
      </div>
    `;
  }).join('');
}

// --- 8. Passenger Registration Actions ---
async function registerUser() {
  SoundEngine.playClick();
  const name = $("rn").value.trim();
  const email = $("re").value.trim();
  const phone = $("rp").value.trim();
  const kind = $("rk").value;

  if (!name || !email) {
    showMsg("rmsg", false, "Please enter your Full Name and Email address.");
    SoundEngine.playError();
    return;
  }

  showMsg("rmsg", true, "Scanning face... Please face camera directly.");
  SoundEngine.playScan();

  const descriptor = await getDescriptor();
  if (!descriptor) {
    showMsg("rmsg", false, "No face detected in video stream! Ensure proper lighting or use Instant Demo Face.");
    SoundEngine.playError();
    return;
  }

  const res = await api("/api/register", "POST", { name, email, phone, kind, descriptor });
  showMsg("rmsg", res.ok, res.msg);

  if (res.ok) {
    SoundEngine.playSuccess();
    showToast("Commuter Enrolled", `${name} enrolled with ₹50 bonus!`, "success");
    $("rn").value = "";
    $("re").value = "";
    $("rp").value = "";
    await loadDemoProfiles();
  } else {
    SoundEngine.playError();
  }
}

// Instant Demo Registration without camera
async function quickRegisterDemoUser() {
  SoundEngine.playClick();
  const names = ["Siddharth Rao", "Neha Kulkarni", "Vikram Joshi", "Rohan Deshmukh", "Pooja Patil"];
  const randomName = names[Math.floor(Math.random() * names.length)];
  const randomId = Math.floor(1000 + Math.random() * 9000);
  const email = `${randomName.toLowerCase().replace(/\s+/g, '.')}${randomId}@transit.pune.in`;
  const phone = `+91 98${Math.floor(10000000 + Math.random() * 90000000)}`;
  
  // Synthetic 128-D vector
  const descriptor = Array.from({ length: 128 }, () => (Math.random() - 0.5) * 0.2);

  showToast("Biometric AI", `Generating 128-D synthetic embedding for ${randomName}...`, "info");
  
  const res = await api("/api/register", "POST", {
    name: randomName,
    email,
    phone,
    kind: "resident",
    descriptor
  });

  if (res.ok) {
    SoundEngine.playSuccess();
    showMsg("rmsg", true, `Instant enrollment complete: ${randomName} enrolled with ₹50 bonus!`);
    showToast("Commuter Enrolled", `${randomName} enrolled successfully!`, "success");
    await loadDemoProfiles();
  } else {
    showMsg("rmsg", false, res.msg);
    SoundEngine.playError();
  }
}

// --- 9. Live Gate Entry / Exit Simulator ---
async function performGateScan() {
  SoundEngine.playScan();
  Gate3D.setScanning();

  const stationId = +$("gs").value;
  if (!stationId) {
    Gate3D.setDenied("SELECT STATION");
    showMsg("gmsg", false, "Please choose a transit station.");
    SoundEngine.playError();
    return;
  }

  const descriptor = await getDescriptor();
  if (!descriptor) {
    Gate3D.setDenied("NO FACE DETECTED");
    showMsg("gmsg", false, "No biometric face detected. Align with reticle or pick a test commuter.");
    SoundEngine.playError();
    return;
  }

  try {
    const res = await api("/api/gate", "POST", { station_id: stationId, descriptor });
    
    if (res.ok) {
      SoundEngine.playSuccess();
      const passenger = res.user?.name || "Passenger";
      const fareVal = res.fare ?? 0;
      
      if (res.action === 'EMERGENCY_OPEN') {
        Gate3D.setEmergencyOpen();
      } else {
        Gate3D.setOpen(res.action, passenger, fareVal);
      }

      renderTicketReceipt(res);
      showMsg("gmsg", true, `<b>${res.action}:</b> ${res.msg}`);
      showToast(res.action === 'ENTRY' ? "Gate Entry Authorized" : "Exit Completed", res.msg, "success");
      await loadDemoProfiles();
    } else {
      SoundEngine.playError();
      Gate3D.setDenied(res.msg);
      showMsg("gmsg", false, res.msg);
      showToast("Access Denied", res.msg, "error");
      hideTicketReceipt();
    }
  } catch (err) {
    Gate3D.setDenied("COMMUNICATION ERROR");
    showMsg("gmsg", false, "Network error contacting transit gate controller.");
    SoundEngine.playError();
  }
}

function renderTicketReceipt(data) {
  const container = $("ticket-receipt-slot");
  if (!container) return;

  const now = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const isEntry = data.action === 'ENTRY';
  const badgeColor = isEntry ? '#38bdf8' : '#34d399';

  container.innerHTML = `
    <div class="ticket-receipt-card">
      <div class="ticket-header">
        <div>
          <span style="font-family:var(--font-mono); font-size:0.75rem; color:${badgeColor}; font-weight:700;">
            ● BIOTRANSIT DIGITAL PASS
          </span>
          <div style="font-family:var(--font-display); font-size:1.15rem; font-weight:800; color:#fff;">
            ${data.user?.name || 'Verified Passenger'}
          </div>
        </div>
        <div style="text-align:right;">
          <span class="status-badge ${isEntry ? 'open' : 'closed'}">${data.action}</span>
          <div style="font-family:var(--font-mono); font-size:0.75rem; color:var(--text-dim); margin-top:3px;">${now}</div>
        </div>
      </div>
      <div class="ticket-grid">
        <div class="ticket-field">
          <small>Transit Mode</small>
          <div>Biometric NFC</div>
        </div>
        <div class="ticket-field">
          <small>Transaction Fare</small>
          <div style="color:${isEntry ? '#94a3b8' : '#34d399'};">
            ${isEntry ? 'Hold (₹ 0)' : '₹ ' + (data.fare ?? 0)}
          </div>
        </div>
        <div class="ticket-field">
          <small>Wallet Balance</small>
          <div>₹ ${data.user?.balance ?? 0}</div>
        </div>
      </div>
    </div>
  `;
}

function hideTicketReceipt() {
  const container = $("ticket-receipt-slot");
  if (container) container.innerHTML = "";
}

function setupAutoScan() {
  const toggle = $("auto-scan-toggle");
  if (!toggle) return;
  toggle.onchange = e => {
    clearInterval(autoScanTimer);
    if (e.target.checked) {
      performGateScan();
      autoScanTimer = setInterval(performGateScan, 4200);
      showToast("Auto-Scan", "Turnstile auto-scan engaged (every 4.2s)", "info");
    }
  };
}

// --- 10. My Biometric Account & Holographic Passport ---
async function identifyUser() {
  SoundEngine.playScan();
  showMsg("profile-msg", true, "Scanning biometric facial descriptor...");

  const descriptor = await getDescriptor();
  if (!descriptor) {
    showMsg("profile-msg", false, "No face detected. Align with viewfinder or pick a test profile.");
    SoundEngine.playError();
    return;
  }

  const res = await api("/api/identify", "POST", { descriptor });
  handleIdentifyResponse(res);
}

async function loginSelectedDemoProfile() {
  SoundEngine.playClick();
  const select = $("me-sim-profile-select");
  const val = select ? select.value : '';
  if (!val || !val.startsWith("user_")) {
    showToast("Profile Selection", "Please pick a registered test commuter from the dropdown.", "warning");
    return;
  }
  const uid = parseInt(val.replace("user_", ""), 10);
  const res = await api("/api/identify", "POST", { user_id: uid });
  handleIdentifyResponse(res);
}

function handleIdentifyResponse(res) {
  if (!res.ok) {
    showMsg("profile-msg", false, res.msg);
    SoundEngine.playError();
    return;
  }

  SoundEngine.playSuccess();
  activeUserId = res.user.id;
  updateAccountCard(res.user);
  $("account-details-panel").classList.remove("hide");

  // Update Attendance Compliance Card
  if (res.attendance_stats) {
    const s = res.attendance_stats;
    const badge = $("my-att-rate-badge");
    const daysText = $("my-att-days-text");
    const bar = $("my-att-progress-bar");
    const checkins = $("my-att-checkins-count");

    if (badge) badge.textContent = `${s.percentage}% COMPLIANCE`;
    if (daysText) daysText.textContent = `${s.days_present} / ${s.total_days} Operational Days`;
    if (bar) bar.style.width = `${Math.min(100, s.percentage)}%`;
    if (checkins) checkins.textContent = res.attendance ? res.attendance.length : 0;
  }

  renderTable("tj", res.journeys.map(j => ({
    entry: j.entry_name,
    exit: j.exit_name,
    entry_time: j.entry_time,
    exit_time: j.exit_time,
    fare: j.fare,
    status: j.status
  })));

  renderTable("tt", res.transactions.map(t => ({
    amount: t.amount,
    type: t.kind,
    note: t.note,
    time: t.time
  })));

  showMsg("profile-msg", true, `Identity authenticated: Welcome, ${res.user.name}!`);
  showToast("Identity Verified", `Welcome back, ${res.user.name}`, "success");
}

function updateAccountCard(user) {
  $("holo-card-name").textContent = user.name;
  $("holo-card-id").textContent = `ID: BIO-${String(user.id).padStart(4, '0')}-PUN`;
  $("holo-card-balance").textContent = `₹ ${user.balance.toFixed(2)}`;

  const passBadge = $("holo-card-pass");
  if (user.has_pass) {
    const expStr = user.pass_expiry ? user.pass_expiry.split('T')[0] : 'ACTIVE';
    passBadge.textContent = `PASS ACTIVE (EXP: ${expStr})`;
    passBadge.className = 'holo-pass-badge active';
  } else {
    passBadge.textContent = 'STANDARD PAY-AS-YOU-GO';
    passBadge.className = 'holo-pass-badge';
  }
}

async function topupBalance(amount) {
  if (!activeUserId) {
    showToast("Authentication Required", "Please authenticate your face or select a commuter first.", "warning");
    return;
  }
  SoundEngine.playClick();
  const res = await api("/api/topup", "POST", { user_id: activeUserId, amount });
  if (res.ok) {
    SoundEngine.playSuccess();
    updateAccountCard(res.user);
    showToast("Recharge Successful", `₹${amount} added to transit wallet!`, "success");
    await loadDemoProfiles();
  } else {
    SoundEngine.playError();
    showToast("Top-Up Failed", res.msg, "error");
  }
}

async function topupCustomBalance() {
  const amtInput = $("custom-topup-amt");
  const amt = parseFloat(amtInput?.value || 0);
  if (!amt || amt <= 0) {
    showToast("Invalid Amount", "Please enter a valid positive amount.", "warning");
    return;
  }
  await topupBalance(amt);
  if (amtInput) amtInput.value = "";
}

async function buyPassPlan(plan) {
  if (!activeUserId) {
    showToast("Authentication Required", "Please authenticate your face first.", "warning");
    return;
  }
  SoundEngine.playClick();
  const res = await api("/api/pass", "POST", { user_id: activeUserId, plan });
  if (res.ok) {
    SoundEngine.playSuccess();
    updateAccountCard(res.user);
    showToast("Pass Activated", `Unlimited ${plan.toUpperCase()} pass activated!`, "success");
    await loadDemoProfiles();
  } else {
    SoundEngine.playError();
    showToast("Purchase Failed", res.msg, "error");
  }
}

function setupCardPerspectiveTilt() {
  const card = document.querySelector('.holo-smart-card');
  const glare = document.querySelector('.holo-glare-effect');
  if (!card) return;

  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    const rotX = -((y - cy) / cy) * 14;
    const rotY = ((x - cx) / cx) * 14;

    card.style.transform = `perspective(1000px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.02, 1.02, 1.02)`;

    if (glare) {
      const glX = (x / rect.width) * 100;
      const glY = (y / rect.height) * 100;
      glare.style.background = `radial-gradient(circle at ${glX}% ${glY}%, rgba(255, 255, 255, 0.35) 0%, transparent 65%)`;
    }
  });

  card.addEventListener('mouseleave', () => {
    card.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  });
}

// --- 11. Security & Admin Command Center ---

async function loadAdminDashboard() {
  SoundEngine.playClick();
  const keyInput = $("admin-key-input");
  const key = keyInput ? keyInput.value.trim() : "";

  if (!key) {
    showToast("Access Key Required", "Please enter the admin key (default: admin123)", "warning");
    return;
  }

  try {
    const res = await api("/api/admin/verify", "POST", {}, { "X-Admin-Key": key });
    if (!res.ok) {
      SoundEngine.playError();
      showToast("Access Denied", res.msg || "Invalid Admin Key. Default is: admin123", "error");
      return;
    }

    // Persist key in sessionStorage
    sessionStorage.setItem('biotransit_admin_key', key);
    SoundEngine.playSuccess();
    showToast("Command Console Authorized", "Welcome, Transit System Administrator", "success");

    // Reveal dashboard
    $("admin-auth-gate")?.classList.add("hide");
    $("admin-dashboard-panel")?.classList.remove("hide");

    // Load initial sub-tab
    switchAdminTab("overview");
  } catch (err) {
    SoundEngine.playError();
    showToast("Auth Error", "Could not contact admin security service.", "error");
  }
}

function logoutAdmin() {
  SoundEngine.playClick();
  sessionStorage.removeItem('biotransit_admin_key');
  $("admin-dashboard-panel")?.classList.add("hide");
  $("admin-auth-gate")?.classList.remove("hide");
  showToast("Admin Locked", "Command center console locked successfully.", "info");
}

function switchAdminTab(subTabName) {
  currentAdminSubTab = subTabName;

  document.querySelectorAll(".admin-subnav-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.sub === subTabName);
  });

  document.querySelectorAll(".admin-sub-pane").forEach(pane => {
    pane.classList.add("hide");
  });

  $(`sub-${subTabName}`)?.classList.remove("hide");

  if (subTabName === 'overview') loadAdminOverview();
  else if (subTabName === 'commuters') loadAdminCommuters();
  else if (subTabName === 'stations') loadAdminStations();
  else if (subTabName === 'journeys') loadAdminJourneys();
  else if (subTabName === 'security') loadAdminAlerts();
  else if (subTabName === 'config') loadAdminConfig();
}

// Sub-Tab 1: Overview & Telemetry
async function loadAdminOverview() {
  try {
    const res = await api("/api/admin/overview", "GET", null, getAdminHeaders());
    if (!res.ok) return;

    const st = res.stats || {};
    $("adm-users-val").textContent = st.users ?? 0;
    $("adm-journeys-val").textContent = st.journeys ?? 0;
    $("adm-open-journeys-val").textContent = `${st.open_journeys ?? 0} In-Transit`;
    
    const totalRev = (st.fare_revenue ?? 0) + (st.total_topups ?? 0) + (st.pass_revenue ?? 0);
    $("adm-rev-val").textContent = `₹ ${totalRev.toFixed(2)}`;
    $("adm-rev-breakdown-val").textContent = `Fares: ₹${st.fare_revenue ?? 0} | Topups: ₹${st.total_topups ?? 0}`;

    $("adm-alerts-val").textContent = st.active_alerts ?? 0;
    $("adm-active-alerts-val").textContent = `${st.active_alerts ?? 0} Unacknowledged`;
    $("admin-alerts-counter").textContent = st.active_alerts ?? 0;

    // Update Gate Override UI State
    updateGateOverrideButtons(res.gate_override);

    // Render Mode Distribution Progress Bars
    renderModeDistribution(res.modes || []);

    // Render Busiest Stations Table
    renderBusiestStations(res.busiest || []);
  } catch (err) {
    console.error("Overview loading error:", err);
  }
}

function updateGateOverrideButtons(mode) {
  const badge = $("gate-override-status-badge");
  const banner = $("gate-status-banner");
  const bannerText = $("gate-status-banner-text");

  ['normal', 'emergency', 'lockdown'].forEach(m => {
    $(`btn-override-${m}`)?.classList.remove('active');
  });

  if (mode === 'emergency_open') {
    $("btn-override-emergency")?.classList.add('active');
    if (badge) { badge.className = 'status-badge alert'; badge.textContent = 'MODE: EMERGENCY EVACUATION'; }
    if (banner) {
      banner.className = 'gate-status-banner emergency';
      if (bannerText) bannerText.textContent = '🚨 EMERGENCY EVACUATION ACTIVE · ALL TURNSTILES FREE PASSAGE';
    }
    Gate3D.setEmergencyOpen();
  } else if (mode === 'lockdown') {
    $("btn-override-lockdown")?.classList.add('active');
    if (badge) { badge.className = 'status-badge alert'; badge.textContent = 'MODE: SECURITY LOCKDOWN'; }
    if (banner) {
      banner.className = 'gate-status-banner lockdown';
      if (bannerText) bannerText.textContent = '🔒 SECURITY LOCKDOWN IN EFFECT · ALL TURNSTILES CLOSED';
    }
    Gate3D.setLockdown();
  } else {
    $("btn-override-normal")?.classList.add('active');
    if (badge) { badge.className = 'status-badge open'; badge.textContent = 'MODE: NORMAL AI'; }
    if (banner) {
      banner.className = 'gate-status-banner normal';
      if (bannerText) bannerText.textContent = '● CENTRAL TRANSIT CORE ONLINE · STANDARD BIOMETRIC ACCESS PROTOCOL';
    }
    Gate3D.setIdle();
  }
}

async function setGateOverrideMode(mode) {
  SoundEngine.playClick();
  const res = await api("/api/admin/gate-override", "POST", { mode }, getAdminHeaders());
  if (res.ok) {
    showToast("Gate Protocol Overridden", res.msg, mode === 'normal' ? 'success' : 'warning');
    updateGateOverrideButtons(mode);
  } else {
    showToast("Override Failed", res.msg, "error");
  }
}

function renderModeDistribution(modes) {
  const container = $("mode-distribution-container");
  if (!container) return;

  const total = modes.reduce((acc, m) => acc + (m.journeys || 0), 0) || 1;

  container.innerHTML = modes.map(m => {
    const pct = Math.round(((m.journeys || 0) / total) * 100);
    const cls = m.mode.toLowerCase().includes('bus') ? 'bus' : (m.mode.toLowerCase().includes('train') ? 'train' : 'metro');
    return `
      <div class="mode-stat-row">
        <div class="mode-stat-labels">
          <span><b>${m.mode}</b> (${m.journeys} trips)</span>
          <span>₹${(m.revenue || 0).toFixed(2)} (${pct}%)</span>
        </div>
        <div class="mode-progress-track">
          <div class="mode-progress-fill ${cls}" style="width: ${pct}%"></div>
        </div>
      </div>
    `;
  }).join('') || '<div style="color:var(--text-dim); padding:1rem; text-align:center;">No journey telemetry yet</div>';
}

function renderBusiestStations(busiest) {
  const table = $("table-busiest-stations");
  if (!table) return;

  if (!busiest.length) {
    table.innerHTML = `<tr><td style="color:var(--text-dim); text-align:center; padding:1rem;">No station traffic data</td></tr>`;
    return;
  }

  table.innerHTML = `
    <tr>
      <th>Hub Name</th>
      <th>Mode</th>
      <th>Zone</th>
      <th>Passenger Trips</th>
    </tr>
    ${busiest.map(s => `
      <tr>
        <td><b>${s.name}</b></td>
        <td><span class="station-mode-tag ${s.mode.toLowerCase()}">${s.mode}</span></td>
        <td>Zone ${s.zone}</td>
        <td><span style="font-family:var(--font-mono); color:var(--cyan-bright); font-weight:700;">${s.traffic}</span></td>
      </tr>
    `).join('')}
  `;
}

// Sub-Tab 2: Commuters Directory
async function loadAdminCommuters() {
  try {
    cachedAdminUsers = await api("/api/admin/users", "GET", null, getAdminHeaders());
    renderCommutersTable(cachedAdminUsers);
  } catch (err) {
    console.error("Commuters loading error:", err);
  }
}

function renderCommutersTable(users) {
  const table = $("tu");
  if (!table) return;

  if (!users.length) {
    table.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-dim);">No commuters found</td></tr>`;
    return;
  }

  table.innerHTML = `
    <tr>
      <th>Commuter</th>
      <th>Contact Info</th>
      <th>Category</th>
      <th>Wallet Balance</th>
      <th>Pass Status</th>
      <th>Journeys</th>
      <th style="text-align:right;">Actions</th>
    </tr>
    ${users.map(u => {
      const hasPassActive = u.pass_expiry && u.pass_expiry > new Date().toISOString();
      const passTag = hasPassActive
        ? `<span class="status-badge open">PASS (EXP: ${u.pass_expiry.split('T')[0]})</span>`
        : `<span class="status-badge closed">PAY-AS-YOU-GO</span>`;

      return `
        <tr>
          <td>
            <div style="font-weight:700; color:#fff;">${u.name}</div>
            <div style="font-size:0.75rem; font-family:var(--font-mono); color:var(--text-dim);">ID: BIO-${String(u.id).padStart(4,'0')}</div>
          </td>
          <td>
            <div>${u.email}</div>
            <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">${u.phone || 'N/A'}</div>
          </td>
          <td><span class="brand-badge">${u.kind.toUpperCase()}</span></td>
          <td><b style="color:${u.balance >= 10 ? 'var(--emerald-glow)' : '#f87171'};">₹ ${Number(u.balance).toFixed(2)}</b></td>
          <td>${passTag}</td>
          <td><span style="font-family:var(--font-mono);">${u.journey_count || 0} trips</span></td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:0.35rem;">
              <button class="btn-table-action success" onclick="openAdjustBalanceModal(${u.id}, '${u.name}', ${u.balance})" title="Top-up Balance">💳 + / -</button>
              <button class="btn-table-action" onclick="openGrantPassModal(${u.id}, '${u.name}')" title="Issue Pass">🎫 Pass</button>
              <button class="btn-table-action" onclick="openEditUserModal(${u.id})" title="Edit Profile">✏️</button>
              <button class="btn-table-action danger" onclick="confirmDeleteUser(${u.id}, '${u.name}')" title="Delete Commuter">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('')}
  `;
}

function filterCommutersTable() {
  const query = $("commuter-search-input")?.value.toLowerCase().trim() || "";
  const filtered = cachedAdminUsers.filter(u => 
    u.name.toLowerCase().includes(query) ||
    u.email.toLowerCase().includes(query) ||
    String(u.id).includes(query)
  );
  renderCommutersTable(filtered);
}

function filterCommutersCategory(cat, el) {
  document.querySelectorAll("#sub-commuters .filter-pill").forEach(p => p.classList.remove("active"));
  if (el) el.classList.add("active");

  if (cat === 'all') {
    renderCommutersTable(cachedAdminUsers);
  } else {
    renderCommutersTable(cachedAdminUsers.filter(u => u.kind.toLowerCase() === cat.toLowerCase()));
  }
}

// User Action Modals
function openAdjustBalanceModal(uid, name, curBal) {
  openModal({
    title: `💳 Adjust Wallet: ${name}`,
    bodyHtml: `
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">Current Balance: <b style="color:var(--emerald-glow);">₹ ${curBal.toFixed(2)}</b></p>
      <div class="input-group">
        <label class="input-label">Adjustment Amount (₹) - Positive to add, negative to deduct</label>
        <input id="modal-adj-amt" type="number" step="10" class="cyber-input" placeholder="e.g. 200 or -50" value="200">
      </div>
      <div class="input-group">
        <label class="input-label">Reason / Reference Note</label>
        <input id="modal-adj-note" class="cyber-input" value="Admin customer service adjustment">
      </div>
    `,
    confirmText: 'Apply Adjustment',
    onConfirm: async () => {
      const amt = parseFloat($("modal-adj-amt").value);
      const note = $("modal-adj-note").value;
      const res = await api(`/api/admin/user/${uid}/balance`, "POST", { amount: amt, note }, getAdminHeaders());
      if (res.ok) {
        showToast("Balance Updated", res.msg, "success");
        closeModal();
        await loadAdminCommuters();
        await loadDemoProfiles();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

function openGrantPassModal(uid, name) {
  openModal({
    title: `🎫 Grant Transit Pass: ${name}`,
    bodyHtml: `
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">Select unlimited pass duration for commuter:</p>
      <div class="input-group">
        <label class="input-label">Pass Duration Plan</label>
        <select id="modal-pass-days" class="cyber-select">
          <option value="1">1-Day Explorer Pass (24 Hours)</option>
          <option value="3">3-Day City Traveler Pass (72 Hours)</option>
          <option value="7" selected>7-Day Mega Commuter Pass (1 Week)</option>
          <option value="30">30-Day VIP Pass (1 Month)</option>
        </select>
      </div>
    `,
    confirmText: 'Grant Pass Now',
    onConfirm: async () => {
      const days = +$("modal-pass-days").value;
      const res = await api(`/api/admin/user/${uid}/pass`, "POST", { days }, getAdminHeaders());
      if (res.ok) {
        showToast("Pass Issued", res.msg, "success");
        closeModal();
        await loadAdminCommuters();
        await loadDemoProfiles();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

function openEditUserModal(uid) {
  const u = cachedAdminUsers.find(x => x.id === uid);
  if (!u) return;

  openModal({
    title: `✏️ Edit Profile: ${u.name}`,
    bodyHtml: `
      <div class="input-group">
        <label class="input-label">Full Legal Name</label>
        <input id="edit-uname" class="cyber-input" value="${u.name}">
      </div>
      <div class="input-group">
        <label class="input-label">Email Address</label>
        <input id="edit-uemail" type="email" class="cyber-input" value="${u.email}">
      </div>
      <div class="input-group">
        <label class="input-label">Phone Number</label>
        <input id="edit-uphone" class="cyber-input" value="${u.phone || ''}">
      </div>
      <div class="input-group">
        <label class="input-label">Passenger Category</label>
        <select id="edit-ukind" class="cyber-select">
          <option value="resident" ${u.kind==='resident'?'selected':''}>Daily Resident Commuter</option>
          <option value="tourist" ${u.kind==='tourist'?'selected':''}>Tourist / Short-Term Visitor</option>
        </select>
      </div>
    `,
    confirmText: 'Save Changes',
    onConfirm: async () => {
      const name = $("edit-uname").value.trim();
      const email = $("edit-uemail").value.trim();
      const phone = $("edit-uphone").value.trim();
      const kind = $("edit-ukind").value;
      const res = await api(`/api/admin/user/${uid}`, "PUT", { name, email, phone, kind }, getAdminHeaders());
      if (res.ok) {
        showToast("Profile Updated", res.msg, "success");
        closeModal();
        await loadAdminCommuters();
        await loadDemoProfiles();
      } else {
        showToast("Update Failed", res.msg, "error");
      }
    }
  });
}

function confirmDeleteUser(uid, name) {
  openModal({
    title: `🗑️ Delete Commuter: ${name}`,
    bodyHtml: `
      <p style="color:#f87171; font-size:0.9rem; line-height:1.5;">
        ⚠️ Are you sure you want to completely deregister and remove <b>${name}</b> from the biometric transit system?
      </p>
      <p style="font-size:0.8rem; color:var(--text-dim); margin-top:0.5rem;">
        This will permanently purge their wallet, journey history, and biometric embeddings.
      </p>
    `,
    confirmText: 'Delete Permanently',
    onConfirm: async () => {
      const res = await api(`/api/admin/user/${uid}`, "DELETE", null, getAdminHeaders());
      if (res.ok) {
        showToast("Commuter Deleted", res.msg, "info");
        closeModal();
        await loadAdminCommuters();
        await loadDemoProfiles();
      } else {
        showToast("Delete Failed", res.msg, "error");
      }
    }
  });
}

// Sub-Tab 3: Transit Grid Stations
async function loadAdminStations() {
  await loadStations();
  renderAdminStationGrid();
}

function renderAdminStationGrid() {
  const container = $("station-admin-grid");
  if (!container) return;

  container.innerHTML = registeredStations.map(s => {
    let modeCls = 'metro';
    let icon = '🚇';
    const m = s.mode.toLowerCase();
    if (m.includes('bus')) { modeCls = 'bus'; icon = '🚌'; }
    else if (m.includes('train')) { modeCls = 'train'; icon = '🚆'; }
    else if (m.includes('hyper')) { modeCls = 'train'; icon = '⚡'; }

    return `
      <div class="station-admin-card">
        <div class="station-card-top">
          <span class="station-mode-tag ${modeCls}">${icon} ${s.mode}</span>
          <span class="brand-badge" style="font-size:0.75rem;">Zone ${s.zone}</span>
        </div>
        <h4>${s.name}</h4>
        <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">
          Station ID: #0${s.id}
        </div>
        <div class="station-traffic-row">
          <div style="display:flex; gap:0.35rem;">
            <button class="btn-table-action" onclick="openEditStationModal(${s.id}, '${s.name}', '${s.mode}', ${s.zone})">✏️ Edit</button>
            <button class="btn-table-action danger" onclick="confirmDeleteStation(${s.id}, '${s.name}')">🗑️ Delete</button>
          </div>
          <button class="btn-table-action" onclick="$('gs').value='${s.id}'; switchTab('gate');">Set Gate</button>
        </div>
      </div>
    `;
  }).join('');
}

function openAddStationModal() {
  openModal({
    title: '➕ Add New Transit Station to Grid',
    bodyHtml: `
      <div class="input-group">
        <label class="input-label">Station Name</label>
        <input id="add-st-name" class="cyber-input" placeholder="e.g. Aundh Road, Kothrud Depot">
      </div>
      <div class="input-group">
        <label class="input-label">Transit Mode</label>
        <select id="add-st-mode" class="cyber-select">
          <option>Metro</option>
          <option>Bus</option>
          <option>Train</option>
          <option>Hyperloop</option>
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Zone Index Number (Fare Calculation)</label>
        <input id="add-st-zone" type="number" min="1" max="20" class="cyber-input" value="4">
      </div>
    `,
    confirmText: 'Add Station',
    onConfirm: async () => {
      const name = $("add-st-name").value.trim();
      const mode = $("add-st-mode").value;
      const zone = +$("add-st-zone").value;
      if (!name) {
        showToast("Missing Name", "Please specify station name.", "warning");
        return;
      }
      const res = await api("/api/admin/station", "POST", { name, mode, zone }, getAdminHeaders());
      if (res.ok) {
        showToast("Station Added", res.msg, "success");
        closeModal();
        await loadAdminStations();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

function openEditStationModal(sid, curName, curMode, curZone) {
  openModal({
    title: `✏️ Edit Station: ${curName}`,
    bodyHtml: `
      <div class="input-group">
        <label class="input-label">Station Name</label>
        <input id="edit-st-name" class="cyber-input" value="${curName}">
      </div>
      <div class="input-group">
        <label class="input-label">Transit Mode</label>
        <select id="edit-st-mode" class="cyber-select">
          <option ${curMode==='Metro'?'selected':''}>Metro</option>
          <option ${curMode==='Bus'?'selected':''}>Bus</option>
          <option ${curMode==='Train'?'selected':''}>Train</option>
          <option ${curMode==='Hyperloop'?'selected':''}>Hyperloop</option>
        </select>
      </div>
      <div class="input-group">
        <label class="input-label">Zone Index Number</label>
        <input id="edit-st-zone" type="number" min="1" max="20" class="cyber-input" value="${curZone}">
      </div>
    `,
    confirmText: 'Save Station',
    onConfirm: async () => {
      const name = $("edit-st-name").value.trim();
      const mode = $("edit-st-mode").value;
      const zone = +$("edit-st-zone").value;
      const res = await api(`/api/admin/station/${sid}`, "PUT", { name, mode, zone }, getAdminHeaders());
      if (res.ok) {
        showToast("Station Updated", res.msg, "success");
        closeModal();
        await loadAdminStations();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

function confirmDeleteStation(sid, name) {
  openModal({
    title: `🗑️ Remove Station: ${name}`,
    bodyHtml: `
      <p style="color:#f87171; font-size:0.9rem;">
        Are you sure you want to remove <b>${name}</b> from the active transit network?
      </p>
    `,
    confirmText: 'Remove Station',
    onConfirm: async () => {
      const res = await api(`/api/admin/station/${sid}`, "DELETE", null, getAdminHeaders());
      if (res.ok) {
        showToast("Station Removed", res.msg, "info");
        closeModal();
        await loadAdminStations();
      } else {
        showToast("Cannot Delete", res.msg, "error");
      }
    }
  });
}

// Sub-Tab 4: Journeys Ledger
async function loadAdminJourneys() {
  try {
    cachedAdminJourneys = await api("/api/admin/journeys", "GET", null, getAdminHeaders());
    renderJourneysTable(cachedAdminJourneys);
  } catch (err) {
    console.error("Journeys loading error:", err);
  }
}

function renderJourneysTable(journeys) {
  const table = $("tjj");
  if (!table) return;

  if (!journeys.length) {
    table.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:var(--text-dim);">No journey records found</td></tr>`;
    return;
  }

  table.innerHTML = `
    <tr>
      <th>Journey ID</th>
      <th>Commuter</th>
      <th>Entry Details</th>
      <th>Exit Details</th>
      <th>Transit Fare</th>
      <th>Status</th>
      <th style="text-align:right;">Actions</th>
    </tr>
    ${journeys.map(j => {
      const isOpen = j.status === 'open';
      const statusBadge = isOpen
        ? `<span class="status-badge open">IN-TRANSIT</span>`
        : `<span class="status-badge closed">COMPLETED</span>`;

      return `
        <tr>
          <td><span style="font-family:var(--font-mono); color:var(--text-dim);">#J-${j.id}</span></td>
          <td><b>${j.name}</b></td>
          <td>
            <div style="color:var(--cyan-bright); font-weight:600;">${j.entry_name || 'Origin Gate'}</div>
            <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">${j.entry_time || 'N/A'}</div>
          </td>
          <td>
            <div style="color:${isOpen ? 'var(--amber-warning)' : 'var(--emerald-glow)'}; font-weight:600;">
              ${isOpen ? '● Travelling...' : (j.exit_name || 'Destination Gate')}
            </div>
            <div style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">${j.exit_time || '-'}</div>
          </td>
          <td><b style="font-family:var(--font-mono);">${j.fare != null ? '₹ ' + Number(j.fare).toFixed(2) : 'Pending'}</b></td>
          <td>${statusBadge}</td>
          <td style="text-align:right;">
            <div style="display:inline-flex; gap:0.35rem;">
              ${isOpen ? `<button class="btn-table-action success" onclick="openForceCloseJourneyModal(${j.id}, '${j.name}', ${j.entry_station})" title="Force Settle & Close Journey">⚠️ Settle</button>` : ''}
              <button class="btn-table-action danger" onclick="confirmDeleteJourney(${j.id})" title="Delete Record">🗑️</button>
            </div>
          </td>
        </tr>
      `;
    }).join('')}
  `;
}

function filterJourneysTable() {
  const query = $("journey-search-input")?.value.toLowerCase().trim() || "";
  const filtered = cachedAdminJourneys.filter(j =>
    (j.name || '').toLowerCase().includes(query) ||
    (j.entry_name || '').toLowerCase().includes(query) ||
    (j.exit_name || '').toLowerCase().includes(query) ||
    String(j.id).includes(query)
  );
  renderJourneysTable(filtered);
}

function filterJourneysStatus(status, el) {
  document.querySelectorAll("#sub-journeys .filter-pill").forEach(p => p.classList.remove("active"));
  if (el) el.classList.add("active");

  if (status === 'all') {
    renderJourneysTable(cachedAdminJourneys);
  } else {
    renderJourneysTable(cachedAdminJourneys.filter(j => j.status === status));
  }
}

function openForceCloseJourneyModal(jid, commuterName, entryStationId) {
  const stOptions = registeredStations.map(s => 
    `<option value="${s.id}" ${s.id===entryStationId?'selected':''}>${s.name} (${s.mode} · Zone ${s.zone})</option>`
  ).join('');

  openModal({
    title: `⚠️ Settle Journey: #${jid} (${commuterName})`,
    bodyHtml: `
      <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:1rem;">
        Commuter entered transit but did not scan exit turnstile. Settle this trip to clear in-transit lock:
      </p>
      <div class="input-group">
        <label class="input-label">Destination Station for Settlement</label>
        <select id="force-exit-station" class="cyber-select">${stOptions}</select>
      </div>
      <div class="input-group">
        <label class="input-label">Settlement Fare (₹) [0 for Pass or Waived]</label>
        <input id="force-fare" type="number" class="cyber-input" value="15">
      </div>
    `,
    confirmText: 'Settle & Close Journey',
    onConfirm: async () => {
      const exitId = +$("force-exit-station").value;
      const fare = parseFloat($("force-fare").value) || 0;
      const res = await api(`/api/admin/journey/${jid}/force-close`, "POST", { exit_station_id: exitId, fare }, getAdminHeaders());
      if (res.ok) {
        showToast("Journey Settled", res.msg, "success");
        closeModal();
        await loadAdminJourneys();
        await loadAdminOverview();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

function confirmDeleteJourney(jid) {
  openModal({
    title: `🗑️ Delete Journey #${jid}`,
    bodyHtml: `<p style="color:#f87171;">Delete this transit journey record from ledger?</p>`,
    confirmText: 'Delete Record',
    onConfirm: async () => {
      const res = await api(`/api/admin/journey/${jid}`, "DELETE", null, getAdminHeaders());
      if (res.ok) {
        showToast("Record Purged", res.msg, "info");
        closeModal();
        await loadAdminJourneys();
      } else {
        showToast("Error", res.msg, "error");
      }
    }
  });
}

// Sub-Tab 5: Anti-Fraud & Security Telemetry
async function loadAdminAlerts() {
  try {
    const alerts = await api("/api/admin/alerts", "GET", null, getAdminHeaders());
    const table = $("ta");
    if (!table) return;

    $("admin-alerts-counter").textContent = alerts.filter(a => !a.resolved).length;

    if (!alerts.length) {
      table.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:1.5rem; color:var(--emerald-glow);">✓ Zero security anomalies detected. System running smoothly.</td></tr>`;
      return;
    }

    table.innerHTML = `
      <tr>
        <th>Alert ID</th>
        <th>Timestamp</th>
        <th>Commuter</th>
        <th>Anomaly Description</th>
        <th>Status</th>
        <th style="text-align:right;">Action</th>
      </tr>
      ${alerts.map(a => {
        const isResolved = a.resolved;
        const statusBadge = isResolved
          ? `<span class="status-badge closed">RESOLVED</span>`
          : `<span class="status-badge alert">ACTIVE ANOMALY</span>`;

        return `
          <tr>
            <td><span style="font-family:var(--font-mono); color:var(--text-dim);">#A-${a.id}</span></td>
            <td><span style="font-family:var(--font-mono); font-size:0.75rem;">${a.time}</span></td>
            <td><b>${a.commuter_name || 'Anonymous / Unknown'}</b></td>
            <td style="color:#f87171;">${a.message}</td>
            <td>${statusBadge}</td>
            <td style="text-align:right;">
              ${!isResolved ? `<button class="btn-table-action success" onclick="resolveAlertAction(${a.id})">✓ Acknowledge</button>` : `<span style="font-size:0.75rem; color:var(--text-dim);">Cleared</span>`}
            </td>
          </tr>
        `;
      }).join('')}
    `;
  } catch (err) {
    console.error("Alerts error:", err);
  }
}

async function resolveAlertAction(aid) {
  SoundEngine.playClick();
  const res = await api(`/api/admin/alert/${aid}/resolve`, "POST", {}, getAdminHeaders());
  if (res.ok) {
    showToast("Alert Resolved", res.msg, "success");
    await loadAdminAlerts();
    await loadAdminOverview();
  }
}

async function clearAllAlertsAction() {
  SoundEngine.playClick();
  const res = await api("/api/admin/alerts/clear", "POST", {}, getAdminHeaders());
  if (res.ok) {
    showToast("Alerts Cleared", "All security incidents acknowledged.", "success");
    await loadAdminAlerts();
    await loadAdminOverview();
  }
}

// Sub-Tab 6: Fare Matrix & System Config
async function loadAdminConfig() {
  try {
    const res = await api("/api/admin/config", "GET", null, getAdminHeaders());
    if (!res.ok) return;

    const cfg = res.config || {};
    if ($("cfg-base-fare")) $("cfg-base-fare").value = cfg.base_fare ?? 10;
    if ($("cfg-per-zone")) $("cfg-per-zone").value = cfg.per_zone_fare ?? 5;
    if ($("cfg-min-balance")) $("cfg-min-balance").value = cfg.min_balance ?? 10;
    if ($("cfg-antipassback")) $("cfg-antipassback").value = cfg.anti_passback_sec ?? 20;
  } catch (err) {
    console.error("Config load error:", err);
  }
}

async function saveFareSettingsAction() {
  SoundEngine.playClick();
  const base_fare = parseFloat($("cfg-base-fare").value);
  const per_zone_fare = parseFloat($("cfg-per-zone").value);
  const min_balance = parseFloat($("cfg-min-balance").value);
  const anti_passback_sec = parseInt($("cfg-antipassback").value, 10);

  const res = await api("/api/admin/config", "POST", {
    base_fare,
    per_zone_fare,
    min_balance,
    anti_passback_sec
  }, getAdminHeaders());

  if (res.ok) {
    showToast("Fare Rules Saved", "New pricing matrix dynamically deployed to all turnstiles!", "success");
    updateRouteCalculation();
  } else {
    showToast("Save Error", res.msg, "error");
  }
}

async function changeAdminKeyAction() {
  SoundEngine.playClick();
  const newKey = $("cfg-admin-key")?.value.trim();
  if (!newKey || newKey.length < 4) {
    showToast("Invalid Key", "Secret key must be at least 4 characters.", "warning");
    return;
  }

  const res = await api("/api/admin/config", "POST", { admin_key: newKey }, getAdminHeaders());
  if (res.ok) {
    sessionStorage.setItem('biotransit_admin_key', newKey);
    $("cfg-admin-key").value = "";
    showToast("Secret Key Changed", "New administrator password set successfully.", "success");
  } else {
    showToast("Error", res.msg, "error");
  }
}

async function rechargeAllDemoBalances() {
  SoundEngine.playClick();
  try {
    const users = await api("/api/demo-profiles");
    for (const u of users) {
      await api(`/api/admin/user/${u.id}/balance`, "POST", { amount: 200, note: "Demo preset top-up (+₹200)" }, getAdminHeaders());
    }
    showToast("Demo Wallets Recharged", `Added ₹200 to all ${users.length} commuters!`, "success");
    await loadDemoProfiles();
  } catch (err) {
    showToast("Error", "Could not recharge demo wallets.", "error");
  }
}

// CSV Exports
function exportJourneysCsv() {
  SoundEngine.playClick();
  const key = getStoredAdminKey();
  window.open(`/api/admin/export/journeys?key=${encodeURIComponent(key)}`, '_blank');
  showToast("Export Initiated", "Downloading journeys ledger CSV...", "info");
}

function exportUsersCsv() {
  SoundEngine.playClick();
  const key = getStoredAdminKey();
  window.open(`/api/admin/export/users?key=${encodeURIComponent(key)}`, '_blank');
  showToast("Export Initiated", "Downloading commuter directory CSV...", "info");
}

// General Table Renderer
function renderTable(tableId, rows) {
  const el = $(tableId);
  if (!el) return;
  if (!rows || !rows.length) {
    el.innerHTML = `<tr><td colspan="6" style="text-align:center; padding:1.5rem; color:var(--text-dim);">No transit records found</td></tr>`;
    return;
  }

  const cols = Object.keys(rows[0]);
  const headerHtml = "<tr>" + cols.map(k => `<th>${k.replace(/_/g, ' ')}</th>`).join("") + "</tr>";
  const bodyHtml = rows.map(r => {
    return "<tr>" + cols.map(c => {
      let val = r[c] ?? "";
      if (c === 'status') {
        const badgeCls = val === 'closed' ? 'closed' : (val === 'open' ? 'open' : 'alert');
        return `<td><span class="status-badge ${badgeCls}">${val}</span></td>`;
      }
      if (c === 'fare' || c === 'amount' || c === 'balance') {
        if (typeof val === 'number') val = '₹ ' + val.toFixed(2);
      }
      return `<td>${val}</td>`;
    }).join("") + "</tr>";
  }).join("");

  el.innerHTML = headerHtml + bodyHtml;
}

// --- 12. Navigation Tabs Setup ---
function setupNavigation() {
  document.querySelectorAll("nav.main-nav button").forEach(btn => {
    btn.onclick = () => {
      SoundEngine.playClick();
      const viewId = btn.dataset.v;
      switchTab(viewId);
    };
  });

  const soundBtn = $("sound-toggle-btn");
  if (soundBtn) {
    soundBtn.onclick = () => SoundEngine.toggleMute();
  }

  setupAutoScan();

  $("route-from")?.addEventListener('change', updateRouteCalculation);
  $("route-to")?.addEventListener('change', updateRouteCalculation);
}

function switchTab(viewId) {
  document.querySelectorAll("nav.main-nav button").forEach(b => {
    b.classList.toggle("on", b.dataset.v === viewId);
  });

  document.querySelectorAll(".view-section").forEach(sec => {
    sec.classList.add("hide");
  });

  const targetSec = $(viewId);
  if (targetSec) {
    targetSec.classList.remove("hide");
  }

  if (viewId === 'admin') {
    const key = sessionStorage.getItem('biotransit_admin_key');
    if (key) {
      $("admin-auth-gate")?.classList.add("hide");
      $("admin-dashboard-panel")?.classList.remove("hide");
      switchAdminTab(currentAdminSubTab || "overview");
    } else {
      $("admin-auth-gate")?.classList.remove("hide");
      $("admin-dashboard-panel")?.classList.add("hide");
    }
  }

  if (viewId === 'feedback') {
    loadPublicFeedbackFeed();
  }

  if (["gate", "register", "me"].includes(viewId)) {
    startCameraForView(viewId);
  } else {
    stopCamera();
  }
}

// ==============================================================================
// 12. Public Announcements & Commuter Feedback Controllers
// ==============================================================================

async function loadPublicNotices() {
  try {
    const res = await api("/api/notices");
    const textEl = $("public-announcements-text");
    if (!textEl || !Array.isArray(res) || !res.length) return;

    let index = 0;
    const updateTicker = () => {
      const notice = res[index % res.length];
      const prioEmoji = notice.priority === 'urgent' ? '🚨' : '⚡';
      textEl.innerHTML = `<strong>${prioEmoji} [${escapeHtml(notice.category || 'Advisory')}]:</strong> ${escapeHtml(notice.title)} — <em>${escapeHtml(notice.content)}</em>`;
      index++;
    };
    updateTicker();
    if (res.length > 1) {
      setInterval(updateTicker, 6000);
    }
  } catch (e) {
    console.warn("Failed loading public notices:", e);
  }
}

function setFeedbackRating(val) {
  const container = $("fb-star-container");
  const hiddenInput = $("fb-rating-val");
  if (hiddenInput) hiddenInput.value = val;
  if (!container) return;

  const stars = container.querySelectorAll("span");
  stars.forEach((star, idx) => {
    star.classList.toggle("active", idx < val);
  });
}

async function submitPublicFeedbackForm(e) {
  e.preventDefault();
  const name = $("fb-name").value.trim();
  const email = $("fb-email").value.trim();
  const category = $("fb-category").value;
  const rating = parseInt($("fb-rating-val")?.value || 5, 10);
  const subject = $("fb-subject").value.trim();
  const message = $("fb-message").value.trim();

  const submitBtn = $("btn-submit-fb");
  if (submitBtn) submitBtn.disabled = true;

  try {
    const res = await api("/api/feedback", "POST", { name, email, category, rating, subject, message });
    if (res.ok) {
      SoundEngine.playSuccess();
      showToast("Feedback Transmitted", "Thank you! Your feedback has been received by Central Command.", "success");
      $("fb-subject").value = "";
      $("fb-message").value = "";
      setFeedbackRating(5);
      await loadPublicFeedbackFeed();
    } else {
      SoundEngine.playError();
      showToast("Submission Error", res.msg || "Could not transmit feedback", "error");
    }
  } catch (err) {
    SoundEngine.playError();
    showToast("Network Error", "Failed to connect to transit feedback server", "error");
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
}

async function loadPublicFeedbackFeed() {
  const feed = $("public-feedback-feed");
  if (!feed) return;

  try {
    const res = await api("/api/feedback/recent");
    if (!Array.isArray(res) || !res.length) {
      feed.innerHTML = `<div style="color:var(--text-dim); font-size:0.85rem; text-align:center; padding:1.5rem;">No reviews yet. Be the first commuter to share your experience!</div>`;
      return;
    }

    feed.innerHTML = res.map(fb => {
      const stars = "★".repeat(fb.rating || 5) + "☆".repeat(5 - (fb.rating || 5));
      return `
        <div class="feedback-commuter-card">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:0.35rem;">
            <strong style="color:#fff; font-size:0.92rem;">${escapeHtml(fb.name)}</strong>
            <span style="color:#fbbf24; font-size:0.95rem; letter-spacing:1px;">${stars}</span>
          </div>
          <div style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.4rem;">
            <span class="category-tag resident">${escapeHtml(fb.category || 'General')}</span>
            <span style="font-size:0.75rem; color:var(--text-dim); font-family:var(--font-mono);">${fb.created_at ? fb.created_at.slice(0, 10) : ''}</span>
          </div>
          <div style="font-size:0.86rem; font-weight:600; color:var(--text-main); margin-bottom:0.25rem;">
            ${escapeHtml(fb.subject || '')}
          </div>
          <p style="font-size:0.82rem; color:var(--text-muted); line-height:1.4;">
            "${escapeHtml(fb.message)}"
          </p>
          ${fb.reply ? `
            <div class="feedback-admin-reply-box">
              <strong style="color:var(--cyan-primary); display:block; font-size:0.75rem; text-transform:uppercase; font-family:var(--font-mono); margin-bottom:2px;">
                ● Central Transit Command Response:
              </strong>
              ${escapeHtml(fb.reply)}
            </div>
          ` : ''}
        </div>
      `;
    }).join("");

  } catch (err) {
    console.warn("Failed loading public feedback:", err);
  }
}

// Window load trigger
window.addEventListener('DOMContentLoaded', initApp);
