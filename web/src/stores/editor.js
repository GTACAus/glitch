// The editor page's core state: the project, its files, the code editor, saving, and the preview.
// Rewind (history) and the AI chat have their own stores, rewind.js and ai.js.
//
// Monaco objects (the editor, its models) and timers are kept in plain variables, not in reactive
// state: Vue would wrap them in proxies, which breaks Monaco and wastes work.
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import monaco from '@/lib/monaco.js';
import { api } from '@/lib/api.js';
import { cleanPath, ext, fmtTime, langFor, mediaKind } from '@/lib/files.js';
import { formatText, prettierParser } from '@/lib/prettier.js';
import { diffHelpOnce } from '@/lib/tour.js';
import { useToastStore } from '@/stores/toasts.js';
import { useRewindStore } from '@/stores/rewind.js';
import { useAiStore } from '@/stores/ai.js';

export const useEditorStore = defineStore('editor', () => {
  const { toast } = useToastStore();

  // ---------------------------------------------------------------- state

  const name = ref('');
  const me = ref(null);
  const project = ref(null);
  const files = ref([]);
  const current = ref(null); // path of the open file
  const status = ref('loading'); // 'loading' | 'ready' | 'notfound'
  const saveStatus = ref(''); // '' | 'dirty' | 'saving' | 'saved'
  const pane = ref('editor'); // what the editor column shows: 'editor' | 'diff' | 'binary'
  const binary = ref(null); // { path, src, kind } for a media file, or { message }
  const diffLabels = ref({ left: '', right: '' });
  const showPreview = ref(true);
  const framePath = ref(''); // path shown in the preview, relative to the project
  const logs = ref([]); // { id, level, text } from the preview's console
  const errors = ref(0);
  const ctxMenu = ref(null); // { info } while the preview's right-click menu is open
  const style = ref(null); // { info, changes, values, version } while the style panel is open

  const canEdit = computed(() => !!project.value?.can_edit);
  const projUrl = computed(() => `/api/projects/${encodeURIComponent(name.value)}`);
  const previewBase = computed(() =>
    me.value?.preview_host
      ? `${location.protocol}//${name.value}.${me.value.preview_host}/`
      : `/p/${encodeURIComponent(name.value)}/`,
  );
  const previewLabel = computed(() =>
    me.value?.preview_host ? `${name.value}.${me.value.preview_host}/` : `/p/${name.value}/`,
  );

  // ---------------------------------------------------------------- non-reactive

  let editor = null;
  let diffEditor = null;
  let diffEl = null;
  let frame = null;
  const models = new Map();
  const viewStates = new Map();
  const timers = new Map();
  let pending = 0;
  let saveChain = Promise.resolve();
  let applying = false; // true while text is replaced from outside, so it isn't saved again
  let reloadTimer = null;
  let logId = 0;
  let diffToken = 0;

  const fileUrl = (p) => `${projUrl.value}/files?path=${encodeURIComponent(p)}`;
  const versionFileUrl = (id, p) =>
    `${projUrl.value}/history/${id}/file?path=${encodeURIComponent(p)}`;

  // ---------------------------------------------------------------- load / unload

  function reset() {
    for (const t of timers.values()) clearTimeout(t);
    timers.clear();
    for (const m of models.values()) m.dispose();
    models.clear();
    unmountEditor();
    viewStates.clear();
    frame = null;
    clearTimeout(reloadTimer);
    pending = 0;
    saveChain = Promise.resolve();
    applying = false;
    diffToken++;
    name.value = '';
    me.value = project.value = current.value = binary.value = ctxMenu.value = style.value = null;
    files.value = [];
    logs.value = [];
    status.value = 'loading';
    saveStatus.value = '';
    pane.value = 'editor';
    diffLabels.value = { left: '', right: '' };
    showPreview.value = true;
    framePath.value = '';
    errors.value = 0;
  }

  // Returns 'login' when nobody is logged in, so the page can send them home.
  async function open(projectName) {
    reset();
    name.value = projectName;
    me.value = await api('GET', '/api/me');
    if (!me.value.user) return 'login';
    try {
      project.value = await api('GET', projUrl.value);
    } catch {
      status.value = 'notfound';
      return 'notfound';
    }
    files.value = project.value.files;
    document.title = `${projectName} · glitch~nhance`;
    status.value = 'ready';
    return 'ready';
  }

  // Called by Editor.vue once its elements exist.
  function mountEditor(el, diffElement) {
    diffEl = diffElement;
    editor = monaco.editor.create(el, {
      automaticLayout: true,
      minimap: { enabled: false },
      fontSize: 14,
      tabSize: 2,
      wordWrap: 'on',
      scrollBeyondLastLine: false,
      readOnly: !canEdit.value,
      fixedOverflowWidgets: true,
      padding: { top: 8 },
      renderLineHighlight: 'line',
      smoothScrolling: true,
    });
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => flushAll());
    editor.addCommand(monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.KeyF, () =>
      formatCurrent(),
    );
    // Reopen the file that was open (when Editor.vue is re-mounted by hot reload), else a sensible first one.
    const first =
      [current.value, 'index.html', 'README.md'].find(
        (p) => p && files.value.some((f) => f.path === p),
      ) || files.value[0]?.path;
    current.value = null;
    if (first) openFile(first);
  }

  // Called by Editor.vue when it goes away. The models (open files) stay, in case it comes back.
  function unmountEditor() {
    saveViewState();
    const old = diffEditor?.getModel();
    diffEditor?.dispose();
    old?.original.dispose();
    old?.modified.dispose();
    editor?.dispose();
    editor = diffEditor = diffEl = null;
  }

  const hasUnsaved = () => pending > 0 || timers.size > 0;

  // ---------------------------------------------------------------- opening files

  async function fetchText(url) {
    const res = await api('GET', url, undefined, { raw: true });
    return res.text();
  }

  // Remember the scroll position and cursor of the open file, to restore when it's opened again.
  function saveViewState() {
    const model = models.get(current.value);
    if (editor && model && editor.getModel() === model) {
      viewStates.set(current.value, editor.saveViewState());
    }
  }

  async function openFile(path) {
    const f = files.value.find((x) => x.path === path);
    if (!f) return;
    const ai = useAiStore();
    const rewind = useRewindStore();
    if (ai.review) ai.hideReview();
    saveViewState();
    current.value = path;
    if (rewind.tv) return rewind.showDiff();
    if (f.binary) return showBinary(path);
    let model = models.get(path);
    if (!model) {
      const text = await fetchText(fileUrl(path));
      model = models.get(path); // another click may have loaded it meanwhile
      if (!model) {
        model = monaco.editor.createModel(text, langFor(path), monaco.Uri.file(`/${path}`));
        model.onDidChangeContent(() => scheduleSave(path));
        models.set(path, model);
      }
    }
    if (current.value !== path || rewind.tv || !editor) return;
    pane.value = 'editor';
    editor.setModel(model);
    const vs = viewStates.get(path);
    if (vs) editor.restoreViewState(vs);
    editor.focus();
  }

  // Forget the open file and show nothing (after it was deleted, say), or reopen what's sensible.
  function reopen(preferred) {
    const has = (p) => p && files.value.some((f) => f.path === p);
    const next = [preferred, current.value, 'index.html'].find(has) || files.value[0]?.path;
    current.value = null;
    if (next) openFile(next);
    else {
      editor?.setModel(null);
      pane.value = 'editor';
    }
  }

  function showBinary(path, src = fileUrl(path)) {
    pane.value = 'binary';
    binary.value = { path, src, kind: mediaKind(path) };
  }

  function showMessage(message) {
    pane.value = 'binary';
    binary.value = { message };
  }

  // ---------------------------------------------------------------- saving

  function scheduleSave(path) {
    if (applying || !canEdit.value) return;
    saveStatus.value = 'dirty';
    clearTimeout(timers.get(path));
    timers.set(
      path,
      setTimeout(() => save(path), 500),
    );
  }

  function save(path) {
    clearTimeout(timers.get(path));
    timers.delete(path);
    pending++;
    saveStatus.value = 'saving';
    // Saves run one at a time so they can never land out of order.
    saveChain = saveChain
      .then(async () => {
        const model = models.get(path);
        if (!model) return;
        try {
          await api('PUT', fileUrl(path), model.getValue());
          refreshPreview(path);
          useRewindStore().onSaved();
        } catch (e) {
          toast(`Couldn't save ${path}: ${e.message}`, 'error');
        }
      })
      .finally(() => {
        pending--;
        saveStatus.value = pending || timers.size ? 'saving' : 'saved';
      });
    return saveChain;
  }

  function flushAll() {
    for (const path of [...timers.keys()]) save(path);
    return saveChain;
  }

  // Stop tracking a file that was deleted or moved away: drop its pending save and its editor model.
  function forget(path) {
    clearTimeout(timers.get(path));
    timers.delete(path);
    models.get(path)?.dispose();
    models.delete(path);
    viewStates.delete(path);
  }

  // Bring open editors back in line with the files on disk (after a restore).
  async function syncModels() {
    const present = new Set(files.value.map((f) => f.path));
    for (const [path, model] of [...models]) {
      if (!present.has(path)) {
        model.dispose();
        models.delete(path);
        continue;
      }
      const text = await fetchText(fileUrl(path));
      if (text !== model.getValue()) {
        applying = true;
        model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
        applying = false;
      }
    }
  }

  // Replace a file's text through its open editor, so it saves normally and Cmd+Z can undo it.
  // Returns false when the file isn't open (the caller writes it directly instead).
  function replaceText(path, text) {
    const model = models.get(path);
    if (!model) return false;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text }], () => null);
    return true;
  }

  // The file's text as it is right now: the editor's copy if it's open, else the saved one.
  // null when the file doesn't exist.
  async function currentText(path) {
    const m = models.get(path);
    if (m) return m.getValue();
    return fetchText(fileUrl(path)).catch((e) => (e.status === 404 ? null : Promise.reject(e)));
  }

  // Text selected in the editor, for giving the AI context.
  function selectionText() {
    const model = models.get(current.value);
    if (!editor || !model || editor.getModel() !== model) return '';
    const sel = editor.getSelection();
    return sel && !sel.isEmpty() ? model.getValueInRange(sel) : '';
  }

  // ---------------------------------------------------------------- file operations

  async function refreshFiles() {
    project.value = await api('GET', projUrl.value);
    files.value = project.value.files;
  }

  async function newFile() {
    const path = cleanPath(
      prompt('New file name. Use / for folders, e.g. js/game.js', 'script.js'),
    );
    if (!path) return;
    if (files.value.some((f) => f.path === path)) return openFile(path);
    try {
      await api('PUT', fileUrl(path), '');
      await refreshFiles();
      openFile(path);
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function upload(list) {
    for (const file of list) {
      try {
        await api('PUT', fileUrl(cleanPath(file.name)), await file.arrayBuffer());
        models.get(file.name)?.dispose();
        models.delete(file.name);
      } catch (e) {
        toast(`${file.name}: ${e.message}`, 'error');
      }
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
      await api('POST', `${projUrl.value}/rename`, { from: path, to });
      forget(path);
      await refreshFiles();
      if (current.value === path) openFile(to);
      reloadPreview();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function deleteFile(path) {
    if (!confirm(`Delete ${path}? (You can get it back from Rewind.)`)) return;
    try {
      clearTimeout(timers.get(path));
      timers.delete(path);
      await saveChain;
      await api('DELETE', fileUrl(path));
      forget(path);
      await refreshFiles();
      if (current.value === path) {
        current.value = null;
        reopen();
      }
      reloadPreview();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  // Both return the new project name for the page to go to, or null.
  async function renameProject() {
    const next = prompt('Rename project (a–z, 0–9 and dashes):', name.value);
    if (!next || next === name.value) return null;
    try {
      await flushAll();
      const r = await api('PATCH', projUrl.value, { name: next.trim().toLowerCase() });
      return r.name;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  }

  async function remix() {
    try {
      await flushAll();
      const r = await api('POST', `${projUrl.value}/remix`);
      return r.name;
    } catch (e) {
      toast(e.message, 'error');
      return null;
    }
  }

  // ---------------------------------------------------------------- diffs (used by rewind and AI)

  const newDiffToken = () => ++diffToken;
  const isDiffToken = (t) => t === diffToken;
  const cancelDiff = () => diffToken++;

  function setDiff(path, left, right, leftLabel, rightLabel) {
    diffLabels.value = { left: leftLabel, right: rightLabel };
    pane.value = 'diff';
    if (!diffEditor) {
      diffEditor = monaco.editor.createDiffEditor(diffEl, {
        readOnly: true,
        originalEditable: false,
        automaticLayout: true,
        minimap: { enabled: false },
        fontSize: 14,
        wordWrap: 'on',
        scrollBeyondLastLine: false,
        useInlineViewWhenSpaceIsLimited: true,
        renderOverviewRuler: false,
      });
    }
    const lang = langFor(path);
    const old = diffEditor.getModel();
    diffEditor.setModel({
      original: monaco.editor.createModel(left ?? '', lang),
      modified: monaco.editor.createModel(right ?? '', lang),
    });
    old?.original.dispose();
    old?.modified.dispose();
    diffHelpOnce();
  }

  // ---------------------------------------------------------------- formatting

  async function formatCurrent() {
    const path = current.value;
    const model = models.get(path);
    if (!path || !prettierParser(path) || !model || !canEdit.value) return;
    if (useRewindStore().tv || useAiStore().review) return;
    try {
      const before = model.getValue();
      const after = await formatText(before, path);
      if (models.get(path) !== model || model.getValue() !== before) return; // typed meanwhile
      if (after === before) {
        toast('Already tidy ✓');
        return;
      }
      // An edit (not setValue) so Cmd+Z undoes the formatting.
      editor.pushUndoStop();
      model.pushEditOperations(
        editor.getSelections(),
        [{ range: model.getFullModelRange(), text: after }],
        () => null,
      );
      editor.pushUndoStop();
      toast('Tidied with Prettier ✨');
    } catch (e) {
      // Syntax errors come back with a line and column; the first line of the message is enough.
      toast(`Prettier couldn't format this: ${String(e.message).split('\n')[0]}`, 'error');
    }
  }

  // ---------------------------------------------------------------- preview

  function previewRoot() {
    const tv = useRewindStore().tv;
    return tv ? `${previewBase.value}@${tv.id}/` : previewBase.value;
  }

  function setFrame(el) {
    frame = el;
  }

  function sendFrame(msg) {
    try {
      frame.contentWindow.postMessage({ __glitchCmd: true, ...msg }, '*');
    } catch {
      // Frame gone or not loaded yet.
    }
  }

  function loadPreview(sub = framePath.value) {
    framePath.value = sub;
    logDivider();
    if (frame) frame.src = previewRoot() + sub;
  }

  function reloadPreview() {
    logDivider();
    try {
      frame.contentWindow.location.reload();
    } catch {
      if (frame) frame.src = previewRoot() + framePath.value;
    }
  }

  // CSS edits swap the stylesheet in place (no flash, page state kept); everything else reloads.
  function refreshPreview(path) {
    if (useRewindStore().tv) return;
    clearTimeout(reloadTimer);
    reloadTimer = setTimeout(() => {
      if (ext(path) === 'css') {
        try {
          const target = new URL(previewBase.value + path, location.href).pathname;
          let swapped = false;
          for (const link of frame.contentDocument.querySelectorAll('link[rel~="stylesheet"]')) {
            const u = new URL(link.href);
            if (u.pathname === target) {
              u.searchParams.set('_t', Date.now());
              link.href = u.href;
              swapped = true;
            }
          }
          if (swapped) return;
        } catch {
          // Preview on another origin (preview host): fall back to a reload.
        }
      }
      reloadPreview();
    }, 80);
  }

  // The preview's bridge.js reports the path of each page it loads.
  function onFrameLoaded(path) {
    closeStylePanel();
    const basePath = new URL(previewRoot(), location.href).pathname;
    const p = decodeURIComponent(path || '');
    framePath.value = p.startsWith(basePath) ? p.slice(basePath.length) : p.replace(/^\//, '');
  }

  const frameRect = () => frame?.getBoundingClientRect();

  // ---------------------------------------------------------------- logs

  function addLog(level, text) {
    logs.value.push({ id: logId++, level, text });
    if (logs.value.length > 500) logs.value.splice(0, logs.value.length - 500);
    if (level === 'error') errors.value++;
  }

  function logDivider() {
    const last = logs.value[logs.value.length - 1];
    if (last && last.level !== 'divider') {
      logs.value.push({
        id: logId++,
        level: 'divider',
        text: `reloaded ${fmtTime(Date.now() / 1000)}`,
      });
    }
    errors.value = 0;
  }

  function clearLogs() {
    logs.value = [];
    errors.value = 0;
  }

  // ---------------------------------------------------------------- right-click menu & style panel

  function showCtxMenu(info) {
    ctxMenu.value = { info };
  }

  function hideCtxMenu() {
    ctxMenu.value = null;
  }

  function openStylePanel(info, props) {
    style.value = { info, changes: {}, values: null, version: 0, props };
    sendFrame({ cmd: 'getStyles', props });
  }

  function fillStylePanel(values) {
    if (!style.value) return;
    style.value.values = values;
    style.value.version++; // re-renders the fields, so a reset shows the page's values again
  }

  function setStyle(prop, value) {
    if (!style.value) return;
    style.value.changes[prop] = value;
    sendFrame({ cmd: 'setStyle', prop, value });
  }

  function resetStyles() {
    if (!style.value) return;
    style.value.changes = {};
    sendFrame({ cmd: 'resetStyles' });
    sendFrame({ cmd: 'getStyles', props: style.value.props });
  }

  function closeStylePanel() {
    if (!style.value) return;
    sendFrame({ cmd: 'resetStyles' });
    style.value = null;
  }

  return {
    // state
    name,
    me,
    project,
    files,
    current,
    status,
    saveStatus,
    pane,
    binary,
    diffLabels,
    showPreview,
    framePath,
    logs,
    errors,
    ctxMenu,
    style,
    canEdit,
    projUrl,
    previewBase,
    previewLabel,
    // load
    reset,
    open,
    mountEditor,
    unmountEditor,
    hasUnsaved,
    // files
    fileUrl,
    versionFileUrl,
    fetchText,
    openFile,
    reopen,
    saveViewState,
    showBinary,
    showMessage,
    flushAll,
    forget,
    syncModels,
    replaceText,
    currentText,
    selectionText,
    refreshFiles,
    newFile,
    upload,
    renameFile,
    deleteFile,
    renameProject,
    remix,
    formatCurrent,
    setCurrent: (p) => (current.value = p),
    // diffs
    newDiffToken,
    isDiffToken,
    cancelDiff,
    setDiff,
    // preview
    setFrame,
    sendFrame,
    loadPreview,
    reloadPreview,
    onFrameLoaded,
    frameRect,
    addLog,
    logDivider,
    clearLogs,
    showCtxMenu,
    hideCtxMenu,
    openStylePanel,
    fillStylePanel,
    setStyle,
    resetStyles,
    closeStylePanel,
  };
});
