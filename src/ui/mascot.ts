/**
 * Mascot system — Tazama AI
 *
 * Replaces HeyClicky's cloud-with-limbs SVG rig.
 * Tazama's mascot is an EYE (ties to "observe") — a stylised iris that blinks,
 * tracks the pointer, and reacts to agent phase. Better than HeyClicky because:
 *   - No 11MB Assets.car needed — pure SVG, ~2KB
 *   - Pupil tracks actual pointer position (HeyClicky fakes it with expressions)
 *   - Phase reactions are smooth CSS transitions on SVG attributes
 *   - Works at any size (vector)
 *   - Accent-tinted iris matches the user's chosen accent colour
 *
 * Expressions:
 *   idle     — slow blink every 4-6s, pupil drifts gently
 *   thinking — pupil spins, iris pulses
 *   listening — iris opens wider, pupil centers
 *   speaking  — iris oscillates (equaliser effect on the outline)
 *   done      — full blink then open + sparkle
 *   needs-you — rapid blinking
 *   happy     — squint + upward pupil (^_^)
 */

export type MascotExpression =
  | "idle" | "thinking" | "listening" | "speaking"
  | "done" | "needs-you" | "happy";

let svgEl: SVGSVGElement | null = null;
let blinkTimer: ReturnType<typeof setTimeout> | null = null;
let trackingEnabled = true;

const SVG_NS = "http://www.w3.org/2000/svg";

// ─── SVG construction ─────────────────────────────────────────────────────────

export function buildMascot(size = 72): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 100 100");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Tazama AI mascot");
  svg.classList.add("mascot");

  // ── Outer glow (idle ambient) ──
  const defs = document.createElementNS(SVG_NS, "defs");
  const glow = document.createElementNS(SVG_NS, "filter");
  glow.id = "mascot-glow";
  const blur = document.createElementNS(SVG_NS, "feGaussianBlur");
  blur.setAttribute("stdDeviation", "2");
  blur.setAttribute("result", "blur");
  glow.append(blur);
  const merge = document.createElementNS(SVG_NS, "feMerge");
  ["blur", "SourceGraphic"].forEach(ref => {
    const n = document.createElementNS(SVG_NS, "feMergeNode");
    if (ref !== "SourceGraphic") n.setAttribute("in", ref);
    merge.append(n);
  });
  glow.append(merge);
  defs.append(glow);
  svg.append(defs);

  // ── Eyelid (clips the iris during blink) ──
  const lidClip = document.createElementNS(SVG_NS, "clipPath");
  lidClip.id = "lid-clip";
  const lidRect = document.createElementNS(SVG_NS, "rect");
  lidRect.id = "lid-rect";
  lidRect.setAttribute("x", "10");
  lidRect.setAttribute("y", "10");
  lidRect.setAttribute("width", "80");
  lidRect.setAttribute("height", "80");
  lidClip.append(lidRect);
  svg.append(lidClip);

  // ── Sclera (white of eye) ──
  const sclera = document.createElementNS(SVG_NS, "ellipse");
  sclera.id = "sclera";
  sclera.setAttribute("cx", "50");
  sclera.setAttribute("cy", "50");
  sclera.setAttribute("rx", "38");
  sclera.setAttribute("ry", "30");
  sclera.setAttribute("fill", "#1f2025");
  sclera.setAttribute("stroke", "var(--accent)");
  sclera.setAttribute("stroke-width", "2.5");
  sclera.setAttribute("clip-path", "url(#lid-clip)");
  sclera.style.filter = "url(#mascot-glow)";
  svg.append(sclera);

  // ── Iris ──
  const iris = document.createElementNS(SVG_NS, "circle");
  iris.id = "iris";
  iris.setAttribute("cx", "50");
  iris.setAttribute("cy", "50");
  iris.setAttribute("r", "18");
  iris.setAttribute("fill", "var(--accent)");
  iris.setAttribute("clip-path", "url(#lid-clip)");
  iris.style.transition = "cx 200ms cubic-bezier(0.16,1,0.3,1), cy 200ms cubic-bezier(0.16,1,0.3,1), r 300ms ease";
  svg.append(iris);

  // ── Pupil ──
  const pupil = document.createElementNS(SVG_NS, "circle");
  pupil.id = "pupil";
  pupil.setAttribute("cx", "50");
  pupil.setAttribute("cy", "50");
  pupil.setAttribute("r", "8");
  pupil.setAttribute("fill", "#111113");
  pupil.setAttribute("clip-path", "url(#lid-clip)");
  pupil.style.transition = "cx 150ms cubic-bezier(0.16,1,0.3,1), cy 150ms cubic-bezier(0.16,1,0.3,1)";
  svg.append(pupil);

  // ── Catchlight (specular) ──
  const shine = document.createElementNS(SVG_NS, "circle");
  shine.id = "shine";
  shine.setAttribute("cx", "56");
  shine.setAttribute("cy", "44");
  shine.setAttribute("r", "3");
  shine.setAttribute("fill", "rgba(255,255,255,0.7)");
  shine.setAttribute("clip-path", "url(#lid-clip)");
  svg.append(shine);

  // ── Upper lid stroke (eyelid line) ──
  const lidLine = document.createElementNS(SVG_NS, "path");
  lidLine.id = "lid-line";
  lidLine.setAttribute("d", "M 12 50 Q 50 24 88 50");
  lidLine.setAttribute("fill", "none");
  lidLine.setAttribute("stroke", "var(--accent)");
  lidLine.setAttribute("stroke-width", "3");
  lidLine.setAttribute("stroke-linecap", "round");
  svg.append(lidLine);

  svgEl = svg;
  return svg;
}

// ─── Pointer tracking ─────────────────────────────────────────────────────────

export function attachPointerTracking(svg: SVGSVGElement): void {
  const rect = () => svg.getBoundingClientRect();

  window.addEventListener("mousemove", (e) => {
    if (!trackingEnabled || !svg.isConnected) return;
    const r = rect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const dx = (e.clientX - cx) / (r.width * 2);
    const dy = (e.clientY - cy) / (r.height * 2);
    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
    const tx = 50 + clamp(dx, -0.5, 0.5) * 14; // max 7px wander in SVG units
    const ty = 50 + clamp(dy, -0.5, 0.5) * 10;
    setSVGAttr("iris",  "cx", String(tx));
    setSVGAttr("iris",  "cy", String(ty));
    setSVGAttr("pupil", "cx", String(tx + (tx - 50) * 0.3));
    setSVGAttr("pupil", "cy", String(ty + (ty - 50) * 0.3));
    setSVGAttr("shine", "cx", String(tx + 6));
    setSVGAttr("shine", "cy", String(ty - 6));
  });
}

function setSVGAttr(id: string, attr: string, val: string): void {
  svgEl?.getElementById(id)?.setAttribute(attr, val);
}

// ─── Expressions ──────────────────────────────────────────────────────────────

export function setExpression(expr: MascotExpression): void {
  stopBlink();
  trackingEnabled = true;

  switch (expr) {
    case "idle":
      resetPose();
      scheduleBlink(4000, 6000);
      break;
    case "thinking":
      setSVGAttr("iris", "r", "16");
      trackingEnabled = false;
      spinPupil();
      break;
    case "listening":
      setSVGAttr("sclera", "ry", "34");
      setSVGAttr("iris", "r", "20");
      resetPupil();
      break;
    case "speaking":
      setSVGAttr("iris", "r", "18");
      breatheIris();
      break;
    case "done":
      forceBlink(() => {
        setSVGAttr("iris", "fill", "var(--ok)");
        setTimeout(() => setSVGAttr("iris", "fill", "var(--accent)"), 1800);
        scheduleBlink(4000, 6000);
      });
      break;
    case "needs-you":
      scheduleBlink(400, 600); // rapid blink
      break;
    case "happy":
      setSVGAttr("iris",  "cy", "46"); // slightly up = squint
      setSVGAttr("pupil", "cy", "44");
      scheduleBlink(5000, 7000);
      break;
  }
}

// ─── Blink mechanics ─────────────────────────────────────────────────────────

function resetPose(): void {
  setSVGAttr("sclera", "ry", "30");
  setSVGAttr("iris", "r", "18");
  setSVGAttr("iris", "fill", "var(--accent)");
  resetPupil();
}

function resetPupil(): void {
  setSVGAttr("iris", "cx", "50");
  setSVGAttr("iris", "cy", "50");
  setSVGAttr("pupil", "cx", "50");
  setSVGAttr("pupil", "cy", "50");
}

function stopBlink(): void {
  if (blinkTimer) { clearTimeout(blinkTimer); blinkTimer = null; }
}

function scheduleBlink(minMs: number, maxMs: number): void {
  stopBlink();
  const delay = minMs + Math.random() * (maxMs - minMs);
  blinkTimer = setTimeout(() => {
    forceBlink(() => scheduleBlink(minMs, maxMs));
  }, delay);
}

function forceBlink(onOpen?: () => void): void {
  const lidEl = svgEl?.getElementById("lid-rect");
  if (!lidEl) return;
  const lid = lidEl as SVGElement & ElementCSSInlineStyle;
  // Close lid: shrink the clip rect height to 0 from centre
  lid.style.transition = "y 60ms ease-in, height 60ms ease-in";
  lid.setAttribute("y", "49");
  lid.setAttribute("height", "2");
  setTimeout(() => {
    lid.style.transition = "y 80ms ease-out, height 80ms ease-out";
    lid.setAttribute("y", "10");
    lid.setAttribute("height", "80");
    onOpen?.();
  }, 80);
}

// ─── Continuous animations ────────────────────────────────────────────────────

let spinId: number | null = null;
function spinPupil(): void {
  let angle = 0;
  spinId = window.setInterval(() => {
    angle += 4;
    const rad = (angle * Math.PI) / 180;
    const tx = 50 + Math.cos(rad) * 5;
    const ty = 50 + Math.sin(rad) * 5;
    setSVGAttr("pupil", "cx", String(tx));
    setSVGAttr("pupil", "cy", String(ty));
  }, 16);
}

let breatheId: number | null = null;
function breatheIris(): void {
  let t = 0;
  breatheId = window.setInterval(() => {
    t += 0.05;
    const r = 18 + Math.sin(t * 3) * 2;
    setSVGAttr("iris", "r", String(r));
  }, 16);
}

export function stopAnimations(): void {
  if (spinId)    { clearInterval(spinId);    spinId = null; }
  if (breatheId) { clearInterval(breatheId); breatheId = null; }
  stopBlink();
}
