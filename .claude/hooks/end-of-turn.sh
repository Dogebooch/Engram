#!/usr/bin/env bash
set -u

cd "$(git rev-parse --show-toplevel 2>/dev/null || echo .)" || exit 0

run() {
  if command -v "$1" >/dev/null 2>&1; then
    "$@"
    return $?
  fi
  return 127
}

run_npx() {
  if command -v npx >/dev/null 2>&1; then
    npx --no-install "$@"
    return $?
  fi
  return 127
}

fail=0

if [ -f pyproject.toml ] || ls *.py >/dev/null 2>&1; then
  if command -v pyright >/dev/null 2>&1; then
    pyright . || fail=1
  fi
  if command -v pytest >/dev/null 2>&1; then
    pytest -q || fail=1
  fi
fi

if [ -f package.json ]; then
  if command -v npx >/dev/null 2>&1; then
    npx --no-install tsc --noEmit
    rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 127 ] || fail=1

    npx --no-install vitest run --passWithNoTests
    rc=$?
    [ $rc -eq 0 ] || [ $rc -eq 127 ] || fail=1
  fi
fi

[ $fail -eq 0 ] && exit 0 || exit 2
