<script setup>
// What the preview printed with console.log, and its errors.
import { nextTick, ref, watch } from 'vue';
import { useEditorStore } from '@/stores/editor.js';

const ed = useEditorStore();
const open = ref(false);
const list = ref(null);

// Follow new lines, unless the person has scrolled up to read older ones.
watch(
  () => ed.logs.length,
  () => {
    const el = list.value;
    if (!el) return;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 4;
    if (atBottom) nextTick(() => (el.scrollTop = el.scrollHeight));
  },
  { flush: 'pre' },
);
</script>

<template>
  <div id="logs" class="logs" :class="{ open }">
    <div class="logs-head">
      <button id="logsToggle" class="btn small" @click="open = !open">
        {{ open ? '▾' : '▸' }} Logs<span v-if="ed.errors" id="errCount" class="badge">{{
          ed.errors
        }}</span>
      </button>
      <div class="spacer"></div>
      <button id="clearLogs" class="btn small" @click="ed.clearLogs()">Clear</button>
    </div>
    <div id="logList" ref="list" class="log-list">
      <div v-for="l in ed.logs" :key="l.id" class="log" :class="l.level">{{ l.text }}</div>
    </div>
  </div>
</template>
