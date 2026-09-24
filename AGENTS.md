# AGENTS.md — правила проекта Todo App

## Что это за проект

**Todo-app** — приложение «список задач» (Vue 3 фронтенд + Express-бэкенд с SQLite). Деплоится в Docker на VPS и живёт за Caddy-прокси на домене **https://dr-shmakova.ru/**.

## Архитектура: monorepo из двух приложений

```
apps/
  frontend/   # Vue 3 + Vite + Tailwind CSS 4 (SPA, ходит в /api/*)
  backend/    # Express 5 + SQLite (node:sqlite, без нативных зависимостей)
Dockerfile        # multi-stage: сборка фронта + бэкенд в ОДНОМ образе, один процесс node
docker-compose.yml
deploy.sh
```

| Слой | Технология |
|---|---|
| UI | Vue 3 (Composition API, `<script setup>`), Tailwind CSS 4 (плагин `@tailwindcss/vite`) |
| API | Express 5, маршруты смонтированы на `/api` |
| БД | SQLite через встроенный модуль `node:sqlite` (`node --experimental` не нужен на node 22+), таблица `todos` (id, text, done, position, created_at) — **общая на всех, без аутентификации и привязки к пользователю** |
| Прод-контейнер | ОДИН образ, ОДИН процесс node: `/api` → REST API, `/` и остальные пути → статика собранного фронтенда + SPA fallback |

## Ключевые решения

- **Фронтенд не знает, где бэкенд**: все запросы через относительный `fetch('/api/...')`. Локально Vite-прокси/совместный запуск, на бою — тот же процесс.
- **Данные в SQLite, не в localStorage** (localStorage остался только для темы). Файл БД: локально `apps/backend/data/todo.db`, на бою `/app/data/todo.db` (env `DATA_DIR`).
- **Docker-образ один**, внутри нет nginx. Статику и SPA fallback раздаёт Express (`apps/backend/src/server.js`).

## Локальная разработка (нативный Node, БЕЗ Docker)

```bash
# Бэкенд (порт по умолчанию 3000, можно переопределить):
cd apps/backend && npm ci && PORT=4100 DATA_DIR=./data npm run dev   # node --watch
# Фронтенд (dev-сервер Vite, порт 3000):
cd apps/frontend && npm ci && npm run dev
# Прод-сборка фронта + раздача бэкендом:
cd apps/frontend && npm run build   # -> apps/frontend/dist, бэкенд раздаёт при STATIC_DIR=apps/frontend/dist
```

- Локально Docker **не запускать** — только нативный запуск Node.
- Локальную БД (`apps/backend/data/`, `*.db*`) коммитить нельзя — в `.gitignore`.

## Деплой (deploy.sh)

Скрипт делает: tar.gz исходников (без `node_modules/.git/dist/apps/frontend/dist`) → scp на `root@31.76.57.55` → распаковка в `/opt/todo-app` → `docker compose up -d --build` → health-check HTTP 200 на `https://dr-shmakova.ru/`.

- На бою SQLite живёт в именованном volume `todo-data` (монтируется в `/app/data`) и переживает пересоздание контейнера и деплой.
- Порт контейнера наружу **не публикуется** (`ports:` запрещён): TLS терминирует внешний `caddy-proxy` (сеть `caddy_default`), он проксирует dr-shmakova.ru → `todo-app:80`.

Переопределяется env-переменными: `DEPLOY_SERVER`, `DEPLOY_REMOTE_DIR`, `DEPLOY_IP`, `DEPLOY_URL`.

## VPS и MCP

- VPS: `31.76.57.55` (Ubuntu 24.04), доступ **по SSH под root** через ключ `C:/Users/Optimus/.ssh/id_ed25519`
- Проект подключён к VPS через MCP-сервер `ssh-mcp` (конфиг в `.mcp.json`, сервер `vps`): команды, SFTP, сессии
- На сервере крутится внешний `caddy-proxy` (сеть `caddy_default`), он терминирует TLS и проксирует dr-shmakova.ru → `todo-app:80`

## Правила для агентов

1. **Терминал — Git Bash на Windows**: пути только с прямыми слэшами (`D:/AI/Workplace/PI/Github`), никаких `> nul`, `dir`, `copy` — только bash-синтаксис. PowerShell — через `powershell -NoProfile -Command "..."`.
1a. **ЗАПРЕЩЕНО `taskkill //F //IM node.exe` и любые команды «убить все node-процессы»**: сам агент pi — это тоже Node-процесс, такое команду убивает агента и рвёт сессию. Останавливать серверы только по конкретному PID: `netstat -ano | grep :<порт>` → `taskkill //F //PID <pid>`.
2. **Логика фронтенда — в `apps/frontend/src/App.vue`**, логика API/БД — в `apps/backend/src/` (`server.js` — маршруты и раздача статики, `db.js` — схема и подключение SQLite).
3. **UI на русском языке** (тексты интерфейса, комментарии в кода тоже русские).
4. **Стиль вёрстки**: Tailwind-классы прямо в разметке, тёмная тема через `dark:` вариант, скруглённые карточки + backdrop-blur. Кастомные анимации — в `src/style.css`.
5. **Состояние**: Vue 3 Composition API (`ref`/`computed`/`watch`), данные задач — только через REST API (`/api/todos`), в localStorage — только тема. Не подключать стор (Pinia/Vuex) и другие библиотеки без явной просьбы.
6. **Docker**: локально не запускать; образ один (фронт+бэк), порт наружу не публиковать, сеть `caddy_default`, БД — в volume `todo-data`.
7. **Секреты/машинные пути**: `.mcp.json` не коммитится (в `.gitignore`). Не добавлять в git ключи, пароли, пути типа `C:/Users/...`, файлы БД `*.db*`.
8. **Проверка после изменений**: `cd apps/frontend && npm run build` без ошибок; API проверять локальным запуском бэкенда (например, `PORT=4100 node apps/backend/src/server.js` + curl). Деплой — только через `./deploy.sh` (сам собирает и делает health-check).
