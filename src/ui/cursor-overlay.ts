/**
 * Cursor / annotation overlay — Tazama AI  (Plan C stub)
 *
 * Full-screen, always-on-top, click-through layer.
 * Mirrors HeyClicky's ScreenAnnotationCanvasView / BlueCursorView.
 *
 * Annotation grammar (emitted by the model in square brackets):
 *   [TARGET:x,y,r:label]   — highlight a click target at (x,y) radius r
 *   [HOVER:x,y,r:label]    — hover-dwell indicator
 *   [HIGHLIGHT]             — full-element highlight rect
 *   [POINT]                 — pointing arrow
 *   [SHAPE:arrow]           — drawn path
 *   [SHAPE:curve]           — drawn curve
 *
 * Constants from HeyClicky binary:
 *   dwellMinimumDuration    ≈ 350ms (from dwell-ring animation value)
 *   snapRadius              ≈ 16px
 *   releaseRadius           ≈ 12px
 *   strokeFadeDuration      ≈ 600ms
 *   activeStrokeFadeDuration ≈ 250ms
 *   bubbleHideFadeDuration  ≈ 180ms
 *
 * Plan C implementation will add:
 *   - windows-capture frame capture (ayangweb/tauri-plugin-screenshots)
 *   - uiautomation element walk for BoundingRectangle
 *   - SendInput for click/type/scroll actuation
 *   - coordinate scaling: screenshot pixels → screen pixels
 */

const GRAMMAR_RE = /\[(TARGET|HOVER|HIGHLIGHT|POINT|SHAPE)(?::([^\]]+))?\]/g;

interface AnnotationToken {
  kind: "TARGET" | "HOVER" | "HIGHLIGHT" | "POINT" | "SHAPE";
  params: string;
}

export function mountCursorOverlay(root: HTMLElement): void {
  root.className = "cursor-overlay";
  // Full-screen click-through — pointer-events: none so it never captures input
  Object.assign(root.style, {
    position: "fixed",
    inset: "0",
    pointerEvents: "none",
    zIndex: "9999",
    overflow: "hidden",
  });

  // Canvas for annotation strokes (Plan C will draw on this)
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;";
  canvas.width  = window.innerWidth  * devicePixelRatio;
  canvas.height = window.innerHeight * devicePixelRatio;
  root.append(canvas);

  // Listen for model annotation commands
  document.addEventListener("tazama:annotate", (e: Event) => {
    const text = (e as CustomEvent<string>).detail;
    processAnnotations(text, canvas);
  });

  // Resize
  window.addEventListener("resize", () => {
    canvas.width  = window.innerWidth  * devicePixelRatio;
    canvas.height = window.innerHeight * devicePixelRatio;
  });
}

function parseAnnotations(text: string): AnnotationToken[] {
  const tokens: AnnotationToken[] = [];
  let m: RegExpExecArray | null;
  GRAMMAR_RE.lastIndex = 0;
  while ((m = GRAMMAR_RE.exec(text)) !== null) {
    tokens.push({ kind: m[1] as AnnotationToken["kind"], params: m[2] ?? "" });
  }
  return tokens;
}

function processAnnotations(text: string, canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const tokens = parseAnnotations(text);
  const dpr = devicePixelRatio;

  tokens.forEach(token => {
    switch (token.kind) {
      case "TARGET":
      case "HOVER": {
        // params: "x,y,r:label"
        const parts = token.params.split(":");
        const coords = (parts[0] ?? "").split(",").map(Number);
        const [x = 0, y = 0, r = 20] = coords;
        const isPulse = token.kind === "TARGET";

        // Draw dwell ring (fill = accent approx #3380FF)
        ctx.save();
        ctx.strokeStyle = isPulse ? "#3380ff" : "rgba(51,128,255,.5)";
        ctx.lineWidth   = 2 * dpr;
        ctx.beginPath();
        ctx.arc(x * dpr, y * dpr, r * dpr, 0, Math.PI * 2);
        ctx.stroke();

        // Label
        if (parts[1]) {
          ctx.fillStyle = "rgba(51,128,255,.9)";
          ctx.font = `${12 * dpr}px "Segoe UI Variable Text", system-ui`;
          ctx.fillText(parts[1], (x + r + 4) * dpr, y * dpr + 4 * dpr);
        }
        ctx.restore();
        break;
      }
      case "POINT": {
        // Simple arrow pointer stub
        const [x = 100, y = 100] = token.params.split(",").map(Number);
        ctx.save();
        ctx.fillStyle = "#3380ff";
        ctx.beginPath();
        ctx.moveTo(x * dpr, y * dpr);
        ctx.lineTo((x + 12) * dpr, (y + 20) * dpr);
        ctx.lineTo((x + 5) * dpr,  (y + 17) * dpr);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
        break;
      }
      default:
        break;
    }
  });
}
