# Image avec Node.js pour le proxy TCP
FROM node:18-alpine

# Installer Mosquitto
RUN apk add --no-cache mosquitto mosquitto-clients

# Créer répertoires
RUN mkdir -p /mosquitto/config /mosquitto/data /mosquitto/log && \
    chown -R node:node /mosquitto

WORKDIR /app

# Copier fichiers
COPY tcp-proxy.js ./
COPY start.sh ./
COPY mosquitto/mosquitto.conf /mosquitto/config/mosquitto.conf

# Rendre le script exécutable
RUN chmod +x start.sh

USER node

# Railway utilise $PORT (dynamique)
EXPOSE 8080

CMD ["./start.sh"]
