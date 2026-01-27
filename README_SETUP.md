# ESP32 IoT Plant Monitor

Système complet de monitoring des plantes avec ESP32, MQTT, PostgreSQL et InfluxDB.

## Structure du projet

```
esp32-iot-plant/
├── esp32/                 # Code firmware ESP32
├── mqtt-docker/           # Configuration MQTT (Mosquitto)
├── web-mqtt/              # Application web Node.js/Express
├── docker-compose.yml     # Orchestration locale de tous les services
└── .env.example           # Variables d'environnement
```

## Démarrage rapide (Développement local)

### Prérequis
- Docker & Docker Compose installés
- Node.js 18+ (pour développement)

### Lancer tous les services

```bash
# 1. Copier le fichier .env.example en .env et ajuster si nécessaire
cp .env.example .env

# 2. Démarrer tous les services
docker-compose up -d

# 3. Vérifier le status
docker-compose ps
```

### Services disponibles

| Service | URL/Port | Description |
|---------|----------|-------------|
| **Web App** | http://localhost:3000 | Interface web |
| **Nginx** | http://localhost | Reverse proxy |
| **MQTT Broker** | localhost:1883 | Mosquitto MQTT |
| **PostgreSQL** | localhost:5432 | Base de données utilisateurs |
| **InfluxDB** | http://localhost:8086 | Time-series database |

### Arrêter les services

```bash
docker-compose down
```

## Déploiement sur Railway

### Web App
Deploy le contenu du dossier `web-mqtt/` sur Railway avec les variables d'environnement:
- `MQTT_BROKER` - URL du broker MQTT
- `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`
- `INFLUX_URL`, `INFLUX_TOKEN`, `INFLUX_ORG`, `INFLUX_BUCKET`

### MQTT Broker
Deploy le contenu du dossier `mqtt-docker/` sur Railway

### Bases de données
Utiliser les services gérés Railway pour:
- PostgreSQL
- InfluxDB

## Architecture

- **ESP32**: Collecte les données des capteurs (humidité, luminosité, température)
- **MQTT**: Transmet les données en temps réel
- **PostgreSQL**: Stocke les comptes utilisateurs et configurations
- **InfluxDB**: Stocke les données de télémétrie chronologiques
- **Web App**: Interface de visualisation et contrôle
- **Nginx**: Reverse proxy pour la production

## Documentation

- [Configuration MQTT](./mqtt-docker/RAILWAY.md)
- [Web App](./web-mqtt/RAILWAY.md)
- [Code ESP32](./esp32/esp32_plant.ino)
