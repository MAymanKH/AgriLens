import { safeUrl } from './model.js';

// Build the supported Markdown as DOM nodes; model HTML is always literal text.
function inline(parent, text, document, depth = 0) {
  if (depth >= 8) { parent.append(document.createTextNode(text)); return; }
  const tokens = /(`[^`\n]+`|\*\*[^\n]+?\*\*|__[^\n]+?__|\[[^\]\n]+\]\([^\s)]+\)|\*[^*\n]+\*|_[^_\n]+_)/g;
  let end = 0;
  for (const match of text.matchAll(tokens)) {
    parent.append(document.createTextNode(text.slice(end, match.index)));
    const token = match[0];
    let element;
    if (token.startsWith('`')) {
      element = document.createElement('code'); element.textContent = token.slice(1, -1);
    } else if (token.startsWith('[')) {
      const split = token.indexOf('](');
      const label = token.slice(1, split), url = safeUrl(token.slice(split + 2, -1));
      element = document.createElement(url ? 'a' : 'span');
      if (url) { element.href = url; element.target = '_blank'; element.rel = 'noopener noreferrer'; }
      inline(element, label, document, depth + 1);
    } else {
      const strong = token.startsWith('**') || token.startsWith('__');
      element = document.createElement(strong ? 'strong' : 'em');
      inline(element, token.slice(strong ? 2 : 1, strong ? -2 : -1), document, depth + 1);
    }
    parent.append(element); end = match.index + token.length;
  }
  parent.append(document.createTextNode(text.slice(end)));
}

export function renderMarkdown(text, document = globalThis.document) {
  const fragment = document.createDocumentFragment();
  let paragraph, list, quote, code;
  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) {
      paragraph = list = quote = null;
      if (code) code = null;
      else { const pre = document.createElement('pre'); code = document.createElement('code'); pre.append(code); fragment.append(pre); }
      continue;
    }
    if (code) { code.append(document.createTextNode(`${line}\n`)); continue; }
    if (!line.trim()) { paragraph = list = quote = null; continue; }
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*$/);
    const item = line.match(/^\s*(?:([-+*])|\d+[.)])\s+(.+)$/);
    const quoted = line.match(/^\s*>\s?(.*)$/);
    if (heading) {
      paragraph = list = quote = null;
      const element = document.createElement(`h${Math.min(heading[1].length + 2, 6)}`);
      inline(element, heading[2], document); fragment.append(element);
    } else if (item) {
      paragraph = quote = null;
      const tag = item[1] ? 'ul' : 'ol';
      if (list?.localName !== tag) { list = document.createElement(tag); fragment.append(list); }
      const element = document.createElement('li'); inline(element, item[2], document); list.append(element);
    } else if (quoted) {
      paragraph = list = null;
      if (!quote) { quote = document.createElement('blockquote'); fragment.append(quote); }
      else quote.append(document.createElement('br'));
      inline(quote, quoted[1], document);
    } else {
      list = quote = null;
      if (!paragraph) { paragraph = document.createElement('p'); fragment.append(paragraph); }
      else paragraph.append(document.createElement('br'));
      inline(paragraph, line, document);
    }
  }
  return fragment;
}
