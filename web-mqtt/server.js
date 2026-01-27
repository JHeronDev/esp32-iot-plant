const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const bcrypt = require('bcrypt');
const crypto = require('crypto');
// const nodemailer = require('nodemailer');
const { Pool } = require('pg');
const { InfluxDB, Point } = require('@influxdata/influxdb-client');

// Configuration depuis variables d'environnement
const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';

// PostgreSQL pour les comptes utilisateurs
const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: process.env.POSTGRES_PORT || 5432,
  database: process.env.POSTGRES_DATABASE || 'iot_plant',
  user: process.env.POSTGRES_USER || 'iot_user',
  password: process.env.POSTGRES_PASSWORD || 'iot_password',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

// InfluxDB pour les données de télémétrie
const influxURL = process.env.INFLUX_URL || 'http://localhost:8086';
const influxToken = process.env.INFLUX_TOKEN || 'mytoken123456';
const influxOrg = process.env.INFLUX_ORG || 'iot_org';
const influxBucket = process.env.INFLUX_BUCKET || 'plant_data';

const influxDB = new InfluxDB({ url: influxURL, token: influxToken });
const writeApi = influxDB.getWriteApi(influxOrg, influxBucket, 'ms');
const queryApi = influxDB.getQueryApi(influxOrg);

const TOPIC_TELEMETRY = 'tp/esp32/telemetry';
const TOPIC_CMD = 'tp/esp32/cmd';

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

// Middleware d'authentification
async function authenticateToken(req, res, next) {
  const token = req.headers['authorization']?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Pas de token' });
  }

  try {
    const result = await pgPool.query(
      'SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW()',
      [token]
    );
    
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Token invalide ou expiré' });
    }
    
    req.user = result.rows[0];
    next();
  } catch (error) {
    res.status(500).json({ error: 'Erreur serveur' });
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

  try {
    // Test InfluxDB avec un ping simple
    const healthAPI = new InfluxDB({ url: influxURL, token: influxToken }).getHealthAPI();
    const health = await healthAPI.getHealth();
    console.log('[InfluxDB] Connecté avec succès - Statut:', health.status);
  } catch (error) {
    console.error('[InfluxDB] Erreur de connexion:', error.message);
    console.log('[InfluxDB] Le serveur continue sans InfluxDB');
  }
}

// Sauvegarde dans InfluxDB
function saveTelemetryToInflux(data) {
  try {
    const point = new Point('plant_telemetry')
      .floatField('luminosite', data.luminosite)
      .floatField('humidite_sol', data.humidite_sol)
      .intField('co2', data.co2)
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

client.on('connect', () => {
  console.log('[MQTT] Connecté au broker');
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
});

client.on('message', async (topic, message) => {
  if (topic === TOPIC_TELEMETRY) {
    try {
      const data = JSON.parse(message.toString());
      console.log('[MQTT] Données reçues:', data);

      // Ajouter timestamp
      data.timestamp = new Date().toISOString();

      // Sauvegarder dans InfluxDB
      saveTelemetryToInflux(data);

      // Vérifier alertes (désactivé)
      /*
      if (data.humidite_sol < 30) {
        await sendAlertEmail(
          '🚨 Alerte Plante - Humidité Faible',
          `L'humidité du sol est trop basse: ${data.humidite_sol}%\nAction recommandée: Arroser la plante.`
        );
        io.emit('alert', {
          type: 'low_soil',
          message: `Humidité du sol: ${data.humidite_sol}%`,
          timestamp: data.timestamp
        });
      }

      if (data.luminosite > 65000) {
        io.emit('alert', {
          type: 'high_light',
          message: `Luminosité très élevée: ${data.luminosite} lux`,
          timestamp: data.timestamp
        });
      }
      */

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

  // Authentification WebSocket
  socket.on('auth', async (token) => {
    try {
      const result = await pgPool.query(
        'SELECT u.id, u.username FROM sessions s JOIN users u ON s.user_id = u.id WHERE s.token = $1 AND s.expires_at > NOW()',
        [token]
      );
      
      if (result.rows.length > 0) {
        authenticatedUser = result.rows[0];
        socket.emit('auth_success', { username: authenticatedUser.username });
      } else {
        socket.emit('auth_error', { message: 'Token invalide' });
      }
    } catch (error) {
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

// Historique depuis InfluxDB (dernières 100 mesures)
app.get('/api/history', async (req, res) => {
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
          co2: o.co2 || 0,
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
          avg_humidity: stats.humidite_sol || 0,
          avg_co2: stats.co2 || 0,
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

    // Créer un token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 jours

    await pgPool.query(
      'INSERT INTO sessions (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt]
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

// Register (optionnel)
app.post('/api/register', async (req, res) => {
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




