#!/bin/sh
set -eu

: "${COMPOSE_FILE:=infra/compose.yaml}"
: "${COMPOSE_ENV_FILE:=.env}"

if [ ! -f "$COMPOSE_ENV_FILE" ]; then
  echo "Missing $COMPOSE_ENV_FILE. Copy .env.example to .env first."
  exit 1
fi

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis minio minio-init
COMPOSE_FILE="$COMPOSE_FILE" COMPOSE_ENV_FILE="$COMPOSE_ENV_FILE" sh infra/scripts/wait-for-health.sh
