/* ═══════════════════════════════════════════════════════════════════
   Mon Français B1 — Application Logic
   Storage · Scheduling · Topic scoring · TTS · UI rendering
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
    verb_groups: 'Verb groups: -ER, -IR, -RE, irregular verbs',
    common_irregular_verbs: 'Common irregular verbs (aller, venir, prendre, etc.)',
    pronominal_verbs: 'Pronominal verbs (reflexive & reciprocal)',
    verbs_infinitive: 'Verbs + infinitive (vouloir, pouvoir, devoir, etc.)',
    il_faut: 'Il faut + infinitive (necessity)',
    passe_compose: 'Passé composé',
    past_participles: 'Past participles',
    agreement_etre: 'Agreement of past participle with être',
    agreement_avoir: 'Agreement of past participle with avoir (with COD)',
    imparfait: 'Imparfait (descriptions, habits in the past)',
    plus_que_parfait: 'Plus-que-parfait',
    futur_proche: 'Futur proche',
    futur_simple: 'Futur simple',
    passe_recent: 'Passé récent (venir de + infinitive)',
    present_progressif: 'Présent progressif (être en train de)',
    imperatif: 'Impératif (affirmative & negative)',
    interrogative_forms: 'Interrogative forms (questions: adjectives & pronouns)',
    negation: 'Negation (including ne…que)',
    agreement_gender_number: 'Agreement in gender and number',
    sentence_connectors: 'Sentence connectors (basic → advanced)',
    word_order: 'Word order basics',
    adjective_agreement: 'Adjective agreement (gender & number)',
    adjective_position: 'Adjective position',
    possessive_adjectives: 'Possessive adjectives',
    possessive_pronouns: 'Possessive pronouns',
    demonstrative_pronouns: 'Demonstrative pronouns',
    subject_pronouns: 'Subject pronouns',
    direct_object_pronouns: 'Direct object pronouns (COD)',
    indirect_object_pronouns: 'Indirect object pronouns (COI)',
    adverbial_pronouns_y: 'Adverbial pronouns (y)',
    double_pronouns: 'Double pronouns',
    relative_pronouns_qui_que: 'Relative pronouns (qui, que)',
    extended_relative_pronouns: 'Extended relative pronouns (dont, où)',
    prepositions_time: 'Prepositions of time (quand, pendant, depuis, etc.)',
    expressions_duration: 'Expressions of duration (pendant, depuis)',
    expressions_time: 'Expressions of time (dans, il y a)',
    prepositions_place: 'Prepositions of place (à, de, chez, etc.)',
    movement_verbs_prepositions: 'Movement verbs + prepositions (aller à, venir de, être à)',
    adverbs_time: 'Adverbs of time',
    adverbs_place: 'Adverbs of place',
    adverbs_manner: 'Adverbs of manner (-ment)',
    transitive_intransitive: 'Transitive vs intransitive verbs',
    present_progressif_vs_simple: 'Present progressive vs simple present',
    reported_speech: 'Reported speech (present & past)',
    passive_voice: 'Passive voice (including use of on)',
    gerondif: 'Gérondif (en + participe présent)',
    present_participle: 'Present participle',
    present_conditional: 'Present conditional (politeness, wishes, advice)',
    past_conditional: 'Past conditional (regret, reproach)',
    si_present_futur: 'Si + présent → futur (certainty)',
    si_imparfait_conditionnel: 'Si + imparfait → conditionnel présent (uncertainty)',
    si_plusqueparfait_conditionnel: 'Si + plus-que-parfait → conditionnel passé (regret)',
    subjonctif_present: 'Subjonctif présent',
    subj_possibility: 'Subjonctif after expressions of possibility',
    subj_obligation: 'Subjonctif for obligation',
    subj_feelings: 'Subjonctif for feelings',
    subj_opinions: 'Subjonctif for opinions',
    conjunctions_requiring_subj: 'Conjunctions requiring subjunctive (e.g., pour que)',
    basic_connectors: 'Basic connectors: et, mais, parce que',
    cause_connectors: 'Cause: donc, puisque',
    consequence_connectors: 'Consequence: alors, comme',
    opposition_connectors: 'Opposition: pourtant, alors que',
    time_sequencers: 'Time sequencers: d’abord, ensuite, enfin',
    logical_structuring: 'Logical structuring of speech',
    comparative_structures: 'Comparative structures',
    superlatives: 'Superlatives (adjectives & adverbs)',
    restriction: 'Restriction (ne…que)',
    concordance_of_tenses: 'Concordance of tenses (la concordance des temps)',
    expression_of_time: 'Expression of time (tense consistency + sequencing)',
    expression_of_location: 'Expression of location (spatial relations)',
    expression_of_manner: 'Expression of manner',
    expression_complex: 'Expression of cause, consequence, opposition (expanded use)',
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

  let currentMode = 'global'; // 'global' or 'focused'
  let focusedTopic = null;

  let currentQuestion = null;
  let revealed = false;
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

  // ═══ PERSISTENCE ═══
  async function saveAll() {
    await window.storage.set('question_states', questionStates);
    await window.storage.set('topic_states', topicStates);
    await window.storage.set('session_log', sessionLog);
    await window.storage.set('settings', settings);
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
        // If graded Easy 2+ times consecutively, min interval 21 days
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

    // Clamp ease factor
    qs.ease_factor = Math.max(1.3, Math.min(3.0, qs.ease_factor));

    // Set next review
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
    // Sort dates descending
    const dates = sessionLog.filter(e => e.questions_done > 0).map(e => e.date).sort().reverse();
    if (dates.length === 0) return 0;

    let streak = 0;
    let checkDate = new Date(getTodayStr());

    // If today has no entries yet, start checking from yesterday
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

    // Collect all due questions
    let candidates = QUESTION_BANK.filter(q => {
      if (currentMode === 'focused' && focusedTopic) {
        if (!q.topics.includes(focusedTopic)) return false;
      }
      if (q.type === 'listening' && !settings.auto_tts) return false;
      const qs = questionStates[q.id];
      return qs && qs.next_review <= today;
    });

    // Sort by urgency: most overdue first, then by last grade severity
    candidates.sort((a, b) => {
      const qsA = questionStates[a.id];
      const qsB = questionStates[b.id];
      // Days overdue (more overdue = smaller next_review)
      const overdueA = daysBetween(qsA.next_review, today);
      const overdueB = daysBetween(qsB.next_review, today);
      if (overdueA !== overdueB) return overdueB - overdueA; // flip for desc
      // Last grade severity
      const sevA = gradeSeverity(qsA);
      const sevB = gradeSeverity(qsB);
      return sevB - sevA;
    });

    if (candidates.length === 0) {
      // No questions due — pick most overdue anyway
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

    // Weight by topic score (lower = higher weight)
    const weighted = candidates.map(q => {
      const topicScores = q.topics.map(t => topicStates[t]?.score || 50);
      const avgScore = topicScores.reduce((a, b) => a + b, 0) / topicScores.length;
      let weight = Math.max(1, 110 - avgScore); // lower score → higher weight
      if (avgScore < 40) weight *= 2; // drilling boost
      if (avgScore >= 75) weight *= 0.4; // de-prioritize comfortable
      return { question: q, weight };
    });

    // Apply type probability as secondary filter
    const typeWeight = (type) => TYPE_WEIGHTS[type] || 5;
    for (const item of weighted) {
      item.weight *= typeWeight(item.question.type) / 50; // normalize somewhat
    }

    // Weighted random selection
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
  function speak(text, rate = 0.9) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utt = new SpeechSynthesisUtterance(text);
    utt.lang = 'fr-FR';
    
    // Try to find a French voice, prioritizing Thomas
    const voices = window.speechSynthesis.getVoices();
    const thomas = voices.find(v => v.name.includes('Thomas') && v.lang.startsWith('fr'));
    const frVoice = thomas || voices.find(v => v.lang.startsWith('fr'));
    
    if (frVoice) utt.voice = frVoice;
    utt.rate = rate;
    window.speechSynthesis.speak(utt);
  }

  // Ensure voices are loaded
  if (window.speechSynthesis) {
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();
  }

  // ═══ VIEWS & DASHBOARD ═══
  function switchView(viewName) {
    document.getElementById('practice-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('nav-practice').classList.remove('active');
    document.getElementById('nav-dashboard').classList.remove('active');

    if (viewName === 'dashboard') {
      document.getElementById('dashboard-view').classList.remove('hidden');
      document.getElementById('nav-dashboard').classList.add('active');
      renderDashboard();
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
    
    // Iterate over topics based on their original order in TOPIC_LABELS
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

  // ═══ UI RENDERING ═══
  function pickAndShowQuestion() {
    currentQuestion = pickNextQuestion();
    revealed = false;
    renderQuestion(currentQuestion);
  }

  function renderQuestion(q) {
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

    // Reset answer/grade visibility
    document.getElementById('reveal-btn').classList.remove('hidden');
    document.getElementById('answer-area').classList.add('hidden');
    document.getElementById('grade-buttons').classList.add('hidden');

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
      // Case-insensitive replacement in the escaped text
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
      // Show variants as numbered list
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
      // Single answer + explanation
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
  }

  async function handleGrade(grade) {
    if (!currentQuestion || !revealed) return;

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

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't intercept if user is in an input
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

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
