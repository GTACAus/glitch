<script setup>
// The middle column: the code editor, or a diff (Rewind / AI suggestion), or a media file.
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { prettierParser } from '@/lib/prettier.js';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';
import { useAiStore } from '@/stores/ai.js';
import RewindBanner from './RewindBanner.vue';
import AiReviewBanner from './AiReviewBanner.vue';

const ed = useEditorStore();
const rewind = useRewindStore();
const ai = useAiStore();

const editorEl = ref(null);
const diffEl = ref(null);

const barText = computed(() => {
  if (ai.review) return `${ai.review.file} · AI suggestion (not applied yet)`;
  if (rewind.tv) return `${rewind.tv.file || ''} · rewind view (read only)`;
  return ed.current || '';
});

const showPrettier = computed(
  () => !rewind.tv && !ai.review && ed.current && ed.canEdit && prettierParser(ed.current),
);

onMounted(() => ed.mountEditor(editorEl.value, diffEl.value));
onUnmounted(() => ed.unmountEditor());
</script>

<template>
  <section class="editor-col">
    <RewindBanner v-if="rewind.tv" />
    <AiReviewBanner v-if="ai.review" />
    <div id="fileBar" class="file-bar">
      <span>{{ barText }}</span>
      <template v-if="showPrettier">
        <div class="spacer"></div>
        <button
          class="btn small prettier-btn"
          title="Tidy this file with Prettier (Shift+Alt+F)"
          @click="ed.formatCurrent()"
        >
          ✨ Prettier
        </button>
      </template>
    </div>
    <div v-show="ed.pane === 'diff'" id="diffLabels" class="diff-labels">
      <span id="diffLeft">
        {{ ed.diffLabels.left }}
        <span class="key del" title="Lines highlighted red are removed">red = taken out</span>
      </span>
      <span id="diffRight">
        {{ ed.diffLabels.right }}
        <span class="key add" title="Lines highlighted green are added">green = put in</span>
      </span>
    </div>
    <div v-show="ed.pane === 'editor'" id="editor" ref="editorEl" class="editor"></div>
    <div v-show="ed.pane === 'diff'" id="diff" ref="diffEl" class="editor"></div>
    <div v-show="ed.pane === 'binary'" id="binaryView" class="binary-view">
      <template v-if="ed.binary?.message">{{ ed.binary.message }}</template>
      <template v-else-if="ed.binary">
        <img v-if="ed.binary.kind === 'image'" :src="ed.binary.src" :alt="ed.binary.path" />
        <video v-else-if="ed.binary.kind === 'video'" :src="ed.binary.src" controls></video>
        <audio v-else-if="ed.binary.kind === 'audio'" :src="ed.binary.src" controls></audio>
        <div v-else>
          <p>{{ ed.binary.path }} is a binary file.</p>
          <a :href="ed.binary.src" :download="ed.binary.path.split('/').pop()">Download it</a>
        </div>
      </template>
    </div>
  </section>
</template>
