// WebSocket et variables globales
const socket = io({ reconnection: true, reconnectionDelay: 1000 });
let chart = null;
let states = { led: false, hum: false, fan: false };
let token = localStorage.getItem('auth_token');
let currentUsername = localStorage.getItem('username');
let isAuthenticated = false;
let chartData = null;
let zoomLevel = 1; // Facteur de zoom multiplicateur (1 = normal)
const ZOOM_MULTIPLIER = 1.3; // 30% de zoom par clic

// === Fonctions de gestion d'authentification ===
function setLoginError(msg) {
  const el = document.getElementById('login-error');
  if (msg) {
    el.textContent = msg;
    el.style.display = 'block';
  } else {
    el.textContent = '';
    el.style.display = 'none';
  }
}

function enableButtons() {
  console.log('[DEBUG] enableButtons()');
  const ledBtn = document.getElementById('led-btn');
  const humBtn = document.getElementById('hum-btn');
  const fanBtn = document.getElementById('fan-btn');
  if (ledBtn) ledBtn.classList.remove('disabled');
  if (humBtn) humBtn.classList.remove('disabled');
  if (fanBtn) fanBtn.classList.remove('disabled');
}

function disableButtons() {
  console.log('[DEBUG] disableButtons()');
  const ledBtn = document.getElementById('led-btn');
  const humBtn = document.getElementById('hum-btn');
  const fanBtn = document.getElementById('fan-btn');
  if (ledBtn) ledBtn.classList.add('disabled');
  if (humBtn) humBtn.classList.add('disabled');
  if (fanBtn) fanBtn.classList.add('disabled');
}

function showAuthInfo() {
  const loginInputs = document.querySelector('.login-inputs');
  const authStatus = document.getElementById('auth-status');
  
  if (loginInputs) loginInputs.style.display = 'none';
  if (authStatus) {
    authStatus.style.display = 'flex';
    authStatus.innerHTML = `
      <span class="user-chip">👤 ${currentUsername}</span>
      <button class="logout-btn" onclick="logout()">Déconnexion</button>
    `;
  }
}

function logout() {
  localStorage.removeItem('auth_token');
  localStorage.removeItem('username');
  token = null;
  currentUsername = null;
  isAuthenticated = false;
  
  const loginInputs = document.querySelector('.login-inputs');
  const authStatus = document.getElementById('auth-status');
  
  if (loginInputs) loginInputs.style.display = 'flex';
  if (authStatus) authStatus.style.display = 'none';
  document.getElementById('login-error').textContent = '';
  
  disableButtons();
}

// Vérifier si on a un token au chargement
if (token) {
  console.log('[DEBUG] Token trouvé:', token.substring(0, 20) + '...');
  isAuthenticated = true;
  showAuthInfo();
  enableButtons();
} else {
  console.log('[DEBUG] Pas de token');
  disableButtons();
}

async function handleLogin() {
  const username = document.getElementById('username').value;
  const password = document.getElementById('password').value;

  if (!username || !password) {
    setLoginError('Veuillez remplir tous les champs');
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    if (res.ok) {
      const data = await res.json();
      token = data.token;
      currentUsername = data.username;
      localStorage.setItem('auth_token', token);
      localStorage.setItem('username', currentUsername);
      
      document.getElementById('username').value = '';
      document.getElementById('password').value = '';
      setLoginError('');
      
      socket.emit('auth', token);
      isAuthenticated = true;
      showAuthInfo();
      enableButtons();
    } else {
      const error = await res.json();
      setLoginError(error.error || 'Erreur de connexion');
    }
  } catch (err) {
    setLoginError('Erreur réseau');
  }
}

// === Événements WebSocket ===
socket.on('connect', () => {
  console.log('[WebSocket] Connecté');
  if (token) {
    socket.emit('auth', token);
  }
});

socket.on('mqtt_status', (data) => {
  const statusEl = document.getElementById('status');
  if (data.connected) {
    statusEl.classList.add('connected');
    statusEl.textContent = 'MQTT Connecté';
  } else {
    statusEl.classList.remove('connected');
    statusEl.textContent = 'MQTT Déconnecté';
  }
});

socket.on('auth_success', (data) => {
  enableButtons();
  isAuthenticated = true;
  console.log('Authentifié:', data.username);
});

socket.on('auth_error', (data) => {
  disableButtons();
  isAuthenticated = false;
  console.error('Erreur auth:', data.message);
});

socket.on('disconnect', () => {
  const statusEl = document.getElementById('status');
  if (statusEl) {
    statusEl.classList.remove('connected');
    statusEl.textContent = 'Déconnecté du serveur';
  }
});

// === Gestion des capteurs ===
function update(id, val, min, max) {
  const el = document.getElementById(id);
  const bubble = document.getElementById(id + '-bubble');
  
  if (!el || !bubble) return;
  
  bubble.classList.remove('healthy', 'warning', 'critical');
  if (val >= min && val <= max) bubble.classList.add('healthy');
  else if (Math.abs(val - min) < (max - min) * 0.2 || Math.abs(val - max) < (max - min) * 0.2) bubble.classList.add('warning');
  else bubble.classList.add('critical');
  
  el.textContent = Math.round(val);
}

function toggle(type, cmd) {
  if (!isAuthenticated) {
    setLoginError('');
    return;
  }
  states[type] = !states[type];
  const btn = document.getElementById(type + '-btn');
  if (states[type]) {
    btn.classList.add('on');
  } else {
    btn.classList.remove('on');
  }
  socket.emit('cmd', states[type] ? cmd + '_ON' : cmd + '_OFF');
}

function toggleSettingsSection() {
  if (!isAuthenticated) {
    alert('Veuillez vous connecter pour accéder aux paramètres');
    return;
  }
  const settingsSection = document.getElementById('settings-section');
  if (settingsSection) {
    settingsSection.classList.toggle('visible');
    // Charger les paramètres s'ils ne sont pas chargés
    if (settingsSection.classList.contains('visible')) {
      loadSettings();
    }
  }
}

socket.on('telemetry', d => {
  if (!d) return;
  
  // Mise à jour des capteurs
  update('lux', d.luminosite || 0, 500, 10000);
  update('soil', d.humidite_sol || 0, 30, 70);
  update('humidity', d.humidite_air || 0, 30, 70);
  update('temp', d.temperature || 0, 15, 30);
  update('pressure', d.pressure || 0, 990, 1030);
  update('rssi', d.rssi || -100, -70, -50);
  
  // Ajouter le nouveau point au graphique en temps réel
  if (chartData) {
    chartData.push({
      timestamp: new Date().toISOString(),
      luminosite: d.luminosite || 0,
      humidite_sol: d.humidite_sol || 0,
      humidite_air: d.humidite_air || 0,
      temperature: d.temperature || 0,
      pressure: d.pressure || 0,
      rssi: d.rssi || 0,
      led_on: d.led_on || false,
      fan_on: d.fan_on || false,
      humidifier_on: d.humidifier_on || false
    });
    
    if (chartData.length > 100) chartData.shift();
    renderChart(chartData);
  }
  
  // Synchroniser les états des boutons
  if (d.led_on !== undefined) {
    states.led = d.led_on;
    const ledBtn = document.getElementById('led-btn');
    if (d.led_on) ledBtn.classList.add('on');
    else ledBtn.classList.remove('on');
  }
  if (d.fan_on !== undefined) {
    states.fan = d.fan_on;
    const fanBtn = document.getElementById('fan-btn');
    if (d.fan_on) fanBtn.classList.add('on');
    else fanBtn.classList.remove('on');
  }
  if (d.humidifier_on !== undefined) {
    states.hum = d.humidifier_on;
    const humBtn = document.getElementById('hum-btn');
    if (d.humidifier_on) humBtn.classList.add('on');
    else humBtn.classList.remove('on');
  }
});

// === Gestion du graphique ===
function renderChart(data) {
  if (!data || data.length === 0) return;
  
  const ctx = document.getElementById('chart');
  if (!ctx) return;
  
  const ctxData = ctx.getContext('2d');
  const labels = data.map(d => new Date(d.timestamp).toLocaleTimeString());
  
  if (chart) {
    chart.data.labels = labels;
    chart.data.datasets[0].data = data.map(d => d.luminosite);
    chart.data.datasets[1].data = data.map(d => d.humidite_sol);
    chart.data.datasets[2].data = data.map(d => d.humidite_air || 0);
    chart.data.datasets[3].data = data.map(d => d.temperature || 0);
    chart.data.datasets[4].data = data.map(d => d.pressure || 0);
    chart.update('none');
    applyZoom();
    return;
  }
  
  chart = new Chart(ctxData, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Luminosité (lux)',
          data: data.map(d => d.luminosite),
          borderColor: '#fbbf24',
          backgroundColor: 'rgba(251,191,36,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Humidité sol (%)',
          data: data.map(d => d.humidite_sol),
          borderColor: '#3b82f6',
          backgroundColor: 'rgba(59,130,246,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Humidité air (%)',
          data: data.map(d => d.humidite_air || 0),
          borderColor: '#06b6d4',
          backgroundColor: 'rgba(6,182,212,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Température (°C)',
          data: data.map(d => d.temperature || 0),
          borderColor: '#f97316',
          backgroundColor: 'rgba(249,115,22,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        },
        {
          label: 'Pression (hPa)',
          data: data.map(d => d.pressure || 0),
          borderColor: '#8b5cf6',
          backgroundColor: 'rgba(139,92,246,0.05)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.4,
          fill: true,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { left: 0, right: 0 } },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          display: true,
          position: 'bottom',
          labels: { color: '#94a3b8', usePointStyle: true, padding: 10 }
        }
      },
      scales: {
        y: {
          type: 'linear',
          position: 'right',
          min: 0,
          max: 1500,
          ticks: { color: '#94a3b8', font: { weight: 'bold' } },
          grid: { color: 'rgba(148,163,184,0.1)' }
        },
        x: {
          ticks: { color: '#94a3b8', maxRotation: 45, minRotation: 0 },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      }
    }
  });
  applyZoom();
}

function loadChart() {
  fetch('/api/history?limit=100')
    .then(r => r.json())
    .then(data => {
      chartData = data;
      renderChart(chartData);
    })
    .catch(err => console.error('Erreur chargement historique:', err));
}

// === Gestion des paramètres ===
async function loadSettings() {
  try {
    const response = await fetch('/api/settings', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    
    if (response.ok) {
      const data = await response.json();
      // Remplir les champs d'entrée avec les seuils
      document.getElementById('lux-min').value = data.thresholds.lux.min;
      document.getElementById('lux-max').value = data.thresholds.lux.max;
      document.getElementById('soil-min').value = data.thresholds.soil.min;
      document.getElementById('soil-max').value = data.thresholds.soil.max;
      document.getElementById('temp-min').value = data.thresholds.temp.min;
      document.getElementById('temp-max').value = data.thresholds.temp.max;
      document.getElementById('pressure-min').value = data.thresholds.pressure.min;
      document.getElementById('pressure-max').value = data.thresholds.pressure.max;
    } else {
      console.error('Erreur chargement paramètres');
    }
  } catch (err) {
    console.error('Erreur:', err);
  }
}

async function saveSettings() {
  try {
    const settings = {
      thresholds: {
        lux: {
          min: parseInt(document.getElementById('lux-min').value),
          max: parseInt(document.getElementById('lux-max').value)
        },
        soil: {
          min: parseInt(document.getElementById('soil-min').value),
          max: parseInt(document.getElementById('soil-max').value)
        },
        temp: {
          min: parseFloat(document.getElementById('temp-min').value),
          max: parseFloat(document.getElementById('temp-max').value)
        },
        pressure: {
          min: parseInt(document.getElementById('pressure-min').value),
          max: parseInt(document.getElementById('pressure-max').value)
        }
      },
      indicators: {
        lux: true,
        soil: true,
        temp: true,
        pressure: true,
        rssi: true
      }
    };

    const response = await fetch('/api/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(settings)
    });

    if (response.ok) {
      alert('✅ Paramètres sauvegardés avec succès!');
    } else {
      alert('❌ Erreur lors de la sauvegarde');
    }
  } catch (err) {
    console.error('Erreur:', err);
    alert('❌ Erreur serveur');
  }
}

// === Gestion du zoom du graphique ===
function calculateAutoScale() {
  if (!chart || !chartData || chartData.length === 0) {
    return { min: 0, max: 1500 };
  }

  // Collecter toutes les valeurs des datasets visibles
  const allValues = [];
  chart.data.datasets.forEach(dataset => {
    if (dataset.hidden === false || dataset.hidden === undefined) {
      dataset.data.forEach(val => {
        if (val !== null && val !== undefined && val !== 0) {
          allValues.push(val);
        }
      });
    }
  });

  if (allValues.length === 0) {
    return { min: 0, max: 1500 };
  }

  // Trouver min et max réels
  const minValue = Math.min(...allValues);
  const maxValue = Math.max(...allValues);
  const range = maxValue - minValue;

  // Adapter la marge en fonction du zoom
  // Moins on zoome, plus grande marge ; plus on zoome, marge réduite
  let marginPercent = 0.1; // 10% de marge par défaut
  if (zoomLevel > 2) marginPercent = 0.05;   // 5% quand zoom > 2x
  if (zoomLevel > 5) marginPercent = 0.02;   // 2% quand zoom > 5x
  if (zoomLevel > 10) marginPercent = 0.01;  // 1% quand zoom > 10x

  const margin = range * marginPercent;
  let min = Math.max(0, minValue - margin);
  let max = maxValue + margin;

  // Adapter la précision de l'arrondi selon le zoom
  // Moins on zoome, plus gros les paliers ; plus on zoome, plus fins les paliers
  let roundFactor = 50;
  if (zoomLevel > 2) roundFactor = 25;      // Léger zoom
  if (zoomLevel > 5) roundFactor = 10;      // Zoom moyen
  if (zoomLevel > 10) roundFactor = 5;      // Zoom élevé
  if (zoomLevel > 20) roundFactor = 2;      // Très zoomé
  if (zoomLevel > 50) roundFactor = 1;      // Ultra zoomé : pas d'arrondi

  min = Math.floor(min / roundFactor) * roundFactor;
  max = Math.ceil(max / roundFactor) * roundFactor;

  return { min, max };
}

function applyZoom() {
  if (!chart) return;
  
  const scale = calculateAutoScale();
  chart.options.scales.y.max = scale.max;
  chart.options.scales.y.min = scale.min;
  chart.update('none');
}

function zoomIn() {
  zoomLevel *= ZOOM_MULTIPLIER;
  applyZoom();
}

function zoomOut() {
  zoomLevel /= ZOOM_MULTIPLIER;
  applyZoom();
}

// Gestion du zoom à la molette de la souris
document.addEventListener('DOMContentLoaded', () => {
  const chartWrapper = document.getElementById('chart-wrapper');
  if (chartWrapper) {
    chartWrapper.addEventListener('wheel', (e) => {
      if (!chart) return;
      
      e.preventDefault();
      
      // Scrolling vers le haut = zoom in, vers le bas = zoom out
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }, { passive: false });
  }
});

// Charger le graphique au démarrage
loadChart();
