// LaTeX 清理规则。cleanLatexFormula / splitDollarsInTextGroups 移植自
// arxiv-md src/content/ar5iv-math.js（origin/main b2dc3a0），去掉了 ar5iv 专有部分；
// stripTexDocument 是 journal-md 新增：PMC/Europe PMC 的 JATS <tex-math> 常带整份 LaTeX 文档外壳。

/** 去掉 \documentclass … \begin{document} … \end{document} 外壳和外层 $ / $$ / \[ \] / \( \) 定界符 */
export function stripTexDocument(tex) {
  let s = String(tex || '');
  const m = s.match(/\\begin\{document\}([\s\S]*?)\\end\{document\}/);
  if (m) s = m[1];
  s = s.replace(/\\(?:documentclass|usepackage)\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  s = s.replace(/\\(?:setlength|addtolength)\s*\{[^}]*\}\s*\{[^}]*\}/g, '');
  s = s.trim();
  // 只有内部再没有未转义的 $ 时才剥外层定界符（"$a$ and $b$" 不是一整个公式）
  const bare = (x) => !/(^|[^\\])\$/.test(x);
  for (;;) {
    const before = s;
    if (/^\$\$[\s\S]*\$\$$/.test(s) && s.length > 3 && bare(s.slice(2, -2))) s = s.slice(2, -2).trim();
    else if (/^\$[\s\S]*\$$/.test(s) && s.length > 1 && bare(s.slice(1, -1))) s = s.slice(1, -1).trim();
    else if (/^\\\[[\s\S]*\\\]$/.test(s)) s = s.slice(2, -2).trim();
    else if (/^\\\([\s\S]*\\\)$/.test(s)) s = s.slice(2, -2).trim();
    if (s === before) break;
  }
  // \begin{equation}…\end{equation}（含 *）在 $$ 里不合法，换成内容本身
  s = s.replace(/^\\begin\{(equation\*?|displaymath)\}([\s\S]*)\\end\{\1\}$/, '$2').trim();
  return s;
}

const TEXT_GROUP_RE = /\\(?:text|textrm|textbf|textit|texttt|textsf|mbox)\s*\{/g;

function splitDollarsInTextGroups(latex) {
  if (!latex.includes('$')) return latex;
  let out = '';
  let last = 0;
  TEXT_GROUP_RE.lastIndex = 0;
  let match;
  while ((match = TEXT_GROUP_RE.exec(latex))) {
    const cmd = match[0].replace(/\s*\{$/, '');
    const start = match.index + match[0].length;
    let depth = 1;
    let i = start;
    for (; i < latex.length && depth > 0; i += 1) {
      if (latex[i] === '\\') { i += 1; continue; }
      if (latex[i] === '{') depth += 1;
      else if (latex[i] === '}') depth -= 1;
    }
    if (depth !== 0) break;
    const body = latex.slice(start, i - 1);
    const fixed = body.replace(/\$([^$]*)\$/g, (_, m) => `}${m}${cmd}{`);
    out += latex.slice(last, start) + fixed + '}';
    last = i;
    TEXT_GROUP_RE.lastIndex = i;
  }
  return out + latex.slice(last);
}

/** 清理 KaTeX/MathJax 不支持的命令（颜色、字号、交叉引用等） */
export function cleanLatexFormula(latex) {
  let result = String(latex || '');

  result = result.replace(/\\definecolor\s*(?:\[[^\]]*\])?\s*\{[^}]*\}\s*\{[^}]*\}(?:\s*\{[^}]*\})?/g, '');
  result = result.replace(/\\color\s*(?:\[[^\]]*\])?\s*\{[^}]*\}/g, '');
  result = result.replace(/\\textcolor\s*\{[^}]*\}\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}/g, '$1');

  const fontSizeCommands = ['\\footnotesize', '\\scriptsize', '\\tiny', '\\small', '\\normalsize',
    '\\large', '\\Large', '\\LARGE', '\\huge', '\\Huge', '\\bigskip', '\\medskip', '\\smallskip'];
  fontSizeCommands.forEach((cmd) => {
    result = result.replace(new RegExp(cmd.replace(/\\/g, '\\\\') + '(?:\\s+|(?=\\\\)|(?=[^a-zA-Z])|$)', 'g'), '');
  });

  result = result.replace(/\\mbox\s*\{([^}]*)\}/g, '\\text{$1}');
  result = result.replace(/\\textsc\b/g, '\\text');
  result = result.replace(/~?\\(?:eqref|ref|autoref|cref|Cref|label)\s*\{[^}]*\}/g, '');
  result = result.replace(/\\begin\{(array|tabular)\}\s*\[\s*\]/g, '\\begin{$1}');
  result = splitDollarsInTextGroups(result);
  result = result.replace(/\\text(?:rm|bf|it|tt|sf)?\s*\{\s*\}/g, '');

  // 公式里的换行会打断 Markdown 段落（行内公式）或 $$ 块，统一压成空格
  result = result.replace(/\s*\n\s*/g, ' ');
  result = result.replace(/\s{2,}/g, ' ').trim();
  return result;
}
