import { readFileSync, existsSync } from "node:fs";

const failures = [];
const app = readFileSync("src/app.js", "utf8");
const css = readFileSync("src/styles.css", "utf8");
const spec = readFileSync("specs/phase2n-visual-fidelity-contract.md", "utf8");

const requiredFiles = [
  "assets/codex-glass-terminal.svg",
  "assets/ai-turtle-mascot.svg",
  "assets/ai-reviewer-mascot.svg",
  "specs/phase2n-visual-fidelity-contract.md"
];

for (const file of requiredFiles) {
  if (!existsSync(file)) failures.push(`missing visual fidelity file: ${file}`);
}

const requiredAppMarkers = [
  "data-visual-fidelity",
  "hero-proof-rail",
  "data-student-depth",
  "data-research-proof",
  "visual-depth-grid",
  "data-core-module-dock",
  "data-pair-role-board",
  "data-agent-dialog-window",
  "data-thinking-trace",
  "data-teacher-command-center"
];

for (const marker of requiredAppMarkers) {
  if (!app.includes(marker)) failures.push(`missing app visual marker: ${marker}`);
}

const requiredCssMarkers = [
  "--coral",
  "--leaf",
  "--violet",
  "surface-noise",
  "hero-proof-rail",
  "visual-depth-grid",
  "core-module-dock",
  "pair-role-board",
  "agent-dialog-window",
  "thinking-trace-panel",
  "teacher-command-center",
  "overflow-wrap: anywhere",
  "@media (prefers-reduced-motion: reduce)",
  "@keyframes float-panel"
];

for (const marker of requiredCssMarkers) {
  if (!css.includes(marker)) failures.push(`missing CSS visual marker: ${marker}`);
}

if (/letter-spacing:\s*-\d/.test(css)) {
  failures.push("negative letter-spacing found");
}

const hueMarkers = ["--primary", "--accent", "--mint", "--coral", "--leaf", "--violet"];
const presentHues = hueMarkers.filter((marker) => css.includes(marker));
if (presentHues.length < 6) failures.push(`insufficient palette diversity: ${presentHues.join(", ")}`);

if (!spec.includes("No outbound model or image-generation call")) {
  failures.push("visual fidelity spec is missing no-outbound guardrail");
}

if (!css.includes("@media (max-width: 760px)") || !css.includes(".hero-proof-rail")) {
  failures.push("mobile visual fidelity rules are incomplete");
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Visual fidelity checks passed: markers, palette, motion guard, responsive hooks, and no-outbound spec.");
