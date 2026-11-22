<script setup>
// What visitors who aren't logged in see: every project, each opening its live page in a new tab.
import { onMounted, ref } from 'vue';
import { api, ago, previewUrl } from '@/lib/api.js';
import HomeHeader from '../Header.vue';
import LoginForm from './LoginForm.vue';
import ProjectCard from './ProjectCard.vue';

const props = defineProps({ me: { type: Object, required: true } });

const projects = ref(null);
const dialog = ref(null);
const showLogin = ref(false);

function openLogin() {
  showLogin.value = true;
  dialog.value.showModal();
}

// Clicking the backdrop (the dialog element itself, not its contents) closes it.
function onDialogClick(e) {
  if (e.target === dialog.value) dialog.value.close();
}

onMounted(async () => {
  document.title = 'glitch~nhance';
  if (new URLSearchParams(location.search).has('badkey')) openLogin();
  projects.value = await api('GET', '/api/gallery');
});
</script>

<template>
  <HomeHeader :build="me.build">
    <button class="btn small primary" @click="openLogin">Log in</button>
  </HomeHeader>
  <main class="home">
    <h1 class="gallery-title">Things people have made</h1>
    <p class="muted gallery-sub">Click any project to open it. Log in to make your own.</p>
    <template v-if="projects">
      <div v-if="projects.length" class="grid">
        <ProjectCard
          v-for="p in projects"
          :key="p.name"
          :name="p.name"
          :href="previewUrl(props.me, p.name)"
          :preview="previewUrl(props.me, p.name)"
          :subtitle="`updated ${ago(p.updated)}`"
        >
          <template #actions><span class="muted">↗</span></template>
        </ProjectCard>
      </div>
      <p v-else class="empty">Nothing here yet.</p>
    </template>
  </main>
  <dialog ref="dialog" class="login-dialog" @click="onDialogClick" @close="showLogin = false">
    <!-- Mounted fresh each time it opens, so the key box starts empty and focused. -->
    <LoginForm v-if="showLogin" />
  </dialog>
</template>
