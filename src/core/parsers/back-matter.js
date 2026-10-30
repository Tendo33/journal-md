// 按 sec-type 或标题把章节归到「致谢 / 数据可用性 / 基金 / 利益冲突」（PRD §2.3 额外信息各自成节）。

const BY_TYPE = {
  'data-availability': 'dataAvailability',
  'data_availability': 'dataAvailability',
  'availability': 'dataAvailability',
  funding: 'funding',
  'funding-information': 'funding',
  'financial-disclosure': 'funding',
  'conflict': 'competingInterests',
  'coi-statement': 'competingInterests',
  'conflict-of-interest': 'competingInterests',
  'competing-interests': 'competingInterests',
  'acknowledgment': 'acknowledgements',
  'acknowledgement': 'acknowledgements',
  'acknowledgments': 'acknowledgements',
  'acknowledgements': 'acknowledgements',
};

const BY_TITLE = [
  [/^(data|code)( and (code|data|materials))? (availability|access|sharing)|^availability of (data|supporting data)|^data accessibility/i, 'dataAvailability'],
  [/^(funding|financial (support|disclosure)|grant information|sources? of funding)/i, 'funding'],
  [/^(competing interests?|conflicts? of interests?|conflict of interest statement|declaration of (competing )?interests?|disclosure statement|duality of interest)/i, 'competingInterests'],
  [/^acknowledge?ments?/i, 'acknowledgements'],
];

/** @returns {'dataAvailability'|'funding'|'competingInterests'|'acknowledgements'|null} */
export function classifyBackSection(title, secType) {
  const type = String(secType || '').trim().toLowerCase();
  if (type && BY_TYPE[type]) return BY_TYPE[type];
  const t = String(title || '').replace(/^[\d.\s]+/, '').replace(/[:.]\s*$/, '').trim();
  for (const [re, key] of BY_TITLE) if (re.test(t)) return key;
  return null;
}
