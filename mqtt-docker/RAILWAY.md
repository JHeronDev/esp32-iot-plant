# ESP32 IoT Plant Monitor - MQTT Stack
Ce package contient l'infrastructure MQTT (Mosquitto), PostgreSQL et InfluxDB.

## Configuration pour Railway

### Services inclus:
- **Mosquitto**: Broker MQTT (ports 1883, 9001)
- **PostgreSQL**: Base de données pour les comptes utilisateurs
- **InfluxDB**: Base de données time-series pour les données de télémétrie

### Variables d'environnement requises:
- `POSTGRES_PASSWORD`: Mot de passe PostgreSQL
- `INFLUX_PASSWORD`: Mot de passe InfluxDB
- `INFLUX_TOKEN`: Token d'authentification InfluxDB

### Déploiement:
1. Le Dockerfile utilise docker-compose pour orchestrer les services
2. Les fichiers de configuration sont copiés dans le conteneur
3. Les services s'auto-démarrent avec docker-compose up

### Ports exposés:
- 1883: MQTT (TCP)
- 9001: MQTT WebSocket
- 5432: PostgreSQL
- 8086: InfluxDB

### Fichiers de configuration:
- `.nvmrc`: Spécifie Node.js 18
- `.railwayignore`: Fichiers à ignorer lors du déploiement
- `Dockerfile`: Configuration du conteneur
- `package.json`: Métadonnées du projet
- `docker-compose.yml`: Orchestration des services
