(function () {
  'use strict';
  const bank = globalThis.QUESTION_BANK;
  const key = 'xisixiang-chapter-practice-v1';
  const $ = id => document.getElementById(id);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let saved = null, storageOK = true;
  try { saved = JSON.parse(localStorage.getItem(key)); } catch { storageOK = false; }
  const session = new QuizCore.QuizSession(bank, saved);
  const state = session.state;
  const allIds = bank.chapters.flatMap(c => c.questions.map(q => q.id));
  const chapterOptions = '<option value="all">全部章节</option>' + bank.chapters.map(c => `<option value="${c.id}">${c.label}${c.label !== c.title ? ' · ' + escape(c.title) : ''}</option>`).join('');
  $('chapterSelect').innerHTML = chapterOptions.replace('<option value="all">全部章节</option>', '');
  $('libraryChapter').innerHTML = chapterOptions;

  function persist() {
    try { localStorage.setItem(key, session.serialize()); storageOK = true; } catch { storageOK = false; }
    if (!storageOK) $('storageNote').textContent = '浏览器未允许保存，当前可继续练习';
  }
  function announce(message) { $('announcement').textContent = message; }
  function focus(selector) { document.querySelector(selector)?.focus({ preventScroll: true }); }
  function showSource(q) {
    return (q.sources || []).map(id => bank.sources?.[id]).filter(Boolean).map(s => `<a href="${escape(s.url)}" target="_blank" rel="noopener noreferrer">${escape(s.title)}</a>`).join(' · ');
  }
  function explanation(q) {
    const x = q.explanation;
    if (!x) return '';
    return `<div class="explanation"><h3>详细解析 · ${escape(x.topic)}</h3>
      <p><span class="explanation-label">答题依据：</span>${escape(x.reason)}</p>
      <p><span class="explanation-label">选项辨析：</span>${escape(x.analysis)}</p>
      <p><span class="explanation-label">记忆要点：</span>${escape(x.tip)}</p>
      ${x.note ? `<p class="note"><b>原题提示：</b>${escape(x.note)}</p>` : ''}
      ${showSource(q) ? `<p class="source-links">延伸阅读：${showSource(q)}</p>` : ''}</div>`;
  }
  function header() {
    const c = session.chapter();
    const total = session.stats(allIds);
    const stats = session.stats(c.questions.map(q => q.id));
    $('overallCount').textContent = `${total.answered} / ${total.total}`;
    $('overallBar').style.width = `${100 * total.answered / total.total}%`;
    $('overallProgress').setAttribute('aria-valuenow', total.answered);
    $('chapterList').innerHTML = bank.chapters.map((chapter, i) => {
      const n = session.stats(chapter.questions.map(q => q.id));
      return `<button class="chapter-button ${chapter.id === c.id && state.view !== 'library' ? 'active' : ''}" data-action="chapter" data-value="${chapter.id}" ${chapter.id === c.id && state.view !== 'library' ? 'aria-current="page"' : ''}>
        <span class="chapter-number">${i === 0 ? '序' : String(i).padStart(2, '0')}</span><span class="chapter-info"><span class="chapter-label"><span>${chapter.label}</span><span class="chapter-mini-progress">${n.answered}/${n.total}</span></span><span class="chapter-name">${escape(i === 0 ? '习近平新时代中国特色社会主义思想' : chapter.title)}</span></span></button>`;
    }).join('');
    $('chapterSelect').value = c.id;
    $('chapterEyebrow').textContent = `${c.label} / ${state.mode === 'wrong' ? '错题重练' : '章节练习'}`;
    $('chapterTitle').textContent = c.title;
    const single = c.questions.filter(q => q.type === 'single').length;
    $('chapterMeta').textContent = `${single} 道单选题 · ${c.questions.length - single} 道多选题 · 每题附详细解析`;
    $('chapterDone').textContent = stats.answered;
    $('chapterTotal').textContent = `/ ${stats.total}`;
    const wrongCount = Object.keys(state.wrong).length;
    $('wrongTotal').textContent = wrongCount;
    $('libraryCount').textContent = wrongCount;
    const isLibrary = state.view === 'library';
    $('practiceTab').classList.toggle('active', !isLibrary);
    $('libraryTab').classList.toggle('active', isLibrary);
    $('practiceTab').setAttribute('aria-current', !isLibrary ? 'page' : 'false');
    $('libraryTab').setAttribute('aria-current', isLibrary ? 'page' : 'false');
    $('practiceView').hidden = isLibrary;
    $('libraryView').hidden = !isLibrary;
    document.querySelector('.mobile-chapter').hidden = isLibrary;
    for (const el of document.querySelectorAll('[data-action="type"]')) el.setAttribute('aria-pressed', el.dataset.value === state.type);
    $('orderButton').setAttribute('aria-pressed', state.order === 'random');
    $('orderButton').innerHTML = `<span aria-hidden="true">⇄</span> ${state.order === 'random' ? '随机练习中' : '随机练习'}`;
    $('wrongModeButton').setAttribute('aria-pressed', state.mode === 'wrong');
    $('wrongModeButton').textContent = state.mode === 'wrong' ? '返回本章练习' : '重练本章错题';
  }
  function palette() {
    $('queueCount').textContent = `${state.queue.length} 题`;
    $('palette').innerHTML = state.queue.map((id, i) => {
      const q = session.questions.get(id), a = session.record(id);
      const status = a ? (a.correct ? '答对' : '答错') : '未答';
      return `<button class="palette-button ${a ? (a.correct ? 'done' : 'wrong') : ''} ${state.view !== 'summary' && i === state.index ? 'current' : ''}" data-action="jump" data-value="${i}" aria-label="${q.type === 'single' ? '单选题' : '多选题'}原文第${q.number}题，${status}" ${i === state.index && state.view !== 'summary' ? 'aria-current="step"' : ''}>${i + 1}</button>`;
    }).join('');
  }
  function emptyPractice() {
    $('questionArea').innerHTML = `<div class="empty-card"><div class="empty-icon" aria-hidden="true">✓</div><h2>本章暂无待巩固错题</h2><p>完成章节练习后，答错的题会自动收录。<br>已经重练答对的错题仍可以在错题库查看。</p><button class="primary-button" data-action="all-mode">返回本章练习</button></div>`;
  }
  function summary() {
    const n = session.stats(state.queue, true);
    const nextChapter = bank.chapters.indexOf(session.chapter()) < bank.chapters.length - 1;
    const remaining = n.total - n.answered;
    $('questionArea').innerHTML = `<div class="summary-card"><div class="empty-icon" aria-hidden="true">✓</div><p class="eyebrow">${escape(session.chapter().label)} · 练习情况</p><h2>${remaining ? '看看这组练习的完成情况' : '这一组题练习完成'}</h2><p>${remaining ? `还有 ${remaining} 道题没有完成作答，可以返回继续。` : '答题情况已保存，错题已汇总到错题库。'}</p><div class="summary-stats"><div class="summary-stat"><strong>${n.answered}/${n.total}</strong><span>已答题目</span></div><div class="summary-stat"><strong style="color:var(--green)">${n.correct}</strong><span>回答正确</span></div><div class="summary-stat"><strong style="color:var(--red)">${n.incorrect}</strong><span>需要巩固</span></div></div><div class="summary-actions"><button class="secondary-button" data-action="continue">返回题目</button><button class="secondary-button" data-action="retry-group">重新练这一组</button><button class="primary-button" data-action="library">查看错题库</button>${nextChapter ? '<button class="secondary-button" data-action="next-chapter">练习下一章 →</button>' : ''}</div></div>`;
  }
  function question() {
    const q = session.current();
    if (!q) return emptyPractice();
    if (state.view === 'summary') return summary();
    const a = session.record(q.id), selected = a?.selected || state.drafts[q.id] || [];
    const multi = q.type === 'multiple';
    const result = a ? session.evaluate(q, selected) : null;
    const options = q.options.map(o => {
      const isSelected = selected.includes(o.key), isCorrect = q.answer.includes(o.key);
      let cls = isSelected && !a ? 'selected' : '';
      let status = '';
      if (a) {
        if (isCorrect) { cls = 'correct' + (isSelected ? '' : ' missed'); status = isSelected ? '正确' : multi ? '漏选' : '答案'; }
        else if (isSelected) { cls = 'incorrect'; status = '错选'; }
      }
      return `<button class="option ${cls}" data-action="option" data-value="${o.key}" aria-pressed="${isSelected}" ${a ? 'disabled' : ''}><span class="option-letter">${o.key}</span><span class="option-text">${escape(o.text)}</span>${status ? `<span class="option-status">${status}</span>` : ''}</button>`;
    }).join('');
    let resultText = '回答正确';
    if (result && !result.correct) resultText = !multi ? '回答有误，请看解析' : result.extra.length && result.missed.length ? '有错选，也有漏选' : result.extra.length ? '回答有误，请看解析' : '少选了正确选项';
    $('questionArea').innerHTML = `<article class="question-card"><div class="question-meta"><span class="type-badge ${multi ? 'multi' : ''}">${multi ? '多选题' : '单选题'}</span><span>原文第 ${q.number} 题</span><span class="question-count"><strong>${state.index + 1}</strong> / ${state.queue.length}</span></div>
      <h2 id="questionTitle" class="question-title" tabindex="-1">${escape(q.stem)}</h2>
      <p class="question-instruction">${a ? '本题已作答，可查看答案与详细解析。' : multi ? '可选择多个选项，选完后点击“提交答案”。' : '请选择一个选项，点击后立即显示答案与解析。'}</p>
      <div class="options" aria-label="选择答案">${options}</div>
      ${multi && !a ? `<div class="question-actions"><button class="primary-button" data-action="submit" ${selected.length ? '' : 'disabled'}>提交答案</button><span class="selection-caption">${selected.length ? '已选：' + selected.join('、') : '请先选择选项'}</span></div>` : ''}
      ${a ? `<section class="answer-panel" id="answerPanel" tabindex="-1" aria-label="本题答案与解析"><div class="answer-result ${a.correct ? '' : 'wrong'}"><strong><span class="result-symbol" aria-hidden="true">${a.correct ? '✓' : '×'}</span>${resultText}</strong><button class="retry-button" data-action="retry">重新作答</button></div><p class="answer-letters">你的选择 <b>${selected.join('、')}</b> · 原文参考答案 <b>${q.answer.join('、')}</b></p>${explanation(q)}</section>` : ''}
      <div class="question-navigation"><button class="secondary-button" data-action="previous" ${state.index === 0 ? 'disabled' : ''}>← 上一题</button><span class="navigation-caption">${a ? '读完解析，再继续下一题' : '答案将在本题作答后呈现'}</span><button class="${a ? 'primary' : 'secondary'}-button" data-action="next">${state.index === state.queue.length - 1 ? '查看练习情况' : '下一题 →'}</button></div></article>`;
  }
  function library() {
    $('libraryChapter').value = state.libraryChapter;
    for (const el of document.querySelectorAll('[data-action="library-filter"]')) el.setAttribute('aria-pressed', el.dataset.value === state.libraryFilter);
    const items = session.libraryItems();
    if (!items.length) {
      $('libraryList').innerHTML = `<div class="empty-card"><div class="empty-icon" aria-hidden="true">✓</div><h2>${Object.keys(state.wrong).length ? '当前筛选下没有错题' : '错题库还是空的'}</h2><p>${Object.keys(state.wrong).length ? '可以切换章节或查看全部错题。' : '先做几道题吧。答错的题会自动收录在这里，供你查看和重练。'}</p><button class="primary-button" data-action="practice">继续章节练习</button></div>`;
      return;
    }
    let lastChapter = '';
    $('libraryList').innerHTML = items.map(({ chapter: c, question: q, wrong: w }) => {
      const heading = lastChapter !== c.id ? `<h2 class="library-group-title">${c.label}${c.label !== c.title ? ' · ' + escape(c.title) : ''}</h2>` : '';
      lastChapter = c.id;
      return `${heading}<article class="wrong-card"><div class="wrong-card-header"><span class="type-badge ${q.type === 'multiple' ? 'multi' : ''}">${q.type === 'single' ? '单选题' : '多选题'}</span><span>原文第 ${q.number} 题</span><span class="${w.mastered ? 'mastered' : 'pending'}-badge">${w.mastered ? '已掌握' : '待巩固'}</span></div><h3>${escape(q.stem)}</h3><p class="wrong-meta">答错 ${w.count} 次 · 上次答错时选择了 ${w.lastSelected.join('、')}</p><div class="wrong-card-bottom"><details class="wrong-details"><summary>查看题目选项、答案与解析</summary><div class="library-options">${q.options.map(o => `<div class="library-option ${q.answer.includes(o.key) ? 'correct' : ''}"><b>${o.key}</b>${escape(o.text)}${q.answer.includes(o.key) ? ' <span>（正确选项）</span>' : ''}</div>`).join('')}</div><p class="library-answer">原文参考答案：${q.answer.join('、')}</p>${explanation(q)}</details><button class="secondary-button" data-action="review-one" data-value="${q.id}">重练这一题 ↗</button></div></article>`;
    }).join('');
  }
  function render() { header(); if (state.view === 'library') library(); else { palette(); question(); } }
  function afterChange(selector) { persist(); render(); if (selector) focus(selector); }
  function act(action, value) {
    if (action === 'option') {
      const submitted = session.select(value);
      afterChange(submitted ? '#answerPanel' : `[data-action="option"][data-value="${value}"]`);
      if (submitted) announce(`${session.record(session.current().id).correct ? '回答正确' : '回答有误'}，答案和解析已显示。`);
      return;
    }
    if (action === 'submit') { if (session.submit()) { afterChange('#answerPanel'); announce('答案和详细解析已显示。'); } return; }
    if (action === 'chapter') session.configure({ chapterId: value, type: 'all', mode: 'all' });
    else if (action === 'type') session.configure({ type: value }, state.mode === 'wrong');
    else if (action === 'order') session.configure({ order: state.order === 'random' ? 'sequential' : 'random' }, state.mode === 'wrong');
    else if (action === 'wrong-mode') session.configure({ mode: state.mode === 'wrong' ? 'all' : 'wrong' }, state.mode !== 'wrong');
    else if (action === 'all-mode') session.configure({ mode: 'all' });
    else if (action === 'retry') session.retry();
    else if (action === 'previous') session.move(-1);
    else if (action === 'next') session.move(1);
    else if (action === 'jump') session.jump(Number(value));
    else if (action === 'library') state.view = 'library';
    else if (action === 'practice') state.view = 'practice';
    else if (action === 'library-filter') state.libraryFilter = value;
    else if (action === 'review-one') session.openWrong(value);
    else if (action === 'continue') { state.view = 'practice'; const i = state.queue.findIndex(id => !session.record(id)); if (i >= 0) state.index = i; }
    else if (action === 'retry-group') { for (const id of state.queue) { state.pending[id] = true; delete state.drafts[id]; } state.index = 0; state.view = 'practice'; }
    else if (action === 'next-chapter') { const i = bank.chapters.indexOf(session.chapter()); if (bank.chapters[i + 1]) session.configure({ chapterId: bank.chapters[i + 1].id, type: 'all', mode: 'all' }); }
    else return;
    afterChange(state.view === 'practice' ? '#questionTitle' : undefined);
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    act(button.dataset.action, button.dataset.value);
  });
  $('chapterSelect').addEventListener('change', event => act('chapter', event.target.value));
  $('libraryChapter').addEventListener('change', event => { state.libraryChapter = event.target.value; afterChange(); });
  document.addEventListener('keydown', event => {
    if (event.ctrlKey || event.metaKey || event.altKey || event.repeat || state.view !== 'practice' || ['INPUT', 'TEXTAREA', 'SELECT', 'SUMMARY'].includes(event.target.tagName) || event.target.isContentEditable) return;
    if (event.key === 'Enter' && event.target.tagName === 'BUTTON' && event.target.dataset.action !== 'option') return;
    const q = session.current(); if (!q) return;
    if (/^[a-eA-E1-5]$/.test(event.key) && !session.record(q.id)) { event.preventDefault(); act('option', /^[1-5]$/.test(event.key) ? 'ABCDE'[Number(event.key) - 1] : event.key.toUpperCase()); }
    else if (event.key === 'Enter') { event.preventDefault(); act(session.record(q.id) ? 'next' : 'submit'); }
  });
  persist();
  render();
})();
