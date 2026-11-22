/* ai-config.js: the AI key + model setup shared by every AI template. Leave this file alone and edit script.js.
 *
 *   await AI.ready();                         // shows the key dialog the first time, resolves once a key is saved
 *   const text = await AI.chat({ system, messages });   // messages: [{ role: 'user' | 'model', text }]
 *   AI.openSettings();                        // change key / provider / model (glitch~nhance has an AI settings button for this)
 *
 * Inside glitch~nhance the key/provider/model are set with the "AI settings" button in glitch's top bar, not in your app:
 * if no key is set yet, your app shows a short notice and carries on once one is saved. Opened on its own (outside glitch),
 * the app shows the setup dialog itself.
 * The key lives only in THIS browser's localStorage. It is never sent anywhere except Google or OpenRouter.
 * Providers: "gemini" (Google AI Studio key) or "openrouter" (OpenRouter key).
 */
(() => {
  const STORE = 'ai.config.v1';
  const MODELS = {
    gemini: [
      ['gemini-3.5-flash-lite', 'Gemini 3.5 Flash-Lite (fastest, cheapest)'],
      ['gemini-3.5-flash', 'Gemini 3.5 Flash (balanced)'],
      ['gemini-3.8-flash', 'Gemini 3.8 Flash (newest, fast)'],
      ['gemini-3.1-pro-preview', 'Gemini 3.1 Pro (best, slower)'],
    ],
    openrouter: [
      ['google/gemini-2.5-flash', 'Google Gemini 2.5 Flash'],
      ['deepseek/deepseek-chat', 'DeepSeek Chat (cheap, good at code)'],
      ['openai/gpt-4o-mini', 'OpenAI GPT-4o mini'],
      ['meta-llama/llama-3.3-70b-instruct', 'Llama 3.3 70B'],
    ],
  };
  const LINKS = {
    gemini: ['https://aistudio.google.com/apikey', 'Get a free Gemini key at Google AI Studio'],
    openrouter: ['https://openrouter.ai/keys', 'Get a key at OpenRouter'],
  };

  const load = () => { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch { return {}; } };
  const save = (c) => { try { localStorage.setItem(STORE, JSON.stringify(c)); } catch {} };
  let cfg = load();
  const inFrame = window.parent !== window; // true inside the glitch~nhance preview
  const base = () => (typeof window.BASE === 'string' ? window.BASE : (location.pathname.includes('/p/') ? location.pathname.split('/p/')[0] : ''));
  const provider = () => cfg.provider || 'gemini';
  const keyOf = (p) => (cfg.keys || {})[p] || '';
  const modelOf = (p) => (cfg.models || {})[p] || MODELS[p][0][0];

  let dialog;
  // Inside glitch's preview there is no settings UI of our own: ask glitch (the parent page) to open its dialog, show a
  // short notice, and carry on as soon as a key has been saved (localStorage changes reach every same-origin page).
  function askParent(message) {
    return new Promise((resolve) => {
      try { parent.postMessage({ type: 'glitch:ai-settings', message }, location.origin); } catch {}
      dialog?.remove();
      dialog = document.createElement('div');
      dialog.setAttribute('style', 'position:fixed;left:0;right:0;bottom:0;z-index:99999');
      dialog.attachShadow({ mode: 'open' }).innerHTML = `<div style="margin:12px;padding:12px 14px;border-radius:10px;background:#fff8e1;color:#4a3b00;border:1px solid #f0d98a;font:14px/1.4 system-ui,sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.2)">
        <b>This app needs an AI key.</b> Use <b>⚙ AI settings</b> at the top of glitch~nhance to add one. It carries on by itself once saved.</div>`;
      document.body.appendChild(dialog);
      const done = () => {
        cfg = load();
        if (!keyOf(provider())) return;
        removeEventListener('storage', done); clearInterval(timer); dialog?.remove(); resolve(true);
      };
      const timer = setInterval(done, 1000); // storage events can be missed in some browsers; this is the backstop
      addEventListener('storage', done);
    });
  }

  function openSettings(message) {
    cfg = load();
    if (inFrame) return askParent(message);
    return new Promise((resolve) => {
      dialog?.remove();
      dialog = document.createElement('div');
      dialog.setAttribute('style', 'position:fixed;inset:0;z-index:99999');
      const root = dialog.attachShadow({ mode: 'open' }); // shadow DOM so the page's CSS can't break the dialog
      const p = provider();
      root.innerHTML = `<div style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:grid;place-items:center;padding:16px;font:15px/1.45 system-ui,sans-serif">
        <form style="background:#fff;color:#1a1a1a;border-radius:14px;padding:22px;max-width:440px;width:100%;box-shadow:0 10px 40px rgba(0,0,0,.4)">
          <h2 style="margin:0 0 6px;font-size:20px">AI setup</h2>
          <p style="margin:0 0 14px;color:#555">${message || 'This app talks to an AI. The key stays in this browser only.'}</p>
          <label style="display:block;font-weight:600;margin-bottom:4px">Provider</label>
          <select name="provider" style="width:100%;padding:8px;margin-bottom:10px">
            <option value="gemini">Google Gemini</option><option value="openrouter">OpenRouter</option></select>
          <a name="link" target="_blank" rel="noopener" style="display:block;margin-bottom:10px;color:#4c34e5"></a>
          <label style="display:block;font-weight:600;margin-bottom:4px">API key</label>
          <input name="key" type="password" autocomplete="off" placeholder="Paste your key" style="width:100%;padding:8px;margin-bottom:10px;box-sizing:border-box">
          <label style="display:block;font-weight:600;margin-bottom:4px">Model</label>
          <select name="model" style="width:100%;padding:8px;margin-bottom:4px"></select>
          <input name="custom" placeholder="Custom model id" style="display:none;width:100%;padding:8px;margin:6px 0;box-sizing:border-box">
          <div style="margin:8px 0 0;font-size:13px;color:#555">Rather have Gemini build you an app first? <a name="maker" target="_blank" style="color:#4c34e5">Open the prompt maker</a></div>
          <div name="err" style="color:#c0392b;min-height:20px;margin:6px 0"></div>
          <div style="display:flex;gap:8px;justify-content:flex-end">
            <button type="button" name="cancel" style="padding:8px 14px">Cancel</button>
            <button type="submit" style="padding:8px 14px;background:#4c34e5;color:#fff;border:0;border-radius:6px">Save</button></div>
        </form></div>`;
      const f = root.querySelector('form');
      const $ = (n) => f.elements[n] || f.querySelector(`[name=${n}]`);
      const fill = () => {
        const pv = $('provider').value;
        $('link').href = LINKS[pv][0]; $('link').textContent = LINKS[pv][1] + ' →';
        $('key').value = keyOf(pv);
        const cur = modelOf(pv);
        $('model').innerHTML = MODELS[pv].map(([id, label]) => `<option value="${id}">${label}</option>`).join('')
          + '<option value="__custom">Custom model id…</option>';
        const known = MODELS[pv].some(([id]) => id === cur);
        $('model').value = known ? cur : '__custom';
        $('custom').style.display = known ? 'none' : 'block'; $('custom').value = known ? '' : cur;
      };
      $('maker').href = base() + '/static/prompt.html';
      $('provider').value = p; fill();
      $('provider').onchange = fill;
      $('model').onchange = () => { $('custom').style.display = $('model').value === '__custom' ? 'block' : 'none'; };
      $('cancel').onclick = () => { dialog.remove(); resolve(false); };
      f.onsubmit = (e) => {
        e.preventDefault();
        const pv = $('provider').value, key = $('key').value.trim();
        const model = $('model').value === '__custom' ? $('custom').value.trim() : $('model').value;
        if (!key) { $('err').textContent = 'Please paste a key first.'; return; }
        if (!model) { $('err').textContent = 'Please choose a model.'; return; }
        cfg = { provider: pv, keys: { ...cfg.keys, [pv]: key }, models: { ...cfg.models, [pv]: model } };
        save(cfg); dialog.remove(); resolve(true);
      };
      document.body.appendChild(dialog);
    });
  }

  async function ready() {
    cfg = load();
    if (keyOf(provider())) return true;
    return openSettings('To chat you need a free API key. Get one from either link, then paste it here.');
  }

  async function chat({ system = '', messages = [] }) {
    if (!(await ready())) throw new Error('No API key set.');
    cfg = load();
    const pv = provider(), key = keyOf(pv), model = modelOf(pv);
    let res, data;
    if (pv === 'gemini') {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({
          systemInstruction: system ? { parts: [{ text: system }] } : undefined,
          contents: messages.map((m) => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: m.text }] })),
        }),
      });
    } else {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [...(system ? [{ role: 'system', content: system }] : []),
            ...messages.map((m) => ({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text }))],
        }),
      });
    }
    try { data = await res.json(); } catch { data = {}; }
    if (!res.ok) {
      const msg = data.error?.message || res.statusText;
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        throw new Error(`The AI service rejected the request (${res.status}). Check your key in settings. ${msg}`);
      }
      throw new Error(`The AI service said no (${res.status}). ${msg}`);
    }
    const text = pv === 'gemini'
      ? (data.candidates?.[0]?.content?.parts || []).filter((p) => !p.thought).map((p) => p.text || '').join('')
      : data.choices?.[0]?.message?.content;
    if (!text) throw new Error('The AI sent back an empty answer. Try again.');
    return text;
  }

  window.AI = { ready, chat, openSettings, get provider() { return provider(); }, get model() { return modelOf(provider()); } };
})();
