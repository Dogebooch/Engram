@AGENTS.md

# CLAUDE.md

## Memory bank (read these first, in order)
1. `docs/PRD.md` — product requirements
2. `docs/SPEC.md` — technical specification
3. `docs/TODO.md` — phased build plan

## Project identity
Visual mnemonic scene editor for medical learners. Pixorize-class output, Obsidian-native data model (markdown-as-source-of-truth), AI-ready architecture. Solo user, desktop-only, local-first v1. Repo name: `engram`.

## Stack (do not change without explicit user approval)
Next.js **16** + TypeScript + Konva.js (react-konva) + Zustand (idb-keyval persist) + Tailwind v4 + shadcn/ui + CodeMirror 6 + unified/remark for markdown.

## Workflow rules
- **Plan-mode first.** Before any non-trivial change, output a plan first.
- **Atomic commits.** One logical change per commit.
- **Strict TypeScript.** No `any` without a comment explaining why.
- **Tests for non-trivial logic only.** Markdown parser, canvas serialization, tag-symbol-with-fact action, hotspot centroid recompute. Skip trivial UI tests.
- **Skills first, MCPs second.** Anthropic skills (especially `frontend-design`) outperform MCP servers for most tasks.
- **No proactive docs.** Do not create README.md or other doc files unless the user asks. Update `CLAUDE-*.md` when patterns or decisions change.

## User principles (apply to all output, not just code)
- **Minimum information.** Atomic ideas. Be concise. Avoid bloat.
- **Comprehension before memorization.** Explain logic before encoding it.
- **Be opinionative.** Push back on the user's ideas when there's a better way. Do not anchor on their initial framing.
- **Ruthless prioritization.** Not every concept deserves a feature. Cut scope.
- **Decode test.** For any UI/visual decision, ask: could a fresh user reconstruct the meaning from what's shown?

## Skills to engage
- `frontend-design` — **always** when writing UI, components, or styling
- `superpowers` — consider after v1 ships; not v1
- Read official Claude Code docs (docs.claude.com) when working on hooks/skills/agents specifics

## Investigation rules
- Never speculate about code you have not opened. Read first, claim second.
- If the user references a specific file, read it before answering.
- Use `rg` (ripgrep) and `fd` for fast search and listing — they respect `.gitignore`.

## Visual verification (mandatory for UI changes)
Use the **Claude Preview pane** (not Claude in Chrome) for in-app testing. It's natively integrated, drives the dev server via `.claude/launch.json`, and lets the user annotate screenshots inline so feedback returns as conversation context.

After any change observable in the running app — UI, layout, theme, canvas, store-driven state, keybindings, persistence — verify it before ending the turn:

1. Ensure the dev server is running via `mcp__Claude_Preview__preview_start` (config `engram (Next.js dev)` from `.claude/launch.json`). Reuses if already up.
2. `mcp__Claude_Preview__preview_screenshot` to confirm the change renders correctly. For interactive flows, use `preview_click` / `preview_fill` / `preview_eval` to drive state, then screenshot.
3. `mcp__Claude_Preview__preview_console_logs` (level: "error") to catch runtime errors. Empty result = clean.
4. For state-dependent verification, use `preview_eval` to inspect `useStore.getState()` or IndexedDB directly rather than guessing.
5. Refresh and re-screenshot when verifying persistence-affecting changes.

Type-checking and tests verify code correctness, not feature correctness — never skip visual verification on UI work, and never claim "ship-ready" without having looked. Reserve **Claude in Chrome** for things Preview cannot do: real-browser-only features (OAuth, extensions, cross-origin cookies). Engram has none of those in v1.

## Commit hygiene
When committing, exclude `CLAUDE.md` file from commits unless explicitly asked. They are working memory, not source code. Never delete them. (Both already in `.gitignore`.)
