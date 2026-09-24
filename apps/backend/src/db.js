// db.js — подключение SQLite (встроенный модуль node:sqlite, без нативных зависимостей)
// Файл БД: apps/backend/data/todo.db (локально, в .gitignore)
//          или $DATA_DIR/todo.db (на бою volume монтируется в /app/data)
import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const dataDir = process.env.DATA_DIR || path.join(__dirname, '..', 'data')
mkdirSync(dataDir, { recursive: true })

const dbPath = process.env.DB_PATH || path.join(dataDir, 'todo.db')
export const db = new DatabaseSync(dbPath)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS todos (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL CHECK (length(text) > 0 AND length(text) <= 500),
    done       INTEGER NOT NULL DEFAULT 0,
    position   REAL    NOT NULL,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_todos_position ON todos (position);
`)

// ---- helpers ----
const rowToTodo = (r) => ({ id: r.id, text: r.text, done: !!r.done, position: r.position, created_at: r.created_at })

export function listTodos() {
  return db.prepare('SELECT * FROM todos ORDER BY position ASC').all().map(rowToTodo)
}

export function getTodo(id) {
  const r = db.prepare('SELECT * FROM todos WHERE id = ?').get(id)
  return r ? rowToTodo(r) : null
}

// Новая задача — в начало списка (как раньше: unshift)
export function createTodo(text) {
  const min = db.prepare('SELECT MIN(position) AS m FROM todos').get().m
  const position = (min ?? 0) - 1
  // в node:sqlite run() не возвращает строку RETURNING — читаем по lastInsertRowid
  const r = db.prepare('INSERT INTO todos (text, position) VALUES (?, ?)').run(text, position)
  return getTodo(Number(r.lastInsertRowid))
}

export function updateTodo(id, { text, done }) {
  const t = getTodo(id)
  if (!t) return null
  db.prepare('UPDATE todos SET text = ?, done = ? WHERE id = ?').run(
    text !== undefined ? text : t.text,
    done !== undefined ? (done ? 1 : 0) : t.done ? 1 : 0,
    id,
  )
  return getTodo(id)
}

export function deleteTodo(id) {
  return db.prepare('DELETE FROM todos WHERE id = ?').run(id).changes > 0
}

export function deleteCompleted() {
  return db.prepare('DELETE FROM todos WHERE done = 1').run().changes
}

// Пересохранение порядка всего списка (id в новом порядке)
export function reorderTodos(ids) {
  const stmt = db.prepare('UPDATE todos SET position = ? WHERE id = ?')
  db.exec('BEGIN')
  try {
    ids.forEach((id, i) => stmt.run(i, id))
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
  return listTodos()
}
