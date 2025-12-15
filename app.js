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
    winner: null,          // { text, seconds }
    soundEnabled: true,
    timeLeft: 60,
    timerRunning: false,
    timerId: null,
    timerBase: 60,         // وقت التحدي الحالي
  };

  const STORAGE_KEY = "wheel_segments_v2";
  const STORAGE_COUNT = "wheel_count_v2";
  const STORAGE_ROT = "wheel_rotation_v2"; // ✅ NEW

  function loadStorage() {
    try{
      const savedCount = Number(localStorage.getItem(STORAGE_COUNT));
      if (Number.isFinite(savedCount) && savedCount >= 8) state.count = Wheel.clamp(savedCount, 8, 20);

      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const arr = JSON.parse(raw);
        if (Array.isArray(arr) && arr.length >= 8) {
          state.count = Wheel.clamp(arr.length, 8, 20);
          state.segments = Wheel.normalizeSegments(arr);
        }
      }

      // ✅ NEW: استرجاع آخر دوران (عشان العجلة تفضل واقفة على آخر نتيجة)
      const rot = Number(localStorage.getItem(STORAGE_ROT));
      if (Number.isFinite(rot)) state.rotation = rot;

    } catch {}

    // افتراضي: 8 خانات نص فاضي + وقت 60
    if (!state.segments.length) {
      state.segments = Wheel.normalizeSegments(
        Array.from({length: state.count}, () => ({ text:"", seconds:60 }))
      );
    }
  }

  function saveStorage() {
    try{
      localStorage.setItem(STORAGE_COUNT, String(state.count));
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify(state.segments.map(s => ({ text: s.text, seconds: s.seconds })))
      );

      // ✅ NEW
      localStorage.setItem(STORAGE_ROT, String(state.rotation));
    } catch {}
  }

  // Audio
  let audioCtx = null;
  function ensureAudio() {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  // صوت دوران (تيك)
  function playTick() {
    if (!state.soundEnabled) return;
    const ctx = ensureAudio();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(800, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.11, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.08);
  }

  // ✅ NEW: صوت ساعة (كل ثانية للعد التنازلي)
  function playClockTick(){
    if (!state.soundEnabled) return;
    const ctx = ensureAudio();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "square";
    osc.frequency.setValueAtTime(1200, ctx.currentTime);

    gain.gain.setValueAtTime(0.06, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start();
    osc.stop(ctx.currentTime + 0.03);
  }

  // صوت فوز
  function playWin() {
    if (!state.soundEnabled) return;
    const ctx = ensureAudio();

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(420, ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(660, ctx.currentTime + 0.12);
    osc.frequency.linearRampToValueAtTime(980, ctx.currentTime + 0.32);

    gain.gain.setValueAtTime(0.22, ctx.currentTime);
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

  function rebuildSegmentsInputs() {
    segmentsList.innerHTML = "";
    countBadge.textContent = `${state.segments.length} خانة`;

    state.segments.forEach((seg, idx) => {
      const row = document.createElement("div");
      row.className = "segRow";

      const index = document.createElement("div");
      index.className = "index";
      index.textContent = String(idx + 1);

      const text = document.createElement("textarea");
      text.className = "segText";
      text.maxLength = 100;
      text.placeholder = `اكتبي التحدي ${idx + 1} (حتى 100 حرف)`;
      text.value = seg.text || "";
      text.addEventListener("input", (e) => {
        seg.text = e.target.value;
        validate();
        saveStorage();
        Wheel.drawWheel(wheelCanvas, state.segments);
      });

      const time = document.createElement("input");
      time.className = "segTime";
      time.type = "number";
      time.min = "5";
      time.max = "600";
      time.step = "5";
      time.value = String(seg.seconds ?? 60);
      time.title = "وقت التحدي بالثواني";
      time.addEventListener("input", (e) => {
        const v = Number(e.target.value);
        seg.seconds = Wheel.clamp(Number.isFinite(v) ? v : 60, 5, 600);
        validate();
        saveStorage();
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
      row.appendChild(text);
      row.appendChild(time);
      row.appendChild(del);
      segmentsList.appendChild(row);
    });

    validate();
  }

  function setCount(newCount) {
    const c = Wheel.clamp(Number(newCount) || 8, 8, 20);
    state.count = c;

    const current = state.segments.map(s => ({ text: s.text, seconds: s.seconds }));
    const next = Array.from({ length: c }, (_, i) => current[i] ?? ({ text:"", seconds:60 }));
    state.segments = Wheel.normalizeSegments(next);

    rebuildSegmentsInputs();
    saveStorage();
    Wheel.drawWheel(wheelCanvas, state.segments);
  }

  function validate() {
    const ok =
      state.segments.length >= 8 &&
      state.segments.every(s => (s.text || "").trim().length > 0) &&
      state.segments.every(s => Number.isFinite(s.seconds) && s.seconds >= 5);

    startBtn.disabled = !ok;
  }

  // Timer
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
    ensureAudio(); // ✅ عشان الصوت يشتغل على طول
    state.timerRunning = true;
    timerToggleBtn.textContent = "⏸";

    state.timerId = setInterval(() => {
      state.timeLeft = Math.max(0, state.timeLeft - 1);
      renderTimer();

      // ✅ NEW: تيك ساعة كل ثانية (طالما لسه فيه وقت)
      if (state.timeLeft > 0) playClockTick();

      if (state.timeLeft === 0) {
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

  function renderTimer() {
    timerText.textContent = fmtTime(state.timeLeft);
    if (state.timeLeft <= 10) timerText.classList.add("danger");
    else timerText.classList.remove("danger");
  }

  // Winner
  function showWinner(seg) {
    state.winner = seg;
    winnerText.textContent = seg.text;
    winnerWrap.classList.remove("hidden");

    state.timerBase = Wheel.clamp(Number(seg.seconds) || 60, 5, 600);
    resetTimer();
    playWin();
  }

  function hideWinner() {
    state.winner = null;
    winnerWrap.classList.add("hidden");
    stopTimer();
  }

  // Spin
  function spinWheel() {
    if (state.isSpinning) return;
    if (state.segments.length < 2) return;

    ensureAudio(); // ✅ عشان صوت الدوران يشتغل (متطلبات المتصفح)
    hideWinner();
    stopTimer();
    state.isSpinning = true;

    backBtn.disabled = true;
    spinBtn.disabled = true;
    spinBtn.classList.add("spinning");

    const spins = 1800 + Math.random() * 1800;
    state.rotation = state.rotation + spins;

    // ✅ حفظ الدوران فورًا
    saveStorage();

    const totalDuration = 5000;
    const start = performance.now();
    let tickCount = 0;
    const sliceDeg = 360 / state.segments.length;

    const tickLoop = (now) => {
      const elapsed = now - start;
      if (elapsed >= totalDuration) return;

      const progress = elapsed / totalDuration;
      const ease = 1 - Math.pow(1 - progress, 3);
      const currentSpins = spins * ease;
      const expectedTicks = Math.floor(currentSpins / sliceDeg);

      if (expectedTicks > tickCount) {
        playTick();
        tickCount = expectedTicks;
      }
      requestAnimationFrame(tickLoop);
    };
    requestAnimationFrame(tickLoop);

    wheelShell.style.transform = `rotate(${state.rotation}deg)`;
  }

  function handleSpinEnd() {
    if (!state.isSpinning) return;

    state.isSpinning = false;
    backBtn.disabled = false;
    spinBtn.disabled = false;
    spinBtn.classList.remove("spinning");

    const finalRotation = ((state.rotation % 360) + 360) % 360;
    const winningAngle = (360 - finalRotation) % 360;
    const sliceAngle = 360 / state.segments.length;
    const winningIndex = Math.floor(winningAngle / sliceAngle);

    const winner = state.segments[winningIndex];
    if (winner && winner.text) showWinner(winner);

    // ✅ حفظ آخر وضع للعجلة بعد ما توقف
    saveStorage();
  }

  // Link Export/Import
  function toBase64Url(str){
    const bytes = new TextEncoder().encode(str);
    let bin = "";
    bytes.forEach(b => bin += String.fromCharCode(b));
    const b64 = btoa(bin);
    return b64.replaceAll("+","-").replaceAll("/","_").replaceAll("=","");
  }

  function fromBase64Url(b64url){
    let b64 = b64url.replaceAll("-","+").replaceAll("_","/");
    while (b64.length % 4) b64 += "=";

    const bin = atob(b64);
    const bytes = new Uint8Array([...bin].map(ch => ch.charCodeAt(0)));
    return new TextDecoder().decode(bytes);
  }

  function buildShareLink(){
    const payload = {
      v: 2,
      count: state.count,
      segments: state.segments.map(s => ({ text: (s.text||"").trim(), seconds: s.seconds }))
    };

    if (payload.segments.some(x => !x.text)) {
      alert("لازم تكتبي كل الخانات قبل التصدير 😄");
      return null;
    }

    const encoded = toBase64Url(JSON.stringify(payload));
    const url = new URL(window.location.href);
    url.searchParams.set("d", encoded);
    return url.toString();
  }

  function importFromLinkData(d){
    try{
      const json = fromBase64Url(d);
      const data = JSON.parse(json);

      if (!data || !Array.isArray(data.segments)) throw new Error("Invalid data");

      const rawSegs = data.segments;
      const countGuess = Number(data.count) || rawSegs.length;
      const safeCount = Wheel.clamp(countGuess, 8, 20);

      const items = rawSegs.slice(0, safeCount).map(it => {
        if (typeof it === "string") return { text: it, seconds: 60 };
        return { text: String(it?.text ?? ""), seconds: Number(it?.seconds ?? it?.s ?? 60) };
      });

      state.count = safeCount;
      state.segments = Wheel.normalizeSegments(items);

      countInput.value = String(state.count);
      rebuildSegmentsInputs();
      validate();
      saveStorage();
      Wheel.drawWheel(wheelCanvas, state.segments);

      return true;
    } catch (e){
      console.error(e);
      alert("اللينك ده مش صالح أو متلخبط 🙃");
      return false;
    }
  }

  function tryAutoImportFromUrl(){
    const url = new URL(window.location.href);
    const d = url.searchParams.get("d");
    if (!d) return false;
    return importFromLinkData(d);
  }

  // Events
  countInput.addEventListener("change", (e) => setCount(e.target.value));
  countInput.addEventListener("input", (e) => setCount(e.target.value));

  startBtn.addEventListener("click", () => {
    ensureAudio(); // ✅
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
    if (state.soundEnabled) ensureAudio(); // ✅
  });

  spinBtn.addEventListener("click", spinWheel);
  wheelShell.addEventListener("transitionend", handleSpinEnd);

  doneBtn.addEventListener("click", () => hideWinner());

  timerToggleBtn.addEventListener("click", () => {
    if (!state.winner) return;
    ensureAudio(); // ✅
    if (state.timerRunning) stopTimer();
    else startTimer();
  });

  timerResetBtn.addEventListener("click", () => {
    if (!state.winner) return;
    resetTimer();
  });

  exportLinkBtn.addEventListener("click", () => {
    const link = buildShareLink();
    if (!link) return;

    shareInput.value = link;
    shareBox.classList.remove("hidden");
    shareInput.select();
  });

  copyLinkBtn.addEventListener("click", async () => {
    try{
      await navigator.clipboard.writeText(shareInput.value);
      copyLinkBtn.textContent = "✅ تم النسخ";
      setTimeout(() => (copyLinkBtn.textContent = "نسخ اللينك"), 1200);
    } catch {
      shareInput.select();
      document.execCommand("copy");
    }
  });

  importLinkBtn.addEventListener("click", () => {
    const d = prompt("حطي اللينك كله أو الجزء اللي بعد ?d= :");
    if (!d) return;

    try{
      const maybeUrl = new URL(d);
      const dd = maybeUrl.searchParams.get("d");
      if (!dd) { alert("مفيش d في اللينك"); return; }
      importFromLinkData(dd);
    } catch {
      importFromLinkData(d.trim());
    }
  });

  // Init
  loadStorage();
  countInput.value = String(state.count);
  rebuildSegmentsInputs();

  Wheel.drawWheel(wheelCanvas, state.segments);

  // ✅ NEW: طبّقي آخر دوران فورًا (بدون أنيميشن) عشان تفضل واقفة على آخر نتيجة
  wheelShell.style.transition = "none";
  wheelShell.style.transform = `rotate(${state.rotation}deg)`;
  wheelShell.offsetHeight; // force reflow
  wheelShell.style.transition = "";

  renderTimer();
  showSetup();
  tryAutoImportFromUrl();
})();
