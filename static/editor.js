'use strict';
/* global monaco, require */

const NAME = decodeURIComponent(location.pathname.split('/')[2] || '');
const PROJ = `/api/projects/${encodeURIComponent(NAME)}`;
const MONACO = 'https://cdn.jsdelivr.net/npm/monaco-editor@0.52.2/min';
const BINARY_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'mp3', 'wav', 'ogg',
  'm4a', 'mp4', 'webm', 'mov', 'woff', 'woff2', 'ttf', 'otf', 'zip', 'pdf', 'wasm']);
const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'avif', 'svg']);
const LANGS = { html: 'html', htm: 'html', css: 'css', js: 'javascript', mjs: 'javascript', cjs: 'javascript',
  jsx: 'javascript', ts: 'typescript', tsx: 'typescript', json: 'json', md: 'markdown', py: 'python',
  svg: 'xml', xml: 'xml', yml: 'yaml', yaml: 'yaml', sh: 'shell', toml: 'ini' };

const $ = (s) => document.querySelector(s);
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};
const ext = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
const isBinary = (p) => BINARY_EXT.has(ext(p));
const langFor = (p) => LANGS[ext(p)] || 'plaintext';
const fileUrl = (p) => `${PROJ}/files?path=${encodeURIComponent(p)}`;
const versionFileUrl = (id, p) => `${PROJ}/history/${id}/file?path=${encodeURIComponent(p)}`;

const S = {
  me: null, project: null, files: [], current: null,
  models: new Map(), viewStates: new Map(), timers: new Map(),
  saveChain: Promise.resolve(), pending: 0, applying: false,
  previewBase: '', framePath: '', history: [], tv: null, textCache: new Map(), diffToken: 0,
  chat: [], ai: null, aiBusy: false,
};

async function api(method, url, body, { raw = false } = {}) {
  const opts = { method, headers: {} };
  if (typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Blob) opts.body = body;
  else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try { msg = (await res.json()).error || msg; } catch {}
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return raw ? res : res.json();
}

function toast(msg, kind = '') {
  const t = el('div', { className: `toast ${kind}`, textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3200);
}

function fmtTime(t) {
  return new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
function fmtDay(t) {
  const d = new Date(t * 1000);
  const today = new Date();
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

// ------------------------------------------------------------------ boot

window.MonacoEnvironment = {
  getWorkerUrl: () => `data:text/javascript;charset=utf-8,${encodeURIComponent(
    `self.MonacoEnvironment={baseUrl:'${MONACO}/'};importScripts('${MONACO}/vs/base/worker/workerMain.js');`)}`,
};
require.config({ paths: { vs: `${MONACO}/vs` } });
require(['vs/editor/editor.main'], () => init().catch((e) => toast(e.message, 'error')));

async function init() {
  S.me = await api('GET', '/api/me');
  if (!S.me.user) { location.href = '/'; return; }
  try {
    S.project = await api('GET', PROJ);
  } catch (e) {
    document.body.replaceChildren(el('div', { className: 'login' },
      el('h2', { textContent: 'Project not found' }), el('a', { href: '/', textContent: 'Back to projects' })));
    return;
  }
  S.files = S.project.files;
  S.previewBase = S.me.preview_host
    ? `${location.protocol}//${NAME}.${S.me.preview_host}/`
    : `/p/${encodeURIComponent(NAME)}/`;
  document.title = `${NAME} · glitch~nhance`;

  setupHeader();
  showBuild($('#buildInfo'), S.me.build);
  setupEditor();
  setupFiles();
  setupPreview();
  setupSplitter();
  setupHistory();
  setupAi();
  setupBlocks();
  renderTree();

  const first = ['index.html', 'README.md'].find((p) => S.files.some((f) => f.path === p)) || S.files[0]?.path;
  if (first) openFile(first);
  loadPreview();
}

// ------------------------------------------------------------------ header

function setupHeader() {
  const p = S.project;
  const nameBtn = $('#projName');
  nameBtn.textContent = NAME;
  $('#owner').textContent = p.can_edit ? '' : `by ${p.owner_name}`;
  $('#openPreview').href = S.previewBase;
  $('#exportBtn').href = `${PROJ}/export`;
  if (p.can_edit) {
    nameBtn.classList.add('editable');
    nameBtn.title = 'Rename project';
    nameBtn.onclick = async () => {
      const next = prompt('Rename project (a–z, 0–9 and dashes):', NAME);
      if (!next || next === NAME) return;
      try {
        await flushAll();
        const r = await api('PATCH', PROJ, { name: next.trim().toLowerCase() });
        location.replace(`/edit/${r.name}`);
      } catch (e) { toast(e.message, 'error'); }
    };
  } else {
    $('#readonly').hidden = false;
    $('#roOwner').textContent = p.owner_name;
    $('#fileActions').hidden = true;
    $('#dropHint').hidden = true;
  }
  const remix = async () => {
    try {
      await flushAll();
      const r = await api('POST', `${PROJ}/remix`);
      location.href = `/edit/${r.name}`;
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#remixBtn').onclick = remix;
  $('#roRemix').onclick = remix;
  $('#togglePreview').onclick = () => {
    const off = document.body.classList.toggle('no-preview');
    $('#togglePreview').textContent = off ? 'Show preview' : 'Hide preview';
  };
  addEventListener('beforeunload', (e) => {
    if (S.pending || S.timers.size) { e.preventDefault(); e.returnValue = ''; }
  });
}

function setStatus(state) {
  const s = $('#saveStatus');
  s.className = `save-status ${state}`;
  s.textContent = { dirty: '●', saving: 'Saving…', saved: 'Saved ✓', '': '' }[state];
}

// ------------------------------------------------------------------ editor & saving

function setupEditor() {
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs');
  theme();
  dark.addEventListener('change', theme);
  monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true });
  S.editor = monaco.editor.create($('#editor'), {
    automaticLayout: true, minimap: { enabled: false }, fontSize: 14, tabSize: 2, wordWrap: 'on',
    scrollBeyondLastLine: false, readOnly: !S.project.can_edit, fixedOverflowWidgets: true,
    padding: { top: 8 }, renderLineHighlight: 'line', smoothScrolling: true,
  });
  S.editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => flushAll());
  S.editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () => formatCurrent());
}

async function fetchText(url) {
  const res = await api('GET', url, undefined, { raw: true });
  return res.text();
}

async function openFile(path) {
  const f = S.files.find((x) => x.path === path);
  if (!f) return;
  if (S.ai) hideAiReview();
  if (S.current && S.models.has(S.current) && S.editor.getModel() === S.models.get(S.current)) {
    S.viewStates.set(S.current, S.editor.saveViewState());
  }
  S.current = path;
  renderTree();
  renderFileBar();
  if (S.tv) return showDiff();
  if (f.binary) return showBinary(path);
  let model = S.models.get(path);
  if (!model) {
    const text = await fetchText(fileUrl(path));
    model = S.models.get(path); // another click may have loaded it meanwhile
    if (!model) {
      model = monaco.editor.createModel(text, langFor(path), monaco.Uri.file(`/${path}`));
      model.onDidChangeContent(() => scheduleSave(path));
      S.models.set(path, model);
    }
  }
  if (S.current !== path || S.tv) return;
  showPane('editor');
  S.editor.setModel(model);
  const vs = S.viewStates.get(path);
  if (vs) S.editor.restoreViewState(vs);
  S.editor.focus();
}

function showPane(which) {
  $('#editor').hidden = which !== 'editor';
  $('#diff').hidden = which !== 'diff';
  $('#diffLabels').hidden = which !== 'diff';
  $('#binaryView').hidden = which !== 'binary';
}

function showBinary(path, src = fileUrl(path)) {
  showPane('binary');
  const view = $('#binaryView');
  const e = ext(path);
  if (IMAGE_EXT.has(e)) view.replaceChildren(el('img', { src, alt: path }));
  else if (['mp4', 'webm', 'mov'].includes(e)) view.replaceChildren(el('video', { src, controls: true }));
  else if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) view.replaceChildren(el('audio', { src, controls: true }));
  else view.replaceChildren(el('div', {}, el('p', { textContent: `${path} is a binary file.` }),
    el('a', { href: src, download: path.split('/').pop(), textContent: 'Download it' })));
}

function renderFileBar() {
  const bar = $('#fileBar');
  bar.replaceChildren(el('span', { textContent: S.current || '' }));
  if (S.tv) bar.append(el('span', { textContent: '· rewind view (read only)' }));
  if (S.ai) bar.replaceChildren(el('span', { textContent: `${S.ai.file} · AI suggestion (not applied yet)` }));
  if (!S.tv && !S.ai && S.current && S.project.can_edit && prettierParser(S.current)) {
    const b = el('button', { className: 'btn small prettier-btn', title: 'Tidy this file with Prettier (Shift+Alt+F)',
      textContent: '✨ Prettier' });
    b.onclick = () => formatCurrent();
    bar.append(el('div', { className: 'spacer' }), b);
  }
}

function scheduleSave(path) {
  if (S.applying || !S.project.can_edit) return;
  setStatus('dirty');
  clearTimeout(S.timers.get(path));
  S.timers.set(path, setTimeout(() => save(path), 500));
}

function save(path) {
  clearTimeout(S.timers.get(path));
  S.timers.delete(path);
  S.pending++;
  setStatus('saving');
  // Saves run one at a time so they can never land out of order.
  S.saveChain = S.saveChain.then(async () => {
    const model = S.models.get(path);
    if (!model) return;
    try {
      await api('PUT', fileUrl(path), model.getValue());
      afterSave(path);
    } catch (e) {
      toast(`Couldn't save ${path}: ${e.message}`, 'error');
    }
  }).finally(() => {
    S.pending--;
    setStatus(S.pending || S.timers.size ? 'saving' : 'saved');
  });
  return S.saveChain;
}

function flushAll() {
  for (const path of [...S.timers.keys()]) save(path);
  return S.saveChain;
}

function afterSave(path) {
  refreshPreview(path);
  if (!$('#historyPane').hidden && !S.tv) {
    clearTimeout(S.histTimer);
    S.histTimer = setTimeout(loadHistory, 400);
  }
}

// Bring open editors back in line with the files on disk (after a restore).
async function syncModels() {
  const present = new Set(S.files.map((f) => f.path));
  for (const [path, model] of [...S.models]) {
    if (!present.has(path)) {
      model.dispose();
      S.models.delete(path);
      continue;
    }
    const text = await fetchText(fileUrl(path));
    if (text !== model.getValue()) {
      S.applying = true;
      model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
      S.applying = false;
    }
  }
}

// ------------------------------------------------------------------ file tree

async function refreshFiles() {
  S.project = await api('GET', PROJ);
  S.files = S.project.files;
  renderTree();
}

function renderTree() {
  const root = { dirs: {}, files: [] };
  for (const f of S.files) {
    const parts = f.path.split('/');
    let node = root;
    for (const d of parts.slice(0, -1)) node = node.dirs[d] ??= { dirs: {}, files: [] };
    node.files.push(f);
  }
  $('#tree').replaceChildren(...renderNode(root, 0));
}

function renderNode(node, depth) {
  const out = [];
  for (const [name, child] of Object.entries(node.dirs).sort((a, b) => a[0].localeCompare(b[0]))) {
    const li = el('li', { className: 'dir', textContent: `${name}/` });
    li.style.setProperty('--d', depth);
    out.push(li, ...renderNode(child, depth + 1));
  }
  for (const f of node.files.sort((a, b) => a.path.localeCompare(b.path))) {
    const e = ext(f.path);
    const li = el('li', { className: `file${f.path === S.current ? ' active' : ''}`, title: f.path },
      el('span', { className: `dot ${IMAGE_EXT.has(e) ? 'img' : e}` }),
      el('span', { className: 'fname', textContent: f.path.split('/').pop() }));
    li.style.setProperty('--d', depth);
    li.onclick = () => openFile(f.path);
    if (S.project.can_edit) {
      const rn = el('button', { className: 'icon-btn', title: 'Rename / move', textContent: '✎' });
      rn.onclick = (ev) => { ev.stopPropagation(); renameFile(f.path); };
      const rm = el('button', { className: 'icon-btn', title: 'Delete', textContent: '✕' });
      rm.onclick = (ev) => { ev.stopPropagation(); deleteFile(f.path); };
      li.append(el('span', { className: 'acts' }, rn, rm));
    }
    out.push(li);
  }
  return out;
}

function cleanPath(p) {
  return (p || '').trim().replace(/^\/+/, '').replace(/\/+/g, '/');
}

function setupFiles() {
  $('#newFile').onclick = async () => {
    const path = cleanPath(prompt('New file name. Use / for folders, e.g. js/game.js', 'script.js'));
    if (!path) return;
    if (S.files.some((f) => f.path === path)) return openFile(path);
    try {
      await api('PUT', fileUrl(path), '');
      await refreshFiles();
      openFile(path);
    } catch (e) { toast(e.message, 'error'); }
  };
  const input = $('#uploadInput');
  $('#uploadBtn').onclick = () => input.click();
  input.onchange = () => { upload([...input.files]); input.value = ''; };
  const side = $('#sidebar');
  side.addEventListener('dragover', (e) => {
    if (!S.project.can_edit || !e.dataTransfer.types.includes('Files')) return;
    e.preventDefault();
    side.classList.add('dragover');
  });
  side.addEventListener('dragleave', () => side.classList.remove('dragover'));
  side.addEventListener('drop', (e) => {
    side.classList.remove('dragover');
    if (!S.project.can_edit || !e.dataTransfer.files.length) return;
    e.preventDefault();
    upload([...e.dataTransfer.files]);
  });
}

async function upload(list) {
  for (const file of list) {
    try {
      await api('PUT', fileUrl(cleanPath(file.name)), await file.arrayBuffer());
      const model = S.models.get(file.name);
      if (model) { model.dispose(); S.models.delete(file.name); }
    } catch (e) { toast(`${file.name}: ${e.message}`, 'error'); }
  }
  await refreshFiles();
  toast(`Uploaded ${list.length} file${list.length === 1 ? '' : 's'}`);
  if (list.length === 1) openFile(cleanPath(list[0].name));
  reloadPreview();
}

async function renameFile(path) {
  const to = cleanPath(prompt(`Rename ${path} to:`, path));
  if (!to || to === path) return;
  try {
    await flushAll();
    await api('POST', `${PROJ}/rename`, { from: path, to });
    S.models.get(path)?.dispose();
    S.models.delete(path);
    S.viewStates.delete(path);
    await refreshFiles();
    if (S.current === path) openFile(to);
    reloadPreview();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteFile(path) {
  if (!confirm(`Delete ${path}? (You can get it back from Rewind.)`)) return;
  try {
    clearTimeout(S.timers.get(path));
    S.timers.delete(path);
    await S.saveChain;
    await api('DELETE', fileUrl(path));
    S.models.get(path)?.dispose();
    S.models.delete(path);
    await refreshFiles();
    if (S.current === path) {
      S.current = null;
      const next = S.files.find((f) => f.path === 'index.html') || S.files[0];
      if (next) openFile(next.path); else { S.editor.setModel(null); renderFileBar(); }
    }
    reloadPreview();
  } catch (e) { toast(e.message, 'error'); }
}

// ------------------------------------------------------------------ preview & logs

function previewRoot() {
  return S.tv ? `${S.previewBase}@${S.tv.id}/` : S.previewBase;
}

function setupPreview() {
  $('#previewBase').textContent = S.me.preview_host ? `${NAME}.${S.me.preview_host}/` : `/p/${NAME}/`;
  $('#reloadPreview').onclick = () => reloadPreview();
  $('#previewPath').onkeydown = (e) => {
    if (e.key === 'Enter') loadPreview(cleanPath($('#previewPath').value));
  };
  $('#logsToggle').onclick = () => {
    const open = $('#logs').classList.toggle('open');
    $('#logsToggle').firstChild.textContent = `${open ? '▾' : '▸'} Logs`;
  };
  $('#clearLogs').onclick = () => {
    $('#logList').replaceChildren();
    S.errors = 0;
    $('#errCount').hidden = true;
  };
  addEventListener('message', (e) => {
    if (e.source !== $('#frame').contentWindow || !e.data || !e.data.__glitch) return;
    if (e.data.type === 'log') addLog(e.data.level, e.data.text);
    if (e.data.type === 'loaded') {
      const basePath = new URL(previewRoot(), location.href).pathname;
      const p = decodeURIComponent(e.data.path || '');
      S.framePath = p.startsWith(basePath) ? p.slice(basePath.length) : p.replace(/^\//, '');
      $('#previewPath').value = S.framePath;
    }
  });
}

function loadPreview(sub = S.framePath) {
  S.framePath = sub;
  logDivider();
  $('#frame').src = previewRoot() + sub;
}

function reloadPreview() {
  logDivider();
  const frame = $('#frame');
  try { frame.contentWindow.location.reload(); } catch { frame.src = previewRoot() + S.framePath; }
}

// CSS edits swap the stylesheet in place (no flash, page state kept); everything else reloads.
function refreshPreview(path) {
  if (S.tv) return;
  clearTimeout(S.reloadTimer);
  S.reloadTimer = setTimeout(() => {
    if (ext(path) === 'css') {
      try {
        const doc = $('#frame').contentDocument;
        const target = new URL(S.previewBase + path, location.href).pathname;
        let swapped = false;
        for (const link of doc.querySelectorAll('link[rel~="stylesheet"]')) {
          const u = new URL(link.href);
          if (u.pathname === target) {
            u.searchParams.set('_t', Date.now());
            link.href = u.href;
            swapped = true;
          }
        }
        if (swapped) return;
      } catch {}
    }
    reloadPreview();
  }, 80);
}

function addLog(level, text) {
  const list = $('#logList');
  const atBottom = list.scrollTop + list.clientHeight >= list.scrollHeight - 4;
  list.append(el('div', { className: `log ${level}`, textContent: text }));
  while (list.childElementCount > 500) list.firstChild.remove();
  if (level === 'error') {
    S.errors = (S.errors || 0) + 1;
    $('#errCount').hidden = false;
    $('#errCount').textContent = S.errors;
  }
  if (atBottom) list.scrollTop = list.scrollHeight;
}

function logDivider() {
  const list = $('#logList');
  if (list.lastChild && !list.lastChild.classList.contains('divider')) {
    list.append(el('div', { className: 'log divider', textContent: `reloaded ${fmtTime(Date.now() / 1000)}` }));
  }
  S.errors = 0;
  $('#errCount').hidden = true;
}

function setupSplitter() {
  const ws = $('#workspace');
  const split = $('#splitter');
  try {
    const w = localStorage.getItem('glitch.previewW');
    if (w) ws.style.setProperty('--preview-w', w);
  } catch {}
  split.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    split.setPointerCapture(e.pointerId);
    split.classList.add('drag');
    document.body.classList.add('dragging');
    const move = (ev) => {
      const rect = ws.getBoundingClientRect();
      const px = Math.min(Math.max(rect.right - ev.clientX, 240), rect.width - 480);
      ws.style.setProperty('--preview-w', `${px}px`);
    };
    const up = () => {
      split.removeEventListener('pointermove', move);
      split.classList.remove('drag');
      document.body.classList.remove('dragging');
      try { localStorage.setItem('glitch.previewW', ws.style.getPropertyValue('--preview-w')); } catch {}
    };
    split.addEventListener('pointermove', move);
    split.addEventListener('pointerup', up, { once: true });
  });
}

// ------------------------------------------------------------------ rewind

function setupHistory() {
  $('#rewindBtn').onclick = () => toggleHistory();
  $('#closeHistory').onclick = () => toggleHistory(false);
  $('#checkpointBtn').hidden = !S.project.can_edit;
  $('#checkpointBtn').onclick = async () => {
    const label = prompt('Name this checkpoint, so it is easy to find later:', 'Working version');
    if (!label) return;
    try {
      await flushAll();
      await api('POST', `${PROJ}/checkpoint`, { label });
      await loadHistory();
      toast('Checkpoint saved ★');
    } catch (e) { toast(e.message, 'error'); }
  };
  $('#timeline').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const idx = S.tv ? S.history.findIndex((v) => v.id === S.tv.id) : -1;
    const next = Math.min(Math.max(idx + (e.key === 'ArrowDown' ? 1 : -1), 0), S.history.length - 1);
    if (S.history[next]) selectVersion(S.history[next].id);
  });
  for (const b of $('#tvMode').querySelectorAll('button')) {
    b.onclick = () => { S.tv.mode = b.dataset.mode; renderTv(); showDiff(); };
  }
  $('#exitTv').onclick = () => exitTimeTravel();
  $('#restoreAll').onclick = () => doRestore(null);
  $('#restoreFile').onclick = () => doRestore(S.tv.file);
  addEventListener('keydown', (e) => { if (e.key === 'Escape' && S.tv) exitTimeTravel(); });
}

async function toggleHistory(open = $('#historyPane').hidden) {
  if (open && !$('#blocksPane').hidden) await toggleBlocks(false);
  $('#historyPane').hidden = !open;
  $('#filesPane').hidden = open;
  $('#rewindBtn').classList.toggle('on', open);
  if (open) {
    await flushAll();
    await loadHistory();
    $('#timeline').focus();
  } else if (S.tv) {
    exitTimeTravel();
  }
  // Lesson view keeps the blocks panel on the left instead of the file list.
  if (!open && document.body.classList.contains('lesson-view')) toggleBlocks(true);
}

async function loadHistory() {
  S.history = await api('GET', `${PROJ}/history`);
  S.textCache.clear();
  renderTimeline();
}

function describe(v) {
  if (v.kind === 'create') return v.label || 'Project created';
  if (v.kind === 'checkpoint') return `★ ${v.label}`;
  if (v.kind === 'restore') {
    const from = S.history.find((h) => h.id === v.ref);
    const when = from ? ` from ${fmtTime(from.updated)}` : '';
    return v.label ? `Restored ${v.label}${when}` : `Restored everything${when}`;
  }
  const { added, modified, deleted } = v.changes;
  const part = (verb, list) => {
    if (!list.length) return null;
    return list.length === 1 ? `${verb} ${list[0].split('/').pop()}` : `${verb} ${list.length} files`;
  };
  return [part('Edited', modified), part('Added', added), part('Deleted', deleted)].filter(Boolean).join(', ')
    || 'No changes';
}

function renderTimeline() {
  const ol = $('#timeline');
  const items = [];
  let lastDay = '';
  S.history.forEach((v, i) => {
    const day = fmtDay(v.updated);
    if (day !== lastDay) { items.push(el('li', { className: 'day', textContent: day })); lastDay = day; }
    const who = v.author === S.me.user.id ? '' : ` · ${v.author_name || 'someone'}`;
    const li = el('li', { className: `step ${v.kind}${S.tv?.id === v.id ? ' sel' : ''}` },
      el('div', { className: 't' }, describe(v), i === 0 ? el('span', { className: 'now-tag', textContent: 'now' }) : null),
      el('div', { className: 'm', textContent: `${fmtTime(v.updated)}${who}` }));
    li.dataset.id = v.id;
    li.onclick = () => selectVersion(v.id);
    items.push(li);
  });
  ol.replaceChildren(...items);
  ol.querySelector('.sel')?.scrollIntoView({ block: 'nearest' });
}

function changedFiles(v) {
  const c = v.changes;
  return [...c.modified.map((p) => [p, 'modified']), ...c.added.map((p) => [p, 'added']),
    ...c.deleted.map((p) => [p, 'deleted'])];
}

async function selectVersion(id) {
  const idx = S.history.findIndex((v) => v.id === id);
  const v = S.history[idx];
  if (!v) return;
  if (S.current && S.models.has(S.current) && S.editor.getModel() === S.models.get(S.current)) {
    S.viewStates.set(S.current, S.editor.saveViewState());
  }
  if (S.ai) hideAiReview();
  const token = ++S.selectToken;
  const { files } = await api('GET', `${PROJ}/history/${id}`);
  if (token !== S.selectToken) return;
  const changed = changedFiles(v).map(([p]) => p);
  const prevFile = S.tv?.file;
  const file = [prevFile, S.current].find((p) => p && changed.includes(p))
    || changed[0] || [prevFile, S.current].find((p) => p && files.includes(p)) || files[0];
  S.tv = { id, v, prev: S.history[idx + 1] || null, isLatest: idx === 0, files, file, mode: S.tv?.mode || 'step' };
  renderTimeline();
  renderTv();
  renderFileBar();
  showDiff();
  S.framePath = '';
  loadPreview('');
}
S.selectToken = 0;

function renderTv() {
  const tv = S.tv;
  $('#tvBanner').hidden = false;
  $('#tvTitle').textContent = describe(tv.v);
  $('#tvMeta').textContent = `${fmtDay(tv.v.updated)}, ${fmtTime(tv.v.updated)}`
    + (tv.v.author === S.me.user.id ? '' : ` · by ${tv.v.author_name}`);
  for (const b of $('#tvMode').querySelectorAll('button')) b.classList.toggle('on', b.dataset.mode === tv.mode);

  const row = $('#tvFiles');
  const changed = changedFiles(tv.v);
  const chips = changed.map(([p, kind]) => {
    const c = el('button', { className: `chip${p === tv.file ? ' on' : ''}`, title: kind },
      el('span', { className: `k ${kind}`, textContent: { added: '+', modified: '~', deleted: '−' }[kind] }), p);
    c.onclick = () => { tv.file = p; renderTv(); showDiff(); };
    return c;
  });
  const others = [...new Set([...tv.files, ...S.files.map((f) => f.path)])]
    .filter((p) => !changed.some(([c]) => c === p)).sort();
  let picker = null;
  if (others.length) {
    picker = el('select', {},
      el('option', { value: '', textContent: changed.length ? 'Other files…' : 'Pick a file…' }),
      ...others.map((p) => el('option', { value: p, textContent: p, selected: p === tv.file })));
    picker.onchange = () => { if (picker.value) { tv.file = picker.value; renderTv(); showDiff(); } };
  }
  row.replaceChildren(...[changed.length ? el('span', { className: 'muted', textContent: 'Files changed:' }) : null,
    ...chips, picker].filter(Boolean));

  const canRestore = S.project.can_edit && !tv.isLatest;
  $('#restoreAll').hidden = !canRestore;
  $('#restoreFile').hidden = !canRestore || !tv.file;
  $('#restoreFile').textContent = tv.files.includes(tv.file)
    ? `Restore just ${tv.file.split('/').pop()}` : `Remove ${tv.file?.split('/').pop()} (it didn't exist then)`;
}

async function versionText(id, path) {
  const key = `${id}:${path}`;
  if (!S.textCache.has(key)) {
    S.textCache.set(key, fetchText(versionFileUrl(id, path)).catch((e) => (e.status === 404 ? null : Promise.reject(e))));
  }
  return S.textCache.get(key);
}

async function currentText(path) {
  const m = S.models.get(path);
  if (m) return m.getValue();
  return fetchText(fileUrl(path)).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
}

async function showDiff() {
  const tv = S.tv;
  if (!tv) return;
  const path = tv.file;
  const token = ++S.diffToken;
  if (!path) { showPane('binary'); $('#binaryView').textContent = 'No files in this version.'; return; }
  if (isBinary(path)) {
    return showBinary(path, tv.files.includes(path) ? versionFileUrl(tv.id, path) : fileUrl(path));
  }
  let left; let right; let leftLabel; let rightLabel;
  const when = fmtTime(tv.v.updated);
  if (tv.mode === 'step') {
    left = tv.prev ? await versionText(tv.prev.id, path) : null;
    right = await versionText(tv.id, path);
    leftLabel = tv.prev ? `Before (${fmtTime(tv.prev.updated)})` : 'Before (nothing)';
    rightLabel = `After (${when})`;
  } else {
    left = await versionText(tv.id, path);
    right = await currentText(path);
    leftLabel = `Then (${when})`;
    rightLabel = 'Now';
  }
  if (token !== S.diffToken || S.tv !== tv) return;
  if (left === null) leftLabel += ' · file did not exist';
  if (right === null) rightLabel += ' · file did not exist';
  setDiff(path, left, right, leftLabel, rightLabel);
}

function setDiff(path, left, right, leftLabel, rightLabel) {
  $('#diffLeft').replaceChildren(leftLabel,
    el('span', { className: 'key del', textContent: 'red = taken out', title: 'Lines highlighted red are removed' }));
  $('#diffRight').replaceChildren(rightLabel,
    el('span', { className: 'key add', textContent: 'green = put in', title: 'Lines highlighted green are added' }));

  if (!S.diffEditor) {
    S.diffEditor = monaco.editor.createDiffEditor($('#diff'), {
      readOnly: true, originalEditable: false, automaticLayout: true, minimap: { enabled: false },
      fontSize: 14, wordWrap: 'on', scrollBeyondLastLine: false, useInlineViewWhenSpaceIsLimited: true,
      renderOverviewRuler: false,
    });
  }
  const lang = langFor(path);
  const old = S.diffEditor.getModel();
  S.diffEditor.setModel({
    original: monaco.editor.createModel(left ?? '', lang),
    modified: monaco.editor.createModel(right ?? '', lang),
  });
  old?.original.dispose();
  old?.modified.dispose();
  showPane('diff');
  window.diffHelpOnce?.();
}

function exitTimeTravel() {
  if (!S.tv) return;
  S.tv = null;
  S.diffToken++;
  $('#tvBanner').hidden = true;
  renderTimeline();
  renderFileBar();
  S.framePath = '';
  loadPreview('');
  const cur = S.current;
  S.current = null;
  if (cur && S.files.some((f) => f.path === cur)) openFile(cur);
  else if (S.files[0]) openFile(S.files[0].path);
}

async function doRestore(path) {
  const tv = S.tv;
  const when = `${fmtDay(tv.v.updated).toLowerCase()} at ${fmtTime(tv.v.updated)}`;
  const msg = path
    ? `Put ${path} back to how it was ${when}?`
    : `Put the whole project back to how it was ${when}?`;
  if (!confirm(`${msg}\n\nNothing is lost: what you have now stays in Rewind, so you can undo this.`)) return;
  try {
    await flushAll();
    await api('POST', `${PROJ}/history/${tv.id}/restore`, path ? { path } : {});
    await refreshFiles();
    await syncModels();
    exitTimeTravel();
    await loadHistory();
    toast('Restored ✓');
  } catch (e) { toast(e.message, 'error'); }
}

// ------------------------------------------------------------------ ask AI

const chatKey = () => `glitch.chat.${NAME}`;
const SUGGESTION_DAYS = 7;

// Suggested file contents can be large, so they live in IndexedDB; the chat text stays in localStorage.
// Every call fails soft: without storage, suggestions just don't survive a reload.
let suggestionDb;
function suggestions(mode, fn) {
  suggestionDb ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('glitch', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('suggestions', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return suggestionDb.then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction('suggestions', mode);
    const req = fn(tx.objectStore('suggestions'));
    tx.oncomplete = () => resolve(req?.result);
    tx.onerror = () => reject(tx.error);
  })).catch(() => undefined);
}

async function loadSuggestions() {
  const all = (await suggestions('readonly', (st) => st.getAll())) || [];
  const cutoff = Date.now() - SUGGESTION_DAYS * 86400000;
  const expired = all.filter((x) => x.saved < cutoff).map((x) => x.id);
  if (expired.length) suggestions('readwrite', (st) => { for (const id of expired) st.delete(id); });
  const byId = new Map(all.filter((x) => x.project === NAME && x.saved >= cutoff).map((x) => [x.id, x]));
  for (const m of S.chat) {
    const saved = m.id && byId.get(m.id);
    if (saved && !m.changes) m.changes = saved.changes;
  }
}

function storeSuggestion(m) {
  if (!m.id || !m.changes?.length) return;
  suggestions('readwrite', (st) => st.put({ id: m.id, project: NAME, saved: m.saved, changes: m.changes }));
}

function forgetSuggestions(msgs) {
  const ids = msgs.map((m) => m.id).filter(Boolean);
  if (ids.length) suggestions('readwrite', (st) => { for (const id of ids) st.delete(id); });
}

function setupAi() {
  if (!S.me.ai || !S.project.can_edit) return;
  showAiTools(aiToolsOn());
  addEventListener('aitools', (e) => showAiTools(e.detail));
  try { S.chat = JSON.parse(localStorage.getItem(chatKey()) || '[]'); } catch { S.chat = []; }
  renderChat();
  loadSuggestions().then(renderChat);
  const input = $('#aiInput');
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#aiForm').requestSubmit(); }
  };
  $('#aiForm').onsubmit = (e) => { e.preventDefault(); askAi(); };
  $('#aiClear').onclick = () => {
    if (S.chat.length && !confirm('Start a new chat? This one will be cleared.')) return;
    forgetSuggestions(S.chat);
    S.chat = [];
    saveChat();
    renderChat();
    if (S.ai) closeAiReview();
  };
  $('#aiApplyAll').onclick = () => applyAi(S.ai.changes.map((c) => c.path));
  $('#aiApplyFile').onclick = () => applyAi([S.ai.file]);
  $('#aiDiscard').onclick = () => {
    S.ai.msg.discarded = true;
    forgetSuggestions([S.ai.msg]);
    saveChat();
    renderChat();
    closeAiReview();
  };
  $('#aiClose').onclick = () => closeAiReview();
  setupIdeas();
}

function showAiTools(on) {
  document.body.classList.toggle('has-ai', on);
  $('#aiPane').hidden = !on;
  $('#ideasBtn').hidden = !on;
  if (!on) {
    if (S.ai) closeAiReview();
    if ($('#ideasModal').open) $('#ideasModal').close();
  }
}

function saveChat() {
  const dropped = S.chat.slice(0, -40);
  if (dropped.length) { forgetSuggestions(dropped); S.chat = S.chat.slice(-40); }
  try {
    const slim = S.chat.map(({ id, saved, role, text, files, applied, discarded, model }) =>
      ({ id, saved, role, text, files, applied, discarded, model }));
    localStorage.setItem(chatKey(), JSON.stringify(slim));
  } catch {}
}

function renderChat() {
  const log = $('#aiLog');
  S.aiHint ??= log.querySelector('.hint');
  const items = S.chat.map((m) => {
    const div = el('div', { className: `ai-msg ${m.role}`, textContent: m.text });
    if (m.role === 'model' && m.files?.length) {
      const card = el('div', { className: 'ai-card' },
        el('div', { className: 'files', textContent: `Changes: ${m.files.join(', ')}` }));
      if (m.applied) card.append(el('span', { className: 'done', textContent: 'Applied ✓' }));
      else if (m.discarded) card.append(el('span', { className: 'muted', textContent: 'Discarded' }));
      else if (m.changes) {
        const b = el('button', { className: 'btn small primary', type: 'button', textContent: 'Review changes' });
        b.onclick = () => openAiReview(m);
        card.append(b);
      } else card.append(el('span', { className: 'muted', textContent: 'Expired (suggestions are kept for 7 days)' }));
      div.append(card);
    }
    if (m.role === 'model' && m.model) div.append(el('div', { className: 'ai-model', textContent: m.model }));
    return div;
  });
  if (S.aiBusy) {
    items.push(el('div', { className: 'ai-msg thinking', role: 'status' },
      el('span', { className: 'spark', textContent: '✦' }),
      el('span', { className: 'shimmer', textContent: 'Thinking' }),
      el('span', { className: 'dots' }, el('i'), el('i'), el('i'))));
  }
  log.replaceChildren(...(S.chat.length || S.aiBusy ? [] : [S.aiHint]), ...items);
  log.scrollTop = log.scrollHeight;
}

async function askAi(prompt) {
  const input = $('#aiInput');
  const text = (prompt ?? input.value).trim();
  if (!text || S.aiBusy) return;
  input.value = '';
  S.chat.push({ role: 'user', text });
  S.aiBusy = true;
  $('#aiSend').disabled = true;
  renderChat();
  try {
    await flushAll();
    let selection = '';
    const model = S.models.get(S.current);
    if (model && S.editor.getModel() === model) {
      const sel = S.editor.getSelection();
      if (sel && !sel.isEmpty()) selection = model.getValueInRange(sel);
    }
    // Earlier turns are sent as plain text; the server attaches the project's current files to the newest one.
    const messages = S.chat.filter((m) => m.role !== 'error').map((m) => ({
      role: m.role,
      text: m.files?.length ? `${m.text}\n\n[Proposed changes to: ${m.files.join(', ')}${m.applied ? ' (applied)' : ''}]` : m.text,
    }));
    const r = await api('POST', `${PROJ}/ai`, { messages, current: S.current, selection });
    const msg = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, saved: Date.now(), role: 'model',
      text: r.reply || 'Done.', files: r.changes.map(changeLabel), changes: r.changes, model: r.model };
    S.chat.push(msg);
    storeSuggestion(msg);
    if (msg.changes.length) openAiReview(msg);
  } catch (e) {
    S.chat.push({ role: 'error', text: e.message });
  } finally {
    S.aiBusy = false;
    $('#aiSend').disabled = false;
    saveChat();
    renderChat();
  }
}

function openAiReview(msg) {
  if (S.tv) exitTimeTravel();
  if (S.current && S.models.has(S.current) && S.editor.getModel() === S.models.get(S.current)) {
    S.viewStates.set(S.current, S.editor.saveViewState());
  }
  const first = msg.changes.find((c) => !c.applied) || msg.changes[0];
  S.ai = { msg, changes: msg.changes, file: first.path };
  $('#aiBanner').hidden = false;
  renderAiReview();
}

// Suggestions saved before renames/deletes existed have no kind.
const changeKind = (c) => c.kind || (c.before === null ? 'add' : 'edit');
const CHANGE_ICON = { add: '+', edit: '~', delete: '−', rename: '→' };
const CHANGE_CHIP = { add: 'added', edit: 'modified', delete: 'deleted', rename: 'renamed' };

function changeLabel(c) {
  const k = changeKind(c);
  if (k === 'rename') return `${c.from} → ${c.path}`;
  if (k === 'delete') return `${c.path} (delete)`;
  return c.path;
}

function renderAiReview() {
  const ai = S.ai;
  const left = ai.changes.filter((c) => !c.applied);
  $('#aiMeta').textContent = left.length
    ? `${left.length} change${left.length === 1 ? '' : 's'} to review`
    : 'All applied';
  $('#aiFiles').replaceChildren(...ai.changes.map((c) => {
    const k = changeKind(c);
    const chip = el('button', { className: `chip${c.path === ai.file ? ' on' : ''}${c.applied ? ' applied' : ''}`,
      title: { add: 'New file', edit: 'Changed', delete: 'Will be deleted', rename: 'Renamed' }[k] },
    el('span', { className: `k ${CHANGE_CHIP[k]}`, textContent: CHANGE_ICON[k] }), changeLabel(c));
    chip.onclick = () => { ai.file = c.path; renderAiReview(); };
    return chip;
  }));
  const cur = ai.changes.find((c) => c.path === ai.file);
  const verb = { delete: 'Delete', rename: 'Rename' }[changeKind(cur)] || 'Apply';
  $('#aiApplyFile').hidden = cur.applied || ai.changes.length < 2;
  $('#aiApplyFile').textContent = `${verb} just ${cur.path.split('/').pop()}`;
  $('#aiApplyAll').hidden = !left.length;
  $('#aiApplyAll').textContent = left.length === ai.changes.length ? 'Apply all changes' : 'Apply the rest';
  $('#aiDiscard').hidden = !left.length;
  renderFileBar();
  showAiDiff();
}

async function showAiDiff() {
  const ai = S.ai;
  const c = ai.changes.find((x) => x.path === ai.file);
  const k = changeKind(c);
  const token = ++S.diffToken;
  const source = k === 'rename' ? c.from : c.path;
  const exists = S.files.some((f) => f.path === source);
  if (c.binary) {
    if (exists) showBinary(source);
    else { showPane('binary'); $('#binaryView').textContent = `${source} is already gone.`; }
    return;
  }
  // Diff against what's in the editor now, in case it changed since the question was asked.
  const now = exists ? await currentText(source) : null;
  if (token !== S.diffToken || S.ai !== ai) return;
  const status = c.applied ? ' · applied' : '';
  if (k === 'delete') setDiff(c.path, now, '', 'Now', `Deleted — the whole file goes${status}`);
  else if (k === 'rename') setDiff(c.path, now, c.after, `${c.from} (now)`, `Renamed to ${c.path}${status}`);
  else setDiff(c.path, now, c.after, now === null ? 'Now · new file' : 'Now', `AI suggestion${status}`);
}

function hideAiReview() {
  S.ai = null;
  S.diffToken++;
  $('#aiBanner').hidden = true;
}

function closeAiReview() {
  hideAiReview();
  const cur = S.current;
  S.current = null;
  if (cur && S.files.some((f) => f.path === cur)) openFile(cur);
  else if (S.files[0]) openFile(S.files[0].path);
  else renderFileBar();
}

async function applyAi(paths) {
  const ai = S.ai;
  const todo = ai.changes.filter((x) => paths.includes(x.path) && !x.applied);
  const deletes = todo.filter((c) => changeKind(c) === 'delete').map((c) => c.path);
  if (deletes.length && !confirm(`This deletes ${deletes.join(', ')}.\n\nYou can get ${deletes.length === 1 ? 'it' : 'them'} back from Rewind.`)) return;
  let reshaped = false; // files were added, moved or removed, so the file list needs reloading
  const forget = (path) => {
    clearTimeout(S.timers.get(path));
    S.timers.delete(path);
    S.models.get(path)?.dispose();
    S.models.delete(path);
    S.viewStates.delete(path);
  };
  try {
    await flushAll();
    // Every step goes through the same file API as doing it by hand, which re-checks every path.
    for (const c of todo) {
      const k = changeKind(c);
      if (k === 'rename') {
        await api('POST', `${PROJ}/rename`, { from: c.from, to: c.path });
        forget(c.from);
        if (!c.binary && c.after !== c.before) await api('PUT', fileUrl(c.path), c.after);
        if (S.current === c.from) S.current = c.path;
        reshaped = true;
      } else if (k === 'delete') {
        await api('DELETE', fileUrl(c.path));
        forget(c.path);
        if (S.current === c.path) S.current = null;
        reshaped = true;
      } else {
        const model = S.models.get(c.path);
        if (model) {
          // Goes through the normal save path, and Cmd+Z in the editor can undo it.
          model.pushEditOperations([], [{ range: model.getFullModelRange(), text: c.after }], () => null);
        } else {
          await api('PUT', fileUrl(c.path), c.after);
          reshaped = true;
        }
      }
      c.applied = true;
    }
  } catch (e) {
    toast(e.message, 'error');
  }
  try {
    await flushAll();
    if (reshaped) await refreshFiles();
  } catch (e) { toast(e.message, 'error'); }
  reloadPreview();
  const done = ai.changes.every((c) => c.applied);
  ai.msg.applied = done;
  storeSuggestion(ai.msg);
  saveChat();
  renderChat();
  if (!done) { ai.file = ai.changes.find((c) => !c.applied).path; renderAiReview(); return; }
  toast('Applied ✓  You can undo it from Rewind.');
  hideAiReview();
  const has = (p) => p && S.files.some((f) => f.path === p);
  const landed = todo.filter((c) => changeKind(c) !== 'delete').map((c) => c.path).reverse().find(has);
  const next = landed || [S.current, 'index.html'].find(has) || S.files[0]?.path;
  S.current = null;
  if (next) openFile(next); else { S.editor.setModel(null); renderFileBar(); }
}

// ------------------------------------------------------------------ suggestions for you

const IDEA_KINDS = {
  resilience: { icon: '🛟', label: 'Resilience' },
  security: { icon: '🔒', label: 'Security' },
  speed: { icon: '⚡', label: 'Faster loading' },
  minimalism: { icon: '✂️', label: 'Minimalism' },
  ux: { icon: '🧭', label: 'UX' },
  gorgeousness: { icon: '✨', label: 'Gorgeousness' },
};

function setupIdeas() {
  const modal = $('#ideasModal');
  $('#ideasBtn').onclick = () => { modal.showModal(); loadIdeas(); };
  $('#ideasClose').onclick = () => modal.close();
  $('#ideasRefresh').onclick = () => loadIdeas();
  // Clicking the dimmed backdrop (outside the box) closes it too.
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.close(); });
}

async function loadIdeas() {
  const file = S.files.find((f) => f.path === S.current && !f.binary) ? S.current : 'index.html';
  const token = (S.ideasToken = (S.ideasToken || 0) + 1);
  $('#ideasSub').textContent = `Looking at ${file}…`;
  $('#ideasRefresh').disabled = true;
  $('#ideasBody').replaceChildren(...Object.entries(IDEA_KINDS).map(([kind, k]) =>
    el('div', { className: `idea ${kind} loading` },
      el('div', { className: 'idea-kind', textContent: `${k.icon} ${k.label}` }),
      el('div', { className: 'bar' }), el('div', { className: 'bar short' }))));
  try {
    await flushAll();
    const r = await api('POST', `${PROJ}/ideas`, { current: file });
    if (token !== S.ideasToken) return;
    $('#ideasSub').textContent = `Six ideas for ${r.file}. Pick one and the AI will draft it for you to review.`;
    $('#ideasSub').title = `Ideas by ${r.model}`;
    $('#ideasBody').replaceChildren(...r.ideas.map(ideaCard));
  } catch (e) {
    if (token !== S.ideasToken) return;
    $('#ideasSub').textContent = '';
    $('#ideasBody').replaceChildren(el('p', { className: 'ideas-error', textContent: e.message }));
  } finally {
    if (token === S.ideasToken) $('#ideasRefresh').disabled = false;
  }
}

function ideaCard(idea) {
  const k = IDEA_KINDS[idea.kind];
  const go = el('button', { className: 'btn small primary', type: 'button', textContent: 'Do it ✦' });
  go.onclick = () => {
    if (S.aiBusy) { toast('The AI is still working on your last request'); return; }
    $('#ideasModal').close();
    askAi(idea.prompt);
  };
  const tweak = el('button', { className: 'btn small', type: 'button', textContent: 'Edit first',
    title: 'Put the instruction in the chat box so you can change it before sending' });
  tweak.onclick = () => {
    $('#ideasModal').close();
    $('#aiInput').value = idea.prompt;
    $('#aiInput').focus();
  };
  return el('div', { className: `idea ${idea.kind}` },
    el('div', { className: 'idea-kind', textContent: `${k.icon} ${k.label}` }),
    el('h3', { textContent: idea.title }),
    el('p', { textContent: idea.why }),
    el('div', { className: 'idea-btns' }, tweak, go));
}

// ------------------------------------------------------------------ prettier

// Prettier runs in the browser with its defaults, which is what the VS Code extension uses out of the box.
const PRETTIER = 'https://cdn.jsdelivr.net/npm/prettier@3.3.3';
const PRETTIER_PARSERS = { js: 'babel', mjs: 'babel', cjs: 'babel', jsx: 'babel', ts: 'typescript', tsx: 'typescript',
  json: 'json', css: 'css', scss: 'scss', less: 'less', html: 'html', htm: 'html', md: 'markdown',
  yml: 'yaml', yaml: 'yaml', vue: 'vue' };
const prettierParser = (p) => PRETTIER_PARSERS[ext(p)];
let prettierLoad;

// ES modules rather than the UMD builds, which would register with Monaco's AMD loader instead of as globals.
function loadPrettier() {
  prettierLoad ??= Promise.all([
    import(`${PRETTIER}/standalone.mjs`),
    ...['babel', 'estree', 'typescript', 'postcss', 'html', 'markdown', 'yaml']
      .map((n) => import(`${PRETTIER}/plugins/${n}.mjs`)),
  ]).then(([core, ...plugins]) => ({ format: core.format, plugins: plugins.map((m) => m.default) }))
    .catch((e) => { prettierLoad = null; throw e; });
  return prettierLoad;
}

async function formatCurrent() {
  const path = S.current;
  const parser = path && prettierParser(path);
  const model = S.models.get(path);
  if (!parser || !model || S.tv || S.ai || !S.project.can_edit) return;
  try {
    const { format, plugins } = await loadPrettier();
    const before = model.getValue();
    const after = await format(before, { parser, plugins });
    if (S.models.get(path) !== model || model.getValue() !== before) return; // typed meanwhile; don't clobber
    if (after === before) { toast('Already tidy ✓'); return; }
    // An edit (not setValue) so Cmd+Z undoes the formatting.
    S.editor.pushUndoStop();
    model.pushEditOperations(S.editor.getSelections(), [{ range: model.getFullModelRange(), text: after }], () => null);
    S.editor.pushUndoStop();
    toast('Tidied with Prettier ✨');
  } catch (e) {
    // Syntax errors come back with a line and column; the first line of the message is enough.
    toast(`Prettier couldn't format this: ${String(e.message).split('\n')[0]}`, 'error');
  }
}
