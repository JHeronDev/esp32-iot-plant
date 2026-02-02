const net = require('net');

const PROXY_PORT = process.env.PORT || 8080;
const MQTT_HOST = '127.0.0.1';
const MQTT_PORT = 1883;

console.log(`[TCP Proxy] Démarrage sur le port ${PROXY_PORT}`);
console.log(`[TCP Proxy] Redirige vers ${MQTT_HOST}:${MQTT_PORT}`);

const server = net.createServer((clientSocket) => {
  console.log(`[TCP Proxy] Connexion depuis ${clientSocket.remoteAddress}:${clientSocket.remotePort}`);
  
  const mqttSocket = net.createConnection({
    host: MQTT_HOST,
    port: MQTT_PORT
  }, () => {
    console.log(`[TCP Proxy] Connecté au broker MQTT`);
  });

  clientSocket.pipe(mqttSocket);
  mqttSocket.pipe(clientSocket);

  clientSocket.on('error', (err) => {
    console.error(`[TCP Proxy] Erreur client:`, err.message);
    mqttSocket.destroy();
  });

  mqttSocket.on('error', (err) => {
    console.error(`[TCP Proxy] Erreur MQTT:`, err.message);
    clientSocket.destroy();
  });

  clientSocket.on('close', () => mqttSocket.destroy());
  mqttSocket.on('close', () => clientSocket.destroy());
});

server.listen(PROXY_PORT, '0.0.0.0', () => {
  console.log(`[TCP Proxy] ✓ Écoute sur 0.0.0.0:${PROXY_PORT}`);
});

server.on('error', (err) => {
  console.error(`[TCP Proxy] Erreur:`, err);
  process.exit(1);
});
