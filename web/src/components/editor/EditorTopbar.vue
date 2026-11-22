<script setup>
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import BuildInfo from '@/components/BuildInfo.vue';
import { startFullTour } from '@/lib/tour.js';
import { useEditorStore } from '@/stores/editor.js';
import { useRewindStore } from '@/stores/rewind.js';
import { useAiStore } from '@/stores/ai.js';

const emit = defineEmits(['remix']);

const router = useRouter();
const ed = useEditorStore();
const rewind = useRewindStore();
const ai = useAiStore();

const saveLabel = computed(
  () => ({ dirty: '●', saving: 'Saving…', saved: 'Saved ✓', '': '' })[ed.saveStatus],
);

async function rename() {
  if (!ed.canEdit) return;
  const name = await ed.renameProject();
  if (name) router.replace(`/edit/${name}`);
}
</script>

<template>
  <header class="topbar">
    <RouterLink to="/" class="brand-pill" title="All projects"
      ><span>glitch~nhance</span></RouterLink
    >
    <BuildInfo class="hide-sm" :build="ed.me.build" />
    <button
      id="projName"
      class="proj-name"
      :class="{ editable: ed.canEdit }"
      :title="ed.canEdit ? 'Rename project' : null"
      @click="rename"
    >
      {{ ed.name }}
    </button>
    <button id="tourBtn" class="btn small tour-btn" title="Show me around" @click="startFullTour">
      ? Tour
    </button>
    <span v-if="!ed.canEdit" id="owner" class="muted hide-sm">by {{ ed.project.owner_name }}</span>
    <span id="saveStatus" class="save-status" :class="ed.saveStatus">{{ saveLabel }}</span>
    <button v-if="ai.visible" id="ideasBtn" class="ideas-link" @click="ai.openIdeas()">
      ✦ Suggestions for you!
    </button>
    <div class="spacer"></div>
    <button
      id="rewindBtn"
      class="btn"
      :class="{ on: rewind.open }"
      title="See and restore earlier versions"
      @click="rewind.toggle()"
    >
      ⟲ Rewind
    </button>
    <button id="remixBtn" class="btn hide-sm" title="Make your own copy" @click="emit('remix')">
      ⧉ Remix
    </button>
    <a
      id="exportBtn"
      class="btn hide-sm"
      title="Download every file as a .zip"
      :href="`${ed.projUrl}/export`"
    >
      ⤓ Export
    </a>
    <button id="togglePreview" class="btn hide-sm" @click="ed.showPreview = !ed.showPreview">
      {{ ed.showPreview ? 'Hide preview' : 'Show preview' }}
    </button>
    <a id="openPreview" class="btn primary" target="_blank" rel="noopener" :href="ed.previewBase">
      Open ↗
    </a>
  </header>
</template>
