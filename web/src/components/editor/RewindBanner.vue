<script setup>
// Shown above the diff while looking at an earlier version.
import { computed } from 'vue';
import { baseName, fmtDay, fmtTime } from '@/lib/files.js';
import { useEditorStore } from '@/stores/editor.js';
import { changedFiles, useRewindStore } from '@/stores/rewind.js';

const ed = useEditorStore();
const rewind = useRewindStore();
const tv = computed(() => rewind.tv);

const ICON = { added: '+', modified: '~', deleted: '−' };

const meta = computed(
  () =>
    `${fmtDay(tv.value.v.updated)}, ${fmtTime(tv.value.v.updated)}` +
    (tv.value.v.author === ed.me.user.id ? '' : ` · by ${tv.value.v.author_name}`),
);
const changed = computed(() => changedFiles(tv.value.v));
// Every other file, then or now, for the "Other files…" picker.
const others = computed(() =>
  [...new Set([...tv.value.files, ...ed.files.map((f) => f.path)])]
    .filter((p) => !changed.value.some(([c]) => c === p))
    .sort(),
);
const canRestore = computed(() => ed.canEdit && !tv.value.isLatest);
const restoreFileLabel = computed(() => {
  const name = baseName(tv.value.file || '');
  return tv.value.files.includes(tv.value.file)
    ? `Restore just ${name}`
    : `Remove ${name} (it didn't exist then)`;
});

function pick(e) {
  if (e.target.value) rewind.setFile(e.target.value);
}
</script>

<template>
  <div id="tvBanner" class="tv-banner">
    <div class="tv-row">
      <span class="tv-title">{{ rewind.describe(tv.v) }}</span>
      <span class="muted">{{ meta }}</span>
      <div class="spacer"></div>
      <div id="tvMode" class="seg">
        <button :class="{ on: tv.mode === 'step' }" @click="rewind.setMode('step')">
          What changed here
        </button>
        <button :class="{ on: tv.mode === 'now' }" @click="rewind.setMode('now')">
          Compare with now
        </button>
      </div>
    </div>
    <div id="tvFiles" class="tv-row">
      <span v-if="changed.length" class="muted">Files changed:</span>
      <button
        v-for="[p, kind] in changed"
        :key="p"
        class="chip"
        :class="{ on: p === tv.file }"
        :title="kind"
        @click="rewind.setFile(p)"
      >
        <span class="k" :class="kind">{{ ICON[kind] }}</span
        >{{ p }}
      </button>
      <select v-if="others.length" :value="others.includes(tv.file) ? tv.file : ''" @change="pick">
        <option value="">{{ changed.length ? 'Other files…' : 'Pick a file…' }}</option>
        <option v-for="p in others" :key="p" :value="p">{{ p }}</option>
      </select>
    </div>
    <div class="tv-row">
      <button
        v-if="canRestore && tv.file"
        id="restoreFile"
        class="btn small"
        @click="rewind.restore(tv.file)"
      >
        {{ restoreFileLabel }}
      </button>
      <button
        v-if="canRestore"
        id="restoreAll"
        class="btn small primary"
        @click="rewind.restore(null)"
      >
        Restore everything to this moment
      </button>
      <div class="spacer"></div>
      <button id="exitTv" class="btn small" @click="rewind.exit()">Back to now</button>
    </div>
  </div>
</template>
