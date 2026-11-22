import { ref } from 'vue';
import { defineStore } from 'pinia';
import { api } from '@/lib/api.js';

// Who is logged in, plus the site info /api/me returns with it (build, templates, preview host).
export const useSessionStore = defineStore('session', () => {
  const me = ref(null);

  async function load() {
    me.value = await api('GET', '/api/me');
    return me.value;
  }

  async function logout() {
    await api('POST', '/api/logout');
    location.href = '/';
  }

  return { me, load, logout };
});
