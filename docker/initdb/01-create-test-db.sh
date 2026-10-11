#!/bin/sh
# Creates a separate database for the e2e tests (they wipe it on every run).
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -c "CREATE DATABASE \"${DB_TEST_NAME:-cinema_test}\" OWNER \"$POSTGRES_USER\""
