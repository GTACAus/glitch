<script setup>
import { onMounted, ref } from 'vue';
import { api } from '@/lib/api.js';

const key = ref('');
const input = ref(null);
const error = ref(
  new URLSearchParams(location.search).has('badkey') ? "That login link didn't work." : '',
);

async function logIn() {
  try {
    await api('POST', '/api/login', { key: key.value.trim() });
    location.href = '/';
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(() => input.value.focus());
</script>

<template>
  <div class="login">
    <span class="brand-pill lg"><span>glitch~nhance</span></span>
    <h2>Welcome back</h2>
    <p class="muted">Use the login link or key you were given.</p>
    <input
      ref="input"
      v-model="key"
      placeholder="Paste your key"
      autocomplete="off"
      @keydown.enter="logIn"
    />
    <div class="err">{{ error }}</div>
    <button class="btn primary block" @click="logIn">Log in</button>
  </div>
</template>
