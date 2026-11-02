'use strict';
// Shared by the projects page and the editor.

// The AI tools cost money per request, so they stay hidden until someone switches them on by
// triple-clicking the build label. The choice is remembered per browser.
const AI_TOOLS_KEY = 'glitch.aiTools';
function aiToolsOn() {
  try { return localStorage.getItem(AI_TOOLS_KEY) === '1'; } catch { return false; }
}

// "build c2122c4 · deployed today 11:05 pm", with the commit message on hover.
function showBuild(node, b) {
  if (!node || !b) return;
  node.addEventListener('click', (e) => {
    if (e.detail !== 3) return;
    const on = !aiToolsOn();
    try { localStorage.setItem(AI_TOOLS_KEY, on ? '1' : '0'); } catch {}
    dispatchEvent(new CustomEvent('aitools', { detail: on }));
    node.classList.toggle('flash', true);
    const label = node.textContent;
    node.textContent = on ? '✦ AI tools on' : 'AI tools off';
    setTimeout(() => { node.textContent = label; node.classList.remove('flash'); }, 1400);
  });
  const d = new Date(b.deployed * 1000);
  const today = d.toDateString() === new Date().toDateString();
  const when = `${today ? 'today' : d.toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' })} `
    + d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  node.textContent = `build ${b.commit} · deployed ${when}`;
  node.title = `${b.message}\nCommitted ${new Date(b.committed * 1000).toLocaleString()}\nDeployed ${d.toLocaleString()}`
    + (b.commit.endsWith('+local') ? '\n+local: includes changes that were not committed yet' : '');
}
