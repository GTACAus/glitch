// Keeping links working when a file is renamed or moved.
//
// A "reference" is a path written in a project file: href="style.css", src='img/cat.png',
// url(bg.png), import x from './util.js', or any quoted string. Each one is resolved against the
// folder of the file it's in, and only rewritten if it points at a file that moved, so text that
// merely looks like a path is left alone.
import { ext } from './files.js';

// Files that can contain links to other files.
const LINKING = new Set(['html', 'htm', 'css', 'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'svg']);
export const canLink = (path) => LINKING.has(ext(path));

export const dirOf = (path) => (path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '');

// The project path a reference points at, or null when it points elsewhere (a web address, an
// anchor, above the project root). A leading / means the project root, as on a preview subdomain.
export function resolveRef(dir, ref) {
  if (!ref || /^([a-z][a-z0-9+.-]*:|\/\/|#)/i.test(ref)) return null;
  const parts = [];
  for (const seg of (ref.startsWith('/') ? ref : dir + ref).split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (!parts.length) return null;
      parts.pop();
    } else parts.push(seg);
  }
  return parts.length ? parts.join('/') : null;
}

// How a file in `dir` should refer to `path`.
export function relativeRef(dir, path) {
  const from = dir.split('/').filter(Boolean);
  const to = path.split('/');
  let i = 0;
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++;
  return '../'.repeat(from.length - i) + to.slice(i).join('/');
}

// Where references are found; the `ref` group is the path. Most specific first: where two
// matches overlap, the earlier pattern wins.
const PATTERNS = [
  // HTML attributes, quoted. Checked before plain quoted strings, because an apostrophe in
  // page text ("it's") could otherwise pair up with the wrong quote.
  /\b(?:src|href|poster|data|action)\s*=\s*(["'])(?<ref>[^"'\n]*)\1/dgi,
  // CSS url(…), quoted or not.
  /url\(\s*(["']?)(?<ref>[^"'()\s]+)\1\s*\)/dgi,
  // HTML attributes, unquoted.
  /\b(?:src|href|poster|data|action)\s*=\s*(?<ref>[^\s"'`<>=]+)/dgi,
  // Any other quoted string: imports, fetch('data.json'), new Audio('boom.mp3').
  /(["'`])(?<ref>[^"'`\n]+?)\1/dg,
];

// Every reference in `text`, as { start, end, ref }, without overlaps.
function findRefs(text) {
  const found = [];
  const taken = [];
  const overlaps = (s, e) => taken.some(([a, b]) => s < b && e > a);
  for (const re of PATTERNS) {
    for (const m of text.matchAll(re)) {
      const whole = [m.index, m.index + m[0].length];
      if (overlaps(...whole)) continue;
      taken.push(whole);
      const [start, end] = m.indices.groups.ref; // where the path itself sits (the d flag)
      found.push({ start, end, ref: m.groups.ref });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

// Rewrite references in `text`. `mapTarget(path)` gets the project path a reference points at
// (resolved against `fromDir`) and returns its new project path, or null to leave it alone. The
// new reference is written relative to `toDir`. Returns { text, count }.
export function rewriteRefs(text, fromDir, toDir, mapTarget) {
  let out = '';
  let last = 0;
  let count = 0;
  for (const { start, end, ref } of findRefs(text)) {
    const [, path, suffix] = /^([^?#]*)(.*)$/s.exec(ref); // keep ?query and #hash as they were
    const target = resolveRef(fromDir, path);
    const moved = target && mapTarget(target);
    if (!moved) continue;
    let next = path.startsWith('/') ? `/${moved}` : relativeRef(toDir, moved);
    if (path.startsWith('./') && !next.startsWith('../')) next = `./${next}`; // keep the author's style
    if (next === path) continue;
    out += text.slice(last, start) + next + suffix;
    last = end;
    count++;
  }
  return { text: out + text.slice(last), count };
}
