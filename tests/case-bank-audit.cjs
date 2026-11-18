'use strict';
const fs = require('node:fs');

function extractObject(source, marker) {
  const at = source.indexOf(marker);
  if (at < 0) throw new Error('Missing marker: ' + marker);
  const open = source.indexOf('{', at + marker.length);
  let depth = 0, quote = '', escaped = false;
  for (let i = open; i < source.length; i++) {
    const ch = source[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (ch === '\\\\') escaped = true;
      else if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"') { quote = ch; continue; }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return JSON.parse(source.slice(open, i + 1));
    }
  }
  throw new Error('Unclosed object after marker: ' + marker);
}

const source = fs.readFileSync('index.html', 'utf8');
const common = extractObject(source, 'const COMMON_EXTRA_CASES=');
const mock = extractObject(source, 'const MOCK_CASE_BANKS=');
const subjects = ['bio', 'chem', 'phys', 'earth', 'basic4'];
const errors = [];
for (const subject of subjects) {
  if (!Array.isArray(common[subject]) || common[subject].length < 4) {
    errors.push(subject + ': too few common/advanced cases');
    continue;
  }
  if (!mock[subject] || typeof mock[subject] !== 'object') {
    errors.push(subject + ': missing mock case');
    continue;
  }
  const prompts = new Set();
  const allCases = [...common[subject], mock[subject]];
  for (const item of allCases) {
    const label = subject + ' / ' + item.title;
    if (typeof item.stimulus !== 'string' || item.stimulus.length < 200) errors.push(label + ': stimulus shorter than 200 characters');
    if (!Array.isArray(item.qs) || item.qs.length < 4) errors.push(label + ': fewer than four linked questions');
    const positions = [0, 0, 0, 0];
    for (const q of item.qs || []) {
      if (!Array.isArray(q) || q.length < 4) { errors.push(label + ': malformed question record'); continue; }
      if (typeof q[0] !== 'string' || !q[0].trim()) errors.push(label + ': empty question text');
      if (!Array.isArray(q[1]) || q[1].length !== 4 || q[1].some(x => typeof x !== 'string' || !x.trim())) errors.push(label + ': expected four non-empty choices');
      if (!Number.isInteger(q[2]) || q[2] < 0 || q[2] > 3) errors.push(label + ': invalid answer index');
      if (typeof q[3] !== 'string' || !q[3].trim()) errors.push(label + ': missing explanation');
      else if (Array.isArray(q[1]) && q[1][q[2]] !== undefined) positions[q[2]]++;
      const prompt = String(q[0] || '').normalize('NFKC').toLocaleLowerCase().replace(/\\s+/g, '');
      if (prompt && prompts.has(prompt)) errors.push(label + ': duplicate prompt across case bank');
      prompts.add(prompt);
    }
    if (Math.max(...positions) - Math.min(...positions) > 2) errors.push(label + ': answer-position imbalance');
  }
}
if (!source.includes('function safeCaseFragment(') || !source.includes('article.appendChild(safeCaseFragment(q.caseText))') || source.includes('escHtml(q.caseText)')) {
  errors.push('stimulus markup is not rendered through the allow-list sanitizer');
}
if (errors.length) {
  console.error(errors.join('\\n'));
  process.exit(1);
}
console.log('Science case bank OK: five subjects, long stimuli, valid questions, balanced keys, and safe markup rendering.');
