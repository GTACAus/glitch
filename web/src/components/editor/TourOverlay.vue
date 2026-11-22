<script setup>
// Draws the tour from lib/tour.js: a shade, a highlight around the step's target, and a card.
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { endTour, present, stepTour, tour } from '@/lib/tour.js';

const card = ref(null);
const next = ref(null);
const spot = ref(null); // highlight box, or null when the step has nothing to point at
const cardPos = ref({});

const step = computed(() => tour.steps?.[tour.i]);
const count = computed(() => tour.steps?.length || 0);
const last = computed(() => tour.i === count.value - 1);

// Something can be present but empty, like the save status before any typing; then the card goes
// in the middle.
function visible(sel) {
  const n = present(sel);
  const r = n?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? n : null;
}

function place() {
  if (!step.value || !card.value) return;
  const target = visible(step.value.target);
  const vw = innerWidth;
  const vh = innerHeight;
  const maxWidth = `${Math.min(360, vw - 32)}px`;
  const cw = card.value.offsetWidth;
  const ch = card.value.offsetHeight;
  if (!target) {
    spot.value = null;
    cardPos.value = {
      maxWidth,
      left: `${Math.max(16, (vw - cw) / 2)}px`,
      top: `${Math.max(16, (vh - ch) / 2)}px`,
    };
    return;
  }
  const pad = 6;
  const r = target.getBoundingClientRect();
  const box = {
    left: Math.max(4, r.left - pad),
    top: Math.max(4, r.top - pad),
    right: Math.min(vw - 4, r.right + pad),
    bottom: Math.min(vh - 4, r.bottom + pad),
  };
  spot.value = {
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.right - box.left}px`,
    height: `${box.bottom - box.top}px`,
  };
  // Put the card on whichever side of the highlight has room: below, above, right, left, or inside.
  const gap = 12;
  const clampX = (x) => Math.min(Math.max(16, x), vw - cw - 16);
  const clampY = (y) => Math.min(Math.max(16, y), vh - ch - 16);
  let left;
  let top;
  if (vh - box.bottom >= ch + gap + 16) [top, left] = [box.bottom + gap, clampX(box.left)];
  else if (box.top >= ch + gap + 16) [top, left] = [box.top - ch - gap, clampX(box.left)];
  else if (vw - box.right >= cw + gap + 16) [left, top] = [box.right + gap, clampY(box.top)];
  else if (box.left >= cw + gap + 16) [left, top] = [box.left - cw - gap, clampY(box.top)];
  else [left, top] = [clampX(box.left + 16), clampY(box.top + 16)];
  cardPos.value = { maxWidth, left: `${left}px`, top: `${top}px` };
}

function onKey(e) {
  if (e.key === 'Escape') endTour();
  else if (e.key === 'ArrowRight') stepTour(1);
  else if (e.key === 'ArrowLeft') stepTour(-1);
  else return;
  e.preventDefault();
  e.stopPropagation();
}

// Listen only while the tour is showing.
watch(
  () => !!tour.steps,
  (on) => {
    if (on) {
      addEventListener('keydown', onKey, true);
      addEventListener('resize', place);
    } else {
      removeEventListener('keydown', onKey, true);
      removeEventListener('resize', place);
    }
  },
);

// Measure after each step renders, since the card's size depends on its text.
watch(step, async () => {
  if (!step.value) return;
  await nextTick();
  place();
  next.value?.focus();
});

onUnmounted(() => {
  endTour();
  removeEventListener('keydown', onKey, true);
  removeEventListener('resize', place);
});
</script>

<template>
  <Teleport to="body">
    <template v-if="step">
      <div class="tour-shade" :class="{ dim: !spot }" @click="endTour"></div>
      <div v-if="spot" class="tour-spot" :style="spot"></div>
      <div ref="card" class="tour-card" role="dialog" aria-live="polite" :style="cardPos">
        <h3>{{ step.title }}</h3>
        <div v-if="step.diffSample" class="tour-diff">
          <div class="col">
            <b>Before</b>
            <code>&lt;h1&gt;Hello&lt;/h1&gt;</code>
            <code class="del">&lt;p&gt;Old text&lt;/p&gt;</code>
          </div>
          <div class="col">
            <b>After</b>
            <code>&lt;h1&gt;Hello&lt;/h1&gt;</code>
            <code class="add">&lt;p&gt;New text&lt;/p&gt;</code>
            <code class="add">&lt;button&gt;Go&lt;/button&gt;</code>
          </div>
        </div>
        <p>{{ step.text }}</p>
        <div class="tour-btns">
          <span v-if="count > 1" class="muted">{{ tour.i + 1 }} of {{ count }}</span>
          <div class="spacer"></div>
          <button v-if="count > 1 && !last" class="btn small" type="button" @click="endTour">
            Skip
          </button>
          <button v-if="tour.i > 0" class="btn small" type="button" @click="stepTour(-1)">
            Back
          </button>
          <button ref="next" class="btn small primary" type="button" @click="stepTour(1)">
            {{ last ? (count > 1 ? 'Done' : 'Got it') : 'Next' }}
          </button>
        </div>
      </div>
    </template>
  </Teleport>
</template>
