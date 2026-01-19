const mqtt = require('mqtt');
const express = require('express');
const http = require('http');
const { Server } = require("socket.io");

const MQTT_BROKER = 'mqtt://localhost:1883';
const TOPIC_TELEMETRY = 'tp/esp32/telemetry';
const TOPIC_CMD = 'tp/esp32/cmd';

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

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

server.listen(3000, () => {
  console.log('🌐 Web sur http://localhost:3000');
});




