# 🚀 Déploiement sur Railway

## Services à déployer

### 1. **MQTT Broker** (Mosquitto)
- **Dossier:** `mqtt-docker/`
- **Dockerfile:** `mqtt-docker/Dockerfile`
- **Ports:** 1883 (MQTT), 9001 (WebSocket)
- **Variables:** Aucune requise

### 2. **PostgreSQL**
- **Dossier:** `mqtt-docker/postgres/`
- **Dockerfile:** `mqtt-docker/postgres/Dockerfile`
- **Port:** 5432
- **Variables:**
  - `POSTGRES_USER`: iot_user
  - `POSTGRES_PASSWORD`: [à générer]
  - `POSTGRES_DB`: iot_plant

### 3. **InfluxDB**
- **Dossier:** `mqtt-docker/influxdb/`
- **Dockerfile:** `mqtt-docker/influxdb/Dockerfile`
- **Port:** 8086
- **Variables:**
  - `INFLUX_USER`: admin
  - `INFLUX_PASSWORD`: [à générer]
  - `INFLUX_ORG`: iot_org
  - `INFLUX_BUCKET`: plant_data
  - `INFLUX_TOKEN`: [à générer]

### 4. **Web App** (Node.js)
- **Dossier:** `web-mqtt/`
- **Dockerfile:** `web-mqtt/Dockerfile`
- **Port:** 3000
- **Variables:**
  ```
  MQTT_BROKER=mqtt://mqtt-production-xxx.up.railway.app:1883
  POSTGRES_HOST=[postgresql-service].railway.internal
  POSTGRES_USER=iot_user
  POSTGRES_PASSWORD=[même que PostgreSQL]
  POSTGRES_DATABASE=iot_plant
  INFLUX_URL=http://[influxdb-service].railway.internal:8086
  INFLUX_TOKEN=[même que InfluxDB]
  INFLUX_ORG=iot_org
  INFLUX_BUCKET=plant_data
  NODE_ENV=production
  PORT=3000
  ```

## Ordre de déploiement

1. **MQTT Broker** - Indépendant
2. **PostgreSQL** - Indépendant
3. **InfluxDB** - Indépendant
4. **Web App** - Dépend des 3 autres

## URLs internes Railway

Une fois tous les services créés, tu peux utiliser:
- MQTT: `mqtt://mosquitto-service.railway.internal:1883`
- PostgreSQL: `postgres-service.railway.internal:5432`
- InfluxDB: `http://influxdb-service.railway.internal:8086`

Remplace `mosquitto-service`, `postgres-service`, `influxdb-service` par les noms réels de tes services.

## Configuration rapide

Pour chaque service sur Railway:
1. Clique **+ New** → **GitHub Repo** ou **Empty Service**
2. Sélectionne ce repo
3. Configure le **Dockerfile path** (voir tableau ci-dessus)
4. Ajoute les **variables d'environnement**
5. Déploie

Tous les Dockerfiles et `railway.json` sont déjà prêts! 🎉
