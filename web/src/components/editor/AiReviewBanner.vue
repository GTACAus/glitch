<script setup>
// Shown above the diff while reviewing an AI suggestion.
import { computed } from 'vue';
import { baseName } from '@/lib/files.js';
import { changeKind, changeLabel, useAiStore } from '@/stores/ai.js';

const ai = useAiStore();
const r = computed(() => ai.review);

const ICON = { add: '+', edit: '~', delete: '−', rename: '→' };
const CHIP = { add: 'added', edit: 'modified', delete: 'deleted', rename: 'renamed' };
const TITLE = { add: 'New file', edit: 'Changed', delete: 'Will be deleted', rename: 'Renamed' };

const left = computed(() => r.value.changes.filter((c) => !c.applied));
const cur = computed(() => r.value.changes.find((c) => c.path === r.value.file));
const meta = computed(() =>
  left.value.length
    ? `${left.value.length} change${left.value.length === 1 ? '' : 's'} to review`
    : 'All applied',
);
const applyFileLabel = computed(() => {
  const verb = { delete: 'Delete', rename: 'Rename' }[changeKind(cur.value)] || 'Apply';
  return `${verb} just ${baseName(cur.value.path)}`;
});
</script>

<template>
  <div id="aiBanner" class="tv-banner ai-banner">
    <div class="tv-row">
      <span class="tv-title">✦ AI suggestion</span>
      <span class="muted">{{ meta }}</span>
      <div class="spacer"></div>
      <button v-if="left.length" id="aiDiscard" class="btn small" @click="ai.discard()">
        Discard
      </button>
    </div>
    <div id="aiFiles" class="tv-row">
      <button
        v-for="c in r.changes"
        :key="c.path"
        class="chip"
        :class="{ on: c.path === r.file, applied: c.applied }"
        :title="TITLE[changeKind(c)]"
        @click="ai.selectFile(c.path)"
      >
        <span class="k" :class="CHIP[changeKind(c)]">{{ ICON[changeKind(c)] }}</span
        >{{ changeLabel(c) }}
      </button>
    </div>
    <div class="tv-row">
      <button
        v-if="!cur.applied && r.changes.length > 1"
        id="aiApplyFile"
        class="btn small"
        @click="ai.apply([r.file])"
      >
        {{ applyFileLabel }}
      </button>
      <button
        v-if="left.length"
        id="aiApplyAll"
        class="btn small primary"
        @click="ai.apply(r.changes.map((c) => c.path))"
      >
        {{ left.length === r.changes.length ? 'Apply all changes' : 'Apply the rest' }}
      </button>
      <div class="spacer"></div>
      <button id="aiClose" class="btn small" @click="ai.closeReview()">Back to editor</button>
    </div>
  </div>
</template>
