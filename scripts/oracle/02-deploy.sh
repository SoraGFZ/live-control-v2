#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT_DIR}"

ENV_FILE="${ROOT_DIR}/.env.oracle"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Falta ${ENV_FILE}"
  echo "Copia deploy/oracle/.env.oracle.example y edita DOMAIN=tu-subdominio.duckdns.org"
  exit 1
fi

set -a
# shellcheck disable=SC1090
source "${ENV_FILE}"
set +a

if [[ -z "${DOMAIN:-}" ]]; then
  echo "DOMAIN vacio en .env.oracle"
  exit 1
fi

echo "==> Desplegando Live Control en https://${DOMAIN}"
docker compose --env-file "${ENV_FILE}" -f docker-compose.oracle.yml up -d --build

echo ""
echo "Espera 30-60s (certificado HTTPS) y prueba:"
echo "  https://${DOMAIN}/api/status"
echo ""
echo "En Live Control (tu PC) pon URL publica base:"
echo "  https://${DOMAIN}"