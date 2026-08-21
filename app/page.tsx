"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type FactStat = {
  attempts: number;
  correct: number;
  totalMs: number;
  timesMs: number[];
  streak: number;
  lastAt: number;
};

type DayStat = {
  answers: number;
  correct: number;
  timesMs: number[];
};

type ProgressData = {
  version: 1;
  facts: Record<string, FactStat>;
  totalAnswers: number;
  totalCorrect: number;
  sessions: number;
  bestStreak: number;
  today: string;
  todayAnswers: number;
  todayCorrect: number;
  days: Record<string, DayStat>;
};

type Question = {
  a: number;
  b: number;
  key: string;
  answer: number;
  options: number[];
};

type GameMode = "choice" | "input" | "test";
type Screen = "home" | "game" | "stats" | "summary";

const STORAGE_KEY = "umnozhayka-progress-v1";
const STORAGE_BACKUP_KEY = "umnozhayka-progress-backup-v1";
const SOUND_KEY = "umnozhayka-sound";
const TABLE_MIN = 2;
const TABLE_MAX = 9;
const TIME_SAMPLE_LIMIT = 25;
const DAY_TIME_SAMPLE_LIMIT = 120;
const DAY_HISTORY_LIMIT = 30;

const emptyData = (): ProgressData => ({
  version: 1,
  facts: {},
  totalAnswers: 0,
  totalCorrect: 0,
  sessions: 0,
  bestStreak: 0,
  today: dayKey(),
  todayAnswers: 0,
  todayCorrect: 0,
  days: {},
});

function dayKey(date = new Date()) {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function parseDayKey(key: string) {
  const [year, month, date] = key.split("-").map(Number);
  if (!year || !month || !date) return null;
  const parsed = new Date(year, month - 1, date, 12);
  return dayKey(parsed) === key ? parsed : null;
}

function recentDayKeys(count: number) {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  return Array.from({ length: count }, (_, index) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (count - index - 1));
    return dayKey(date);
  });
}

function trimDays(days: Record<string, DayStat>) {
  return Object.fromEntries(
    Object.entries(days)
      .filter(([key]) => parseDayKey(key))
      .sort(([a], [b]) => (parseDayKey(a)?.getTime() ?? 0) - (parseDayKey(b)?.getTime() ?? 0))
      .slice(-DAY_HISTORY_LIMIT),
  );
}

function factKey(a: number, b: number) {
  return `${Math.min(a, b)}x${Math.max(a, b)}`;
}

function parseKey(key: string) {
  return key.split("x").map(Number) as [number, number];
}

function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function allFactKeys() {
  const keys: string[] = [];
  for (let a = TABLE_MIN; a <= TABLE_MAX; a += 1) {
    for (let b = a; b <= TABLE_MAX; b += 1) keys.push(factKey(a, b));
  }
  return keys;
}

const FACT_KEYS = allFactKeys();

function nonNegativeNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function normalizeStoredProgress(raw: unknown): ProgressData {
  const fresh = emptyData();
  if (!raw || typeof raw !== "object") return fresh;

  const source = raw as Partial<ProgressData>;
  const sourceFacts = source.facts && typeof source.facts === "object" ? source.facts : {};
  const facts: Record<string, FactStat> = {};

  for (const key of FACT_KEYS) {
    const candidate = sourceFacts[key] as Partial<FactStat> | undefined;
    if (!candidate || typeof candidate !== "object") continue;
    const attempts = Math.floor(nonNegativeNumber(candidate.attempts));
    if (!attempts) continue;
    const recordedTimes = Array.isArray(candidate.timesMs)
      ? candidate.timesMs
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 400)
        .map((value) => Math.min(30000, value))
        .slice(-TIME_SAMPLE_LIMIT)
      : [];
    const legacyAverage = nonNegativeNumber(candidate.totalMs) / attempts;
    facts[key] = {
      attempts,
      correct: Math.min(attempts, Math.floor(nonNegativeNumber(candidate.correct))),
      totalMs: nonNegativeNumber(candidate.totalMs),
      timesMs: recordedTimes.length
        ? recordedTimes
        : legacyAverage >= 400
          ? [Math.min(30000, legacyAverage)]
          : [],
      streak: Math.floor(nonNegativeNumber(candidate.streak)),
      lastAt: nonNegativeNumber(candidate.lastAt),
    };
  }

  const storedDay = typeof source.today === "string" ? source.today : fresh.today;
  const days: Record<string, DayStat> = {};
  const sourceDays = source.days && typeof source.days === "object" ? source.days : {};
  for (const [key, rawDay] of Object.entries(sourceDays)) {
    if (!parseDayKey(key) || !rawDay || typeof rawDay !== "object") continue;
    const candidate = rawDay as Partial<DayStat>;
    const answers = Math.floor(nonNegativeNumber(candidate.answers));
    const correct = Math.min(answers, Math.floor(nonNegativeNumber(candidate.correct)));
    const timesMs = Array.isArray(candidate.timesMs)
      ? candidate.timesMs
        .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 400)
        .map((value) => Math.min(30000, value))
        .slice(-DAY_TIME_SAMPLE_LIMIT)
      : [];
    if (answers || timesMs.length) days[key] = { answers, correct, timesMs };
  }
  const legacyTodayAnswers = Math.floor(nonNegativeNumber(source.todayAnswers));
  if (legacyTodayAnswers && parseDayKey(storedDay) && !days[storedDay]) {
    days[storedDay] = {
      answers: legacyTodayAnswers,
      correct: Math.min(legacyTodayAnswers, Math.floor(nonNegativeNumber(source.todayCorrect))),
      timesMs: [],
    };
  }
  const isToday = storedDay === dayKey();
  return {
    version: 1,
    facts,
    totalAnswers: Math.floor(nonNegativeNumber(source.totalAnswers)),
    totalCorrect: Math.floor(nonNegativeNumber(source.totalCorrect)),
    sessions: Math.floor(nonNegativeNumber(source.sessions)),
    bestStreak: Math.floor(nonNegativeNumber(source.bestStreak)),
    today: dayKey(),
    todayAnswers: isToday ? Math.floor(nonNegativeNumber(source.todayAnswers)) : 0,
    todayCorrect: isToday ? Math.floor(nonNegativeNumber(source.todayCorrect)) : 0,
    days: trimDays(days),
  };
}

function loadStoredProgress(storage: Storage) {
  for (const key of [STORAGE_KEY, STORAGE_BACKUP_KEY]) {
    const stored = storage.getItem(key);
    if (!stored) continue;
    try {
      return normalizeStoredProgress(JSON.parse(stored));
    } catch {
      // Try the backup before falling back to a fresh profile.
    }
  }
  return null;
}

function accuracy(stat?: FactStat) {
  if (!stat?.attempts) return 0;
  return stat.correct / stat.attempts;
}

function medianOf(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function medianTimeMs(stat?: FactStat) {
  return stat ? medianOf(stat.timesMs) : 0;
}

function speedScore(stat?: FactStat) {
  const median = medianTimeMs(stat);
  if (!median) return 0;
  return Math.max(0, Math.min(1, (9000 - median) / 6000));
}

function mastery(stat?: FactStat) {
  if (!stat?.attempts) return 0;
  const precision = accuracy(stat);
  const speed = speedScore(stat);
  return Math.round((precision * 0.72 + speed * 0.28) * 100);
}

function level(stat?: FactStat) {
  if (!stat?.attempts) return "new";
  const score = mastery(stat);
  if (stat.attempts >= 3 && score >= 78 && stat.streak >= 2) return "mastered";
  if (score >= 48) return "learning";
  return "weak";
}

function knowledgeCellColor(stat?: FactStat) {
  if (!stat?.attempts) return undefined;

  const percent = Math.round(accuracy(stat) * 100);
  const speed = speedScore(stat);
  const hue = accuracyHue(percent);
  const saturation = 55 + speed * 29;
  const lightness = 87 - percent * 0.29 + (1 - speed) * 5;
  const color = percent < 40 ? "#74291f" : percent < 65 ? "#5f5010" : "#0b5030";

  return {
    backgroundColor: `hsl(${hue} ${saturation}% ${lightness}%)`,
    borderColor: `hsl(${hue} ${48 + speed * 22}% ${Math.max(38, lightness - 13)}%)`,
    color,
  };
}

function accuracyHue(percent: number) {
  return percent <= 50
    ? 4 + (percent / 50) * 44
    : 48 + ((percent - 50) / 50) * 92;
}

function dayLabel(key: string) {
  const date = parseDayKey(key);
  return date ? new Intl.DateTimeFormat("ru-RU", { weekday: "short" }).format(date).replace(".", "") : "";
}

function dateLabel(key: string) {
  const date = parseDayKey(key);
  return date ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short" }).format(date).replace(".", "") : "";
}

function makeOptions(a: number, b: number) {
  const answer = a * b;
  const values = new Set<number>([answer]);
  const candidates = shuffle([
    answer + a,
    answer - a,
    answer + b,
    answer - b,
    (a + 1) * b,
    Math.max(1, (a - 1) * b),
    a * (b + 1),
    Math.max(1, a * (b - 1)),
    answer + 2,
    answer - 2,
    answer + 5,
    answer - 5,
  ]);
  for (const candidate of candidates) {
    if (candidate > 0 && candidate <= 100) values.add(candidate);
    if (values.size === 4) break;
  }
  while (values.size < 4) {
    const candidate = Math.max(2, answer + Math.floor(Math.random() * 17) - 8);
    values.add(candidate);
  }
  return shuffle([...values]);
}

function buildQuestion(key: string): Question {
  const [first, second] = parseKey(key);
  const swap = first !== second && Math.random() > 0.5;
  const [a, b] = swap ? [second, first] : [first, second];
  return { a, b, key, answer: a * b, options: makeOptions(a, b) };
}

function chooseWeightedKey(data: ProgressData, mode: GameMode, recentKeys: string[]) {
  const available = FACT_KEYS.filter((key) => !recentKeys.slice(-4).includes(key));
  const pool = available.length ? available : FACT_KEYS;
  if (mode === "test") return pool[Math.floor(Math.random() * pool.length)];

  const weighted = pool.map((key) => {
    const stat = data.facts[key];
    if (!stat?.attempts) return { key, weight: 7.5 };
    const accuracyGap = 1 - accuracy(stat);
    const slowness = 1 - speedScore(stat);
    const recentMistake = stat.streak === 0 ? 2.4 : 0;
    return {
      key,
      weight: 0.7 + accuracyGap * 7 + slowness * 4 + recentMistake,
    };
  });
  const total = weighted.reduce((sum, item) => sum + item.weight, 0);
  let cursor = Math.random() * total;
  for (const item of weighted) {
    cursor -= item.weight;
    if (cursor <= 0) return item.key;
  }
  return weighted[weighted.length - 1].key;
}

function formatPercent(value: number, total: number) {
  if (!total) return "—";
  return `${Math.round((value / total) * 100)}%`;
}

function medianTime(stat?: FactStat) {
  const median = medianTimeMs(stat);
  if (!median) return "—";
  return `${(median / 1000).toFixed(1)} с`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [data, setData] = useState<ProgressData>(emptyData);
  const dataRef = useRef<ProgressData>(data);
  const [ready, setReady] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [mode, setMode] = useState<GameMode>("choice");
  const [question, setQuestion] = useState<Question>(() => buildQuestion("2x2"));
  const [questionNumber, setQuestionNumber] = useState(1);
  const [target, setTarget] = useState(12);
  const [selected, setSelected] = useState<number | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [feedback, setFeedback] = useState<"correct" | "wrong" | null>(null);
  const [sessionCorrect, setSessionCorrect] = useState(0);
  const [sessionStreak, setSessionStreak] = useState(0);
  const [sessionBest, setSessionBest] = useState(0);
  const [sessionStartedAt, setSessionStartedAt] = useState(Date.now());
  const [sessionDuration, setSessionDuration] = useState(0);
  const questionStartedAt = useRef(Date.now());
  const recentKeys = useRef<string[]>([]);
  const retryQueue = useRef<Array<{ key: string; due: number }>>([]);
  const nextTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Ask supported browsers not to evict the child's progress automatically.
    // The home-screen shortcut stays in the browser so it shares these stable keys.
    void navigator.storage?.persist?.().catch(() => undefined);
    try {
      const stored = loadStoredProgress(window.localStorage);
      if (stored) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate saved progress after the client mounts
        setData(stored);
        dataRef.current = stored;
      }
      setSoundOn(window.localStorage.getItem(SOUND_KEY) !== "off");
    } catch {
      // A fresh local profile is enough if storage is unavailable.
    }
    setReady(true);
    return () => {
      if (nextTimer.current) clearTimeout(nextTimer.current);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (screen !== "game" || selected !== null) return;
      if (mode === "choice") {
        const optionIndex = Number(event.key) - 1;
        if (optionIndex >= 0 && optionIndex < 4) answerQuestion(question.options[optionIndex]);
        return;
      }
      if (/^\d$/.test(event.key)) appendDigit(event.key);
      if (event.key === "Backspace") setInputValue((value) => value.slice(0, -1));
      if (event.key === "Enter") submitInput();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function persist(next: ProgressData) {
    dataRef.current = next;
    setData(next);
    try {
      const serialized = JSON.stringify(next);
      const previous = window.localStorage.getItem(STORAGE_KEY);
      if (previous && previous !== serialized) {
        window.localStorage.setItem(STORAGE_BACKUP_KEY, previous);
      }
      window.localStorage.setItem(STORAGE_KEY, serialized);
    } catch {
      // Keep the game playable even in private browsing modes.
    }
  }

  function playTone(kind: "correct" | "wrong") {
    if (!soundOn) return;
    try {
      const AudioContextClass = window.AudioContext ||
        (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextClass) return;
      const context = new AudioContextClass();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(kind === "correct" ? 620 : 210, context.currentTime);
      if (kind === "correct") oscillator.frequency.exponentialRampToValueAtTime(820, context.currentTime + 0.12);
      gain.gain.setValueAtTime(0.07, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.18);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.18);
    } catch {
      // Sound is a bonus, never a blocker.
    }
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundOn(next);
    window.localStorage.setItem(SOUND_KEY, next ? "on" : "off");
  }

  function nextKey(nextNumber: number) {
    const dueIndex = retryQueue.current.findIndex((item) => item.due <= nextNumber);
    if (dueIndex >= 0) {
      const [retry] = retryQueue.current.splice(dueIndex, 1);
      return retry.key;
    }
    return chooseWeightedKey(dataRef.current, mode, recentKeys.current);
  }

  function startGame(nextMode: GameMode) {
    const nextTarget = nextMode === "test" ? 20 : 12;
    setMode(nextMode);
    setTarget(nextTarget);
    setQuestionNumber(1);
    setSessionCorrect(0);
    setSessionStreak(0);
    setSessionBest(0);
    setSessionStartedAt(Date.now());
    setSessionDuration(0);
    setSelected(null);
    setInputValue("");
    setFeedback(null);
    retryQueue.current = [];
    recentKeys.current = [];
    const key = chooseWeightedKey(dataRef.current, nextMode, []);
    recentKeys.current.push(key);
    setQuestion(buildQuestion(key));
    questionStartedAt.current = Date.now();
    setScreen("game");
  }

  function appendDigit(digit: string) {
    setInputValue((value) => (value.length < 2 ? `${value}${digit}` : value));
  }

  function submitInput() {
    if (!inputValue || selected !== null) return;
    answerQuestion(Number(inputValue));
  }

  function answerQuestion(value: number) {
    if (selected !== null) return;
    const isCorrect = value === question.answer;
    const elapsed = Math.min(30000, Math.max(400, Date.now() - questionStartedAt.current));
    const oldStat = dataRef.current.facts[question.key] ?? { attempts: 0, correct: 0, totalMs: 0, timesMs: [], streak: 0, lastAt: 0 };
    const currentDay = dayKey();
    const oldDay = dataRef.current.days[currentDay] ?? { answers: 0, correct: 0, timesMs: [] };
    const newStreak = isCorrect ? oldStat.streak + 1 : 0;
    const todayChanged = dataRef.current.today !== currentDay;
    const next: ProgressData = {
      ...dataRef.current,
      today: currentDay,
      todayAnswers: (todayChanged ? 0 : dataRef.current.todayAnswers) + 1,
      todayCorrect: (todayChanged ? 0 : dataRef.current.todayCorrect) + (isCorrect ? 1 : 0),
      totalAnswers: dataRef.current.totalAnswers + 1,
      totalCorrect: dataRef.current.totalCorrect + (isCorrect ? 1 : 0),
      bestStreak: Math.max(dataRef.current.bestStreak, isCorrect ? sessionStreak + 1 : sessionStreak),
      days: trimDays({
        ...dataRef.current.days,
        [currentDay]: {
          answers: oldDay.answers + 1,
          correct: oldDay.correct + (isCorrect ? 1 : 0),
          timesMs: [...oldDay.timesMs, elapsed].slice(-DAY_TIME_SAMPLE_LIMIT),
        },
      }),
      facts: {
        ...dataRef.current.facts,
        [question.key]: {
          attempts: oldStat.attempts + 1,
          correct: oldStat.correct + (isCorrect ? 1 : 0),
          totalMs: oldStat.totalMs + elapsed,
          timesMs: [...oldStat.timesMs, elapsed].slice(-TIME_SAMPLE_LIMIT),
          streak: newStreak,
          lastAt: Date.now(),
        },
      },
    };
    persist(next);
    setSelected(value);
    setFeedback(isCorrect ? "correct" : "wrong");
    playTone(isCorrect ? "correct" : "wrong");
    const nextSessionStreak = isCorrect ? sessionStreak + 1 : 0;
    if (isCorrect) setSessionCorrect((count) => count + 1);
    setSessionStreak(nextSessionStreak);
    setSessionBest((best) => Math.max(best, nextSessionStreak));
    if (!isCorrect) retryQueue.current.push({ key: question.key, due: questionNumber + 3 });

    nextTimer.current = setTimeout(() => {
      if (questionNumber >= target) {
        const finished: ProgressData = { ...dataRef.current, sessions: dataRef.current.sessions + 1 };
        persist(finished);
        setSessionDuration(Date.now() - sessionStartedAt);
        setScreen("summary");
        return;
      }
      const newNumber = questionNumber + 1;
      const key = nextKey(newNumber);
      recentKeys.current.push(key);
      setQuestion(buildQuestion(key));
      setQuestionNumber(newNumber);
      setSelected(null);
      setInputValue("");
      setFeedback(null);
      questionStartedAt.current = Date.now();
    }, isCorrect ? 650 : 1250);
  }

  const stats = useMemo(() => {
    const mastered = FACT_KEYS.filter((key) => level(data.facts[key]) === "mastered").length;
    const learning = FACT_KEYS.filter((key) => ["learning", "weak"].includes(level(data.facts[key]))).length;
    const weak = FACT_KEYS
      .filter((key) => data.facts[key]?.attempts)
      .sort((a, b) => mastery(data.facts[a]) - mastery(data.facts[b]))
      .slice(0, 5);
    return { mastered, learning, weak };
  }, [data]);

  const week = useMemo(() => {
    const days = recentDayKeys(7).map((key) => ({
      key,
      ...(data.days[key] ?? { answers: 0, correct: 0, timesMs: [] }),
    }));
    const answers = days.reduce((sum, day) => sum + day.answers, 0);
    const correct = days.reduce((sum, day) => sum + day.correct, 0);
    const timesMs = days.flatMap((day) => day.timesMs);
    return {
      days,
      answers,
      correct,
      medianMs: medianOf(timesMs),
      activeDays: days.filter((day) => day.answers > 0).length,
      maxAnswers: Math.max(1, ...days.map((day) => day.answers)),
    };
  }, [data.days]);

  function resetProgress() {
    if (!window.confirm("Стереть всю статистику и начать заново?")) return;
    const fresh = emptyData();
    persist(fresh);
    setScreen("home");
  }

  if (!ready) return <main className="loading">Готовим примеры…</main>;

  return (
    <main className={`app screen-${screen}`}>
      <div className="ambient ambient-one" />
      <div className="ambient ambient-two" />
      <header className="topbar">
        <button className="brand" onClick={() => setScreen("home")} aria-label="На главную">
          <span className="brand-mark" aria-hidden="true">×</span>
          <span>Умножайка</span>
        </button>
        <nav className="main-nav" aria-label="Главное меню">
          <button className={screen === "home" ? "active" : ""} onClick={() => setScreen("home")}>Играть</button>
          <button className={screen === "stats" ? "active" : ""} onClick={() => setScreen("stats")}>Мои знания</button>
        </nav>
        <button className="sound-button" onClick={toggleSound} aria-label={soundOn ? "Выключить звук" : "Включить звук"}>
          {soundOn ? "♪" : "♪̸"}
        </button>
      </header>

      {screen === "home" && (
        <div className="page home-page">
          <div className="home-dashboard">
            <section className="welcome-strip">
              <div className="welcome-copy">
                <div className="eyebrow"><span className="live-dot" /> Сегодня</div>
                <h1>Привет, Соня! <span>Потренируемся?</span></h1>
              </div>
              <div className="welcome-visual" aria-hidden="true">
                <span className="welcome-equation">6 × 7</span>
                <div className="mascot welcome-mascot">
                  <span className="mascot-ray ray-one" />
                  <span className="mascot-ray ray-two" />
                  <span className="mascot-ray ray-three" />
                  <span className="mascot-face"><i /><i /><b /></span>
                </div>
              </div>
              <div className="today-summary" aria-label="Результаты за сегодня">
                <span><strong>{data.todayAnswers}</strong><small>примеров</small></span>
                <i />
                <span><strong>{formatPercent(data.todayCorrect, data.todayAnswers)}</strong><small>верно</small></span>
              </div>
            </section>

            <section className="home-mode-panel" aria-labelledby="mode-heading">
              <div className="home-section-heading">
                <div><span className="section-kicker">Играть</span><h2 id="mode-heading">Выбери режим</h2></div>
                <p>Тренировка сама чаще подбирает сложные и долгие примеры.</p>
              </div>
              <div className="home-mode-grid">
                <button className="home-mode-button choice-mode" onClick={() => startGame("choice")}>
                  <span className="home-mode-icon" aria-hidden="true">✓</span>
                  <span className="home-mode-copy"><strong>Выбрать ответ</strong><small>12 умных примеров</small></span>
                  <span className="home-mode-arrow" aria-hidden="true">→</span>
                </button>
                <button className="home-mode-button input-mode" onClick={() => startGame("input")}>
                  <span className="home-mode-icon keypad-symbol" aria-hidden="true">123</span>
                  <span className="home-mode-copy"><strong>Ввести самому</strong><small>12 умных примеров</small></span>
                  <span className="home-mode-arrow" aria-hidden="true">→</span>
                </button>
                <button className="home-mode-button test-mode" onClick={() => startGame("test")}>
                  <span className="home-mode-icon keypad-symbol" aria-hidden="true">20</span>
                  <span className="home-mode-copy"><strong>Большая проверка</strong><small>20 случайных примеров</small></span>
                  <span className="home-mode-arrow" aria-hidden="true">→</span>
                </button>
              </div>
            </section>

            <button
              className="home-progress-card"
              onClick={() => setScreen("stats")}
              aria-label="Открыть подробные результаты и карту знаний"
            >
              <span className="home-progress-copy">
                <span className="section-kicker">Твой прогресс</span>
                <strong>Мои результаты</strong>
                <small>Точность, скорость и карта знаний</small>
              </span>
              <span className="home-progress-summary">
                <span className="mini-progress-ring" style={{ "--progress": `${Math.round((stats.mastered / FACT_KEYS.length) * 100) * 3.6}deg` } as React.CSSProperties}>
                  <span><strong>{stats.mastered}</strong><small>из {FACT_KEYS.length}</small></span>
                </span>
                <span className="home-progress-numbers">
                  <span><strong>{stats.mastered}</strong><small>знаю</small></span>
                  <span><strong>{stats.learning}</strong><small>учу</small></span>
                  <span><strong>{FACT_KEYS.length - stats.mastered - stats.learning}</strong><small>новых</small></span>
                </span>
              </span>
              <span className="home-progress-link">Открыть карту <b aria-hidden="true">→</b></span>
            </button>
          </div>
        </div>
      )}

      {screen === "game" && (
        <div className="page game-page">
          <section className={`game-card ${feedback ?? ""}`}>
            <div className="game-head">
              <button className="close-button" onClick={() => setScreen("home")} aria-label="Закончить тренировку">×</button>
              <div className="game-progress" aria-label={`Пример ${questionNumber} из ${target}`}>
                <span style={{ width: `${(questionNumber / target) * 100}%` }} />
              </div>
              <div className="counter">{questionNumber}<span>/{target}</span></div>
            </div>
            <div className="streak-pill">🔥 Серия: <strong>{sessionStreak}</strong></div>
            <div className="question-wrap">
              <p>{mode === "test" ? "Большая проверка" : mode === "input" ? "Введи ответ" : "Выбери ответ"}</p>
              <div className="equation"><span>{question.a}</span><b>×</b><span>{question.b}</span><b>=</b><em>?</em></div>
            </div>
            {mode === "choice" ? (
              <div className="answers-grid">
                {question.options.map((option, index) => {
                  const isChosen = selected === option;
                  const isAnswer = option === question.answer;
                  const state = selected === null ? "" : isAnswer ? "answer-correct" : isChosen ? "answer-wrong" : "muted";
                  return (
                    <button key={option} className={`answer-button ${state}`} onClick={() => answerQuestion(option)} disabled={selected !== null}>
                      <span>{option}</span><small>{index + 1}</small>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="number-entry">
                <div className={`number-display ${feedback ?? ""}`} aria-label={inputValue ? `Введено ${inputValue}` : "Ответ пока не введён"}>
                  {inputValue || <span>Ответ</span>}
                </div>
                <div className="number-pad" aria-label="Цифровая клавиатура">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
                    <button key={digit} onClick={() => appendDigit(String(digit))} disabled={selected !== null}>{digit}</button>
                  ))}
                  <button className="erase-key" onClick={() => setInputValue((value) => value.slice(0, -1))} disabled={selected !== null || !inputValue} aria-label="Стереть последнюю цифру">⌫</button>
                  <button onClick={() => appendDigit("0")} disabled={selected !== null}>0</button>
                  <button className="submit-key" onClick={submitInput} disabled={selected !== null || !inputValue} aria-label="Проверить ответ">Готово</button>
                </div>
              </div>
            )}
            <div className={`feedback-line ${feedback ?? ""}`} aria-live="polite">
              {feedback === "correct" && <><strong>Отлично!</strong> Так держать ✦</>}
              {feedback === "wrong" && <><strong>Почти!</strong> {question.a} × {question.b} = {question.answer}. Мы повторим этот пример.</>}
              {!feedback && <span>{mode === "choice" ? "Можно нажать клавиши 1–4" : "Набери ответ и нажми «Готово»"}</span>}
            </div>
          </section>
        </div>
      )}

      {screen === "summary" && (
        <div className="page summary-page">
          <section className="summary-card">
            <div className="summary-burst"><span>★</span></div>
            <span className="section-kicker">Тренировка закончена</span>
            <h1>{sessionCorrect >= target * 0.8 ? "Суперработа!" : "Хорошая тренировка!"}</h1>
            <p>Каждый пример делает таблицу умножения чуточку легче.</p>
            <div className="summary-stats">
              <div><strong>{sessionCorrect}<small>/{target}</small></strong><span>верных ответов</span></div>
              <div><strong>{formatPercent(sessionCorrect, target)}</strong><span>точность</span></div>
              <div><strong>{sessionBest}</strong><span>лучшая серия</span></div>
              <div><strong>{Math.max(1, Math.round(sessionDuration / 60000))} мин</strong><span>время</span></div>
            </div>
            <div className="summary-actions">
              <button className="primary-button" onClick={() => startGame(mode)}>Ещё раунд</button>
              <button className="secondary-button" onClick={() => setScreen("stats")}>Посмотреть знания</button>
            </div>
          </section>
        </div>
      )}

      {screen === "stats" && (
        <div className="page stats-page">
          <section className="stats-intro">
            <div><span className="section-kicker">Личная статистика</span><h1>Моя карта знаний</h1><p>Оттенок показывает точность, а насыщенность — скорость ответа.</p></div>
            <button className="primary-button compact" onClick={() => startGame("input")}>Тренировать слабые места</button>
          </section>

          <section className="stat-cards">
            <article><span>Всего решено</span><strong>{data.totalAnswers}</strong><small>за {data.sessions || 0} тренировок</small></article>
            <article><span>Точность</span><strong>{formatPercent(data.totalCorrect, data.totalAnswers)}</strong><small>{data.totalCorrect} верных ответов</small></article>
            <article><span>Лучшая серия</span><strong>{data.bestStreak} 🔥</strong><small>ответов подряд</small></article>
            <article><span>Знаю отлично</span><strong>{stats.mastered}</strong><small>из {FACT_KEYS.length} примеров</small></article>
          </section>

          <section className="weekly-section">
            <div className="card-heading">
              <div><span className="section-kicker">Последние 7 дней</span><h2>Неделя в цифрах</h2></div>
              <div className="weekly-summary">
                <span><strong>{week.answers}</strong> примеров</span>
                <span><strong>{formatPercent(week.correct, week.answers)}</strong> точность</span>
                <span><strong>{week.medianMs ? `${(week.medianMs / 1000).toFixed(1)} с` : "—"}</strong> медиана</span>
                <span><strong>{week.activeDays}/7</strong> активных дней</span>
              </div>
            </div>
            <div className="weekly-scroll">
              <div className="weekly-chart" role="list" aria-label="Результаты за последние семь дней">
                {week.days.map((day) => {
                  const percent = day.answers ? Math.round((day.correct / day.answers) * 100) : 0;
                  const barHeight = day.answers ? Math.max(10, Math.round((day.answers / week.maxAnswers) * 100)) : 0;
                  return (
                    <article className={`day-column ${day.key === dayKey() ? "today" : ""}`} role="listitem" key={day.key} title={`${dateLabel(day.key)}: ${day.answers} примеров, ${formatPercent(day.correct, day.answers)} верно`}>
                      <strong>{day.answers || "—"}</strong>
                      <div className="day-bar-track"><i style={{ height: `${barHeight}%`, backgroundColor: day.answers ? `hsl(${accuracyHue(percent)} 74% 58%)` : undefined }} /></div>
                      <b>{dayLabel(day.key)}</b>
                      <span>{dateLabel(day.key)}</span>
                      <small>{formatPercent(day.correct, day.answers)}</small>
                    </article>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="knowledge-section">
            <div className="card-heading">
              <div><span className="section-kicker">Таблица 2–9</span><h2>Карта примеров</h2></div>
              <div className="accuracy-legend" aria-label="Шкала точности: от красного через жёлтый к зелёному">
                <span className="empty-legend"><i />Нет ответов</span>
                <div className="gradient-legend">
                  <i />
                  <div><span>0%</span><span>50%</span><span>100%</span></div>
                  <small>Ярче — быстрее ответ</small>
                </div>
              </div>
            </div>
            <div className="table-scroll">
              <div className="knowledge-table" role="table" aria-label="Знание таблицы умножения">
                <div className="corner-cell">×</div>
                {Array.from({ length: 8 }, (_, i) => i + 2).map((value) => <div className="axis-cell" key={`h${value}`}>{value}</div>)}
                {Array.from({ length: 8 }, (_, row) => row + 2).flatMap((a) => [
                  <div className="axis-cell" key={`v${a}`}>{a}</div>,
                  ...Array.from({ length: 8 }, (_, col) => col + 2).map((b) => {
                    const key = factKey(a, b);
                    const stat = data.facts[key];
                    return (
                      <div className={`fact-cell ${stat?.attempts ? "answered" : "new"}`} style={knowledgeCellColor(stat)} key={`${a}-${b}`} title={`${a} × ${b}: ${stat?.attempts ? `${Math.round(accuracy(stat) * 100)}% верно, медиана ${medianTime(stat)}` : "ещё не было"}`}>
                        <span>{a * b}</span>
                        {stat?.attempts ? (
                          <>
                            <small>{Math.round(accuracy(stat) * 100)}%</small>
                            <small className="time-count">{medianTime(stat)}</small>
                          </>
                        ) : <small>—</small>}
                      </div>
                    );
                  }),
                ])}
              </div>
            </div>
          </section>

          <section className="focus-section">
            <div className="card-heading"><div><span className="section-kicker">Что подучить</span><h2>Фокус на следующую игру</h2></div></div>
            {stats.weak.length ? (
              <div className="focus-list">
                {stats.weak.map((key) => {
                  const [a, b] = parseKey(key);
                  const stat = data.facts[key];
                  return <div className="focus-row" key={key}><span className="focus-equation">{a} × {b}</span><div className="focus-bar"><i style={{ width: `${Math.max(8, mastery(stat))}%` }} /></div><strong>{Math.round(accuracy(stat) * 100)}%</strong><small>медиана {medianTime(stat)}</small></div>;
                })}
              </div>
            ) : (
              <div className="empty-focus"><span>✦</span><p><strong>Сначала сыграем!</strong> После первой тренировки здесь появятся примеры для повторения.</p></div>
            )}
            <button className="reset-button" onClick={resetProgress}>Сбросить статистику</button>
          </section>
        </div>
      )}
    </main>
  );
}
