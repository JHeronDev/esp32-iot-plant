const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs').promises;
// const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// Configuration depuis variables d'environnement
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const SETTINGS_FILE = process.env.SETTINGS_FILE || './settings.json';

// PostgreSQL pour les comptes utilisateurs
// Utiliser DATABASE_URL si disponible (Railway), sinon construire manuellement
const pgPool = new Pool(
  process.env.DATABASE_URL ? 
  {
    connectionString: process.env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    ssl: { rejectUnauthorized: false }
  }
  : 
  {
    host: process.env.POSTGRES_HOST || 'localhost',
    port: process.env.POSTGRES_PORT || 5432,
    database: process.env.POSTGRES_DATABASE || 'iot_plant',
    user: process.env.POSTGRES_USER || 'iot_user',
    password: process.env.POSTGRES_PASSWORD || 'iot_password',
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  }
);

// Gérer les erreurs du pool pour éviter les crashs
pgPool.on('error', (err, client) => {
  console.error('[PostgreSQL] Erreur inattendue:', err.message);
  // Le pool va automatiquement recréer les connexions
});

// InfluxDB pour les données de télémétrie (optionnel)
const influxURL = process.env.INFLUX_URL || 'http://localhost:8086';
const influxToken = process.env.INFLUX_TOKEN || 'mytoken123456';
const influxOrg = process.env.INFLUX_ORG || 'iot_org';
const influxBucket = process.env.INFLUX_BUCKET || 'plant_data';

let writeApi = null;
let queryApi = null;

// Vérifier que l'URL InfluxDB est valide avant de créer le client
try {
  new URL(influxURL);
  const influxDB = new InfluxDB({ url: influxURL, token: influxToken });
  writeApi = influxDB.getWriteApi(influxOrg, influxBucket, 'ms');
  queryApi = influxDB.getQueryApi(influxOrg);
  console.log('[InfluxDB] Client initialisé');
} catch (error) {
  console.log('[InfluxDB] Désactivé - URL invalide ou pas configuré:', error.message);
}

const TOPIC_TELEMETRY = 'tp/esp32/telemetry';
const TOPIC_CMD = 'tp/esp32/cmd';
let lastTelemetrySent = 0;
const MIN_SEND_INTERVAL = 3000; // Envoyer max 1 msg tous les 3s

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

app.use(express.static('public'));
app.use(express.json());

// Middleware d'authentification JWT
function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Pas de token' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Token invalide ou expiré' });
  }
}

// Pas d'historique en mémoire - tout dans InfluxDB

// Configuration email sécurisée (désactivé)
/*
const emailConfig = {
  service: process.env.EMAIL_SERVICE || 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
};

let transporter = null;
if (emailConfig.auth.user && emailConfig.auth.pass) {
  transporter = nodemailer.createTransport(emailConfig);
}

// Fonction pour envoyer une alerte email
async function sendAlertEmail(subject, message) {
  if (!transporter) {
    console.log('[EMAIL] Non configuré - alerte ignorée');
    return;
  }

  const mailOptions = {
    from: emailConfig.auth.user,
    to: process.env.EMAIL_TO || emailConfig.auth.user,
    subject: subject,
    text: message
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('[EMAIL] Alerte envoyée:', info.messageId);
  } catch (error) {
    console.error('[EMAIL] Erreur:', error.message);
  }
}
*/

// Initialisation des bases de données
async function initDatabases() {
  try {
    // Test PostgreSQL
    const pgClient = await pgPool.connect();
    console.log('[PostgreSQL] Connecté avec succès');
    pgClient.release();
  } catch (error) {
    console.error('[PostgreSQL] Erreur de connexion:', error.message);
    console.log('[PostgreSQL] Le serveur continue sans PostgreSQL');
  }

  // Test InfluxDB simple (pas de health check, juste vérifier que writeApi est initialisé)
  if (writeApi) {
    console.log('[InfluxDB] Connecté avec succès');
  } else {
    console.log('[InfluxDB] Non disponible');
  }
}

// Sauvegarde dans InfluxDB
function saveTelemetryToInflux(data) {
  if (!writeApi) return; // InfluxDB désactivé
  
  try {
    const point = new Point('plant_telemetry')
      .floatField('luminosite', data.luminosite)
      .floatField('humidite_sol', data.humidite_sol)
      .floatField('humidite_air', data.humidite_air || 0)
      .floatField('temperature', data.temperature || 0)
      .floatField('pressure', data.pressure || 0)
      .intField('rssi', data.rssi)
      .timestamp(new Date());

    writeApi.writePoint(point);
  } catch (error) {
    console.error('[InfluxDB] Erreur sauvegarde:', error.message);
  }
}

// MQTT
const client = mqtt.connect(MQTT_BROKER, {
  reconnectPeriod: 5000,
  connectTimeout: 30000
});

const defaultSettings = {
  thresholds: {
    lux: { min: 500, max: 10000 },
    soil: { min: 30, max: 70 },
    temp: { min: 15, max: 30 },
    pressure: { min: 990, max: 1030 },
    rssi: { min: -70, max: -50 }
  },
  indicators: {
    lux: true,
    soil: true,
    temp: true,
    pressure: true,
    rssi: true
  }
};

let currentSettings = { ...defaultSettings };

function mergeSettings(defaults, incoming = {}) {
  const merged = { thresholds: {}, indicators: {} };

  for (const key of Object.keys(defaults.thresholds)) {
    const candidate = incoming.thresholds?.[key] || {};
    const minCandidate = Number(candidate.min);
    const maxCandidate = Number(candidate.max);
    const min = Number.isFinite(minCandidate) ? minCandidate : defaults.thresholds[key].min;
    const max = Number.isFinite(maxCandidate) ? maxCandidate : defaults.thresholds[key].max;
    merged.thresholds[key] = { min, max };
  }

  for (const key of Object.keys(defaults.indicators)) {
    const val = incoming.indicators?.[key];
    merged.indicators[key] = typeof val === 'boolean' ? val : defaults.indicators[key];
  }

  return merged;
}

async function loadSettingsFromFile() {
  try {
    const raw = await fs.readFile(SETTINGS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    currentSettings = mergeSettings(defaultSettings, parsed);
    console.log('[SETTINGS] Paramètres chargés depuis le fichier');
  } catch (error) {
    currentSettings = { ...defaultSettings };
    console.log('[SETTINGS] Fichier absent ou invalide, utilisation des valeurs par défaut');
  }
}

async function saveSettingsToFile() {
  try {
    await fs.writeFile(SETTINGS_FILE, JSON.stringify(currentSettings, null, 2), 'utf8');
    console.log('[SETTINGS] Paramètres sauvegardés');
  } catch (error) {
    console.error('[SETTINGS] Erreur sauvegarde:', error.message);
  }
}

client.on('connect', () => {
  console.log('[MQTT] Connecté au broker');
  io.emit('mqtt_status', { connected: true });
  client.subscribe(TOPIC_TELEMETRY, (err) => {
    if (err) {
      console.error('[MQTT] Erreur subscription:', err);
    } else {
      console.log('[MQTT] Abonné à:', TOPIC_TELEMETRY);
    }
  });
});

client.on('error', (error) => {
  console.error('[MQTT] Erreur:', error.message);
  io.emit('mqtt_status', { connected: false });
});

client.on('close', () => {
  console.log('[MQTT] Déconnecté du broker');
  io.emit('mqtt_status', { connected: false });
});

client.on('message', async (topic, message) => {
  if (topic === TOPIC_TELEMETRY) {
    try {
      const data = JSON.parse(message.toString());
      
      // Throttle: envoyer max 1 msg tous les 5s
      const now = Date.now();
      if (now - lastTelemetrySent < MIN_SEND_INTERVAL) {
        console.log('[MQTT] Throttled - attente avant envoi');
        return;
      }
      lastTelemetrySent = now;

      console.log('[MQTT] Données reçues:', data);

      // Ajouter timestamp
      data.timestamp = new Date().toISOString();
      
      // Convertir en entiers
      data.luminosite = Math.round(data.luminosite);
      data.humidite_sol = Math.round(data.humidite_sol);
      data.humidite_air = Math.round(data.humidite_air || 0);
      data.temperature = Math.round(data.temperature);
      data.pressure = Math.round(data.pressure);
      data.rssi = Math.round(data.rssi);

      // Sauvegarder dans InfluxDB
      saveTelemetryToInflux(data);

      // Diffuser aux clients WebSocket
      io.emit('telemetry', data);
    } catch (error) {
      console.error('[MQTT] Erreur traitement message:', error.message);
    }
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log('[WebSocket] Client connecté:', socket.id);
  let authenticatedUser = null;

  // Envoyer l'état MQTT actuel au client
  socket.emit('mqtt_status', { connected: client.connected });

  // Authentification WebSocket
  socket.on('auth', async (token) => {
    try {
      // Vérifier le JWT
      const decoded = jwt.verify(token, JWT_SECRET);
      
      // Vérifier que l'utilisateur existe et est actif
      const result = await pgPool.query(
        'SELECT id, username FROM users WHERE id = $1 AND is_active = true',
        [decoded.id]
      );
      
      if (result.rows.length > 0) {
        authenticatedUser = result.rows[0];
        socket.emit('auth_success', { username: authenticatedUser.username });
        console.log('[WebSocket] Authentifié:', authenticatedUser.username);
      } else {
        socket.emit('auth_error', { message: 'Utilisateur non trouvé ou inactif' });
      }
    } catch (error) {
      console.error('[WebSocket] Erreur auth:', error.message);
      socket.emit('auth_error', { message: 'Erreur serveur' });
    }
  });

  socket.on('cmd', (cmd) => {
    // Vérifier l'authentification avant d'accepter une commande
    if (!authenticatedUser) {
      socket.emit('cmd_ack', { cmd, status: 'error', message: 'Non authentifié' });
      return;
    }

    console.log('[CMD] Commande de', authenticatedUser.username + ':', cmd);
    if (client.connected) {
      client.publish(TOPIC_CMD, cmd);
      socket.emit('cmd_ack', { cmd, status: 'sent' });
    } else {
      socket.emit('cmd_ack', { cmd, status: 'error', message: 'MQTT non connecté' });
    }
  });

  socket.on('disconnect', () => {
    console.log('[WebSocket] Client déconnecté:', socket.id);
  });
});

// API REST

app.get('/api/settings', authenticateToken, (req, res) => {
  res.json(currentSettings);
});

app.post('/api/settings', authenticateToken, async (req, res) => {
  currentSettings = mergeSettings(defaultSettings, req.body || {});
  await saveSettingsToFile();
  res.json({ message: 'Paramètres mis à jour', settings: currentSettings });
});

// Historique depuis InfluxDB (dernières 100 mesures)
app.get('/api/history', async (req, res) => {
  if (!queryApi) {
    return res.json({ message: 'InfluxDB désactivé', data: [] });
  }

  try {
    const limit = parseInt(req.query.limit) || 100;
    const query = `
      from(bucket: "${influxBucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "plant_telemetry")
        |> pivot(rowKey:["_time"], columnKey: ["_field"], valueColumn: "_value")
        |> sort(columns: ["_time"], desc: true)
        |> limit(n: ${limit})
    `;

    const data = [];
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        data.push({
          timestamp: o._time,
          luminosite: o.luminosite || 0,
          humidite_sol: o.humidite_sol || 0,
          humidite_air: o.humidite_air || 0,
          temperature: o.temperature || 0,
          pressure: o.pressure || 0,
          rssi: o.rssi || 0,
          led_on: o.led_on || false,
          fan_on: o.fan_on || false,
          humidifier_on: o.humidifier_on || false
        });
      },
      error(error) {
        console.error('[InfluxDB] Erreur query:', error);
        res.status(500).json({ error: 'Erreur récupération données' });
      },
      complete() {
        // Inverser pour avoir les plus récentes à droite
        res.json(data.reverse());
      }
    });
  } catch (error) {
    console.error('[API] Erreur historique:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Statistiques depuis InfluxDB
app.get('/api/stats', async (req, res) => {
  if (!queryApi) {
    return res.json({ message: 'InfluxDB désactivé', stats: {} });
  }

  try {
    const query = `
      from(bucket: "${influxBucket}")
        |> range(start: -24h)
        |> filter(fn: (r) => r._measurement == "plant_telemetry")
        |> group(columns: ["_field"])
        |> mean()
    `;

    const stats = {};
    await queryApi.queryRows(query, {
      next(row, tableMeta) {
        const o = tableMeta.toObject(row);
        stats[o._field] = o._value;
      },
      error(error) {
        console.error('[InfluxDB] Erreur stats:', error);
        res.status(500).json({ error: 'Erreur récupération stats' });
      },
      complete() {
        res.json({
          avg_lux: stats.luminosite || 0,
          avg_humidity_soil: stats.humidite_sol || 0,
          avg_humidity_air: stats.humidite_air || 0,
          avg_temperature: stats.temperature || 0,
          avg_pressure: stats.pressure || 0,
          avg_rssi: stats.rssi || 0
        });
      }
    });
  } catch (error) {
    console.error('[API] Erreur stats:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API Authentification

// Login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username et password requis' });
    }

    const result = await pgPool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1 AND is_active = true',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Identifiants invalides' });
    }

    // Créer un JWT valide 7 jours
    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Mettre à jour last_login
    await pgPool.query(
      'UPDATE users SET last_login = NOW() WHERE id = $1',
      [user.id]
    );

    res.json({ token, username: user.username });
  } catch (error) {
    console.error('[AUTH] Erreur login:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Register (désactivée en production pour la sécurité)
app.post('/api/register', async (req, res) => {
  // Bloquer l'inscription en production
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Inscription désactivée en production' });
  }

  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit avoir au moins 6 caractères' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pgPool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username',
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: 'Utilisateur créé', username: result.rows[0].username });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username ou email déjà utilisé' });
    }
    console.error('[AUTH] Erreur register:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout
app.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    const token = req.headers['authorization'].split(' ')[1];
    await pgPool.query('DELETE FROM sessions WHERE token = $1', [token]);
    res.json({ message: 'Déconnecté' });
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// API Utilisateurs (PostgreSQL)
app.get('/api/users', async (req, res) => {
  try {
    const result = await pgPool.query('SELECT id, username, email, created_at, is_active FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('[API] Erreur users:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= API ADMIN (Sécurisée par token secret) =============

// Middleware pour vérifier le token admin
function requireAdminToken(req, res, next) {
  const adminToken = req.headers['x-admin-token'];
  const expectedToken = process.env.ADMIN_SECRET_TOKEN;

  if (!expectedToken) {
    return res.status(500).json({ error: 'Token admin non configuré sur le serveur' });
  }

  if (!adminToken || adminToken !== expectedToken) {
    return res.status(403).json({ error: 'Accès refusé - Token admin invalide' });
  }

  next();
}

// Lister tous les utilisateurs (ADMIN)
app.get('/api/admin/users', requireAdminToken, async (req, res) => {
  try {
    const result = await pgPool.query('SELECT id, username, email, created_at, last_login, is_active FROM users ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('[ADMIN] Erreur liste users:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Créer un utilisateur (ADMIN)
app.post('/api/admin/users', requireAdminToken, async (req, res) => {
  try {
    const { username, password, email } = req.body;

    if (!username || !password || !email) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Le mot de passe doit avoir au moins 6 caractères' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await pgPool.query(
      'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id, username, email',
      [username, email, hashedPassword]
    );

    res.status(201).json({ message: 'Utilisateur créé', user: result.rows[0] });
  } catch (error) {
    if (error.code === '23505') {
      return res.status(400).json({ error: 'Username ou email déjà utilisé' });
    }
    console.error('[ADMIN] Erreur création user:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Supprimer un utilisateur (ADMIN)
app.delete('/api/admin/users/:id', requireAdminToken, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pgPool.query('DELETE FROM users WHERE id = $1 RETURNING username', [id]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Utilisateur non trouvé' });
    }

    res.json({ message: 'Utilisateur supprimé', username: result.rows[0].username });
  } catch (error) {
    console.error('[ADMIN] Erreur suppression user:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// ============= FIN API ADMIN =============

// Supprimer un utilisateur (désactivée en production)
app.delete('/api/users/:id', async (req, res) => {
  // Bloquer la suppression en production pour la sécurité
  if (process.env.NODE_ENV === 'production') {
    return res.status(403).json({ error: 'Suppression désactivée en production' });
  }

  try {
    const { id } = req.params;
    await pgPool.query('DELETE FROM users WHERE id = $1', [id]);
    res.json({ message: 'Utilisateur supprimé' });
  } catch (error) {
    console.error('[API] Erreur suppression user:', error.message);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    mqtt: client.connected,
    postgres: pgPool.totalCount > 0,
    influxdb: true,
    uptime: process.uptime()
  });
});

// Démarrage du serveur
const PORT = process.env.PORT || 3000;
const HOST = '0.0.0.0'; // Écouter sur toutes les interfaces réseau

async function startServer() {
  await loadSettingsFromFile();
  await initDatabases();
  
  server.listen(PORT, HOST, () => {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('🌿 ESP32 Plant Monitor Server');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log(`🌐 Web interface: http://0.0.0.0:${PORT}`);
    console.log(`📊 API History: http://0.0.0.0:${PORT}/api/history`);
    console.log(`📊 API Stats: http://0.0.0.0:${PORT}/api/stats`);
    console.log(`👥 API Users: http://0.0.0.0:${PORT}/api/users`);
    console.log(`💚 Health: http://0.0.0.0:${PORT}/health`);
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  });
}

// Gestion propre de l'arrêt
process.on('SIGTERM', async () => {
  console.log('[SERVER] Arrêt en cours...');
  
  // Flush InfluxDB
  try {
    await writeApi.close();
    console.log('[InfluxDB] Données flushées');
  } catch (e) {
    console.error('[InfluxDB] Erreur flush:', e);
  }
  
  // Fermer PostgreSQL
  await pgPool.end();
  
  // Fermer MQTT
  if (client) client.end();
  
  server.close(() => {
    console.log('[SERVER] Arrêté proprement');
    process.exit(0);
  });
});

startServer().catch(error => {
  console.error('[SERVER] Erreur fatale:', error);
  process.exit(1);
});




