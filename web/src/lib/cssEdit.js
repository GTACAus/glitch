// Small, formatting-preserving edits to a CSS file's text.
// Used by the style panel so saving the same element twice updates one rule
// instead of piling up a new override every time.

// Skip a comment or string starting at i; returns the index after it, or i if there isn't one.
function skipQuoted(text, i) {
  const c = text[i];
  if (c === '/' && text[i + 1] === '*') {
    const end = text.indexOf('*/', i + 2);
    return end === -1 ? text.length : end + 2;
  }
  if (c === '"' || c === "'") {
    for (let j = i + 1; j < text.length; j++) {
      if (text[j] === '\\') j++;
      else if (text[j] === c || text[j] === '\n') return j + 1;
    }
    return text.length;
  }
  return i;
}

// Selectors compare equal regardless of spacing and comments: "nav>a" matches "nav > a".
function normSelector(s) {
  return s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s*([>+~,])\s*/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Top-level style rules (not inside @media etc.): { selector, open, close } where open/close
// are the indexes of the rule's { and }.
function topLevelRules(text) {
  const rules = [];
  let start = 0;
  let i = 0;
  while (i < text.length) {
    const skipped = skipQuoted(text, i);
    if (skipped !== i) {
      i = skipped;
      continue;
    }
    const c = text[i];
    if (c === ';') start = i + 1; // e.g. after @import
    else if (c === '}') start = i + 1; // stray brace; recover
    else if (c === '{') {
      const prelude = text.slice(start, i);
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth) {
        const s = skipQuoted(text, j);
        if (s !== j) {
          j = s;
          continue;
        }
        if (text[j] === '{') depth++;
        else if (text[j] === '}') depth--;
        j++;
      }
      const close = j - 1;
      if (!prelude.trim().startsWith('@')) {
        rules.push({ selector: normSelector(prelude), open: i, close });
      }
      i = start = j;
      continue;
    }
    i++;
  }
  return rules;
}

// Split a rule body into declarations, each keeping its own whitespace and trailing ';'.
function splitDecls(body) {
  const parts = [];
  let start = 0;
  let paren = 0;
  for (let i = 0; i < body.length; i++) {
    const s = skipQuoted(body, i);
    if (s !== i) {
      i = s - 1;
      continue;
    }
    if (body[i] === '(') paren++;
    else if (body[i] === ')') paren--;
    else if (body[i] === ';' && paren <= 0) {
      parts.push(body.slice(start, i + 1));
      start = i + 1;
    }
  }
  parts.push(body.slice(start)); // whatever follows the last ';' (usually just whitespace)
  return parts.map((text) => {
    const m = /^\s*(?:\/\*[\s\S]*?\*\/\s*)*([-\w]+)\s*:/.exec(text);
    return { text, name: m ? m[1].toLowerCase() : null };
  });
}

// Set a declaration's value, keeping its spacing and any !important.
function replaceValue(text, value) {
  const m = /^([\s\S]*?:\s*)([\s\S]*?)(\s*!important)?(\s*;?\s*)$/i.exec(text);
  return m ? `${m[1]}${value}${m[3] || ''}${m[4]}` : text;
}

/**
 * Apply `changes` ({ prop: value }) to the rule for `selector` in `text`.
 * Updates the last top-level rule with that exact selector: existing properties are changed
 * in place, new ones are added at the end, and an empty value removes the property.
 * If there's no such rule, a new one is added at the end of the file.
 * Returns the new text.
 */
export function upsertRule(text, selector, changes) {
  const entries = Object.entries(changes).map(([p, v]) => [p.toLowerCase(), String(v ?? '').trim()]);
  const rule = topLevelRules(text)
    .filter((r) => r.selector === normSelector(selector))
    .pop();

  if (!rule) {
    const decls = entries.filter(([, v]) => v);
    if (!decls.length) return text;
    const block = `${selector} {\n${decls.map(([p, v]) => `  ${p}: ${v};`).join('\n')}\n}\n`;
    return `${text.replace(/\s*$/, '')}\n\n${block}`.trimStart();
  }

  const body = text.slice(rule.open + 1, rule.close);
  const parts = splitDecls(body);
  const values = new Map(entries);
  const done = new Set();
  const out = [];
  for (const part of parts) {
    if (!part.name || !values.has(part.name)) {
      out.push(part);
      continue;
    }
    const value = values.get(part.name);
    // Keep the first declaration (updated); drop empties and later duplicates, which would win.
    if (value && !done.has(part.name)) out.push({ ...part, text: replaceValue(part.text, value) });
    done.add(part.name);
  }

  const added = entries.filter(([p, v]) => v && !done.has(p));
  if (added.length) {
    const multiline = body.includes('\n');
    const indent = /\n([ \t]+)\S/.exec(body)?.[1] ?? '  ';
    // The whitespace before the closing brace stays at the end.
    const tail = out.length && !out[out.length - 1].text.trim() ? out.pop().text : '';
    const last = out[out.length - 1];
    if (last && last.text.trim() && !last.text.trimEnd().endsWith(';')) {
      last.text = `${last.text.trimEnd()};`;
    }
    for (const [p, v] of added) {
      out.push({ text: multiline ? `\n${indent}${p}: ${v};` : ` ${p}: ${v};` });
    }
    out.push({ text: multiline ? (tail.includes('\n') ? tail : '\n') : ' ' });
  }

  return text.slice(0, rule.open + 1) + out.map((p) => p.text).join('') + text.slice(rule.close);
}
