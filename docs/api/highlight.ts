/** Tokenizador pequeno: só o suficiente para o olho separar código de texto. */
const KEYWORDS = new Set([
  'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'default', 'delete', 'do',
  'else', 'export', 'extends', 'false', 'finally', 'for', 'from', 'function', 'if', 'import',
  'in', 'instanceof', 'let', 'new', 'null', 'of', 'return', 'super', 'switch', 'this', 'throw',
  'true', 'try', 'typeof', 'undefined', 'var', 'void', 'while', 'yield', 'async', 'static', 'get', 'set'
]);

export const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export function highlight(code: string): string {
  let out = '';
  let i = 0;

  const isIdentStart = (c: string) => /[A-Za-z_$]/.test(c);
  const isIdent = (c: string) => /[A-Za-z0-9_$]/.test(c);

  while (i < code.length) {
    const c = code[i];
    const next = code[i + 1];

    if (c === '/' && next === '/') {
      const end = code.indexOf('\n', i);
      const stop = end === -1 ? code.length : end;
      out += `<span class="tok-com">${escapeHtml(code.slice(i, stop))}</span>`;
      i = stop;
      continue;
    }
    if (c === '/' && next === '*') {
      const end = code.indexOf('*/', i + 2);
      const stop = end === -1 ? code.length : end + 2;
      out += `<span class="tok-com">${escapeHtml(code.slice(i, stop))}</span>`;
      i = stop;
      continue;
    }

    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1;
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue; }
        if (code[j] === c) { j++; break; }
        j++;
      }
      out += `<span class="tok-str">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (/[0-9]/.test(c) && !isIdent(code[i - 1] ?? ' ')) {
      let j = i;
      while (j < code.length && /[0-9a-fA-FxXoObB._]/.test(code[j])) j++;
      out += `<span class="tok-num">${escapeHtml(code.slice(i, j))}</span>`;
      i = j;
      continue;
    }

    if (isIdentStart(c)) {
      let j = i;
      while (j < code.length && isIdent(code[j])) j++;
      const word = code.slice(i, j);
      let k = j;
      while (k < code.length && code[k] === ' ') k++;
      const cls = KEYWORDS.has(word)
        ? 'tok-kw'
        : code[k] === '('
          ? 'tok-fn'
          : /^[A-Z]/.test(word)
            ? 'tok-cls'
            : '';
      out += cls ? `<span class="${cls}">${escapeHtml(word)}</span>` : escapeHtml(word);
      i = j;
      continue;
    }

    if (/[{}()[\];,.:?=<>!+\-*/%&|^~]/.test(c)) {
      out += `<span class="tok-pun">${escapeHtml(c)}</span>`;
      i++;
      continue;
    }

    out += escapeHtml(c);
    i++;
  }

  return out;
}
