'use strict';
const app = document.getElementById('app');
const el = (tag, props = {}, ...kids) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...kids.filter((k) => k != null));
  return n;
};

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

function ago(t) {
  const s = Date.now() / 1000 - t;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t * 1000).toLocaleDateString();
}

function toast(msg, kind = '') {
  const t = el('div', { className: `toast ${kind}`, textContent: msg });
  document.body.append(t);
  setTimeout(() => t.remove(), 3000);
}

function loginForm() {
  const input = el('input', { placeholder: 'Paste your key', autocomplete: 'off', autofocus: true });
  const err = el('div', { className: 'err' });
  if (new URLSearchParams(location.search).has('badkey')) err.textContent = "That login link didn't work.";
  const go = async () => {
    try {
      await api('POST', '/api/login', { key: input.value.trim() });
      location.href = '/';
    } catch (e) { err.textContent = e.message; }
  };
  input.onkeydown = (e) => e.key === 'Enter' && go();
  return el('div', { className: 'login' },
    el('span', { className: 'brand-pill lg' }, el('span', { textContent: 'glitch~nhance' })),
    el('h2', { textContent: 'Welcome back' }),
    el('p', { className: 'muted', textContent: 'Use the login link or key you were given.' }),
    input, err,
    el('button', { className: 'btn primary block', textContent: 'Log in', onclick: go }));
}

// Visitors who aren't logged in get a gallery of every project, each opening its live page.
async function showGallery(me) {
  document.title = 'glitch~nhance';
  const dialog = el('dialog', { className: 'login-dialog' });
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });
  const openLogin = () => {
    dialog.replaceChildren(loginForm());
    dialog.showModal();
    dialog.querySelector('input').focus();
  };
  const buildInfo = el('span', { className: 'build-info' });
  showBuild(buildInfo, me.build);
  const projects = await api('GET', '/api/gallery');
  const tile = (p) => el('a', { className: 'card', href: previewUrl(me, p.name), target: '_blank', rel: 'noopener' },
    el('div', { className: 'thumb' },
      el('iframe', { src: previewUrl(me, p.name), loading: 'lazy', tabIndex: -1, title: p.name })),
    el('div', { className: 'card-body' },
      el('div', { className: 'meta' },
        el('div', { className: 'card-name', textContent: p.name }),
        el('div', { className: 'card-sub', textContent: `updated ${ago(p.updated)}` })),
      el('span', { className: 'muted', textContent: '↗' })));
  app.replaceChildren(
    el('header', { className: 'home-top' },
      el('a', { className: 'brand-pill', href: '/' }, el('span', { textContent: 'glitch~nhance' })),
      buildInfo,
      el('div', { className: 'spacer' }),
      el('button', { className: 'btn small primary', textContent: 'Log in', onclick: openLogin })),
    el('main', { className: 'home' },
      el('h1', { className: 'gallery-title', textContent: 'Things people have made' }),
      el('p', { className: 'muted gallery-sub', textContent: 'Click any project to open it. Log in to make your own.' }),
      projects.length
        ? el('div', { className: 'grid' }, ...projects.map(tile))
        : el('p', { className: 'empty', textContent: 'Nothing here yet.' })),
    dialog);
  if (new URLSearchParams(location.search).has('badkey')) openLogin();
}

function previewUrl(me, name) {
  return me.preview_host ? `${location.protocol}//${name}.${me.preview_host}/` : `/p/${name}/`;
}

function card(me, p) {
  const actions = el('div', {});
  const remix = el('button', { className: 'icon-btn', title: 'Remix (make a copy)', textContent: '⧉' });
  remix.onclick = async (e) => {
    e.preventDefault();
    const { name } = await api('POST', `/api/projects/${p.name}/remix`);
    location.href = `/edit/${name}`;
  };
  const exp = el('button', { className: 'icon-btn', title: 'Export (download as .zip)', textContent: '⤓' });
  exp.onclick = (e) => {
    e.preventDefault();
    location.href = `/api/projects/${p.name}/export`; // a download, so the page stays put
  };
  actions.append(remix, exp);
  if (p.mine) {
    const del = el('button', { className: 'icon-btn', title: 'Delete', textContent: '🗑' });
    del.onclick = async (e) => {
      e.preventDefault();
      if (!confirm(`Delete ${p.name}? This removes it and its rewind history.`)) return;
      await api('DELETE', `/api/projects/${p.name}`);
      main();
    };
    actions.append(del);
  }
  return el('a', { className: 'card', href: `/edit/${p.name}` },
    el('div', { className: 'thumb' },
      el('iframe', { src: previewUrl(me, p.name), loading: 'lazy', tabIndex: -1 })),
    el('div', { className: 'card-body' },
      el('div', { className: 'meta' },
        el('div', { className: 'card-name', textContent: p.name }),
        el('div', { className: 'card-sub', textContent: `${p.mine ? 'you' : p.owner_name} · ${ago(p.updated)}` })),
      actions));
}

async function main() {
  const me = await api('GET', '/api/me');
  if (!me.user) return showGallery(me);
  document.title = 'Projects · glitch~nhance';
  const projects = await api('GET', '/api/projects');
  const mine = projects.filter((p) => p.mine);
  const others = projects.filter((p) => !p.mine);

  const newCard = el('div', { className: 'new-card' }, el('h3', { textContent: '✦ New project' }));
  for (const t of me.templates) {
    const b = el('button', { className: 'tpl' }, el('b', { textContent: t.title }), el('span', { textContent: t.description }));
    b.onclick = async () => {
      try {
        const { name } = await api('POST', '/api/projects', { template: t.id });
        location.href = `/edit/${name}`;
      } catch (e) { toast(e.message, 'error'); }
    };
    newCard.append(b);
  }

  const buildInfo = el('span', { className: 'build-info' });
  showBuild(buildInfo, me.build);
  const logout = el('button', { className: 'btn small', textContent: 'Log out' });
  logout.onclick = async () => { await api('POST', '/api/logout'); location.href = '/'; };

  app.replaceChildren(
    el('header', { className: 'home-top' },
      el('a', { className: 'brand-pill', href: '/', title: 'All projects' }, el('span', { textContent: 'glitch~nhance' })),
      buildInfo,
      el('div', { className: 'spacer' }),
      el('span', { className: 'muted', textContent: `Hi, ${me.user.name}` }),
      logout),
    el('main', { className: 'home' },
      el('h2', { textContent: 'Your projects' }),
      el('div', { className: 'grid' }, newCard, ...mine.map((p) => card(me, p))),
      el('h2', { textContent: "Friends' projects" }),
      others.length
        ? el('div', { className: 'grid' }, ...others.map((p) => card(me, p)))
        : el('p', { className: 'empty', textContent: 'Nothing here yet.' })));
}

main().catch((e) => { app.textContent = e.message; });
