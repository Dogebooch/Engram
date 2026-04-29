#!/usr/bin/env node
/**
 * Curates OpenMoji color SVGs from `node_modules/openmoji` into
 * `public/symbols/openmoji/` and emits `public/symbols.json` (the durable,
 * committed index). Runs after `npm install` via the postinstall hook,
 * and can be re-run any time with `npm run symbols:build`.
 *
 * Failure mode: any missing input logs a warning and exits 0 so a fresh clone
 * never breaks `npm install`. The library UI shows a recovery empty state
 * pointing the user back to `npm run symbols:build`.
 */

import { readFile, writeFile, mkdir, copyFile, access } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const OPENMOJI_DIR = join(REPO_ROOT, "node_modules", "openmoji");
const SVG_SRC_DIR = join(OPENMOJI_DIR, "color", "svg");
const META_PATH = join(OPENMOJI_DIR, "data", "openmoji.json");
const OUT_SVG_DIR = join(REPO_ROOT, "public", "symbols", "openmoji");
const OUT_INDEX = join(REPO_ROOT, "public", "symbols.json");

const KEEP_GROUPS = new Set([
  "smileys-emotion",
  "people-body",
  "animals-nature",
  "food-drink",
  "activities",
  "travel-places",
  "objects",
  "symbols",
]);

function splitTagString(s) {
  if (!s || typeof s !== "string") return [];
  return s
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
}

function shouldInclude(entry) {
  if (!KEEP_GROUPS.has(entry.group)) return false;
  if (entry.skintone && entry.skintone !== "") return false;
  return true;
}

function buildEntry(raw) {
  const id = `openmoji:${raw.hexcode}`;
  const displayName = raw.annotation;
  const nameLower = displayName.toLowerCase();
  const aliases = Array.from(
    new Set([
      ...splitTagString(raw.openmoji_tags),
      ...splitTagString(raw.tags),
    ]),
  ).filter((a) => a !== nameLower);
  const subgroupTokens = (raw.subgroups || "")
    .split("-")
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);
  const tags = Array.from(new Set([raw.group, ...subgroupTokens]));
  return {
    id,
    displayName,
    aliases,
    tags,
    source: "openmoji",
    qualityRank: 1,
    imageUrl: `/symbols/openmoji/${raw.hexcode}.svg`,
  };
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("[symbols:build] starting");

  if (!(await exists(OPENMOJI_DIR))) {
    console.warn(
      "[symbols:build] node_modules/openmoji not found — run `npm install` first. Skipping.",
    );
    return;
  }
  if (!(await exists(META_PATH))) {
    console.warn(`[symbols:build] missing ${META_PATH} — skipping.`);
    return;
  }
  if (!(await exists(SVG_SRC_DIR))) {
    console.warn(`[symbols:build] missing ${SVG_SRC_DIR} — skipping.`);
    return;
  }

  const raw = JSON.parse(await readFile(META_PATH, "utf8"));
  const filtered = raw.filter(shouldInclude);
  console.log(
    `[symbols:build] curated ${filtered.length} / ${raw.length} entries`,
  );

  await mkdir(OUT_SVG_DIR, { recursive: true });

  const entries = [];
  let copied = 0;
  let missing = 0;
  for (const r of filtered) {
    const src = join(SVG_SRC_DIR, `${r.hexcode}.svg`);
    if (!(await exists(src))) {
      missing++;
      continue;
    }
    const dst = join(OUT_SVG_DIR, `${r.hexcode}.svg`);
    await copyFile(src, dst);
    copied++;
    entries.push(buildEntry(r));
  }

  entries.sort((a, b) => a.id.localeCompare(b.id));

  // One entry per line: small, grep-friendly, diff-friendly.
  const lines = [
    "[",
    ...entries.map(
      (e, i) =>
        "  " + JSON.stringify(e) + (i < entries.length - 1 ? "," : ""),
    ),
    "]",
  ];
  await writeFile(OUT_INDEX, lines.join("\n") + "\n", "utf8");

  console.log(
    `[symbols:build] copied ${copied} svgs (${missing} missing), wrote ${OUT_INDEX}`,
  );
}

try {
  await main();
} catch (err) {
  const msg = err && err.message ? err.message : String(err);
  console.warn(`[symbols:build] error: ${msg}`);
  console.warn(
    "[symbols:build] If symbols are missing in the app, retry: npm run symbols:build",
  );
  // exit 0 to avoid breaking npm install on a build hiccup
}
