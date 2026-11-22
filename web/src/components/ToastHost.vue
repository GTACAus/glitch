<script setup>
import { useToastStore } from '@/stores/toasts.js';

const toasts = useToastStore();
</script>

<template>
  <Teleport to="body">
    <div v-for="t in toasts.items" :key="t.id" class="toast" :class="t.kind">{{ t.msg }}</div>
  </Teleport>
</template>
