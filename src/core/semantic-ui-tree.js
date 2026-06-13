// semantic-ui-tree-clean-final-actions-no-text.js
// Clean rebuild. ESM, self-contained, safe for: page.evaluate(makeSemanticUiTree)
// Output schema uses `selectors: string[]` only. Actions never emit textContent fields.
// Usage:
//   import { makeSemanticUiTree } from './semantic-ui-tree-clean-final.js';
//   const tree = await page.evaluate(makeSemanticUiTree, { maxBytes: 30000 });

export function makeSemanticUiTree(options = {}) {
  const cfg = {
    maxActions: Number.isFinite(options.maxActions) ? options.maxActions : 100,
    maxRegions: Number.isFinite(options.maxRegions) ? options.maxRegions : 20,
    maxContentNodes: Number.isFinite(options.maxContentNodes) ? options.maxContentNodes : 120,
    maxSelectorsPerNode: Number.isFinite(options.maxSelectorsPerNode) ? options.maxSelectorsPerNode : 3,
    maxBytes: Number.isFinite(options.maxBytes) ? options.maxBytes : 30000,
    strictMaxBytes: options.strictMaxBytes === true,
    labelLimit: Number.isFinite(options.labelLimit) ? options.labelLimit : 90,
    textPreviewLimit: Number.isFinite(options.textPreviewLimit) ? options.textPreviewLimit : 20,
    contentTextLimit: Number.isFinite(options.contentTextLimit) ? options.contentTextLimit : 5000,
    includeRegionForContent: options.includeRegionForContent !== false,
  };

  const ACTION_CSS = [
    'button',
    'a[href]',
    'input',
    'textarea',
    'select',
    '[contenteditable="true"]',
    '[role="button"]',
    '[role="link"]',
    '[role="textbox"]',
    '[role="checkbox"]',
    '[role="radio"]',
    '[role="switch"]',
    '[role="tab"]',
    '[role="menuitem"]',
    '[role="option"]',
    '[onclick]',
  ].join(',');

  const REGION_CSS = [
    'main',
    'nav',
    'header',
    'footer',
    'aside',
    'form',
    'section[aria-label]',
    'article[aria-label]',
    'table[aria-label]',
    '[role="main"]',
    '[role="navigation"]',
    '[role="dialog"]',
    '[role="alertdialog"]',
    '[role="region"]',
    '[role="search"]',
    '[role="form"]',
  ].join(',');

  const CONTENT_CSS = [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'span',
    'label',
    'legend',
    'figcaption',
    'summary',
    'blockquote',
    'pre',
    'code',
    'li',
    'dt',
    'dd',
    'td',
    'th',
    'caption',
    'output',
    'input',
    'textarea',
    'select',
    'option',
    'article',
    'section',
    'main',
    'aside',
    'header',
    'footer',
    'nav',
    '[contenteditable="true"]',
    '[role="heading"]',
    '[role="paragraph"]',
    '[role="listitem"]',
    '[role="cell"]',
    '[role="rowheader"]',
    '[role="columnheader"]',
    '[role="status"]',
    '[role="alert"]',
    '[aria-live]',
  ].join(',');

  function isElement(x) {
    return x instanceof Element;
  }

  function cleanText(s, limit = Infinity) {
    if (s == null) return undefined;
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (!t) return undefined;
    return t.length > limit ? t.slice(0, Math.max(0, limit - 1)) + '…' : t;
  }

  function fullCleanText(s, limit = cfg.contentTextLimit) {
    if (s == null) return undefined;
    const t = String(s).replace(/\s+/g, ' ').trim();
    if (!t) return undefined;
    return t.length > limit ? t.slice(0, limit) : t;
  }

  function hasHiddenAncestor(el) {
    for (let n = el; isElement(n); n = n.parentElement) {
      if (n.hidden) return true;
      if (n.getAttribute('aria-hidden') === 'true') return true;
      const st = window.getComputedStyle(n);
      if (st.display === 'none' || st.visibility === 'hidden' || st.visibility === 'collapse') return true;
    }
    return false;
  }

  function isVisible(el) {
    if (!isElement(el) || hasHiddenAncestor(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (tag === 'input' && (el.getAttribute('type') || '').toLowerCase() === 'hidden') return false;
    const st = window.getComputedStyle(el);
    if (st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return false;
    const rect = el.getBoundingClientRect();
    return rect.width > 0 || rect.height > 0 || !!contentText(el, 20);
  }

  function cssString(value) {
    return JSON.stringify(String(value));
  }

  function cssIdent(value) {
    if (window.CSS && typeof window.CSS.escape === 'function') return window.CSS.escape(String(value));
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
  }

  function attr(name, value) {
    return `[${name}=${cssString(value)}]`;
  }

  function queryAll(css) {
    try {
      return Array.from(document.querySelectorAll(css));
    } catch {
      return [];
    }
  }

  function hitsExactly(css, el) {
    const hits = queryAll(css);
    return hits.length === 1 && hits[0] === el;
  }

  function addCandidate(list, css, score) {
    if (!css || list.some((x) => x.css === css)) return;
    list.push({ css, score });
  }

  function stableAttrValue(el, name, max = 180) {
    const raw = el.getAttribute(name);
    if (raw == null) return undefined;
    const value = String(raw).replace(/\s+/g, ' ').trim();
    if (!value || value.length > max) return undefined;
    return value;
  }

  function isStableId(id) {
    if (!id) return false;
    if (id.length > 80) return false;
    if (/^(:r|radix-|headlessui-|react-aria-|ember\d+|mui-|chakra-|mantine-|rc_|rc-)/i.test(id)) return false;
    if (/^[a-f0-9]{8,}$/i.test(id)) return false;
    if (/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) return false;
    if (/\d{8,}/.test(id)) return false;
    return true;
  }

  function stableClassTokens(el) {
    const cls = typeof el.className === 'string' ? el.className : '';
    if (!cls) return [];
    return cls
      .split(/\s+/)
      .filter(Boolean)
      .filter((c) => c.length <= 40)
      .filter((c) => !/^[a-z0-9_-]*[0-9a-f]{6,}[a-z0-9_-]*$/i.test(c))
      .filter((c) => !/^(active|selected|disabled|open|closed|focus|focused|hover|ng-|css-|sc-|jss|makeStyles|emotion-|__)/i.test(c))
      .slice(0, 3);
  }

  function directCssCandidates(el) {
    const tag = el.tagName.toLowerCase();
    const out = [];

    for (const a of ['data-testid', 'data-test-id', 'data-cy', 'data-test', 'data-qa', 'data-automation-id']) {
      const v = stableAttrValue(el, a);
      if (!v) continue;
      addCandidate(out, `${tag}${attr(a, v)}`, 100);
      addCandidate(out, attr(a, v), 98);
    }

    const id = stableAttrValue(el, 'id');
    if (isStableId(id)) {
      addCandidate(out, `${tag}#${cssIdent(id)}`, 96);
      addCandidate(out, `#${cssIdent(id)}`, 94);
    }

    const attrs = [
      'aria-label',
      'aria-labelledby',
      'name',
      'placeholder',
      'title',
      'alt',
      'role',
      'type',
      'value',
      'autocomplete',
      'href',
      'for',
    ];

    for (const a of attrs) {
      const v = stableAttrValue(el, a);
      if (!v) continue;
      let score = 60;
      if (a === 'aria-label' || a === 'aria-labelledby') score = 88;
      else if (['name', 'placeholder', 'title', 'alt', 'value'].includes(a)) score = 78;
      else if (a === 'href') score = 68;
      addCandidate(out, `${tag}${attr(a, v)}`, score);
    }

    const present = attrs.filter((a) => stableAttrValue(el, a));
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        addCandidate(out, `${tag}${attr(a, stableAttrValue(el, a))}${attr(b, stableAttrValue(el, b))}`, 86);
      }
    }

    const classes = stableClassTokens(el);
    if (classes.length) {
      addCandidate(out, `${tag}.${classes.map(cssIdent).join('.')}`, 55);
      for (const c of classes) addCandidate(out, `${tag}.${cssIdent(c)}`, 45);
    }

    return out.sort((a, b) => b.score - a.score || a.css.length - b.css.length);
  }

  function anchorCssCandidates(el) {
    return directCssCandidates(el)
      .filter((c) => hitsExactly(c.css, el))
      .sort((a, b) => b.score - a.score || a.css.length - b.css.length);
  }

  function childMatchesSegment(parent, child, segment) {
    try {
      const hits = Array.from(parent.children).filter((x) => x.matches(segment));
      return hits.length === 1 && hits[0] === child;
    } catch {
      return false;
    }
  }

  function segmentForChild(parent, child) {
    const tag = child.tagName.toLowerCase();
    for (const c of directCssCandidates(child)) {
      if (childMatchesSegment(parent, child, c.css)) return c.css;
    }
    if (childMatchesSegment(parent, child, tag)) return tag;
    const sameTag = Array.from(parent.children).filter((x) => x.tagName === child.tagName);
    const index = sameTag.indexOf(child) + 1;
    return `${tag}:nth-of-type(${index})`;
  }

  function pathFromAnchor(el, anchorEl, anchorCss) {
    const parts = [];
    let cur = el;
    while (cur && cur !== anchorEl && cur !== document.documentElement) {
      const parent = cur.parentElement;
      if (!parent) return undefined;
      parts.unshift(segmentForChild(parent, cur));
      cur = parent;
    }
    if (cur !== anchorEl || !parts.length) return undefined;
    return `${anchorCss} > ${parts.join(' > ')}`;
  }

  function absolutePath(el) {
    const parts = [];
    let cur = el;
    while (cur && cur !== document.documentElement) {
      const parent = cur.parentElement;
      if (!parent) break;
      parts.unshift(segmentForChild(parent, cur));
      cur = parent;
    }
    parts.unshift('html');
    return parts.join(' > ');
  }

  function selectorsFor(el) {
    const out = [];

    for (const c of directCssCandidates(el)) {
      if (hitsExactly(c.css, el)) addCandidate(out, c.css, 2000 + c.score);
    }

    const ancestors = [];
    for (let a = el.parentElement, depth = 0; a && a !== document.body && a !== document.documentElement && depth < 8; a = a.parentElement, depth++) {
      ancestors.push({ el: a, depth });
    }

    for (const { el: anc, depth } of ancestors) {
      const anchors = anchorCssCandidates(anc).slice(0, 4);
      for (const anchor of anchors) {
        const css = pathFromAnchor(el, anc, anchor.css);
        if (css && hitsExactly(css, el)) addCandidate(out, css, 1000 + anchor.score - depth * 10);
      }
    }

    const abs = absolutePath(el);
    if (abs && hitsExactly(abs, el)) addCandidate(out, abs, 1);

    out.sort((a, b) => b.score - a.score || a.css.length - b.css.length);
    return out.slice(0, cfg.maxSelectorsPerNode).map((x) => x.css);
  }

  function textById(id) {
    const e = document.getElementById(id);
    if (!e || hasHiddenAncestor(e)) return undefined;
    return cleanText(e.innerText || e.textContent, cfg.labelLimit);
  }

  function textFromLabelledBy(el) {
    const ids = cleanText(el.getAttribute('aria-labelledby'), 500);
    if (!ids) return undefined;
    return cleanText(ids.split(/\s+/).map(textById).filter(Boolean).join(' '), cfg.labelLimit);
  }

  function isLabelableFormControl(el) {
    const tag = el.tagName.toLowerCase();
    return ['input', 'textarea', 'select', 'meter', 'progress', 'output'].includes(tag);
  }

  function associatedLabelText(el) {
    if (!isLabelableFormControl(el)) return undefined;

    const id = el.getAttribute('id');
    if (id) {
      const label = document.querySelector(`label[for=${cssString(id)}]`);
      if (label && !hasHiddenAncestor(label)) {
        const t = cleanText(label.innerText || label.textContent, cfg.labelLimit);
        if (t) return t;
      }
    }

    const wrapping = el.closest('label');
    if (wrapping && !hasHiddenAncestor(wrapping)) {
      const t = cleanText(wrapping.innerText || wrapping.textContent, cfg.labelLimit);
      if (t) return t;
    }

    const name = el.getAttribute('name');
    if (name) {
      const loose = document.querySelector(`label[for=${cssString(name)}]`);
      if (loose && !hasHiddenAncestor(loose)) {
        const t = cleanText(loose.innerText || loose.textContent, cfg.labelLimit);
        if (t) return t;
      }
    }

    let prev = el.previousElementSibling;
    for (let i = 0; prev && i < 3; i++, prev = prev.previousElementSibling) {
      if (prev.tagName && prev.tagName.toLowerCase() === 'label' && !hasHiddenAncestor(prev)) {
        const t = cleanText(prev.innerText || prev.textContent, cfg.labelLimit);
        if (t) return t;
      }
    }

    return undefined;
  }

  function ownText(el, limit = cfg.labelLimit) {
    const pieces = [];
    for (const node of el.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        pieces.push(node.textContent || '');
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const child = node;
        if (hasHiddenAncestor(child)) continue;
        const tag = child.tagName.toLowerCase();
        if (['script', 'style', 'svg', 'path', 'use'].includes(tag)) continue;
        if (child.matches && child.matches(ACTION_CSS)) continue;
        const txt = cleanText(child.innerText || child.textContent, 40);
        if (txt) pieces.push(txt);
      }
    }
    return cleanText(pieces.join(' '), limit);
  }

  function elementLabel(el) {
    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role');
    return cleanText(
      el.getAttribute('aria-label') ||
        textFromLabelledBy(el) ||
        associatedLabelText(el) ||
        el.getAttribute('placeholder') ||
        el.getAttribute('alt') ||
        el.getAttribute('title') ||
        (tag === 'input' ? el.getAttribute('name') : undefined) ||
        ownText(el) ||
        cleanText(el.innerText || el.textContent, cfg.labelLimit) ||
        el.getAttribute('data-testid') ||
        el.getAttribute('data-cy') ||
        el.id ||
        role ||
        tag,
      cfg.labelLimit
    );
  }

  function inferActionKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();

    if (role === 'textbox' || tag === 'textarea' || el.isContentEditable) return 'textbox';
    if (tag === 'input') {
      if (type === 'checkbox') return 'checkbox';
      if (type === 'radio') return 'radio';
      if (['submit', 'button', 'reset'].includes(type)) return 'button';
      return 'input';
    }
    if (tag === 'select') return 'select';
    if (tag === 'a' || role === 'link') return 'link';
    if (role === 'checkbox') return 'checkbox';
    if (role === 'radio') return 'radio';
    if (role === 'switch') return 'checkbox';
    if (role === 'tab') return 'tab';
    if (role === 'menuitem') return 'menuitem';
    if (role === 'option') return 'option';
    return 'button';
  }

  function isTextEditable(el) {
    const tag = el.tagName.toLowerCase();
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (el.hasAttribute('disabled') || el.hasAttribute('readonly')) return false;
    if (el.isContentEditable) return true;
    if (tag === 'textarea') return true;
    if (tag === 'input') {
      return !['button', 'submit', 'reset', 'checkbox', 'radio', 'hidden', 'file', 'image', 'range', 'color'].includes(type);
    }
    return (el.getAttribute('role') || '').toLowerCase() === 'textbox';
  }

  function elementState(el, kind) {
    const s = [];
    if (document.activeElement === el) s.push('focused');
    if (el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true') s.push('disabled');
    if (el.hasAttribute('readonly')) s.push('readonly');
    if (isTextEditable(el)) s.push('editable');
    if ((kind === 'checkbox' || kind === 'radio') && (el.checked || el.getAttribute('aria-checked') === 'true')) s.push('checked');
    if (el.getAttribute('aria-selected') === 'true') s.push('selected');
    if (el.getAttribute('aria-expanded') === 'true') s.push('expanded');
    if (el.getAttribute('aria-expanded') === 'false') s.push('collapsed');
    return s.length ? s : undefined;
  }

  function inputValue(el) {
    if (!('value' in el)) return undefined;
    const value = fullCleanText(el.value, cfg.contentTextLimit);
    if (!value) return undefined;
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['checkbox', 'radio'].includes(type) && value === 'on') return undefined;
    return value;
  }

  function selectedText(select) {
    const selected = Array.from(select.selectedOptions || []);
    const text = selected.map((o) => o.innerText || o.textContent || o.value).filter(Boolean).join(', ');
    return fullCleanText(text || select.value, cfg.contentTextLimit);
  }

  function contentText(el, limit = cfg.contentTextLimit) {
    if (!isElement(el)) return undefined;
    const tag = el.tagName.toLowerCase();

    if (tag === 'input') return fullCleanText(el.value || el.getAttribute('value'), limit);
    if (tag === 'textarea') return fullCleanText(el.value || el.innerText || el.textContent, limit);
    if (tag === 'select') return fullCleanText(selectedText(el), limit);
    if (tag === 'option') return fullCleanText(el.innerText || el.textContent || el.value, limit);
    if (el.isContentEditable) return fullCleanText(el.innerText || el.textContent, limit);

    if (['section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(tag)) {
      return fullCleanText(ownText(el, limit), limit);
    }

    return fullCleanText(el.innerText || el.textContent, limit);
  }

  function addTextFields(out, text) {
    const t = fullCleanText(text, cfg.contentTextLimit);
    if (!t) return;
    if (t.length <= cfg.textPreviewLimit) {
      out.textContent = t;
    } else {
      out.textContentPreview = t.slice(0, cfg.textPreviewLimit);
      out.textContentLength = t.length;
    }
  }

  function regionRole(el) {
    if (!el) return undefined;
    const role = el.getAttribute('role');
    if (role) return role;
    const tag = el.tagName.toLowerCase();
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'form') return 'form';
    if (tag === 'section') return 'section';
    if (tag === 'article') return 'article';
    if (tag === 'table') return 'table';
    return tag;
  }

  function firstHeadingText(root) {
    if (!root) return undefined;
    const h = root.querySelector('h1,h2,h3,h4,h5,h6,[role="heading"]');
    if (!h || hasHiddenAncestor(h)) return undefined;
    return cleanText(h.innerText || h.textContent, cfg.labelLimit);
  }

  function regionLabel(el) {
    if (!el) return undefined;
    return cleanText(
      el.getAttribute('aria-label') ||
        textFromLabelledBy(el) ||
        firstHeadingText(el) ||
        (el.tagName.toLowerCase() === 'form' ? el.getAttribute('id') : undefined) ||
        regionRole(el),
      cfg.labelLimit
    );
  }

  function contentLabel(el) {
    // Content nodes must not reuse elementLabel().
    // elementLabel() is intentionally aggressive for actions, but for content
    // it can turn large subtree text into a misleading/huge label.
    // Only emit a label when the DOM provides a real explicit label.
    if (!el) return undefined;

    const aria = cleanText(el.getAttribute('aria-label'), cfg.labelLimit);
    if (aria) return aria;

    const labelledBy = textFromLabelledBy(el);
    if (labelledBy) return labelledBy;

    const title = cleanText(el.getAttribute('title'), cfg.labelLimit);
    if (title) return title;

    const alt = cleanText(el.getAttribute('alt'), cfg.labelLimit);
    if (alt) return alt;

    return undefined;
  }

  function findRegion(el) {
    const dialog = el.closest('[role="dialog"],[role="alertdialog"],dialog[open]');
    if (dialog && isVisible(dialog)) return dialog;

    let cur = el.parentElement;
    while (cur && cur !== document.body && cur !== document.documentElement) {
      if (cur.matches(REGION_CSS) && isVisible(cur)) return cur;
      cur = cur.parentElement;
    }
    return undefined;
  }

  const regionMap = new Map();
  const regions = [];

  function regionIdFor(el) {
    const region = findRegion(el);
    if (!region) return undefined;
    if (regionMap.has(region)) return regionMap.get(region);
    if (regions.length >= cfg.maxRegions) return undefined;

    const id = `r${regions.length + 1}`;
    regionMap.set(region, id);
    regions.push({ id, role: regionRole(region), label: regionLabel(region) });
    return id;
  }

  function isProbablyOccluded(el) {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return true;
    const points = [
      [rect.left + rect.width / 2, rect.top + rect.height / 2],
      [rect.left + Math.min(rect.width - 1, 6), rect.top + Math.min(rect.height - 1, 6)],
      [rect.right - Math.min(rect.width - 1, 6), rect.bottom - Math.min(rect.height - 1, 6)],
    ];
    for (const [x, y] of points) {
      if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) continue;
      const top = document.elementFromPoint(x, y);
      if (top && (top === el || el.contains(top))) return false;
    }
    return true;
  }

  function submitHintFor(el) {
    if (!isTextEditable(el)) return undefined;
    const form = el.closest('form');
    const label = `${elementLabel(el) || ''} ${form?.getAttribute('role') || ''} ${form?.getAttribute('aria-label') || ''}`.toLowerCase();
    if (/search|tìm kiếm|tim kiem/.test(label)) return 'Enter';
    if (document.activeElement === el && inputValue(el) && form) return 'Enter';
    return undefined;
  }

  function actionScore(item, el) {
    let s = 0;
    const activeDialog = document.querySelector('[role="dialog"],[role="alertdialog"],dialog[open]');
    if (activeDialog) s += activeDialog.contains(el) ? 300 : -80;
    if (document.activeElement === el) s += 150;
    if (item.state && item.state.includes('editable')) s += 80;
    if (item.label) s += 35;
    if (item.region) s += 15;
    if (item.state && item.state.includes('disabled')) s -= 80;
    if (item.state && item.state.includes('occluded')) s -= 120;
    return s;
  }

  function contentKind(el) {
    const tag = el.tagName.toLowerCase();
    const role = (el.getAttribute('role') || '').toLowerCase();
    if (/^h[1-6]$/.test(tag) || role === 'heading') return 'heading';
    if (tag === 'p' || role === 'paragraph') return 'paragraph';
    if (tag === 'label') return 'label';
    if (tag === 'li' || role === 'listitem') return 'listitem';
    if (['td', 'th'].includes(tag) || ['cell', 'rowheader', 'columnheader'].includes(role)) return 'cell';
    if (tag === 'input') return 'input';
    if (tag === 'textarea' || role === 'textbox' || el.isContentEditable) return 'textbox';
    if (tag === 'select') return 'select';
    if (tag === 'option') return 'option';
    if (tag === 'blockquote') return 'quote';
    if (tag === 'pre' || tag === 'code') return 'code';
    if (['section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(tag)) return regionRole(el) || tag;
    if (role) return role;
    return tag;
  }

  function contentScore(item, el) {
    const tag = el.tagName.toLowerCase();
    let s = 0;
    if (/^h[1-6]$/.test(tag) || item.kind === 'heading') s += 100;
    if (['p', 'li', 'td', 'th', 'label'].includes(tag)) s += 70;
    if (['input', 'textarea', 'select'].includes(tag) || el.isContentEditable) s += 60;
    if (item.region) s += 10;
    if (item.textContent) s += 10;
    if (item.textContentPreview) s += 5;
    if (['section', 'article', 'main', 'aside', 'header', 'footer', 'nav'].includes(tag)) s -= 20;
    return s;
  }

  const rawActions = Array.from(document.querySelectorAll(ACTION_CSS)).filter((el) => {
    if (!isVisible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (['svg', 'path', 'use'].includes(tag)) return false;
    const parentAction = el.parentElement && el.parentElement.closest(ACTION_CSS);
    return !(parentAction && parentAction !== el && parentAction.contains(el));
  });

  const actions = [];
  const seenActions = new Set();

  for (const el of rawActions) {
    const selectors = selectorsFor(el);
    if (!selectors.length) continue;

    const kind = inferActionKind(el);
    const item = { id: '', kind };
    const label = elementLabel(el);
    const value = inputValue(el);
    const state = elementState(el, kind);
    const region = regionIdFor(el);
    const sub = submitHintFor(el);

    if (label) item.label = label;
    if (value) item.value = value;
    item.selectors = selectors;
    if (sub) item.sub = sub;
    if (region) item.region = region;

    let finalState = state;
    if (!isTextEditable(el) && isProbablyOccluded(el)) finalState = [...(finalState || []), 'occluded'];
    if (finalState) item.state = finalState;

    const key = `${kind}|${selectors[0]}|${label || ''}|${region || ''}`;
    if (seenActions.has(key)) continue;
    seenActions.add(key);

    item._score = actionScore(item, el);
    actions.push(item);
  }

  actions.sort((a, b) => b._score - a._score);
  const limitedActions = actions.slice(0, cfg.maxActions).map((a, i) => {
    const out = { ...a, id: `a${i + 1}` };
    delete out._score;
    return out;
  });

  const actionElements = new Set(rawActions);
  const rawContent = Array.from(document.querySelectorAll(CONTENT_CSS)).filter((el) => {
    if (!isVisible(el)) return false;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'svg', 'path', 'use'].includes(tag)) return false;
    const text = contentText(el);
    if (!text) return false;
    return true;
  });

  const content = [];
  const seenContent = new Set();

  for (const el of rawContent) {
    const text = contentText(el);
    if (!text) continue;

    const selectors = selectorsFor(el);
    if (!selectors.length) continue;

    const item = { id: '', kind: contentKind(el), selectors };
    const label = contentLabel(el);
    if (label) item.label = label;
    addTextFields(item, text);

    if (cfg.includeRegionForContent) {
      const region = regionIdFor(el);
      if (region) item.region = region;
    }

    if (actionElements.has(el)) item.actionLinked = true;

    const key = `${selectors[0]}|${item.textContent || item.textContentPreview || ''}`;
    if (seenContent.has(key)) continue;
    seenContent.add(key);

    item._score = contentScore(item, el);
    content.push(item);
  }

  content.sort((a, b) => b._score - a._score);
  const limitedContent = content.slice(0, cfg.maxContentNodes).map((c, i) => {
    const out = { ...c, id: `c${i + 1}` };
    delete out._score;
    return out;
  });

  function syncRegions(result) {
    const used = new Set();
    for (const a of result.actions || []) if (a.region) used.add(a.region);
    for (const c of result.content || []) if (c.region) used.add(c.region);
    result.regions = result.regions.filter((r) => used.has(r.id));
    result.stats.emittedRegions = result.regions.length;
  }

  function byteLen(obj) {
    return new Blob([JSON.stringify(obj)]).size;
  }

  const focus = limitedActions.find((a) => Array.isArray(a.state) && a.state.includes('focused'));

  const result = {
    page: {
      title: document.title || undefined,
      url: location.href,
    },
    regions,
    actions: limitedActions,
    content: limitedContent,
    stats: {
      rawCandidates: rawActions.length,
      emittedActions: limitedActions.length,
      rawContentCandidates: rawContent.length,
      emittedContentNodes: limitedContent.length,
      emittedRegions: regions.length,
    },
  };

  if (focus) {
    result.focus = {
      actionId: focus.id,
      label: focus.label,
      selectors: focus.selectors,
    };
  }

  syncRegions(result);
  result.stats.bytesBeforeTrim = byteLen(result);

  if (cfg.strictMaxBytes) {
    while (byteLen(result) > cfg.maxBytes && result.content.length > 0) {
      result.content.pop();
      result.stats.emittedContentNodes = result.content.length;
      syncRegions(result);
    }
    while (byteLen(result) > cfg.maxBytes && result.actions.length > 8) {
      result.actions.pop();
      result.stats.emittedActions = result.actions.length;
      syncRegions(result);
    }
    if (byteLen(result) > cfg.maxBytes) delete result.page.title;
  }

  result.stats.bytes = byteLen(result);
  return result;
}

export default makeSemanticUiTree;
