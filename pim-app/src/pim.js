/* Pim mascot: procedural canvas drawing (superellipse body, eyes projected on a sphere). Shared globals for island.js. */
const TAU = Math.PI * 2;
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
const WHITE = [255, 255, 255], INK = [16, 19, 28];
const lerp = (a, b, t) => a + (b - a) * t;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/* ---------- states ---------- */
const STATES = {
  idle:        { tint: '#eef0f4', eyes: 'dot', desc: 'Nothing running. Breathes, blinks and watches the cursor.' },
  working:     { tint: '#9cc0ff', eyes: 'dot', badge: 'dots', badgeColor: '#3b7bff', motion: 'work', desc: 'Editing files or running tools. Eyes scan the lines it is writing.' },
  thinking:    { tint: '#c1b0ff', eyes: 'line', badge: 'dots', badgeColor: '#8b6cff', motion: 'think', desc: 'Extended thinking. Eyes half closed, gaze drifts up.' },
  searching:   { tint: '#b4a6ff', eyes: 'dot', badge: 'dots', badgeColor: '#7a62ff', motion: 'search', desc: 'Grep, glob or web search. Gaze sweeps left to right.' },
  approval:    { tint: '#ffcf8a', eyes: 'dot', badge: 'dot', badgeColor: '#ff9d1c', motion: 'hop', look: [-0.5, -0.7], desc: 'A tool call is waiting for you. Looks up at the badge and hops.' },
  question:    { tint: '#8fe2ee', eyes: 'dot', badge: 'dot', badgeColor: '#1fc3d6', motion: 'tilt', fx: 'question', desc: 'The agent asked you something. Head tilts.' },
  error:       { tint: '#ff9ba6', eyes: 'squint', badge: 'dot', badgeColor: '#ff3b55', motion: 'shake', mouth: 'frown', desc: 'A command failed. Short shake, then waits.' },
  finished:    { tint: '#a6e5cc', eyes: 'happy', badge: 'dot', badgeColor: '#25d08a', motion: 'hop', fx: 'stars', blush: 0.5, desc: 'Turn complete. Happy eyes and a sparkle.' },
  'rate limit':{ tint: '#ffcda6', eyes: 'half', badge: 'dot', badgeColor: '#ff8a3d', motion: 'slump', fx: 'sweat', desc: 'Usage limit reached. Slumps until it resets.' },
  sleeping:    { tint: '#d6d9e1', eyes: 'sleep', motion: 'sleep', fx: 'zzz', dim: 0.15, desc: 'Idle for a while. Slow breathing, z’s drift up.' },
  dizzy:       { tint: '#f5b6c8', eyes: 'spiral', motion: 'dizzy', blush: 0.3, desc: 'Too many tool calls in a row. Wobbles with spiral eyes.' },
  greeting:    { tint: '#f1f2f5', eyes: 'happy', motion: 'wave', blush: 0.4, desc: 'First launch or new session. Waves hello.' },
  love:        { tint: '#a6c2ff', eyes: 'heart', badge: 'dots', badgeColor: '#3b7bff', fx: 'hearts', blush: 0.55, desc: 'You said thanks. Heart eyes.' },
  surprised:   { tint: '#f1f2f5', eyes: 'big', mouth: 'o', motion: 'jump', fx: 'bang', desc: 'Something unexpected in the output.' },
  proud:       { tint: '#b2e6cf', eyes: 'happy', motion: 'proud', fx: 'stars', blush: 0.35, look: [0, -0.6], desc: 'All tests passed. Chin up.' },
  wink:        { tint: '#f1f2f5', eyes: ['dot', 'happy'], mouth: 'smile', desc: 'Easter egg on double click.' },
  yawn:        { tint: '#eceef3', eyes: 'sleep', mouth: 'yawn', motion: 'yawn', fx: 'z1', desc: 'About to fall asleep.' },
  annoyed:     { tint: '#eceef3', eyes: 'half', mouth: 'flat', look: [0.6, 0], desc: 'Same error for the third time.' },
  upload:      { tint: '#f1f2f5', eyes: 'dot', morph: 1, fx: 'paper', motion: 'hop', desc: 'Pushing or uploading. Morphs into a box with a lid.' },
  dancing:     { tint: '#f1f2f5', eyes: 'happy', motion: 'dance', fx: 'notes', blush: 0.4, mouth: 'smile', desc: 'Long task done. Celebration.' },
};
const ACCS = ['beanie', 'santa hat', 'party hat', 'crown', 'witch hat', 'sunglasses', 'glasses', 'scarf', 'pumpkin', 'bow'];
for (const k in STATES) STATES[k].rgb = hex(STATES[k].tint);

/* ---------- geometry ---------- */
function sePath(ctx, rx, ry, n) {
  ctx.beginPath();
  const N = 120;
  for (let i = 0; i <= N; i++) {
    const a = i / N * TAU, c = Math.cos(a), s = Math.sin(a);
    const x = rx * Math.sign(c) * Math.pow(Math.abs(c), 2 / n);
    const y = ry * Math.sign(s) * Math.pow(Math.abs(s), 2 / n);
    i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
  }
  ctx.closePath();
}
// point in unit disc -> point inside the superellipse body
function seMap(px, py, rx, ry, n) {
  const rd = Math.hypot(px, py);
  if (rd < 1e-6) return [0, 0];
  const c = px / rd, s = py / rd;
  const r = Math.pow(Math.pow(Math.abs(c), n) + Math.pow(Math.abs(s), n), -1 / n);
  return [rx * r * c * rd, ry * r * s * rd];
}
// sphere (yaw, pitch; pitch>0 is up) -> body point + foreshortening
function sphere(yaw, pitch, rx, ry, n, k = 0.92) {
  const sx = Math.sin(yaw) * Math.cos(pitch), sy = -Math.sin(pitch);
  const [x, y] = seMap(sx * k, sy * k, rx, ry, n);
  return { x, y, fx: Math.max(0.3, Math.cos(yaw)), fy: Math.max(0.45, Math.cos(pitch)), vis: Math.cos(yaw) * Math.cos(pitch) };
}

/* ---------- small shapes ---------- */
function heart(ctx, x, y, s) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.9);
  ctx.bezierCurveTo(x - s * 1.4, y - s * 0.1, x - s * 0.7, y - s * 1.2, x, y - s * 0.45);
  ctx.bezierCurveTo(x + s * 0.7, y - s * 1.2, x + s * 1.4, y - s * 0.1, x, y + s * 0.9);
  ctx.fill();
}
function sparkle(ctx, x, y, s) {
  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = i / 8 * TAU - Math.PI / 2, r = i % 2 ? s * 0.28 : s;
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
  }
  ctx.closePath(); ctx.fill();
}
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

/* ---------- eyes ---------- */
function drawEye(ctx, e, style, R, side, t, blink) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.scale(e.fx, e.fy);
  const w = 0.1 * R, h = 0.135 * R, lw = 0.058 * R;
  ctx.fillStyle = ctx.strokeStyle = '#13151c';
  ctx.lineWidth = lw; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (style === 'dot' && blink < 0.18) style = 'line';
  switch (style) {
    case 'dot':
      ctx.beginPath(); ctx.ellipse(0, 0, w, h * blink, 0, 0, TAU); ctx.fill(); break;
    case 'big':
      ctx.beginPath(); ctx.ellipse(0, 0, w * 1.3, h * 1.3 * Math.max(blink, 0.2), 0, 0, TAU); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-w * 0.4, -h * 0.45, w * 0.32, 0, TAU); ctx.fill(); break;
    case 'line':
      ctx.beginPath(); ctx.moveTo(-w * 0.95, 0); ctx.lineTo(w * 0.95, 0); ctx.stroke(); break;
    case 'happy':
      ctx.beginPath(); ctx.arc(0, h * 0.45, w * 1.15, Math.PI * 1.16, Math.PI * 1.84); ctx.stroke(); break;
    case 'sleep':
      ctx.beginPath(); ctx.arc(0, -h * 0.45, w * 1.1, Math.PI * 0.18, Math.PI * 0.82); ctx.stroke(); break;
    case 'half':
      ctx.save(); ctx.beginPath(); ctx.rect(-w * 2, -h * 0.05, w * 4, h * 2); ctx.clip();
      ctx.beginPath(); ctx.ellipse(0, 0, w, h * Math.max(blink, 0.3), 0, 0, TAU); ctx.fill(); ctx.restore();
      ctx.lineWidth = lw * 0.7; ctx.beginPath(); ctx.moveTo(-w * 1.2, -h * 0.05 - side * h * 0.08); ctx.lineTo(w * 1.2, -h * 0.05 + side * h * 0.08); ctx.stroke(); break;
    case 'squint':
      ctx.beginPath(); ctx.moveTo(-side * w, -h * 0.6); ctx.lineTo(side * w * 0.8, 0); ctx.lineTo(-side * w, h * 0.6); ctx.stroke(); break;
    case 'heart':
      ctx.fillStyle = '#ff4f78'; heart(ctx, 0, -h * 0.05, w * (1.25 + 0.12 * Math.sin(t * 8))); break;
    case 'spiral':
      ctx.lineWidth = lw * 0.55; ctx.rotate(t * 7 * side); ctx.beginPath();
      for (let a = 0; a < TAU * 2.2; a += 0.2) { const r = w * 0.12 + a * w * 0.085; ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      ctx.stroke(); break;
  }
  ctx.restore();
}

function drawMouth(ctx, kind, rx, ry, n, R, look, t) {
  if (!kind) return;
  const m = sphere(look[0] * 0.3, -0.42 - look[1] * 0.2, rx, ry, n);
  ctx.save(); ctx.translate(m.x, m.y); ctx.scale(m.fx, 1);
  ctx.fillStyle = ctx.strokeStyle = '#13151c'; ctx.lineWidth = 0.04 * R; ctx.lineCap = 'round';
  ctx.beginPath();
  if (kind === 'o') { ctx.ellipse(0, 0, 0.05 * R, 0.065 * R, 0, 0, TAU); ctx.fill(); }
  else if (kind === 'yawn') { const o = 0.5 + 0.5 * Math.sin(t * 1.4); ctx.ellipse(0, 0, 0.07 * R, (0.03 + 0.09 * o) * R, 0, 0, TAU); ctx.fill(); }
  else if (kind === 'smile') { ctx.arc(0, -0.04 * R, 0.07 * R, 0.2 * Math.PI, 0.8 * Math.PI); ctx.stroke(); }
  else if (kind === 'frown') { ctx.arc(0, 0.06 * R, 0.06 * R, 1.2 * Math.PI, 1.8 * Math.PI); ctx.stroke(); }
  else if (kind === 'flat') { ctx.moveTo(-0.05 * R, 0); ctx.lineTo(0.05 * R, 0); ctx.stroke(); }
  ctx.restore();
}

/* ---------- accessories (body-local space) ---------- */
function drawHatBehind(ctx, acc, rx, ry, R) {
  if (acc === 'witch hat') {
    ctx.fillStyle = '#4a2f8f';
    ctx.beginPath(); ctx.ellipse(0, -ry * 0.78, rx * 1.28, 0.16 * R, 0, Math.PI, TAU); ctx.fill();
  }
}
function drawAcc(ctx, acc, rx, ry, R, t, eyes) {
  const top = -ry;
  ctx.save();
  ctx.lineJoin = 'round'; ctx.lineCap = 'round';
  switch (acc) {
    case 'beanie': {
      const g = ctx.createLinearGradient(0, top - 0.45 * R, 0, top + 0.3 * R);
      g.addColorStop(0, '#5f9bff'); g.addColorStop(1, '#2659d8');
      ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, top + 0.2 * R, rx * 0.84, 0.62 * R, 0, Math.PI, TAU); ctx.fill();
      ctx.fillStyle = '#eef2fb'; rrect(ctx, -rx * 0.9, top + 0.12 * R, rx * 1.8, 0.2 * R, 0.1 * R); ctx.fill();
      ctx.fillStyle = '#ffffff'; ctx.beginPath(); ctx.arc(0, top - 0.44 * R, 0.13 * R, 0, TAU); ctx.fill();
      break;
    }
    case 'santa hat': {
      const sway = Math.sin(t * 2) * 0.05 * R;
      ctx.fillStyle = '#e1303d';
      ctx.beginPath(); ctx.moveTo(-rx * 0.82, top + 0.2 * R);
      ctx.quadraticCurveTo(-rx * 0.3, top - 0.75 * R, rx * 0.45 + sway, top - 0.6 * R);
      ctx.quadraticCurveTo(rx * 0.9 + sway, top - 0.45 * R, rx * 0.95 + sway, top - 0.05 * R);
      ctx.quadraticCurveTo(rx * 0.7, top - 0.2 * R, rx * 0.82, top + 0.2 * R); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#f7f7fa'; rrect(ctx, -rx * 0.92, top + 0.08 * R, rx * 1.84, 0.24 * R, 0.12 * R); ctx.fill();
      ctx.beginPath(); ctx.arc(rx * 0.95 + sway, top - 0.02 * R, 0.13 * R, 0, TAU); ctx.fill();
      break;
    }
    case 'party hat': {
      ctx.save(); ctx.translate(0.1 * R, top + 0.12 * R); ctx.rotate(0.16);
      ctx.fillStyle = '#f27ab9'; ctx.beginPath(); ctx.moveTo(-0.32 * R, 0); ctx.lineTo(0.32 * R, 0); ctx.lineTo(0, -0.78 * R); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; [[-0.12, -0.15], [0.1, -0.28], [-0.03, -0.45], [0.12, -0.08]].forEach(([x, y]) => { ctx.beginPath(); ctx.arc(x * R, y * R, 0.035 * R, 0, TAU); ctx.fill(); });
      ctx.fillStyle = '#ffd34d'; ctx.beginPath(); ctx.arc(0, -0.8 * R, 0.08 * R, 0, TAU); ctx.fill();
      ctx.restore(); break;
    }
    case 'crown': {
      const y0 = top + 0.18 * R, w = rx * 0.8, h = 0.42 * R;
      const g = ctx.createLinearGradient(0, y0 - h, 0, y0); g.addColorStop(0, '#ffe08a'); g.addColorStop(1, '#d9a128');
      ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-w, y0);
      const pts = 5; for (let i = 0; i <= pts * 2; i++) { const x = -w + (i / (pts * 2)) * 2 * w; ctx.lineTo(x, i % 2 ? y0 - h * 0.45 : y0 - h); }
      ctx.lineTo(w, y0); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#e84a6a'; ctx.beginPath(); ctx.arc(0, y0 - h * 0.25, 0.05 * R, 0, TAU); ctx.fill();
      ctx.fillStyle = '#4a8bff'; [-1, 1].forEach(s => { ctx.beginPath(); ctx.arc(s * w * 0.55, y0 - h * 0.22, 0.04 * R, 0, TAU); ctx.fill(); });
      break;
    }
    case 'witch hat': {
      ctx.fillStyle = '#5a39a8';
      ctx.beginPath(); ctx.ellipse(0, top + 0.22 * R, rx * 1.28, 0.16 * R, 0, 0, Math.PI); ctx.fill();
      ctx.beginPath(); ctx.moveTo(-rx * 0.62, top + 0.2 * R);
      ctx.quadraticCurveTo(-rx * 0.2, top - 0.6 * R, rx * 0.15, top - 0.95 * R);
      ctx.quadraticCurveTo(rx * 0.55, top - 0.9 * R, rx * 0.5, top - 0.75 * R);
      ctx.quadraticCurveTo(rx * 0.35, top - 0.5 * R, rx * 0.62, top + 0.2 * R); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ff9a2e'; rrect(ctx, -rx * 0.6, top + 0.02 * R, rx * 1.2, 0.13 * R, 0.03 * R); ctx.fill();
      break;
    }
    case 'sunglasses': {
      const [a, b] = eyes;
      ctx.fillStyle = '#0c0d12'; ctx.strokeStyle = '#0c0d12'; ctx.lineWidth = 0.04 * R;
      [a, b].forEach(e => { rrect(ctx, e.x - 0.2 * R * e.fx, e.y - 0.13 * R, 0.4 * R * e.fx, 0.25 * R, 0.08 * R); ctx.fill(); });
      ctx.beginPath(); ctx.moveTo(a.x + 0.18 * R * a.fx, a.y - 0.06 * R); ctx.lineTo(b.x - 0.18 * R * b.fx, b.y - 0.06 * R); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; [a, b].forEach(e => { ctx.beginPath(); ctx.ellipse(e.x - 0.08 * R * e.fx, e.y - 0.06 * R, 0.05 * R * e.fx, 0.025 * R, -0.5, 0, TAU); ctx.fill(); });
      break;
    }
    case 'glasses': {
      const [a, b] = eyes;
      ctx.strokeStyle = '#8b6a3e'; ctx.lineWidth = 0.035 * R; ctx.fillStyle = 'rgba(255,255,255,0.18)';
      [a, b].forEach(e => { ctx.beginPath(); ctx.ellipse(e.x, e.y, 0.19 * R * e.fx, 0.17 * R, 0, 0, TAU); ctx.fill(); ctx.stroke(); });
      ctx.beginPath(); ctx.moveTo(a.x + 0.19 * R * a.fx, a.y - 0.03 * R); ctx.quadraticCurveTo((a.x + b.x) / 2, a.y - 0.1 * R, b.x - 0.19 * R * b.fx, b.y - 0.03 * R); ctx.stroke();
      break;
    }
    case 'scarf': {
      const y = ry * 0.5;
      ctx.fillStyle = '#d93a3a';
      ctx.save(); sePath(ctx, rx * 1.03, ry * 1.03, 2.7); ctx.clip();
      rrect(ctx, -rx * 1.1, y, rx * 2.2, 0.24 * R, 0.08 * R); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.85)'; for (let i = -4; i <= 4; i++) { ctx.fillRect(i * 0.24 * R - 0.03 * R, y, 0.06 * R, 0.24 * R); }
      ctx.restore();
      ctx.fillStyle = '#c42f31'; const sw = Math.sin(t * 2.5) * 0.04 * R;
      rrect(ctx, rx * 0.45 + sw * 0.3, y + 0.12 * R, 0.2 * R, 0.5 * R, 0.06 * R); ctx.fill();
      break;
    }
    case 'pumpkin': {
      ctx.save(); sePath(ctx, rx, ry, 2.7); ctx.clip();
      ctx.strokeStyle = 'rgba(160,70,0,0.35)'; ctx.lineWidth = 0.035 * R;
      [-0.55, -0.2, 0.2, 0.55].forEach(k => { ctx.beginPath(); ctx.ellipse(0, 0, Math.abs(k) * rx, ry * 1.05, 0, k < 0 ? Math.PI * 0.5 : -Math.PI * 0.5, k < 0 ? Math.PI * 1.5 : Math.PI * 0.5); ctx.stroke(); });
      ctx.restore();
      ctx.fillStyle = '#4f8a3a'; rrect(ctx, -0.05 * R, top - 0.2 * R, 0.1 * R, 0.26 * R, 0.04 * R); ctx.fill();
      ctx.beginPath(); ctx.ellipse(0.14 * R, top - 0.1 * R, 0.12 * R, 0.05 * R, -0.4, 0, TAU); ctx.fill();
      break;
    }
    case 'bow': {
      ctx.save(); ctx.translate(rx * 0.5, top + 0.12 * R); ctx.rotate(0.25);
      ctx.fillStyle = '#ff7eb6';
      [-1, 1].forEach(s => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(s * 0.22 * R, -0.2 * R, s * 0.26 * R, 0); ctx.quadraticCurveTo(s * 0.22 * R, 0.2 * R, 0, 0); ctx.fill(); });
      ctx.fillStyle = '#e8559a'; ctx.beginPath(); ctx.arc(0, 0, 0.06 * R, 0, TAU); ctx.fill();
      ctx.restore(); break;
    }
  }
  ctx.restore();
}

/* ---------- effects ---------- */
function drawFx(ctx, fx, rx, ry, R, t) {
  if (!fx) return;
  ctx.save();
  const font = s => `600 ${s * R}px ${getComputedStyle(document.body).fontFamily}`;
  if (fx === 'zzz' || fx === 'z1') {
    const count = fx === 'zzz' ? 3 : 1;
    for (let i = 0; i < count; i++) {
      const p = ((t * 0.35 + i / 3) % 1);
      ctx.globalAlpha = Math.sin(p * Math.PI) * 0.9;
      ctx.fillStyle = '#c9d3ff'; ctx.font = font(0.16 + p * 0.14);
      ctx.fillText('z', rx * 0.55 + p * 0.45 * R, -ry - p * 0.55 * R);
    }
  } else if (fx === 'stars') {
    ctx.fillStyle = '#ffffff';
    [[0.55, -1.15, 0], [0.95, -0.85, 1.7], [-0.15, -1.25, 3.1]].forEach(([x, y, o]) => {
      const s = (0.5 + 0.5 * Math.sin(t * 3 + o)) * 0.11 * R;
      ctx.globalAlpha = 0.85; sparkle(ctx, x * rx, y * ry, s);
    });
  } else if (fx === 'hearts') {
    ctx.fillStyle = '#ff5d84';
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.4 + i / 3) % 1;
      ctx.globalAlpha = Math.sin(p * Math.PI);
      heart(ctx, (-0.4 + i * 0.4 + Math.sin(t * 2 + i) * 0.08) * rx, -ry - p * 0.6 * R, 0.07 * R);
    }
  } else if (fx === 'question' || fx === 'bang') {
    ctx.fillStyle = fx === 'question' ? '#5fe0ef' : '#ffd34d';
    ctx.font = font(0.38);
    ctx.fillText(fx === 'question' ? '?' : '!', rx * 0.75, -ry * 0.95 + Math.sin(t * 3) * 0.04 * R);
  } else if (fx === 'sweat') {
    const p = (t * 0.5) % 1;
    ctx.globalAlpha = 1 - p * 0.6;
    ctx.fillStyle = '#7cc4ff';
    const x = rx * 0.82, y = -ry * 0.45 + p * 0.25 * R, s = 0.07 * R;
    ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.quadraticCurveTo(x + s, y, x, y + s); ctx.quadraticCurveTo(x - s, y, x, y - s * 1.6); ctx.fill();
  } else if (fx === 'notes') {
    ctx.fillStyle = '#c8b6ff'; ctx.font = font(0.24);
    for (let i = 0; i < 2; i++) {
      const p = (t * 0.45 + i / 2) % 1; ctx.globalAlpha = Math.sin(p * Math.PI);
      ctx.fillText(i ? '♫' : '♪', (i ? -1.05 : 0.8) * rx, -ry * 0.6 - p * 0.5 * R);
    }
  } else if (fx === 'paper') {
    const p = (t * 0.6) % 1;
    ctx.globalAlpha = Math.sin(p * Math.PI);
    ctx.translate(0, -ry - 0.05 * R - p * 0.5 * R);
    ctx.fillStyle = '#ffffff'; rrect(ctx, -0.11 * R, -0.14 * R, 0.22 * R, 0.28 * R, 0.03 * R); ctx.fill();
    ctx.fillStyle = '#c2c8d6'; for (let i = 0; i < 3; i++) ctx.fillRect(-0.07 * R, -0.07 * R + i * 0.06 * R, 0.14 * R, 0.018 * R);
  }
  ctx.restore();
}

/* ---------- mascot ---------- */
function drawPim(ctx, o) {
  const { cx, cy, R, t, st, acc } = o;
  const m = reduced ? 0 : 1;
  const motion = st.motion;
  // body transform
  let bob = Math.sin(t * 2) * 0.025 * R * m, rot = 0, sx = 1, sy = 1, dx = 0;
  const breathe = Math.sin(t * 2) * 0.012 * m;
  sx += breathe; sy -= breathe;
  if (motion === 'work') { bob = Math.sin(t * 6) * 0.02 * R * m; }
  if (motion === 'hop') { const h = Math.max(0, Math.sin(t * 4)); bob = -h * 0.09 * R * m; sy += (h < 0.15 ? -0.05 : 0.03) * m; sx -= (h < 0.15 ? -0.05 : 0.03) * m; }
  if (motion === 'jump') { const h = Math.abs(Math.sin(t * 2.2)); bob = -Math.pow(h, 4) * 0.14 * R * m; }
  if (motion === 'tilt') rot = -0.12 + Math.sin(t * 1.5) * 0.03 * m;
  if (motion === 'shake') { const phase = (t % 2.2); dx = phase < 0.5 ? Math.sin(phase * 60) * 0.035 * R * (0.5 - phase) * 2 * m : 0; }
  if (motion === 'slump') { sy *= 0.94; sx *= 1.04; bob = 0.03 * R + Math.sin(t) * 0.01 * R * m; }
  if (motion === 'sleep') { const b = Math.sin(t * 1.1) * 0.025 * m; sx = 1.02 + b; sy = 0.97 - b; bob = 0.02 * R; }
  if (motion === 'dizzy') rot = Math.sin(t * 3) * 0.13 * m;
  if (motion === 'dance') { rot = Math.sin(t * 4) * 0.16 * m; bob = -Math.abs(Math.sin(t * 4)) * 0.06 * R * m; }
  if (motion === 'proud') { sy *= 1.02; bob = -0.02 * R; }
  if (motion === 'yawn') { const y = 0.5 + 0.5 * Math.sin(t * 1.4); sy *= 1 + y * 0.04 * m; sx *= 1 - y * 0.02 * m; }
  if (motion === 'wave') rot = Math.sin(t * 3) * 0.04 * m;
  if (motion === 'think') bob = Math.sin(t * 1.2) * 0.02 * R * m;

  const n = o.n, morph = o.morph;
  const nEff = lerp(n, 7, morph);
  const rx = 1.14 * R, ry = lerp(0.88, 0.95, morph) * R;

  // look
  let look = o.look.slice();
  if (st.look) look = [lerp(look[0], st.look[0], 0.75), lerp(look[1], st.look[1], 0.75)];
  if (motion === 'work') look = [Math.sin(t * 1.3) * 0.45, 0.45];
  if (motion === 'search') look = [Math.sin(t * 2.4) * 0.85, 0.05];
  if (motion === 'think') look = [0.45 + Math.sin(t * 0.7) * 0.15, -0.65];
  if (motion === 'sleep' || motion === 'slump') look = [0, 0.4];
  if (!m && motion) look = st.look || [0, 0];

  // tint
  let tint = o.tint;
  if (acc === 'pumpkin') tint = mix(tint, [255, 146, 50], 0.85);
  const base = mix(WHITE, tint, 0.62);

  // glow
  if (o.glow) {
    const gg = ctx.createRadialGradient(cx, cy, R * 0.3, cx, cy, R * 2.4);
    gg.addColorStop(0, rgb(tint, 0.28 * o.glow)); gg.addColorStop(1, rgb(tint, 0));
    ctx.fillStyle = gg; ctx.fillRect(cx - R * 3, cy - R * 3, R * 6, R * 6);
  }
  // ground shadow
  const lift = clamp(-bob / R, 0, 0.2);
  ctx.save();
  ctx.translate(cx, cy + ry + 0.28 * R);
  ctx.scale(1, 0.22);
  const sg = ctx.createRadialGradient(0, 0, 0, 0, 0, rx * 0.95);
  sg.addColorStop(0, `rgba(0,0,0,${0.55 - lift * 1.5})`); sg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = sg; ctx.beginPath(); ctx.arc(0, 0, rx * (0.95 - lift), 0, TAU); ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.translate(cx + dx, cy + bob + ry * (1 - sy));
  ctx.rotate(rot);
  ctx.scale(sx, sy);

  if (acc) drawHatBehind(ctx, acc, rx, ry, R);

  // greeting hands
  if (motion === 'wave') {
    ctx.fillStyle = rgb(mix(base, WHITE, 0.4));
    ctx.beginPath(); ctx.ellipse(-rx * 1.04, ry * 0.25, 0.14 * R, 0.11 * R, 0.3, 0, TAU); ctx.fill();
    ctx.save(); ctx.translate(rx * 1.0, ry * 0.0); ctx.rotate(-0.6 + Math.sin(t * 9) * 0.5 * m);
    ctx.beginPath(); ctx.ellipse(0.12 * R, 0, 0.15 * R, 0.11 * R, 0, 0, TAU); ctx.fill(); ctx.restore();
  }

  // body
  sePath(ctx, rx, ry, nEff);
  const lg = ctx.createRadialGradient(-0.15 * rx, -0.55 * ry, 0, -0.1 * rx, -0.2 * ry, Math.max(rx, ry) * 1.55);
  lg.addColorStop(0, rgb(mix(base, WHITE, 0.85)));
  lg.addColorStop(0.45, rgb(mix(base, WHITE, 0.3)));
  lg.addColorStop(1, rgb(mix(base, INK, 0.32)));
  ctx.fillStyle = lg; ctx.fill();

  ctx.save(); ctx.clip();
  const bs = ctx.createLinearGradient(0, ry * 0.1, 0, ry);
  bs.addColorStop(0, 'rgba(10,14,30,0)'); bs.addColorStop(1, 'rgba(10,14,30,0.22)');
  ctx.fillStyle = bs; ctx.fillRect(-rx, -ry, rx * 2, ry * 2);
  // subsurface tint near rim
  ctx.lineWidth = 0.22 * R; ctx.strokeStyle = rgb(tint, 0.35); sePath(ctx, rx, ry, nEff); ctx.stroke();
  // rim light
  ctx.lineWidth = 0.05 * R; ctx.strokeStyle = 'rgba(255,255,255,0.55)';
  ctx.save(); ctx.translate(0, 0.01 * R); sePath(ctx, rx * 0.995, ry * 0.995, nEff); ctx.stroke(); ctx.restore();
  // specular
  const spx = 0.34 * rx, spy = -0.46 * ry, spr = 0.42 * R;
  const sp = ctx.createRadialGradient(spx, spy, 0, spx, spy, spr);
  sp.addColorStop(0, 'rgba(255,255,255,0.75)'); sp.addColorStop(0.35, 'rgba(255,255,255,0.25)'); sp.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sp; ctx.beginPath(); ctx.ellipse(spx, spy, spr * 1.2, spr * 0.8, -0.3, 0, TAU); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.beginPath(); ctx.ellipse(spx + 0.08 * R, spy - 0.04 * R, 0.06 * R, 0.035 * R, -0.5, 0, TAU); ctx.fill();
  // dim (sleep)
  if (st.dim) { ctx.fillStyle = `rgba(10,14,30,${st.dim})`; ctx.fillRect(-rx, -ry, rx * 2, ry * 2); }
  // upload lid
  if (morph > 0.01) { ctx.fillStyle = `rgba(20,22,30,${morph})`; ctx.fillRect(-rx, -ry, rx * 2, 0.16 * R); }
  ctx.restore();

  // blush
  const blush = st.blush || 0.12;
  [-1, 1].forEach(s => {
    const b = sphere(s * 0.6 + look[0] * 0.3, -0.33 - look[1] * 0.2, rx, ry, nEff);
    const bg = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, 0.16 * R);
    bg.addColorStop(0, `rgba(255,120,145,${blush})`); bg.addColorStop(1, 'rgba(255,120,145,0)');
    ctx.save(); ctx.translate(b.x, b.y); ctx.scale(b.fx * 1.2, 0.6); ctx.translate(-b.x, -b.y);
    ctx.fillStyle = bg; ctx.beginPath(); ctx.arc(b.x, b.y, 0.16 * R, 0, TAU); ctx.fill(); ctx.restore();
  });

  // eyes
  const per = 3.8, ph = (t + o.seed * 2.7) % per;
  const blink = (reduced || ph > 0.16) ? 1 : 1 - Math.sin(ph / 0.16 * Math.PI) * 0.95;
  const eyeStyle = Array.isArray(st.eyes) ? st.eyes : [st.eyes, st.eyes];
  const eyes = [-1, 1].map(s => sphere(s * 0.37 + look[0] * 0.34, -0.12 - look[1] * 0.24, rx, ry, nEff));
  if (acc !== 'sunglasses') eyes.forEach((e, i) => drawEye(ctx, e, eyeStyle[i], R, i ? 1 : -1, t, blink));
  drawMouth(ctx, st.mouth, rx, ry, nEff, R, look, t);

  if (acc) drawAcc(ctx, acc, rx, ry, R, t, eyes);

  // badge
  if (st.badge && !(acc && acc.includes('hat')) && acc !== 'beanie' && acc !== 'crown') {
    const bx = -0.72 * R, by = -0.72 * R;
    const col = hex(st.badgeColor);
    if (st.badge === 'dot') {
      const pulse = 1 + Math.sin(t * 4) * 0.08 * m;
      ctx.fillStyle = '#0c0e14'; ctx.beginPath(); ctx.arc(bx, by, 0.13 * R * pulse, 0, TAU); ctx.fill();
      ctx.fillStyle = rgb(col); ctx.beginPath(); ctx.arc(bx, by, 0.09 * R * pulse, 0, TAU); ctx.fill();
    } else {
      const w = 0.34 * R, h = 0.15 * R;
      ctx.fillStyle = rgb(col); rrect(ctx, bx - w / 2, by - h / 2, w, h, h / 2); ctx.fill();
      ctx.fillStyle = '#fff';
      for (let i = 0; i < 3; i++) { const a = 0.45 + 0.55 * Math.max(0, Math.sin(t * 6 - i * 0.9)); ctx.globalAlpha = reduced ? 1 : a; ctx.beginPath(); ctx.arc(bx + (i - 1) * 0.085 * R, by, 0.026 * R, 0, TAU); ctx.fill(); }
      ctx.globalAlpha = 1;
    }
  }
  ctx.restore();

  if (!reduced) {
    ctx.save(); ctx.translate(cx, cy + bob);
    drawFx(ctx, st.fx, rx, ry, R, t);
    ctx.restore();
  }

  return { rx, ry, nEff, look, bob, eyes };
}

