const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// PTTableFormatting 클래스 로드
const code = fs.readFileSync(path.join(__dirname, '../table-formatting.js'), 'utf8');
const factory = new Function(`${code}; return PTTableFormatting;`);
const PTTableFormatting = factory();

test('transformEnglishCase transforms only English letters and preserves Korean/numbers/symbols', async (t) => {
  const formatter = new PTTableFormatting();

  await t.test('uppercase mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('특이사항: rom exercise 10회 및 pt 시행', 'uppercase'),
      '특이사항: ROM EXERCISE 10회 및 PT 시행'
    );
  });

  await t.test('lowercase mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('특이사항: ROM EXERCISE 10회 및 PT 시행', 'lowercase'),
      '특이사항: rom exercise 10회 및 pt 시행'
    );
  });

  await t.test('sentence case mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('특이사항: pt rom exercise. next line test!', 'sentence'),
      '특이사항: Pt rom exercise. Next line test!'
    );
  });

  await t.test('capitalize each word mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('특이사항: pt rom exercise 10회', 'capitalize'),
      '특이사항: Pt Rom Exercise 10회'
    );
  });

  await t.test('first word mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('특이사항: pt rom exercise. next line test!', 'firstWord'),
      '특이사항: Pt rom exercise. next line test!'
    );
    assert.strictEqual(
      formatter.transformEnglishCase('PT ROM EXERCISE 10회', 'firstWord'),
      'Pt rom exercise 10회'
    );
  });

  await t.test('first and last English words become uppercase without changing the others', () => {
    for (const [mode, expected] of [['firstWordUppercase', 'ACUTE pain'], ['lastWordUppercase', 'Acute PAIN']]) {
      assert.equal(formatter.transformEnglishCase('Acute pain', mode), expected);
    }
    assert.equal(formatter.transformEnglishCase('통증: Acute pain (10회)', 'firstWordUppercase'), '통증: ACUTE pain (10회)');
    assert.equal(formatter.transformEnglishCase('통증: Acute pain (10회)', 'lastWordUppercase'), '통증: Acute PAIN (10회)');
    assert.equal(formatter.transformEnglishCase('Acute ROM pain', 'firstWordUppercase'), 'ACUTE ROM pain');
    assert.equal(formatter.transformEnglishCase('Acute ROM pain', 'lastWordUppercase'), 'Acute ROM PAIN');
    assert.equal(formatter.transformEnglishCase('통증 10회', 'lastWordUppercase'), '통증 10회');
    assert.equal(formatter.transformEnglishCase('pain', 'firstWordUppercase'), 'PAIN');
    assert.equal(formatter.transformEnglishCase('pain', 'lastWordUppercase'), 'PAIN');
  });

  await t.test('toggle case mode', () => {
    assert.strictEqual(
      formatter.transformEnglishCase('Pt Rom Exercise 10회', 'toggle'),
      'pT rOM eXERCISE 10회'
    );
  });
});

test('applyChangeCase works with rows and richText', () => {
  const formatter = new PTTableFormatting();
  const mockRow = {
    specialNote: 'pt rom exercise 10회',
    _richText: {
      specialNote: {
        text: 'pt rom exercise 10회',
        colors: Array('pt rom exercise 10회'.length).fill(null)
      }
    }
  };
  formatter.getCurrentRows = () => [mockRow];
  formatter.activeCell = { rowIdx: 0, colKey: 'specialNote' };
  formatter.getFormattingRange = () => null;

  const res = formatter.applyChangeCase('uppercase');
  assert.strictEqual(res, true);
  assert.strictEqual(mockRow.specialNote, 'PT ROM EXERCISE 10회');
  assert.strictEqual(mockRow._richText.specialNote.text, 'PT ROM EXERCISE 10회');
});

test('context menu executeContextAction opens change-case menu', () => {
  const contextMenuCode = fs.readFileSync(path.join(__dirname, '../context-menu.js'), 'utf8');
  const contextFactory = new Function(`${contextMenuCode}; return PTContextMenu;`);
  const PTContextMenu = contextFactory();

  const menu = new PTContextMenu();
  let openedAnchor = null;
  menu.openChangeCaseMenu = (anchor) => { openedAnchor = anchor; };
  menu.elContextMenu = { id: 'excelContextMenu' };

  const dummyItem = { dataset: { action: 'change-case' } };
  menu.executeContextAction('change-case', dummyItem);

  assert.strictEqual(openedAnchor, dummyItem);
});
