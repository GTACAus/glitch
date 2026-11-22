<script setup>
// The menu that appears when someone right-clicks an element in the preview.
import { nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { STYLE_PROPS } from '@/lib/styleProps.js';
import { useEditorStore } from '@/stores/editor.js';
import { useAiStore } from '@/stores/ai.js';
import { useToastStore } from '@/stores/toasts.js';

const ed = useEditorStore();
const ai = useAiStore();
const { toast } = useToastStore();
const menu = ref(null);
const pos = ref({ left: '0px', top: '0px' });

// The click position comes from inside the iframe; place the menu there, kept on screen.
watch(
  () => ed.ctxMenu,
  async (ctx) => {
    if (!ctx) return;
    await nextTick();
    const r = ed.frameRect();
    const m = menu.value;
    if (!r || !m) return;
    const x = Math.min(r.left + ctx.info.x, innerWidth - m.offsetWidth - 4);
    const y = Math.min(r.top + ctx.info.y, innerHeight - m.offsetHeight - 4);
    pos.value = { left: `${Math.max(x, 4)}px`, top: `${Math.max(y, 4)}px` };
    m.querySelector('button:not(:disabled)')?.focus();
  },
);

function chooseStyle() {
  const info = ed.ctxMenu.info;
  ed.hideCtxMenu();
  ed.openStylePanel(info, STYLE_PROPS);
}

function askAi() {
  const { selector, html } = ed.ctxMenu.info;
  ed.hideCtxMenu();
  ai.setDraft(`About this element (${selector}):\n\`\`\`html\n${html}\n\`\`\`\n\n`);
  toast('Element copied to the AI chat. Say what you want changed.');
}

// Any click outside closes it.
function onPointerdown(e) {
  if (ed.ctxMenu && !menu.value?.contains(e.target)) ed.hideCtxMenu();
}
onMounted(() => document.addEventListener('pointerdown', onPointerdown, true));
onUnmounted(() => document.removeEventListener('pointerdown', onPointerdown, true));
</script>

<template>
  <Teleport to="body">
    <div v-if="ed.ctxMenu" ref="menu" class="ctx-menu" role="menu" :style="pos">
      <button type="button" @click="chooseStyle">🎨 Choose style</button>
      <button
        type="button"
        :disabled="!ai.visible"
        :title="ai.visible ? '' : 'AI is not available here'"
        @click="askAi"
      >
        ✦ Ask AI
      </button>
    </div>
  </Teleport>
</template>
