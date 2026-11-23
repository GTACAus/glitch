<script setup>
// A window that can be moved by dragging its #head slot.
// Attributes like id/class fall through to the root element, so the parent
// positions it as usual; dragging adds an offset on top with a transform.
import { ref, computed } from 'vue';

defineProps({
  // Element to render as the window's root, e.g. 'aside'.
  tag: { type: String, default: 'div' },
});

const offset = ref({ x: 0, y: 0 });
const dragging = ref(false);
let start = null;

const style = computed(() => ({
  transform: `translate(${offset.value.x}px, ${offset.value.y}px)`,
}));

function onPointerDown(e) {
  if (e.button !== 0) return;
  // Let buttons and fields in the head (e.g. the close button) work normally.
  if (e.target.closest('button, input, select, textarea, a')) return;
  start = { px: e.clientX, py: e.clientY, x: offset.value.x, y: offset.value.y };
  dragging.value = true;
  // Capture keeps events coming even when the pointer is over the preview iframe.
  e.currentTarget.setPointerCapture(e.pointerId);
  e.preventDefault();
}

function onPointerMove(e) {
  if (!dragging.value) return;
  offset.value = {
    x: start.x + e.clientX - start.px,
    y: start.y + e.clientY - start.py,
  };
}

function onPointerUp(e) {
  if (!dragging.value) return;
  dragging.value = false;
  e.currentTarget.releasePointerCapture(e.pointerId);
}
</script>

<template>
  <component :is="tag" :style="style">
    <div
      class="head"
      :class="{ dragging }"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <slot name="head" />
    </div>
    <slot />
  </component>
</template>

<style scoped>
.head {
  cursor: grab;
  user-select: none;
  touch-action: none;
}
.head.dragging {
  cursor: grabbing;
}
</style>
