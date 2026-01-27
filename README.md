# 🌱 ESP32 IoT Plant Monitor

Système complet de surveillance et contrôle de plante connectée avec ESP32, MQTT, PostgreSQL, InfluxDB et interface web temps réel.

## 📋 Fonctionnalités

### 🔧 Capteurs et Actuateurs
- **Luminosité** : Capteur BH1750 (0-65535 lux)
- **Humidité du sol** : Capteur capacitif (0-100%)
- **Signal WiFi** : RSSI en temps réel
- **Contrôles** : LED, Pompe d'arrosage, Ventilateur

### 🌐 Interface Web
- Dashboard responsive (mobile/desktop)
- Visualisation en cercles colorés
- Graphiques historiques interactifs
- Indicateur de connexion et d'authentification JWT
- Panneau Parametres pour ajuster les seuils capteurs

### 💾 Backend
- MQTT broker (Mosquitto)
- PostgreSQL pour gestion des comptes
- InfluxDB pour données time-series
- API REST + WebSocket temps réel (authentification JWT 7 jours)
- API Admin sécurisée par jeton secret (x-admin-token)
- Seuils capteurs persistés en JSON (fichier settings)

## 🏗️ Architecture

```
esp32-iot-plant/
├── esp32/                  # Code Arduino pour ESP32
│   └── esp32_plant.ino
├── mqtt-docker/            # Configuration MQTT / bases
│   ├── mosquitto/
│   │   └── mosquitto.conf
│   └── postgres/
│       └── init.sql
└── web-mqtt/               # Application web Node.js
  ├── package.json
  ├── server.js           # API REST + WebSocket + MQTT bridge
  └── public/
    ├── index.html      # Structure HTML (sans styles inline)
    ├── style.css       # Styles globaux et panneau Parametres
    └── app.js          # Auth JWT, WebSocket, graphiques, seuils
```

## 🚀 Installation

### Prérequis
- Node.js 18+
- Arduino IDE (pour ESP32)
- Capteurs : BH1750, capteur d'humidité du sol

### 1. Configuration de l'environnement

Copier le fichier d'exemple et configurer vos paramètres :

```bash
cp .env.example .env
```

Variables principales à renseigner :

```env
# Web / Auth
PORT=3000
NODE_ENV=production
JWT_SECRET=change-moi
ADMIN_SECRET_TOKEN=change-moi-aussi

# MQTT
MQTT_BROKER=mqtt://<hote>:1883

# PostgreSQL (comptes utilisateurs)
DATABASE_URL=postgres://<user>:<pass>@<host>:<port>/<db>

# InfluxDB (télémétrie)
INFLUX_URL=http://<host>:8086
INFLUX_TOKEN=<token>
INFLUX_ORG=iot_org
INFLUX_BUCKET=plant_data
```

### 2. Lancer le serveur web

```bash
cd web-mqtt
npm install
npm start
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

ESP32          Actionneurs
GPIO 2    -->  LED
GPIO 14   -->  Ventilateur
GPIO 13   -->  Pompe
```

#### Configuration du code
Modifier dans [esp32/esp32_plant.ino](esp32/esp32_plant.ino) :

```cpp
// Broker MQTT
const char* MQTT_HOST = "<hote-mqtt>";
const int   MQTT_PORT = 1883;

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

- Cercles de capteurs en temps réel (couleurs selon seuils)
- Boutons LED / Arrosage / Ventilation (auth requise)
- Graphique : dernières 100 mesures (luminosité, humidité, température, pression)
- Panneau Parametres : seuils min/max éditables (auth requise)

### API REST

- Historique InfluxDB : `GET /api/history?limit=100`
- Statistiques 24h : `GET /api/stats`
- Paramètres capteurs : `GET/POST /api/settings` (JWT obligatoire)
- Liste utilisateurs : `GET /api/users`
- Admin utilisateurs : `GET/POST/DELETE /api/admin/users` (header `x-admin-token`)
- Santé serveur : `GET /health`

## 🎯 Seuils et Alertes

Seuils par défaut (éditables dans le panneau Parametres ou via `/api/settings`):

| Capteur | Optimal | Alerte |
|---------|---------|--------|
| Luminosité | 500-10000 lux | < 500 ou > 10000 |
| Humidité sol | 30-70% | < 30% |
| Température | 15-30 °C | < 15 ou > 30 |
| Pression | 990-1030 hPa | < 990 ou > 1030 |
| WiFi | > -70 dB | < -80 dB |

## 🔧 Développement

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
- Tester la connexion PostgreSQL / InfluxDB avec les outils clients
- InfluxDB UI : http://localhost:8086

## 🔒 Sécurité

### Production
- ✅ JWT signé avec `JWT_SECRET` robuste
- ✅ Token admin séparé (`x-admin-token`)
- ✅ Variables d'environnement pour credentials
- ✅ Healthchecks pour MQTT / PostgreSQL / InfluxDB
- ⚠️ Activer l'authentification MQTT (mosquitto.conf)
- ⚠️ Utiliser HTTPS et certificats valides
- ⚠️ Firewall pour les ports exposés

## 📦 Optimisations

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
- Auth JWT (7 jours), panneau Parametres, graphiques Chart.js
- Accessibilité (ARIA, clavier)

## 👤 Auteur

Emile
Enzo
Julien

## 🙏 Remerciements

Personne, fallait être là
