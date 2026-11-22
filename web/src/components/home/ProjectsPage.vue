<script setup>
// What logged-in users see: a new-project card, their own projects, and everyone else's.
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api, ago, previewUrl } from '@/lib/api.js';
import { useSessionStore } from '@/stores/session.js';
import { useToastStore } from '@/stores/toasts.js';
import HomeHeader from '../Header.vue';
import ProjectCard from './ProjectCard.vue';

const props = defineProps({ me: { type: Object, required: true } });

const router = useRouter();
const session = useSessionStore();
const { toast } = useToastStore();

const projects = ref([]);
const mine = computed(() => projects.value.filter((p) => p.mine));
const others = computed(() => projects.value.filter((p) => !p.mine));

async function load() {
  projects.value = await api('GET', '/api/projects');
}

const editUrl = (name) => `/edit/${name}`;

async function create(template) {
  try {
    const { name } = await api('POST', '/api/projects', { template: template.id });
    router.push(editUrl(name));
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function remix(p) {
  try {
    const { name } = await api('POST', `/api/projects/${p.name}/remix`);
    router.push(editUrl(name));
  } catch (e) {
    toast(e.message, 'error');
  }
}

function exportZip(p) {
  location.href = `/api/projects/${p.name}/export`; // a download, so the page stays put
}

async function remove(p) {
  if (!confirm(`Delete ${p.name}? This removes it and its rewind history.`)) return;
  try {
    await api('DELETE', `/api/projects/${p.name}`);
    await load();
  } catch (e) {
    toast(e.message, 'error');
  }
}

onMounted(() => {
  document.title = 'Projects · glitch~nhance';
  load().catch((e) => toast(e.message, 'error'));
});
</script>

<template>
  <HomeHeader :build="me.build">
    <span class="muted">Hi, {{ me.user.name }}</span>
    <button class="btn small" @click="session.logout">Log out</button>
  </HomeHeader>
  <main class="home">
    <h2>Your projects</h2>
    <div class="grid">
      <div class="new-card">
        <h3>✦ New project</h3>
        <button v-for="t in me.templates" :key="t.id" class="tpl" @click="create(t)">
          <b>{{ t.title }}</b
          ><span>{{ t.description }}</span>
        </button>
      </div>
      <ProjectCard
        v-for="p in mine"
        :key="p.name"
        :name="p.name"
        :to="editUrl(p.name)"
        :preview="previewUrl(props.me, p.name)"
        :subtitle="`you · ${ago(p.updated)}`"
      >
        <template #actions>
          <div>
            <button class="icon-btn" title="Remix (make a copy)" @click.prevent="remix(p)">
              ⧉
            </button>
            <button
              class="icon-btn"
              title="Export (download as .zip)"
              @click.prevent="exportZip(p)"
            >
              ⤓
            </button>
            <button class="icon-btn" title="Delete" @click.prevent="remove(p)">🗑</button>
          </div>
        </template>
      </ProjectCard>
    </div>

    <h2>Friends' projects</h2>
    <div v-if="others.length" class="grid">
      <ProjectCard
        v-for="p in others"
        :key="p.name"
        :name="p.name"
        :to="editUrl(p.name)"
        :preview="previewUrl(props.me, p.name)"
        :subtitle="`${p.owner_name} · ${ago(p.updated)}`"
      >
        <template #actions>
          <div>
            <button class="icon-btn" title="Remix (make a copy)" @click.prevent="remix(p)">
              ⧉
            </button>
            <button
              class="icon-btn"
              title="Export (download as .zip)"
              @click.prevent="exportZip(p)"
            >
              ⤓
            </button>
          </div>
        </template>
      </ProjectCard>
    </div>
    <p v-else class="empty">Nothing here yet.</p>
  </main>
</template>
