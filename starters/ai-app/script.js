// A tiny example of an AI app: one screen, one job. Change the screen in index.html and the job below.
// The idea: collect something from the page, build a prompt, call ask(), show the answer however you like.

const $ = (id) => document.getElementById(id);

// ask() sends ONE prompt and gives back the AI's text. `instructions` say what job the AI is doing.
async function ask(instructions, prompt) {
  return AI.chat({ system: instructions, messages: [{ role: 'user', text: prompt }] });
}

$('go').onclick = async () => {
  const text = $('text').value.trim();
  if (!text) { $('text').focus(); return; }
  $('go').disabled = true;
  $('out').hidden = false;
  $('result').className = '';
  $('result').textContent = 'thinking…';
  try {
    $('result').textContent = await ask(
      'You rewrite text in a requested tone. Keep the meaning. Reply with only the rewritten text.',
      `Tone: ${$('tone').value}\n\nText:\n${text}`
    );
  } catch (err) {
    $('result').className = 'error';
    $('result').textContent = err.message;
  } finally {
    $('go').disabled = false;
  }
};

$('copy').onclick = () => navigator.clipboard?.writeText($('result').textContent);

AI.ready(); // asks for a key the first time
