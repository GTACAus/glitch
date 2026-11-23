import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '@/views/HomeView.vue';

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    // Loaded on first visit, so the home page doesn't download Monaco.
    { path: '/edit/:name', name: 'editor', component: () => import('@/views/EditorView.vue') },
    { path: '/build/:name', name: 'builder', component: () => import('@/views/PageBuilderView.vue') },
  ],
});

export default router;
