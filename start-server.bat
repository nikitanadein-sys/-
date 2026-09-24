@echo off
rem Запуск dev-серверов (backend + frontend) в свёрнутых окнах: двойной клик по этому файлу.
rem   Backend : node, порт 4000, SQLite в apps/backend/data/todo.db
rem   Frontend: vite,  порт 3000, /api проксируется на backend. HMR включён.
rem   Открыть окно в заднике -> живой лог сервера; закрыть окно -> сервер останавливается.
rem   Приложение: http://localhost:3000 (из сети: http://192.168.1.21:3000)
cd /d "%~dp0"
start "todo-api (node)" /MIN cmd /c "npm run dev:backend"
start "todo-app (vite)" /MIN cmd /c "npm run dev:frontend"
