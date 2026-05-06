#!/usr/bin/env node
// Bump version across package.json, src-tauri/Cargo.toml, and src-tauri/tauri.conf.json.
// Usage:
//   node scripts/bump-version.mjs 0.1.1
//   npm run version:bump -- 0.1.1

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/bump-version.mjs <new-version>");
  console.error("       e.g. node scripts/bump-version.mjs 0.1.1");
  process.exit(1);
}

if (!/^\d+\.\d+\.\d+(-[\w.]+)?$/.test(target)) {
  console.error(`Invalid version: ${target} (expected semver, e.g. 0.1.1)`);
  process.exit(1);
}

const root = resolve(import.meta.dirname, "..");

function bumpJson(path, key) {
  const full = resolve(root, path);
  const json = JSON.parse(readFileSync(full, "utf8"));
  const before = json[key];
  json[key] = target;
  writeFileSync(full, JSON.stringify(json, null, 2) + "\n");
  console.log(`  ${path}: ${before} -> ${target}`);
}

function bumpCargoToml(path) {
  const full = resolve(root, path);
  const text = readFileSync(full, "utf8");
  // Match the FIRST `version = "..."` after `[package]` (Cargo's own field).
  const replaced = text.replace(
    /(\[package\][\s\S]*?\nversion\s*=\s*")[^"]+(")/,
    `$1${target}$2`,
  );
  if (replaced === text) {
    throw new Error(`Failed to find [package].version in ${path}`);
  }
  writeFileSync(full, replaced);
  console.log(`  ${path}: bumped to ${target}`);
}

console.log(`Bumping version to ${target}:`);
bumpJson("package.json", "version");
bumpCargoToml("src-tauri/Cargo.toml");
bumpJson("src-tauri/tauri.conf.json", "version");

console.log("");
console.log("Next steps:");
console.log(`  git commit -am "release: v${target}"`);
console.log(`  git tag v${target}`);
console.log(`  git push origin main --tags`);
