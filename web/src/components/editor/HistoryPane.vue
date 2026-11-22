<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import { fmtDay, fmtTime } from '@/lib/files.js';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';

const ed = useEditorStore();
const rewind = useRewindStore();
const timeline = ref(null);

// Versions with a heading wherever the day changes.
const items = computed(() => {
  const out = [];
  let lastDay = '';
  rewind.history.forEach((v, i) => {
    const day = fmtDay(v.updated);
    if (day !== lastDay) {
      out.push({ key: `day:${day}`, day });
      lastDay = day;
    }
    const who = v.author === ed.me.user.id ? '' : ` · ${v.author_name || 'someone'}`;
    out.push({ key: v.id, v, first: i === 0, meta: `${fmtTime(v.updated)}${who}` });
  });
  return out;
});

function onKeydown(e) {
  if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  rewind.scrub(e.key === 'ArrowDown' ? 1 : -1);
}

// Focus the timeline when the pane opens, so ↑ ↓ work straight away.
watch(
  () => rewind.open,
  (open) => open && nextTick(() => timeline.value?.focus()),
);

// Keep the selected version in view while scrubbing.
watch(
  () => rewind.tv?.id,
  () => nextTick(() => timeline.value?.querySelector('.sel')?.scrollIntoView({ block: 'nearest' })),
);
</script>

<template>
  <div id="historyPane">
    <div class="pane-head">
      <span>Rewind</span>
      <button id="closeHistory" class="icon-btn" title="Close" @click="rewind.toggle(false)">
        ×
      </button>
    </div>
    <button v-if="ed.canEdit" id="checkpointBtn" class="btn small" @click="rewind.checkpoint()">
      ★ Save a checkpoint
    </button>
    <p class="hint">
      Every save is kept. Click a moment to see it in the preview. Use ↑ ↓ to scrub.
    </p>
    <ol id="timeline" ref="timeline" class="timeline" tabindex="0" @keydown="onKeydown">
      <template v-for="item in items" :key="item.key">
        <li v-if="item.day" class="day">{{ item.day }}</li>
        <li
          v-else
          class="step"
          :class="[item.v.kind, { sel: rewind.tv?.id === item.v.id }]"
          @click="rewind.selectVersion(item.v.id)"
        >
          <div class="t">
            {{ rewind.describe(item.v) }}<span v-if="item.first" class="now-tag">now</span>
          </div>
          <div class="m">{{ item.meta }}</div>
        </li>
      </template>
    </ol>
  </div>
</template>
