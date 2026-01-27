# Multi-service container for MQTT infrastructure
FROM docker:latest

WORKDIR /app

# Copier la configuration
COPY docker-compose.yml .
COPY mosquitto/ ./mosquitto/
COPY postgres/ ./postgres/

# Exposer les ports
# 1883 - MQTT
# 9001 - MQTT WebSocket
# 5432 - PostgreSQL
# 8086 - InfluxDB

EXPOSE 1883 9001 5432 8086

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD docker ps --filter "name=mqtt-broker" --filter "status=running" | grep -q mqtt-broker || exit 1

# Démarrer les services
CMD ["docker-compose", "up"]
