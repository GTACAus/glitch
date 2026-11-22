// The guided walkthrough of the editor (the "? Tour" button), plus the one-time "how to read a
// diff" tip. TourOverlay.vue draws whatever is in `tour`.
import { reactive } from 'vue';
import { getItem, setItem } from './storage.js';

export const DIFF_TEXT =
  'A diff compares two versions of a file: before on the left, after on the right. For AI ' +
  "suggestions that's your code now vs. the suggestion; in Rewind it's what one save changed. Red lines get " +
  'taken out, green lines get put in, and anything without a colour stays the same. Darker red or green marks ' +
  'the exact words that change. On narrow screens both sides are merged into one column, with the same colours.';

// `diffSample: true` shows a tiny made-up diff, so the colours are explained with the real thing.
const TOUR = [
  {
    target: '#projName',
    title: 'Your project',
    text: "This is your project's name, and its address. Click it to rename the project.",
  },
  {
    target: '#saveStatus',
    title: 'Saving is automatic',
    text: '● means you have unsaved typing, and “Saved ✓” means it is safe. Every save is kept, so you can always go back. Cmd/Ctrl+S saves straight away.',
  },
  {
    target: '#filesPane',
    title: 'Files',
    text: 'Click a file to open it. + makes a new file (type a / to put it in a folder), ⇪ uploads, or just drag images in. Hover a file to rename ✎ or delete ✕ it.',
  },
  {
    target: '#editor',
    title: 'The code editor',
    text: 'Type here. Your changes save and show up in the preview as you go.',
  },
  {
    target: '.preview-col',
    title: 'Live preview',
    text: 'This is your page, running for real. Type a path at the top (like about.html) to see other pages, and ↻ reloads it.',
  },
  {
    target: '#logs',
    title: 'Logs',
    text: 'Anything your code prints with console.log shows here, and so do errors. A red number means something went wrong, so open the logs to see what.',
  },
  {
    target: '#aiPane',
    title: 'Ask AI',
    text: 'Describe a change in plain words. The AI suggests edits, but nothing changes until you review and apply them. Select some code first to ask about just that part.',
  },
  { title: 'Reading a diff', diffSample: true, text: DIFF_TEXT },
  {
    target: '#rewindBtn',
    title: 'Rewind',
    text: 'See every earlier version of your project, step through them with ↑ ↓, save ★ checkpoints, and restore a file or the whole project.',
  },
  {
    target: '#remixBtn',
    title: 'Remix',
    text: "Make your own copy of any project, including other people's, and change it however you like.",
  },
  {
    target: '#exportBtn',
    title: 'Export',
    text: 'Download every file in the project as a .zip, to keep a copy or move it somewhere else.',
  },
  {
    target: '#togglePreview',
    title: 'More room',
    text: 'Hide the preview when you want the editor wider.',
  },
  {
    target: '#openPreview',
    title: 'Open & share',
    text: 'Opens your page in its own tab. Copy that address to show it to someone.',
  },
  { target: '#tourBtn', title: "That's it!", text: 'You can replay this tour any time from here.' },
];

export const tour = reactive({ steps: null, i: 0 });

// Steps for things that aren't on screen (hidden panes, buttons hidden on phones) are skipped.
export function present(sel) {
  const n = sel && document.querySelector(sel);
  return n && !n.closest('[hidden]') && n.getClientRects().length ? n : null;
}

export function startTour(steps = TOUR) {
  const list = steps.filter((s) => !s.target || present(s.target));
  if (!list.length) return;
  tour.steps = list;
  tour.i = 0;
}

export function endTour() {
  tour.steps = null;
}

export function stepTour(d) {
  if (!tour.steps) return;
  if (tour.i + d >= tour.steps.length) endTour();
  else tour.i = Math.max(0, tour.i + d);
}

const DIFF_SEEN = 'glitch.seenDiffHelp';

// The full tour covers diffs, so the one-time tip is skipped after it.
export function startFullTour() {
  setItem(DIFF_SEEN, '1');
  startTour();
}

// Called whenever a diff is shown; explains the colours the first time only.
export function diffHelpOnce() {
  if (getItem(DIFF_SEEN) === '1' || tour.steps) return;
  setItem(DIFF_SEEN, '1');
  setTimeout(
    () =>
      startTour([{ target: '#diff', title: 'Reading a diff', diffSample: true, text: DIFF_TEXT }]),
    300,
  );
}
