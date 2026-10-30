// XML / HTML 通用的 DOM 小工具：只按 localName 匹配，避开 JATS 的命名空间前缀（mml:、xlink:、ali:）。

export const XLINK_NS = 'http://www.w3.org/1999/xlink';

export const ln = (el) => (el && (el.localName || el.nodeName || '').toLowerCase().replace(/^[a-z]+:/, '')) || '';

export function kids(el, ...names) {
  const all = Array.from((el && el.childNodes) || []).filter((n) => n.nodeType === 1);
  return names.length ? all.filter((n) => names.includes(ln(n))) : all;
}

export function child(el, ...names) {
  return kids(el, ...names)[0] || null;
}

export function findAll(el, ...names) {
  if (!el || !el.getElementsByTagName) return [];
  return Array.from(el.getElementsByTagName('*')).filter((n) => names.includes(ln(n)));
}

export function find(el, ...names) {
  if (!el || !el.getElementsByTagName) return null;
  const all = el.getElementsByTagName('*');
  for (let i = 0; i < all.length; i += 1) if (names.includes(ln(all[i]))) return all[i];
  return null;
}

export function attr(el, name) {
  if (!el || !el.getAttribute) return '';
  if (name === 'href') {
    return el.getAttributeNS && el.getAttributeNS(XLINK_NS, 'href')
      || el.getAttribute('xlink:href') || el.getAttribute('href') || '';
  }
  return el.getAttribute(name) || '';
}

export function textOf(el) {
  return ((el && el.textContent) || '').replace(/\s+/g, ' ').trim();
}

export function closestByName(el, ...names) {
  let cur = el && el.parentNode;
  while (cur && cur.nodeType === 1) {
    if (names.includes(ln(cur))) return cur;
    cur = cur.parentNode;
  }
  return null;
}

export function resolveUrl(href, base) {
  if (!href) return '';
  try {
    return new URL(href, base || undefined).href;
  } catch (_) {
    return /^https?:\/\//i.test(href) ? href : '';
  }
}
