#!/bin/sh
set -eu

if [ "${1:-}" = "--confirm" ] || [ "${1:-}" = "--yes" ]; then
  shift
else
  printf 'This is destructive. Type YES to continue: '
  read -r confirm
  if [ "$confirm" != "YES" ]; then
    echo "Reset aborted"
    exit 1
  fi
fi

: "${COMPOSE_FILE:=infra/compose.yaml}"
: "${COMPOSE_ENV_FILE:=.env}"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" down -v --remove-orphans
docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis minio minio-init
COMPOSE_FILE="$COMPOSE_FILE" COMPOSE_ENV_FILE="$COMPOSE_ENV_FILE" sh infra/scripts/wait-for-health.sh
