#!/usr/bin/env bash
#
# deploy.sh — собирает текущую версию проекта и задеплоит её на сервер.
#
# Как работает:
#   1. Упаковывает исходники из ЭТОЙ папки (кроме node_modules/.git/dist) в tar.gz.
#   2. Копирует архив на сервер по scp.
#   3. На сервере распаковывает в $REMOTE_DIR, пересобирает Docker-образ
#      (vite build + node-бэкенд внутри multi-stage Dockerfile, один образ:
#      /api — REST API с SQLite, / — статика фронта) и (пере)запускает контейнер.
#   4. Делает health-check по HTTP на порту 3000.
#   SQLite-база живёт в именованном volume todo-data и переживает деплой.
#
# Запуск: просто  ./deploy.sh  из корня проекта.
# Переопределение (опционально):
#   DEPLOY_SERVER=user@host   адрес ssh      (по умолчанию root@31.76.57.55)
#   DEPLOY_IP=ip              ip для чека    (по умолчанию 31.76.57.55)
#   DEPLOY_REMOTE_DIR=/path   папка на сервере(по умолчанию /opt/todo-app)
#
set -euo pipefail

SERVER="${DEPLOY_SERVER:-root@31.76.57.55}"
REMOTE_DIR="${DEPLOY_REMOTE_DIR:-/opt/todo-app}"
STAGE="/root/todo-deploy.tar.gz"
# Проверяем через публичный адрес: наружу 80/443 слушает caddy-proxy,
# он проксирует домен на контейнер todo-app.
SITE_URL="${DEPLOY_URL:-https://dr-shmakova.ru/}"
SSH_OPTS=(-o StrictHostKeyChecking=no -o ConnectTimeout=15)

# Всегда работать из каталога, где лежит этот скрипт (корень проекта).
cd "$(dirname "$0")"

# --- 1. Архив текущей версии ---
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ARCHIVE="$TMP/deploy.tar.gz"
tar --exclude='./node_modules' --exclude='./*/node_modules' --exclude='./.git' --exclude='./dist' \
    --exclude='./apps/frontend/dist' --exclude='./apps/backend/data' --exclude='./.mcp.json*' \
    --exclude='./deploy.sh' -czf "$ARCHIVE" .
echo "==> Архив: $(du -h "$ARCHIVE" | cut -f1)  ->  $SERVER:$STAGE"

# --- 2. Загрузка на сервер ---
scp "${SSH_OPTS[@]}" "$ARCHIVE" "$SERVER:$STAGE"

# --- 3. Сборка и перезапуск на сервере ---
echo "==> Сборка и (пере)запуск в $REMOTE_DIR ..."
ssh "${SSH_OPTS[@]}" "$SERVER" bash -s <<EOF
set -e
command -v docker >/dev/null || { echo "DOCKER_NOT_FOUND: установите docker и docker compose на сервере"; exit 42; }
rm -rf "$REMOTE_DIR"
mkdir -p "$REMOTE_DIR"
tar -xzf "$STAGE" -C "$REMOTE_DIR"
cd "$REMOTE_DIR"
# Снести контейнер, оставшийся от прежних запусков (иначе конфликт имени todo-app).
docker rm -f todo-app 2>/dev/null || true
docker compose up -d --build
EOF

# --- 4. Health check ---
echo "==> Health check $SITE_URL"
sleep 3
code="$(curl -sS -o /dev/null -w '%{http_code}' "$SITE_URL" || echo 000)"
if [ "$code" = "200" ]; then
  echo "OK  ✓  приложение в эфире: $SITE_URL  (HTTP $code)"
else
  echo "WARN  ✗  ожидался 200, получено $code"
  exit 1
fi
