(() => {
  'use strict';

  const chapters = globalThis.XIGAI_FINAL_BANK;
  const { PracticeBook, evaluate } = globalThis.FinalReviewCore;
  const storageKey = 'xigai-final-review-v1';
  const content = document.getElementById('content');
  const sidebarCount = document.getElementById('wrong-count');
  const restartDialog = document.getElementById('restart-dialog');
  const storageMessage = document.getElementById('storage-message');
  const typeLabels = { all: '全部题型', single: '单选题', multiple: '多选题' };
  const allNotes = chapters.flatMap(chapter => chapter.notes.map(note => ({ ...note, chapter })));
  const allThoughts = chapters.flatMap(chapter => chapter.thoughts.map(thought => ({ ...thought, chapter })));

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey));
  } catch {
    storageMessage.textContent = '暂时无法读取本地学习记录。';
  }
  const book = new PracticeBook(chapters, saved);
  const { state } = book;

  const search = {
    knowledge: '',
    thoughts: '',
    wrong: '',
    wrongChapter: 'all',
    wrongStatus: 'pending',
    wrongLimit: 30,
    missingNotesOnly: false
  };
  let route;
  let notifyTimer;

  function escapeHtml(value) {
    const replacements = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
    return String(value ?? '').replace(/[&<>"']/g, ch => replacements[ch]);
  }

  function normalize(value) {
    return String(value).normalize('NFKC').toLowerCase()
      .replace(/[\s“”"'‘’《》()（）·–—、，。！：？；,.:;!?-]+/g, '');
  }

  function matchQuery(query, fields) {
    const text = normalize(fields.join(' '));
    return String(query).trim().split(/\s+/).map(normalize).every(token => text.includes(token));
  }

  function chapterLabel(chapter) {
    return '第' + chapter.number + '章';
  }

  function save() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
      storageMessage.textContent = '学习进度和错题已保存在此浏览器。';
    } catch {
      storageMessage.textContent = '此浏览器暂时无法保存学习记录。';
    }
  }

  function showNotice(message) {
    const notice = document.getElementById('notice');
    notice.textContent = message;
    notice.hidden = false;
    clearTimeout(notifyTimer);
    notifyTimer = setTimeout(() => { notice.hidden = true; }, 2400);
  }

  function readRoute() {
    const [view, requested] = location.hash.slice(1).split('/');
    const chapter = book.chapters.has(requested) ? requested : 'all';
    if (view === 'knowledge' || view === 'thoughts') return { view, chapter };
    if (view === 'wrong') return { view };
    if (view === 'practice') {
      const target = ['all', 'wrong'].includes(requested) || book.chapters.has(requested)
        ? requested
        : state.lastRound;
      return { view, target };
    }
    return { view: 'home' };
  }

  function navigate(hash) {
    if (location.hash === hash) {
      renderPage();
      content.scrollIntoView({ block: 'start' });
      return;
    }
    location.hash = hash;
  }

  function updateNavigation() {
    const active = route.view === 'practice'
      ? (route.target === 'wrong' ? 'wrong' : 'home')
      : route.view;
    document.querySelectorAll('.site-nav a').forEach(link => {
      if (link.dataset.view === active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const count = Object.keys(state.wrong).length;
    sidebarCount.hidden = count === 0;
    sidebarCount.textContent = count;
  }

  function pageHeading(title, subtitle, extra = '') {
    return `<div class="page-heading">
      <div><h1>${title}</h1><p>${subtitle}</p></div>${extra}
    </div>`;
  }

  function emptyState(title, text, action = '') {
    return `<div class="empty-state"><h2>${title}</h2><p>${text}</p>${action}</div>`;
  }

  function chapterSelect(id, selected, allText) {
    const allOption = allText ? `<option value="all">${allText}</option>` : '';
    const options = chapters.map(chapter => {
      const value = String(chapter.number);
      return `<option value="${value}" ${selected === value ? 'selected' : ''}>
        ${chapterLabel(chapter)} · ${escapeHtml(chapter.shortTitle)}
      </option>`;
    }).join('');
    return `<span class="select-wrap"><select id="${id}">${allOption}${options}</select></span>`;
  }

  function renderHome() {
    const total = book.questions.size;
    const answered = Object.keys(state.answers).length;
    const pending = Object.values(state.wrong).filter(item => !item.mastered).length;
    const lastRound = state.rounds[state.lastRound];
    const hasProgress = answered > 0 || Object.keys(lastRound?.drafts ?? {}).length > 0;
    const start = hasProgress ? state.lastRound : '1';
    const primaryLabel = hasProgress ? '继续上次练习' : '开始第1章';

    const chapterCards = chapters.map(chapter => {
      const ids = book.pool(String(chapter.number));
      const stats = book.stats(ids);
      const percentage = Math.round(stats.answered / stats.total * 100);
      return `<a class="chapter-card" href="#practice/${chapter.number}">
        <span class="chapter-card-top">
          <span class="chapter-number">${chapterLabel(chapter)}</span>
          <span class="chapter-total">${stats.total} 题</span>
        </span>
        <strong>${escapeHtml(chapter.title)}</strong>
        <span class="chapter-progress">
          <span class="progress-track"><span style="width:${percentage}%"></span></span>
          <span>已答 ${stats.answered}</span>
        </span>
      </a>`;
    }).join('');

    return `<section class="hero">
      <div class="hero-copy">
        <p class="hero-subtitle">《习近平新时代中国特色社会主义思想概论》2023版</p>
        <h1>习概期末复习</h1>
        <p class="hero-scope">第1—17章 · 逐题练习、错题巩固和课后题速记</p>
        <div class="actions">
          <a class="button on-red" href="#practice/${start}">${primaryLabel}</a>
          <button class="button outline-red" data-action="random-all">全题库乱序</button>
        </div>
      </div>
      <dl class="hero-metrics">
        <div><dt>选择题</dt><dd>${total}</dd></div>
        <div><dt>知识点</dt><dd>${allNotes.length}</dd></div>
        <div><dt>课后思考题</dt><dd>${allThoughts.length}</dd></div>
      </dl>
    </section>
    <section class="home-chapters" aria-labelledby="chapter-heading">
      <div class="section-heading">
        <h2 id="chapter-heading">章节刷题</h2>
        <span>已答 ${answered} / ${total} · <a href="#wrong">${pending} 道待巩固</a></span>
      </div>
      <div class="chapter-grid">${chapterCards}</div>
    </section>
    <section class="study-entry" aria-label="复习资料">
      <a href="#knowledge"><strong>知识点查找库</strong><span>按章节或关键词查找 ${allNotes.length} 组要点</span></a>
      <a href="#thoughts"><strong>课后思考题</strong><span>按教材题序背诵 ${allThoughts.length} 道分点答案</span></a>
    </section>`;
  }

  function renderPractice() {
    const round = book.open(route.target);
    const chapter = book.chapters.get(round.target);
    const isWrong = round.target === 'wrong';
    const queue = book.visibleQueue(round);
    const roundTitle = chapter ? chapter.title : isWrong ? '错题专项练习' : '全题库练习';
    const status = book.stats(queue, round.submissions);
    const labels = chapter
      ? `<p class="chapter-number">${chapterLabel(chapter)}</p>`
      : '';
    const note = chapter?.number === 3
      ? '<p class="chapter-note">原站第3章以党建题为主。可结合本章知识点复习党的全面领导。</p>'
      : '';
    const chapterOptions = chapters.map(ch => `<a class="${chapter?.number === ch.number ? 'active' : ''}"
        href="#practice/${ch.number}" ${chapter?.number === ch.number ? 'aria-current="page"' : ''}>
      <span>${chapterLabel(ch)}</span><span>${escapeHtml(ch.shortTitle)}</span>
    </a>`).join('');
    const typeButtons = Object.entries(typeLabels).map(([type, label]) =>
      `<button data-action="type" data-value="${type}" aria-pressed="${round.type === type}">${label}</button>`
    ).join('');
    const knowledgeDestination = chapter ? '#knowledge/' + chapter.number : '#knowledge';
    const thoughtDestination = chapter ? '#thoughts/' + chapter.number : '#thoughts';
    const quiz = !queue.length
      ? emptyState('当前筛选下无题目', '可以切换题型，或返回继续选题。')
      : round.summary ? renderSummary(round, queue, status) : renderQuestion(round, queue);

    return `<a class="back-link" href="${isWrong ? '#wrong' : '#home'}">${isWrong ? '返回错题库' : '返回章节目录'}</a>
    <div class="practice-layout">
      <aside class="chapter-sidebar" aria-label="切换章节"><p>章节目录</p>${chapterOptions}</aside>
      <div class="practice-main">
        <div class="mobile-chapters">
          <label for="practice-chapter">切换章节</label>
          ${chapterSelect('practice-chapter', chapter ? String(chapter.number) : 'all',
            isWrong ? '当前为错题专项' : '全题库练习')}
        </div>
        ${labels}
        ${pageHeading(escapeHtml(roundTitle), `本轮已答 ${status.answered} / ${status.total} · 答对 ${status.right}`)}
        ${note}
        <div class="practice-toolbar">
          <div class="segmented" role="group" aria-label="筛选题型">${typeButtons}</div>
          <div class="actions">
            <div class="segmented" role="group" aria-label="作答顺序">
              <button data-action="order" data-value="normal" aria-pressed="${!round.random}">顺序</button>
              <button data-action="order" data-value="random" aria-pressed="${round.random}">乱序</button>
            </div>
            <button class="button secondary compact" data-action="restart">${chapter ? '重练本章' : '重练本轮'}</button>
          </div>
        </div>
        ${quiz}
        ${queue.length ? renderPalette(round, queue) : ''}
        <section class="study-entry" aria-label="相关复习">
          <a href="${knowledgeDestination}"><strong>知识点查找库</strong><span>${chapter ? '查找本章要点' : '搜索教材知识点'}</span></a>
          <a href="${thoughtDestination}"><strong>课后思考题</strong><span>${chapter ? '查看本章速记答案' : '查看各章速记答案'}</span></a>
        </section>
      </div>
    </div>`;
  }

  function renderQuestion(round, queue) {
    const id = round.current;
    const question = book.questions.get(id);
    const record = round.submissions[id];
    const selected = record?.selected ?? round.drafts[id] ?? [];
    const index = queue.indexOf(id);
    const chapter = book.chapters.get(String(question.chapter));
    const optionType = question.type === 'single' ? 'radio' : 'checkbox';
    const options = question.options.map((option, i) => {
      const key = String.fromCharCode(65 + i);
      const picked = selected.includes(key);
      let result = picked ? 'selected' : '';
      if (record) {
        if (question.answer.includes(key)) result = 'correct';
        else if (picked) result = 'incorrect';
      }
      return `<label class="option ${result}">
        <input type="${optionType}" name="choice" data-key="${key}" ${picked ? 'checked' : ''} ${record ? 'disabled' : ''}>
        <span class="option-key" aria-hidden="true">${key}</span>
        <span class="sr-only">${key}.</span>
        <span>${escapeHtml(option)}</span>
      </label>`;
    }).join('');

    return `<section class="question-card" aria-labelledby="question-text">
      <div class="question-meta">
        <div><span class="question-type">${typeLabels[question.type]}</span>
          <span>${chapterLabel(chapter)} · 原站题序 ${question.number}</span>
        </div>
        <span class="question-position"><strong>${index + 1}</strong> / ${queue.length}</span>
      </div>
      <h2 id="question-text" tabindex="-1">${escapeHtml(question.stem)}</h2>
      <form id="answer-form">
        <fieldset class="options">
          <legend class="sr-only">选择答案</legend>
          ${options}
        </fieldset>
        ${record ? renderFeedback(question, record) : `<p class="answer-hint">${question.type === 'single'
          ? '选择一项后提交，查看本题答案和详解。'
          : '选择所有正确选项后提交，查看本题答案和详解。'}</p>`}
        <div class="question-actions">
          <button type="button" class="button secondary" data-action="previous" ${index === 0 ? 'disabled' : ''}>
            上一题
          </button>
          <div class="actions">${record
            ? `<button type="button" class="button secondary" data-action="retry">重新作答</button>
               <button type="button" class="button primary" data-action="next">${index < queue.length - 1 ? '下一题' : '本轮小结'}</button>`
            : `<button type="submit" class="button primary" id="submit-answer" ${selected.length ? '' : 'disabled'}>
                提交答案
              </button>`}
          </div>
        </div>
      </form>
    </section>`;
  }

  function renderFeedback(question, answer) {
    const result = evaluate(question, answer.selected);
    const correctChoices = question.answer.map(letter =>
      `${letter}. ${escapeHtml(question.options[letter.charCodeAt(0) - 65])}`
    );
    const errors = [
      result.missed.length && question.type === 'multiple' ? '漏选 ' + result.missed.join('、') : '',
      result.extra.length && question.type === 'multiple' ? '误选 ' + result.extra.join('、') : ''
    ].filter(Boolean).join('，');
    return `<section class="feedback ${answer.correct ? 'is-correct' : 'is-incorrect'}" tabindex="-1" aria-label="答案与详解">
      <div class="feedback-status" role="status">
        <strong>${answer.correct ? '回答正确' : '回答有误，已加入错题库'}</strong>
        <span>你的选择 ${answer.selected.join('、')}</span>
      </div>
      <div class="feedback-body">
        <h3>正确答案 ${question.answer.join('、')}</h3>
        <ul>${correctChoices.map(choice => `<li>${choice}</li>`).join('')}</ul>
        ${errors ? `<p class="answer-error">${errors}</p>` : ''}
        <h3>详细解析</h3>
        <p>${escapeHtml(question.explanation)}</p>
        ${question.basis ? `<p class="editor-note">${escapeHtml(question.basis)}</p>` : ''}
        <div class="feedback-links">
          <a href="#knowledge/${question.chapter}">${question.topic
            ? '教材考点 · ' + escapeHtml(question.topic) : '查看本章知识点'}</a>
          ${question.reference ? `<a href="${escapeHtml(question.reference)}" target="_blank" rel="noopener noreferrer">核对依据</a>` : ''}
        </div>
      </div>
    </section>`;
  }

  function renderPalette(round, queue) {
    const activeIndex = queue.indexOf(round.current);
    const start = queue.length > 60 ? Math.floor(Math.max(0, activeIndex) / 50) * 50 : 0;
    const visible = queue.length > 60 ? queue.slice(start, start + 50) : queue;
    const buttons = visible.map((id, i) => {
      const record = round.submissions[id];
      const number = start + i + 1;
      const current = id === round.current && !round.summary;
      const status = record ? record.correct ? '答对' : '答错' : '未答';
      return `<button data-action="jump" data-id="${id}" class="${record ? record.correct ? 'correct' : 'incorrect' : ''}"
        aria-label="第${number}题，${status}" ${current ? 'aria-current="step"' : ''}>${number}</button>`;
    }).join('');
    return `<details class="palette-card" open>
      <summary>答题卡</summary>
      <div class="palette-body">
        ${queue.length > 60 ? `<form id="jump-form" class="jump-form">
          <label for="jump-number">跳到第几题</label>
          <input id="jump-number" type="number" min="1" max="${queue.length}" placeholder="${Math.max(activeIndex + 1, 1)}" required>
          <button class="button secondary compact" type="submit">跳转</button>
        </form>` : ''}
        <div class="palette" aria-label="题号">${buttons}</div>
        <p class="legend"><span>灰色未答</span><span class="right-text">绿色答对</span><span class="wrong-text">红色答错</span></p>
      </div>
    </details>`;
  }

  function renderSummary(round, queue, status) {
    const remaining = queue.filter(id => !round.submissions[id]);
    return `<section class="question-card summary-card">
      <h2 id="question-text" tabindex="-1">${remaining.length ? '本轮还有题目未答' : '本轮练习完成'}</h2>
      <p class="summary-score">答对 ${status.right} / 已答 ${status.answered}</p>
      <p>答错 ${status.answered - status.right} 道 · 未答 ${remaining.length} 道</p>
      <div class="actions">
        ${remaining.length ? `<button class="button primary" data-action="jump" data-id="${remaining[0]}">继续未答题</button>` : ''}
        <a class="button secondary" href="#wrong">复习错题</a>
        <button class="button secondary" data-action="restart">重新练习</button>
      </div>
    </section>`;
  }

  function getWrongQuestions() {
    const results = Object.entries(state.wrong)
      .filter(([, item]) => search.wrongStatus === 'all' || item.mastered === (search.wrongStatus === 'mastered'))
      .map(([id, result]) => ({ ...result, question: book.questions.get(id) }))
      .filter(({ question }) => search.wrongChapter === 'all' || String(question.chapter) === search.wrongChapter)
      .filter(({ question }) => matchQuery(search.wrong, [question.stem, ...question.options]))
      .sort((left, right) => right.lastWrong - left.lastWrong);
    return results;
  }

  function renderWrongList() {
    const list = getWrongQuestions();
    const savedCount = Object.keys(state.wrong).length;
    if (!list.length) {
      return emptyState(
        savedCount ? '没有符合条件的错题' : '错题库还是空的',
        savedCount ? '试试其他章节、关键词或巩固状态。' : '答错的题会自动收录到这里。',
        savedCount ? '' : '<a class="button primary" href="#home">开始刷题</a>'
      );
    }
    return `<div class="section-heading result-heading">
      <p role="status">当前 ${list.length} 道错题</p>
      <button class="button primary" data-action="wrong-round">乱序专项练习</button>
    </div>
    <div class="wrong-list">
      ${list.slice(0, search.wrongLimit).map(({ question, count, mastered }) => {
        const chapter = book.chapters.get(String(question.chapter));
        return `<article class="wrong-card">
          <div>
            <p class="wrong-meta">${chapterLabel(chapter)} · ${escapeHtml(chapter.shortTitle)}
              <span class="${mastered ? 'right-text' : 'wrong-text'}">${mastered ? '已巩固' : '待巩固'}</span>
            </p>
            <h2>${escapeHtml(question.stem)}</h2>
            <p class="wrong-meta">${typeLabels[question.type]} · 答错 ${count} 次</p>
            <details class="wrong-options">
              <summary>查看选项</summary>
              <ol type="A">${question.options.map(option => `<li>${escapeHtml(option)}</li>`).join('')}</ol>
            </details>
          </div>
          <button class="button secondary" data-action="wrong-one" data-id="${question.id}">重新练习</button>
        </article>`;
      }).join('')}
    </div>${list.length > search.wrongLimit
      ? '<button class="button secondary show-more" data-action="more-wrong">显示更多错题</button>' : ''}`;
  }

  function renderWrong() {
    const wrong = Object.values(state.wrong);
    const mastered = wrong.filter(item => item.mastered).length;
    return `${pageHeading('错题库', `待巩固 ${wrong.length - mastered} 道 · 已巩固 ${mastered} 道`)}
    <div class="filters">
      <label class="search-label" for="wrong-search"><span>题目关键词</span>
        <input type="search" id="wrong-search" placeholder="搜索题干或选项" value="${escapeHtml(search.wrong)}">
      </label>
      <label for="wrong-chapter">章节${chapterSelect('wrong-chapter', search.wrongChapter, '全部章节')}</label>
      <label for="wrong-status">巩固状态<span class="select-wrap"><select id="wrong-status">
        ${[['pending', '待巩固'], ['mastered', '已巩固'], ['all', '全部错题']].map(([value, label]) =>
          `<option value="${value}" ${search.wrongStatus === value ? 'selected' : ''}>${label}</option>`
        ).join('')}
      </select></span></label>
    </div>
    <div id="wrong-results">${renderWrongList()}</div>`;
  }

  function scopeContains(chapter) {
    return route.chapter === 'all' || route.chapter === String(chapter.number);
  }

  function renderNoteResults() {
    const notes = allNotes.filter(note => scopeContains(note.chapter) &&
      (!search.missingNotesOnly || !state.remembered[note.id]) &&
      matchQuery(search.knowledge, [note.title, note.chapter.title, ...note.points, note.tip]));
    if (!notes.length) return emptyState('没有找到知识点', '可尝试缩短关键词，或切换到全部章节。');

    return `<p class="results-count" role="status">找到 ${notes.length} 组 · 已记住 ${Object.keys(state.remembered).length} / ${allNotes.length} 组</p>
      <div class="note-grid">${notes.map(note => `<article class="note-card">
        <p class="card-chapter">${chapterLabel(note.chapter)} · ${escapeHtml(note.chapter.shortTitle)}</p>
        <h2>${escapeHtml(note.title)}</h2>
        <ul>${note.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ul>
        <p class="recall-tip"><strong>速记</strong> ${escapeHtml(note.tip)}</p>
        <div class="card-footer">
          <span>教材第${note.chapter.firstPage}—${note.chapter.lastPage}页</span>
          <button class="button secondary compact" data-action="remember" data-id="${note.id}"
            aria-pressed="${!!state.remembered[note.id]}">${state.remembered[note.id] ? '已记住' : '标记记住'}</button>
        </div>
      </article>`).join('')}</div>`;
  }

  function renderKnowledge() {
    return `${pageHeading('知识点查找库', '第1—17章教材要点，按章节和关键词检索。')}
      <div class="filters">
        <label class="search-label" for="knowledge-search"><span>知识点关键词</span>
          <input id="knowledge-search" type="search" placeholder="例如：新发展格局、三不腐" value="${escapeHtml(search.knowledge)}">
        </label>
        <label for="knowledge-chapter">章节${chapterSelect('knowledge-chapter', route.chapter, '全部章节')}</label>
        <button class="button secondary filter-button" data-action="missing-notes" aria-pressed="${search.missingNotesOnly}">只看未记住</button>
      </div>
      <div id="note-results">${renderNoteResults()}</div>`;
  }

  function renderThoughtResults() {
    const thoughts = allThoughts.filter(thought => scopeContains(thought.chapter) &&
      matchQuery(search.thoughts, [
        thought.question, thought.chapter.title, thought.tip, ...thought.parts.flatMap(part => part.points)
      ]));
    if (!thoughts.length) return emptyState('没有找到课后思考题', '可尝试其他关键词，或切换到全部章节。');

    const groups = chapters.map(chapter => {
      const list = thoughts.filter(thought => thought.chapter.number === chapter.number);
      if (!list.length) return '';
      const questions = list.map(thought => `<details class="thought-card">
        <summary><span class="thought-number">${thought.number}.</span><span>${escapeHtml(thought.question)}</span></summary>
        <div class="thought-answer">
          ${thought.parts.map(part => `${part.heading ? `<h3>${escapeHtml(part.heading)}</h3>` : ''}
            <ol>${part.points.map(point => `<li>${escapeHtml(point)}</li>`).join('')}</ol>`).join('')}
          <p class="recall-tip"><strong>速记</strong> ${escapeHtml(thought.tip)}</p>
          <div class="card-footer">
            <span>教材第${chapter.lastPage}页</span>
            <button class="button secondary compact" data-action="recall" data-id="${thought.id}"
              aria-pressed="${!!state.recalled[thought.id]}">${state.recalled[thought.id] ? '已掌握' : '标记掌握'}</button>
          </div>
        </div>
      </details>`).join('');
      return `<section class="thought-chapter">
        <h2>${chapterLabel(chapter)} · ${escapeHtml(chapter.title)}</h2>
        <div class="thought-list">${questions}</div>
      </section>`;
    }).join('');
    return `<p class="results-count" role="status">找到 ${thoughts.length} 道 · <span id="thought-progress">
      已掌握 ${Object.keys(state.recalled).length} / ${allThoughts.length} 道</span></p>${groups}`;
  }

  function renderThoughts() {
    return `${pageHeading('课后思考题', '按教材原题逐题整理。展开查看简短分点答案和速记词。')}
      <div class="filters">
        <label class="search-label" for="thought-search"><span>思考题关键词</span>
          <input id="thought-search" type="search" placeholder="搜索题目或答案关键词" value="${escapeHtml(search.thoughts)}">
        </label>
        <label for="thought-chapter">章节${chapterSelect('thought-chapter', route.chapter, '全部章节')}</label>
        <button class="button secondary filter-button" data-action="thought-toggle" aria-expanded="false">展开全部</button>
      </div>
      <div id="thought-results">${renderThoughtResults()}</div>`;
  }

  function renderPage() {
    route = readRoute();
    updateNavigation();
    const views = {
      home: renderHome,
      practice: renderPractice,
      wrong: renderWrong,
      knowledge: renderKnowledge,
      thoughts: renderThoughts
    };
    content.innerHTML = views[route.view]();
    if (route.view === 'practice') save();
  }

  function moveToQuestion(round, id) {
    book.jump(round, id);
    renderPage();
    document.getElementById('question-text')?.focus();
  }

  function setStudyFilter(view, chapter) {
    navigate('#' + view + (chapter === 'all' ? '' : '/' + chapter));
  }

  function updateStudyMark(button, stored, on, off) {
    const id = button.dataset.id;
    if (stored[id]) delete stored[id];
    else stored[id] = true;
    button.textContent = stored[id] ? on : off;
    button.setAttribute('aria-pressed', !!stored[id]);
    save();
  }

  content.addEventListener('click', event => {
    const button = event.target.closest('button[data-action]');
    if (!button || button.disabled) return;
    const { action, id, value } = button.dataset;

    if (action === 'random-all') {
      const prior = state.rounds.all;
      if (prior) book.changeOrder(prior, true);
      else book.start('all', { random: true });
      navigate('#practice/all');
      return;
    }

    if (action === 'wrong-round' || action === 'wrong-one') {
      const ids = action === 'wrong-one' ? [id] : getWrongQuestions().map(item => item.question.id);
      if (ids.length) {
        book.start('wrong', { ids, random: action === 'wrong-round' });
        navigate('#practice/wrong');
      }
      return;
    }

    if (action === 'more-wrong') {
      search.wrongLimit += 30;
      document.getElementById('wrong-results').innerHTML = renderWrongList();
      return;
    }

    if (action === 'remember') {
      updateStudyMark(button, state.remembered, '已记住', '标记记住');
      if (search.missingNotesOnly) document.getElementById('note-results').innerHTML = renderNoteResults();
      else document.querySelector('.results-count').textContent =
        '找到 ' + document.querySelectorAll('.note-card').length + ' 组 · 已记住 ' +
        Object.keys(state.remembered).length + ' / ' + allNotes.length + ' 组';
      return;
    }

    if (action === 'recall') {
      updateStudyMark(button, state.recalled, '已掌握', '标记掌握');
      document.getElementById('thought-progress').textContent =
        '已掌握 ' + Object.keys(state.recalled).length + ' / ' + allThoughts.length + ' 道';
      return;
    }

    if (action === 'missing-notes') {
      search.missingNotesOnly = !search.missingNotesOnly;
      button.setAttribute('aria-pressed', search.missingNotesOnly);
      document.getElementById('note-results').innerHTML = renderNoteResults();
      return;
    }

    if (action === 'thought-toggle') {
      const details = [...document.querySelectorAll('.thought-card')];
      const expand = details.some(item => !item.open);
      for (const item of details) item.open = expand;
      button.textContent = expand ? '收起全部' : '展开全部';
      button.setAttribute('aria-expanded', expand);
      return;
    }

    if (route.view !== 'practice') return;
    const round = state.rounds[route.target];
    const queue = book.visibleQueue(round);
    switch (action) {
      case 'type':
        book.filter(round, value);
        renderPage();
        content.querySelector(`[data-action="type"][data-value="${value}"]`)?.focus({ preventScroll: true });
        break;
      case 'order':
        book.changeOrder(round, value === 'random');
        renderPage();
        content.querySelector(`[data-action="order"][data-value="${value}"]`)?.focus({ preventScroll: true });
        break;
      case 'retry':
        book.retry(round);
        renderPage();
        document.getElementById('question-text')?.focus();
        break;
      case 'previous':
        moveToQuestion(round, queue[queue.indexOf(round.current) - 1]);
        break;
      case 'next': {
        const next = queue[queue.indexOf(round.current) + 1];
        if (next) moveToQuestion(round, next);
        else {
          round.summary = true;
          renderPage();
          document.getElementById('question-text')?.focus();
        }
        break;
      }
      case 'jump':
        moveToQuestion(round, id);
        break;
      case 'restart':
        document.getElementById('restart-title').textContent =
          book.chapters.has(round.target) ? '重练本章' : '重练本轮';
        document.getElementById('restart-detail').textContent = book.chapters.has(round.target)
          ? '本章作答记录将清零，错题库会保留。'
          : '从第一题重新开始这一轮，错题库会保留。';
        restartDialog.returnValue = '';
        restartDialog.showModal();
        break;
    }
  });

  restartDialog.addEventListener('close', () => {
    if (restartDialog.returnValue !== 'restart' || route.view !== 'practice') return;
    book.restart(state.rounds[route.target]);
    renderPage();
    showNotice('新一轮练习已开始，错题库已保留。');
    document.getElementById('question-text')?.focus();
  });

  content.addEventListener('submit', event => {
    if (route.view !== 'practice') return;
    const round = state.rounds[route.target];
    if (event.target.id === 'answer-form') {
      event.preventDefault();
      if (!book.submit(round)) return;
      renderPage();
      content.querySelector('.feedback')?.focus();
    } else if (event.target.id === 'jump-form') {
      event.preventDefault();
      const index = document.getElementById('jump-number').valueAsNumber - 1;
      moveToQuestion(round, book.visibleQueue(round)[index]);
    }
  });

  content.addEventListener('change', event => {
    const { id, value } = event.target;
    if (event.target.name === 'choice' && route.view === 'practice') {
      const round = state.rounds[route.target];
      if (!book.choose(round, event.target.dataset.key)) return;
      const selected = round.drafts[round.current];
      for (const option of content.querySelectorAll('.option')) {
        const input = option.querySelector('input');
        const picked = selected.includes(input.dataset.key);
        input.checked = picked;
        option.classList.toggle('selected', picked);
      }
      document.getElementById('submit-answer').disabled = selected.length === 0;
      save();
      return;
    }
    if (id === 'practice-chapter') {
      navigate('#practice/' + (value === 'all' && route.target === 'wrong' ? 'wrong' : value));
      return;
    }
    if (id === 'knowledge-chapter' || id === 'thought-chapter') {
      setStudyFilter(id === 'knowledge-chapter' ? 'knowledge' : 'thoughts', value);
      return;
    }
    if (id === 'wrong-chapter' || id === 'wrong-status') {
      search[id === 'wrong-chapter' ? 'wrongChapter' : 'wrongStatus'] = value;
      search.wrongLimit = 30;
      document.getElementById('wrong-results').innerHTML = renderWrongList();
    }
  });

  content.addEventListener('input', event => {
    const { id, value } = event.target;
    if (id === 'knowledge-search') {
      search.knowledge = value;
      document.getElementById('note-results').innerHTML = renderNoteResults();
    } else if (id === 'thought-search') {
      search.thoughts = value;
      document.getElementById('thought-results').innerHTML = renderThoughtResults();
      const toggle = content.querySelector('[data-action="thought-toggle"]');
      toggle.textContent = '展开全部';
      toggle.setAttribute('aria-expanded', 'false');
    } else if (id === 'wrong-search') {
      search.wrong = value;
      search.wrongLimit = 30;
      document.getElementById('wrong-results').innerHTML = renderWrongList();
    }
  });

  document.querySelector('.skip').addEventListener('click', event => {
    event.preventDefault();
    content.focus();
  });
  window.addEventListener('hashchange', () => {
    renderPage();
    window.scrollTo(0, 0);
  });
  renderPage();
})();
