#!/bin/sh
set -e

PGHOST="${PGHOST:-postgres}"
PGPORT="${PGPORT:-5432}"
PGUSER="${PGUSER:-yercaud}"

echo "Waiting for postgres at ${PGHOST}:${PGPORT}..."
until pg_isready -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" >/dev/null 2>&1; do
  sleep 1
done
echo "Postgres is ready."

echo "Running migrations..."
npm run migrate:up

echo "Seeding reference data (roles + taxonomies)..."
npm run seed:reference

if [ "$NODE_ENV" != "production" ] && [ "${SEED_DEMO:-true}" = "true" ]; then
  echo "Seeding demo content..."
  npm run seed:demo
fi

if [ -n "$ADMIN_EMAIL" ] && [ -n "$ADMIN_PASSWORD" ]; then
  echo "Bootstrapping Super Admin ($ADMIN_EMAIL)..."
  npm run bootstrap:admin
fi

echo "Starting backend..."
exec "$@"
