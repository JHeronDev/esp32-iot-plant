# Mosquitto MQTT Broker simple
FROM eclipse-mosquitto:latest

# Copier la configuration
COPY mosquitto/mosquitto.conf /mosquitto/config/mosquitto.conf

# Railway map automatiquement le TCP Proxy vers ce port
EXPOSE 1883

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD mosquitto_sub -t "$$SYS/#" -C 1 -i healthcheck -W 3 || exit 1

