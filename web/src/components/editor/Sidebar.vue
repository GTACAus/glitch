<script setup>
// The left column: the file list (or Rewind's timeline in its place), with Ask AI below.
// Dropping files anywhere on it uploads them.
import { ref } from 'vue';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';
import { useAiStore } from '@/stores/ai.js';
import FilesPane from './FilesPane.vue';
import HistoryPane from './HistoryPane.vue';
import AiPane from './AiPane.vue';

const ed = useEditorStore();
const rewind = useRewindStore();
const ai = useAiStore();

const dragover = ref(false);

function onDragover(e) {
  if (!ed.canEdit || !e.dataTransfer.types.includes('Files')) return;
  e.preventDefault();
  dragover.value = true;
}

function onDrop(e) {
  dragover.value = false;
  if (!ed.canEdit || !e.dataTransfer.files.length) return;
  e.preventDefault();
  ed.upload([...e.dataTransfer.files]);
}
</script>

<template>
  <aside
    id="sidebar"
    class="sidebar"
    :class="{ dragover }"
    @dragover="onDragover"
    @dragleave="dragover = false"
    @drop="onDrop"
  >
    <FilesPane v-show="!rewind.open" />
    <HistoryPane v-show="rewind.open" />
    <AiPane v-if="ai.visible" />
  </aside>
</template>
