(function (root) {
  'use strict';
  class QuizSession {
    constructor(bank, saved) {
      this.bank = bank;
      this.questions = new Map(bank.chapters.flatMap(c => c.questions.map(q => [q.id, q])));
      this.chapters = new Map(bank.chapters.map(c => [c.id, c]));
      this.state = {
        chapterId: bank.chapters[0].id, type: 'all', order: 'sequential', mode: 'all',
        view: 'practice', index: 0, queue: [], answers: {}, wrong: {}, drafts: {}, pending: {},
        libraryChapter: 'all', libraryFilter: 'all'
      };
      if (saved && saved.version === bank.version && saved.state) this.restore(saved.state);
      if (!this.state.queue.length) this.configure({});
    }
    restore(s) {
      if (this.chapters.has(s.chapterId)) this.state.chapterId = s.chapterId;
      for (const [key, values] of Object.entries({ type: ['all', 'single', 'multiple'], order: ['sequential', 'random'], mode: ['all', 'wrong'], view: ['practice', 'library', 'summary'], libraryFilter: ['all', 'unmastered', 'mastered'] })) {
        if (values.includes(s[key])) this.state[key] = s[key];
      }
      if (s.libraryChapter === 'all' || this.chapters.has(s.libraryChapter)) this.state.libraryChapter = s.libraryChapter;
      for (const [id, q] of this.questions) {
        const a = s.answers?.[id];
        if (a && Array.isArray(a.selected) && a.selected.length && a.selected.every(x => q.options.some(o => o.key === x))) {
          const selected = [...new Set(a.selected)].sort();
          if (q.type !== 'single' || selected.length === 1) this.state.answers[id] = { selected, correct: this.evaluate(q, selected).correct, answeredAt: Number(a.answeredAt) || 0 };
        }
        const w = s.wrong?.[id];
        if (w && Array.isArray(w.lastSelected) && w.lastSelected.every(x => q.options.some(o => o.key === x))) {
          this.state.wrong[id] = { firstWrong: Number(w.firstWrong) || 0, lastWrong: Number(w.lastWrong) || 0, count: Math.max(1, Number(w.count) || 1), lastSelected: [...new Set(w.lastSelected)].sort(), mastered: !!w.mastered };
        }
        if (Array.isArray(s.drafts?.[id])) this.state.drafts[id] = [...new Set(s.drafts[id])].filter(x => q.options.some(o => o.key === x));
        if (s.pending?.[id] === true) this.state.pending[id] = true;
      }
      const allowed = this.chapter().questions.filter(q => this.state.type === 'all' || q.type === this.state.type).map(q => q.id);
      if (Array.isArray(s.queue)) this.state.queue = [...new Set(s.queue)].filter(id => allowed.includes(id));
      this.state.index = Math.min(Math.max(0, Number(s.index) || 0), Math.max(0, this.state.queue.length - 1));
    }
    evaluate(q, selected) {
      const picked = [...new Set(selected)].sort();
      const missed = q.answer.filter(x => !picked.includes(x));
      const extra = picked.filter(x => !q.answer.includes(x));
      return { correct: !missed.length && !extra.length, missed, extra };
    }
    chapter() { return this.chapters.get(this.state.chapterId); }
    current() { return this.questions.get(this.state.queue[this.state.index]); }
    record(id) { return this.state.pending[id] ? null : this.state.answers[id] || null; }
    stats(ids, fresh = false) {
      let answered = 0, correct = 0;
      for (const id of ids) {
        const a = fresh ? this.record(id) : this.state.answers[id];
        if (a) { answered++; if (a.correct) correct++; }
      }
      return { total: ids.length, answered, correct, incorrect: answered - correct };
    }
    configure(patch, freshReview = false) {
      Object.assign(this.state, patch);
      const items = this.chapter().questions.filter(q => (this.state.type === 'all' || q.type === this.state.type) && (this.state.mode !== 'wrong' || (this.state.wrong[q.id] && !this.state.wrong[q.id].mastered)));
      const ids = items.map(q => q.id);
      if (this.state.order === 'random') {
        for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
      }
      this.state.queue = ids;
      if (freshReview) for (const id of ids) { this.state.pending[id] = true; delete this.state.drafts[id]; }
      const first = ids.findIndex(id => !this.record(id));
      this.state.index = first < 0 ? 0 : first;
      this.state.view = 'practice';
    }
    select(key) {
      const q = this.current();
      if (!q || this.record(q.id) || !q.options.some(o => o.key === key)) return false;
      if (q.type === 'single') { this.state.drafts[q.id] = [key]; return this.submit(); }
      const draft = this.state.drafts[q.id] || [];
      this.state.drafts[q.id] = draft.includes(key) ? draft.filter(x => x !== key) : [...draft, key].sort();
      return false;
    }
    submit() {
      const q = this.current();
      const selected = this.state.drafts[q?.id] || [];
      if (!q || !selected.length || this.record(q.id)) return false;
      const result = this.evaluate(q, selected);
      const now = Date.now();
      this.state.answers[q.id] = { selected: [...selected], correct: result.correct, answeredAt: now };
      if (!result.correct) {
        const previous = this.state.wrong[q.id];
        this.state.wrong[q.id] = { firstWrong: previous?.firstWrong || now, lastWrong: now, count: (previous?.count || 0) + 1, lastSelected: [...selected], mastered: false };
      } else if (this.state.wrong[q.id]) this.state.wrong[q.id].mastered = true;
      delete this.state.pending[q.id];
      delete this.state.drafts[q.id];
      return true;
    }
    retry(id = this.current()?.id) {
      if (!this.questions.has(id)) return;
      this.state.pending[id] = true;
      delete this.state.drafts[id];
      this.state.view = 'practice';
    }
    jump(index) {
      if (!Number.isInteger(index) || index < 0 || index >= this.state.queue.length) return;
      this.state.index = index;
      this.state.view = 'practice';
    }
    move(delta) {
      if (delta > 0 && this.state.index === this.state.queue.length - 1) { this.state.view = 'summary'; return; }
      this.jump(this.state.index + delta);
    }
    openWrong(id) {
      const chapter = this.bank.chapters.find(c => c.questions.some(q => q.id === id));
      if (!chapter || !this.state.wrong[id]) return;
      this.configure({ chapterId: chapter.id, type: 'all', mode: 'all' });
      this.state.mode = 'wrong';
      this.state.queue = [id];
      this.state.index = 0;
      this.retry(id);
    }
    libraryItems() {
      return this.bank.chapters.flatMap(c => c.questions.filter(q => {
        const w = this.state.wrong[q.id];
        return w && (this.state.libraryChapter === 'all' || c.id === this.state.libraryChapter) && (this.state.libraryFilter === 'all' || (this.state.libraryFilter === 'mastered' ? w.mastered : !w.mastered));
      }).map(q => ({ chapter: c, question: q, wrong: this.state.wrong[q.id] })));
    }
    serialize() { return JSON.stringify({ version: this.bank.version, state: this.state }); }
  }
  root.QuizCore = { QuizSession };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.QuizCore;
})(globalThis);
