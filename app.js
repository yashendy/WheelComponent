(() => {
  // عناصر
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
  const spinIcon = document.getElementById("spinIcon");

  const winnerWrap = document.getElementById("winnerWrap");
  const winnerText = document.getElementById("winnerText");
  const doneBtn = document.getElementById("doneBtn");

  const timerText = document.getElementById("timerText");
  const timerToggleBtn = document.getElementById("timerToggleBtn");
  const timerResetBtn = document.getElementById("timerResetBtn");

  // State (بديل useState) :contentReference[oaicite:4]{index=4}
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
  };

  // LocalStorage (اختياري)
  const STORAGE_KEY = "wheel_segments_v1";
  const STORAGE_COUNT = "wheel_count_v1";

  function loadStorage() {
    try{
      const savedCount = Number(localStorage.getItem(STORAGE_COUNT));
      if (Number.isFinite(savedCount) && savedCount >= 8) state.count = Wheel.clamp(savedCount, 8, 20);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 8) {
          state.count = Wheel.clamp(arr.length, 8, 20);
          state.segments = Wheel.normalizeSegments(arr.map(x => (x && x.text) ? x.text : x));
          return;
        }
      }
    } catch {}
    // افتراضي: 8 خانات فاضية
    state.segments = Wheel.normalizeSegments(Array.from({length: state.count}, () => ""));
  }

  function saveStorage() {
    try{
      localStorage.setItem(STORAGE_COUNT, String(state.count));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.segments.map(s => s.text)));
    } catch {}
  }

  // Audio (tick/win) نفس فكرة WheelView :contentReference[oaicite:5]{index=5}
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function playTick() {
    if (!state.soundEnabled) return;
    const ctx = ensureAudio();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.1);
  }

  function playWin() {
    if (!state.soundEnabled) return;
    if (!audioCtx) return; // نفس سلوكك: لو لسه متعملش AudioContext يبقى مفيش :contentReference[oaicite:6]{index=6}
    const ctx = audioCtx;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(400, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(600, ctx.currentTime + 0.1);
    osc.frequency.linearRampToValueAtTime(1000, ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.2, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.8);
  }

  function fmtTime(sec){
    const m = Math.floor(sec / 60);
    const s = (sec % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  }

  // Views
  function showSetup() {
    setupView.classList.remove("hidden");
    wheelView.classList.add("hidden");
    backBtn.disabled = true;
    spinBtn.disabled = true;
  }

  function showWheel() {
    setupView.classList.add("hidden");
    wheelView.classList.remove("hidden");
    backBtn.disabled = state.isSpinning;
    spinBtn.disabled = state.isSpinning;
  }

  // Inputs render
  function rebuildSegmentsInputs() {
    segmentsList.innerHTML = "";
    countBadge.textContent = `${state.segments.length} من ${countInput.max || 20}`;

    state.segments.forEach((seg, idx) => {
      const row = document.createElement("div");
      row.className = "segRow";

      const index = document.createElement("div");
      index.className = "index";
      index.textContent = String(idx + 1);

      const input = document.createElement("input");
      input.className = "segInput";
      input.type = "text";
      input.maxLength = 35;
      input.placeholder = `الخيار ${idx + 1}`;
      input.value = seg.text || "";
      input.addEventListener("input", (e) => {
        seg.text = e.target.value;
        validate();
        saveStorage();
        // إعادة رسم خفيفة عشان النص يظهر (ممكن تلغيها لو مش عايزة)
        Wheel.drawWheel(wheelCanvas, state.segments);
      });

      const del = document.createElement("button");
      del.className = "delBtn";
      del.type = "button";
      del.textContent = "🗑️";
      del.title = "حذف";
      del.disabled = state.segments.length <= 8;
      del.addEventListener("click", () => {
        if (state.segments.length <= 8) return;
        state.segments.splice(idx, 1);
        state.count = state.segments.length;
        countInput.value = String(state.count);
        rebuildSegmentsInputs();
        validate();
        saveStorage();
        Wheel.drawWheel(wheelCanvas, state.segments);
      });

      row.appendChild(index);
      row.appendChild(input);
      row.appendChild(del);
      segmentsList.appendChild(row);
    });

    validate();
  }

  function setCount(newCount) {
    const c = Wheel.clamp(Number(newCount) || 8, 8, 20);
    state.count = c;

    const currentTexts = state.segments.map(s => s.text);
    const nextTexts = Array.from({ length: c }, (_, i) => currentTexts[i] ?? "");
    state.segments = Wheel.normalizeSegments(nextTexts);

    rebuildSegmentsInputs();
    saveStorage();
    Wheel.drawWheel(wheelCanvas, state.segments);
  }

  function validate() {
    const ok = state.segments.length >= 8 && state.segments.every(s => (s.text || "").trim().length > 0);
    startBtn.disabled = !ok;
  }

  // Timer (نفس 60 ثانية + Play/Pause/Reset + صوت عند 0) :contentReference[oaicite:7]{index=7}
  function stopTimer() {
    state.timerRunning = false;
    timerToggleBtn.textContent = "▶";
    if (state.timerId) {
      clearInterval(state.timerId);
      state.timerId = null;
    }
  }

  function startTimer() {
    if (state.timeLeft <= 0) return;
    state.timerRunning = true;
    timerToggleBtn.textContent = "⏸";
    state.timerId = setInterval(() => {
      state.timeLeft = Math.max(0, state.timeLeft - 1);
      renderTimer();
      if (state.timeLeft === 0) {
        stopTimer();
        playWin();
      }
    }, 1000);
  }

  function resetTimer() {
    stopTimer();
    state.timeLeft = 60;
    renderTimer();
  }

  function renderTimer() {
    timerText.textContent = fmtTime(state.timeLeft);
    if (state.timeLeft <= 10) timerText.classList.add("danger");
    else timerText.classList.remove("danger");
  }

  // Winner card
  function showWinner(text) {
    state.winner = text;
    winnerText.textContent = text;
    winnerWrap.classList.remove("hidden");

    // Reset timer لكل تحدي جديد :contentReference[oaicite:8]{index=8}
    resetTimer();
    playWin();
  }

  function hideWinner() {
    state.winner = null;
    winnerWrap.classList.add("hidden");
    stopTimer();
  }

  // Spin mechanics (5000ms transition + tick loop + حساب الفائز) :contentReference[oaicite:9]{index=9} :contentReference[oaicite:10]{index=10}
  function spinWheel() {
    if (state.isSpinning) return;
    if (state.segments.length < 2) return;

    hideWinner();
    stopTimer();
    state.isSpinning = true;

    backBtn.disabled = true;
    spinBtn.disabled = true;
    spinBtn.classList.add("spinning");

    // دوران عشوائي (1800..3600) زي عندك تقريباً :contentReference[oaicite:11]{index=11}
    const spins = 1800 + Math.random() * 1800;
    const newRotation = state.rotation + spins;
    state.rotation = newRotation;

    // Tick loop
    const totalDuration = 5000;
    const start = performance.now();
    let tickCount = 0;
    const sliceDeg = 360 / state.segments.length;

    const tickLoop = (now) => {
      const elapsed = now - start;
      if (elapsed >= totalDuration) return;

      const progress = elapsed / totalDuration;
      const ease = 1 - Math.pow(1 - progress, 3); // cubic ease out زي عندك :contentReference[oaicite:12]{index=12}
      const currentSpins = spins * ease;
      const expectedTicks = Math.floor(currentSpins / sliceDeg);

      if (expectedTicks > tickCount) {
        playTick();
        tickCount = expectedTicks;
      }
      requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);

    // طبّق الدوران على العنصر (CSS transition 5000ms) :contentReference[oaicite:13]{index=13}
    wheelShell.style.transform = `rotate(${state.rotation}deg)`;
  }

  function handleSpinEnd() {
    if (!state.isSpinning) return;

    state.isSpinning = false;
    backBtn.disabled = false;
    spinBtn.disabled = false;
    spinBtn.classList.remove("spinning");

    // حساب الفائز (نفس منطقك) :contentReference[oaicite:14]{index=14}
    const finalRotation = ((state.rotation % 360) + 360) % 360;
    const winningAngle = (360 - finalRotation) % 360;
    const sliceAngle = 360 / state.segments.length;
    const winningIndex = Math.floor(winningAngle / sliceAngle);

    const winner = state.segments[winningIndex];
    if (winner && winner.text) showWinner(winner.text);
  }

  // Events
  countInput.addEventListener("change", (e) => setCount(e.target.value));
  countInput.addEventListener("input", (e) => setCount(e.target.value));

  startBtn.addEventListener("click", () => {
    showWheel();
  });

  backBtn.addEventListener("click", () => {
    if (state.isSpinning) return;
    hideWinner();
    showSetup();
  });

  soundBtn.addEventListener("click", () => {
    state.soundEnabled = !state.soundEnabled;
    soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
  });

  spinBtn.addEventListener("click", spinWheel);

  wheelShell.addEventListener("transitionend", handleSpinEnd);

  doneBtn.addEventListener("click", () => {
    hideWinner();
  });

  timerToggleBtn.addEventListener("click", () => {
    if (!state.winner) return;
    if (state.timerRunning) stopTimer();
    else startTimer();
  });

  timerResetBtn.addEventListener("click", () => {
    if (!state.winner) return;
    resetTimer();
  });

  // Init
  loadStorage();
  countInput.value = String(state.count);
  rebuildSegmentsInputs();
  Wheel.drawWheel(wheelCanvas, state.segments);
  renderTimer();
  showSetup();
})();
