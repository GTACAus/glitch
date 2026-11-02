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

  // Right-click menu support: the editor draws the menu and style panel, we just describe and restyle the element.
  let target = null;
  let originalStyle = null;
  const selectorFor = (node) => {
    const parts = [];
    for (; node && node.nodeType === 1 && node !== document.documentElement; node = node.parentElement) {
      if (node.id && document.querySelectorAll(`#${CSS.escape(node.id)}`).length === 1) {
        parts.unshift(`#${CSS.escape(node.id)}`);
        break;
      }
      let part = node.localName;
      const cls = [...node.classList].slice(0, 2).map((c) => `.${CSS.escape(c)}`).join('');
      part += cls;
      if (node.parentElement && node.parentElement.querySelectorAll(`:scope > ${part}`).length > 1) {
        part += `:nth-child(${[...node.parentElement.children].indexOf(node) + 1})`;
      }
      parts.unshift(part);
      if (node === document.body) break;
    }
    return parts.join(' > ');
  };
  addEventListener('contextmenu', (e) => {
    if (!(e.target instanceof Element)) return;
    e.preventDefault();
    target = e.target;
    originalStyle = target.getAttribute('style');
    const html = target.outerHTML;
    post({
      type: 'contextmenu', x: e.clientX, y: e.clientY, tag: target.localName, selector: selectorFor(target),
      html: html.length > 3000 ? `${html.slice(0, 3000)}…` : html,
    });
  }, true);
  addEventListener('pointerdown', () => post({ type: 'dismiss' }), true);
  addEventListener('message', (e) => {
    const d = e.data;
    if (e.source !== window.parent || !d || !d.__glitchCmd || !target) return;
    if (d.cmd === 'getStyles') {
      const cs = getComputedStyle(target);
      post({ type: 'styles', values: Object.fromEntries(d.props.map((p) => [p, cs.getPropertyValue(p)])) });
    } else if (d.cmd === 'setStyle') {
      if (d.value) target.style.setProperty(d.prop, d.value); else target.style.removeProperty(d.prop);
    } else if (d.cmd === 'resetStyles') {
      target.removeAttribute('style');
      if (originalStyle) target.setAttribute('style', originalStyle);
    }
  });
})();
