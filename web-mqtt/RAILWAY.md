# ESP32 IoT Plant Monitor - Web App
Ce package contient l'application web Node.js/Express pour le système de monitoring des plantes.

## Configuration pour Railway

### Variables d'environnement requises:
- `PORT`: Port d'écoute (par défaut: 3000)
- `NODE_ENV`: Environnement (production)
- `MQTT_BROKER`: URL du broker MQTT
- `POSTGRES_*`: Informations de connexion PostgreSQL
- `INFLUX_*`: Informations d'accès InfluxDB

### Déploiement:
1. Le Dockerfile build automatiquement l'application
2. Les dépendances sont installées lors du build
3. Le serveur démarre automatiquement sur le PORT configuré

### Fichiers de configuration:
- `.nvmrc`: Spécifie Node.js 18
- `.railwayignore`: Fichiers à ignorer lors du déploiement
- `Dockerfile`: Configuration du conteneur multi-stage
- `package.json`: Dépendances et scripts
