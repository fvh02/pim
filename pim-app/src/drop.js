/* Drag & drop animation: an open white box waits for the file, closes on drop, then a paper plane flies out of the notch.
   drawDrop(ctx, w, h, phase, p, t): phase 'open' | 'closing' | 'plane', p = 0..1 progress of the phase, t = seconds. */
const easeOutBack = p => { const c = 1.9; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); };
const easeIn = p => p * p * p;

function drawBox(ctx, cx, cy, s, close, alpha) {
  const bw = 56 * s, bh = 32 * s, depth = 9 * s, flap = bw / 2, th = 11 * s; // th: how wide an open flap looks
  const x0 = cx - bw / 2, x1 = cx + bw / 2, top = cy - bh / 2;
  ctx.save(); ctx.globalAlpha = alpha;
  // opening (dark inside), hidden as the flaps close
  if (close < 0.98) {
    ctx.fillStyle = '#b9c0cc';
    ctx.beginPath(); ctx.moveTo(x0, top); ctx.lineTo(x0 + depth, top - depth); ctx.lineTo(x1 + depth, top - depth); ctx.lineTo(x1, top); ctx.closePath(); ctx.fill();
  }
  // back flap edge
  ctx.fillStyle = '#e3e7ee';
  ctx.beginPath(); ctx.moveTo(x0 + depth, top - depth); ctx.lineTo(x1 + depth, top - depth); ctx.lineTo(x1 + depth, top - depth - 6 * s * (1 - close)); ctx.lineTo(x0 + depth, top - depth - 6 * s * (1 - close)); ctx.closePath(); ctx.fill();
  // side face
  ctx.fillStyle = '#d5dae3';
  ctx.beginPath(); ctx.moveTo(x1, top); ctx.lineTo(x1 + depth, top - depth); ctx.lineTo(x1 + depth, top - depth + bh); ctx.lineTo(x1, top + bh); ctx.closePath(); ctx.fill();
  // front face
  const g = ctx.createLinearGradient(0, top, 0, top + bh); g.addColorStop(0, '#ffffff'); g.addColorStop(1, '#e6e9ef');
  ctx.fillStyle = g; ctx.fillRect(x0, top, bw, bh);
  // flaps hinge on the left and right top edges and swing shut toward the middle
  const a = -2.25 * (1 - close); // 0 = closed (flat over the opening)
  [[x0, 1], [x1, -1]].forEach(([hx, dir]) => {
    ctx.save(); ctx.translate(hx, top); ctx.scale(dir, 1); ctx.rotate(a);
    ctx.fillStyle = close > 0.5 ? '#f7f8fb' : '#eef1f6';
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(flap, 0); ctx.lineTo(flap + depth * close, -depth * close - th * (1 - close)); ctx.lineTo(depth * close, -depth * close - th * (1 - close)); ctx.closePath(); ctx.fill();
    ctx.restore();
  });
  if (close > 0.95) { // tape over the seam
    ctx.fillStyle = 'rgba(160,170,190,.55)';
    ctx.beginPath(); ctx.moveTo(cx - 3 * s, top); ctx.lineTo(cx + 3 * s, top); ctx.lineTo(cx + 3 * s + depth, top - depth); ctx.lineTo(cx - 3 * s + depth, top - depth); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

function drawPlane(ctx, x, y, angle, s) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(angle); ctx.scale(s, s);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-11, -8); ctx.lineTo(-6, 0); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#c9cfda';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, 0); ctx.lineTo(-11, 8); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#9aa3b4';
  ctx.beginPath(); ctx.moveTo(14, 0); ctx.lineTo(-6, 0); ctx.lineTo(-3, 3); ctx.closePath(); ctx.fill();
  ctx.restore();
}

function drawDrop(ctx, w, h, phase, p, t) {
  const cx = w / 2, cy = h * 0.66, s = Math.min(1.2, h / 90);
  if (phase === 'open') {
    drawBox(ctx, cx, cy + Math.sin(t * 3) * 1.2, s, 0, 1);
    // arrow bouncing into the open box, drawn on top so the back flap does not hide it
    const bob = Math.abs(Math.sin(t * 4)) * 5, ax = cx + 4, ay = cy - 36 * s + bob;
    ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(ax, ay - 15 * s); ctx.lineTo(ax, ay); ctx.moveTo(ax - 5, ay - 5); ctx.lineTo(ax, ay); ctx.lineTo(ax + 5, ay - 5); ctx.stroke();
    ctx.restore();
  } else if (phase === 'closing') {
    drawBox(ctx, cx, cy, s * (1 - 0.06 * Math.sin(p * Math.PI)), Math.min(1, easeOutBack(p)), 1);
  } else if (phase === 'plane') {
    drawBox(ctx, cx, cy + easeIn(p) * 60 * s, s, 1, 1 - easeIn(p)); // closed box sinks away while the plane leaves
    // quadratic curve from the box up and out to the right edge
    const e = easeIn(Math.min(1, p * 1.05)) * 0.85 + p * 0.15;
    const sx = cx, sy = cy - 22 * s, mx = cx + w * 0.15, my = -h * 0.1, ex = w + 40, ey = h * 0.15;
    const x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * mx + e * e * ex;
    const y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * my + e * e * ey;
    const dx = 2 * (1 - e) * (mx - sx) + 2 * e * (ex - mx), dy = 2 * (1 - e) * (my - sy) + 2 * e * (ey - my);
    drawPlane(ctx, x, y, Math.atan2(dy, dx), s * (1 + Math.min(p * 4, 1) * 0.3) * Math.min(1, p * 6));
  }
}
