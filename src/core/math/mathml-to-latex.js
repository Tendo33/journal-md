// MathML → LaTeX。按 PRD §2.3 的优先级：TeX 源码（annotation）> MathML 转换 > alttext > 文本。
// 只依赖 DOM 的 localName / childNodes，HTML 里的 <math> 和 JATS 里的 <mml:math> 都能用。
// arxiv-md 只读 alttext/annotation（src/content/ar5iv-math.js），这里补上逐元素转换。

const GREEK = {
  'α': '\\alpha', 'β': '\\beta', 'γ': '\\gamma', 'δ': '\\delta', 'ε': '\\varepsilon', 'ϵ': '\\epsilon',
  'ζ': '\\zeta', 'η': '\\eta', 'θ': '\\theta', 'ϑ': '\\vartheta', 'ι': '\\iota', 'κ': '\\kappa',
  'λ': '\\lambda', 'μ': '\\mu', 'ν': '\\nu', 'ξ': '\\xi', 'π': '\\pi', 'ϖ': '\\varpi', 'ρ': '\\rho',
  'ϱ': '\\varrho', 'σ': '\\sigma', 'ς': '\\varsigma', 'τ': '\\tau', 'υ': '\\upsilon', 'φ': '\\varphi',
  'ϕ': '\\phi', 'χ': '\\chi', 'ψ': '\\psi', 'ω': '\\omega',
  'Γ': '\\Gamma', 'Δ': '\\Delta', 'Θ': '\\Theta', 'Λ': '\\Lambda', 'Ξ': '\\Xi', 'Π': '\\Pi',
  'Σ': '\\Sigma', 'Υ': '\\Upsilon', 'Φ': '\\Phi', 'Ψ': '\\Psi', 'Ω': '\\Omega',
  'ℓ': '\\ell', 'ℏ': '\\hbar', '∂': '\\partial', '∞': '\\infty', '∇': '\\nabla', '∅': '\\emptyset',
  'ℝ': '\\mathbb{R}', 'ℕ': '\\mathbb{N}', 'ℤ': '\\mathbb{Z}', 'ℚ': '\\mathbb{Q}', 'ℂ': '\\mathbb{C}',
};

const OPERATORS = {
  '∑': '\\sum', '∏': '\\prod', '∐': '\\coprod', '∫': '\\int', '∬': '\\iint', '∭': '\\iiint', '∮': '\\oint',
  '≤': '\\le', '≥': '\\ge', '≦': '\\leqq', '≧': '\\geqq', '≠': '\\neq', '±': '\\pm', '∓': '\\mp',
  '×': '\\times', '÷': '\\div', '·': '\\cdot', '⋅': '\\cdot', '∙': '\\bullet', '∗': '\\ast',
  '→': '\\to', '←': '\\leftarrow', '↔': '\\leftrightarrow', '⇒': '\\Rightarrow', '⇐': '\\Leftarrow',
  '⇔': '\\Leftrightarrow', '↦': '\\mapsto', '↑': '\\uparrow', '↓': '\\downarrow',
  '∈': '\\in', '∉': '\\notin', '∋': '\\ni', '⊂': '\\subset', '⊃': '\\supset', '⊆': '\\subseteq',
  '⊇': '\\supseteq', '∩': '\\cap', '∪': '\\cup', '∧': '\\wedge', '∨': '\\vee', '¬': '\\neg',
  '∀': '\\forall', '∃': '\\exists', '≈': '\\approx', '∼': '\\sim', '≃': '\\simeq', '≅': '\\cong',
  '≡': '\\equiv', '∝': '\\propto', '∘': '\\circ', '⊗': '\\otimes', '⊕': '\\oplus', '⊥': '\\perp',
  '∥': '\\parallel', '∣': '\\mid', '‖': '\\|', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle',
  '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil', '…': '\\ldots', '⋯': '\\cdots',
  '⋮': '\\vdots', '⋱': '\\ddots', '′': '\'', '″': '\'\'', '°': '^{\\circ}', '−': '-', '–': '-',
  '≪': '\\ll', '≫': '\\gg', '≺': '\\prec', '≻': '\\succ', '√': '\\surd', '∖': '\\setminus',
  '{': '\\{', '}': '\\}', '%': '\\%', '#': '\\#', '&': '\\&', '$': '\\$', '_': '\\_',
  '⁡': '', '⁢': '', '⁣': '', '⁤': '',
};

const FUNCTIONS = new Set(['sin', 'cos', 'tan', 'cot', 'sec', 'csc', 'sinh', 'cosh', 'tanh', 'coth',
  'arcsin', 'arccos', 'arctan', 'log', 'ln', 'lg', 'exp', 'max', 'min', 'sup', 'inf', 'lim', 'det',
  'dim', 'ker', 'deg', 'gcd', 'arg', 'Pr', 'hom']);

const BIG_OPS = new Set(['\\sum', '\\prod', '\\coprod', '\\int', '\\iint', '\\iiint', '\\oint', '\\lim',
  '\\max', '\\min', '\\sup', '\\inf', '\\bigcup', '\\bigcap']);

const ACCENTS_OVER = {
  '^': '\\hat', 'ˆ': '\\hat', '̂': '\\hat', '~': '\\tilde', '˜': '\\tilde', '̃': '\\tilde',
  '¯': '\\bar', '‾': '\\bar', '―': '\\bar', '̄': '\\bar', '_': '\\bar', '−': '\\bar',
  '˙': '\\dot', '̇': '\\dot', '¨': '\\ddot', '̈': '\\ddot', '→': '\\vec', '⃗': '\\vec',
  '⏞': '\\overbrace', '︷': '\\overbrace',
};
const ACCENTS_UNDER = { '_': '\\underline', '̲': '\\underline', '⏟': '\\underbrace', '︸': '\\underbrace' };

const VARIANTS = {
  bold: '\\mathbf', 'double-struck': '\\mathbb', script: '\\mathcal', fraktur: '\\mathfrak',
  'sans-serif': '\\mathsf', monospace: '\\mathtt', 'bold-italic': '\\boldsymbol', normal: '\\mathrm',
};

const name = (el) => (el.localName || el.nodeName || '').toLowerCase().replace(/^mml:/, '');
const elementChildren = (el) => Array.from(el.childNodes || []).filter((n) => n.nodeType === 1);

function mapChars(s, table) {
  let out = '';
  for (const ch of s) {
    if (Object.prototype.hasOwnProperty.call(table, ch)) out = joinTex([out, table[ch]]);
    else out += ch;
  }
  return out;
}

/** 拼接 TeX 片段：\alpha 后面紧跟字母时补空格，避免变成 \alphax */
export function joinTex(parts) {
  let out = '';
  for (const p of parts) {
    if (!p) continue;
    if ((/\\[a-zA-Z]+$/.test(out) || /[_^][A-Za-z0-9]$/.test(out)) && /^[a-zA-Z0-9]/.test(p)) out += ' ';
    out += p;
  }
  return out;
}

function group(tex) {
  const t = tex.trim();
  if (/^[A-Za-z0-9]$/.test(t) || /^\\[a-zA-Z]+$/.test(t)) return t;
  return `{${t}}`;
}

function textEscape(s) {
  return s.replace(/[\\{}$&#%_^~]/g, (c) => (c === '\\' ? '\\backslash ' : `\\${c}`));
}

function convertToken(el) {
  const raw = (el.textContent || '').replace(/\s+/g, ' ').trim();
  const tag = name(el);
  if (tag === 'mi') {
    if (!raw) return '';
    const variant = el.getAttribute && el.getAttribute('mathvariant');
    if (raw.length > 1 && FUNCTIONS.has(raw)) return `\\${raw}`;
    const base = mapChars(raw, { ...GREEK, ...OPERATORS });
    if (variant && VARIANTS[variant] && variant !== 'italic') return `${VARIANTS[variant]}{${base}}`;
    if ([...raw].length > 1 && /^[A-Za-z]+$/.test(raw)) return `\\mathrm{${raw}}`;
    return base;
  }
  if (tag === 'mn') return mapChars(raw, OPERATORS);
  if (tag === 'mo') {
    if (!raw) return '';
    if (raw.length > 1 && FUNCTIONS.has(raw)) return `\\${raw}`;
    return mapChars(raw, { ...OPERATORS, ...GREEK });
  }
  if (tag === 'mtext') {
    if (!raw) return '\\ ';
    return `\\text{${textEscape(raw)}}`;
  }
  if (tag === 'ms') return `\\text{"${textEscape(raw)}"}`;
  return raw;
}

function convertChildren(el) {
  return joinTex(elementChildren(el).map(convertNode));
}

function isBigOp(tex) {
  return BIG_OPS.has(tex.trim());
}

function convertNode(el) {
  const tag = name(el);
  const kids = elementChildren(el);
  const arg = (i) => (kids[i] ? convertNode(kids[i]) : '');
  switch (tag) {
  case 'math':
  case 'mrow':
  case 'mstyle':
  case 'mpadded':
  case 'merror':
  case 'menclose':
  case 'mlabeledtr':
    return convertChildren(el);
  case 'semantics': {
    const tex = texAnnotation(el);
    if (tex) return tex;
    return kids[0] && !/^annotation/.test(name(kids[0])) ? convertNode(kids[0]) : '';
  }
  case 'annotation':
  case 'annotation-xml':
  case 'mphantom':
  case 'none':
  case 'mprescripts':
  case 'maligngroup':
  case 'malignmark':
    return '';
  case 'mi':
  case 'mn':
  case 'mo':
  case 'mtext':
  case 'ms':
    return convertToken(el);
  case 'mspace': {
    const w = parseFloat((el.getAttribute && el.getAttribute('width')) || '0');
    return w >= 1 ? '\\quad ' : (w > 0 ? '\\, ' : ' ');
  }
  case 'msub':
    return `${group(arg(0))}_${group(arg(1))}`;
  case 'msup':
    return `${group(arg(0))}^${group(arg(1))}`;
  case 'msubsup':
    return `${group(arg(0))}_${group(arg(1))}^${group(arg(2))}`;
  case 'mfrac': {
    const lt = el.getAttribute && el.getAttribute('linethickness');
    if (lt !== null && lt !== undefined && /^0(\.0*)?(px|pt|em)?$/.test(lt)) return `\\binom{${arg(0)}}{${arg(1)}}`;
    return `\\frac{${arg(0)}}{${arg(1)}}`;
  }
  case 'msqrt':
    return `\\sqrt{${convertChildren(el)}}`;
  case 'mroot':
    return `\\sqrt[${arg(1)}]{${arg(0)}}`;
  case 'mover': {
    const base = arg(0);
    const over = (kids[1] && kids[1].textContent || '').trim();
    if (ACCENTS_OVER[over]) {
      const cmd = ACCENTS_OVER[over];
      const wide = base.replace(/\\[a-zA-Z]+/g, 'x').length > 1;
      if (wide && cmd === '\\bar') return `\\overline{${base}}`;
      if (wide && cmd === '\\hat') return `\\widehat{${base}}`;
      if (wide && cmd === '\\tilde') return `\\widetilde{${base}}`;
      return `${cmd}{${base}}`;
    }
    if (isBigOp(base)) return `${base}^${group(arg(1))}`;
    return `\\overset{${arg(1)}}{${base}}`;
  }
  case 'munder': {
    const base = arg(0);
    const under = (kids[1] && kids[1].textContent || '').trim();
    if (ACCENTS_UNDER[under]) return `${ACCENTS_UNDER[under]}{${base}}`;
    if (isBigOp(base)) return `${base}_${group(arg(1))}`;
    return `\\underset{${arg(1)}}{${base}}`;
  }
  case 'munderover': {
    const base = arg(0);
    if (isBigOp(base)) return `${base}_${group(arg(1))}^${group(arg(2))}`;
    return `\\overset{${arg(2)}}{\\underset{${arg(1)}}{${base}}}`;
  }
  case 'mmultiscripts': {
    const base = arg(0);
    const post = [];
    for (let i = 1; i + 1 < kids.length && name(kids[i]) !== 'mprescripts'; i += 2) post.push([arg(i), arg(i + 1)]);
    return post.reduce((acc, [sub, sup]) => `${acc}${sub ? `_${group(sub)}` : ''}${sup ? `^${group(sup)}` : ''}`, group(base));
  }
  case 'mfenced': {
    const open = el.getAttribute('open') ?? '(';
    const close = el.getAttribute('close') ?? ')';
    const sep = (el.getAttribute('separators') ?? ',').trim().charAt(0) || '';
    const inner = kids.map(convertNode).join(sep ? `${sep} ` : ' ');
    return `\\left${fence(open)} ${inner} \\right${fence(close)}`;
  }
  case 'mtable': {
    const rows = kids.filter((k) => ['mtr', 'mlabeledtr'].includes(name(k)));
    const cols = Math.max(1, ...rows.map((r) => elementChildren(r).filter((c) => name(c) === 'mtd').length));
    const body = rows.map((r) => {
      const cells = elementChildren(r).filter((c) => name(c) === 'mtd');
      return cells.map((c) => convertChildren(c).trim()).join(' & ');
    }).join(' \\\\ ');
    return `\\begin{array}{${'c'.repeat(cols)}} ${body} \\end{array}`;
  }
  case 'mtr':
  case 'mtd':
    return convertChildren(el);
  default:
    return convertChildren(el);
  }
}

function fence(ch) {
  if (!ch) return '.';
  const map = { '{': '\\{', '}': '\\}', '⟨': '\\langle', '⟩': '\\rangle', '〈': '\\langle', '〉': '\\rangle', '|': '|', '‖': '\\|', '⌊': '\\lfloor', '⌋': '\\rfloor', '⌈': '\\lceil', '⌉': '\\rceil' };
  return map[ch] || ch;
}

function texAnnotation(el) {
  const anns = Array.from(el.getElementsByTagName ? el.getElementsByTagName('*') : [])
    .filter((n) => name(n) === 'annotation');
  const tex = anns.find((a) => /tex/i.test(a.getAttribute('encoding') || ''));
  return tex && tex.textContent.trim() ? tex.textContent.trim() : '';
}

/** <math> 是否为独立公式 */
export function isDisplayMath(mathEl) {
  return (mathEl.getAttribute && (mathEl.getAttribute('display') === 'block' || mathEl.getAttribute('mode') === 'display'));
}

/**
 * MathML 元素 → LaTeX 字符串（未清理），失败返回 ''。
 * 优先级：annotation TeX > 逐元素转换 > alttext > 纯文本
 */
export function mathmlToLatex(mathEl) {
  if (!mathEl) return '';
  const ann = texAnnotation(mathEl);
  if (ann) return ann;
  let converted = '';
  try {
    converted = convertNode(mathEl);
  } catch (_) {
    converted = '';
  }
  converted = converted.replace(/\s{2,}/g, ' ').trim();
  if (converted) return converted;
  const alt = mathEl.getAttribute && mathEl.getAttribute('alttext');
  if (alt && alt.trim()) return alt.trim();
  return (mathEl.textContent || '').trim();
}
