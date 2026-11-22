<script setup>
import { computed, ref } from 'vue';
import { baseName, ext, IMAGE_EXT } from '@/lib/files.js';
import { useEditorStore } from '@/stores/editor.js';

const ed = useEditorStore();
const picker = ref(null);

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
          @click="ed.newFile()"
        >
          +
        </button>
        <button id="uploadBtn" class="icon-btn" title="Upload files" @click="picker.click()">
          ⇪
        </button>
      </span>
    </div>
    <ul id="tree" class="tree">
      <template v-for="row in rows" :key="row.key">
        <li v-if="row.dir" class="dir" :style="{ '--d': row.depth }">{{ row.dir }}</li>
        <li
          v-else
          class="file"
          :class="{ active: row.path === ed.current }"
          :title="row.path"
          :style="{ '--d': row.depth }"
          @click="ed.openFile(row.path)"
        >
          <span class="dot" :class="row.dot"></span>
          <span class="fname">{{ row.name }}</span>
          <span v-if="ed.canEdit" class="acts">
            <button class="icon-btn" title="Rename / move" @click.stop="ed.renameFile(row.path)">
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
