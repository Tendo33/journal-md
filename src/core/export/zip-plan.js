// ZIP 导出（article.md + images/）：给 IR 里的每个图片地址分配包内路径，渲染时链接改成本地路径（思路同 arxiv-md 的 ZIP 输出）。
// 下载失败的图片由调用方用 restoreRemoteImages 换回原网址，正文不留坏链接。

const EXT = /\.(jpe?g|png|gif|webp|svg|tiff?|bmp)$/i;

function walkInlines(inlines, add) {
  for (const n of inlines || []) {
    if (n.t === 'mathImage') add(n.src);
    if (n.c) walkInlines(n.c, add);
  }
}

function walkBlocks(blocks, add) {
  for (const b of blocks || []) {
    if (b.type === 'paragraph') walkInlines(b.inlines, add);
    else if (b.type === 'mathImage') add(b.src);
    else if (b.type === 'list') b.items.forEach((it) => walkBlocks(it, add));
    else if (b.type === 'quote') walkBlocks(b.blocks, add);
  }
}

function walkSections(sections, add) {
  for (const s of sections || []) {
    walkBlocks(s.blocks, add);
    walkSections(s.children, add);
  }
}

function fileName(url, index) {
  let base = '';
  try {
    const u = new URL(url);
    // iiif / 查询参数式地址（…/default.jpg、image?id=…g001）：取最有辨识度的一段
    const id = u.searchParams.get('id');
    base = id ? id.split('/').pop() : decodeURIComponent(u.pathname).split('/').filter(Boolean).slice(-1)[0] || '';
    if (/^default\.\w+$/.test(base)) base = decodeURIComponent(u.pathname).split('/').find((p) => /\.(tif|jpg|png)/i.test(p)) || base;
  } catch (_) { base = ''; }
  const ext = (base.match(EXT) || [])[1];
  const stem = base.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^[-.]+|[-.]+$/g, '').slice(0, 60) || 'image';
  const e = ext && !/^tiff?$/i.test(ext) ? ext.toLowerCase().replace('jpeg', 'jpg') : 'jpg';
  return `images/${String(index).padStart(2, '0')}-${stem}.${e}`;
}

/** @returns {Map<string,string>} 远程地址 → images/NN-name.ext（按出现顺序编号，同一地址只放一次） */
export function planAssets(ir) {
  const plan = new Map();
  const add = (src) => {
    if (!src || plan.has(src) || !/^https?:\/\//i.test(src)) return;
    plan.set(src, fileName(src, plan.size + 1));
  };
  walkSections(ir.abstract, add);
  walkSections(ir.sections, add);
  for (const f of ir.figures) { add(f.src); walkBlocks(f.caption, add); }
  for (const t of ir.tables) { add(t.src); walkBlocks(t.caption, add); t.rows.forEach((r) => r.cells.forEach((c) => walkInlines(c.inlines, add))); }
  const back = ir.back || {};
  for (const k of ['acknowledgements', 'dataAvailability', 'funding', 'competingInterests']) walkBlocks(back[k], add);
  walkSections(back.other, add);
  return plan;
}

/** 下载失败的图片：把正文里的本地路径换回原网址 */
export function restoreRemoteImages(markdown, failed) {
  let md = markdown;
  for (const { url, path } of failed) md = md.split(`](${path})`).join(`](${url.replace(/[()\s<>]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`)})`).split(`src="${path}"`).join(`src="${url}"`);
  return md;
}
