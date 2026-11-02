'use strict';
/* global $, el, S */
// A guided walkthrough of the editor (the "? Tour" button), plus the one-time "how to read a diff" tip.
// Uses $, el and S from editor.js.

// A tiny fake diff so the colours are explained with the real thing in front of you.
function diffSample() {
  return el('div', { className: 'tour-diff' },
    el('div', { className: 'col' }, el('b', { textContent: 'Before' }),
      el('code', { textContent: '<h1>Hello</h1>' }),
      el('code', { className: 'del', textContent: '<p>Old text</p>' })),
    el('div', { className: 'col' }, el('b', { textContent: 'After' }),
      el('code', { textContent: '<h1>Hello</h1>' }),
      el('code', { className: 'add', textContent: '<p>New text</p>' }),
      el('code', { className: 'add', textContent: '<button>Go</button>' })));
}

const DIFF_TEXT = 'A diff compares two versions of a file: before on the left, after on the right. For AI '
  + "suggestions that's your code now vs. the suggestion; in Rewind it's what one save changed. Red lines get "
  + 'taken out, green lines get put in, and anything without a colour stays the same. Darker red or green marks '
  + 'the exact words that change. On narrow screens both sides are merged into one column, with the same colours.';

const TOUR = [
  { target: '#projName', title: 'Your project',
    text: "This is your project's name, and its address. Click it to rename the project." },
  { target: '#saveStatus', title: 'Saving is automatic',
    text: '● means you have unsaved typing, and “Saved ✓” means it is safe. Every save is kept, so you can always go back. Cmd/Ctrl+S saves straight away.' },
  { target: '#filesPane', title: 'Files',
    text: 'Click a file to open it. + makes a new file (type a / to put it in a folder), ⇪ uploads, or just drag images in. Hover a file to rename ✎ or delete ✕ it.' },
  { target: '#editor', title: 'The code editor',
    text: 'Type here. Your changes save and show up in the preview as you go.' },
  { target: '.preview-col', title: 'Live preview',
    text: 'This is your page, running for real. Type a path at the top (like about.html) to see other pages, and ↻ reloads it.' },
  { target: '#logs', title: 'Logs',
    text: 'Anything your code prints with console.log shows here, and so do errors. A red number means something went wrong, so open the logs to see what.' },
  { target: '#aiPane', title: 'Ask AI',
    text: 'Describe a change in plain words. The AI suggests edits, but nothing changes until you review and apply them. Select some code first to ask about just that part.' },
  { title: 'Reading a diff', body: diffSample, text: DIFF_TEXT },
  { target: '#rewindBtn', title: 'Rewind',
    text: 'See every earlier version of your project, step through them with ↑ ↓, save ★ checkpoints, and restore a file or the whole project.' },
  { target: '#remixBtn', title: 'Remix',
    text: "Make your own copy of any project, including other people's, and change it however you like." },
  { target: '#exportBtn', title: 'Export',
    text: 'Download every file in the project as a .zip, to keep a copy or move it somewhere else.' },
  { target: '#togglePreview', title: 'More room',
    text: 'Hide the preview when you want the editor wider.' },
  { target: '#openPreview', title: 'Open & share',
    text: 'Opens your page in its own tab. Copy that address to show it to someone.' },
  { target: '#tourBtn', title: "That's it!",
    text: 'You can replay this tour any time from here.' },
];

let tourState = null;

// Steps for things that aren't on screen (hidden panes, buttons hidden on phones) are skipped.
function present(sel) {
  const n = sel && document.querySelector(sel);
  return n && !n.closest('[hidden]') && n.getClientRects().length ? n : null;
}

// Something can be present but empty, like the save status before any typing; then the card goes in the middle.
function visible(sel) {
  const n = present(sel);
  const r = n?.getBoundingClientRect();
  return r && r.width > 0 && r.height > 0 ? n : null;
}

function startTour(steps = TOUR, { onDone } = {}) {
  endTour();
  const list = steps.filter((s) => !s.target || present(s.target));
  const spot = el('div', { className: 'tour-spot' });
  const card = el('div', { className: 'tour-card', role: 'dialog', ariaLive: 'polite' });
  const shade = el('div', { className: 'tour-shade' });
  document.body.append(shade, spot, card);
  const onKey = (e) => {
    if (e.key === 'Escape') endTour();
    else if (e.key === 'ArrowRight') go(1);
    else if (e.key === 'ArrowLeft') go(-1);
    else return;
    e.preventDefault();
    e.stopPropagation();
  };
  const onResize = () => place();
  addEventListener('keydown', onKey, true);
  addEventListener('resize', onResize);
  tourState = { list, i: 0, spot, card, shade, onDone, cleanup: () => {
    removeEventListener('keydown', onKey, true);
    removeEventListener('resize', onResize);
  } };
  shade.onclick = () => endTour();
  render();
}

function go(d) {
  const t = tourState;
  if (!t) return;
  if (t.i + d >= t.list.length) return endTour();
  t.i = Math.max(0, t.i + d);
  render();
}

function render() {
  const t = tourState;
  const step = t.list[t.i];
  const last = t.i === t.list.length - 1;
  const btns = el('div', { className: 'tour-btns' });
  if (t.list.length > 1) btns.append(el('span', { className: 'muted', textContent: `${t.i + 1} of ${t.list.length}` }));
  btns.append(el('div', { className: 'spacer' }));
  if (t.list.length > 1 && !last) {
    const skip = el('button', { className: 'btn small', type: 'button', textContent: 'Skip' });
    skip.onclick = () => endTour();
    btns.append(skip);
  }
  if (t.i > 0) {
    const back = el('button', { className: 'btn small', type: 'button', textContent: 'Back' });
    back.onclick = () => go(-1);
    btns.append(back);
  }
  const next = el('button', { className: 'btn small primary', type: 'button',
    textContent: last ? (t.list.length > 1 ? 'Done' : 'Got it') : 'Next' });
  next.onclick = () => go(1);
  btns.append(next);
  t.card.replaceChildren(...[el('h3', { textContent: step.title }), step.body?.(),
    el('p', { textContent: step.text }), btns].filter(Boolean));
  place();
  next.focus();
}

function place() {
  const t = tourState;
  if (!t) return;
  const step = t.list[t.i];
  const target = visible(step.target);
  const { card, spot, shade } = t;
  const pad = 6;
  const vw = innerWidth;
  const vh = innerHeight;
  shade.classList.toggle('dim', !target);
  spot.hidden = !target;
  card.style.maxWidth = `${Math.min(360, vw - 32)}px`;
  if (!target) {
    card.style.left = `${Math.max(16, (vw - card.offsetWidth) / 2)}px`;
    card.style.top = `${Math.max(16, (vh - card.offsetHeight) / 2)}px`;
    return;
  }
  const r = target.getBoundingClientRect();
  const box = { left: Math.max(4, r.left - pad), top: Math.max(4, r.top - pad),
    right: Math.min(vw - 4, r.right + pad), bottom: Math.min(vh - 4, r.bottom + pad) };
  Object.assign(spot.style, { left: `${box.left}px`, top: `${box.top}px`,
    width: `${box.right - box.left}px`, height: `${box.bottom - box.top}px` });
  // Put the card on whichever side of the highlight has room: below, above, right, left, or inside.
  const cw = card.offsetWidth;
  const ch = card.offsetHeight;
  const gap = 12;
  const clampX = (x) => Math.min(Math.max(16, x), vw - cw - 16);
  const clampY = (y) => Math.min(Math.max(16, y), vh - ch - 16);
  let left;
  let top;
  if (vh - box.bottom >= ch + gap + 16) { top = box.bottom + gap; left = clampX(box.left); }
  else if (box.top >= ch + gap + 16) { top = box.top - ch - gap; left = clampX(box.left); }
  else if (vw - box.right >= cw + gap + 16) { left = box.right + gap; top = clampY(box.top); }
  else if (box.left >= cw + gap + 16) { left = box.left - cw - gap; top = clampY(box.top); }
  else { left = clampX(box.left + 16); top = clampY(box.top + 16); }
  card.style.left = `${left}px`;
  card.style.top = `${top}px`;
}

function endTour() {
  const t = tourState;
  if (!t) return;
  tourState = null;
  t.cleanup();
  t.spot.remove();
  t.card.remove();
  t.shade.remove();
  t.onDone?.();
}

function seen(key) {
  try { return localStorage.getItem(key) === '1'; } catch { return false; }
}
function markSeen(key) {
  try { localStorage.setItem(key, '1'); } catch {}
}

// Called by editor.js whenever a diff is shown; explains the colours the first time only.
window.diffHelpOnce = () => {
  if (seen('glitch.seenDiffHelp') || tourState) return;
  markSeen('glitch.seenDiffHelp');
  setTimeout(() => startTour([{ target: '#diff', title: 'Reading a diff', body: diffSample, text: DIFF_TEXT }]), 300);
};

$('#tourBtn').onclick = () => {
  markSeen('glitch.seenDiffHelp');
  startTour();
};
