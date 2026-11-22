// Small helpers about file paths and times, shared by the editor's stores and components.

const BINARY_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'avif',
  'mp3',
  'wav',
  'ogg',
  'm4a',
  'mp4',
  'webm',
  'mov',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'zip',
  'pdf',
  'wasm',
]);
export const IMAGE_EXT = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'bmp',
  'avif',
  'svg',
]);
const LANGS = {
  html: 'html',
  htm: 'html',
  css: 'css',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  jsx: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  md: 'markdown',
  py: 'python',
  svg: 'xml',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
  sh: 'shell',
  toml: 'ini',
};

export const ext = (p) => (p.includes('.') ? p.split('.').pop().toLowerCase() : '');
export const isBinary = (p) => BINARY_EXT.has(ext(p));
export const langFor = (p) => LANGS[ext(p)] || 'plaintext';
export const baseName = (p) => p.split('/').pop();

// What someone typed as a path: no leading slash, no doubled slashes.
export function cleanPath(p) {
  return (p || '').trim().replace(/^\/+/, '').replace(/\/+/g, '/');
}

// What kind of viewer a non-text file gets.
export function mediaKind(path) {
  const e = ext(path);
  if (IMAGE_EXT.has(e)) return 'image';
  if (['mp4', 'webm', 'mov'].includes(e)) return 'video';
  if (['mp3', 'wav', 'ogg', 'm4a'].includes(e)) return 'audio';
  return 'other';
}

export function fmtTime(t) {
  return new Date(t * 1000).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function fmtDay(t) {
  const d = new Date(t * 1000);
  const yest = new Date(Date.now() - 86400000);
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  if (d.toDateString() === yest.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
