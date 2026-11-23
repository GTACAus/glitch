<script setup>
import { computed, nextTick, ref } from 'vue';
import { baseName, ext, IMAGE_EXT } from '@/lib/files.js';
import { useEditorStore } from '@/stores/editor.js';

const ed = useEditorStore();
const picker = ref(null);

// Inline rename: the path of the file being renamed, and what's typed in its box.
const renaming = ref(null);
const draft = ref('');

async function startRename(path) {
  renaming.value = path;
  draft.value = path;
  await nextTick();
  const input = document.querySelector('.file-name-prompt');
  if (!input) return;
  input.focus();
  // Select just the file name (before the extension) so typing replaces it.
  const start = path.lastIndexOf('/') + 1;
  const dot = path.lastIndexOf('.');
  input.setSelectionRange(start, dot > start ? dot : path.length);
}

function commitRename() {
  const from = renaming.value;
  if (!from) return; // already committed or cancelled (e.g. Enter then blur)
  renaming.value = null;
  ed.renameFile(from, draft.value);
}

function cancelRename() {
  renaming.value = null;
}

// Inline new file: a text box at the top of the tree while `creating` is true.
const creating = ref(false);
const newName = ref('');
const newInput = ref(null);

async function startNewFile() {
  creating.value = true;
  newName.value = '';
  await nextTick();
  newInput.value?.focus();
}

function commitNewFile() {
  if (!creating.value) return; // already committed or cancelled (e.g. Enter then blur)
  creating.value = false;
  ed.newFile(newName.value);
}

function cancelNewFile() {
  creating.value = false;
}

// The flat file list as tree rows: each folder, then its files, indented by depth.
const rows = computed(() => {
  const root = { dirs: {}, files: [] };
  for (const f of ed.files) {
    const parts = f.path.split('/');
    let node = root;
    for (const d of parts.slice(0, -1)) node = node.dirs[d] ??= { dirs: {}, files: [] };
    node.files.push(f);
  }
  const out = [];
  const walk = (node, depth, prefix) => {
    for (const [name, child] of Object.entries(node.dirs).sort((a, b) =>
      a[0].localeCompare(b[0]),
    )) {
      out.push({ key: `d:${prefix}${name}`, dir: `${name}/`, depth });
      walk(child, depth + 1, `${prefix}${name}/`);
    }
    for (const f of [...node.files].sort((a, b) => a.path.localeCompare(b.path))) {
      const e = ext(f.path);
      out.push({
        key: f.path,
        path: f.path,
        name: baseName(f.path),
        dot: IMAGE_EXT.has(e) ? 'img' : e,
        depth,
      });
    }
  };
  walk(root, 0, '');
  return out;
});

function onPick() {
  ed.upload([...picker.value.files]);
  picker.value.value = '';
}
</script>

<template>
  <div id="filesPane">
    <div class="pane-head">
      <span>Files</span>
      <span v-if="ed.canEdit" id="fileActions">
        <button
          id="newFile"
          class="icon-btn"
          title="New file (use / for folders)"
          @click="startNewFile"
        >
          +
        </button>
        <button id="uploadBtn" class="icon-btn" title="Upload files" @click="picker.click()">
          ⇪
        </button>
      </span>
    </div>
    <ul id="tree" class="tree">
      <li v-if="creating" class="file changing-name">
        <span class="dot"></span>
        <input
          ref="newInput"
          v-model="newName"
          class="file-name-prompt"
          placeholder="e.g. script.js or js/game.js"
          spellcheck="false"
          @keydown.enter.prevent="commitNewFile"
          @keydown.esc.prevent="cancelNewFile"
          @blur="commitNewFile"
        />
      </li>
      <template v-for="row in rows" :key="row.key">
        <li v-if="row.dir" class="dir" :style="{ '--d': row.depth }">{{ row.dir }}</li>
        <li
          v-else
          class="file"
          :class="{ active: row.path === ed.current, 'changing-name': renaming === row.path }"
          :title="row.path"
          :style="{ '--d': row.depth }"
          @click="renaming !== row.path && ed.openFile(row.path)"
        >
          <span class="dot" :class="row.dot"></span>
          <input
            v-if="renaming === row.path"
            v-model="draft"
            class="file-name-prompt"
            spellcheck="false"
            @click.stop
            @keydown.enter.prevent="commitRename"
            @keydown.esc.prevent="cancelRename"
            @blur="commitRename"
          />
          <span v-else class="fname">{{ row.name }}</span>
          <span v-if="ed.canEdit && renaming !== row.path" class="acts">
            <button class="icon-btn" title="Rename / move" @click.stop="startRename(row.path)">
              ✎
            </button>
            <button class="icon-btn" title="Delete" @click.stop="ed.deleteFile(row.path)">✕</button>
          </span>
        </li>
      </template>
    </ul>
    <div v-if="ed.canEdit" id="dropHint" class="drop-hint">Drop images or files here to upload</div>
    <input ref="picker" type="file" multiple hidden @change="onPick" />
  </div>
</template>

<style scoped>
.file-name-prompt {
  flex: 1;
  min-width: 0;
  font: inherit;
  padding: 0 4px;
}
</style>
