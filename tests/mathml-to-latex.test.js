import { mathmlToLatex, joinTex } from '@core/math/mathml-to-latex';
import { cleanLatexFormula, stripTexDocument } from '@core/math/clean-latex';

const NS = 'http://www.w3.org/1998/Math/MathML';
function math(inner, attrs = '') {
  const doc = new DOMParser().parseFromString(`<math xmlns="${NS}" ${attrs}>${inner}</math>`, 'application/xml');
  return doc.documentElement;
}

describe('mathmlToLatex', () => {
  test('fractions, superscripts and subscripts', () => {
    expect(mathmlToLatex(math('<mfrac><mi>a</mi><mrow><mi>b</mi><mo>+</mo><mn>1</mn></mrow></mfrac>'))).toBe('\\frac{a}{b+1}');
    expect(mathmlToLatex(math('<msup><mi>x</mi><mn>2</mn></msup>'))).toBe('x^2');
    expect(mathmlToLatex(math('<msub><mi>h</mi><mrow><mi>i</mi><mi>j</mi></mrow></msub>'))).toBe('h_{ij}');
    expect(mathmlToLatex(math('<msubsup><mi>σ</mi><mi>a</mi><mn>2</mn></msubsup>'))).toBe('\\sigma_a^2');
  });

  test('greek letters, operators and function names', () => {
    expect(mathmlToLatex(math('<mi>α</mi><mi>x</mi><mo>≤</mo><mi>β</mi>'))).toBe('\\alpha x\\le\\beta');
    expect(mathmlToLatex(math('<mi>log</mi><mo>⁡</mo><mi>p</mi>'))).toBe('\\log p');
    expect(mathmlToLatex(math('<mi>BV</mi>'))).toBe('\\mathrm{BV}');
    expect(mathmlToLatex(math('<mi mathvariant="bold">G</mi>'))).toBe('\\mathbf{G}');
  });

  test('roots, accents and big operators with limits', () => {
    expect(mathmlToLatex(math('<msqrt><mi>n</mi></msqrt>'))).toBe('\\sqrt{n}');
    expect(mathmlToLatex(math('<mroot><mi>x</mi><mn>3</mn></mroot>'))).toBe('\\sqrt[3]{x}');
    expect(mathmlToLatex(math('<mover><mi>y</mi><mo>^</mo></mover>'))).toBe('\\hat{y}');
    expect(mathmlToLatex(math('<mover><mi>x</mi><mo>¯</mo></mover>'))).toBe('\\bar{x}');
    expect(mathmlToLatex(math('<munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub>')))
      .toBe('\\sum_{i=1}^n x_i');
  });

  test('tables and fences', () => {
    const tex = mathmlToLatex(math('<mfenced><mtable><mtr><mtd><mi>a</mi></mtd><mtd><mi>b</mi></mtd></mtr><mtr><mtd><mi>c</mi></mtd><mtd><mi>d</mi></mtd></mtr></mtable></mfenced>'));
    expect(tex).toBe('\\left( \\begin{array}{cc} a & b \\\\ c & d \\end{array} \\right)');
  });

  test('TeX annotation wins over conversion', () => {
    const el = math('<semantics><mi>x</mi><annotation encoding="application/x-tex">\\mathcal{X}</annotation></semantics>');
    expect(mathmlToLatex(el)).toBe('\\mathcal{X}');
  });

  test('falls back to alttext when conversion is empty', () => {
    expect(mathmlToLatex(math('<mphantom><mi>x</mi></mphantom>', 'alttext="h^2"'))).toBe('h^2');
  });

  test('mtext escapes special characters', () => {
    expect(mathmlToLatex(math('<mtext>50% of SNPs</mtext>'))).toBe('\\text{50\\% of SNPs}');
  });

  test('works on namespaced JATS mml:math', () => {
    const xml = `<root xmlns:mml="${NS}"><mml:math><mml:msup><mml:mi>h</mml:mi><mml:mn>2</mml:mn></mml:msup></mml:math></root>`;
    const el = new DOMParser().parseFromString(xml, 'application/xml').documentElement.firstChild;
    expect(mathmlToLatex(el)).toBe('h^2');
  });

  test('joinTex separates commands from letters', () => {
    expect(joinTex(['\\alpha', 'x', '+', '\\beta', '1'])).toBe('\\alpha x+\\beta 1');
  });
});

describe('clean-latex', () => {
  test('stripTexDocument removes the PMC LaTeX document shell', () => {
    const tex = '\\documentclass[12pt]{minimal}\n\\usepackage{amsmath}\n\\usepackage{wasysym}\n\\setlength{\\oddsidemargin}{-69pt}\n\\begin{document}$$h^2=\\frac{\\sigma_a^2}{\\sigma_p^2}$$\\end{document}';
    expect(stripTexDocument(tex)).toBe('h^2=\\frac{\\sigma_a^2}{\\sigma_p^2}');
  });

  test('stripTexDocument removes \\[ \\] and equation environments', () => {
    expect(stripTexDocument('\\[ a+b \\]')).toBe('a+b');
    expect(stripTexDocument('\\begin{equation}y = Xb + e\\end{equation}')).toBe('y = Xb + e');
  });

  test('cleanLatexFormula (ported from arxiv-md) drops colors, sizes and refs', () => {
    expect(cleanLatexFormula('\\color{red}x + \\small y \\label{eq1}')).toBe('x + y');
    expect(cleanLatexFormula('\\text{3$\\times$3}')).toBe('\\text{3}\\times\\text{3}');
    expect(cleanLatexFormula('a\n+\nb')).toBe('a + b');
  });
});
