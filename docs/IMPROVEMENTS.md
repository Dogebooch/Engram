# Engram — Improvement Recommendations

> Evaluation of Engram v1.3.0 across **Polish**, **Functionality**, and **Usability**, ranked
> high→low **yield** with a lifecycle verdict on each. This is the "what & why," not an
> implementation plan.

**How to read this.** *Yield* = (frequency × value) ÷ (effort + risk), judged against Engram's real
purpose: a single-user, local tool for **authoring *and* studying** board-prep picture mnemonics.
★★★★★ = do it; ★ = marginal. *Verdict* = when, if ever, to build it: **Now** / **Next** /
**Opportunistic** (do it while you're in that file) / **Later·v2** / **Skip**.

> **Implementation status — 2026-06-26.** A follow-up pass implemented the top Polish items and
> corrected one premise:
> - **P1 (canvas empty state) was already built** — it exists in `canvas-stage.tsx` (`CanvasEmptyState`,
>   gated to empty + no-backdrop + not-annotating + not-file-dragging). It is **struck** from the list
>   below. The only refinement shipped was making the card click-through (`pointer-events: none` on the
>   card, `auto` on the button) so a dragged symbol can be dropped over the centre of the stage.
> - **P2's two genuine gaps shipped**: the hydration **skeleton** now has staggered, motion-reduce-safe
>   pulses, and the notes **FORM/SOURCE toggle** was unified onto the shared segmented-toggle style
>   (`.eng-segmented-toggle`) to match the player toggle. P2's other originally-listed sub-items
>   (tooltip delay, library-card hover) were found **already implemented** and needed no work.
> - Verified: `npm run lint`/`npm run build` clean; an independent UI review passed all acceptance
>   criteria in both light and dark themes.

## Overall assessment

Engram is a mature, well-architected v1 (~7.5/10 polish). The foundations are strong and should be
left alone: markdown-as-source-of-truth with atomic canvas+notes sync, sliced Zustand + zundo
undo/redo, IDB persistence, dual Form/Source notes, a single-source keybinding table, a seamless dark
theme, and a sophisticated ingest pipeline. The weak spots cluster: the **canvas** is the least-finished
surface, the **player** is reveal-only (a study tool whose study mode doesn't test you), and the two
**hottest authoring loops** cost too many clicks.

---

# A. Polish

> ~~**P1 — Canvas first-run / empty state.**~~ **✓ Already implemented** (verified 2026-06-26). A centered
> "Start your mnemonic" card already renders on an empty canvas, correctly gated, with an "Add a symbol"
> action. Struck from the recommendation list; a click-through refinement was shipped.

### P1 — Interaction-feedback consistency pass · ★★★★ · **Mostly shipped**
The skeleton and the notes toggle are done (see status note). What remains in the same spirit is small:
audit the rest of the app for any control whose hover/active/loading feedback still feels ad-hoc.
*Low / largely complete.*

### P2 — Canvas finish details · ★★★ · **Opportunistic**
The polygon-tracing cursor is a hardcoded black/white SVG, not theme-aware (`canvas-stage.tsx:47-60`);
symbols have no hover affordance before selection; `SymbolNumberCircle` carries hardcoded oklch
fallbacks. The canvas is where the user spends the most time, so inconsistencies are felt most here.
*Low–Medium.*

### P3 — Study-mode visual legibility · ★★★ · **Next** (pairs with Functionality F2)
The player works, but the active-mode indicator and sequential progress are quiet and the reveal card
could carry more hierarchy. Best done together with the active-recall mode so the player UI is touched
once. *Low–Medium.*

### P4 — Humanize error & edge states · ★★ · **Opportunistic / Later**
`CanvasErrorBoundary` shows raw "Canvas crashed" jargon; the missing-symbol-index and broken-`{sym}`
chip states are flat. Rare paths, but exactly when a user feels abandoned. *Low.*

### P5 — One toggle/pill vocabulary · ★★ · **Opportunistic** *(added 2026-06-26)*
Now that `.eng-segmented-toggle` is shared by the player and notes toggles, the remaining ad-hoc pills
should converge onto it: the canvas `NumbersToggle` (`canvas-stage.tsx`), and the lint/outline pills in
the notes header (`notes-panel/index.tsx`). One vocabulary for toggles and status pills. *Low.*

> *Not recommending:* a wholesale motion redesign (the easing curves are already tasteful) or restyling
> the in-tree shadcn set (cohesive as-is). **Skip both.**

---

# B. Functionality

### F1 — In-editor hotspot preview · ★★★★★ · **Now**
Fact anchors (the numbered study circles) render **only** in the Player (`player-stage.tsx`); the editor
never shows them, so you design the scene blind to its study layout and can't see collisions until you
enter study mode. The math is reusable (`getFactAnchor` in `lib/canvas/centroid.ts`,
`spreadOverlappingHotspots` in `player-stage.tsx`). → A toggleable low-opacity ghost overlay.
**Highest value-per-effort.** *Low.*

### F2 — Active-recall / self-test study mode · ★★★★★ · **Next (flagship)**
The Player is reveal-only — no testing, self-grading, or session outcome. It's a study tool whose study
mode doesn't test you, and active recall *is* the point. → A "quiz" mode that hides the fact, prompts
recall, reveals on a self-rating (got it / missed), tallies the session, and can pipe misses into the
existing Anki CSV export (`lib/export/anki.ts`). *Medium — worth it.*

### F3 — Expand the symbol library (Game-Icons → Twemoji) · ★★★★ · **Next / Opportunistic**
OpenMoji only; the source-priority architecture already anticipates more (`lib/symbols/load.ts`).
Mnemonics live or die on the right visual pun — Game-Icons (~4000: creatures, weapons, anatomy) roughly
doubles the vocabulary. → Add it to `scripts/build-symbol-index.mjs` + ranking; search needs no change.
*Low–Medium (build + attribution).*

### F4 — Cross-Picmonic reuse + Find/Replace · ★★★ · **Opportunistic**
No path to reuse a symbol/fact set across scenes (export→import is the workaround) or to bulk-edit notes
text — though `duplicatePicmonic` exists and CodeMirror already ships `@codemirror/search` (just not
wired). → "Duplicate as template" / copy-symbols-across, and `Ctrl+H` in the Source view. *Low–Medium.*

### F5 — Activate v2 scaffolding: animated + audio export · ★★ near-term (★★★★★ ceiling) · **Later·v2**
The model already carries `animation*`, `factMeta.audioRef`, `timeline[]` (round-tripped, no UI by
design). Animation + narration are what differentiate Picmonic/Sketchy — the north star. → Timeline/
animation editor + audio playback, then video/GIF export. **Don't start until F2 lands** — flashy export
of a study mode that can't test you is backwards. *High effort/risk.*

> *Not recommending:* variable canvas aspect ratio (16:9 threads through positioning/hotspots/export —
> high blast radius, low payoff) — **Skip**; cloud sync/collaboration (contradicts local-first
> single-user) — **Skip**; soft-delete trash bin — **Later, low priority.**

---

# C. Usability (speed of completing tasks)

### U1 — Faster symbol→Fact tagging (the #1 hot loop) · ★★★★★ · **Now**
Tagging happens 10+/scene and costs select → `F` → search → Enter; `F` with nothing selected just toasts
"select a symbol first" (`keybindings.ts:268`), and the picker sorts by *line position*, not recency
(`fact-picker.tsx:38`). → Order by recency + number-key select (`F` then `1–9`), and/or a first-class
"Adding to: ‹Fact›" armed-chip so library adds auto-tag (infra exists: `addSymbolTargetFactId`).
*Low–Medium.*

### U2 — Streamline outline tracing · ★★★★ · **Now / Next**
The polygon commits only on **Enter** (`canvas-stage.tsx`) — no click-start-point/double-click close, no
last-vertex undo — and tracing is gated by a backdrop/pick modal before you can draw
(`add-outline-confirm.tsx`). Every traced symbol pays this. → Click/double-click to close, vertex undo,
inline library-pick, and an "outline next missing" key. *Medium.*

### U3 — Close the keyboard gaps · ★★★ · **Opportunistic**
Rename Fact, start outline, add Fact/Section are all mouse-only (verified absent in `keybindings.ts`).
The keybinding table is a clean single source that auto-documents in the `?` overlay, so additions are
cheap. → e.g. F2/Enter rename-fact, start-outline, add-fact/section. *Low.*

### U4 — Smarter library-add placement · ★★★ · **Opportunistic**
Click-to-add drops symbols at stage center, so repeated click-adds stack and must be dragged apart
(drag-drop already uses the drop point — `add-symbol-with-note-sync.ts`). → Place click-adds at the last
pointer position / staggered; optional "keep adding" mode. *Low.*

### U5 — Surface the hidden affordances · ★★ · **Opportunistic / Later**
Drag-onto-`##`-heading tagging, hover-only outline drag handles, and Export buried in the File submenu
are all undiscoverable — the speed wins exist, users just can't find them. → Always-visible handles, a
drag-tag hint, promote Export. *Low.*

> *Not recommending:* a command-palette overhaul (`⌘K` already covers the long tail) or forcing the
> notes panel always-open (collapse is intentional for canvas focus) — **Skip both.**

---

## Top of stack (across all areas, by yield)
1. **F1** in-editor hotspot preview · Now — cheapest high-value win
2. **U1** faster symbol→Fact tagging · Now — the loop you hit most
3. **F2** active-recall study mode · Next — the strategic one
4. **U2** streamline outline tracing · Now/Next — second-heaviest loop
5. **F3** expand the symbol library · Next — more (and better) visual puns

*(P1 canvas empty state — formerly the top Polish pick — is already implemented and struck.)*
