# Mosquitto MQTT Broker
FROM eclipse-mosquitto:latest

# Copier la configuration personnalisée
COPY mosquitto/mosquitto.conf /mosquitto/config/mosquitto.conf

# Exposer les ports MQTT
EXPOSE 1883 9001

# Healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD mosquitto_sub -t "$SYS/#" -C 1 -i healthcheck -W 3 || exit 1
