// AI-suggested file contents can be large, so they live in IndexedDB; the chat text stays in
// localStorage. Every call fails soft: without storage, suggestions just don't survive a reload.

const KEEP_DAYS = 7;
let db;

function run(mode, fn) {
  db ??= new Promise((resolve, reject) => {
    const req = indexedDB.open('glitch', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('suggestions', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return db
    .then(
      (conn) =>
        new Promise((resolve, reject) => {
          const tx = conn.transaction('suggestions', mode);
          const req = fn(tx.objectStore('suggestions'));
          tx.oncomplete = () => resolve(req?.result);
          tx.onerror = () => reject(tx.error);
        }),
    )
    .catch(() => undefined);
}

// Saved suggestions for one project, by message id. Also clears out ones older than a week.
export async function loadSuggestions(project) {
  const all = (await run('readonly', (st) => st.getAll())) || [];
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  const expired = all.filter((x) => x.saved < cutoff).map((x) => x.id);
  if (expired.length) {
    run('readwrite', (st) => {
      for (const id of expired) st.delete(id);
    });
  }
  return new Map(
    all.filter((x) => x.project === project && x.saved >= cutoff).map((x) => [x.id, x]),
  );
}

export function storeSuggestion(project, msg) {
  if (!msg.id || !msg.changes?.length) return;
  // A plain copy: IndexedDB can't store Vue's reactive proxies.
  const changes = JSON.parse(JSON.stringify(msg.changes));
  run('readwrite', (st) => st.put({ id: msg.id, project, saved: msg.saved, changes }));
}

export function forgetSuggestions(msgs) {
  const ids = msgs.map((m) => m.id).filter(Boolean);
  if (ids.length) {
    run('readwrite', (st) => {
      for (const id of ids) st.delete(id);
    });
  }
}
