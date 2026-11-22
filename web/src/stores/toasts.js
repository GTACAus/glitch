import { ref } from 'vue';
import { defineStore } from 'pinia';

// Short-lived messages shown at the bottom of the screen. Rendered by ToastHost.vue.
export const useToastStore = defineStore('toasts', () => {
  const items = ref([]);
  let nextId = 0;

  function toast(msg, kind = '') {
    const id = nextId++;
    items.value.push({ id, msg, kind });
    setTimeout(() => {
      items.value = items.value.filter((t) => t.id !== id);
    }, 3000);
  }

  return { items, toast };
});
