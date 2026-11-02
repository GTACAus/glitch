'use strict';
/* global GTAC_BLOCKS */
// The "Add block" panel for lesson pages: add, edit (by form), reorder and delete blocks.
// A block lives in index.html between <!-- gtac:block TYPE --> and <!-- /gtac:block -->, so the code
// always shows exactly what the panel has done. Block definitions are in /_glitch/lib/blocks/blocks.js.

const BLOCKS_END = '<!-- gtac:blocks-end -->';
const BLOCK_RE = /^([ \t]*)<!-- gtac:block ([\w-]+) -->\n?([\s\S]*?)<!-- \/gtac:block -->/gm;
const B = { watched: new WeakSet(), timer: null, editing: null };

const blockDefs = () => window.GTAC_BLOCKS || {};

function findBlocks(text) {
  const found = [];
  BLOCK_RE.lastIndex = 0;
  let m;
  while ((m = BLOCK_RE.exec(text))) {
    found.push({ indent: m[1], type: m[2], start: m.index, end: m.index + m[0].length, html: m[3] });
  }
  return found;
}

function wrapBlock(type, html, indent) {
  const pad = html.split('\n').map((l) => (l ? indent + l : l)).join('\n');
  return `${indent}<!-- gtac:block ${type} -->\n${pad}\n${indent}<!-- /gtac:block -->`;
}

function readBlock(block) {
  const def = blockDefs()[block.type];
  if (!def) return null;
  const root = new DOMParser().parseFromString(`<body>${block.html}</body>`, 'text/html').body;
  return def.read(root);
}

async function setupBlocks() {
  try {
    if (!S.project.can_edit || !S.files.some((f) => f.path === 'index.html') || !blockDefs().intro) return;
    const text = await fetchText(fileUrl('index.html'));
    if (!text.includes(BLOCKS_END)) return;
    $('#blocksBtn').hidden = false;
    $('#blocksBtn').onclick = () => toggleBlocks();
    $('#closeBlocks').onclick = () => toggleBlocks(false);
    $('#bmClose').onclick = () => $('#blockModal').close();
    $('#bmCancel').onclick = () => $('#blockModal').close();
    $('#bmSave').onclick = saveBlockForm;
    renderPalette();
    // The toolbar on each block in the preview asks us to edit, move or delete it.
    addEventListener('message', (e) => {
      const m = e.data;
      if (e.source !== $('#frame').contentWindow || S.tv || !m) return;
      if (m.type === 'gtac-edit-block') editBlock(m.index);
      else if (m.type === 'gtac-move-block') moveBlockTo(m.from, m.to);
      else if (m.type === 'gtac-delete-block') deleteBlock(m.index);
    });
  } catch (e) {
    console.warn('Blocks panel not available:', e);
  }
}

async function toggleBlocks(open = $('#blocksPane').hidden) {
  if (open && !$('#historyPane').hidden) await toggleHistory(false);
  $('#blocksPane').hidden = !open;
  $('#filesPane').hidden = open;
  $('#blocksBtn').classList.toggle('on', open);
  if (open) {
    await blocksModel();
    renderBlockList();
  }
}

async function blocksModel() {
  if (!S.models.has('index.html')) await openFile('index.html');
  const model = S.models.get('index.html');
  if (model && !B.watched.has(model)) {
    B.watched.add(model);
    model.onDidChangeContent(() => {
      clearTimeout(B.timer);
      B.timer = setTimeout(() => { if (!$('#blocksPane').hidden) renderBlockList(); }, 200);
    });
  }
  return model;
}

// Replace the whole of index.html as one edit, so Ctrl+Z undoes it and autosave picks it up.
async function setIndexText(next) {
  if (S.current !== 'index.html') await openFile('index.html');
  const model = await blocksModel();
  model.pushEditOperations([], [{ range: model.getFullModelRange(), text: next }], () => null);
}

// ------------------------------------------------------------------ panel

function renderPalette() {
  $('#blockPalette').replaceChildren(...Object.entries(blockDefs()).map(([type, def]) => {
    const b = el('button', { className: 'block-card', type: 'button' },
      el('b', { textContent: def.title }), el('span', { textContent: def.description }));
    b.onclick = () => addBlock(type);
    return b;
  }));
}

function renderBlockList() {
  const model = S.models.get('index.html');
  const list = $('#blockList');
  if (!model) return list.replaceChildren();
  const blocks = findBlocks(model.getValue());
  if (!blocks.length) {
    list.replaceChildren(el('li', { className: 'hint', textContent: 'No blocks yet. Add one above.' }));
    return;
  }
  list.replaceChildren(...blocks.map((block, i) => {
    const def = blockDefs()[block.type];
    let sub = '';
    try { const v = readBlock(block); sub = v && (v.title || v.heading || ''); } catch { /* shown without a subtitle */ }
    const btn = (label, title, fn, disabled) => {
      const b = el('button', { className: 'icon-btn', type: 'button', textContent: label, title, disabled: !!disabled });
      b.onclick = (e) => { e.stopPropagation(); fn(); };
      return b;
    };
    const row = el('li', { className: 'block-row' },
      el('div', { className: 'block-row-text' },
        el('b', { textContent: def ? def.title : block.type }), el('span', { textContent: sub })),
      btn('↑', 'Move up', () => moveBlock(i, -1), i === 0),
      btn('↓', 'Move down', () => moveBlock(i, 1), i === blocks.length - 1),
      btn('✎', 'Edit', () => editBlock(i)),
      btn('✕', 'Delete', () => deleteBlock(i)));
    row.onclick = () => editBlock(i);
    return row;
  }));
}

// ------------------------------------------------------------------ actions

async function addBlock(type) {
  const def = blockDefs()[type];
  const model = await blocksModel();
  const text = model.getValue();
  const at = text.indexOf(BLOCKS_END);
  if (at < 0) return toast('This page has no place for blocks', 'error');
  const lineStart = text.lastIndexOf('\n', at) + 1;
  const indent = /^[ \t]*$/.test(text.slice(lineStart, at)) ? text.slice(lineStart, at) : '';
  const block = wrapBlock(type, def.render(def.defaults()), indent);
  await setIndexText(`${text.slice(0, lineStart)}${block}\n\n${text.slice(lineStart)}`);
  const index = findBlocks(S.models.get('index.html').getValue()).length - 1;
  toast(`${def.title} added ✓`);
  editBlock(index);
}

const moveBlock = (i, by) => moveBlockTo(i, i + by);

// Take block `from` out and put it at position `to`, keeping the text between blocks where it was.
async function moveBlockTo(from, to) {
  const model = await blocksModel();
  const text = model.getValue();
  const blocks = findBlocks(text);
  if (from === to || !blocks[from] || !blocks[to]) return;
  const pieces = blocks.map((b) => text.slice(b.start, b.end));
  pieces.splice(to, 0, pieces.splice(from, 1)[0]);
  let next = text.slice(0, blocks[0].start);
  pieces.forEach((piece, i) => {
    next += piece + (i < blocks.length - 1 ? text.slice(blocks[i].end, blocks[i + 1].start) : '');
  });
  await setIndexText(next + text.slice(blocks[blocks.length - 1].end));
}

async function deleteBlock(i) {
  const model = await blocksModel();
  const text = model.getValue();
  const block = findBlocks(text)[i];
  if (!block || !confirm('Delete this block? You can undo with Ctrl+Z or from Rewind.')) return;
  const after = text.slice(block.end).replace(/^\n{1,2}/, '');
  await setIndexText(text.slice(0, block.start) + after);
}

// ------------------------------------------------------------------ edit form

async function editBlock(i) {
  const model = await blocksModel();
  const block = findBlocks(model.getValue())[i];
  const def = block && blockDefs()[block.type];
  if (!def) return toast("This block can't be edited with a form", 'error');
  const values = readBlock(block);
  B.editing = { index: i, type: block.type, values };
  $('#bmTitle').textContent = `Edit: ${def.title}`;
  $('#bmBody').replaceChildren(...def.fields.map((f) => fieldEl(f, values)));
  $('#blockModal').showModal();
}

async function saveBlockForm() {
  const { index, type, values } = B.editing;
  const model = await blocksModel();
  const text = model.getValue();
  const block = findBlocks(text)[index];
  if (!block) return $('#blockModal').close();
  const html = blockDefs()[type].render(values);
  await setIndexText(text.slice(0, block.start) + wrapBlock(type, html, block.indent) + text.slice(block.end));
  $('#blockModal').close();
  toast('Block updated ✓');
}

let radioId = 0;

function fieldEl(field, obj) {
  const wrap = el('div', { className: 'bf-field' });
  if (field.label) wrap.append(el('label', { className: 'bf-label', textContent: field.label }));

  if (field.type === 'text' || field.type === 'number') {
    const input = el('input', { type: field.type, value: obj[field.key] ?? '' });
    input.oninput = () => { obj[field.key] = field.type === 'number' ? Number(input.value) : input.value; };
    wrap.append(input);
  } else if (field.type === 'longtext') {
    const area = el('textarea', { rows: 3, value: obj[field.key] ?? '' });
    area.oninput = () => { obj[field.key] = area.value; };
    wrap.append(area);
  } else if (field.type === 'list') {
    const rows = el('div', { className: 'bf-rows' });
    const draw = () => rows.replaceChildren(...obj[field.key].map((val, i) => {
      const input = el('input', { type: 'text', value: val });
      input.oninput = () => { obj[field.key][i] = input.value; };
      const remove = el('button', { className: 'icon-btn', type: 'button', textContent: '✕', title: 'Remove' });
      remove.onclick = () => { obj[field.key].splice(i, 1); draw(); };
      return el('div', { className: 'bf-row' }, input, remove);
    }));
    draw();
    const add = el('button', { className: 'btn small', type: 'button', textContent: field.addLabel || '+ Add' });
    add.onclick = () => { obj[field.key].push(''); draw(); };
    wrap.append(rows, add);
  } else if (field.type === 'choices') {
    const group = `bf-radio-${radioId++}`;
    const rows = el('div', { className: 'bf-rows' });
    const draw = () => rows.replaceChildren(...obj[field.key].map((choice, i) => {
      const radio = el('input', { type: 'radio', name: group, checked: !!choice.correct, title: 'This is the correct answer' });
      radio.onchange = () => { obj[field.key].forEach((c, j) => { c.correct = j === i; }); };
      const input = el('input', { type: 'text', value: choice.text });
      input.oninput = () => { choice.text = input.value; };
      const remove = el('button', { className: 'icon-btn', type: 'button', textContent: '✕', title: 'Remove' });
      remove.onclick = () => {
        if (obj[field.key].length <= 2) return toast('Keep at least two answers', 'error');
        obj[field.key].splice(i, 1);
        if (!obj[field.key].some((c) => c.correct)) obj[field.key][0].correct = true;
        draw();
      };
      return el('div', { className: 'bf-row' }, radio, input, remove);
    }));
    draw();
    const add = el('button', { className: 'btn small', type: 'button', textContent: '+ Add an answer' });
    add.onclick = () => { obj[field.key].push({ text: '', correct: false }); draw(); };
    wrap.append(rows, add);
  } else if (field.type === 'group') {
    const cards = el('div', { className: 'bf-cards' });
    const draw = () => cards.replaceChildren(...obj[field.key].map((item, i) => {
      const remove = el('button', { className: 'icon-btn', type: 'button', textContent: '✕', title: 'Remove' });
      remove.onclick = () => {
        if (obj[field.key].length <= 1) return toast('Keep at least one', 'error');
        obj[field.key].splice(i, 1);
        draw();
      };
      return el('div', { className: 'bf-card' },
        el('div', { className: 'bf-card-head' }, el('b', { textContent: `${field.itemLabel || 'Item'} ${i + 1}` }), remove),
        ...field.fields.map((sub) => fieldEl(sub, item)));
    }));
    draw();
    const add = el('button', { className: 'btn small', type: 'button', textContent: field.addLabel || '+ Add' });
    add.onclick = () => { obj[field.key].push(field.blank()); draw(); };
    wrap.append(cards, add);
  }
  return wrap;
}
