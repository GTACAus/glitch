<script setup>
import { nextTick, onMounted, ref, watch } from 'vue';
import { useAiStore } from '@/stores/ai.js';

const ai = useAiStore();
const log = ref(null);
const input = ref(null);

function onKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    ai.ask();
  }
}

const scrollToEnd = () =>
  nextTick(() => {
    if (log.value) log.value.scrollTop = log.value.scrollHeight;
  });

watch(() => [ai.chat.length, ai.busy], scrollToEnd);
onMounted(scrollToEnd);

// Something put text in the chat box (right-click → Ask AI, an idea's "Edit first"): focus it,
// with the cursor at the end.
watch(
  () => ai.focusTick,
  () =>
    nextTick(() => {
      const el = input.value;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }),
);
</script>

<template>
  <div id="aiPane" class="ai-pane">
    <div class="pane-head">
      <span>✦ Ask AI</span>
      <button id="aiClear" class="icon-btn" title="Start a new chat" @click="ai.clearChat()">
        ⟲
      </button>
    </div>
    <div id="aiLog" ref="log" class="ai-log">
      <p v-if="!ai.chat.length && !ai.busy" class="hint">
        Ask for a change, e.g. “add a dark mode toggle”. You'll see a diff before anything changes.
      </p>
      <div v-for="(m, i) in ai.chat" :key="m.id || i" class="ai-msg" :class="m.role">
        <span v-text="m.text"></span>
        <div v-if="m.role === 'model' && m.files?.length" class="ai-card">
          <div class="files">Changes: {{ m.files.join(', ') }}</div>
          <span v-if="m.applied" class="done">Applied ✓</span>
          <span v-else-if="m.discarded" class="muted">Discarded</span>
          <button
            v-else-if="m.changes"
            class="btn small primary"
            type="button"
            @click="ai.openReview(m)"
          >
            Review changes
          </button>
          <span v-else class="muted">Expired (suggestions are kept for 7 days)</span>
        </div>
        <div v-if="m.role === 'model' && m.model" class="ai-model">{{ m.model }}</div>
      </div>
      <div v-if="ai.busy" class="ai-msg thinking" role="status">
        <span class="spark">✦</span><span class="shimmer">Thinking</span
        ><span class="dots"><i></i><i></i><i></i></span>
      </div>
    </div>
    <form id="aiForm" class="ai-form" @submit.prevent="ai.ask()">
      <textarea
        id="aiInput"
        ref="input"
        v-model="ai.draft"
        rows="3"
        placeholder="Describe a change… (Enter sends, Shift+Enter for a new line)"
        @keydown="onKeydown"
      ></textarea>
      <button id="aiSend" class="btn small primary" type="submit" :disabled="ai.busy">Send</button>
    </form>
  </div>
</template>
