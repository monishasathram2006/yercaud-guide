# Build context is the repo root (see docker-compose.yml) so this stage can
# reach ../database — seed-reference.ts resolves it as ../../database relative
# to backend/scripts, i.e. a sibling of backend/ under WORKDIR's parent.
FROM node:22-bookworm-slim

# python3/make/g++: fallback native build for argon2 if no prebuilt binary
# matches this image's platform. postgresql-client: pg_isready for entrypoint.
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/backend

COPY backend/package.json backend/package-lock.json ./
RUN npm install

COPY backend/ ./
COPY database/ /app/database

RUN chmod +x docker/entrypoint.sh

ENV NODE_ENV=development
EXPOSE 4000

ENTRYPOINT ["docker/entrypoint.sh"]
CMD ["npm", "run", "dev"]
