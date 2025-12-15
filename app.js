(() => {
  const setupView = document.getElementById("setupView");
  const wheelView = document.getElementById("wheelView");

  const backBtn = document.getElementById("backBtn");
  const soundBtn = document.getElementById("soundBtn");
  const soundIcon = document.getElementById("soundIcon");

  const countInput = document.getElementById("countInput");
  const countBadge = document.getElementById("countBadge");
  const segmentsList = document.getElementById("segmentsList");
  const startBtn = document.getElementById("startBtn");

  const wheelShell = document.getElementById("wheelShell");
  const wheelCanvas = document.getElementById("wheelCanvas");
  const spinBtn = document.getElementById("spinBtn");

  const winnerWrap = document.getElementById("winnerWrap");
  const winnerText = document.getElementById("winnerText");
  const doneBtn = document.getElementById("doneBtn");

  const timerText = document.getElementById("timerText");
  const timerToggleBtn = document.getElementById("timerToggleBtn");
  const timerResetBtn = document.getElementById("timerResetBtn");

  const exportLinkBtn = document.getElementById("exportLinkBtn");
  const importLinkBtn = document.getElementById("importLinkBtn");
  const shareBox = document.getElementById("shareBox");
  const shareInput = document.getElementById("shareInput");
  const copyLinkBtn = document.getElementById("copyLinkBtn");

  const state = {
    count: 8,
    segments: [],
    rotation: 0,
    isSpinning: false,
    winner: null,
    soundEnabled: true,
    timeLeft: 60,
    timerRunning: false,
    timerId: null,
    timerBase: 60,
  };

  const STORAGE_KEY = "wheel_segments_v2";
  const STORAGE_COUNT = "wheel_count_v2";
  const STORAGE_ROT = "wheel_rotation_v2";

  /* ================== STORAGE ================== */
  function loadStorage() {
    try {
      const c = Number(localStorage.getItem(STORAGE_COUNT));
      if (c >= 8) state.count = Wheel.clamp(c, 8, 20);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr)) {
          state.segments = Wheel.normalizeSegments(arr);
          state.count = state.segments.length;
        }
      }

      const rot = Number(localStorage.getItem(STORAGE_ROT));
      if (Number.isFinite(rot)) state.rotation = rot;
    } catch {}

    if (!state.segments.length) {
      state.segments = Wheel.normalizeSegments(
        Array.from({ length: state.count }, () => ({ text: "", seconds: 60 }))
      );
    }
  }

  function saveStorage() {
    localStorage.setItem(STORAGE_COUNT, state.count);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.segments));
    localStorage.setItem(STORAGE_ROT, state.rotation);
  }

  /* ================== AUDIO ================== */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx)
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  // موسيقى العد التنازلي 🎵
  let clockMusic = null;

  function startClockMusic() {
    if (!state.soundEnabled) return;
    if (!clockMusic) {
      clockMusic = new Audio("clock-music.mp3");
      clockMusic.loop = true;
      clockMusic.volume = 0.5;
    }
    clockMusic.currentTime = 0;
    clockMusic.play().catch(() => {});
  }

  function stopClockMusic() {
    if (!clockMusic) return;
    clockMusic.pause();
    clockMusic.currentTime = 0;
  }

  // صوت دوران خفيف
  function playTick() {
    if (!state.soundEnabled) return;
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.value = 500;
    gain.gain.value = 0.05;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.05);
  }

  // صوت الفوز
  function playWin() {
    if (!state.soundEnabled) return;
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.frequency.setValueAtTime(400, audioCtx.currentTime);
    osc.frequency.linearRampToValueAtTime(800, audioCtx.currentTime + 0.3);
    gain.gain.value = 0.2;
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + 0.6);
  }

  /* ================== TIMER ================== */
  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function renderTimer() {
    timerText.textContent = fmt(state.timeLeft);
  }

  function stopTimer() {
    state.timerRunning = false;
    timerToggleBtn.textContent = "▶";
    stopClockMusic();
    if (state.timerId) clearInterval(state.timerId);
    state.timerId = null;
  }

  function startTimer() {
    if (state.timeLeft <= 0) return;
    ensureAudio();
    startClockMusic();

    state.timerRunning = true;
    timerToggleBtn.textContent = "⏸";

    state.timerId = setInterval(() => {
      state.timeLeft--;
      renderTimer();
      if (state.timeLeft <= 0) {
        stopTimer();
        playWin();
      }
    }, 1000);
  }

  function resetTimer() {
    stopTimer();
    state.timeLeft = state.timerBase;
    renderTimer();
  }

  /* ================== WINNER ================== */
  function showWinner(seg) {
    state.winner = seg;
    winnerText.textContent = seg.text;
    winnerWrap.classList.remove("hidden");

    state.timerBase = seg.seconds || 60;
    state.timeLeft = state.timerBase;
    renderTimer();
    playWin();
  }

  function hideWinner() {
    stopTimer();
    winnerWrap.classList.add("hidden");
    state.winner = null;
  }

  /* ================== SPIN ================== */
  function spinWheel() {
    if (state.isSpinning) return;
    hideWinner();
    state.isSpinning = true;
    ensureAudio();

    const spins = 1800 + Math.random() * 1800;
    state.rotation += spins;
    saveStorage();

    wheelShell.style.transform = `rotate(${state.rotation}deg)`;

    let ticks = 0;
    const slice = 360 / state.segments.length;

    const start = performance.now();
    const duration = 5000;

    function loop(now) {
      if (now - start >= duration) return;
      const prog = (now - start) / duration;
      const deg = spins * prog;
      const exp = Math.floor(deg / slice);
      if (exp > ticks) {
        playTick();
        ticks = exp;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function handleSpinEnd() {
    state.isSpinning = false;
    const deg = ((state.rotation % 360) + 360) % 360;
    const angle = (360 - deg) % 360;
    const idx = Math.floor(angle / (360 / state.segments.length));
    showWinner(state.segments[idx]);
    saveStorage();
  }

  /* ================== INIT ================== */
  loadStorage();
  Wheel.drawWheel(wheelCanvas, state.segments);

  wheelShell.style.transition = "none";
  wheelShell.style.transform = `rotate(${state.rotation}deg)`;
  wheelShell.offsetHeight;
  wheelShell.style.transition = "";

  renderTimer();

  spinBtn.addEventListener("click", spinWheel);
  wheelShell.addEventListener("transitionend", handleSpinEnd);

  timerToggleBtn.addEventListener("click", () => {
    state.timerRunning ? stopTimer() : startTimer();
  });

  timerResetBtn.addEventListener("click", resetTimer);
  doneBtn.addEventListener("click", hideWinner);

  soundBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
    if (!state.soundEnabled) stopClockMusic();
  });
})();
