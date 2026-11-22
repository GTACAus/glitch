<script setup>
// "/": the projects page when logged in, the public gallery otherwise.
import { onMounted, ref } from 'vue';
import { storeToRefs } from 'pinia';
import { useSessionStore } from '@/stores/session.js';
import GalleryPage from '@/components/home/GalleryPage.vue';
import ProjectsPage from '@/components/home/ProjectsPage.vue';

const session = useSessionStore();
const { me } = storeToRefs(session);
const error = ref('');

onMounted(() => session.load().catch((e) => (error.value = e.message)));
</script>

<template>
  <p v-if="error">{{ error }}</p>
  <template v-else-if="me">
    <ProjectsPage v-if="me.user" :me="me" />
    <GalleryPage v-else :me="me" />
  </template>
</template>
