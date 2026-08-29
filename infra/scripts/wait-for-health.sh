#!/bin/sh
set -eu

: "${COMPOSE_FILE:=infra/compose.yaml}"
: "${COMPOSE_ENV_FILE:=.env}"

services="postgres redis minio"
retry=0
limit=45

container_id() {
  service="$1"
  docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps -aq "$service"
}

while true; do
  unhealthy=0

  for service in $services; do
    container="$(container_id "$service")"
    if [ -z "$container" ]; then
      unhealthy=1
      break
    fi

    state="$(docker inspect --format '{{.State.Status}}' "$container")"
    health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}' "$container")"
    if [ "$state" != "running" ] || [ "$health" != "healthy" ]; then
      unhealthy=1
      break
    fi
  done

  init_container="$(container_id minio-init)"
  if [ -z "$init_container" ]; then
    unhealthy=1
  else
    init_state="$(docker inspect --format '{{.State.Status}}' "$init_container")"
    init_exit_code="$(docker inspect --format '{{.State.ExitCode}}' "$init_container")"
    if [ "$init_state" != "exited" ] || [ "$init_exit_code" != "0" ]; then
      unhealthy=1
    fi
  fi

  if [ "$unhealthy" -eq 0 ]; then
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
    exit 0
  fi

  retry=$((retry + 1))
  if [ "$retry" -ge "$limit" ]; then
    echo "Timed out waiting for healthy infrastructure"
    docker compose --env-file "$COMPOSE_ENV_FILE" -f "$COMPOSE_FILE" ps
    exit 1
  fi
  sleep 2
done
