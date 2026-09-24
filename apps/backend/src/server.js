// server.js — backend todo-app: API на /api + раздача собранного фронта на /
// Локально: PORT=4000 (vite проксирует /api сюда). На бою: PORT=80, статика из /app/public.
import express from 'express'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listTodos, getTodo, createTodo, updateTodo, deleteTodo, deleteCompleted, reorderTodos } from './db.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
app.use(express.json())

const api = express.Router()

api.get('/health', (_req, res) => res.json({ ok: true }))

// ---- список ----
api.get('/todos', (_req, res) => res.json(listTodos()))

// ---- создать ----
api.post('/todos', (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : ''
  if (!text) return res.status(400).json({ error: 'text обязателен' })
  if (text.length > 500) return res.status(400).json({ error: 'text длиннее 500 символов' })
  res.status(201).json(createTodo(text))
})

// ---- изменение порядка (ids в новом порядке) — до :id, чтобы не перехватить маршрут ----
api.put('/todos/reorder', (req, res) => {
  const ids = req.body?.ids
  if (!Array.isArray(ids) || ids.some((id) => !Number.isInteger(id))) {
    return res.status(400).json({ error: 'ids: массив целых чисел' })
  }
  res.json(reorderTodos(ids))
})

// ---- очистить выполненные — до :id по той же причине ----
api.delete('/todos/completed', (_req, res) => res.json({ deleted: deleteCompleted() }))

// ---- обновить (text / done) ----
api.put('/todos/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'неверный id' })
  const { text, done } = req.body ?? {}
  if (text !== undefined && (typeof text !== 'string' || !text.trim())) {
    return res.status(400).json({ error: 'text не может быть пустым' })
  }
  const t = updateTodo(id, { text: text?.trim(), done })
  if (!t) return res.status(404).json({ error: 'задача не найдена' })
  res.json(t)
})

// ---- удалить ----
api.delete('/todos/:id', (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'неверный id' })
  if (!deleteTodo(id)) return res.status(404).json({ error: 'задача не найдена' })
  res.status(204).end()
})

app.use('/api', api)

app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return res.status(404).json({ error: 'неизвестный API-маршрут' })
  next()
})

// ---- статика фронта (собранный vite build) ----
const publicDir = path.resolve(process.env.STATIC_DIR || path.join(__dirname, '..', 'public'))
app.use(express.static(publicDir))

// SPA fallback: любые GET вне /api отдаём index.html
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api')) {
    return res.sendFile(path.join(publicDir, 'index.html'))
  }
  next()
})

// ---- ошибки ----
app.use((err, _req, res, _next) => {
  console.error(err)
  res.status(500).json({ error: 'внутренняя ошибка сервера' })
})

const port = Number(process.env.PORT) || 4000
app.listen(port, '0.0.0.0', () => {
  console.log(`todo-backend: API на /api, статика на / — порт ${port}`)
})
