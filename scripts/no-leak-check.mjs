import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = resolve(here, "..", "dist");

const patterns = [
  /sk-ant-[A-Za-z0-9-_]{10,}/,
  /sk-[A-Za-z0-9]{10,}/,
  /x-api-key\s*[:=]\s*['"][^'"]{8,}/,
  /["']api[_-]?key["']\s*[:=]\s*['"][^'"]{8,}/,
];

function collect(dir, out) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) collect(p, out);
    else if (p.endsWith(".js") || p.endsWith(".html")) out.push(p);
  }
  return out;
}

if (!existsSync(dist)) {
  console.error(`no-leak-check: dist/ not found at ${dist} (run npm run build first)`);
  process.exit(1);
}

const files = collect(dist, []);
let hits = 0;
for (const f of files) {
  const text = readFileSync(f, "utf8");
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    if (line.includes("key_test")) return; // excluded benign word per brief
    for (const re of patterns) {
      if (re.test(line)) {
        hits++;
        console.log(`${f}:${i + 1}: matched ${re} :: ${line.trim().slice(0, 200)}`);
        break;
      }
    }
  });
}

if (hits > 0) {
  console.error(`LEAKCHECK FAIL: ${hits} hit(s)`);
  process.exit(1);
} else {
  console.log("LEAKCHECK CLEAN");
}
