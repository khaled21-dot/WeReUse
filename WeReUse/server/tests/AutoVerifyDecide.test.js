/**
 * Unit tests for the automatic ID-card decision (no database needed).
 * Run:  node --test tests/autoVerifyDecide.test.js
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { decide, matchRegNumber, nameScore, levenshtein } = require('../src/utils/autoVerify/decide');

const student = { name: 'Khaled Mahmud Nahid', regNumber: '241-35-032' };
const card = (over = {}) => ({
  text: [
    'DAFFODIL INTERNATIONAL UNIVERSITY',
    'Student ID Card',
    'Name: KHALED MAHMUD NAHID',
    'ID: 241-35-032',
    'Department: Software Engineering',
    'Valid till: Dec 2028',
  ].join('\n'),
  confidence: 82,
  ...over,
});
const withText = (text, confidence = 80) => ({ text, confidence });

describe('approving', () => {
  it('approves when the number and the name are on the card', () => {
    const r = decide(card(), student);
    assert.equal(r.decision, 'approved');
    assert.equal(r.code, 'ok');
    assert.equal(r.reason, '');
    assert.equal(r.checks.regNumber, 'exact');
    assert.equal(r.checks.nameScore, 1);
  });

  it('accepts the number in any spelling (24135032, 241/35/032)', () => {
    assert.equal(decide(card(), { ...student, regNumber: '24135032' }).decision, 'approved');
    assert.equal(decide(card(), { ...student, regNumber: '241/35/032' }).decision, 'approved');
  });

  it('forgives look-alike characters the reader often confuses (O/0, l/1)', () => {
    const noisy = card({ text: card().text.replace('241-35-032', '24l-35-O32') });
    assert.equal(decide(noisy, student).decision, 'approved');
  });

  it('forgives small typos in the name (K → K, d → o)', () => {
    const noisy = card({ text: card().text.replace('KHALED MAHMUD NAHID', 'KHALEO MAHMUO NAHIO') });
    assert.equal(decide(noisy, student).decision, 'approved');
  });

  it('does not care about the order of the name words or extra words on the card', () => {
    const t = card({ text: card().text.replace('KHALED MAHMUD NAHID', 'MD. NAHID, KHALED MAHMUD') });
    assert.equal(decide(t, student).decision, 'approved');
  });
});

describe('rejecting on clear evidence', () => {
  it('rejects a card that has another person\'s name with the typed number', () => {
    const other = card({ text: card().text.replace('KHALED MAHMUD NAHID', 'RAHIM UDDIN SARKER') });
    const r = decide(other, student);
    assert.equal(r.decision, 'rejected');
    assert.equal(r.code, 'name_mismatch');
    assert.ok(!/rahim|sarker/i.test(r.reason), 'must not repeat what was read from the card');
  });

  it('rejects when neither the number nor the name is on the card', () => {
    const r = decide(withText('Library membership card\nMember: RAHIM UDDIN\nNo: 998877\nValid for one year only'), student);
    assert.equal(r.decision, 'rejected');
    assert.equal(r.code, 'reg_and_name_missing');
    assert.ok(r.reason.includes('241-35-032'));
  });

  it('rejects an impossible registration number without needing the photo', () => {
    const r = decide(card(), { ...student, regNumber: 'ABC-123' }, { regPattern: /^\d{8,9}$/ });
    assert.equal(r.decision, 'rejected');
    assert.equal(r.code, 'bad_format');
    assert.equal(decide(card(), student, { regPattern: /^\d{8,9}$/ }).decision, 'approved');
  });
});

describe('not sure -> an admin decides (default)', () => {
  it('an unreadable photo', () => {
    assert.equal(decide(withText('x'), student).code, 'unreadable');
    assert.equal(decide(withText('x'), student).decision, 'review');
    assert.equal(decide(card({ confidence: 20 }), student).code, 'unreadable');
  });

  it('the number is one digit off', () => {
    const r = decide(card({ text: card().text.replace('241-35-032', '241-35-033') }), student);
    assert.equal(r.decision, 'review');
    assert.equal(r.code, 'reg_unsure');
    assert.equal(r.checks.regNumber, 'near');
  });

  it('the number is missing but the name is there', () => {
    const r = decide(card({ text: card().text.replace('ID: 241-35-032', 'ID: ') }), student);
    assert.equal(r.decision, 'review');
    assert.equal(r.code, 'reg_not_found');
  });

  it('only some words of the name are found', () => {
    const r = decide(card({ text: card().text.replace('KHALED MAHMUD NAHID', 'KHALED') }), student); // 1 of 3 words = 0.33 -> clear mismatch
    assert.equal(r.code, 'name_mismatch');
    const partial = decide(card({ text: card().text.replace('KHALED MAHMUD NAHID', 'KHALED MAHMUD') }), student); // 2 of 3 = 0.67
    assert.equal(partial.decision, 'review');
    assert.equal(partial.code, 'name_unsure');
  });

  it('a name that cannot be checked (not written in English letters)', () => {
    const r = decide(card(), { name: 'খালেদ মাহমুদ', regNumber: '241-35-032' });
    assert.equal(r.decision, 'review');
    assert.equal(r.checks.nameScore, null);
  });
});

describe('settings', () => {
  it('onUncertain: "reject" turns "not sure" into a rejection with advice', () => {
    const r = decide(withText('x'), student, { onUncertain: 'reject' });
    assert.equal(r.decision, 'rejected');
    assert.match(r.reason, /clear, well-lit/);
    const missing = decide(card({ text: card().text.replace('ID: 241-35-032', 'ID: ') }), student, { onUncertain: 'reject' });
    assert.equal(missing.decision, 'rejected');
    assert.ok(missing.reason.includes('241-35-032'));
  });

  it('university keywords: required words must be on the card', () => {
    assert.equal(decide(card(), student, { keywords: ['daffodil'] }).decision, 'approved');
    const noName = card({ text: card().text.replace('DAFFODIL INTERNATIONAL UNIVERSITY', 'SOME OTHER SCHOOL') });
    const r = decide(noName, student, { keywords: ['daffodil'] });
    assert.equal(r.decision, 'review');
    assert.equal(r.code, 'university_missing');
  });

  it('a stricter or looser name threshold', () => {
    const two = card({ text: card().text.replace('KHALED MAHMUD NAHID', 'KHALED MAHMUD') });
    assert.equal(decide(two, student).decision, 'review');
    assert.equal(decide(two, student, { minNameScore: 0.6 }).decision, 'approved');
  });
});

describe('helpers', () => {
  it('matchRegNumber', () => {
    assert.equal(matchRegNumber('ID 241 35 032', '24135032'), 'exact');
    assert.equal(matchRegNumber('ID 241 35 033', '24135032'), 'near');
    assert.equal(matchRegNumber('ID 999 99 999', '24135032'), 'none');
    assert.equal(matchRegNumber('anything', ''), 'none');
  });
  it('nameScore', () => {
    assert.equal(nameScore('NAHID KHALED MAHMUD', 'Khaled Mahmud Nahid'), 1);
    assert.equal(nameScore('nothing here', 'Khaled Mahmud Nahid'), 0);
    assert.equal(nameScore('x', '১২৩'), null);
  });
  it('levenshtein', () => {
    assert.equal(levenshtein('kitten', 'sitting'), 3);
    assert.equal(levenshtein('same', 'same'), 0);
  });
});