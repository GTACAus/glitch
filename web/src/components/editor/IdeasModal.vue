<script setup>
// "Suggestions for you": six AI ideas for improving the open file, one per kind.
import { ref, watch } from 'vue';
import { useAiStore } from '@/stores/ai.js';

const ai = useAiStore();
const dialog = ref(null);

const KINDS = {
  resilience: { icon: '🛟', label: 'Resilience' },
  security: { icon: '🔒', label: 'Security' },
  speed: { icon: '⚡', label: 'Faster loading' },
  minimalism: { icon: '✂️', label: 'Minimalism' },
  ux: { icon: '🧭', label: 'UX' },
  gorgeousness: { icon: '✨', label: 'Gorgeousness' },
};

watch(
  () => ai.ideas.open,
  (open) => {
    if (open && !dialog.value.open) dialog.value.showModal();
    if (!open && dialog.value.open) dialog.value.close();
  },
);

// Clicking the dimmed backdrop (outside the box) closes it too.
function onClick(e) {
  if (e.target === dialog.value) dialog.value.close();
}
</script>

<template>
  <dialog
    id="ideasModal"
    ref="dialog"
    class="ideas-modal"
    @click="onClick"
    @close="ai.ideas.open = false"
  >
    <div class="ideas-head">
      <div>
        <h2>✦ Suggestions for you</h2>
        <p id="ideasSub" class="muted" :title="ai.ideas.title">{{ ai.ideas.sub }}</p>
      </div>
      <div class="spacer"></div>
      <button class="btn small" type="button" :disabled="ai.ideas.loading" @click="ai.loadIdeas()">
        ↻ New ideas
      </button>
      <button class="icon-btn" type="button" title="Close" @click="dialog.close()">×</button>
    </div>
    <div id="ideasBody" class="ideas-grid">
      <p v-if="ai.ideas.error" class="ideas-error">{{ ai.ideas.error }}</p>
      <template v-else-if="ai.ideas.loading">
        <div v-for="(k, kind) in KINDS" :key="kind" class="idea loading" :class="kind">
          <div class="idea-kind">{{ k.icon }} {{ k.label }}</div>
          <div class="bar"></div>
          <div class="bar short"></div>
        </div>
      </template>
      <div
        v-for="idea in ai.ideas.loading ? [] : ai.ideas.list"
        :key="idea.kind + idea.title"
        class="idea"
        :class="idea.kind"
      >
        <div class="idea-kind">{{ KINDS[idea.kind]?.icon }} {{ KINDS[idea.kind]?.label }}</div>
        <h3>{{ idea.title }}</h3>
        <p>{{ idea.why }}</p>
        <div class="idea-btns">
          <button
            class="btn small"
            type="button"
            title="Put the instruction in the chat box so you can change it before sending"
            @click="ai.editIdea(idea)"
          >
            Edit first
          </button>
          <button class="btn small primary" type="button" @click="ai.doIdea(idea)">Do it ✦</button>
        </div>
      </div>
    </div>
  </dialog>
</template>
