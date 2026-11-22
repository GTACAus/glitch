<script setup>
// One project tile: a live thumbnail of its page, its name, and a subtitle.
// The card's link and any action buttons come from the parent.
//   to: an app route (like /edit/<name>), opened without reloading the page.
//   href: anywhere else (like the live page), opened in a new tab.
defineProps({
  name: { type: String, required: true },
  to: { type: String, default: null },
  href: { type: String, default: null },
  preview: { type: String, required: true },
  subtitle: { type: String, default: '' },
});
</script>

<template>
  <component
    :is="to ? 'RouterLink' : 'a'"
    class="card"
    v-bind="to ? { to } : { href, target: '_blank', rel: 'noopener' }"
  >
    <div class="thumb">
      <iframe :src="preview" loading="lazy" tabindex="-1" :title="name"></iframe>
    </div>
    <div class="card-body">
      <div class="meta">
        <div class="card-name">{{ name }}</div>
        <div class="card-sub">{{ subtitle }}</div>
      </div>
      <slot name="actions" />
    </div>
  </component>
</template>
