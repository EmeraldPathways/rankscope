#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_dir"

required_files=(
  "package.json"
  "package-lock.json"
  ".openai/hosting.json"
  "app/layout.tsx"
  "app/page.tsx"
  "app/globals.css"
  "db/index.ts"
  "db/schema.ts"
  "drizzle/0000_early_ravenous.sql"
  "drizzle/meta/_journal.json"
  "worker/index.ts"
)

missing=()
for file in "${required_files[@]}"; do
  if [[ ! -f "$file" ]]; then
    missing+=("$file")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Project integrity check failed. Missing required files:\n' >&2
  printf '  %s\n' "${missing[@]}" >&2
  exit 1
fi

node --input-type=module <<'NODE'
import fs from "node:fs";

const manifest = JSON.parse(fs.readFileSync(".openai/hosting.json", "utf8"));
if (!manifest.project_id || typeof manifest.project_id !== "string") {
  throw new Error(".openai/hosting.json is missing project_id");
}
if (manifest.d1 !== "DB") {
  throw new Error(".openai/hosting.json must keep the D1 binding named DB");
}
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));
const lock = JSON.parse(fs.readFileSync("package-lock.json", "utf8"));
if (packageJson.name !== lock.name || packageJson.version !== lock.version) {
  throw new Error("package.json and package-lock.json metadata do not match");
}
NODE

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Project integrity check failed. This directory is not a Git checkout." >&2
  exit 1
fi

tracked_count="$(git ls-files | wc -l | tr -d ' ')"
if [[ "$tracked_count" -lt 20 ]]; then
  echo "Project integrity check failed. The checkout contains too few tracked source files ($tracked_count)." >&2
  exit 1
fi

echo "RankScope project integrity passed: ${tracked_count} tracked source files, Sites manifest, D1 binding, and migrations present."
