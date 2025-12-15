(() => {
  /* ================= DOM ================= */
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

  /* ================= STATE ================= */
  const state = {
    count: 8,
    segments: [],
    rotation: 0,
    isSpinning: false,

    winner: null,

    soundEnabled: true,

    timeLeft: 60,
    timerBase: 60,
    timerRunning: false,
    timerId: null,
  };

  const STORAGE_KEY = "wheel_segments_v2";
  const STORAGE_COUNT = "wheel_count_v2";
  const STORAGE_ROT = "wheel_rotation_v2";

  /* ================= STORAGE ================= */
  function loadStorage() {
    try {
      const c = Number(localStorage.getItem(STORAGE_COUNT));
      if (Number.isFinite(c)) state.count = Wheel.clamp(c, 8, 20);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 8) {
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
    try {
      localStorage.setItem(STORAGE_COUNT, state.count);
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.segments.map(s => ({
          text: s.text,
          seconds: s.seconds
        })))
      );
      localStorage.setItem(STORAGE_ROT, state.rotation);
    } catch {}
  }

  /* ================= AUDIO ================= */
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
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

  /* ================= UI HELPERS ================= */
  function fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = String(sec % 60).padStart(2, "0");
    return `${m}:${s}`;
  }

  function showSetup() {
    setupView.classList.remove("hidden");
    wheelView.classList.add("hidden");
    backBtn.disabled = true;
  }

  function showWheel() {
    setupView.classList.add("hidden");
    wheelView.classList.remove("hidden");
    backBtn.disabled = state.isSpinning;
  }

  /* ================= SETUP ================= */
  function rebuildSegmentsInputs() {
    segmentsList.innerHTML = "";
    countBadge.textContent = `${state.segments.length} خانة`;

    state.segments.forEach((seg, idx) => {
      const row = document.createElement("div");
      row.className = "segRow";

      const index = document.createElement("div");
      index.className = "index";
      index.textContent = idx + 1;

      const text = document.createElement("textarea");
      text.className = "segText";
      text.maxLength = 100;
      text.value = seg.text || "";
      text.placeholder = `اكتبي التحدي ${idx + 1}`;
      text.oninput = () => {
        seg.text = text.value;
        validate();
        saveStorage();
        Wheel.drawWheel(wheelCanvas, state.segments);
      };

      const time = document.createElement("input");
      time.type = "number";
      time.className = "segTime";
      time.min = 5;
      time.max = 600;
      time.value = seg.seconds || 60;
      time.oninput = () => {
        seg.seconds = Wheel.clamp(Number(time.value) || 60, 5, 600);
        validate();
        saveStorage();
      };

      const del = document.createElement("button");
      del.className = "delBtn";
      del.textContent = "🗑️";
      del.disabled = state.segments.length <= 8;
      del.onclick = () => {
        if (state.segments.length <= 8) return;
        state.segments.splice(idx, 1);
        state.count = state.segments.length;
        countInput.value = state.count;
        rebuildSegmentsInputs();
        validate();
        saveStorage();
        Wheel.drawWheel(wheelCanvas, state.segments);
      };

      row.append(index, text, time, del);
      segmentsList.appendChild(row);
    });

    validate();
  }

  function setCount(v) {
    const c = Wheel.clamp(Number(v) || 8, 8, 20);
    state.count = c;

    const next = Array.from({ length: c }, (_, i) =>
      state.segments[i] || { text: "", seconds: 60 }
    );
    state.segments = Wheel.normalizeSegments(next);

    rebuildSegmentsInputs();
    saveStorage();
    Wheel.drawWheel(wheelCanvas, state.segments);
  }

  function validate() {
    const ok =
      state.segments.length >= 8 &&
      state.segments.every(s => s.text && s.text.trim()) &&
      state.segments.every(s => s.seconds >= 5);

    startBtn.disabled = !ok;
  }

  /* ================= TIMER ================= */
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

  /* ================= WINNER ================= */
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

  /* ================= SPIN ================= */
  function spinWheel() {
    if (state.isSpinning) return;

    hideWinner();
    ensureAudio();
    state.isSpinning = true;
    backBtn.disabled = true;

    const spins = 1800 + Math.random() * 1800;
    state.rotation += spins;
    saveStorage();

    wheelShell.style.transform = `rotate(${state.rotation}deg)`;

    const slice = 360 / state.segments.length;
    let ticks = 0;
    const start = performance.now();
    const duration = 5000;

    function loop(now) {
      if (now - start >= duration) return;
      const p = (now - start) / duration;
      const deg = spins * p;
      const t = Math.floor(deg / slice);
      if (t > ticks) {
        playTick();
        ticks = t;
      }
      requestAnimationFrame(loop);
    }
    requestAnimationFrame(loop);
  }

  function handleSpinEnd() {
    state.isSpinning = false;
    backBtn.disabled = false;

    const deg = ((state.rotation % 360) + 360) % 360;
    const angle = (360 - deg) % 360;
    const idx = Math.floor(angle / (360 / state.segments.length));

    showWinner(state.segments[idx]);
    saveStorage();
  }

  /* ================= SHARE ================= */
  function buildShareLink() {
    const payload = {
      v: 2,
      count: state.count,
      segments: state.segments.map(s => ({
        text: s.text.trim(),
        seconds: s.seconds
      }))
    };

    const json = JSON.stringify(payload);
    const encoded = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const url = new URL(location.href);
    url.searchParams.set("d", encoded);
    return url.toString();
  }

  function importFromLink(d) {
    try {
      const json = decodeURIComponent(escape(atob(d.replace(/-/g, "+").replace(/_/g, "/"))));
      const data = JSON.parse(json);

      state.count = Wheel.clamp(data.count || data.segments.length, 8, 20);
      state.segments = Wheel.normalizeSegments(data.segments);

      countInput.value = state.count;
      rebuildSegmentsInputs();
      saveStorage();
      Wheel.drawWheel(wheelCanvas, state.segments);
    } catch {
      alert("اللينك غير صالح");
    }
  }

  /* ================= EVENTS ================= */
  countInput.oninput = e => setCount(e.target.value);
  startBtn.onclick = () => { ensureAudio(); showWheel(); };
  backBtn.onclick = () => { if (!state.isSpinning) showSetup(); };
  spinBtn.onclick = spinWheel;
  wheelShell.addEventListener("transitionend", handleSpinEnd);

  timerToggleBtn.onclick = () => state.timerRunning ? stopTimer() : startTimer();
  timerResetBtn.onclick = resetTimer;
  doneBtn.onclick = hideWinner;

  soundBtn.onclick = () => {
    state.soundEnabled = !state.soundEnabled;
    soundIcon.textContent = state.soundEnabled ? "🔊" : "🔇";
    if (!state.soundEnabled) stopClockMusic();
  };

  exportLinkBtn.onclick = () => {
    shareInput.value = buildShareLink();
    shareBox.classList.remove("hidden");
  };

  copyLinkBtn.onclick = () => {
    navigator.clipboard.writeText(shareInput.value);
  };

  importLinkBtn.onclick = () => {
    const d = prompt("حطي اللينك أو الجزء بعد d=");
    if (!d) return;
    importFromLink(d.includes("d=") ? new URL(d).searchParams.get("d") : d);
  };

  /* ================= INIT ================= */
  loadStorage();
  countInput.value = state.count;
  rebuildSegmentsInputs();

  Wheel.drawWheel(wheelCanvas, state.segments);

  wheelShell.style.transition = "none";
  wheelShell.style.transform = `rotate(${state.rotation}deg)`;
  wheelShell.offsetHeight;
  wheelShell.style.transition = "";

  renderTimer();
  showSetup();
})();
