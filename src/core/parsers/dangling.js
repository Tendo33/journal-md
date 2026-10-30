// 「Extended data / is available for this paper at 10.1038/…」：Springer Nature 把句子的主语放在节标题里。
// JATS 和 PMC 页面（DOM）两条路共用（QA JM-09）。
import { inlinesToPlain } from '../article-ir';
import { normalizeDoi } from '../ids';

const DANGLING = /^\s*(is|are)\s+available\b/i;
const BARE_DOI = /\b(10\.\d{4,9}\/[^\s"<>]*[^\s"<>.,;:)\]])/g;

/** 文本里裸写的 DOI 变成链接（只用在补全后的句子上，不动正文其他地方） */
function linkifyDois(inlines) {
  const out = [];
  for (const n of inlines) {
    if (n.t !== 'text') { out.push(n); continue; }
    let last = 0;
    for (const m of n.v.matchAll(BARE_DOI)) {
      if (m.index > last) out.push({ t: 'text', v: n.v.slice(last, m.index) });
      const doi = normalizeDoi(m[1]);
      out.push({ t: 'link', href: `https://doi.org/${doi}`, c: [{ t: 'text', v: `https://doi.org/${doi}` }] });
      last = m.index + m[0].length;
    }
    if (last < n.v.length) out.push({ t: 'text', v: n.v.slice(last) });
  }
  return out;
}

/**
 * Springer Nature 的 JATS 常把主语放在节标题里：<title>Extended data</title><p>is available for this paper at 10.1038/…</p>。
 * 把标题补回句首，DOI 改成链接（QA JM-09）。
 */
export function completeDanglingSentence(title, blocks) {
  const first = blocks[0];
  if (!title || !first || first.type !== 'paragraph' || !first.inlines.length) return;
  const head = first.inlines[0];
  if (head.t !== 'text' || !DANGLING.test(head.v)) return;
  const subject = inlinesToPlain(title).replace(/^[\d.\s]+/, '').trim();
  if (!subject) return;
  blocks[0] = { ...first, inlines: linkifyDois([{ t: 'text', v: `${subject} ${head.v.replace(/^\s+/, '')}` }, ...first.inlines.slice(1)]) };
}


/** DOM 适配器的节树：每一节都补一遍 */
export function completeDanglingSections(sections) {
  for (const s of sections || []) {
    completeDanglingSentence(s.title, s.blocks);
    completeDanglingSections(s.children);
  }
}
