// The AI tools cost money per request, so they stay hidden until someone switches them on by
// triple-clicking the build label. The choice is remembered per browser, under the same key the
// old editor page reads, so the setting carries across.
const AI_TOOLS_KEY = 'glitch.aiTools';

export function aiToolsOn() {
  try {
    return localStorage.getItem(AI_TOOLS_KEY) === '1';
  } catch {
    return false;
  }
}

export function setAiTools(on) {
  try {
    localStorage.setItem(AI_TOOLS_KEY, on ? '1' : '0');
  } catch {
    // Storage blocked: the setting just won't stick.
  }
  dispatchEvent(new CustomEvent('aitools', { detail: on }));
}
