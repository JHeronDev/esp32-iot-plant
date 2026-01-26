# 🌱 ESP32 IoT Plant Monitor

Système complet de surveillance et contrôle de plante connectée avec ESP32, MQTT, MySQL et interface web temps réel.

## 📋 Fonctionnalités

### 🔧 Capteurs et Actuateurs
- **Luminosité** : Capteur BH1750 (0-65535 lux)
- **Humidité du sol** : Capteur capacitif (0-100%)
- **CO2** : Simulation (400-800 ppm)
- **Signal WiFi** : RSSI en temps réel
- **Contrôles** : LED, Pompe d'arrosage, Ventilateur

### 🌐 Interface Web
- Dashboard responsive (mobile/desktop)
- Visualisation en cercles colorés
- Graphiques historiques interactifs
- Alertes en temps réel
- Indicateur de connexion

### 💾 Backend
- MQTT broker (Mosquitto)
- PostgreSQL pour gestion des comptes
- InfluxDB pour données time-series
- API REST
- WebSocket temps réel
- Alertes email automatiques

## 🏗️ Architecture

```
esp32-iot-plant/
├── esp32/                  # Code Arduino pour ESP32
│   └── esp32_plant.ino
├── mqtt-docker/            # Services Docker
│   ├── docker-compose.yml
│   ├── mosquitto/
│   │   └── mosquitto.conf
│   └── postgres/
│       └── init.sql
└── web-mqtt/               # Application web Node.js
    ├── Dockerfile
    ├── package.json
    ├── server.js
    └── public/
        └── index.html
```

## 🚀 Installation

### Prérequis
- Docker & Docker Compose
- Arduino IDE (pour ESP32)
- Capteurs : BH1750, capteur d'humidité du sol

### 1. Configuration de l'environnement

Copier le fichier d'exemple et configurer vos paramètres :

```bash
cp .env.example .env
```

Éditer [.env](.env) avec vos informations :

```env
# PostgreSQL (Gestion des comptes)
POSTGRES_DB=iot_plant
POSTGRES_USER=iot_user
POSTGRES_PASSWORD=votremotdepasse

# InfluxDB (Données télémétrie)
INFLUX_ORG=iot_org
INFLUX_BUCKET=plant_data
INFLUX_TOKEN=votretoken123456

# Email (optionnel pour alertes)
EMAIL_USER=votre-email@gmail.com
EMAIL_PASSWORD=votre-app-password
EMAIL_TO=destinataire@example.com
```

### 2. Démarrage des services Docker

```bash
cd mqtt-docker
docker-compose up -d
```

Vérifier l'état des services :

```bash
docker-compose ps
docker-compose logs -f
```

### 3. Configuration ESP32

#### Installation des bibliothèques Arduino
- WiFi
- PubSubClient
- Wire
- BH1750

#### Câblage
```
ESP32          BH1750
GPIO 22   -->  SDA
GPIO 21   -->  SCL
3.3V      -->  VCC
GND       -->  GND

ESP32          Capteur Sol
GPIO 34   -->  AOUT
3.3V      -->  VCC
GND       -->  GND

ESP32          Actuateurs
GPIO 2    -->  LED
GPIO 14   -->  Ventilateur
GPIO 13   -->  Pompe
```

#### Configuration du code
Modifier dans [esp32/esp32_plant.ino](esp32/esp32_plant.ino) :

```cpp
// Activer/désactiver les serveurs
bool USE_SERVER_1 = true;
bool USE_SERVER_2 = false;

// Adresses IP (trouver avec: docker inspect mqtt-broker)
const char* MQTT_HOST1 = "172.16.8.160";

// WiFi
const char* WIFI_SSID = "VotreSSID";
const char* WIFI_PASS = "VotreMotDePasse";
```

#### Upload du code
1. Sélectionner la carte : **ESP32 Dev Module**
2. Sélectionner le port COM
3. Téléverser

## 📊 Utilisation

### Interface Web
Accéder à : **http://localhost:3000**

- **Cercles de capteurs** : Affichent les valeurs en temps réel
- **Cliquer sur les cercles** : Active/désactive les actuateurs
- **Graphique** : Historique des 100 dernières mesures
- **Alertes** : Notifications en haut à droite

### API REST

#### Historique depuis InfluxDB
```bash
GET http://localhost:3000/api/history?limit=100
```

#### Statistiques 24h (moyennes)
```bash
GET http://localhost:3000/api/stats
```

#### Liste des utilisateurs
```bash
GET http://localhost:3000/api/users
```

#### Santé du serveur
```bash
GET http://localhost:3000/health
```

Réponse :
```json
{
  "status": "ok",
  "mqtt": true,
  "postgres": true,
  "influxdb": true,
  "uptime": 3600
}
```

## 🎯 Seuils et Alertes

| Capteur | Optimal | Alerte |
|---------|---------|--------|
| Luminosité | 500-10000 lux | < 500 ou > 10000 |
| Humidité sol | 30-70% | < 30% (email envoyé) |
| CO2 | 400-1200 ppm | > 1200 |
| WiFi | > -70 dB | < -80 dB |

## 🛠️ Commandes Docker

```bash
# Démarrer les services
docker-compose up -d

# Arrêter les services
docker-compose down

# Voir les logs
docker-compose logs -f web

# Redémarrer un service
docker-compose restart web

# Supprimer volumes (⚠️ efface les données)
docker-compose down -v
```

## 🔧 Développement

### Mode développement (avec auto-reload)

Installer nodemon :
```bash
cd web-mqtt
npm install
npm run dev
```

### Structure des bases de données

#### PostgreSQL (Comptes utilisateurs)
```sql
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### InfluxDB (Données time-series)
```
Measurement: plant_telemetry
Fields: luminosite, humidite_sol, co2, rssi
Timestamp: automatique
```

## 📝 Topics MQTT

| Topic | Direction | Format |
|-------|-----------|--------|
| `tp/esp32/telemetry` | ESP32 → Server | JSON |
| `tp/esp32/cmd` | Server → ESP32 | String |

### Exemple télémétrie
```json
{
  "luminosite": 1234.5,
  "humidite_sol": 45.2,
  "co2": 650,
  "rssi": -65
}
```

### Commandes disponibles
- `LED_ON` / `LED_OFF`
- `FAN_ON` / `FAN_OFF`
- `HUM_ON` / `HUM_OFF`

## 🐛 Dépannage

### ESP32 ne se connecte pas au WiFi
- Vérifier SSID et mot de passe
- Vérifier la portée WiFi
- Vérifier le moniteur série (115200 baud)

### Pas de connexion MQTT
- Vérifier que le broker est démarré : `docker-compose ps`
- Vérifier l'adresse IP : `docker inspect mqtt-broker | grep IPAddress`
- Tester avec mosquitto_pub/sub

### Interface web ne reçoit pas de données
- Vérifier les logs : `docker-compose logs -f web`
- Vérifier la console du navigateur (F12)
- Tester l'API : `curl http://localhost:3000/health`

### Bases de données ne fonctionnent pas
- Vérifier les credentials dans [.env](.env)
- Vérifier les logs : `docker-compose logs postgres` ou `docker-compose logs influxdb`
- InfluxDB UI : http://localhost:8086 (user: admin)

## 🔒 Sécurité

### Production
- ✅ Utilisateur non-root dans Docker
- ✅ Variables d'environnement pour credentials
- ✅ Healthchecks actifs
- ✅ Restart policies configurées
- ⚠️ Activer l'authentification MQTT (mosquitto.conf)
- ⚠️ Utiliser HTTPS en production
- ⚠️ Firewall pour les ports exposés

## 📦 Optimisations

### Docker
- Multi-stage build (réduction de 50% de la taille)
- Volumes nommés pour persistence
- Networks isolés
- Healthchecks automatiques

### Backend
- PostgreSQL pour comptes utilisateurs
- InfluxDB pour stockage time-series optimisé
- Pas de cache mémoire (tout en base)
- Gestion d'erreurs robuste
- Logs structurés
- Arrêt propre avec flush InfluxDB (SIGTERM)

### Frontend
- Responsive design
- Reconnexion WebSocket automatique
- Indicateur de connexion
- Accessibilité (ARIA, clavier)

## 📄 Licence

MIT

## 👤 Auteur

Projet ESP32 IoT Plant Monitor

## 🙏 Remerciements

- Eclipse Mosquitto
- Chart.js
- Socket.io
- Node.js & Express
