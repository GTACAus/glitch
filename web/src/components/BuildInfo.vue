<script setup>
// "build c2122c4 · deployed today 11:05 pm", with the commit message on hover.
// Triple-clicking it switches the AI tools on or off (see aiTools.js).
import { computed, ref } from 'vue';
import { aiToolsOn, setAiTools } from '@/lib/aiTools.js';

const props = defineProps({ build: { type: Object, default: null } });

const flash = ref('');

const label = computed(() => {
  const b = props.build;
  const d = new Date(b.deployed * 1000);
  const today = d.toDateString() === new Date().toDateString();
  const day = today
    ? 'today'
    : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
  return `build ${b.commit} · deployed ${day} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
});

const tooltip = computed(() => {
  const b = props.build;
  return (
    `${b.message}\nCommitted ${new Date(b.committed * 1000).toLocaleString()}` +
    `\nDeployed ${new Date(b.deployed * 1000).toLocaleString()}` +
    (b.commit.endsWith('+local') ? '\n+local: includes changes that were not committed yet' : '')
  );
});

function onClick(e) {
  if (e.detail !== 3) return;
  const on = !aiToolsOn();
  setAiTools(on);
  flash.value = on ? '✦ AI tools on' : 'AI tools off';
  setTimeout(() => (flash.value = ''), 1400);
}
</script>

<template>
  <span v-if="build" class="build-info" :class="{ flash }" :title="tooltip" @click="onClick">
    {{ flash || label }}
  </span>
</template>
