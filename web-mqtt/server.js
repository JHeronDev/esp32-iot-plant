const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");
const nodemailer = require('nodemailer');

const MQTT_BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const TOPIC_TELEMETRY = 'tp/esp32/telemetry';
const TOPIC_CMD = 'tp/esp32/cmd';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Historique en mémoire (dernier 100 messages)
let telemetryHistory = [];

// Configuration email (à personnaliser avec vos credentials)
const transporter = nodemailer.createTransport({
  service: 'gmail', // ou autre service
  auth: {
    user: 'votre-email@gmail.com', // Remplacez par votre email
    pass: 'votre-mot-de-passe' // Remplacez par votre mot de passe ou app password
  }
});

// Fonction pour envoyer une alerte email
function sendAlertEmail(subject, message) {
  const mailOptions = {
    from: 'votre-email@gmail.com',
    to: 'destinataire@example.com', // Email de destination
    subject: subject,
    text: message
  };

  transporter.sendMail(mailOptions, (error, info) => {
    if (error) {
      console.log('[EMAIL] Erreur:', error);
    } else {
      console.log('[EMAIL] Alerte envoyée:', info.response);
    }
  });
}

// MQTT
const client = mqtt.connect(MQTT_BROKER);

client.on('connect', () => {
  console.log('[MQTT] Connecté');
  client.subscribe(TOPIC_TELEMETRY);
});

client.on('message', (topic, message) => {
  if (topic === TOPIC_TELEMETRY) {
    const data = JSON.parse(message.toString());
    console.log('[MQTT]', data);

    // Ajouter timestamp
    data.timestamp = new Date().toISOString();

    // Stocker dans l'historique
    telemetryHistory.unshift(data);
    if (telemetryHistory.length > 100) {
      telemetryHistory.pop();
    }

    // Vérifier alertes
    if (data.humidite_sol < 30) {
      sendAlertEmail('Alerte Plante', `Humidité du sol trop basse: ${data.humidite_sol}%`);
      io.emit('alert', { type: 'low_soil', message: `Humidité du sol: ${data.humidite_sol}%` });
    }

    io.emit('telemetry', data);
  }
});

// WebSocket
io.on('connection', (socket) => {
  console.log('[WEB] Client connecté');

  socket.on('cmd', (cmd) => {
    console.log('[CMD]', cmd);
    client.publish(TOPIC_CMD, cmd);
  });
});

// API pour l'historique
app.get('/api/history', (req, res) => {
  res.json(telemetryHistory);
});

server.listen(3000, () => {
  console.log('🌐 Web sur http://localhost:3000');
});




