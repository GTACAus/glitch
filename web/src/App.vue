<script setup>
import ToastHost from '@/components/ToastHost.vue';
</script>

<template>
  <!-- Keyed on the path, so /edit/a → /edit/b builds a fresh editor rather than reusing it. -->
  <RouterView v-slot="{ Component, route }">
    <component :is="Component" :key="route.path" />
  </RouterView>
  <ToastHost />
</template>
