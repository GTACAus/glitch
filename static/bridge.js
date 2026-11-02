// Injected into every previewed HTML page: forwards console output and errors to the editor.
(() => {
  if (window.parent === window) return;
  const fmt = (v) => {
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || String(v);
    try { return JSON.stringify(v) ?? String(v); } catch { return String(v); }
  };
  const post = (msg) => { try { window.parent.postMessage({ __glitch: true, ...msg }, '*'); } catch {} };
  const send = (level, args) => post({ type: 'log', level, text: args.map(fmt).join(' ') });

  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[level];
    console[level] = (...args) => { send(level, args); orig.apply(console, args); };
  }
  addEventListener('error', (e) => {
    if (e.target && e.target !== window) {
      send('error', [`Couldn't load ${e.target.src || e.target.href || e.target.tagName}`]);
    } else if (e.message) {
      const file = (e.filename || '').split('/').pop();
      send('error', [`${e.message}${file ? ` (${file}:${e.lineno})` : ''}`]);
    }
  }, true);
  addEventListener('unhandledrejection', (e) => send('error', ['Unhandled promise rejection:', e.reason]));
  post({ type: 'loaded', path: location.pathname });
})();
