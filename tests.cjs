const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
require('./questions.js');
const { QuizSession } = require('./core.js');
const bank = globalThis.QUESTION_BANK;
const all = bank.chapters.flatMap(c => c.questions);
assert.equal(bank.chapters.length, 8);
assert.equal(all.length, 204);
assert.equal(all.filter(q => q.type === 'single').length, 92);
assert.equal(all.filter(q => q.type === 'multiple').length, 112);
assert.equal(new Set(all.map(q => q.id)).size, 204);

// Every imported answer must pass exact-set judging; missing or extra choices must fail.
for (const q of all) {
  assert.ok(q.explanation?.reason && q.explanation.analysis && q.explanation.tip, q.id);
  assert.ok(q.answer.every(k => q.options.some(o => o.key === k)), q.id);
  const quiz = new QuizSession(bank);
  const c = bank.chapters.find(c => c.questions.includes(q));
  quiz.configure({ chapterId: c.id });
  quiz.jump(quiz.state.queue.indexOf(q.id));
  for (const key of [...q.answer].reverse()) quiz.select(key);
  if (q.type === 'multiple') {
    assert.equal(quiz.record(q.id), null, 'multi-select must hide result until submission');
    assert.equal(quiz.submit(), true);
  }
  assert.equal(quiz.record(q.id).correct, true, q.id);
  const initial = quiz.serialize();
  assert.equal(quiz.select(q.options[0].key), false, 'committed answers cannot change');
  assert.equal(quiz.serialize(), initial, 'committed state must stay stable');
  if (q.answer.length > 1) assert.equal(quiz.evaluate(q, q.answer.slice(1)).correct, false, q.id);
  const extra = q.options.find(o => !q.answer.includes(o.key));
  if (extra) assert.equal(quiz.evaluate(q, [...q.answer, extra.key]).correct, false, q.id);
}

const quiz = new QuizSession(bank);
const first = quiz.current();
quiz.select(first.options.find(o => !first.answer.includes(o.key)).key);
assert.equal(quiz.state.wrong[first.id].count, 1);
assert.equal(quiz.state.wrong[first.id].mastered, false);
quiz.retry();
assert.equal(quiz.record(first.id), null);
assert.equal(quiz.state.wrong[first.id].count, 1, 'retry keeps wrong history before resubmission');
quiz.select(first.answer[0]);
assert.equal(quiz.state.wrong[first.id].mastered, true);
assert.equal(quiz.libraryItems().length, 1, 'mastered mistakes remain available');
quiz.state.libraryFilter = 'unmastered';
assert.equal(quiz.libraryItems().length, 0);
quiz.state.libraryFilter = 'mastered';
assert.equal(quiz.libraryItems().length, 1);
quiz.openWrong(first.id);
assert.equal(quiz.record(first.id), null);
assert.equal(quiz.state.queue.length, 1);
quiz.select('A');
assert.equal(quiz.state.wrong[first.id].count, 2);

quiz.configure({ chapterId: bank.chapters[7].id, type: 'multiple', order: 'random', mode: 'all' });
assert.equal(quiz.state.queue.length, 13);
assert.equal(new Set(quiz.state.queue).size, 13);
assert.ok(quiz.state.queue.every(id => quiz.questions.get(id).type === 'multiple'));
quiz.jump(12);
quiz.select(quiz.current().answer[0]);
const restore = new QuizSession(bank, JSON.parse(quiz.serialize()));
assert.deepEqual(restore.state, quiz.state, 'position, random order, drafts, results and library survive refresh');

// Execute the actual UI in a DOM adapter to verify visible feedback and event routing.
class Element {
  constructor(dataset = {}) { this.dataset = dataset; this.tagName = 'BUTTON'; this.innerHTML = ''; this.textContent = ''; this.value = ''; this.hidden = false; this.disabled = false; this.style = {}; this.attributes = {}; this.events = {}; this.classList = { toggle() {} }; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  addEventListener(k, v) { this.events[k] = v; }
  closest() { return this; }
  focus() {}
}
function boot(memory) {
  const elements = new Map();
  const get = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  const types = ['all', 'single', 'multiple'].map(value => new Element({ action: 'type', value }));
  const filters = ['all', 'unmastered', 'mastered'].map(value => new Element({ action: 'library-filter', value }));
  const events = {};
  const context = vm.createContext({ document: {
    getElementById: get,
    querySelector: get,
    querySelectorAll: s => s.includes('library-filter') ? filters : types,
    addEventListener: (k, fn) => events[k] = fn
  }, localStorage: { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, v) }, console });
  for (const file of ['questions.js', 'core.js', 'app.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), context, { filename: file });
  function click(action, value) { events.click({ target: new Element({ action, value }), preventDefault() {} }); }
  function keyboard(key) { events.keydown({ key, target: new Element({ action: 'option' }), preventDefault() {} }); }
  return { get, click, keyboard };
}
const memory = new Map();
let ui = boot(memory);
assert.ok(!ui.get('questionArea').innerHTML.includes('answer-panel'), 'no answer visible before selection');
assert.ok(!ui.get('questionArea').innerHTML.includes('详细解析 ·'), 'no analysis visible before selection');
ui.click('option', 'A');
assert.match(ui.get('questionArea').innerHTML, /answer-panel/);
assert.match(ui.get('questionArea').innerHTML, /答题依据/);
assert.match(ui.get('questionArea').innerHTML, /选项辨析/);
assert.match(ui.get('questionArea').innerHTML, /记忆要点/);
assert.equal(ui.get('wrongTotal').textContent, 1);
ui.click('next');
assert.ok(!ui.get('questionArea').innerHTML.includes('answer-panel'), 'next unattempted question must hide answer');
ui.click('type', 'multiple');
ui.keyboard('A');
assert.ok(!ui.get('questionArea').innerHTML.includes('answer-panel'), 'multi draft stays hidden');
ui.keyboard('Enter');
assert.match(ui.get('questionArea').innerHTML, /少选了正确选项/);
assert.match(ui.get('questionArea').innerHTML, /详细解析/);
assert.equal(ui.get('wrongTotal').textContent, 2);
ui.click('library');
assert.equal(ui.get('libraryView').hidden, false);
assert.match(ui.get('libraryList').innerHTML, /c0-single-1/);
assert.match(ui.get('libraryList').innerHTML, /c0-multiple-1/);
assert.match(ui.get('libraryList').innerHTML, /查看题目选项、答案与解析/);
ui.click('review-one', 'c0-multiple-1');
assert.ok(!ui.get('questionArea').innerHTML.includes('answer-panel'), 'wrong review starts without answer');
ui.click('option', 'B');
ui.click('option', 'A');
ui.click('submit');
assert.match(ui.get('questionArea').innerHTML, /回答正确/);
ui.click('library');
assert.match(ui.get('libraryList').innerHTML, /已掌握/);
assert.equal(ui.get('wrongTotal').textContent, 2, 'correct reattempt keeps accumulated library');
ui = boot(memory);
assert.equal(ui.get('libraryView').hidden, false, 'last view survives refresh');
assert.match(ui.get('libraryList').innerHTML, /已掌握/);
ui.click('library-filter', 'unmastered');
assert.ok(!ui.get('libraryList').innerHTML.includes('c0-multiple-1'));
assert.ok(ui.get('libraryList').innerHTML.includes('c0-single-1'));
ui.click('chapter', 'chapter-7');
assert.equal(ui.get('chapterTitle').textContent, bank.chapters[7].title);
assert.ok(!ui.get('questionArea').innerHTML.includes('answer-panel'));
ui.click('jump', '22');
ui.click('next');
assert.match(ui.get('questionArea').innerHTML, /没有完成作答/);
ui.click('continue');
assert.ok(!ui.get('questionArea').innerHTML.includes('summary-card'));
console.log('PASS: 204 answer keys and explanations, exact multiple-choice judging, feedback gating, chapter navigation, keyboard input, accumulated wrong library, mastery filters, summary and refresh persistence.');
