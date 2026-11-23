// The page builder's model and code generator.
//
// A builder project keeps its page as data in page.json:
//   { version: 1, title, items: [section...], rules: [rule...] }
//   section: { id, type: 'section', title, children: [text | button ...] }
//   text:    { id, type: 'text', text }
//   button:  { id, type: 'button', label }
//   rule:    { id, source, trigger, target, effect, value }
// and writes ordinary index.html / style.css / script.js from it, so the project still works
// in the code editor, Rewind, export and remix like any other.

export const TYPES = {
  section: { label: 'Section', icon: '▭', noun: 'section' },
  text: { label: 'Text box', icon: '¶', noun: 'text box' },
  button: { label: 'Button', icon: '◉', noun: 'button' },
};

export const TRIGGERS = [
  { id: 'click', label: 'clicked', event: 'click' },
  { id: 'hover', label: 'hovered over', event: 'mouseenter', undo: 'mouseleave' },
  { id: 'rightclick', label: 'right clicked', event: 'contextmenu' },
  { id: 'dblclick', label: 'double clicked', event: 'dblclick' },
];

export const EFFECTS = [
  { id: 'show', label: 'appear' },
  { id: 'hide', label: 'disappear' },
  { id: 'toggle', label: 'appear / disappear' },
  { id: 'theme', label: 'change background to…' },
];

// Add a theme here and it shows up as a preview in the wiring panel and in the generated CSS.
export const THEMES = [
  { id: 'blue', label: 'Blue', bg: '#dbeafe', fg: '#1e3a8a' },
  { id: 'red', label: 'Red', bg: '#fee2e2', fg: '#7f1d1d' },
];

let counter = 0;
export function newId() {
  counter++;
  return `${Date.now().toString(36).slice(-4)}${counter.toString(36)}${Math.random().toString(36).slice(2, 4)}`;
}

export function emptyPage() {
  return { version: 1, title: 'My page', items: [], rules: [] };
}

export function makeItem(type) {
  const id = newId();
  if (type === 'section') return { id, type, title: 'New section', children: [] };
  if (type === 'text') return { id, type, text: 'Write something here…' };
  return { id, type: 'button', label: 'Click me' };
}

export function parsePage(text) {
  try {
    const p = JSON.parse(text);
    if (p && Array.isArray(p.items)) return { ...emptyPage(), ...p, rules: p.rules || [] };
  } catch {
    // Fall through to a blank page.
  }
  return emptyPage();
}

// ---------------------------------------------------------------- tree helpers

export function* walk(page) {
  for (const s of page.items) {
    yield { item: s, parent: null };
    for (const c of s.children || []) yield { item: c, parent: s };
  }
}

export function findItem(page, id) {
  for (const hit of walk(page)) if (hit.item.id === id) return hit;
  return null;
}

export function labelOf(item) {
  if (!item) return '(removed)';
  const text = item.type === 'section' ? item.title : item.type === 'text' ? item.text : item.label;
  const short = (text || '').trim().replace(/\s+/g, ' ');
  return `${TYPES[item.type].noun}${short ? ` “${short.length > 22 ? `${short.slice(0, 21)}…` : short}”` : ''}`;
}

export function removeItem(page, id) {
  page.items = page.items.filter((s) => s.id !== id);
  for (const s of page.items) s.children = s.children.filter((c) => c.id !== id);
  // Wiring that mentions something that is gone would never work.
  const gone = new Set();
  const live = new Set([...walk(page)].map((h) => h.item.id));
  page.rules = page.rules.filter((r) => {
    const ok = live.has(r.source) && live.has(r.target);
    if (!ok) gone.add(r.id);
    return ok;
  });
}

export function moveItem(page, id, dir) {
  const hit = findItem(page, id);
  if (!hit) return;
  const list = hit.parent ? hit.parent.children : page.items;
  const i = list.indexOf(hit.item);
  const j = i + dir;
  if (j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
}

// ---------------------------------------------------------------- code generation

const esc = (s) =>
  String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Things that a "show" rule points at begin hidden, so that showing them means something.
function startsHidden(page) {
  return new Set(page.rules.filter((r) => r.effect === 'show').map((r) => r.target));
}

function itemHtml(item, hidden, indent) {
  const pad = ' '.repeat(indent);
  const cls = hidden.has(item.id) ? ' class="is-hidden"' : '';
  const id = `el-${item.id}`;
  if (item.type === 'text') return `${pad}<p id="${id}"${cls}>${esc(item.text).replace(/\n/g, '<br>')}</p>`;
  if (item.type === 'button') return `${pad}<button id="${id}"${cls} type="button">${esc(item.label)}</button>`;
  const kids = item.children.map((c) => itemHtml(c, hidden, indent + 2)).join('\n');
  return `${pad}<section id="${id}"${cls}>\n${pad}  <h2>${esc(item.title)}</h2>${kids ? `\n${kids}` : ''}\n${pad}</section>`;
}

export function generateHtml(page) {
  const hidden = startsHidden(page);
  const body = page.items.map((s) => itemHtml(s, hidden, 6)).join('\n');
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${esc(page.title)}</title>
    <link rel="stylesheet" href="style.css">
    <script src="script.js" defer></script>
  </head>
  <body>
    <main>
      <h1>${esc(page.title)}</h1>
${body}
    </main>
  </body>
</html>
`;
}

export function generateCss() {
  const themes = THEMES.map(
    (t) => `.theme-${t.id} {\n  background: ${t.bg} !important;\n  color: ${t.fg};\n}`,
  ).join('\n\n');
  return `/* Written by the page builder. Edit it here and the builder will overwrite your changes
   next time you change the page there. */
body {
  font-family: system-ui, sans-serif;
  background: #fdf6ec;
  color: #2b2b2b;
  margin: 0;
}

main {
  max-width: 44rem;
  margin: 0 auto;
  padding: 2rem 1rem;
}

section {
  background: white;
  border: 1px solid #e6dccb;
  border-radius: 12px;
  padding: 1rem 1.25rem;
  margin: 1rem 0;
}

section h2 {
  margin-top: 0;
}

button {
  font: inherit;
  padding: 0.6rem 1.2rem;
  border: 0;
  border-radius: 999px;
  background: #ff7a59;
  color: white;
  cursor: pointer;
}

.is-hidden {
  display: none !important;
}

${themes}
`;
}

// The runtime is plain, readable JavaScript with the rules as data at the top.
export function generateJs(page) {
  const live = new Set([...walk(page)].map((h) => h.item.id));
  const rules = page.rules
    .filter((r) => live.has(r.source) && live.has(r.target))
    .map((r) => {
      const t = TRIGGERS.find((x) => x.id === r.trigger) || TRIGGERS[0];
      return {
        source: `el-${r.source}`,
        event: t.event,
        undo: t.undo || null,
        target: `el-${r.target}`,
        effect: r.effect,
        value: r.value || null,
      };
    });
  const themeClasses = THEMES.map((t) => `theme-${t.id}`);
  return `// Written by the page builder.
// Each rule says: when <source> gets <event>, make <target> do <effect>.
const RULES = ${JSON.stringify(rules, null, 2)};

const THEME_CLASSES = ${JSON.stringify(themeClasses)};

function apply(el, effect, value, reverse) {
  if (effect === "toggle") el.classList.toggle("is-hidden");
  else if (effect === "show") el.classList.toggle("is-hidden", reverse);
  else if (effect === "hide") el.classList.toggle("is-hidden", !reverse);
  else if (effect === "theme") {
    el.classList.remove(...THEME_CLASSES);
    if (!reverse) el.classList.add("theme-" + value);
  }
}

for (const rule of RULES) {
  const source = document.getElementById(rule.source);
  const target = document.getElementById(rule.target);
  if (!source || !target) continue;
  source.addEventListener(rule.event, (e) => {
    if (rule.event === "contextmenu") e.preventDefault();
    apply(target, rule.effect, rule.value, false);
  });
  // Hover lasts only while the pointer is over the element.
  if (rule.undo) {
    source.addEventListener(rule.undo, () => apply(target, rule.effect, rule.value, true));
  }
}
`;
}

export function generateFiles(page) {
  return {
    'page.json': `${JSON.stringify(page, null, 2)}\n`,
    'index.html': generateHtml(page),
    'style.css': generateCss(),
    'script.js': generateJs(page),
  };
}
