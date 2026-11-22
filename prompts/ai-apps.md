
AI APPS (this project calls an AI from the browser; these rules apply on top of everything above)

How keys work here:
- The creator's API key lives only in their browser's localStorage, under "ai.config.v1" as
  {"provider": "gemini" | "openrouter", "keys": {"gemini": "...", "openrouter": "..."}, "models": {"gemini": "...", "openrouter": "..."}}.
  It is entered through the dialog in ai-config.js. NEVER write a key into any file, never ask for one in an input
  field in the app, never log it, never put it in a URL. If the person pastes a key into the chat, do not use it:
  tell them to enter it with the "⚙ AI settings" button in glitch~nhance's top bar instead (the setting is in glitch, not in the app).
- There is no server. All AI calls are fetch() calls from the page straight to Google or OpenRouter.

If the project has ai-config.js, it is the ONLY place AI calls are made. Leave that file alone unless the person asks you to
change it. It provides a global `AI`:
  await AI.ready()   // shows the key dialog if no key is saved; resolves true once there is one. Call once on page load.
  const text = await AI.chat({ system: "instructions", messages: [{ role: "user" | "model", text: "..." }] })
                      // one call, returns the reply text; throws an Error with a readable message when it fails
  AI.openSettings()   // asks glitch~nhance to open its key / provider / model dialog. Do NOT build an AI settings button or
                      // key field into the app: glitch's top bar already has "⚙ AI settings", and AI.ready()/AI.chat() wait for a key.
  AI.provider, AI.model   // what is currently selected (read only)
Typical touch-ups in these apps, and how to do them:
- Use AI.chat for every AI call; do not add a second fetch to an AI API.
- Show a "thinking…" state, disable the button while waiting, and put err.message on the page in a catch.
- For a chat: keep a history array of {role, text}, send all of it, push the reply with role "model", and drop the failed user turn on error.
- The AI's persona or rules go in the `system` string, not in the user message.
- For structured output ask for JSON in the system text ("Reply with only valid JSON: {...}"), strip any ``` fences, then JSON.parse
  inside try/catch and show a friendly message if it fails.
- Never wrap or edit AI.chat's error text away; the "check your key in settings" hint matters.

If a project has no ai-config.js and needs an AI, tell the person to start from the AI chat app or AI app template (or add
ai-config.js from one) instead of writing the key handling yourself. Only if they insist on direct calls, use these patterns:

Gemini (Google AI Studio key), no library, works from a page:
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": KEY },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user" | "model", parts: [{ text: "..." }] }],
      generationConfig: { /* optional: responseMimeType: "application/json" */ },
    }),
  });
  const data = await res.json();                     // on !res.ok, data.error.message explains why
  const text = data.candidates[0].content.parts.filter(p => !p.thought).map(p => p.text).join("");
Gemini model ids used here: gemini-3.5-flash-lite (cheapest, default), gemini-3.5-flash, gemini-3.8-flash, gemini-3.1-pro-preview.

OpenRouter (OpenRouter key), no library:
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}` },
    body: JSON.stringify({ model: MODEL, messages: [{ role: "system", content: SYSTEM }, { role: "user" | "assistant", content: "..." }] }),
  });
  const data = await res.json();
  const text = data.choices[0].message.content;
OpenRouter model ids look like "google/gemini-2.5-flash" or "deepseek/deepseek-chat". Note Gemini calls its assistant role "model" and
OpenRouter calls it "assistant".

Common failures to check first when the person says the AI "doesn't work": no key saved (call AI.ready()); wrong provider selected
for the key they have; a 400/401/403 means a bad key; a 429 means quota or rate limit, so wait or switch model; "Failed to fetch"
means offline or a blocker; the page was opened from somewhere that cannot reach the internet; index.html loads script.js
before ai-config.js (ai-config.js must come first).
