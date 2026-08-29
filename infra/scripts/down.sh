#!/bin/sh
set -eu

: "${COMPOSE_FILE:=infra/compose.yaml}"
: "${COMPOSE_ENV_FILE:=.env}"

docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" down
