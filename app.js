/* ═══════════════════════════════════════════════════════════════════
   Mon Français B1 — Application Logic  v1.2
   Storage · Scheduling · Topic scoring · TTS · UI rendering
   Edit mode · Vocab Drill
   ═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ═══ STORAGE LAYER ═══
  // Persistent key-value via localStorage, with in-memory fallback.
  const memoryStore = {};

  window.storage = {
    async get(key) {
      try {
        const raw = localStorage.getItem('mf_' + key);
        return raw ? JSON.parse(raw) : null;
      } catch {
        return memoryStore[key] || null;
      }
    },
    async set(key, value) {
      try {
        localStorage.setItem('mf_' + key, JSON.stringify(value));
      } catch {
        memoryStore[key] = value;
      }
    }
  };

  // ═══ CONSTANTS ═══
  const TOPIC_LABELS = {
    present_indicative: 'Present indicative (regular & irregular)',
    verb_groups: 'Verb groups: -ER, -IR, -RE',
    common_irregular_verbs: 'Common irregular verbs (aller, venir, prendre, etc.)',
    pronominal_verbs: 'Pronominal verbs (reflexive & reciprocal)',
    verbs_infinitive: 'Verbs + infinitive (vouloir, pouvoir, devoir, etc.)',
    il_faut: 'Il faut + infinitive (necessity)',
    passe_compose: 'Passé composé (finished actions)',
    past_participles: 'Past participles (forms & usage)',
    agreement_etre: 'Agreement of past participle with être',
    agreement_avoir: 'Agreement of past participle with avoir (with COD)',
    imparfait: 'Imparfait (descriptions, habits in the past)',
    plus_que_parfait: 'Plus-que-parfait',
    futur_proche: 'Futur proche',
    futur_simple: 'Futur simple',
    passe_recent: 'Passé récent (venir de + infinitive)',
    present_progressif: 'Présent progressif (être en train de)',
    imperatif: 'Impératif (affirmative & negative)',
    interrogative_forms: 'Interrogative forms (questions & inversions)',
    negation: 'Negation patterns (ne…pas, ne…plus, ne…que)',
    agreement_gender_number: 'Agreement in gender and number',
    sentence_connectors: 'Sentence & logical connectors',
    word_order: 'Word order basics',
    adjective_agreement: 'Adjective agreement (gender & number)',
    adjective_position: 'Adjective position (BANGS)',
    possessive_adjectives: 'Possessive adjectives (mon, ton, son)',
    demonstrative_adjectives: 'Demonstrative adjectives (ce, cette, ces)',
    possessive_pronouns: 'Possessive pronouns (le mien, le tien)',
    demonstrative_pronouns: 'Demonstrative pronouns (celui-ci, celle-là)',
    subject_pronouns: 'Subject & stressed pronouns (je, moi, lui)',
    direct_object_pronouns: 'Direct object pronouns (COD)',
    indirect_object_pronouns: 'Indirect object pronouns (COI)',
    adverbial_pronouns_y: 'Adverbial pronoun (y)',
    adverbial_pronouns_en: 'Adverbial pronoun (en)',
    double_pronouns: 'Double object pronouns',
    relative_pronouns_qui_que: 'Relative pronouns (qui, que)',
    extended_relative_pronouns: 'Relative pronouns (dont, où, lequel)',
    prepositions_time: 'Prepositions of time (pendant, depuis, dans)',
    prepositions_place: 'Prepositions of place (à, de, chez)',
    movement_verbs_prepositions: 'Movement verbs + prepositions',
    adverbs_time: 'Adverbs of time',
    adverbs_place: 'Adverbs of place',
    adverbs_manner: 'Adverbs of manner (-ment)',
    reported_speech: 'Reported speech & tense concordance',
    passive_voice: 'Passive voice',
    gerondif: 'Gérondif (en + participe présent)',
    present_participle: 'Present participle',
    present_conditional: 'Present conditional',
    past_conditional: 'Past conditional',
    si_clauses: 'Si-clauses (conditional structures)',
    subjonctif_present: 'Subjonctif présent',
    conjunctions_requiring_subj: 'Conjunctions requiring subjunctive',
    comparative_structures: 'Comparative structures',
    superlatives: 'Superlatives',
    concordance_of_tenses: 'Concordance of tenses',
    mixed_review: 'Mixed Review (various grammar points)',
    listening_comprehension: 'Listening Comprehension'
  };

  const TYPE_LABELS = {
    translation: 'Translation',
    fill_blank: 'Fill in the Blank',
    sentence_construction: 'Sentence Construction',
    guided_transformation: 'Guided Transformation',
    error_correction: 'Error Correction',
    listening: 'Listening'
  };

  const TYPE_WEIGHTS = {
    translation: 50,
    fill_blank: 20,
    sentence_construction: 5,
    guided_transformation: 5,
    error_correction: 5,
    listening: 15
  };

  // ═══ STATE ═══
  let questionStates = {};   // keyed by question id
  let topicStates = {};      // keyed by topic name
  let sessionLog = [];
  let settings = { auto_tts: false };
  let questionEdits = {};    // keyed by question id → patch object
  let vocabList = [];         // [{ fr, en, addedAt }]

  let currentMode = 'global'; // 'global' or 'focused'
  let focusedTopic = null;

  let currentQuestion = null;
  let revealed = false;
  let editMode = false;
  let todayCount = 0;
  let todayDate = getTodayStr();

  // ═══ DATE HELPERS ═══
  function getTodayStr() {
    return new Date().toISOString().slice(0, 10);
  }

  function daysBetween(dateStr1, dateStr2) {
    const d1 = new Date(dateStr1);
    const d2 = new Date(dateStr2);
    return (d2 - d1) / (1000 * 60 * 60 * 24);
  }

  // ═══ INITIALIZATION ═══
  async function init() {
    // Load persisted state
    questionStates = (await window.storage.get('question_states')) || {};
    topicStates = (await window.storage.get('topic_states')) || {};
    sessionLog = (await window.storage.get('session_log')) || [];
    settings = (await window.storage.get('settings')) || { auto_tts: false };
    questionEdits = (await window.storage.get('question_edits')) || {};
    vocabList = (await window.storage.get('vocab_list')) || [];

    // Clean stale settings keys
    delete settings.hands_free;

    // Apply saved question edits to QUESTION_BANK
    applyQuestionEdits();

    // DATA MIGRATION: clear old unmapped topics
    for (const t of Object.keys(topicStates)) {
      if (!TOPIC_LABELS[t]) {
        delete topicStates[t];
      }
    }

    // Init question states for any new questions
    const today = getTodayStr();
    for (const q of QUESTION_BANK) {
      if (!questionStates[q.id]) {
        questionStates[q.id] = {
          ease_factor: 2.5,
          interval_days: 1,
          next_review: today,
          reps: 0,
          grade_history: []
        };
      }
    }

    // Init topic states
    for (const q of QUESTION_BANK) {
      for (const t of q.topics) {
        if (!topicStates[t]) {
          topicStates[t] = { score: 50, last_decay_ts: Date.now(), last_reviewed_ts: Date.now() };
        }
      }
    }

    // Apply topic decay
    applyTopicDecay();

    // Count today's completed questions
    const todayLog = sessionLog.find(e => e.date === today);
    todayCount = todayLog ? todayLog.questions_done : 0;

    // UI setup
    document.getElementById('auto-tts-toggle').checked = settings.auto_tts;
    updateStreakDisplay();
    updateTodayCount();

    await saveAll();
    pickAndShowQuestion();
    bindEvents();
  }

  // ═══ QUESTION EDITS — Apply saved edits to QUESTION_BANK ═══
  function applyQuestionEdits() {
    for (const [qId, patch] of Object.entries(questionEdits)) {
      const q = QUESTION_BANK.find(item => item.id === qId);
      if (!q) continue;
      if (patch.prompt !== undefined) q.prompt = patch.prompt;
      if (patch.answers !== undefined) q.answers = patch.answers;
      if (patch.explanations !== undefined) q.explanations = patch.explanations;
      if (patch.tts_answer !== undefined) q.tts_answer = patch.tts_answer;
      if (patch.vocabulary !== undefined) q.vocabulary = patch.vocabulary;
    }
  }

  // ═══ PERSISTENCE ═══
  async function saveAll() {
    await window.storage.set('question_states', questionStates);
    await window.storage.set('topic_states', topicStates);
    await window.storage.set('session_log', sessionLog);
    await window.storage.set('settings', settings);
    await window.storage.set('question_edits', questionEdits);
    await window.storage.set('vocab_list', vocabList);
  }

  // ═══ TOPIC DECAY ═══
  function applyTopicDecay() {
    const now = Date.now();
    for (const [topic, state] of Object.entries(topicStates)) {
      const hoursSinceDecay = (now - state.last_decay_ts) / (1000 * 60 * 60);
      const decayPeriods = Math.floor(hoursSinceDecay / 24);
      if (decayPeriods > 0) {
        state.score = Math.max(0, state.score - decayPeriods * 2);
        state.last_decay_ts = now;
      }
    }
  }

  // ═══ SPACED REPETITION — QUESTION SCHEDULING ═══
  function gradeQuestion(questionId, grade) {
    const qs = questionStates[questionId];
    if (!qs) return;

    qs.grade_history.push(grade);

    switch (grade) {
      case 'easy':
        qs.interval_days *= qs.ease_factor * 1.3;
        qs.ease_factor += 0.1;
        qs.reps++;
        if (qs.reps >= 2 && consecutiveEasy(qs) >= 2) {
          qs.interval_days = Math.max(qs.interval_days, 21);
        }
        break;
      case 'ok':
        qs.interval_days *= qs.ease_factor;
        qs.reps++;
        break;
      case 'ehh':
        qs.interval_days = Math.max(qs.interval_days * 0.6, 3);
        qs.ease_factor -= 0.1;
        break;
      case 'hard':
        qs.interval_days = 1;
        qs.ease_factor -= 0.2;
        qs.reps = 0;
        break;
    }

    qs.ease_factor = Math.max(1.3, Math.min(3.0, qs.ease_factor));

    const nextDate = new Date();
    nextDate.setDate(nextDate.getDate() + Math.round(qs.interval_days));
    qs.next_review = nextDate.toISOString().slice(0, 10);
  }

  function consecutiveEasy(qs) {
    let count = 0;
    for (let i = qs.grade_history.length - 1; i >= 0; i--) {
      if (qs.grade_history[i] === 'easy') count++;
      else break;
    }
    return count;
  }

  // ═══ TOPIC SCORING ═══
  function updateTopicScores(question, grade) {
    for (const topic of question.topics) {
      const ts = topicStates[topic];
      if (!ts) continue;
      switch (grade) {
        case 'easy':
        case 'ok':
          ts.score = Math.min(100, ts.score + 8);
          break;
        case 'ehh':
          ts.score = Math.max(0, ts.score - 3);
          break;
        case 'hard':
          ts.score = Math.max(0, ts.score - 8);
          break;
      }
      ts.last_reviewed_ts = Date.now();
    }
  }

  // ═══ SESSION LOGGING ═══
  function logSession(grade) {
    const today = getTodayStr();
    let entry = sessionLog.find(e => e.date === today);
    if (!entry) {
      entry = { date: today, questions_done: 0, grades: [] };
      sessionLog.push(entry);
    }
    entry.questions_done++;
    entry.grades.push(grade);
    todayCount = entry.questions_done;
  }

  // ═══ STREAK ═══
  function calculateStreak() {
    if (sessionLog.length === 0) return 0;
    const dates = sessionLog.filter(e => e.questions_done > 0).map(e => e.date).sort().reverse();
    if (dates.length === 0) return 0;

    let streak = 0;
    let checkDate = new Date(getTodayStr());

    if (!dates.includes(getTodayStr())) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    for (let i = 0; i < 365; i++) {
      const ds = checkDate.toISOString().slice(0, 10);
      if (dates.includes(ds)) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  function getTotalQuestionsAnswered() {
    return sessionLog.reduce((sum, e) => sum + e.questions_done, 0);
  }

  function updateStreakDisplay() {
    const total = getTotalQuestionsAnswered();
    const streakEl = document.getElementById('streak-display');
    if (total >= 50) {
      const streak = calculateStreak();
      document.getElementById('streak-count').textContent = streak;
      streakEl.classList.remove('hidden');
    } else {
      streakEl.classList.add('hidden');
    }
  }

  // ═══ QUESTION SELECTION ═══
  function pickNextQuestion() {
    const today = getTodayStr();

    let candidates = QUESTION_BANK.filter(q => {
      if (currentMode === 'focused' && focusedTopic) {
        if (!q.topics.includes(focusedTopic)) return false;
      }
      if (q.type === 'listening' && !settings.auto_tts) return false;
      const qs = questionStates[q.id];
      return qs && qs.next_review <= today;
    });

    candidates.sort((a, b) => {
      const qsA = questionStates[a.id];
      const qsB = questionStates[b.id];
      const overdueA = daysBetween(qsA.next_review, today);
      const overdueB = daysBetween(qsB.next_review, today);
      if (overdueA !== overdueB) return overdueB - overdueA;
      const sevA = gradeSeverity(qsA);
      const sevB = gradeSeverity(qsB);
      return sevB - sevA;
    });

    if (candidates.length === 0) {
      candidates = [...QUESTION_BANK].filter(q => {
        if (currentMode === 'focused' && focusedTopic) {
          if (!q.topics.includes(focusedTopic)) return false;
        }
        if (q.type === 'listening' && !settings.auto_tts) return false;
        return true;
      }).sort((a, b) => {
        const qsA = questionStates[a.id];
        const qsB = questionStates[b.id];
        if (!qsA || !qsB) return 0;
        return qsA.next_review.localeCompare(qsB.next_review);
      });
    }

    const weighted = candidates.map(q => {
      const topicScores = q.topics.map(t => topicStates[t]?.score || 50);
      const avgScore = topicScores.reduce((a, b) => a + b, 0) / topicScores.length;
      let weight = Math.max(1, 110 - avgScore);
      if (avgScore < 40) weight *= 2;
      if (avgScore >= 75) weight *= 0.4;
      return { question: q, weight };
    });

    const typeWeight = (type) => TYPE_WEIGHTS[type] || 5;
    for (const item of weighted) {
      item.weight *= typeWeight(item.question.type) / 50;
    }

    const totalWeight = weighted.reduce((s, w) => s + w.weight, 0);
    let rand = Math.random() * totalWeight;
    for (const item of weighted) {
      rand -= item.weight;
      if (rand <= 0) return item.question;
    }

    return weighted[0]?.question || QUESTION_BANK[0];
  }

  function gradeSeverity(qs) {
    if (!qs || qs.grade_history.length === 0) return 0;
    const last = qs.grade_history[qs.grade_history.length - 1];
    return { hard: 3, ehh: 2, ok: 1, easy: 0 }[last] || 0;
  }

  // ═══ TTS ═══
  function speak(text, rate = 0.9, lang = 'fr-FR') {
    return new Promise((resolve) => {
      if (!window.speechSynthesis) return resolve();

      window.speechSynthesis.cancel();
      const utt = new SpeechSynthesisUtterance(text);
      utt.lang = lang;

      const voices = window.speechSynthesis.getVoices();
      if (lang.startsWith('fr')) {
        const thomas = voices.find(v => v.name.includes('Thomas') && v.lang.startsWith('fr'));
        const frVoice = thomas || voices.find(v => v.lang.startsWith('fr'));
        if (frVoice) utt.voice = frVoice;
      } else {
        const enVoice = voices.find(v => v.lang.startsWith('en'));
        if (enVoice) utt.voice = enVoice;
      }

      utt.rate = rate;
      utt.onend = resolve;
      utt.onerror = resolve;
      window.speechSynthesis.speak(utt);
    });
  }

  // Ensure voices are loaded
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // ═══ VOCAB LIST MANAGEMENT ═══
  function addVocabFromQuestion(question) {
    if (!question.vocabulary || question.vocabulary.length === 0) return;
    let changed = false;
    for (const v of question.vocabulary) {
      if (!v.fr || !v.en) continue;
      const frLower = v.fr.toLowerCase().trim();
      const exists = vocabList.some(item => item.fr.toLowerCase().trim() === frLower);
      if (!exists) {
        vocabList.unshift({ fr: v.fr.trim(), en: v.en.trim(), addedAt: Date.now() });
        changed = true;
      }
    }
    if (changed) {
      window.storage.set('vocab_list', vocabList);
    }
  }

  // Decrement data-idx on all rows whose index is > removedIdx.
  function _shiftIdxDown(listEl, afterIdx) {
    listEl.querySelectorAll('.vocab-row').forEach(r => {
      const n = parseInt(r.dataset.idx);
      if (n > afterIdx) r.dataset.idx = n - 1;
    });
  }

  function moveVocabToEnd(index, rowEl) {
    if (index < 0 || index >= vocabList.length) return;
    const [moved] = vocabList.splice(index, 1);
    vocabList.push(moved);
    window.storage.set('vocab_list', vocabList);
    if (rowEl) {
      const listEl = document.getElementById('vocab-list');
      // Update indices: rows after the removed position shift down by 1.
      _shiftIdxDown(listEl, index);
      // Give the moved row the last index.
      rowEl.dataset.idx = vocabList.length - 1;
      // DOM move (appendChild detaches from current position automatically).
      listEl.appendChild(rowEl);
    } else {
      renderVocabDrill();
    }
  }

  function removeVocab(index, rowEl) {
    if (index < 0 || index >= vocabList.length) return;
    vocabList.splice(index, 1);
    window.storage.set('vocab_list', vocabList);
    if (rowEl) {
      const listEl = document.getElementById('vocab-list');
      // Shift remaining rows' indices down.
      _shiftIdxDown(listEl, index);
      // Animate the row out, then detach.
      const h = rowEl.offsetHeight;
      rowEl.style.overflow = 'hidden';
      rowEl.style.maxHeight = h + 'px';
      rowEl.style.transition = 'opacity 0.22s ease, max-height 0.28s ease, margin-bottom 0.28s ease';
      // Double-rAF ensures the starting values are committed before the transition kicks in.
      requestAnimationFrame(() => requestAnimationFrame(() => {
        rowEl.style.opacity = '0';
        rowEl.style.maxHeight = '0';
        rowEl.style.marginBottom = '0';
      }));
      rowEl.addEventListener('transitionend', () => rowEl.remove(), { once: true });
      // Safety net: if transitionend never fires (e.g. hidden tab), remove after 400ms.
      setTimeout(() => { if (rowEl.parentNode) rowEl.remove(); }, 400);
    } else {
      renderVocabDrill();
    }
  }

  function addCustomVocab(en, fr) {
    if (!en.trim() || !fr.trim()) return;
    const frLower = fr.toLowerCase().trim();
    const exists = vocabList.some(item => item.fr.toLowerCase().trim() === frLower);
    if (exists) return; // don't add duplicates
    vocabList.unshift({ fr: fr.trim(), en: en.trim(), addedAt: Date.now() });
    window.storage.set('vocab_list', vocabList);
    renderVocabDrill();
  }

  // ═══ VIEWS & DASHBOARD ═══
  function switchView(viewName) {
    document.getElementById('practice-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('vocab-drill-view').classList.add('hidden');
    document.getElementById('nav-practice').classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');
    document.getElementById('nav-vocab').classList.remove('active');

    if (viewName === 'dashboard') {
      document.getElementById('dashboard-view').classList.remove('hidden');
      document.getElementById('nav-dashboard').classList.add('active');
      renderDashboard();
    } else if (viewName === 'vocab') {
      document.getElementById('vocab-drill-view').classList.remove('hidden');
      document.getElementById('nav-vocab').classList.add('active');
      renderVocabDrill();
    } else {
      document.getElementById('practice-view').classList.remove('hidden');
      document.getElementById('nav-practice').classList.add('active');

      const banner = document.getElementById('focused-banner');
      if (currentMode === 'focused' && focusedTopic) {
        document.getElementById('focused-topic-name').textContent = TOPIC_LABELS[focusedTopic] || focusedTopic;
        banner.classList.remove('hidden');
      } else {
        banner.classList.add('hidden');
      }

      if (!currentQuestion) pickAndShowQuestion();
    }
  }

  function startFocusedSession(topicKey) {
    currentMode = 'focused';
    focusedTopic = topicKey;
    switchView('practice');
    pickAndShowQuestion();
  }

  function exitFocusedSession() {
    currentMode = 'global';
    focusedTopic = null;
    switchView('practice');
    pickAndShowQuestion();
  }

  function renderDashboard() {
    const grid = document.getElementById('topics-grid');
    grid.innerHTML = '';

    for (const [key, label] of Object.entries(TOPIC_LABELS)) {
      const state = topicStates[key] || { score: 50 };
      const score = Math.round(state.score);

      let statusClass = 'status-drill';
      if (score >= 75) statusClass = 'status-master';
      else if (score >= 60) statusClass = 'status-good';
      else if (score >= 40) statusClass = 'status-ok';

      const row = document.createElement('div');
      row.className = 'topic-row';
      row.innerHTML = `
        <div class="topic-info">
          <span class="topic-name">${escapeHtml(label)}</span>
          <div class="topic-progress-bg">
            <div class="topic-progress-fill ${statusClass}" style="width: ${score}%;"></div>
          </div>
        </div>
        <span class="topic-score">${score}%</span>
        <button class="train-btn" data-topic="${key}">Train</button>
      `;
      grid.appendChild(row);
    }

    grid.querySelectorAll('.train-btn').forEach(btn => {
      btn.addEventListener('click', (e) => startFocusedSession(e.target.dataset.topic));
    });
  }

  // ═══ VOCAB DRILL RENDERING ═══
  function renderVocabDrill() {
    const listEl = document.getElementById('vocab-list');

    const filtered = vocabList.map((item, i) => ({ ...item, _idx: i }));

    if (filtered.length === 0) {
      listEl.innerHTML = `
        <div class="vocab-empty">
          <span class="vocab-empty-icon">📚</span>
          No vocabulary yet. Practice some questions to start building your list!
        </div>
      `;
      return;
    }

    listEl.innerHTML = '';
    for (const item of filtered) {
      const row = document.createElement('div');
      row.className = 'vocab-row';
      row.dataset.idx = item._idx;

      row.innerHTML = `
        <span class="vocab-row-en">${escapeHtml(item.en)}</span>
        <span class="vocab-row-fr">
          <span class="vocab-hidden">${escapeHtml(item.fr)}</span>
        </span>
        <span class="vocab-row-ok">
          <button class="vocab-ok-btn">OK</button>
        </span>
      `;

      // Reveal French on click
      const frSpan = row.querySelector('.vocab-row-fr');
      frSpan.addEventListener('click', () => {
        const hidden = frSpan.querySelector('.vocab-hidden');
        if (hidden) {
          frSpan.innerHTML = `<span class="vocab-revealed">${escapeHtml(item.fr)}</span>`;
          // TTS if enabled
          if (settings.auto_tts) {
            speak(item.fr, 0.9, 'fr-FR');
          }
        }
      });

      // OK button: click = move to end, long press = remove
      const okBtn = row.querySelector('.vocab-ok-btn');
      let pressTimer = null;
      let longPressed = false;

      const startPress = (e) => {
        e.preventDefault();
        longPressed = false;
        okBtn.classList.add('holding');
        pressTimer = setTimeout(() => {
          longPressed = true;
          okBtn.classList.remove('holding');
          // Read index fresh from DOM at the moment of press.
          removeVocab(parseInt(row.dataset.idx), row);
        }, 800);
      };

      const endPress = (e) => {
        e.preventDefault();
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        okBtn.classList.remove('holding');
        if (!longPressed) {
          // Read index fresh from DOM at the moment of press.
          moveVocabToEnd(parseInt(row.dataset.idx), row);
        }
        longPressed = false;
      };

      const cancelPress = () => {
        // Only cancel if the long-press hasn't fired yet — if it has,
        // the remove animation is already in progress; leave it alone.
        if (!longPressed) {
          if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
          okBtn.classList.remove('holding');
        }
      };

      okBtn.addEventListener('mousedown', startPress);
      okBtn.addEventListener('mouseup', endPress);
      okBtn.addEventListener('mouseleave', cancelPress);
      okBtn.addEventListener('touchstart', startPress, { passive: false });
      okBtn.addEventListener('touchend', endPress, { passive: false });
      okBtn.addEventListener('touchcancel', cancelPress);

      listEl.appendChild(row);
    }
  }

  // ═══ UI RENDERING ═══
  function pickAndShowQuestion() {
    currentQuestion = pickNextQuestion();
    revealed = false;
    editMode = false;
    renderQuestion(currentQuestion);

    // Collect vocab when question is shown
    addVocabFromQuestion(currentQuestion);
  }

  function renderQuestion(q) {
    window.speechSynthesis?.cancel();

    // Type label
    document.getElementById('question-type-label').textContent = TYPE_LABELS[q.type] || q.type;

    // Topic badges
    const badgesEl = document.getElementById('topic-badges');
    badgesEl.innerHTML = '';
    for (const t of q.topics) {
      const badge = document.createElement('span');
      badge.className = 'topic-badge';
      badge.textContent = TOPIC_LABELS[t] || t;
      badgesEl.appendChild(badge);
    }

    // Prompt with vocabulary highlights
    const promptEl = document.getElementById('question-prompt');
    const listeningControls = document.getElementById('listening-controls');

    if (q.type === 'listening') {
      promptEl.innerHTML = '<span style="color: var(--text-muted); font-style: italic; text-align: center; display: block;">🎧 Listen to the phrase...</span>';
      listeningControls.classList.remove('hidden');
      if (settings.auto_tts) {
        speak(q.tts_answer, 1.0);
      }
    } else {
      promptEl.innerHTML = highlightVocab(q.prompt, q.vocabulary);
      listeningControls.classList.add('hidden');
    }

    // Reset answer/grade/edit visibility
    document.getElementById('reveal-btn').classList.remove('hidden');
    document.getElementById('answer-area').classList.add('hidden');
    document.getElementById('grade-buttons').classList.add('hidden');
    document.getElementById('edit-area').classList.add('hidden');

    // Re-trigger card animation
    const card = document.getElementById('question-card');
    card.style.animation = 'none';
    card.offsetHeight; // force reflow
    card.style.animation = 'cardFadeIn 0.4s ease';

    updateTodayCount();
  }

  function highlightVocab(text, vocabulary) {
    if (!vocabulary || vocabulary.length === 0) return escapeHtml(text);
    let result = escapeHtml(text);
    for (const v of vocabulary) {
      const escaped = escapeHtml(v.fr);
      const regex = new RegExp(escapeRegex(escaped), 'gi');
      result = result.replace(regex, match =>
        `<span class="vocab-hl" data-meaning="${escapeHtml(v.en)}" tabindex="0">${match}</span>`
      );
    }
    return result;
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function revealAnswer() {
    if (revealed) return;
    revealed = true;

    const q = currentQuestion;
    document.getElementById('reveal-btn').classList.add('hidden');

    // Build answer content
    const contentEl = document.getElementById('answer-content');
    contentEl.innerHTML = '';

    if (q.type === 'translation') {
      for (let i = 0; i < q.answers.length; i++) {
        const div = document.createElement('div');
        div.className = 'answer-variant';

        let html = `<span class="variant-num">${i + 1}.</span> `;
        html += highlightVocab(q.answers[i], q.vocabulary);
        if (q.explanations && q.explanations[i]) {
          html += `<span class="variant-tag">${escapeHtml(q.explanations[i])}</span>`;
        }
        div.innerHTML = html;
        contentEl.appendChild(div);
      }
    } else {
      const ansDiv = document.createElement('div');
      ansDiv.className = 'answer-variant';
      ansDiv.innerHTML = highlightVocab(q.answers[0], q.vocabulary);
      contentEl.appendChild(ansDiv);

      if (q.explanations && q.explanations[0]) {
        const expDiv = document.createElement('div');
        expDiv.className = 'explanation-block';
        expDiv.innerHTML = escapeHtml(q.explanations[0]);
        contentEl.appendChild(expDiv);
      }
    }

    document.getElementById('answer-area').classList.remove('hidden');
    document.getElementById('grade-buttons').classList.remove('hidden');

    // Auto TTS
    if (settings.auto_tts) {
      speak(q.tts_answer);
    }

    // Collect vocab on reveal too
    addVocabFromQuestion(q);
  }

  // ═══ EDIT MODE ═══
  function enterEditMode() {
    if (!currentQuestion || !revealed) return;
    editMode = true;

    // Hide grade buttons and answer area
    document.getElementById('grade-buttons').classList.add('hidden');
    document.getElementById('answer-area').classList.add('hidden');

    // Show edit area
    const editArea = document.getElementById('edit-area');
    editArea.classList.remove('hidden');

    const fieldsEl = document.getElementById('edit-fields');
    const q = currentQuestion;
    fieldsEl.innerHTML = '';

    // Prompt
    fieldsEl.innerHTML += `
      <div class="edit-field-group">
        <label class="edit-field-label">Prompt</label>
        <textarea class="edit-textarea" id="edit-prompt">${escapeHtml(q.prompt)}</textarea>
      </div>
    `;

    // Answers
    let answersHtml = `<div class="edit-field-group"><label class="edit-field-label">Answers</label>`;
    for (let i = 0; i < q.answers.length; i++) {
      answersHtml += `
        <div class="edit-array-item" data-answer-idx="${i}">
          <input class="edit-input edit-answer" value="${escapeHtml(q.answers[i])}" placeholder="Answer ${i + 1}">
          <button class="edit-remove-btn" data-remove="answer" data-idx="${i}">✕</button>
        </div>
      `;
    }
    answersHtml += `<button class="edit-add-btn" id="edit-add-answer">+ Add Answer</button></div>`;
    fieldsEl.innerHTML += answersHtml;

    // Explanations
    let explHtml = `<div class="edit-field-group"><label class="edit-field-label">Explanations</label>`;
    const explArr = q.explanations || [];
    for (let i = 0; i < Math.max(explArr.length, q.answers.length); i++) {
      explHtml += `
        <div class="edit-array-item" data-expl-idx="${i}">
          <input class="edit-input edit-explanation" value="${escapeHtml(explArr[i] || '')}" placeholder="Explanation ${i + 1}">
          <button class="edit-remove-btn" data-remove="explanation" data-idx="${i}">✕</button>
        </div>
      `;
    }
    explHtml += `<button class="edit-add-btn" id="edit-add-explanation">+ Add Explanation</button></div>`;
    fieldsEl.innerHTML += explHtml;

    // TTS Answer
    fieldsEl.innerHTML += `
      <div class="edit-field-group">
        <label class="edit-field-label">TTS Answer</label>
        <input class="edit-input" id="edit-tts-answer" value="${escapeHtml(q.tts_answer || '')}">
      </div>
    `;

    // Vocabulary
    let vocabHtml = `<div class="edit-field-group"><label class="edit-field-label">Vocabulary</label>`;
    const vocabArr = q.vocabulary || [];
    for (let i = 0; i < vocabArr.length; i++) {
      vocabHtml += `
        <div class="edit-vocab-pair" data-vocab-idx="${i}">
          <input class="edit-input edit-vocab-fr" value="${escapeHtml(vocabArr[i].fr)}" placeholder="French">
          <input class="edit-input edit-vocab-en" value="${escapeHtml(vocabArr[i].en)}" placeholder="English">
          <button class="edit-remove-btn" data-remove="vocab" data-idx="${i}">✕</button>
        </div>
      `;
    }
    vocabHtml += `<button class="edit-add-btn" id="edit-add-vocab">+ Add Vocab Pair</button></div>`;
    fieldsEl.innerHTML += vocabHtml;

    // Bind add/remove buttons inside edit area
    bindEditAreaEvents();
  }

  function bindEditAreaEvents() {
    const fieldsEl = document.getElementById('edit-fields');

    // Remove buttons
    fieldsEl.querySelectorAll('.edit-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.edit-array-item, .edit-vocab-pair').remove();
      });
    });

    // Add answer
    const addAnswerBtn = document.getElementById('edit-add-answer');
    if (addAnswerBtn) {
      addAnswerBtn.addEventListener('click', () => {
        const group = addAnswerBtn.closest('.edit-field-group');
        const div = document.createElement('div');
        div.className = 'edit-array-item';
        div.innerHTML = `
          <input class="edit-input edit-answer" value="" placeholder="New answer">
          <button class="edit-remove-btn">✕</button>
        `;
        div.querySelector('.edit-remove-btn').addEventListener('click', () => div.remove());
        group.insertBefore(div, addAnswerBtn);
      });
    }

    // Add explanation
    const addExplBtn = document.getElementById('edit-add-explanation');
    if (addExplBtn) {
      addExplBtn.addEventListener('click', () => {
        const group = addExplBtn.closest('.edit-field-group');
        const div = document.createElement('div');
        div.className = 'edit-array-item';
        div.innerHTML = `
          <input class="edit-input edit-explanation" value="" placeholder="New explanation">
          <button class="edit-remove-btn">✕</button>
        `;
        div.querySelector('.edit-remove-btn').addEventListener('click', () => div.remove());
        group.insertBefore(div, addExplBtn);
      });
    }

    // Add vocab pair
    const addVocabBtn = document.getElementById('edit-add-vocab');
    if (addVocabBtn) {
      addVocabBtn.addEventListener('click', () => {
        const group = addVocabBtn.closest('.edit-field-group');
        const div = document.createElement('div');
        div.className = 'edit-vocab-pair';
        div.innerHTML = `
          <input class="edit-input edit-vocab-fr" value="" placeholder="French">
          <input class="edit-input edit-vocab-en" value="" placeholder="English">
          <button class="edit-remove-btn">✕</button>
        `;
        div.querySelector('.edit-remove-btn').addEventListener('click', () => div.remove());
        group.insertBefore(div, addVocabBtn);
      });
    }
  }

  function saveQuestionEdit() {
    if (!currentQuestion) return;
    const q = currentQuestion;

    // Read values from edit fields
    const promptEl = document.getElementById('edit-prompt');
    const ttsEl = document.getElementById('edit-tts-answer');

    q.prompt = promptEl ? promptEl.value : q.prompt;
    q.tts_answer = ttsEl ? ttsEl.value : q.tts_answer;

    // Answers
    const answerInputs = document.querySelectorAll('#edit-fields .edit-answer');
    q.answers = Array.from(answerInputs).map(input => input.value).filter(v => v.trim());

    // Explanations
    const explInputs = document.querySelectorAll('#edit-fields .edit-explanation');
    q.explanations = Array.from(explInputs).map(input => input.value);

    // Vocabulary
    const vocabPairs = document.querySelectorAll('#edit-fields .edit-vocab-pair');
    q.vocabulary = Array.from(vocabPairs).map(pair => ({
      fr: pair.querySelector('.edit-vocab-fr').value,
      en: pair.querySelector('.edit-vocab-en').value
    })).filter(v => v.fr.trim() || v.en.trim());

    // Save the patch to persistent edits
    questionEdits[q.id] = {
      prompt: q.prompt,
      answers: q.answers,
      explanations: q.explanations,
      tts_answer: q.tts_answer,
      vocabulary: q.vocabulary
    };

    window.storage.set('question_edits', questionEdits);

    exitEditMode();
    // Re-render the revealed answer with updated data
    revealed = false;
    revealAnswer();
  }

  function exitEditMode() {
    editMode = false;
    document.getElementById('edit-area').classList.add('hidden');
    document.getElementById('answer-area').classList.remove('hidden');
    document.getElementById('grade-buttons').classList.remove('hidden');
  }

  async function handleGrade(grade) {
    if (!currentQuestion || !revealed || editMode) return;

    gradeQuestion(currentQuestion.id, grade);
    updateTopicScores(currentQuestion, grade);
    logSession(grade);
    updateStreakDisplay();
    updateTodayCount();

    await saveAll();
    pickAndShowQuestion();
  }

  function updateTodayCount() {
    document.getElementById('questions-today').textContent = todayCount > 0
      ? `${todayCount} question${todayCount !== 1 ? 's' : ''} today`
      : '';
  }

  // ═══ EVENT BINDING ═══
  function bindEvents() {
    // Nav & Action buttons
    document.getElementById('nav-practice').addEventListener('click', () => switchView('practice'));
    document.getElementById('nav-dashboard').addEventListener('click', () => switchView('dashboard'));
    document.getElementById('nav-vocab').addEventListener('click', () => switchView('vocab'));
    document.getElementById('exit-focus-btn').addEventListener('click', exitFocusedSession);

    // Reveal button
    document.getElementById('reveal-btn').addEventListener('click', revealAnswer);

    // Grade buttons
    document.querySelectorAll('.grade-btn').forEach(btn => {
      btn.addEventListener('click', () => handleGrade(btn.dataset.grade));
    });

    // TTS button
    document.getElementById('tts-btn').addEventListener('click', () => {
      if (currentQuestion) speak(currentQuestion.tts_answer);
    });

    // Edit button
    document.getElementById('edit-btn').addEventListener('click', enterEditMode);

    // Edit save/cancel
    document.getElementById('edit-save-btn').addEventListener('click', saveQuestionEdit);
    document.getElementById('edit-cancel-btn').addEventListener('click', exitEditMode);

    // Listening speed buttons
    document.querySelectorAll('.speed-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        if (currentQuestion && currentQuestion.type === 'listening') {
          const rate = parseFloat(e.target.dataset.speed);
          speak(currentQuestion.tts_answer, rate);
        }
      });
    });

    // Auto TTS toggle
    document.getElementById('auto-tts-toggle').addEventListener('change', async (e) => {
      settings.auto_tts = e.target.checked;
      await window.storage.set('settings', settings);
    });

    // Vocab drill: add word
    document.getElementById('vocab-add-btn').addEventListener('click', () => {
      const enInput = document.getElementById('vocab-add-en');
      const frInput = document.getElementById('vocab-add-fr');
      addCustomVocab(enInput.value, frInput.value);
      enInput.value = '';
      frInput.value = '';
    });

    // Vocab drill: search
    document.getElementById('vocab-search').addEventListener('input', () => {
      renderVocabDrill();
    });

    // Vocab drill: Enter key in add inputs
    const vocabAddInputs = document.querySelectorAll('.vocab-add-input');
    vocabAddInputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          document.getElementById('vocab-add-btn').click();
        }
      });
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't intercept if user is in an input or editing
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      if (editMode) return;

      if (e.code === 'Space') {
        e.preventDefault();
        if (!revealed) {
          revealAnswer();
        }
      } else if (e.key === '1' && revealed) {
        handleGrade('easy');
      } else if (e.key === '2' && revealed) {
        handleGrade('ok');
      } else if (e.key === '3' && revealed) {
        handleGrade('ehh');
      } else if (e.key === '4' && revealed) {
        handleGrade('hard');
      }
    });
  }

  // ═══ BOOT ═══
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
