(() => {
  const DEFAULT_COLORS = [
    "#6366f1", "#22c55e", "#f97316", "#ec4899",
    "#06b6d4", "#f59e0b", "#a855f7", "#10b981",
    "#ef4444", "#3b82f6", "#84cc16", "#fb7185",
  ];

  function clamp(n, a, b){ return Math.max(a, Math.min(b, n)); }

  function fitText(ctx, text, maxWidth, font, fallbackMaxChars = 18) {
    ctx.font = font;
    if (ctx.measureText(text).width <= maxWidth) return text;
    // قص سريع (زي اللي عندك فكرة substring + ...). :contentReference[oaicite:2]{index=2}
    const short = text.slice(0, Math.max(3, fallbackMaxChars - 3)) + "...";
    return short;
  }

  function drawWheel(canvas, segments) {
    const ctx = canvas.getContext("2d");
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w / 2, cy = h / 2;
    const radius = Math.min(w, h) * 0.48;
    const inner = radius * 0.08;

    // دايرة خلفية (زي outline في SVG). :contentReference[oaicite:3]{index=3}
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 8, 0, Math.PI * 2);
    ctx.fillStyle = "#0f172a";
    ctx.fill();

    const count = segments.length;
    const slice = (Math.PI * 2) / count;

    for (let i = 0; i < count; i++) {
      const s = segments[i];
      const start = i * slice - Math.PI / 2; // نخلي أول قطاع يبدأ فوق
      const end = start + slice;

      // القطاع
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, start, end);
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();

      // فاصل أبيض
      ctx.strokeStyle = "rgba(255,255,255,.92)";
      ctx.lineWidth = 4;
      ctx.stroke();

      // نص
      const mid = (start + end) / 2;
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(mid);

      const fontSize = count > 8 ? 22 : 26;
      const font = `900 ${fontSize}px Cairo, Arial, sans-serif`;
      const maxWidth = radius * 0.70;

      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = "white";
      ctx.shadowColor = "rgba(0,0,0,.28)";
      ctx.shadowBlur = 6;

      const txt = fitText(ctx, s.text, maxWidth, font, count > 10 ? 14 : 18);
      ctx.font = font;

      // نكتب النص على بعد من المركز
      ctx.fillText(txt, radius * 0.60, 0);

      ctx.restore();
    }

    // فتحة داخلية بسيطة
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fill();
  }

  function normalizeSegments(texts) {
    return texts.map((t, idx) => ({
      id: crypto.randomUUID(),
      text: String(t || "").trim(),
      color: DEFAULT_COLORS[idx % DEFAULT_COLORS.length],
    }));
  }

  window.Wheel = {
    drawWheel,
    normalizeSegments,
    clamp,
    colors: DEFAULT_COLORS,
  };
})();
