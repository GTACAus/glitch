// Monaco (the VS Code editor), bundled by Vite instead of loaded from a CDN.
// Each language service runs in a web worker; Vite builds them from these ?worker imports.
import * as monaco from 'monaco-editor';
import EditorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
import JsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
import CssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
import HtmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
import TsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

self.MonacoEnvironment = {
  getWorker(_, label) {
    if (label === 'json') return new JsonWorker();
    if (['css', 'scss', 'less'].includes(label)) return new CssWorker();
    if (['html', 'handlebars', 'razor'].includes(label)) return new HtmlWorker();
    if (['typescript', 'javascript'].includes(label)) return new TsWorker();
    return new EditorWorker();
  },
};

// Students' scripts use globals from other files, so only syntax errors are flagged.
monaco.languages.typescript.javascriptDefaults.setDiagnosticsOptions({
  noSemanticValidation: true,
});

// Follow the system's light/dark setting.
const dark = matchMedia('(prefers-color-scheme: dark)');
const setTheme = () => monaco.editor.setTheme(dark.matches ? 'vs-dark' : 'vs');
setTheme();
dark.addEventListener('change', setTheme);

export default monaco;
