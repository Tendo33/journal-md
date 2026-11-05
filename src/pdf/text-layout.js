// PDF 文字层 → Markdown（「快速解析」，不经过任何第三方服务）。纯函数，输入是 pdf.js 取出的文字片段：
//   pages: [{ width, height, items: [{ str, x, y, w, size, bold }] }]   （y 从页面底部往上量，同 PDF 坐标）
// 步骤：同一行的片段拼成行段（中间空得很开就拆成两段）→ 判断单栏 / 双栏，按阅读顺序排 → 去掉每页重复的页眉页脚和页码
//   → 按字号和编号认出标题 → 按行距分段、接上断词 → 图注、参考文献单独处理。
// 公式、表格只能保留成文字；要版面完整请用 PaddleOCR 解析。

const HEADING_MAX_CHARS = 120;
const REF_HEADING = /^(references?|bibliography|literature cited|works cited|参考文献)$/i;
const CAPTION = /^(fig(?:ure)?\.?|table|extended data fig(?:ure)?\.?|supplementary fig(?:ure)?\.?)\s*(S?\d+[A-Za-z]?)\s*[.:|]?/i;
const NUMBERED_HEADING = /^((?:\d+\.)*\d+)\.?\s+([A-Z][^.!?]{1,100})$/;
const KNOWN_HEADING = /^(abstract|introduction|background|results?|discussion|conclusions?|methods?|materials and methods|methods and materials|experimental( section| procedures)?|acknowledge?ments?|funding|author contributions|competing interests|conflicts? of interest|data availability|code availability|supplementary (information|material)|references?|bibliography)$/i;

const round = (n) => Math.round(n * 2) / 2;

/**
 * 同一页的片段 → 行段：y 相近的放一行；行内两个片段之间空隙超过 2.5 个字宽就拆开。
 * 双栏之间的空隙常常不到 2.5 个字宽（会议论文约 2 个字宽）：空隙跨过页面中线、又超过 1 个字宽时也拆开
 */
export function segmentsOfPage(page) {
  const mid = (page.width || 0) / 2;
  const items = (page.items || []).filter((it) => it && typeof it.str === 'string' && it.str.length && it.size > 0);
  const sorted = items.slice().sort((a, b) => (b.y - a.y) || (a.x - b.x));
  const lines = [];
  for (const it of sorted) {
    const line = lines.find((l) => Math.abs(l.y - it.y) <= Math.max(l.size, it.size) * 0.45);
    if (line) { line.items.push(it); line.size = Math.max(line.size, it.size); } else lines.push({ y: it.y, size: it.size, items: [it] });
  }
  const segs = [];
  for (const line of lines) {
    const its = line.items.sort((a, b) => a.x - b.x);
    let cur = null;
    for (const it of its) {
      const gap = cur ? it.x - cur.x1 : 0;
      const em = cur ? Math.max(cur.size, it.size) : 0;
      const acrossMiddle = cur && mid && cur.x1 <= mid + em && it.x >= mid - em && gap > em;
      if (!cur || gap > em * 2.5 || acrossMiddle) {
        if (cur) segs.push(cur);
        cur = { x0: it.x, x1: it.x + (it.w || 0), y: line.y, size: it.size, parts: [it], chars: 0, boldChars: 0 };
      } else {
        cur.x1 = Math.max(cur.x1, it.x + (it.w || 0));
        cur.size = Math.max(cur.size, it.size);
        cur.parts.push(it);
      }
    }
    if (cur) segs.push(cur);
  }
  for (const s of segs) {
    let text = '';
    let prevEnd = null;
    for (const p of s.parts) {
      // 片段之间有空隙、两边又都没有空格时补一个空格
      if (prevEnd !== null && p.x - prevEnd > p.size * 0.15 && !/\s$/.test(text) && !/^\s/.test(p.str)) text += ' ';
      text += p.str;
      prevEnd = p.x + (p.w || 0);
      const n = p.str.replace(/\s/g, '').length;
      s.chars += n;
      if (p.bold) s.boldChars += n;
    }
    s.text = text.replace(/\s+/g, ' ').trim();
    s.bold = s.chars > 0 && s.boldChars / s.chars > 0.6;
    delete s.parts;
  }
  return segs.filter((s) => s.text);
}

/**
 * 阅读顺序：双栏页面按「横跨两栏的行」切成若干带，每带先左栏后右栏；单栏页面从上到下。
 * 双栏的判断：左右两半各有不少行段，横跨中线的行段很少。
 */
export function orderSegments(segs, width) {
  const mid = width / 2;
  const spans = (s) => s.x0 < mid - width * 0.03 && s.x1 > mid + width * 0.03;
  const left = segs.filter((s) => s.x1 <= mid + width * 0.03);
  const right = segs.filter((s) => s.x0 >= mid - width * 0.03);
  const spanning = segs.filter(spans);
  const twoCol = left.length >= 5 && right.length >= 5 && spanning.length < (left.length + right.length) * 0.25;
  const byY = (a, b) => (b.y - a.y) || (a.x0 - b.x0);
  if (!twoCol) return { segs: segs.slice().sort(byY), twoCol };
  const out = [];
  let band = [];
  const flush = () => {
    out.push(...band.filter((s) => s.x0 < mid - width * 0.03 || s.x1 <= mid + width * 0.03).sort(byY));
    out.push(...band.filter((s) => !(s.x0 < mid - width * 0.03 || s.x1 <= mid + width * 0.03)).sort(byY));
    band = [];
  };
  for (const s of segs.slice().sort(byY)) {
    if (spans(s)) { flush(); out.push(s); } else band.push(s);
  }
  flush();
  return { segs: out, twoCol };
}

/** 页眉页脚：页面最上 / 最下 8% 里、在至少 40% 的页面上重复出现（数字不计）的行段，以及单独的页码 */
export function repeatedMarginLines(pages) {
  if (pages.length < 3) return new Set();
  const count = new Map();
  for (const p of pages) {
    const seen = new Set();
    for (const s of p.segs) {
      if (s.y < p.height * 0.92 && s.y > p.height * 0.08) continue;
      const key = s.text.replace(/\d+/g, '#').toLowerCase();
      if (!seen.has(key)) { seen.add(key); count.set(key, (count.get(key) || 0) + 1); }
    }
  }
  return new Set([...count].filter(([, n]) => n >= Math.max(2, pages.length * 0.4)).map(([k]) => k));
}

/** 正文字号：按字数加权的众数 */
export function bodySize(segs) {
  const w = new Map();
  for (const s of segs) w.set(round(s.size), (w.get(round(s.size)) || 0) + s.chars);
  let best = 10;
  let max = -1;
  for (const [size, n] of w) if (n > max) { max = n; best = size; }
  return best;
}

function headingLevel(s, body, sizes) {
  const num = s.text.match(NUMBERED_HEADING);
  if (num) return Math.min(4, 1 + num[1].split('.').length);
  // 不编号的常见节名（Abstract、References…）和一级编号节同级
  if (KNOWN_HEADING.test(s.text.replace(/[:.]$/, ''))) return 2;
  const idx = sizes.findIndex((x) => x <= round(s.size));
  return Math.min(4, 2 + Math.max(0, idx));
}

/** 同一栏里紧挨着的上一行 / 下一行（双栏页面上按阅读顺序的前一段可能在另一栏） */
const sameColumn = (a, b, width) => a && b && a.page === b.page && Math.abs(a.x0 - b.x0) < width * 0.2;

function isHeading(s, body, prev, next, width) {
  const t = s.text;
  if (t.length > HEADING_MAX_CHARS || /[,;]$/.test(t)) return false;
  if (CAPTION.test(t)) return false;
  const bigger = s.size >= body * 1.12;
  const standalone = (!sameColumn(prev, s, width) || prev.y - s.y > s.size * 1.6) && (!sameColumn(next, s, width) || s.y - next.y > s.size * 1.3);
  if (bigger && t.length <= HEADING_MAX_CHARS && /[A-Za-z一-鿿]/.test(t)) return true;
  if (KNOWN_HEADING.test(t.replace(/^[\d.\s]+/, '').replace(/[:.]$/, ''))) return s.bold || standalone || s.size >= body * 1.05;
  // 编号标题（「3.2. Identity Mapping」）：粗体、单独成行，或者字号略大于正文（会议论文的小节标题只大一号、字体名看不出粗体）
  if (NUMBERED_HEADING.test(t) && (s.bold || standalone || s.size >= body * 1.05) && t.length <= 90) return true;
  return false;
}

/** 把上一行和这一行接起来：行尾连字符 + 下一行小写开头 → 去掉连字符 */
function joinLine(text, next) {
  if (/[A-Za-z]-$/.test(text) && /^[a-z]/.test(next)) return text.slice(0, -1) + next;
  return `${text} ${next}`;
}

/**
 * @param {{width:number, height:number, items:object[]}[]} rawPages
 * 第一页上的论文标题不输出（导出时用文章页的题录写标题）
 * @returns {{ markdown:string, pages:number, chars:number, twoColumn:boolean, headings:number, refs:number }}
 */
export function layoutPdfText(rawPages) {
  const pages = rawPages.map((p, i) => {
    const ordered = orderSegments(segmentsOfPage(p), p.width);
    return { width: p.width, height: p.height, twoCol: ordered.twoCol, segs: ordered.segs.map((s) => ({ ...s, page: i })) };
  });
  const margin = repeatedMarginLines(pages);
  const all = [];
  for (const p of pages) {
    for (const s of p.segs) {
      const inMargin = s.y >= p.height * 0.92 || s.y <= p.height * 0.08;
      if (inMargin && (margin.has(s.text.replace(/\d+/g, '#').toLowerCase()) || /^\d{1,4}$/.test(s.text))) continue;
      all.push(s);
    }
  }
  const body = bodySize(all);
  // 论文标题：第一页上半部分最大的字号（明显大于正文）。题录里已经有标题，这几行不输出，也不参与标题分级。
  // 标题和摘要之间的作者、单位也不输出（题录里有作者）：第一页上、第一个「Abstract / Introduction」之前、非正文字号的行
  const height0 = pages[0] ? pages[0].height : 0;
  const top = all.filter((s) => s.page === 0 && s.y > height0 * 0.5);
  const topMax = top.length ? Math.max(...top.map((s) => s.size)) : 0;
  const titleSize = topMax > body * 1.3 ? topMax : 0;
  const firstKnown = all.findIndex((s) => s.page === 0 && KNOWN_HEADING.test(s.text.replace(/^[\d.\s]+/, '').replace(/[:.]$/, '')));
  const isTitleLine = (s, i) => s.page === 0 && ((titleSize && s.size >= titleSize - 0.5 && s.y > height0 * 0.5)
    || (firstKnown > 0 && i < firstKnown && s.y > height0 * 0.5 && Math.abs(round(s.size) - body) >= 0.5 && s.size < titleSize - 0.5));
  const headingSizes = [...new Set(all.filter((s, i) => s.size >= body * 1.12 && !isTitleLine(s, i)).map((s) => round(s.size)))].sort((a, b) => b - a);

  const blocks = [];
  let para = null;
  let inRefs = false;
  const flush = () => { if (para) { blocks.push(para); para = null; } };
  for (let i = 0; i < all.length; i++) {
    const s = all[i];
    const prev = all[i - 1];
    const next = all[i + 1];
    if (isTitleLine(s, i)) continue;
    if (!inRefs && isHeading(s, body, prev, next, pages[s.page].width)) {
      // 跨行的大字号标题：和上一行同字号、紧挨着 → 接在一起
      const last = blocks[blocks.length - 1];
      if (!para && last && last.type === 'heading' && prev && Math.abs(prev.size - s.size) < 0.5 && prev.page === s.page && prev.y - s.y < s.size * 1.6 && s.size >= body * 1.12) {
        last.text = `${last.text} ${s.text}`;
        continue;
      }
      flush();
      const text = s.text.replace(/[:.]$/, '');
      blocks.push({ type: 'heading', level: headingLevel(s, body, headingSizes), text });
      inRefs = REF_HEADING.test(text.replace(/^[\d.\s]+/, ''));
      continue;
    }
    if (inRefs) {
      // 参考文献：「1.」「[1]」开头或者悬挂缩进的第一行开始新条目
      const startsRef = /^(\[\d+\]|\d+\.)\s/.test(s.text) || (para && prev && s.x0 < prev.x0 - s.size * 0.8);
      if (!para || startsRef || prev.page !== s.page && /^(\[\d+\]|\d+\.)\s/.test(s.text)) { flush(); para = { type: 'ref', text: s.text, last: s }; } else { para.text = joinLine(para.text, s.text); para.last = s; }
      continue;
    }
    const caption = CAPTION.test(s.text) && (!para || prev.y - s.y > s.size * 1.3 || prev.page !== s.page);
    const gap = para && para.last.page === s.page ? para.last.y - s.y : 0;
    const newPara = !para || caption || (para.last.page === s.page && gap > Math.max(para.last.size, s.size) * 1.75)
      || Math.abs(round(para.last.size) - round(s.size)) >= 1.5;
    if (newPara) {
      flush();
      para = { type: caption ? 'caption' : 'paragraph', text: s.text, last: s };
    } else {
      para.text = joinLine(para.text, s.text);
      para.last = s;
    }
  }
  flush();

  const md = [];
  let refs = 0;
  for (const b of blocks) {
    if (b.type === 'heading') md.push(`${'#'.repeat(b.level)} ${b.text}`);
    else if (b.type === 'caption') {
      const m = b.text.match(CAPTION);
      md.push(`> **${m[0].trim().replace(/[.:|]$/, '')}** ${b.text.slice(m[0].length).trim()}`.trimEnd());
    } else if (b.type === 'ref') {
      refs += 1;
      md.push(`- ${b.text.replace(/^(\[\d+\]|\d+\.)\s*/, '')}`);
    } else md.push(b.text);
  }
  // 连续的参考文献条目之间不空行（Markdown 列表）
  const markdown = md.join('\n\n').replace(/\n\n(?=- )/g, (m, off, str) => (str.slice(0, off).split('\n').pop().startsWith('- ') ? '\n' : m));
  return {
    markdown,
    pages: pages.length,
    chars: all.reduce((n, s) => n + s.chars, 0),
    twoColumn: pages.filter((p) => p.twoCol).length > pages.length / 2,
    headings: blocks.filter((b) => b.type === 'heading').length,
    refs,
  };
}
