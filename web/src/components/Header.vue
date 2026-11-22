<script setup>
import BuildInfo from '@/components/BuildInfo.vue';

defineProps({
  build: { type: Object, default: null },
  projectName: { type: String, default: null },
});
</script>

<template>
  <header class="home-top">
    <RouterLink class="brand-pill" to="/" title="All projects">
      <span>glitch~nhance</span>
    </RouterLink>
    <BuildInfo :build="build" />
    <button v-if="projectName" class="proj-name">{{ projectName }}</button>
    <div class="spacer"></div>
    <!-- Right-hand side: log in, or the user's name and log out. -->
    <slot />
  </header>
</template>

<style scoped></style>
