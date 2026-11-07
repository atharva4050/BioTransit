/**
 * BioTransit 3D Simulation Engine
 * Interactive Three.js Turnstile Gate & Holographic Ambient Visuals
 */

const Gate3D = (function () {
  let scene, camera, renderer, container;
  let leftWingGroup, rightWingGroup;
  let leftWingMesh, rightWingMesh;
  let pedestalLeft, pedestalRight, floorMesh, guideRails = [];
  let scannerLight, overheadIndicator;
  let particlesMesh, particlePositions, particleSpeeds;
  const PARTICLE_COUNT = 140;

  // Gate Animation State
  let gateState = 'IDLE'; // 'IDLE' | 'SCANNING' | 'OPEN' | 'DENIED'
  let targetAngle = 0;
  let currentAngle = 0;
  let stateTimer = null;
  let shakeIntensity = 0;

  // Colors
  const COLORS = {
    cyan: 0x00f2fe,
    cyanDim: 0x06b6d4,
    emerald: 0x10b981,
    red: 0xef4444,
    amber: 0xf59e0b,
    metal: 0x1e293b,
    metalDark: 0x0f172a,
    floor: 0x0a101f
  };

  // Mouse interaction for subtle 3D parallax & orbit
  let mouse = { x: 0, y: 0, targetX: 0, targetY: 0 };
  let isDragging = false;
  let prevMousePos = { x: 0, y: 0 };
  let manualRotation = { y: 0.15, x: 0.1 };

  function init(containerId) {
    container = document.getElementById(containerId);
    if (!container || typeof THREE === 'undefined') return;

    const width = container.clientWidth || 600;
    const height = container.clientHeight || 440;

    // 1. Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x050811, 0.045);

    // 2. Camera
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.set(0, 3.4, 6.8);
    camera.lookAt(0, 1.2, 0);

    // 3. Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;

    // Remove any previous canvas
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.appendChild(renderer.domElement);

    // 4. Lighting
    setupLights();

    // 5. Build Gate Turnstile Geometry
    buildTurnstile();

    // 6. Floor & Pathway
    buildPathway();

    // 7. Particle Tunnel
    buildParticles();

    // 8. Event Listeners
    setupEvents();

    // 9. Start Render Loop
    animate();
  }

  function setupLights() {
    // Ambient Light
    const ambient = new THREE.AmbientLight(0x1e293b, 1.2);
    scene.add(ambient);

    // Top Main Key Light
    const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
    dirLight.position.set(4, 8, 5);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    scene.add(dirLight);

    // Fill Light (Soft Cyan)
    const fillLight = new THREE.DirectionalLight(0x00f2fe, 0.9);
    fillLight.position.set(-5, 4, -2);
    scene.add(fillLight);

    // Gate Scanner Glow Light
    scannerLight = new THREE.PointLight(COLORS.cyan, 3.5, 7);
    scannerLight.position.set(0, 2.0, 0);
    scene.add(scannerLight);
  }

  function buildTurnstile() {
    // Pedestal Metal Material
    const metalMat = new THREE.MeshStandardMaterial({
      color: COLORS.metal,
      metalness: 0.85,
      roughness: 0.25
    });

    const darkMetalMat = new THREE.MeshStandardMaterial({
      color: COLORS.metalDark,
      metalness: 0.9,
      roughness: 0.4
    });

    const neonCyanMat = new THREE.MeshBasicMaterial({
      color: COLORS.cyan,
      wireframe: false
    });

    // --- LEFT PEDESTAL ---
    pedestalLeft = new THREE.Group();
    pedestalLeft.position.set(-1.45, 0, 0);

    const baseGeo = new THREE.BoxGeometry(0.55, 1.8, 2.6);
    const leftBase = new THREE.Mesh(baseGeo, metalMat);
    leftBase.position.y = 0.9;
    leftBase.castShadow = true;
    leftBase.receiveShadow = true;
    pedestalLeft.add(leftBase);

    // Glowing Edge Strips on Left Pedestal
    const stripGeo = new THREE.BoxGeometry(0.04, 1.78, 0.04);
    const leftStripFront = new THREE.Mesh(stripGeo, neonCyanMat);
    leftStripFront.position.set(0.28, 0.9, 1.3);
    pedestalLeft.add(leftStripFront);

    // --- RIGHT PEDESTAL ---
    pedestalRight = new THREE.Group();
    pedestalRight.position.set(1.45, 0, 0);

    const rightBase = new THREE.Mesh(baseGeo, metalMat);
    rightBase.position.y = 0.9;
    rightBase.castShadow = true;
    rightBase.receiveShadow = true;
    pedestalRight.add(rightBase);

    const rightStripFront = new THREE.Mesh(stripGeo, neonCyanMat);
    rightStripFront.position.set(-0.28, 0.9, 1.3);
    pedestalRight.add(rightStripFront);

    // Biometric Scanner Dome on Right Pedestal
    const scannerPillarGeo = new THREE.CylinderGeometry(0.12, 0.14, 0.65, 24);
    const scannerPillar = new THREE.Mesh(scannerPillarGeo, darkMetalMat);
    scannerPillar.position.set(-0.05, 1.95, 0.5);
    pedestalRight.add(scannerPillar);

    const scannerHeadGeo = new THREE.BoxGeometry(0.3, 0.4, 0.06);
    const scannerHead = new THREE.Mesh(scannerHeadGeo, metalMat);
    scannerHead.position.set(-0.05, 2.3, 0.5);
    scannerHead.rotation.x = -0.25; // angled toward passenger
    pedestalRight.add(scannerHead);

    const screenGeo = new THREE.PlaneGeometry(0.24, 0.32);
    const screenMat = new THREE.MeshBasicMaterial({ color: COLORS.cyanBright || 0x22d3ee });
    const screen = new THREE.Mesh(screenGeo, screenMat);
    screen.position.set(0, 0, 0.035);
    scannerHead.add(screen);

    scene.add(pedestalLeft);
    scene.add(pedestalRight);

    // --- MOTORIZED GLASS BARRIER WINGS (FLAPS) ---
    // Left Wing Group (pivot at x = -1.18)
    leftWingGroup = new THREE.Group();
    leftWingGroup.position.set(-1.18, 1.05, 0);

    // Right Wing Group (pivot at x = 1.18)
    rightWingGroup = new THREE.Group();
    rightWingGroup.position.set(1.18, 1.05, 0);

    // Glass Wing Geometry
    const wingShape = new THREE.Shape();
    wingShape.moveTo(0, -0.6);
    wingShape.lineTo(1.15, -0.4);
    wingShape.lineTo(1.15, 0.5);
    wingShape.lineTo(0, 0.6);
    wingShape.closePath();

    const extrudeSettings = { depth: 0.04, bevelEnabled: true, bevelSegments: 2, steps: 1, bevelSize: 0.015, bevelThickness: 0.015 };
    const wingGeo = new THREE.ExtrudeGeometry(wingShape, extrudeSettings);

    const glassMat = new THREE.MeshPhysicalMaterial({
      color: COLORS.cyan,
      transparent: true,
      opacity: 0.65,
      roughness: 0.1,
      metalness: 0.2,
      transmission: 0.6,
      ior: 1.5,
      emissive: COLORS.cyan,
      emissiveIntensity: 0.35
    });

    leftWingMesh = new THREE.Mesh(wingGeo, glassMat);
    leftWingMesh.position.set(0, 0, -0.02);
    leftWingGroup.add(leftWingMesh);

    // Right wing mirrors shape
    const rightWingShape = new THREE.Shape();
    rightWingShape.moveTo(0, -0.6);
    rightWingShape.lineTo(-1.15, -0.4);
    rightWingShape.lineTo(-1.15, 0.5);
    rightWingShape.lineTo(0, 0.6);
    rightWingShape.closePath();

    const rightWingGeo = new THREE.ExtrudeGeometry(rightWingShape, extrudeSettings);
    rightWingMesh = new THREE.Mesh(rightWingGeo, glassMat.clone());
    rightWingMesh.position.set(0, 0, -0.02);
    rightWingGroup.add(rightWingMesh);

    scene.add(leftWingGroup);
    scene.add(rightWingGroup);

    // Overhead Status Sign
    const overheadSignGeo = new THREE.TorusGeometry(0.24, 0.03, 16, 48);
    const overheadMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan });
    overheadIndicator = new THREE.Mesh(overheadSignGeo, overheadMat);
    overheadIndicator.position.set(0, 2.7, 0);
    overheadIndicator.rotation.x = Math.PI / 2;
    scene.add(overheadIndicator);
  }

  function buildPathway() {
    // Floor Platform
    const floorGeo = new THREE.BoxGeometry(5.5, 0.2, 8.0);
    const floorMat = new THREE.MeshStandardMaterial({
      color: COLORS.floor,
      metalness: 0.8,
      roughness: 0.35
    });
    floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.y = -0.1;
    floorMesh.receiveShadow = true;
    scene.add(floorMesh);

    // Neon Floor Guide Rails
    const railMat = new THREE.MeshBasicMaterial({ color: COLORS.cyan });
    const railGeo = new THREE.BoxGeometry(0.05, 0.02, 6.5);

    const leftRail = new THREE.Mesh(railGeo, railMat);
    leftRail.position.set(-0.85, 0.02, 0);
    scene.add(leftRail);
    guideRails.push(leftRail);

    const rightRail = new THREE.Mesh(railGeo, railMat);
    rightRail.position.set(0.85, 0.02, 0);
    scene.add(rightRail);
    guideRails.push(rightRail);

    // Floor Guide Arrows / Step Markings
    const arrowMat = new THREE.MeshBasicMaterial({ color: 0x0e7490, transparent: true, opacity: 0.8 });
    for (let z = -2.5; z <= 2.5; z += 1.25) {
      const stepGeo = new THREE.BoxGeometry(0.5, 0.01, 0.08);
      const step = new THREE.Mesh(stepGeo, arrowMat);
      step.position.set(0, 0.02, z);
      scene.add(step);
    }
  }

  function buildParticles() {
    const geo = new THREE.BufferGeometry();
    particlePositions = new Float32Array(PARTICLE_COUNT * 3);
    particleSpeeds = new Float32Array(PARTICLE_COUNT);

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      particlePositions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;  // x: within walkway
      particlePositions[i * 3 + 1] = 0.2 + Math.random() * 2.2;     // y: height
      particlePositions[i * 3 + 2] = (Math.random() - 0.5) * 6.5;  // z: depth
      particleSpeeds[i] = 0.015 + Math.random() * 0.025;
    }

    geo.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));

    const pMat = new THREE.PointsMaterial({
      color: COLORS.cyan,
      size: 0.05,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending
    });

    particlesMesh = new THREE.Points(geo, pMat);
    scene.add(particlesMesh);
  }

  function setupEvents() {
    // Parallax mouse movement over container
    container.addEventListener('mousemove', (e) => {
      const rect = container.getBoundingClientRect();
      mouse.targetX = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.targetY = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

      if (isDragging) {
        const dx = e.clientX - prevMousePos.x;
        const dy = e.clientY - prevMousePos.y;
        manualRotation.y += dx * 0.006;
        manualRotation.x = Math.max(-0.2, Math.min(0.4, manualRotation.x + dy * 0.004));
        prevMousePos = { x: e.clientX, y: e.clientY };
      }
    });

    container.addEventListener('mousedown', (e) => {
      isDragging = true;
      prevMousePos = { x: e.clientX, y: e.clientY };
    });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });

    // Touch support
    container.addEventListener('touchstart', (e) => {
      if (e.touches.length === 1) {
        isDragging = true;
        prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    container.addEventListener('touchmove', (e) => {
      if (isDragging && e.touches.length === 1) {
        const dx = e.touches[0].clientX - prevMousePos.x;
        const dy = e.touches[0].clientY - prevMousePos.y;
        manualRotation.y += dx * 0.008;
        manualRotation.x = Math.max(-0.2, Math.min(0.4, manualRotation.x + dy * 0.005));
        prevMousePos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    });

    window.addEventListener('touchend', () => {
      isDragging = false;
    });

    // Resize Observer
    const ro = new ResizeObserver(() => onWindowResize());
    ro.observe(container);
  }

  function onWindowResize() {
    if (!renderer || !camera || !container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }

  // --- GATE STATE CONTROLLERS ---
  function setIdle() {
    gateState = 'IDLE';
    targetAngle = 0; // wings closed
    updateColors(COLORS.cyan, 0.35);
    scannerLight.color.setHex(COLORS.cyan);
    scannerLight.intensity = 3.0;
    overheadIndicator.material.color.setHex(COLORS.cyan);
    updateUIBadge('READY', 'Ready for Scan');
  }

  function setScanning() {
    gateState = 'SCANNING';
    targetAngle = 0;
    updateColors(COLORS.amber, 0.5);
    scannerLight.color.setHex(COLORS.amber);
    scannerLight.intensity = 5.0;
    overheadIndicator.material.color.setHex(COLORS.amber);
    updateUIBadge('SCANNING', 'Verifying Biometric Hash...');
  }

  function setOpen(action, passengerName, fare) {
    clearTimeout(stateTimer);
    gateState = 'OPEN';
    targetAngle = 1.35; // ~77 degrees open outward
    updateColors(COLORS.emerald, 0.85);
    scannerLight.color.setHex(COLORS.emerald);
    scannerLight.intensity = 6.0;
    overheadIndicator.material.color.setHex(COLORS.emerald);

    const txt = action === 'ENTRY'
      ? `WELCOME, ${passengerName || 'PASSENGER'} (ENTRY)`
      : `EXIT COMPLETED: ₹${fare || 0} DEDUCTED`;
    updateUIBadge('OPEN', txt);

    // Auto reset to idle after 3.8 seconds
    stateTimer = setTimeout(() => {
      setIdle();
    }, 3800);
  }

  function setDenied(reason) {
    clearTimeout(stateTimer);
    gateState = 'DENIED';
    targetAngle = 0;
    shakeIntensity = 0.12; // trigger 3D warning shake
    updateColors(COLORS.red, 0.9);
    scannerLight.color.setHex(COLORS.red);
    scannerLight.intensity = 6.5;
    overheadIndicator.material.color.setHex(COLORS.red);

    updateUIBadge('DENIED', reason || 'ACCESS DENIED');

    stateTimer = setTimeout(() => {
      setIdle();
    }, 2800);
  }

  function setEmergencyOpen() {
    clearTimeout(stateTimer);
    gateState = 'OPEN';
    targetAngle = 1.48; // wide open
    updateColors(COLORS.emerald, 0.95);
    if (scannerLight) {
      scannerLight.color.setHex(COLORS.emerald);
      scannerLight.intensity = 8.0;
    }
    if (overheadIndicator) overheadIndicator.material.color.setHex(COLORS.emerald);
    updateUIBadge('OPEN', '🚨 EMERGENCY EVACUATION: TURNSTILES FULLY OPEN');
  }

  function setLockdown() {
    clearTimeout(stateTimer);
    gateState = 'DENIED';
    targetAngle = 0;
    shakeIntensity = 0.08;
    updateColors(COLORS.red, 1.0);
    if (scannerLight) {
      scannerLight.color.setHex(COLORS.red);
      scannerLight.intensity = 8.0;
    }
    if (overheadIndicator) overheadIndicator.material.color.setHex(COLORS.red);
    updateUIBadge('DENIED', '🔒 SECURITY LOCKDOWN: TURNSTILES LOCKED');
  }

  function updateColors(hexColor, intensity) {
    if (leftWingMesh && leftWingMesh.material) {
      leftWingMesh.material.color.setHex(hexColor);
      leftWingMesh.material.emissive.setHex(hexColor);
      leftWingMesh.material.emissiveIntensity = intensity;
    }
    if (rightWingMesh && rightWingMesh.material) {
      rightWingMesh.material.color.setHex(hexColor);
      rightWingMesh.material.emissive.setHex(hexColor);
      rightWingMesh.material.emissiveIntensity = intensity;
    }
    guideRails.forEach(r => r.material.color.setHex(hexColor));
    if (particlesMesh) {
      particlesMesh.material.color.setHex(hexColor);
    }
  }

  function updateUIBadge(type, text) {
    const el = document.getElementById('gate-3d-status');
    if (!el) return;
    el.className = 'gate-state-indicator ' + type.toLowerCase();
    
    let icon = '⚡';
    if (type === 'OPEN') icon = '🔓';
    else if (type === 'DENIED') icon = '🚫';
    else if (type === 'SCANNING') icon = '🔍';
    else icon = '🛡️';

    el.innerHTML = `<span>${icon}</span> <span>${text}</span>`;
  }

  // Render Loop
  function animate() {
    requestAnimationFrame(animate);

    // Smooth Wing Rotation (Spring/Lerp)
    currentAngle += (targetAngle - currentAngle) * 0.12;

    if (leftWingGroup && rightWingGroup) {
      leftWingGroup.rotation.y = -currentAngle;
      rightWingGroup.rotation.y = currentAngle;
    }

    // Shake effect when denied
    if (shakeIntensity > 0.001) {
      scene.position.x = (Math.random() - 0.5) * shakeIntensity;
      shakeIntensity *= 0.88;
    } else {
      scene.position.x = 0;
    }

    // Camera Orbit & Mouse Parallax
    mouse.x += (mouse.targetX - mouse.x) * 0.05;
    mouse.y += (mouse.targetY - mouse.y) * 0.05;

    // Apply rotation
    const baseRotY = manualRotation.y + mouse.x * 0.25;
    const baseRotX = manualRotation.x + mouse.y * 0.15;
    const radius = 7.2;

    camera.position.x = radius * Math.sin(baseRotY);
    camera.position.z = radius * Math.cos(baseRotY);
    camera.position.y = 3.2 + baseRotX * 3.0;
    camera.lookAt(0, 1.1, 0);

    // Overhead indicator gentle spin
    if (overheadIndicator) {
      overheadIndicator.rotation.z += 0.02;
    }

    // Particles Motion
    if (particlesMesh && particlePositions) {
      const positions = particlesMesh.geometry.attributes.position.array;
      const speedMult = gateState === 'OPEN' ? 2.8 : (gateState === 'SCANNING' ? 1.6 : 1.0);

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        // Move towards camera (z direction)
        positions[i * 3 + 2] += particleSpeeds[i] * speedMult;
        if (positions[i * 3 + 2] > 3.5) {
          positions[i * 3 + 2] = -3.5;
          positions[i * 3 + 0] = (Math.random() - 0.5) * 2.2;
        }
      }
      particlesMesh.geometry.attributes.position.needsUpdate = true;
    }

    renderer.render(scene, camera);
  }

  return {
    init,
    setIdle,
    setScanning,
    setOpen,
    setDenied,
    setEmergencyOpen,
    setLockdown,
    getState: () => gateState
  };
})();

// Ambient Background Particle Network (Global Backdrop Canvas)
(function initAmbientBackground() {
  window.addEventListener('DOMContentLoaded', () => {
    const canvas = document.getElementById('bg-particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let width, height;
    let particles = [];
    const COUNT = 65;

    function resize() {
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    for (let i = 0; i < COUNT; i++) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * 0.45,
        vy: (Math.random() - 0.5) * 0.45,
        size: Math.random() * 2 + 1,
        color: Math.random() > 0.5 ? 'rgba(6, 182, 212, ' : 'rgba(139, 92, 246, '
      });
    }

    function render() {
      ctx.clearRect(0, 0, width, height);

      // Draw connecting lines
      for (let i = 0; i < particles.length; i++) {
        for (let j = i + 1; j < particles.length; j++) {
          const dx = particles[i].x - particles[j].x;
          const dy = particles[i].y - particles[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.22;
            ctx.strokeStyle = `rgba(6, 182, 212, ${alpha})`;
            ctx.lineWidth = 0.8;
            ctx.beginPath();
            ctx.moveTo(particles[i].x, particles[i].y);
            ctx.lineTo(particles[j].x, particles[j].y);
            ctx.stroke();
          }
        }
      }

      // Draw particles
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.x < 0) p.x = width;
        if (p.x > width) p.x = 0;
        if (p.y < 0) p.y = height;
        if (p.y > height) p.y = 0;

        ctx.fillStyle = p.color + '0.7)';
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }

      requestAnimationFrame(render);
    }
    render();
  });
})();
