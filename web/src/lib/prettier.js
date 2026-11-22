// Prettier runs in the browser with its defaults, which is what the VS Code extension uses out of
// the box. It's loaded only the first time someone formats a file, as its own chunk.
import { ext } from './files.js';

const PARSERS = {
  js: 'babel',
  mjs: 'babel',
  cjs: 'babel',
  jsx: 'babel',
  ts: 'typescript',
  tsx: 'typescript',
  json: 'json',
  css: 'css',
  scss: 'scss',
  less: 'less',
  html: 'html',
  htm: 'html',
  md: 'markdown',
  yml: 'yaml',
  yaml: 'yaml',
  vue: 'vue',
};

export const prettierParser = (path) => PARSERS[ext(path)];

let loading;
function load() {
  loading ??= Promise.all([
    import('prettier/standalone'),
    import('prettier/plugins/babel'),
    import('prettier/plugins/estree'),
    import('prettier/plugins/typescript'),
    import('prettier/plugins/postcss'),
    import('prettier/plugins/html'),
    import('prettier/plugins/markdown'),
    import('prettier/plugins/yaml'),
  ])
    .then(([core, ...plugins]) => ({
      format: core.format,
      plugins: plugins.map((m) => m.default ?? m),
    }))
    .catch((e) => {
      loading = null; // let the next attempt try again
      throw e;
    });
  return loading;
}

export async function formatText(text, path) {
  const { format, plugins } = await load();
  return format(text, { parser: prettierParser(path), plugins });
}
