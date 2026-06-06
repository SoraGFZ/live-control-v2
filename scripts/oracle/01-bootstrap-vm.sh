#!/usr/bin/env bash
set -euo pipefail

echo "==> Actualizando paquetes..."
sudo apt-get update -y
sudo apt-get install -y ca-certificates curl git ufw

echo "==> Instalando Docker..."
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sudo sh
fi

sudo usermod -aG docker "${USER}" || true

if ! docker compose version >/dev/null 2>&1; then
  sudo apt-get install -y docker-compose-plugin
fi

echo "==> Firewall (ufw): SSH + HTTP + HTTPS..."
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
echo "y" | sudo ufw enable || true
sudo ufw status

echo ""
echo "Listo. Cierra sesion SSH y vuelve a entrar (grupo docker)."
echo "Luego sube el proyecto y ejecuta: bash scripts/oracle/02-deploy.sh"