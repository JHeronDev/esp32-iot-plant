FROM postgres:16-alpine

# Copier le script d'initialisation
COPY init.sql /docker-entrypoint-initdb.d/

# Configuration PostgreSQL
ENV POSTGRES_DB=${POSTGRES_DB:-iot_plant}
ENV POSTGRES_USER=${POSTGRES_USER:-iot_user}
ENV POSTGRES_PASSWORD=${POSTGRES_PASSWORD:-iot_password}

# Port PostgreSQL
EXPOSE 5432

# Healthcheck
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD pg_isready -U ${POSTGRES_USER:-iot_user} -d ${POSTGRES_DB:-iot_plant}
