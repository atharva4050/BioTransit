# BioTransit AI - Unified Biometric Ticketless Mass Transit System

A next-generation, touchless public transit management application featuring real-time **Three.js 3D turnstile simulation**, AI biometric facial recognition, interactive holographic passenger passes, and multi-modal route planning.

---

## ✨ Features & Interface Upgrades

- **🚀 Interactive 3D Turnstile Gate Simulator (Three.js)**:
  - Real-time 3D rendered turnstile with dark metallic bollards and glowing neon cyan walkway guide paths.
  - Motorized acrylic barrier flaps that physically pivot open (75°) on valid biometric entry/exit with laser green LED illumination.
  - Warning red strobe and subtle 3D vibration animation when access is denied.
  - Interactive 3D camera controls: click and drag to orbit and inspect the turnstile from any angle.
  - Floating 3D particle tunnel accelerating forward during passage.

- **👁️ Biometric Optical HUD Viewfinder**:
  - Live webcam stream with Face-API AI facial landmark tracking and corner bracket reticles.
  - Real-time scanning laser line animation sweeping vertically.
  - Dual input support: Real live webcam or instant demo test commuters (Atharv, Piyush, Stranger fraud test).

- **💳 3D Holographic Passenger Smartcard (My Account)**:
  - Interactive 3D tilt perspective responding dynamically to mouse coordinates.
  - Holographic specular glare highlight, embedded golden microchip, contactless NFC indicator, and live wallet balance.
  - Instant wallet recharge chips and unlimited multi-day Tourist Passes (1-Day, 3-Day Explorer, 7-Day Mega).

- **🗺️ Interactive Transit Network & Route Planner**:
  - Interactive line topology map of Pune transit stations across Bus, Metro, and Suburban Train lines.
  - Live zone-based fare calculator formula: `Fare = ₹10 + ₹5 × |Zone_Entry - Zone_Exit|`.

- **🛡️ Admin Security & Anti-Fraud Command Center**:
  - Real-time analytics KPI metric cards.
  - Anti-passback anomaly logs (rapid re-entry <20s, low balance rejections, unrecognized face detection).
  - Passenger directory and journeys ledger.

- **🔊 Web Audio API Sound Synthesizer**:
  - Synthesizes sci-fi entry chimes, denial buzzers, and UI clicks natively without external audio files.

---

## 🚀 How to Run

1. **Install requirements**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Start the application**:
   ```bash
   python app.py
   ```

3. **Open in browser**:
   Navigate to [http://localhost:5000](http://localhost:5000) in Google Chrome or any modern browser.

4. **Default Admin Key**: `admin123`
