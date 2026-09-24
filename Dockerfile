# Проект — npm-workspaces монорепозиторий: общий package-lock.json в КОРНЕ,
# node_modules тоже создаются в корне. Поэтому каждый stage копирует
# корневые package.json + package-lock.json и манифест нужного воркспейса,
# а зависимости ставит через `npm ci --workspace <имя>`.

# --- Stage 1: сборка фронтенда ---
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/frontend/package.json apps/frontend/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/frontend --no-audit --no-fund
COPY apps/frontend/ apps/frontend/
# vite build -> /app/apps/frontend/dist
RUN npm run build --workspace apps/frontend

# --- Stage 2: зависимости бэкенда (чисто JS: express + встроенный node:sqlite) ---
FROM node:22-alpine AS backend-deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/backend/package.json apps/backend/
RUN --mount=type=cache,target=/root/.npm npm ci --workspace apps/backend --omit=dev --no-audit --no-fund

# --- Stage 3: runtime — ОДИН образ, один процесс node ---
# /api  -> REST API (SQLite в /app/data, volume todo-data)
# /     -> статика собранного фронтенда + SPA fallback
FROM node:22-alpine AS prod
WORKDIR /app
ENV NODE_ENV=production
# node_modules в корне: express резолвится из /app/apps/backend/... по цепочке вверх
COPY --from=backend-deps /app/node_modules ./node_modules
# package.json бэкенда нужен: в нём "type": "module" (ESM)
COPY package.json ./
COPY apps/backend/package.json apps/backend/
COPY apps/backend/src apps/backend/src
# server.js по умолчанию ищет статику в ../public относительно src -> apps/backend/public
COPY --from=frontend-build /app/apps/frontend/dist apps/backend/public
ENV PORT=80 DATA_DIR=/app/data
EXPOSE 80
CMD ["node", "apps/backend/src/server.js"]
