// Minify .deploy-public/assets/*.{js,css} in place. Called from stage-public-assets.ps1.
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");
const assetsDir = path.join(repoRoot, ".deploy-public", "assets");

async function* walk(dir) {
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else yield full;
  }
}

let totalBefore = 0;
let totalAfter = 0;
const skipped = [];

for await (const file of walk(assetsDir)) {
  const ext = path.extname(file).toLowerCase();
  if (ext !== ".js" && ext !== ".css") continue;
  if (file.endsWith(".min.js") || file.endsWith(".min.css")) continue;

  const src = await fs.readFile(file, "utf8");
  totalBefore += Buffer.byteLength(src, "utf8");

  try {
    const out = await esbuild.transform(src, {
      loader: ext === ".js" ? "js" : "css",
      minify: true,
      legalComments: "none",
      target: ext === ".js" ? "es2020" : undefined,
    });
    await fs.writeFile(file, out.code, "utf8");
    totalAfter += Buffer.byteLength(out.code, "utf8");
  } catch (err) {
    skipped.push({ file: path.relative(repoRoot, file), error: err.message });
    totalAfter += Buffer.byteLength(src, "utf8");
  }
}

const saved = totalBefore - totalAfter;
const pct = totalBefore > 0 ? (saved / totalBefore) * 100 : 0;
console.log(
  `Minified deploy bundle: ${(totalBefore / 1024).toFixed(1)} KB -> ` +
    `${(totalAfter / 1024).toFixed(1)} KB (saved ${(saved / 1024).toFixed(1)} KB, ${pct.toFixed(1)}%)`
);
if (skipped.length) {
  console.warn(`Skipped ${skipped.length} file(s) due to parse errors:`);
  for (const s of skipped) console.warn(`  - ${s.file}: ${s.error}`);
  process.exitCode = 1;
}
