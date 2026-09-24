<script setup>
import { ref, computed, watch, onMounted } from 'vue'

// ---- состояние ----
const todos = ref([])
const loading = ref(true)
const loadError = ref(false)
const newText = ref('')
const filter = ref('all')
const editId = ref(null)
const draft = ref('')
const leavingId = ref(null)
const input = ref(null)
const date = new Date().toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })

// ---- тема ----
const dark = ref(
  localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && matchMedia('(prefers-color-scheme: dark)').matches),
)
watch(dark, (v) => {
  document.documentElement.classList.toggle('dark', v)
  localStorage.setItem('theme', v ? 'dark' : 'light')
})
document.documentElement.classList.toggle('dark', dark.value)

// ---- API (на бою и в dev через vite-прокси всё идёт на /api) ----
async function api(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  })
  if (!res.ok) throw new Error(`${res.status}: ${await res.text()}`)
  return res.status === 204 ? null : res.json()
}

async function loadTodos() {
  loading.value = true
  loadError.value = false
  try {
    todos.value = await api('/todos')
  } catch (e) {
    console.error('load:', e)
    loadError.value = true
  } finally {
    loading.value = false
  }
}
onMounted(loadTodos)

// ---- вычисляемые ----
const total = computed(() => todos.value.length)
const doneCount = computed(() => todos.value.filter((t) => t.done).length)
const activeCount = computed(() => total.value - doneCount.value)
const pct = computed(() => (total.value ? Math.round((doneCount.value / total.value) * 100) : 0))
const statDone = computed(() => `${doneCount.value} из ${total.value} выполнено · ${pct.value}%`)
const counts = computed(() => ({ all: total.value, active: activeCount.value, done: doneCount.value }))
const filters = [
  { k: 'all', label: 'Все' },
  { k: 'active', label: 'Активные' },
  { k: 'done', label: 'Выполненные' },
]
const cardClass =
  'group flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-white/80 backdrop-blur-sm dark:bg-slate-800/80 ring-1 ring-slate-200/70 dark:ring-slate-700/50 shadow-sm shadow-slate-200/50 dark:shadow-black/20 animate-fadein hover:ring-indigo-300/60 dark:hover:ring-indigo-500/40 hover:shadow-md hover:shadow-indigo-100/50 dark:hover:shadow-indigo-900/20 hover:-translate-y-px transition-all duration-200'
const visible = computed(() =>
  todos.value.filter((t) => filter.value === 'all' || (filter.value === 'done' ? t.done : !t.done)),
)
const emptyText = computed(() =>
  total.value === 0
    ? 'Задач пока нет — добавьте первую!'
    : filter.value === 'done'
      ? 'Пока нет выполненных задач ✨'
      : 'Все дела закончены! 🎉',
)

// ---- drag & drop ----
const dragId = ref(null)
const dragOverInfo = ref(null) // { id, pos: 'above' | 'below' }

function onDragStart(e, t) {
  if (filter.value !== 'all' || editId.value !== null) { e.preventDefault(); return }
  dragId.value = t.id
  e.dataTransfer.effectAllowed = 'move'
  e.dataTransfer.setData('text/plain', t.id)
  requestAnimationFrame(() => {
    e.target && e.target.classList.add('dragging')
  })
}
function onDragEnd(e) {
  dragId.value = null
  dragOverInfo.value = null
  e.target && e.target.classList.remove('dragging')
}
function onDragOver(e, t) {
  if (!dragId.value || dragId.value === t.id) return
  e.preventDefault()
  e.dataTransfer.dropEffect = 'move'
  const rect = e.currentTarget.getBoundingClientRect()
  const midY = rect.top + rect.height / 2
  dragOverInfo.value = { id: t.id, pos: e.clientY < midY ? 'above' : 'below' }
}
function onDragLeave(e, t) {
  if (dragOverInfo.value && dragOverInfo.value.id === t.id) {
    dragOverInfo.value = null
  }
}
function onDrop(e, t) {
  e.preventDefault()
  const fromIdx = todos.value.findIndex((x) => x.id === dragId.value)
  if (fromIdx === -1) return
  const item = todos.value.splice(fromIdx, 1)[0]
  let toIdx = todos.value.findIndex((x) => x.id === t.id)
  if (toIdx === -1) toIdx = todos.value.length
  else if (dragOverInfo.value && dragOverInfo.value.pos === 'below') toIdx++
  todos.value.splice(toIdx, 0, item)
  dragId.value = null
  dragOverInfo.value = null
  // сохраняем новый порядок всего списка в БД
  api('/todos/reorder', { method: 'PUT', body: JSON.stringify({ ids: todos.value.map((t) => t.id) }) })
    .catch((e) => console.error('reorder:', e))
}

// ---- действия (оптимистично меняем UI, потом сохраняем в БД) ----
function add() {
  const v = newText.value.trim()
  if (!v) return
  api('/todos', { method: 'POST', body: JSON.stringify({ text: v }) })
    .then((t) => {
      todos.value.unshift(t)
      newText.value = ''
      input.value && input.value.focus()
    })
    .catch((e) => console.error('add:', e))
}
function toggle(id) {
  const t = todos.value.find((t) => t.id === id)
  if (!t) return
  t.done = !t.done
  api(`/todos/${id}`, { method: 'PUT', body: JSON.stringify({ done: t.done }) })
    .catch((e) => {
      console.error('toggle:', e)
      t.done = !t.done
    })
}
function remove(id) {
  leavingId.value = id
  setTimeout(() => {
    api(`/todos/${id}`, { method: 'DELETE' })
      .then(() => {
        todos.value = todos.value.filter((t) => t.id !== id)
      })
      .catch((e) => console.error('remove:', e))
      .finally(() => {
        leavingId.value = null
      })
  }, 180)
}
function clearDone() {
  api('/todos/completed', { method: 'DELETE' })
    .then(() => {
      todos.value = todos.value.filter((t) => !t.done)
    })
    .catch((e) => console.error('clearDone:', e))
}
function startEdit(t) {
  editId.value = t.id
  draft.value = t.text
}
function commitEdit() {
  if (editId.value === null) return
  const t = todos.value.find((t) => t.id === editId.value)
  const v = draft.value.trim()
  editId.value = null
  if (!t || !v || v === t.text) return
  const old = t.text
  t.text = v
  api(`/todos/${t.id}`, { method: 'PUT', body: JSON.stringify({ text: v }) })
    .catch((e) => {
      console.error('commitEdit:', e)
      t.text = old
    })
}
function cancelEdit() {
  editId.value = null
}
</script>

<template>
  <div class="max-w-2xl mx-auto px-4 py-12 sm:py-16">
    <!-- шапка -->
    <header class="flex items-center justify-between mb-8 animate-fadein">
      <div>
        <h1
          class="text-3xl sm:text-4xl font-extrabold tracking-tight bg-gradient-to-r from-indigo-600 to-violet-600 bg-clip-text text-transparent">
          Факер задачи
        </h1>
        <p class="mt-1 text-sm text-slate-500 dark:text-slate-400 capitalize">{{ date }}</p>
      </div>
      <button
        @click="dark = !dark"
        title="Переключить тему"
        class="p-2.5 rounded-xl bg-white/70 backdrop-blur-sm dark:bg-slate-800/70 shadow-sm ring-1 ring-slate-200/60 dark:ring-slate-700/50
               hover:ring-indigo-300 dark:hover:ring-indigo-500/50 hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer">
        <svg v-show="dark" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
        <svg v-show="!dark" class="w-5 h-5" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8Z" /></svg>
      </button>
    </header>

    <!-- форма добавления -->
    <form @submit.prevent="add" class="mb-6 flex gap-3 animate-pop p-2 rounded-2xl bg-white/60 backdrop-blur-md ring-1 ring-slate-200/50 dark:ring-slate-700/40 dark:bg-slate-800/40 shadow-sm">
      <input
        ref="input"
        v-model="newText"
        type="text"
        maxlength="200"
        autocomplete="off"
        placeholder="Что нужно сделать?"
        class="flex-1 px-4 py-3 rounded-xl bg-transparent ring-0 focus:ring-2 focus:ring-indigo-500/60 outline-none text-[15px]
               placeholder:text-slate-400 dark:placeholder:text-slate-500 transition" />
      <button
        type="submit"
        class="px-6 py-3 rounded-xl bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 text-white font-semibold text-sm
               shadow-lg shadow-indigo-500/25 hover:shadow-xl hover:shadow-indigo-500/35 hover:from-indigo-500 hover:to-purple-500
               active:scale-[0.97] active:shadow-md transition-all duration-200 whitespace-nowrap cursor-pointer">
        <span class="hidden sm:inline">Добавить</span>
        <svg class="w-5 h-5 sm:hidden" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path stroke-linecap="round" d="M12 4v16m8-8H4" /></svg>
      </button>
    </form>

    <!-- статистика -->
    <div v-show="total > 0" class="mb-5 animate-fadein">
      <div class="flex items-center justify-between text-sm text-slate-500 dark:text-slate-400 mb-2">
        <span class="font-medium">{{ statDone }}</span>
        <button
          v-show="doneCount > 0"
          @click="clearDone"
          class="text-xs font-medium px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300
                 ring-1 ring-indigo-200/50 dark:ring-indigo-700/50 hover:bg-indigo-100 dark:hover:bg-indigo-900/50
                 hover:ring-indigo-300 transition-all duration-200 cursor-pointer">Очистить выполненные</button>
      </div>
      <div class="h-2.5 rounded-full bg-slate-200/80 dark:bg-slate-700/60 overflow-hidden ring-1 ring-slate-200/50 dark:ring-slate-700/30">
        <div
          class="h-full rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-purple-500 transition-all duration-500 ease-out"
          :style="{ width: pct + '%' }"></div>
      </div>
    </div>

    <!-- фильтры -->
    <div class="flex items-center gap-2 mb-5">
      <button
        v-for="f in filters"
        :key="f.k"
        @click="filter = f.k"
        :class="[
          'flex items-center gap-1.5 pl-3.5 pr-2 py-1.5 text-sm rounded-full font-medium transition-all duration-200 cursor-pointer',
          filter === f.k
            ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/25 ring-0'
            : 'bg-white/70 dark:bg-slate-800/70 ring-1 ring-slate-200/80 dark:ring-slate-700/60 text-slate-600 dark:text-slate-300 hover:ring-indigo-300 dark:hover:ring-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-slate-700/50',
        ]">
        {{ f.label }}
        <b
          v-show="total > 0"
          :class="[
            'min-w-[1.35rem] px-1.5 rounded-full text-[11px] leading-4 text-center font-semibold',
            filter === f.k
              ? 'bg-white/20 text-white'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300',
          ]">{{ counts[f.k] }}</b>
      </button>
      <span v-show="total > 0" class="ml-auto text-xs text-slate-400 dark:text-slate-500">{{ visible.length }} покан. задач</span>
    </div>

    <!-- список -->
    <ul class="tasks space-y-2 max-h-[55vh] overflow-y-auto pr-1">
      <li
        v-for="t in visible"
        :key="t.id"
        :draggable="filter === 'all' && editId === null"
        @dragstart="onDragStart($event, t)"
        @dragend="onDragEnd($event)"
        @dragover="onDragOver($event, t)"
        @dragleave="onDragLeave($event, t)"
        @drop="onDrop($event, t)"
        :class="[cardClass, t.done && 'opacity-70', leavingId === t.id && 'leaving', dragId === t.id && 'opacity-40',
          dragOverInfo?.id === t.id && dragOverInfo.pos === 'above' && 'border-t-2 border-t-indigo-500',
          dragOverInfo?.id === t.id && dragOverInfo.pos === 'below' && 'border-b-2 border-b-indigo-500']">
        <!-- ручка перетаскивания -->
        <span
          v-show="filter === 'all' && editId === null"
          class="cursor-grab active:cursor-grabbing text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 -ml-1 transition-colors select-none"
          title="Перетащите, чтобы изменить порядок">
          <svg class="w-4 h-4" viewBox="0 0 20 20" fill="currentColor"><circle cx="7" cy="5" r="1.2"/><circle cx="13" cy="5" r="1.2"/><circle cx="7" cy="10" r="1.2"/><circle cx="13" cy="10" r="1.2"/><circle cx="7" cy="15" r="1.2"/><circle cx="13" cy="15" r="1.2"/></svg>
        </span>

        <input type="checkbox" class="cb" :checked="t.done" @change="toggle(t.id)" title="Отметить" />

        <template v-if="editId !== t.id">
          <span
            :class="[
              'flex-1 cursor-pointer select-none text-[15px] leading-snug',
              t.done && 'line-through text-slate-400 dark:text-slate-500',
            ]"
            title="Нажмите дважды, чтобы изменить"
            @dblclick="startEdit(t)">{{ t.text }}</span>
        </template>
        <input
          v-else
          v-model="draft"
          @keydown.enter="commitEdit"
          @keydown.escape="cancelEdit"
          @blur="commitEdit"
          maxlength="200"
          class="flex-1 bg-transparent outline-none text-[15px] leading-snug" />

        <button
          v-show="editId !== t.id"
          @click="startEdit(t)"
          title="Редактировать"
          class="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50/80 dark:hover:bg-indigo-900/30
                 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4Z" /></svg>
        </button>
        <button
          @click="remove(t.id)"
          title="Удалить"
          class="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50/80 dark:hover:bg-rose-900/30
                 opacity-0 group-hover:opacity-100 transition-all duration-200 cursor-pointer">
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg>
        </button>
      </li>
    </ul>

    <!-- пустое состояние -->
    <div v-show="visible.length === 0" class="text-center py-14 animate-fadein">
      <div class="text-5xl mb-3">🎯</div>
      <p class="text-slate-500 dark:text-slate-400 font-medium">{{ loadError ? 'Не удалось загрузить задачи — backend не отвечает 😕' : emptyText }}</p>
      <p v-show="total === 0" class="text-sm text-slate-400 dark:text-slate-500 mt-1">Введите задачу выше и нажмите Enter</p>
    </div>

    <footer class="mt-10 text-center text-xs text-slate-400 dark:text-slate-500">
      Задачи хранятся в общей базе (SQLite) на сервере
    </footer>
  </div>
</template>

<style scoped>
/* кастомный чекбокс */
.cb {
  appearance: none;
  width: 1.35rem;
  height: 1.35rem;
  border-radius: 0.375rem;
  border: 2px solid rgb(148 163 184 / 0.6);
  display: inline-grid;
  place-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: all 0.15s ease;
}
.cb:hover {
  border-color: rgb(99 102 241);
}
.cb::before {
  content: '';
  width: 0.65rem;
  height: 0.65rem;
  transform: scale(0);
  transition: transform 0.15s ease-in-out;
  background: white;
  clip-path: polygon(14% 44%, 0 65%, 50% 100%, 100% 16%, 80% 0%, 43% 62%);
}
.cb:checked {
  background: #6366f1;
  border-color: #6366f1;
}
.cb:checked::before {
  transform: scale(1);
}
/* анимация удаления */
.leaving {
  transition: all 0.18s ease;
  opacity: 0 !important;
  transform: translateX(24px);
}
/* drag state */
.dragging {
  opacity: 0.4 !important;
  transform: scale(0.98);
  box-shadow: 0 8px 25px -5px rgb(99 102 241 / 0.3) !important;
  border-radius: 1rem;
}
/* скроллбар списка */
.tasks::-webkit-scrollbar {
  width: 6px;
}
.tasks::-webkit-scrollbar-thumb {
  background: rgb(148 163 184 / 0.3);
  border-radius: 999px;
}
</style>
