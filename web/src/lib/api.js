// Talks to server.py's JSON API. Throws an Error carrying the server's message (and the HTTP status
// as err.status) when a request fails.
//   body: a plain object is sent as JSON; a string, ArrayBuffer or Blob is sent as is (file contents).
//   raw: return the Response itself instead of parsing JSON (for reading file text).
export async function api(method, url, body, { raw = false } = {}) {
  const opts = { method, headers: {} };
  if (typeof body === 'string' || body instanceof ArrayBuffer || body instanceof Blob) {
    opts.body = body;
  } else if (body !== undefined) {
    opts.body = JSON.stringify(body);
    opts.headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = (await res.json()).error || msg;
    } catch {
      // Not JSON: keep the status text.
    }
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return raw ? res : res.json().catch(() => ({}));
}

// Where a project's live page is: its own subdomain when the server has a preview host, else /p/<name>/.
export function previewUrl(me, name) {
  return me.preview_host
    ? `${location.protocol}//${name}.${me.preview_host}/`
    : `/p/${encodeURIComponent(name)}/`;
}

// "just now", "5m ago", "3h ago", "2d ago", or a date for anything older than a month.
export function ago(t) {
  const s = Date.now() / 1000 - t;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return new Date(t * 1000).toLocaleDateString();
}
