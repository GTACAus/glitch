<script setup>
// The right column: the project's live page in an iframe, with its console logs underneath.
// The page talks back through bridge.js (injected by server.py), using postMessage.
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { cleanPath } from '@/lib/files.js';
import { useEditorStore } from '@/stores/editor.js';
import StylePanel from './StylePanel.vue';
import Logs from './Logs.vue';

const ed = useEditorStore();
const frame = ref(null);
const path = ref(ed.framePath);

watch(
  () => ed.framePath,
  (p) => (path.value = p),
);

function onMessage(e) {
  if (e.source !== frame.value?.contentWindow || !e.data?.__glitch) return;
  const d = e.data;
  if (d.type === 'log') ed.addLog(d.level, d.text);
  else if (d.type === 'contextmenu') ed.showCtxMenu(d);
  else if (d.type === 'dismiss') ed.hideCtxMenu();
  else if (d.type === 'styles') ed.fillStylePanel(d.values);
  else if (d.type === 'loaded') ed.onFrameLoaded(d.path);
}

onMounted(() => {
  addEventListener('message', onMessage);
  ed.setFrame(frame.value);
  ed.loadPreview();
});
onUnmounted(() => removeEventListener('message', onMessage));
</script>

<template>
  <section class="preview-col">
    <div class="preview-bar">
      <button id="reloadPreview" class="icon-btn" title="Reload" @click="ed.reloadPreview()">
        ↻
      </button>
      <span id="previewBase" class="base">{{ ed.previewLabel }}</span>
      <input
        id="previewPath"
        v-model="path"
        spellcheck="false"
        placeholder="index.html"
        @keydown.enter="ed.loadPreview(cleanPath(path))"
      />
    </div>
    <div class="frame-wrap">
      <iframe id="frame" ref="frame" title="Preview"></iframe>
      <StylePanel v-if="ed.style" />
    </div>
    <Logs />
  </section>
</template>
