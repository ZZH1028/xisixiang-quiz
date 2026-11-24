(function (root) {
  'use strict';

  const TYPES = ['all', 'single', 'multiple'];
  const KEYS = 'ABCDEFG';

  function validChoice(question, selected) {
    return Array.isArray(selected) &&
      selected.length > 0 &&
      (question.type !== 'single' || selected.length === 1) &&
      new Set(selected).size === selected.length &&
      selected.every(key =>
        typeof key === 'string' && key.length === 1 && KEYS.slice(0, question.options.length).includes(key)
      );
  }

  function evaluate(question, selected) {
    const missed = question.answer.filter(key => !selected.includes(key));
    const extra = selected.filter(key => !question.answer.includes(key));
    return { correct: !missed.length && !extra.length, missed, extra };
  }

  function shuffle(items, random) {
    const shuffled = [...items];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  class PracticeBook {
    constructor(chapters, saved, random = Math.random) {
      this.chapters = new Map(chapters.map(chapter => [String(chapter.number), chapter]));
      this.questions = new Map(
        chapters.flatMap(chapter => chapter.questions.map(question => [question.id, question]))
      );
      this.random = random;
      this.state = {
        version: 1,
        lastRound: '1',
        rounds: {},
        answers: {},
        wrong: {},
        remembered: {},
        recalled: {}
      };
      if (saved?.version === 1) this.restore(saved);
    }

    pool(target) {
      if (target === 'all') return [...this.questions.keys()];
      if (target === 'wrong') return Object.keys(this.state.wrong);
      return this.chapters.get(target)?.questions.map(question => question.id) ?? [];
    }

    restore(saved) {
      for (const [id, question] of this.questions) {
        const answer = this.restoreAnswer(question, saved.answers?.[id]);
        if (answer) this.state.answers[id] = answer;
        const wrong = saved.wrong?.[id];
        if (wrong && Number.isFinite(wrong.count) && wrong.count >= 1) {
          this.state.wrong[id] = {
            count: Math.floor(wrong.count),
            lastWrong: Number(wrong.lastWrong) || 0,
            mastered: wrong.mastered === true
          };
        }
      }

      for (const target of [...this.chapters.keys(), 'all', 'wrong']) {
        const prior = saved.rounds?.[target];
        if (!prior || !Array.isArray(prior.order)) continue;
        const pool = this.pool(target);
        const allowed = new Set(pool);
        const order = [...new Set(prior.order)].filter(id => allowed.has(id));
        if (target !== 'wrong') {
          const included = new Set(order);
          order.push(...pool.filter(id => !included.has(id)));
        }
        if (!order.length) continue;
        const round = {
          target,
          order,
          random: prior.random === true,
          type: TYPES.includes(prior.type) ? prior.type : 'all',
          current: null,
          submissions: {},
          drafts: {},
          summary: prior.summary === true
        };
        for (const id of order) {
          const question = this.questions.get(id);
          const answer = this.restoreAnswer(question, prior.submissions?.[id]);
          if (answer) round.submissions[id] = answer;
          const draft = prior.drafts?.[id];
          if (!answer && validChoice(question, draft)) round.drafts[id] = [...draft];
        }
        round.current = this.visibleQueue(round).includes(prior.current)
          ? prior.current
          : this.nextUnanswered(round);
        this.state.rounds[target] = round;
      }
      if (this.state.rounds[saved.lastRound]) this.state.lastRound = saved.lastRound;

      for (const chapter of this.chapters.values()) {
        for (const note of chapter.notes) {
          if (saved.remembered?.[note.id] === true) this.state.remembered[note.id] = true;
        }
        for (const thought of chapter.thoughts) {
          if (saved.recalled?.[thought.id] === true) this.state.recalled[thought.id] = true;
        }
      }
    }

    restoreAnswer(question, answer) {
      if (!answer || !validChoice(question, answer.selected)) return null;
      return {
        selected: [...answer.selected].sort(),
        correct: evaluate(question, answer.selected).correct
      };
    }

    start(target, settings = {}) {
      let ids = this.pool(target);
      if (target === 'wrong' && settings.ids) {
        const allowed = new Set(ids);
        ids = [...new Set(settings.ids)].filter(id => allowed.has(id));
      }
      const round = {
        target,
        order: settings.random ? shuffle(ids, this.random) : ids,
        random: settings.random === true,
        type: TYPES.includes(settings.type) ? settings.type : 'all',
        current: null,
        submissions: {},
        drafts: {},
        summary: false
      };
      round.current = this.visibleQueue(round)[0] ?? null;
      this.state.rounds[target] = round;
      this.state.lastRound = target;
      return round;
    }

    open(target) {
      const round = this.state.rounds[target] ?? this.start(target);
      this.state.lastRound = target;
      return round;
    }

    visibleQueue(round) {
      if (round.type === 'all') return round.order;
      return round.order.filter(id => this.questions.get(id).type === round.type);
    }

    nextUnanswered(round) {
      const queue = this.visibleQueue(round);
      return queue.find(id => !round.submissions[id]) ?? queue[0] ?? null;
    }

    filter(round, type) {
      if (!TYPES.includes(type) || round.type === type) return;
      round.type = type;
      round.summary = false;
      if (!this.visibleQueue(round).includes(round.current)) {
        round.current = this.nextUnanswered(round);
      }
    }

    changeOrder(round, random) {
      if (round.random === random) return;
      const order = round.target === 'wrong'
        ? [...round.order].sort((a, b) => {
          const left = this.questions.get(a);
          const right = this.questions.get(b);
          return left.chapter - right.chapter || left.number - right.number;
        })
        : this.pool(round.target);
      round.random = random;
      round.order = random ? shuffle(order, this.random) : order;
      round.summary = false;
      round.current = this.nextUnanswered(round);
    }

    choose(round, key) {
      const question = this.questions.get(round.current);
      if (!question || round.submissions[question.id] || !validChoice(question, [key])) return false;
      const draft = round.drafts[question.id] ?? [];
      round.drafts[question.id] = question.type === 'single'
        ? [key]
        : draft.includes(key)
          ? draft.filter(item => item !== key)
          : [...draft, key].sort();
      return true;
    }

    submit(round) {
      const question = this.questions.get(round.current);
      const selected = round.drafts[round.current];
      if (!question || round.submissions[question.id] || !validChoice(question, selected)) return null;
      const result = evaluate(question, selected);
      const answer = { selected: [...selected], correct: result.correct };
      round.submissions[question.id] = answer;
      this.state.answers[question.id] = answer;
      const prior = this.state.wrong[question.id];
      if (!answer.correct) {
        this.state.wrong[question.id] = {
          count: (prior?.count ?? 0) + 1,
          lastWrong: Date.now(),
          mastered: false
        };
      } else if (prior) {
        prior.mastered = true;
      }
      delete round.drafts[question.id];
      return answer;
    }

    retry(round) {
      delete round.submissions[round.current];
      delete round.drafts[round.current];
    }

    jump(round, id) {
      if (!this.visibleQueue(round).includes(id)) return;
      round.current = id;
      round.summary = false;
    }

    restart(round) {
      if (this.chapters.has(round.target)) {
        for (const id of this.pool(round.target)) delete this.state.answers[id];
      }
      return this.start(round.target, {
        ids: round.order,
        type: round.type,
        random: round.random
      });
    }

    stats(ids, answers = this.state.answers) {
      const records = ids.map(id => answers[id]).filter(Boolean);
      return { total: ids.length, answered: records.length, right: records.filter(a => a.correct).length };
    }
  }

  root.FinalReviewCore = { PracticeBook, evaluate, validChoice };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.FinalReviewCore;
})(globalThis);
