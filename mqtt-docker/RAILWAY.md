# ESP32 IoT Plant Monitor - MQTT Broker
Ce package contient le broker MQTT Mosquitto.

## Configuration pour Railway

### Service fourni:
- **Mosquitto**: Broker MQTT (ports 1883, 9001)

### Déploiement:
1. Le Dockerfile build l'image Mosquitto
2. La configuration personnalisée est copiée dans le conteneur
3. Le broker démarre automatiquement

### Ports exposés:
- 1883: MQTT (TCP)
- 9001: MQTT WebSocket

## Configuration locale (docker-compose)
Pour le développement local, utilise le `docker-compose.yml` à la racine du projet:
```bash
docker-compose up
```

Cela démarrera:
- Mosquitto (MQTT Broker)
- PostgreSQL (Database)
- InfluxDB (Time-series Database)
- Web App (Node.js)
- Nginx (Reverse Proxy)
