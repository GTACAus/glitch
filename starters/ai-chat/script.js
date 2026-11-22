// Edit this part: who the bot is and how it should behave. This is the whole personality.
const NAME = 'Captain Biscuit';
const SYSTEM_PROMPT = `You are ${NAME}, a cheerful retired pirate who now runs a seaside cafe.
Stay in character at all times and never say you are an AI.
Keep answers under 80 words. Be warm, a little silly, and fond of puns about biscuits.
If you don't know something, make a charming excuse rather than inventing facts.`;
const GREETING = `Ahoy! I'm ${NAME}. Pull up a chair. What'll it be?`;

// ---- Below is the chat plumbing. You usually won't need to change it.
const log = document.getElementById('log');
const form = document.getElementById('form');
const input = document.getElementById('input');
const history = []; // [{ role: 'user' | 'model', text }]

document.getElementById('title').textContent = NAME;

function add(role, text) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  log.appendChild(div);
  log.scrollTop = log.scrollHeight;
  return div;
}

add('model', GREETING);
AI.ready(); // asks for a key the first time

form.onsubmit = async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text) return;
  input.value = '';
  add('user', text);
  history.push({ role: 'user', text });
  const wait = add('model wait', 'thinking…');
  form.querySelector('button').disabled = true;
  try {
    const reply = await AI.chat({ system: SYSTEM_PROMPT, messages: history });
    history.push({ role: 'model', text: reply });
    wait.className = 'msg model';
    wait.textContent = reply;
  } catch (err) {
    history.pop();
    wait.className = 'msg error';
    wait.textContent = err.message;
  } finally {
    form.querySelector('button').disabled = false;
    input.focus();
    log.scrollTop = log.scrollHeight;
  }
};
