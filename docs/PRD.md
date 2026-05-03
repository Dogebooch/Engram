# PRD — Mnemonic Editor (engram)

## Vision

A visual mnemonic scene editor for medical learners. Picmonic-quality output, Obsidian-native data, AI-ready architecture. Author scenes faster than Picmonic, study smarter, export cleanly to Anki.

## Primary user

Solo medical learner (the builder of this app). Heavy Anki + Obsidian user. Wants to author Sketchy/Picmonic-style mnemonic scenes for personal study and future video generation.

## Why this exists (problems with Picmonic)

- Locked-bounding-box "Facts" prevent fine sub-element positioning
- Single "character name" field collapses three distinct concepts (identity / meaning / encoding rationale)
- Wizard flow forces metadata before creative scene-building
- No structural sections within a Picmonic
- Random Giphy in a study tool violates symbol-dictionary discipline
- Destructive "Add Text to Image" — once added, cannot be modified
- Confusing nested left-rail navigation, deep clicking required for repeatable actions

## What's different here

1. **Independent-symbol model**: symbols are free-floating layers, Facts are tags. One symbol can be tagged with multiple Facts (the "wheelchair = stasis AND immobility AND vascular injury" pattern).
2. **Three-level hierarchy**: Picmonic → Sections → Facts → Symbols (matches how the user actually structures Sketchy notes).
3. **Three symbol metadata fields**: visual description, meaning, encoding rationale.
4. **Markdown-as-source-of-truth**: the structured Notes panel IS the data. No relational tables for content.
5. **Bidirectional canvas ↔ notes sync**: click symbol → highlight bullet, click bullet → highlight symbol.
6. **Three tagging UX paths**: drag (beginner), keyboard `F` (power user), right-click (fallback).
7. **Architecture-ready for v2** (audio, animation, video, AI-gen, cloud sync) without v1 UI.

## "Done" criteria for v1

- [x] Author a complete Picmonic (3+ Facts, 5+ Symbols) in under 10 minutes
- [x] Symbols are independently positioned and freely tagged with one or more Facts
- [x] Notes panel renders in user's Sketchy markdown format; edits sync bidirectionally
- [x] Click-reveal study mode works in both numbered-hotspot and sequential-timeline modes
- [ ] Exports: PNG (rasterized scene), Markdown notes file, Anki-compatible CSV

## Out of scope (v1)

- Multi-user collaboration
- Mobile / tablet
- Public sharing or marketplace
- Authoritative Anki card generation (export raw notes; user authors cards manually)
- Cloud sync / accounts
- Animated video output
- AI symbol generation

## v2+ (architecture is ready, no UI shipped)

- Audio narration per Fact (TTS or upload)
- Per-symbol animations with timeline
- Animated video export with synced narration
- Cloud sync (Supabase)
- AI symbol generation with reference styles
- Public Picmonic library / sharing

## Success metric (qualitative)

The user reaches for this tool instead of Picmonic when authoring a new mnemonic scene. Markdown output drops into Obsidian vault unchanged. Anki cards are easy to author from the export.
