<script setup>
// Text you edit right where it sits on the page (contenteditable), kept in sync with a v-model.
// The DOM is only rewritten when the value changed from outside, so the caret never jumps.
import { onMounted, ref, watch } from 'vue';

const props = defineProps({
  modelValue: { type: String, default: '' },
  tag: { type: String, default: 'span' },
  editable: { type: Boolean, default: true },
  multiline: { type: Boolean, default: false },
});
const emit = defineEmits(['update:modelValue', 'focus']);

const el = ref(null);

function sync() {
  if (el.value && el.value.innerText !== props.modelValue) el.value.innerText = props.modelValue;
}
onMounted(sync);
watch(() => props.modelValue, sync);

function onInput(e) {
  emit('update:modelValue', e.target.innerText.replace(/\n$/, ''));
}

function onKeydown(e) {
  if (e.key === 'Enter' && !props.multiline) {
    e.preventDefault();
    e.target.blur();
  }
}

// Paste as plain text, so styling from other pages doesn't come along.
function onPaste(e) {
  e.preventDefault();
  let text = e.clipboardData.getData('text/plain');
  if (!props.multiline) text = text.replace(/\s*\n\s*/g, ' ');
  document.execCommand('insertText', false, text);
}
</script>

<template>
  <component
    :is="tag"
    ref="el"
    class="editable"
    :contenteditable="editable ? 'plaintext-only' : null"
    spellcheck="false"
    @input="onInput"
    @keydown="onKeydown"
    @paste="onPaste"
    @focus="emit('focus')"
  ></component>
</template>

<style scoped>
.editable {
  outline: none;
  white-space: pre-wrap;
  cursor: text;
}
.editable:empty::before {
  content: '…';
  opacity: 0.4;
}
</style>
