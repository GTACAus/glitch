// Rewind: the project's saved versions, and "time travel" view of one of them (tv).
import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api.js';
import { fmtDay, fmtTime, isBinary } from '@/lib/files.js';
import { useToastStore } from '@/stores/toasts.js';
import { useEditorStore } from '@/stores/editor.js';
import { useAiStore } from '@/stores/ai.js';

// Every file a version touched, as [path, 'modified' | 'added' | 'deleted'].
export function changedFiles(v) {
  const c = v.changes;
  return [
    ...c.modified.map((p) => [p, 'modified']),
    ...c.added.map((p) => [p, 'added']),
    ...c.deleted.map((p) => [p, 'deleted']),
  ];
}

export const useRewindStore = defineStore('rewind', () => {
  const { toast } = useToastStore();

  const open = ref(false); // the Rewind pane replaces the file list while open
  const history = ref([]); // newest first
  // The version being looked at: { id, v, prev, isLatest, files, file, mode: 'step' | 'now' }
  const tv = ref(null);

  const textCache = new Map();
  let selectToken = 0;
  let histTimer = null;

  function reset() {
    open.value = false;
    history.value = [];
    tv.value = null;
    textCache.clear();
    clearTimeout(histTimer);
  }

  async function toggle(next = !open.value) {
    open.value = next;
    const ed = useEditorStore();
    if (next) {
      await ed.flushAll();
      await load();
    } else if (tv.value) {
      exit();
    }
  }

  async function load() {
    const ed = useEditorStore();
    history.value = await api('GET', `${ed.projUrl}/history`);
    textCache.clear();
  }

  // After each save, refresh the list (if it's showing and not mid time-travel).
  function onSaved() {
    if (!open.value || tv.value) return;
    clearTimeout(histTimer);
    histTimer = setTimeout(load, 400);
  }

  function describe(v) {
    if (v.kind === 'create') return v.label || 'Project created';
    if (v.kind === 'checkpoint') return `★ ${v.label}`;
    if (v.kind === 'restore') {
      const from = history.value.find((h) => h.id === v.ref);
      const when = from ? ` from ${fmtTime(from.updated)}` : '';
      return v.label ? `Restored ${v.label}${when}` : `Restored everything${when}`;
    }
    const { added, modified, deleted } = v.changes;
    const part = (verb, list) => {
      if (!list.length) return null;
      return list.length === 1
        ? `${verb} ${list[0].split('/').pop()}`
        : `${verb} ${list.length} files`;
    };
    return (
      [part('Edited', modified), part('Added', added), part('Deleted', deleted)]
        .filter(Boolean)
        .join(', ') || 'No changes'
    );
  }

  async function checkpoint() {
    const label = prompt('Name this checkpoint, so it is easy to find later:', 'Working version');
    if (!label) return;
    const ed = useEditorStore();
    try {
      await ed.flushAll();
      await api('POST', `${ed.projUrl}/checkpoint`, { label });
      await load();
      toast('Checkpoint saved ★');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function selectVersion(id) {
    const ed = useEditorStore();
    const idx = history.value.findIndex((v) => v.id === id);
    const v = history.value[idx];
    if (!v) return;
    ed.saveViewState();
    const ai = useAiStore();
    if (ai.review) ai.hideReview();
    const token = ++selectToken;
    const { files } = await api('GET', `${ed.projUrl}/history/${id}`);
    if (token !== selectToken) return;
    // Stay on the same file if this version changed it; else the first file it changed.
    const changed = changedFiles(v).map(([p]) => p);
    const prevFile = tv.value?.file;
    const file =
      [prevFile, ed.current].find((p) => p && changed.includes(p)) ||
      changed[0] ||
      [prevFile, ed.current].find((p) => p && files.includes(p)) ||
      files[0];
    tv.value = {
      id,
      v,
      prev: history.value[idx + 1] || null,
      isLatest: idx === 0,
      files,
      file,
      mode: tv.value?.mode || 'step',
    };
    showDiff();
    ed.loadPreview('');
  }

  // ↑ ↓ in the timeline.
  function scrub(delta) {
    const list = history.value;
    const idx = tv.value ? list.findIndex((v) => v.id === tv.value.id) : -1;
    const next = Math.min(Math.max(idx + delta, 0), list.length - 1);
    if (list[next]) selectVersion(list[next].id);
  }

  function setFile(path) {
    tv.value.file = path;
    showDiff();
  }

  function setMode(mode) {
    tv.value.mode = mode;
    showDiff();
  }

  function versionText(id, path) {
    const ed = useEditorStore();
    const key = `${id}:${path}`;
    if (!textCache.has(key)) {
      textCache.set(
        key,
        ed
          .fetchText(ed.versionFileUrl(id, path))
          .catch((e) => (e.status === 404 ? null : Promise.reject(e))),
      );
    }
    return textCache.get(key);
  }

  async function showDiff() {
    const ed = useEditorStore();
    const t = tv.value;
    if (!t) return;
    const path = t.file;
    const token = ed.newDiffToken();
    if (!path) return ed.showMessage('No files in this version.');
    if (isBinary(path)) {
      return ed.showBinary(
        path,
        t.files.includes(path) ? ed.versionFileUrl(t.id, path) : ed.fileUrl(path),
      );
    }
    let left, right, leftLabel, rightLabel;
    const when = fmtTime(t.v.updated);
    if (t.mode === 'step') {
      left = t.prev ? await versionText(t.prev.id, path) : null;
      right = await versionText(t.id, path);
      leftLabel = t.prev ? `Before (${fmtTime(t.prev.updated)})` : 'Before (nothing)';
      rightLabel = `After (${when})`;
    } else {
      left = await versionText(t.id, path);
      right = await ed.currentText(path);
      leftLabel = `Then (${when})`;
      rightLabel = 'Now';
    }
    if (!ed.isDiffToken(token) || tv.value !== t) return;
    if (left === null) leftLabel += ' · file did not exist';
    if (right === null) rightLabel += ' · file did not exist';
    ed.setDiff(path, left, right, leftLabel, rightLabel);
  }

  function exit() {
    if (!tv.value) return;
    const ed = useEditorStore();
    tv.value = null;
    ed.cancelDiff();
    ed.loadPreview('');
    ed.reopen();
  }

  async function restore(path) {
    const t = tv.value;
    const ed = useEditorStore();
    const when = `${fmtDay(t.v.updated).toLowerCase()} at ${fmtTime(t.v.updated)}`;
    const msg = path
      ? `Put ${path} back to how it was ${when}?`
      : `Put the whole project back to how it was ${when}?`;
    if (
      !confirm(
        `${msg}\n\nNothing is lost: what you have now stays in Rewind, so you can undo this.`,
      )
    ) {
      return;
    }
    try {
      await ed.flushAll();
      await api('POST', `${ed.projUrl}/history/${t.id}/restore`, path ? { path } : {});
      await ed.refreshFiles();
      await ed.syncModels();
      exit();
      await load();
      toast('Restored ✓');
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  return {
    open,
    history,
    tv,
    reset,
    toggle,
    load,
    onSaved,
    describe,
    checkpoint,
    selectVersion,
    scrub,
    setFile,
    setMode,
    showDiff,
    exit,
    restore,
  };
});
