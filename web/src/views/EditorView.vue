<script setup>
// /edit/<name>: the code editor, file list, live preview, Rewind and Ask AI.
// App.vue keys the page on the URL, so going to another project builds a fresh one.
import { onMounted, onUnmounted, ref } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import { getItem, setItem } from '@/lib/storage.js';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';
import { useAiStore } from '@/stores/ai.js';
import { useToastStore } from '@/stores/toasts.js';
import EditorTopbar from '@/components/editor/EditorTopbar.vue';
import Preview from '@/components/editor/Preview.vue';
import Sidebar from '@/components/editor/Sidebar.vue';
import Editor from '@/components/editor/Editor.vue';
import ContextMenu from '@/components/editor/ContextMenu.vue';
import IdeasModal from '@/components/editor/IdeasModal.vue';
import TourOverlay from '@/components/editor/TourOverlay.vue';

const route = useRoute();
const router = useRouter();
const ed = useEditorStore();
const rewind = useRewindStore();
const ai = useAiStore();
const { toast } = useToastStore();

async function remix() {
  const name = await ed.remix();
  if (name) router.push(`/edit/${name}`);
}

// ---------------------------------------------------------------- splitter between editor and preview

const workspace = ref(null);
const previewW = ref(getItem('glitch.previewW') || '');
const dragging = ref(false);

function startDrag(e) {
  e.preventDefault();
  const split = e.currentTarget;
  split.setPointerCapture(e.pointerId);
  dragging.value = true;
  const move = (ev) => {
    const rect = workspace.value.getBoundingClientRect();
    const px = Math.min(Math.max(rect.right - ev.clientX, 240), rect.width - 480);
    previewW.value = `${px}px`;
  };
  split.addEventListener('pointermove', move);
  split.addEventListener(
    'pointerup',
    () => {
      split.removeEventListener('pointermove', move);
      dragging.value = false;
      setItem('glitch.previewW', previewW.value);
    },
    { once: true },
  );
}

// ---------------------------------------------------------------- page-wide events

function onBeforeUnload(e) {
  if (ed.hasUnsaved()) {
    e.preventDefault();
    e.returnValue = '';
  }
}

function onKeydown(e) {
  if (e.key !== 'Escape') return;
  ed.hideCtxMenu();
  if (rewind.tv) rewind.exit();
}

const onBlur = () => ed.hideCtxMenu();
const onAiTools = (e) => ai.setTools(e.detail);

// Finish saving before leaving for another page in the app.
onBeforeRouteLeave(() => ed.flushAll());
onBeforeRouteUpdate(() => ed.flushAll());

onMounted(async () => {
  addEventListener('beforeunload', onBeforeUnload);
  addEventListener('keydown', onKeydown);
  addEventListener('blur', onBlur);
  addEventListener('aitools', onAiTools);
  rewind.reset();
  ai.reset();
  try {
    const result = await ed.open(route.params.name);
    if (result === 'login') router.replace('/');
    else if (result === 'ready') await ai.init();
  } catch (e) {
    toast(e.message, 'error');
  }
});

onUnmounted(() => {
  removeEventListener('beforeunload', onBeforeUnload);
  removeEventListener('keydown', onKeydown);
  removeEventListener('blur', onBlur);
  removeEventListener('aitools', onAiTools);
  ed.reset();
  rewind.reset();
  ai.reset();
});
</script>

<template>
  <div
    class="editor-page"
    :class="{ 'no-preview': !ed.showPreview, 'has-ai': ai.visible, dragging }"
  >
    <div v-if="ed.status === 'notfound'" class="login">
      <h2>Project not found</h2>
      <RouterLink to="/">Back to projects</RouterLink>
    </div>

    <template v-else-if="ed.status === 'ready'">
      <EditorTopbar @remix="remix" />
      <div v-if="!ed.canEdit" id="readonly" class="readonly-banner">
        <span>
          This is <b>{{ ed.project.owner_name }}</b
          >'s project, so you can look but not change it.
        </span>
        <button class="btn small primary" @click="remix">Remix to edit your own copy</button>
      </div>

      <main
        id="workspace"
        ref="workspace"
        class="workspace"
        :style="previewW ? { '--preview-w': previewW } : null"
      >
        <Sidebar />
        <Editor />
        <div
          id="splitter"
          class="splitter"
          :class="{ drag: dragging }"
          @pointerdown="startDrag"
        ></div>
        <Preview />
      </main>

      <IdeasModal v-if="ai.available" />
      <ContextMenu />
      <TourOverlay />
    </template>
  </div>
</template>

<style scoped>
/* html and body are full height, but #app isn't, so the page sizes itself to the window. */
.editor-page {
  height: 100dvh;
}
</style>
