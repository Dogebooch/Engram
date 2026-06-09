---
name: design-mnemonic
description: >-
  Design an original picture mnemonic (Picmonic/Sketchy/Pixorize-style scene) from a bare medical
  fact or topic — no video required — applying the high-yield principles: phonetic sound-alikes
  (keyword method), spatial positioning (method of loci), clustering, and imagery that acts out the
  fact. Outputs the design as text in Engram's bullet format, then offers to package it into an
  importable .engram bundle. Use when the user says "make/design a mnemonic for X", "make a
  picmonic/sketch/scene for X", "how would you draw X", "come up with a mnemonic for <drug / disease /
  pathogen / enzyme>", or hands you a fact and asks for a memorable image. NOT for ingesting an
  existing video (use ingest-video) or for the yield-only judgment (use high-yield-fact).
argument-hint: <a fact or a topic>
---

# Design a picture mnemonic

You turn a bare fact or topic into an excellent Picmonic/Sketchy/Pixorize-style scene and write it in
Engram's bullet format. **Default output is design text.** At the very end you **always ask** whether
to package it into an importable `.engram` bundle. No image generation — symbols become un-traced
placeholders the user draws later.

The deep rationale, citations, and a fully worked scene live in
[`references/mnemonic-principles.md`](references/mnemonic-principles.md). Read it when you want the
*why* or a model to copy. The method below is the operational distilation.

## Step 0 — Scope & yield (the 95th-percentile lens)

Judge what to encode as a **top-decile (95th-percentile) ABEM/ABIM scorer** would — the bar Pixorize
hires its content team against. That reviewer encodes the **discriminating, repeatedly-tested** facts
(buzzword associations, "most likely diagnosis" pivots, first-line-vs-next-step, classic traps) and
**cuts trivia** so it doesn't clutter the scene. Then size the job:

- **A single fact** → one symbol, or a tight mini-scene (2–3 symbols).
- **A topic / list of facts** → a full scene; group facts into Sections.

When the scene-vs-symbol-vs-skip call is genuinely unclear, defer to the **`high-yield-fact`** skill.

## Step 1 — Distill testable facts

Rewrite each fact as a **terse clinical fragment**, Engram Fact-heading style: no leading "The", no
trailing period. "Beta-2 agonist relaxes bronchial smooth muscle" — not "The drug is a beta-2 agonist
that works by relaxing...". These become your `##` Fact headings.

## Step 2 — Phonetic sound-alike (keyword method)

For each abstract term, break it into phonetic chunks and map each to a **concrete, drawable, ideally
*action-capable* object**: `albuterol` → "Albu-**TROLL**", `famotidine` → "Fa-**MOAT**-idine",
`vasopressin` → "**VASE**-press-in". Encode the **whole term**, not just the first syllable
(`anaphylaxis` → **ANA**conda + **PHYL**o scales + **AXE**s). Dual-code where you can (the letter "K"
*and* a banana for potassium).

**Reuse before you invent — match the source programs' iconography.** A term the user has already
seen in Pixorize/Sketchy/Picmonic should keep *that* symbol, so it means the same thing everywhere.
Before coining a fresh pun, check two sources:

1. **The ingested library** (1500+ authored Pixorize/Sketchy/Picmonic scenes) — search it:
   ```
   python .claude/skills/design-mnemonic/scripts/find_existing_symbols.py "<term>"   # [--source pixorize|sketchy] [--limit N]
   ```
   It returns the established `description → meaning; encoding` for the term, ranked, with the scenes
   and source program it came from. If a good match exists, **reuse that visual** (e.g. thiamine →
   Pixorize's teepees "TPP" / "bee gun = B1"; ACE inhibitors → a winning hand of aces). Try a synonym
   or two (brand/generic, abbreviation) if the first query is dry.
2. **The curated pun glossary** `tools/video-ingest/glossary.json` — recurring puns → canonical
   meaning. Propose a new entry in your summary (don't silently add) when you coin a pun worth reusing.

Only invent a new sound-alike when neither source has a fitting symbol.

## Step 3 — Make the image ACT OUT the fact

Interaction beats co-location — the *verb between two items is the mechanism you're testing*.

- Disease = **villain** doing harm; drug = **hero** stopping it.
- A blocker **blocks** a receptor-door; an inhibitor **jams** the machine — never just stands nearby.
- The encoding-note should name the action that carries the meaning.

## Step 4 — Spatial layout (loci + clustering)

- **One coherent, vivid setting** per scene (a lung-cave, a Six Flags park) — never a generic ER.
- **Bind each symbol to a definite spot** and keep it there.
- **Position encodes priority/category**: cornerstone/first-line nearest the patient and in the
  foreground; refractory/last-resort/caveats in a far "back-up" zone or the periphery.
- **Cluster related facts** into a sub-region (all side effects in one corner) → semantic grouping.

## Step 5 — Distinctiveness (with limits)

Exaggerate, charge it emotionally (peril, heroism, absurdity, humor) — the Von Restorff effect makes
the odd item stick. But keep it a **mixed** scene (not everything bizarre), cap it at **~7 chunks**
(split into Sections or separate Picmonics beyond that), give it **one clear focal point**, and never
trade **legibility** for weirdness.

## Step 6 — Write the Engram bullets

Format (only `{sym:UUID}` + a non-empty description are structurally required; `→`/`->` and `;` are
both fine):

```
## Terse clinical fact
* {sym:UUID} rich SPATIAL visual description → clean clinical meaning; encoding-note (the pun/metaphor — the WHY)
```

- **Description**: name the object *and where it sits* ("Albu-TROLL front-and-center at the cave
  mouth") — rich and locatable, not a thin label.
- **Meaning**: the clean clinical fact, not slash-tags.
- **Encoding**: *why* this image encodes the fact — the sound-alike or the depicting action. This is
  the memory hook; never omit it.
- **Reuse one symbol across facts** when a single image legitimately encodes two facts: use the same
  UUID under both `##` Facts (one shared placeholder, two hotspots).
- Use placeholder UUIDs here (`{sym:UUID}`); the packaging script mints real ones, so you can instead
  write the design with a stable `key` per symbol and let the script assign IDs (see handoff).

### Do / Don't

| Do | Don't |
|---|---|
| Rich spatial description with a location | Thin one-word label |
| Cast that *interacts* (verb = mechanism) | Isolated icons sitting side by side |
| Position by clinical priority (loci) | Arbitrary placement |
| ≤ ~7 chunks; cluster; one focal point | Overcrowded wall of props |
| Sound-alike or depicting metaphor on every symbol | "Looks like the thing" with no hook |
| Reuse established symbols (glossary) | A new random pun for a term you've drawn before |

## Output, then offer the package

Present the design clearly: **setting + cast**, then per-Section the Facts with each symbol's
*description → meaning; why*, plus a one-line **spatial-layout** note (what sits where and why).

Then **always ask**: *"Want me to turn this into an importable `.engram` package?"*

### If yes — build & (optionally) import

1. Write a design JSON (shape and a full example in
   [`references/mnemonic-principles.md`](references/mnemonic-principles.md) — `name`, optional `tags`,
   `sections[]` → `facts[]` → `symbols[]` with `key`/`description`/`meaning`/`encoding`). Reuse a
   `key` across facts to share a placeholder.
2. Build the bundle (stdlib-only, no venv needed):
   ```
   python .claude/skills/design-mnemonic/scripts/make_engram_package.py --design <design.json>
   ```
   Output: `<slug>.engram.zip` (no-backdrop scene; every symbol an un-traced placeholder rect).
3. **Import only if the dev app is running and the user wants it in-app now.** Reuse the
   `ingest-video` import path: `preview_start`, navigate to the app, copy the zip to
   `public/_ingest/<name>.engram.zip`, `preview_eval` `fetch` → `Blob` → `File` → assign to the hidden
   zip file input (select it robustly: `document.querySelector('input[type=file]')` — its `accept` is
   `.zip,application/zip`, so an exact `[accept=".zip"]` selector misses it) via a `DataTransfer` and
   dispatch a native `change`. Confirm the library count incremented (clean console, no
   `BundleImportError`); opening the scene shows every Section/Fact/bullet and a "N need outlines"
   header. Remove the temp `public/_ingest/` file.
   Otherwise just hand over the zip path for the user to drag-drop.

The user then draws each placeholder via the editor's "N need outlines" walkthrough — the bullet tells
them what each one is and where it sits.

## Related skills

- **`high-yield-fact`** — upstream: is this worth a scene, a symbol, or a skip?
- **`ingest-video`** — when the source is an existing teaching video, not a from-scratch design.
- **`anki-card-author`** — when the fact is better served by a text flashcard.
