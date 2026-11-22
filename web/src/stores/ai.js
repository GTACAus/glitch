// Ask AI: the chat, reviewing and applying its suggested changes, and "Suggestions for you".
// The AI tools cost money per request, so they only show once switched on (see lib/aiTools.js).
import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api.js';
import { aiToolsOn } from '@/lib/aiTools.js';
import { getItem, setItem } from '@/lib/storage.js';
import { forgetSuggestions, loadSuggestions, storeSuggestion } from '@/lib/suggestions.js';
import { useToastStore } from '@/stores/toasts.js';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';

const MAX_CHAT = 40;

// Suggestions saved before renames/deletes existed have no kind.
export const changeKind = (c) => c.kind || (c.before === null ? 'add' : 'edit');

export function changeLabel(c) {
  const k = changeKind(c);
  if (k === 'rename') return `${c.from} → ${c.path}`;
  if (k === 'delete') return `${c.path} (delete)`;
  return c.path;
}

export const useAiStore = defineStore('ai', () => {
  const { toast } = useToastStore();

  const toolsOn = ref(false);
  const chat = ref([]); // { id, saved, role: 'user' | 'model' | 'error', text, files, changes, applied, discarded, model }
  const busy = ref(false);
  const draft = ref(''); // the chat box's text
  const focusTick = ref(0); // bumped to ask the chat box to take focus
  const review = ref(null); // { msg, changes, file } while a suggestion's diff is showing
  const ideas = ref({ open: false, loading: false, list: [], sub: '', title: '', error: '' });

  const available = computed(() => {
    const ed = useEditorStore();
    return !!ed.me?.ai && ed.canEdit;
  });
  const visible = computed(() => available.value && toolsOn.value);

  let ideasToken = 0;
  const chatKey = () => `glitch.chat.${useEditorStore().name}`;

  function reset() {
    toolsOn.value = false;
    chat.value = [];
    busy.value = false;
    draft.value = '';
    review.value = null;
    ideas.value = { open: false, loading: false, list: [], sub: '', title: '', error: '' };
    ideasToken++;
  }

  async function init() {
    if (!available.value) return;
    toolsOn.value = aiToolsOn();
    try {
      chat.value = JSON.parse(getItem(chatKey()) || '[]');
    } catch {
      chat.value = [];
    }
    const saved = await loadSuggestions(useEditorStore().name);
    for (const m of chat.value) {
      const s = m.id && saved.get(m.id);
      if (s && !m.changes) m.changes = s.changes;
    }
  }

  // The build label's triple-click switches the tools on or off.
  function setTools(on) {
    toolsOn.value = on;
    if (!on) {
      if (review.value) closeReview();
      ideas.value.open = false;
    }
  }

  // Put text in the chat box and focus it, for the person to finish and send.
  function setDraft(text) {
    draft.value = text;
    focusTick.value++;
  }

  // Keeps the last 40 messages. The big suggested file contents are stored separately.
  function saveChat() {
    const dropped = chat.value.slice(0, -MAX_CHAT);
    if (dropped.length) {
      forgetSuggestions(dropped);
      chat.value = chat.value.slice(-MAX_CHAT);
    }
    const slim = chat.value.map(({ id, saved, role, text, files, applied, discarded, model }) => ({
      id,
      saved,
      role,
      text,
      files,
      applied,
      discarded,
      model,
    }));
    setItem(chatKey(), JSON.stringify(slim));
  }

  function clearChat() {
    if (chat.value.length && !confirm('Start a new chat? This one will be cleared.')) return;
    forgetSuggestions(chat.value);
    chat.value = [];
    saveChat();
    if (review.value) closeReview();
  }

  async function ask(prompt) {
    const text = (prompt ?? draft.value).trim();
    if (!text || busy.value) return;
    const ed = useEditorStore();
    draft.value = '';
    chat.value.push({ role: 'user', text });
    busy.value = true;
    try {
      await ed.flushAll();
      // Earlier turns are sent as plain text; the server attaches the project's current files to the newest one.
      const messages = chat.value
        .filter((m) => m.role !== 'error')
        .map((m) => ({
          role: m.role,
          text: m.files?.length
            ? `${m.text}\n\n[Proposed changes to: ${m.files.join(', ')}${m.applied ? ' (applied)' : ''}]`
            : m.text,
        }));
      const r = await api('POST', `${ed.projUrl}/ai`, {
        messages,
        current: ed.current,
        selection: ed.selectionText(),
      });
      chat.value.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        saved: Date.now(),
        role: 'model',
        text: r.reply || 'Done.',
        files: r.changes.map(changeLabel),
        changes: r.changes,
        model: r.model,
      });
      const msg = chat.value[chat.value.length - 1]; // the reactive copy, so later edits show
      storeSuggestion(ed.name, msg);
      if (msg.changes.length) openReview(msg);
    } catch (e) {
      chat.value.push({ role: 'error', text: e.message });
    } finally {
      busy.value = false;
      saveChat();
    }
  }

  // ---------------------------------------------------------------- reviewing a suggestion

  function openReview(msg) {
    const rewind = useRewindStore();
    if (rewind.tv) rewind.exit();
    useEditorStore().saveViewState();
    const first = msg.changes.find((c) => !c.applied) || msg.changes[0];
    review.value = { msg, changes: msg.changes, file: first.path };
    showDiff();
  }

  function selectFile(path) {
    review.value.file = path;
    showDiff();
  }

  async function showDiff() {
    const ed = useEditorStore();
    const r = review.value;
    const c = r.changes.find((x) => x.path === r.file);
    const k = changeKind(c);
    const token = ed.newDiffToken();
    const source = k === 'rename' ? c.from : c.path;
    const exists = ed.files.some((f) => f.path === source);
    if (c.binary) {
      if (exists) ed.showBinary(source);
      else ed.showMessage(`${source} is already gone.`);
      return;
    }
    // Diff against what's in the editor now, in case it changed since the question was asked.
    const now = exists ? await ed.currentText(source) : null;
    if (!ed.isDiffToken(token) || review.value !== r) return;
    const status = c.applied ? ' · applied' : '';
    if (k === 'delete')
      ed.setDiff(c.path, now, '', 'Now', `Deleted — the whole file goes${status}`);
    else if (k === 'rename') {
      ed.setDiff(c.path, now, c.after, `${c.from} (now)`, `Renamed to ${c.path}${status}`);
    } else {
      ed.setDiff(
        c.path,
        now,
        c.after,
        now === null ? 'Now · new file' : 'Now',
        `AI suggestion${status}`,
      );
    }
  }

  // Stop showing the suggestion, without reopening a file (the caller is about to show something).
  function hideReview() {
    review.value = null;
    useEditorStore().cancelDiff();
  }

  // Back to the editor.
  function closeReview() {
    hideReview();
    useEditorStore().reopen();
  }

  function discard() {
    const msg = review.value.msg;
    msg.discarded = true;
    forgetSuggestions([msg]);
    saveChat();
    closeReview();
  }

  async function apply(paths) {
    const ed = useEditorStore();
    const r = review.value;
    const todo = r.changes.filter((x) => paths.includes(x.path) && !x.applied);
    const deletes = todo.filter((c) => changeKind(c) === 'delete').map((c) => c.path);
    if (
      deletes.length &&
      !confirm(
        `This deletes ${deletes.join(', ')}.\n\nYou can get ${deletes.length === 1 ? 'it' : 'them'} back from Rewind.`,
      )
    ) {
      return;
    }
    let reshaped = false; // files were added, moved or removed, so the file list needs reloading
    try {
      await ed.flushAll();
      // Every step goes through the same file API as doing it by hand, which re-checks every path.
      for (const c of todo) {
        const k = changeKind(c);
        if (k === 'rename') {
          await api('POST', `${ed.projUrl}/rename`, { from: c.from, to: c.path });
          ed.forget(c.from);
          if (!c.binary && c.after !== c.before) await api('PUT', ed.fileUrl(c.path), c.after);
          if (ed.current === c.from) ed.setCurrent(c.path);
          reshaped = true;
        } else if (k === 'delete') {
          await api('DELETE', ed.fileUrl(c.path));
          ed.forget(c.path);
          if (ed.current === c.path) ed.setCurrent(null);
          reshaped = true;
        } else if (!ed.replaceText(c.path, c.after)) {
          await api('PUT', ed.fileUrl(c.path), c.after);
          reshaped = true;
        }
        c.applied = true;
      }
    } catch (e) {
      toast(e.message, 'error');
    }
    try {
      await ed.flushAll();
      if (reshaped) await ed.refreshFiles();
    } catch (e) {
      toast(e.message, 'error');
    }
    ed.reloadPreview();
    const done = r.changes.every((c) => c.applied);
    r.msg.applied = done;
    storeSuggestion(ed.name, r.msg);
    saveChat();
    if (!done) {
      selectFile(r.changes.find((c) => !c.applied).path);
      return;
    }
    toast('Applied ✓  You can undo it from Rewind.');
    hideReview();
    const has = (p) => p && ed.files.some((f) => f.path === p);
    const landed = todo
      .filter((c) => changeKind(c) !== 'delete')
      .map((c) => c.path)
      .reverse()
      .find(has);
    ed.reopen(landed);
  }

  // ---------------------------------------------------------------- suggestions for you

  function openIdeas() {
    ideas.value.open = true;
    loadIdeas();
  }

  async function loadIdeas() {
    const ed = useEditorStore();
    const file = ed.files.find((f) => f.path === ed.current && !f.binary)
      ? ed.current
      : 'index.html';
    const token = ++ideasToken;
    Object.assign(ideas.value, {
      loading: true,
      list: [],
      error: '',
      sub: `Looking at ${file}…`,
      title: '',
    });
    try {
      await ed.flushAll();
      const r = await api('POST', `${ed.projUrl}/ideas`, { current: file });
      if (token !== ideasToken) return;
      Object.assign(ideas.value, {
        list: r.ideas,
        sub: `Six ideas for ${r.file}. Pick one and the AI will draft it for you to review.`,
        title: `Ideas by ${r.model}`,
      });
    } catch (e) {
      if (token !== ideasToken) return;
      Object.assign(ideas.value, { sub: '', error: e.message });
    } finally {
      if (token === ideasToken) ideas.value.loading = false;
    }
  }

  function doIdea(idea) {
    if (busy.value) {
      toast('The AI is still working on your last request');
      return;
    }
    ideas.value.open = false;
    ask(idea.prompt);
  }

  function editIdea(idea) {
    ideas.value.open = false;
    setDraft(idea.prompt);
  }

  return {
    toolsOn,
    chat,
    busy,
    draft,
    focusTick,
    review,
    ideas,
    available,
    visible,
    reset,
    init,
    setTools,
    setDraft,
    clearChat,
    ask,
    openReview,
    selectFile,
    hideReview,
    closeReview,
    discard,
    apply,
    openIdeas,
    loadIdeas,
    doIdea,
    editIdea,
  };
});
