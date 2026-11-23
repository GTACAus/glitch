<script setup>
// /build/<name>: build a page by picking components and wiring them together.
// The page lives in page.json; every change also writes index.html, style.css and script.js
// (see lib/pageModel.js), so the project still opens in the code editor.
import { computed, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, previewUrl } from '@/lib/api.js';
import {
  EFFECTS,
  THEMES,
  TRIGGERS,
  TYPES,
  emptyPage,
  findItem,
  generateFiles,
  labelOf,
  makeItem,
  moveItem,
  newId,
  parsePage,
  removeItem,
  walk,
} from '@/lib/pageModel.js';
import { useSessionStore } from '@/stores/session.js';
import { useToastStore } from '@/stores/toasts.js';
import DragWindow from '@/components/DragWindow.vue';
import EditableText from '@/components/EditableText.vue';
import BuildInfo from '@/components/BuildInfo.vue';

const route = useRoute();
const router = useRouter();
const session = useSessionStore();
const { toast } = useToastStore();

const name = route.params.name;
const status = ref('loading'); // loading | ready | notfound
const canEdit = ref(false);
const page = reactive(emptyPage());
const selectedId = ref(null);
const wiringOpen = ref(true);
const saveStatus = ref('');
const mode = ref('edit'); // edit | try
const editing = computed(() => mode.value === 'edit' && canEdit.value);
const labelKind = (item) => `${TYPES[item.type].noun}${wiredCount(item.id) ? ' ⚡' : ''}`;

const written = {}; // path -> last text we know the server has
const projUrl = `/api/projects/${encodeURIComponent(name)}`;

const selected = computed(() => (selectedId.value ? findItem(page, selectedId.value)?.item : null));
const allItems = computed(() => [...walk(page)].map((h) => h.item));
const testUrl = computed(() => (session.me ? previewUrl(session.me, name) : ''));

// ---------------------------------------------------------------- load and save

async function load() {
  try {
    await session.load();
    const info = await api('GET', projUrl);
    canEdit.value = info.can_edit;
    if (!info.files.some((f) => f.path === 'page.json')) {
      router.replace(`/edit/${name}`); // not a builder project
      return;
    }
    const res = await api('GET', `${projUrl}/files?path=page.json`, undefined, { raw: true });
    const text = await res.text();
    Object.assign(page, parsePage(text));
    written['page.json'] = text;
    status.value = 'ready';
    document.title = `${name} · page builder`;
  } catch (e) {
    status.value = 'notfound';
    toast(e.message, 'error');
  }
}

let timer = null;
let saving = Promise.resolve();

function schedule() {
  if (!canEdit.value || status.value !== 'ready') return;
  saveStatus.value = 'dirty';
  clearTimeout(timer);
  timer = setTimeout(flush, 500);
}

function flush() {
  clearTimeout(timer);
  timer = null;
  const files = generateFiles(JSON.parse(JSON.stringify(page)));
  saving = saving.then(async () => {
    saveStatus.value = 'saving';
    try {
      for (const [path, text] of Object.entries(files)) {
        if (written[path] === text) continue;
        await api('PUT', `${projUrl}/files?path=${encodeURIComponent(path)}`, text);
        written[path] = text;
      }
      saveStatus.value = 'saved';
    } catch (e) {
      saveStatus.value = 'dirty';
      toast(e.message, 'error');
    }
  });
  return saving;
}

watch(page, schedule, { deep: true });

function onBeforeUnload(e) {
  if (timer || saveStatus.value === 'saving') {
    e.preventDefault();
    e.returnValue = '';
  }
}

onMounted(() => {
  addEventListener('beforeunload', onBeforeUnload);
  load();
});
onUnmounted(() => removeEventListener('beforeunload', onBeforeUnload));

const saveLabel = computed(
  () => ({ dirty: '●', saving: 'Saving…', saved: 'Saved ✓', '': '' })[saveStatus.value],
);

// ---------------------------------------------------------------- editing the page

function add(type) {
  const item = makeItem(type);
  if (type === 'section') {
    page.items.push(item);
  } else {
    // Text and buttons go inside the selected section (or the section holding the selected item).
    let section = null;
    if (selected.value?.type === 'section') section = selected.value;
    else if (selectedId.value) section = findItem(page, selectedId.value)?.parent;
    if (!section) section = page.items[page.items.length - 1];
    if (!section) {
      section = makeItem('section');
      page.items.push(section);
    }
    section.children.push(item);
  }
  select(item.id);
}

function select(id) {
  selectedId.value = id;
  wiringOpen.value = true;
}

function remove(id) {
  removeItem(page, id);
  if (selectedId.value === id || !findItem(page, selectedId.value)) selectedId.value = null;
}

// ---------------------------------------------------------------- try it (wiring runs on the canvas)

const live = reactive({ hidden: {}, theme: {} });

function startTry() {
  selectedId.value = null;
  live.hidden = {};
  live.theme = {};
  // Things a "appear" rule points at start out hidden, the same as in the generated page.
  for (const r of page.rules) if (r.effect === 'show') live.hidden[r.target] = true;
  mode.value = 'try';
}

function runRule(r, reverse) {
  const t = r.target;
  if (r.effect === 'toggle') live.hidden[t] = !live.hidden[t];
  else if (r.effect === 'show') live.hidden[t] = reverse;
  else if (r.effect === 'hide') live.hidden[t] = !reverse;
  else if (r.effect === 'theme') live.theme[t] = reverse ? '' : `theme-${r.value}`;
}

// Event listeners for one element: each rule of its own, plus the undo for hover.
function handlers(item) {
  const out = {};
  for (const trig of TRIGGERS) {
    const rules = page.rules.filter((r) => r.source === item.id && r.trigger === trig.id);
    if (!rules.length) continue;
    out[trig.event] = (e) => {
      if (trig.event === 'contextmenu') e.preventDefault();
      rules.forEach((r) => runRule(r, false));
    };
    if (trig.undo) out[trig.undo] = () => rules.forEach((r) => runRule(r, true));
  }
  return out;
}

// ---------------------------------------------------------------- wiring

const rulesFor = (id) => page.rules.filter((r) => r.source === id);

function addRule() {
  if (!selected.value) return;
  const other = allItems.value.find((i) => i.id !== selected.value.id) || selected.value;
  page.rules.push({
    id: newId(),
    source: selected.value.id,
    trigger: 'click',
    target: other.id,
    effect: 'theme',
    value: THEMES[0].id,
  });
}

function setEffect(rule, effect) {
  rule.effect = effect;
  rule.value = effect === 'theme' ? rule.value || THEMES[0].id : null;
}

function deleteRule(rule) {
  page.rules = page.rules.filter((r) => r.id !== rule.id);
}

const wiredCount = (id) => page.rules.filter((r) => r.source === id).length;
</script>

<template>
  <div class="builder-page">
    <div v-if="status === 'notfound'" class="login">
      <h2>Project not found</h2>
      <RouterLink to="/">Back to projects</RouterLink>
    </div>

    <template v-else-if="status === 'ready'">
      <header class="topbar">
        <RouterLink to="/" class="brand-pill" title="All projects"
          ><span>glitch~nhance</span></RouterLink
        >
        <BuildInfo v-if="session.me" class="hide-sm" :build="session.me.build" />
        <span class="proj-name">{{ name }}</span>
        <span class="save-status" :class="saveStatus">{{ saveLabel }}</span>
        <div class="spacer"></div>
        <RouterLink class="btn hide-sm" :to="`/edit/${name}`" title="See and change the code">
          &lt;/&gt; Code
        </RouterLink>
        <a class="btn primary" target="_blank" rel="noopener" :href="testUrl">Open ↗</a>
      </header>
      <div v-if="!canEdit" class="readonly-banner">
        <span>This isn't your project, so you can look but not change it.</span>
      </div>

      <main class="pb-main">
        <div class="pb-toolbar">
          <template v-if="mode === 'edit'">
            <span class="muted">Add</span>
            <button
              v-for="(t, id) in TYPES"
              :key="id"
              class="btn small"
              :disabled="!canEdit"
              :title="id === 'section' ? 'Add a section' : 'Goes into the selected section'"
              @click="add(id)"
            >
              {{ t.icon }} {{ t.label }}
            </button>
          </template>
          <span v-else class="muted">Trying it out. Click, hover and right click like a visitor.</span>
          <div class="spacer"></div>
          <div class="pb-modes">
            <button :class="{ on: mode === 'edit' }" @click="mode = 'edit'">✎ Edit</button>
            <button :class="{ on: mode === 'try' }" @click="startTry">▶ Try it</button>
          </div>
        </div>

        <!-- The page being built -->
        <section class="pb-canvas" @click.self="selectedId = null">
          <!-- The page itself: what you see is what visitors get. In Edit you click things to
               select them and type straight into them; in Try it the wiring runs. -->
          <div class="pb-sheet pb-page" :class="{ editing }" @click.self="selectedId = null">
            <h1>
              <EditableText v-model="page.title" :editable="editing" @focus="selectedId = null" />
            </h1>
            <p v-if="editing && !page.items.length" class="pb-empty">
              Your page is empty. Press <b>Section</b> above to start.
            </p>

            <section
              v-for="s in page.items"
              :key="s.id"
              v-show="editing || !live.hidden[s.id]"
              class="pb-el"
              :class="[{ sel: editing && selectedId === s.id }, !editing && live.theme[s.id]]"
              :data-kind="editing ? labelKind(s) : null"
              v-on="editing ? { click: (e) => (e.stopPropagation(), select(s.id)) } : handlers(s)"
            >
              <h2>
                <EditableText v-model="s.title" :editable="editing" @focus="select(s.id)" />
              </h2>
              <template v-for="c in s.children" :key="c.id">
                <p
                  v-if="c.type === 'text'"
                  v-show="editing || !live.hidden[c.id]"
                  class="pb-el"
                  :class="[{ sel: editing && selectedId === c.id }, !editing && live.theme[c.id]]"
                  :data-kind="editing ? labelKind(c) : null"
                  v-on="
                    editing ? { click: (e) => (e.stopPropagation(), select(c.id)) } : handlers(c)
                  "
                >
                  <EditableText v-model="c.text" :editable="editing" multiline @focus="select(c.id)" />
                </p>
                <!-- A div, not a button, while editing: spaces typed in a button press it. -->
                <div
                  v-else-if="editing"
                  class="pb-btn pb-el"
                  :class="{ sel: selectedId === c.id }"
                  :data-kind="labelKind(c)"
                  @click.stop="select(c.id)"
                >
                  <EditableText v-model="c.label" @focus="select(c.id)" />
                </div>
                <button
                  v-else
                  v-show="!live.hidden[c.id]"
                  type="button"
                  :class="live.theme[c.id]"
                  v-on="handlers(c)"
                >
                  {{ c.label }}
                </button>
              </template>
              <p v-if="editing && !s.children.length" class="pb-empty small">
                Empty section. Add a text box or button above.
              </p>
            </section>
          </div>

          <!-- What the selected item can do -->
          <div v-if="editing && selected" class="pb-bar" @click.stop>
            <span class="muted">{{ labelOf(selected) }}</span>
            <button class="icon-btn" title="Move up" @click="moveItem(page, selected.id, -1)">
              ↑
            </button>
            <button class="icon-btn" title="Move down" @click="moveItem(page, selected.id, 1)">
              ↓
            </button>
            <button class="icon-btn" title="Delete" @click="remove(selected.id)">🗑</button>
            <button v-if="!wiringOpen" class="btn small primary" @click="wiringOpen = true">
              ⚡ Wiring
            </button>
          </div>

          <!-- Wiring: pops up beside a selected element, like the style panel -->
          <DragWindow v-if="editing && selected && wiringOpen" class="wire-panel" tag="aside">
            <template #head>
              <div class="pane-head">
                <span>Wire up: {{ labelOf(selected) }}</span>
                <button class="icon-btn" title="Close" @click="wiringOpen = false">×</button>
              </div>
            </template>
            <div class="wire-body">
              <p v-if="!rulesFor(selected.id).length" class="muted">
                Nothing happens yet. Add a rule to make something happen when this is used.
              </p>

              <div v-for="r in rulesFor(selected.id)" :key="r.id" class="wire-rule">
                <div class="wire-sentence">
                  <span>When this is</span>
                  <select v-model="r.trigger" :disabled="!canEdit">
                    <option v-for="t in TRIGGERS" :key="t.id" :value="t.id">{{ t.label }}</option>
                  </select>
                  <span>then</span>
                  <select v-model="r.target" :disabled="!canEdit">
                    <option v-for="i in allItems" :key="i.id" :value="i.id">
                      {{ i.id === selected.id ? 'this' : labelOf(i) }}
                    </option>
                  </select>
                  <span>will</span>
                  <select
                    :value="r.effect"
                    :disabled="!canEdit"
                    @change="setEffect(r, $event.target.value)"
                  >
                    <option v-for="e in EFFECTS" :key="e.id" :value="e.id">{{ e.label }}</option>
                  </select>
                </div>
                <div v-if="r.effect === 'theme'" class="wire-themes">
                  <button
                    v-for="t in THEMES"
                    :key="t.id"
                    type="button"
                    class="wire-theme"
                    :class="{ on: r.value === t.id }"
                    :style="{ background: t.bg, color: t.fg }"
                    :disabled="!canEdit"
                    :title="`${t.label} background`"
                    @click="r.value = t.id"
                  >
                    <b>Aa</b>
                    <span>{{ t.label }}</span>
                  </button>
                </div>
                <p v-if="r.trigger === 'hover'" class="muted wire-note">
                  Hovering lasts only while the pointer is over it.
                </p>
                <button class="btn small danger" :disabled="!canEdit" @click="deleteRule(r)">
                  Remove
                </button>
              </div>
            </div>
            <div class="wire-foot">
              <button class="btn small primary" :disabled="!canEdit" @click="addRule">
                + Add wiring
              </button>
            </div>
          </DragWindow>
        </section>

      </main>
    </template>
  </div>
</template>

<style scoped>
.builder-page {
  height: 100dvh;
  display: flex;
  flex-direction: column;
}
.pb-main {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}
.pb-toolbar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--panel);
}
.pb-modes {
  display: flex;
  border: 1px solid var(--line);
  border-radius: 999px;
  overflow: hidden;
}
.pb-modes button {
  border: 0;
  padding: 5px 14px;
  background: transparent;
  color: var(--text);
  font: 13px var(--font);
  cursor: pointer;
}
.pb-modes button.on {
  background: var(--accent);
  color: var(--accent-ink);
}

.pb-canvas {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: auto;
  background: #fdf6ec;
}
/* The page, styled like the generated style.css so it looks the way it will when published */
.pb-sheet {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1rem 120px;
}
.pb-page {
  color: #2b2b2b;
  font-family: system-ui, sans-serif;
  font-size: 16px;
  line-height: 1.4;
}
.pb-page h1 {
  font-size: 2em;
  margin: 0.67em 0;
}
.pb-page section {
  background: white;
  border: 1px solid #e6dccb;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin: 1rem 0;
}
.pb-page section h2 {
  margin-top: 0;
  font-size: 1.5em;
}
.pb-page p {
  margin: 1em 0;
}
.pb-page button,
.pb-btn {
  display: inline-block;
  font: inherit;
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: #ff7a59;
  color: white;
  cursor: pointer;
}
.pb-page .theme-blue {
  background: #dbeafe !important;
  color: #1e3a8a;
}
.pb-page .theme-red {
  background: #fee2e2 !important;
  color: #7f1d1d;
}

/* Editing: faint outlines and a small label, nothing that changes the layout */
.pb-page.editing .pb-el {
  position: relative;
  cursor: pointer;
}
.pb-page.editing .pb-el:hover {
  outline: 2px dashed #b9a98f;
  outline-offset: 3px;
}
.pb-page.editing .pb-el.sel {
  outline: 2px solid #7c5cff;
  outline-offset: 3px;
}
.pb-page.editing .pb-el.sel::before {
  content: attr(data-kind);
  position: absolute;
  bottom: 100%;
  left: -2px;
  margin-bottom: 5px;
  padding: 1px 7px;
  border-radius: 4px 4px 0 0;
  background: #7c5cff;
  color: white;
  font: 11px system-ui, sans-serif;
  line-height: 1.5;
  white-space: nowrap;
  z-index: 2;
}
.pb-empty {
  color: #8a7f6c;
  text-align: center;
  padding: 40px 0;
}
.pb-empty.small {
  padding: 6px 0;
  margin: 0;
  font-size: 14px;
}

.pb-bar {
  position: sticky;
  bottom: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  width: fit-content;
  max-width: 100%;
  margin: 0 auto;
  padding: 6px 10px;
  border: 1px solid var(--line);
  border-radius: 999px;
  background: var(--panel);
  box-shadow: var(--shadow);
}

/* Wiring panel */
.wire-panel {
  position: absolute;
  top: 24px;
  right: 24px;
  width: 440px;
  max-height: calc(100% - 48px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--line);
  border-radius: var(--radius);
  background: var(--panel);
  box-shadow: var(--shadow);
  z-index: 5;
}
.wire-body {
  flex: 1;
  overflow: auto;
  padding: 4px 12px;
  min-height: 60px;
}
.wire-rule {
  margin: 8px 0;
  padding: 10px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--bg);
}
.wire-sentence {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}
.wire-sentence select {
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 6px;
  font: 12px var(--font);
  background: var(--panel);
  color: var(--text);
  max-width: 200px;
}
.wire-themes {
  display: flex;
  gap: 8px;
  margin: 10px 0 6px;
}
.wire-theme {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  width: 84px;
  padding: 10px 0;
  border: 2px solid transparent;
  border-radius: 8px;
  font: 12px var(--font);
  cursor: pointer;
}
.wire-theme b {
  font-size: 18px;
}
.wire-theme.on {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px var(--accent-soft);
}
.wire-note {
  font-size: 12px;
  margin: 6px 0 0;
}
.wire-rule .btn {
  margin-top: 8px;
}
.wire-foot {
  padding: 8px 12px;
  border-top: 1px solid var(--line);
}
</style>
