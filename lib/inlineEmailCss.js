/**
 * Inline class/tag CSS into style="" so Gmail/Outlook still render custom HTML emails.
 * Inbox clients often drop <style> from <head> or ignore body <style> blocks.
 */

function stripCssComments(css = '') {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, '');
}

function splitTopLevel(css, closeChar) {
  const openChar = closeChar === '}' ? '{' : '(';
  const parts = [];
  let current = '';
  let depth = 0;
  for (const ch of String(css || '')) {
    if (ch === openChar) depth += 1;
    if (ch === closeChar) depth = Math.max(0, depth - 1);
    if (ch === closeChar && depth === 0 && closeChar === '}') {
      current += ch;
      parts.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current);
  return parts;
}

function parseDeclarations(text = '') {
  const decls = {};
  String(text || '')
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
    .forEach((item) => {
      const idx = item.indexOf(':');
      if (idx < 1) return;
      const prop = item.slice(0, idx).trim().toLowerCase();
      const value = item.slice(idx + 1).trim();
      if (!prop || !value) return;
      if (/expression|javascript|behavior|-moz-binding/i.test(value)) return;
      decls[prop] = value;
    });
  return decls;
}

function declarationsToStyle(decls = {}) {
  return Object.entries(decls)
    .map(([prop, value]) => `${prop}:${value}`)
    .join(';');
}

function parseStyleAttr(style = '') {
  return parseDeclarations(String(style || '').replace(/&quot;/g, '"'));
}

function mergeDecls(base = {}, extra = {}, extraWins = true) {
  return extraWins ? { ...base, ...extra } : { ...extra, ...base };
}

function classifySelector(selector = '') {
  const value = String(selector || '').trim();
  if (!value || /[:@]|::|\[|>|\+|~/.test(value)) return null;
  if (/^#[A-Za-z][\w-]*$/.test(value)) return { type: 'id', value: value.slice(1) };
  if (/^\.[A-Za-z][\w-]*$/.test(value)) return { type: 'class', value: value.slice(1) };
  const descendant = value.match(/^\.[A-Za-z][\w-]*\s+\.([A-Za-z][\w-]*)$/);
  if (descendant) return { type: 'class', value: descendant[1] };
  if (/^[A-Za-z][\w-]*$/.test(value)) return { type: 'tag', value: value.toLowerCase() };
  const tagClass = value.match(/^([A-Za-z][\w-]*)\.([A-Za-z][\w-]*)$/);
  if (tagClass) return { type: 'tagClass', tag: tagClass[1].toLowerCase(), value: tagClass[2] };
  return null;
}

function extractAtMediaBlocks(css = '') {
  const source = String(css || '');
  const blocks = [];
  const re = /@media\b/gi;
  let match;
  while ((match = re.exec(source))) {
    const start = match.index;
    const brace = source.indexOf('{', start);
    if (brace < 0) break;
    let depth = 0;
    let end = -1;
    for (let i = brace; i < source.length; i += 1) {
      if (source[i] === '{') depth += 1;
      if (source[i] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    if (end > brace) {
      blocks.push(source.slice(start, end + 1));
      re.lastIndex = end + 1;
    }
  }
  return blocks;
}

export function extractCssRules(css = '') {
  const rules = [];
  let cleaned = stripCssComments(css).replace(/@(?:import|charset)[^;]+;/gi, '');
  extractAtMediaBlocks(cleaned).forEach((block) => {
    cleaned = cleaned.replace(block, '');
  });
  cleaned = cleaned.replace(/@(?:keyframes|supports|font-face)[^{]*\{[\s\S]*?\}\s*\}/gi, '');

  splitTopLevel(cleaned, '}').forEach((chunk) => {
    const match = chunk.match(/^([^{]+)\{([\s\S]*?)\}$/);
    if (!match) return;
    const decls = parseDeclarations(match[2]);
    if (!Object.keys(decls).length) return;
    String(match[1] || '')
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((selector) => {
        const parsed = classifySelector(selector);
        if (parsed) rules.push({ ...parsed, decls });
      });
  });
  return rules;
}

function collectStyleBlocks(html = '') {
  const blocks = [];
  const next = String(html || '').replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_, css) => {
    blocks.push(css);
    return '';
  });
  return { html: next, css: blocks.join('\n') };
}

function mergeStyleIntoAttrs(attrs = '', decls = {}) {
  let nextAttrs = String(attrs || '');
  const existingMatch = nextAttrs.match(/\sstyle\s*=\s*(["'])([\s\S]*?)\1/i);
  const existing = existingMatch ? parseStyleAttr(existingMatch[2]) : {};
  const merged = mergeDecls(decls, existing, true);
  const style = declarationsToStyle(merged);
  if (!style) return nextAttrs;
  if (existingMatch) {
    return nextAttrs.replace(existingMatch[0], ` style="${style.replace(/"/g, '&quot;')}"`);
  }
  return `${nextAttrs} style="${style.replace(/"/g, '&quot;')}"`;
}

function applyRule(html, rule) {
  if (rule.type === 'class' || rule.type === 'tagClass') {
    const className = rule.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tagPart = rule.type === 'tagClass' ? rule.tag : '[a-zA-Z][a-zA-Z0-9-]*';
    const re = new RegExp(`<(${tagPart})(\\s+[^>]*?)>`, 'gi');
    return String(html || '').replace(re, (full, tag, attrs) => {
      if (/\/>$/.test(full) && !attrs) return full;
      const classMatch = String(attrs).match(/\sclass\s*=\s*(["'])([\s\S]*?)\1/i);
      if (!classMatch) return full;
      const classes = String(classMatch[2] || '').split(/\s+/);
      if (!classes.includes(rule.value)) return full;
      return `<${tag}${mergeStyleIntoAttrs(attrs, rule.decls)}>`;
    });
  }

  if (rule.type === 'id') {
    const id = rule.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`<([a-zA-Z][a-zA-Z0-9-]*)(\\s+[^>]*\\sid=["']${id}["'][^>]*)>`, 'gi');
    return String(html || '').replace(re, (full, tag, attrs) => (
      `<${tag}${mergeStyleIntoAttrs(attrs, rule.decls)}>`
    ));
  }

  if (rule.type === 'tag') {
    const skip = new Set(['html', 'head', 'body', 'style', 'script', 'meta', 'link', 'title']);
    if (skip.has(rule.tag)) return html;
    const re = new RegExp(`<(${rule.tag})(\\s+[^>]*)?>`, 'gi');
    return String(html || '').replace(re, (full, tag, attrs = '') => (
      `<${tag}${mergeStyleIntoAttrs(attrs, rule.decls)}>`
    ));
  }

  return html;
}

function addOutlookWidths(html = '') {
  return String(html || '').replace(
    /<(td|th)([^>]*\sclass=["'][^"']*\bproduct-col\b[^"']*["'][^>]*)>/gi,
    (full, tag, attrs) => {
      if (/\swidth\s*=/i.test(attrs)) return full;
      return `<${tag} width="33%"${attrs}>`;
    },
  );
}

function hidePlaceholderImages(html = '') {
  return String(html || '')
    .replace(/<img\b([^>]*)>/gi, (full, attrs) => {
      const src = String(attrs).match(/\ssrc\s*=\s*(["'])([\s\S]*?)\1/i)?.[2] || '';
      if (/REPLACE_WITH_/i.test(src)) return '';
      return full;
    })
    .replace(/<a\b[^>]*href=["'][^"']*REPLACE_WITH_[^"']*["'][^>]*>\s*<\/a>/gi, '');
}

export function inlineEmailCss(html = '') {
  if (!html) return '';
  const collected = collectStyleBlocks(html);
  const rules = extractCssRules(collected.css);
  let next = collected.html;
  rules.forEach((rule) => {
    next = applyRule(next, rule);
  });
  next = addOutlookWidths(next);
  next = hidePlaceholderImages(next);

  const mediaOnly = extractAtMediaBlocks(stripCssComments(collected.css)).join('\n');
  if (mediaOnly) {
    next = `<style type="text/css">${mediaOnly}</style>${next}`;
  }
  return next;
}

export function wrapMarketingEmailDocument(html = '') {
  const raw = String(html || '').trim();
  if (!raw) return raw;
  if (/^<!doctype/i.test(raw) || /<html[\s>]/i.test(raw)) return raw;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
</head>
<body style="margin:0;padding:0;background:#f3f4f7;">
${raw}
</body>
</html>`;
}
