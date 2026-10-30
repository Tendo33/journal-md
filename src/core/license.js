// 许可证 URL / 文本 → 简短标识（CC-BY-4.0 之类，接近 SPDX）。认不出时返回原 URL 或截断的文本。

export function normalizeLicense(value) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  const url = s.match(/creativecommons\.org\/(licenses|publicdomain)\/([a-z-]+)\/(\d\.\d)/i);
  if (url) {
    if (url[1].toLowerCase() === 'publicdomain') return url[2].toLowerCase() === 'zero' ? `CC0-${url[3]}` : 'Public-Domain';
    return `CC-${url[2].toUpperCase()}-${url[3]}`;
  }
  const text = s.match(/\bCC[\s-]?(BY(?:[\s-](?:NC|SA|ND))*)(?:[\s-]+(\d\.\d))?/i);
  if (text) {
    const kind = text[1].toUpperCase().replace(/\s/g, '-');
    return `CC-${kind}${text[2] ? `-${text[2]}` : ''}`;
  }
  if (/creative commons attribution/i.test(s)) {
    const ver = (s.match(/(\d\.\d)/) || [])[1];
    const parts = ['BY'];
    if (/non-?commercial/i.test(s)) parts.push('NC');
    if (/no ?deriv/i.test(s)) parts.push('ND');
    if (/share ?alike/i.test(s)) parts.push('SA');
    return `CC-${parts.join('-')}${ver ? `-${ver}` : ''}`;
  }
  if (/\bCC0\b|public domain dedication/i.test(s)) return 'CC0-1.0';
  if (/^https?:\/\//.test(s)) return s;
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}
