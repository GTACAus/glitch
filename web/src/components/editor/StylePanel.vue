<script setup>
// Right-click → Choose style: try CSS changes on one element of the preview, live.
// The changes only affect the preview until the AI is asked to make them permanent.
import { computed } from 'vue';
import { useEditorStore } from '@/stores/editor.js';
import { useAiStore } from '@/stores/ai.js';
import { useToastStore } from '@/stores/toasts.js';
import { STYLE_GROUPS } from '@/lib/styleProps.js';
import DragWindow from '../DragWindow.vue';

const ed = useEditorStore();
const ai = useAiStore();
const { toast } = useToastStore();
const st = computed(() => ed.style);

// Each property's field: a list of choices, a colour picker, or free text.
const groups = computed(() =>
  Object.entries(STYLE_GROUPS).map(([group, props]) => ({
    group,
    rows: props.map(([prop, kind]) => {
      const cur = (st.value.values?.[prop] || '').trim();
      const type = Array.isArray(kind) ? 'select' : kind === 'color' ? 'color' : 'text';
      return {
        prop,
        cur,
        type,
        options: type === 'select' ? (kind.includes(cur) ? kind : [cur, ...kind]) : null,
        value: type === 'color' ? toHex(cur) : cur,
      };
    }),
  })),
);

function toHex(v) {
  const m = /^rgba?\(([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)(?:[ ,/]+([\d.]+))?\)$/.exec(v.trim());
  if (!m || (m[4] !== undefined && +m[4] === 0)) return '#ffffff';
  return `#${[m[1], m[2], m[3]].map((n) => Math.round(+n).toString(16).padStart(2, '0')).join('')}`;
}

function askAi() {
  const css = Object.entries(st.value.changes)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join('\n');
  if (!css) return toast('Change a style first');
  if (!ai.visible) return toast('AI is not available here', 'error');
  const { html } = st.value.info;
  const selector = ed.styleSelector;
  ai.setDraft(
    `Make these style changes permanent in the project's CSS for ${st.value.all ? `every <${st.value.info.tag}> element` : 'this element'} (${selector}):\n` +
      `\`\`\`css\n${selector} {\n${css}\n}\n\`\`\`\nElement:\n\`\`\`html\n${html}\n\`\`\`\n`,
  );
  toast('Style changes copied to the AI chat. Press Enter to send.');
}
</script>

<template>
  <DragWindow id="stylePanel" class="style-panel" tag="aside">
    <template #head>
      <div class="pane-head">
        <span>Choose style</span>
        <button id="styleClose" class="icon-btn" title="Close" @click="ed.closeStylePanel()">
          ×
        </button>
      </div>
    </template>
    <div id="styleTarget" class="style-target">
      &lt;{{ st.info.tag }}&gt; {{ ed.styleSelector }}
    </div>
    <label class="style-all">
      <input
        type="checkbox"
        :checked="st.all"
        @change="ed.setStyleAll($event.target.checked)"
      />
      Change all <strong>&lt;{{ st.info.tag }}&gt;</strong> elements
    </label>
    <div id="styleList" :key="st.version" class="style-list">
      <p v-if="!st.values" class="muted">Loading…</p>
      <template v-for="g in st.values ? groups : []" :key="g.group">
        <h4>{{ g.group }}</h4>
        <div v-for="row in g.rows" :key="row.prop" class="style-row">
          <label :title="row.prop">{{ row.prop }}</label>
          <select
            v-if="row.type === 'select'"
            :value="row.value"
            :title="`${row.prop}: ${row.cur}`"
            :class="{ changed: row.prop in st.changes }"
            @input="ed.setStyle(row.prop, $event.target.value)"
          >
            <option v-for="o in row.options" :key="o" :value="o">{{ o }}</option>
          </select>
          <input
            v-else-if="row.type === 'color'"
            type="color"
            :value="row.value"
            :title="`${row.prop}: ${row.cur}`"
            :class="{ changed: row.prop in st.changes }"
            @input="ed.setStyle(row.prop, $event.target.value)"
          />
          <input
            v-else
            type="text"
            spellcheck="false"
            :value="row.value"
            :title="`${row.prop}: ${row.cur}`"
            :class="{ changed: row.prop in st.changes }"
            @change="ed.setStyle(row.prop, $event.target.value)"
          />
        </div>
      </template>
    </div>
    <div class="style-foot">
      <button id="styleSave" class="btn small primary" type="button" @click="ed.saveStyles()">
        Save
      </button>
      <button id="styleReset" class="btn small" type="button" @click="ed.resetStyles()">
        Reset
      </button>
      <button id="styleAsk" class="btn small primary" type="button" @click="askAi">
        Ask AI to keep this ✦
      </button>
    </div>
  </DragWindow>
</template>

<style scoped>
.style-panel {
  position: absolute;
  width: 600px;
  height: 400px;
  flex: none;
  display: flex;
  flex-direction: column;
  border-left: 1px solid var(--line);
  background: var(--panel);
  min-height: 0;
}
.style-panel[hidden] {
  display: none;
}
.style-target {
  padding: 4px 10px;
  font: 11px var(--mono);
  color: var(--muted);
  word-break: break-all;
  border-bottom: 1px solid var(--line);
}

.style-all {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  font-size: 12px;
  border-bottom: 1px solid var(--line);
  cursor: pointer;
}

.style-list {
  flex: 1;
  overflow: auto;
  padding: 4px 10px;
}
.style-list h4 {
  margin: 10px 0 4px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
}
.style-row {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 3px 0;
  font-size: 12px;
}
.style-row label {
  width: 84px;
  flex: none;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.style-row input,
.style-row select {
  flex: 1;
  min-width: 0;
  border: 1px solid var(--line);
  border-radius: 6px;
  padding: 3px 6px;
  font: 12px var(--mono);
  background: var(--bg);
  color: var(--text);
}
.style-row input[type='color'] {
  padding: 0;
  height: 24px;
  flex: none;
  width: 34px;
}
.style-row input.changed,
.style-row select.changed {
  border-color: var(--accent);
}
.style-foot {
  display: flex;
  gap: 6px;
  padding: 8px 10px;
  border-top: 1px solid var(--line);
}
</style>
