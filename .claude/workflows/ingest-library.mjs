export const meta = {
  name: 'ingest-library',
  description:
    'Autopilot: ingest pending mnemonic videos into Engram .engram.zip bundles — one fresh subagent per video, free lint gate (lint_draft.py), cheap-author (Sonnet) with difficulty-routed Opus and escalate-the-tail. Builds steps 1–6 only; dev-app import stays manual.',
  whenToUse:
    'Bulk/unattended building of the Engram library from the MVS-derived ingest queue. Pass {videos:[...]} for an explicit set or {batch:{count,source,course}} to pull from ingest_queue.py.',
  phases: [
    { title: 'Author', detail: 'Sonnet authors facts-only per video (Opus up-front when dense/forced), runs lint_draft.py, builds the zip if the lint is clean', model: 'sonnet' },
    { title: 'Escalate', detail: 'Opus re-authors the lint-flagged / under-extracted / pan tail with the critique injected', model: 'opus' },
    { title: 'Report', detail: 'flag the unresolved videos for review and return the ledger' },
  ],
}

const PROJECT = 'P:\\Python Projects\\Engram\\engram'
const DEFAULT_OUT_ROOT = 'P:\\Python Projects\\Engram\\video-ingest-runs'
const PY = `${PROJECT}\\.venv-video-ingest\\Scripts\\python.exe`
const TOOLS = `${PROJECT}\\tools\\video-ingest`

let input = args
if (typeof input === 'string') {
  try {
    input = JSON.parse(input)
  } catch (e) {
    input = {}
  }
}
input = input || {}
const outRoot = input.outRoot || DEFAULT_OUT_ROOT

const AUTHOR_SCHEMA = {
  type: 'object',
  required: ['slug', 'built', 'symbolCount', 'sceneKind', 'lint'],
  properties: {
    slug: { type: 'string' },
    built: { type: 'boolean' },
    backdropUsable: { type: 'boolean' },
    zipPath: { type: ['string', 'null'] },
    backdropIndex: { type: 'integer' },
    symbolCount: { type: 'integer' },
    factCount: { type: 'integer' },
    sceneKind: { type: 'string', enum: ['tableau', 'picmonic', 'pan', 'unknown'] },
    caveats: { type: 'array', items: { type: 'string' } },
    lint: {
      type: 'object',
      required: ['ok', 'errorCodes', 'warningCodes'],
      properties: {
        ok: { type: 'boolean' },
        errorCodes: { type: 'array', items: { type: 'string' } },
        warningCodes: { type: 'array', items: { type: 'string' } },
        symbols: { type: 'integer' },
        segments: { type: 'integer' },
      },
    },
    notes: { type: 'string' },
  },
}

const PULL_SCHEMA = {
  type: 'object',
  required: ['videos'],
  properties: { videos: { type: 'array', items: { type: 'object' } } },
}

function authorPrompt(video, critique) {
  const runDir = `${outRoot}\\${video.slug}`
  const modelTag = critique ? 'claude-opus-escalated' : 'claude-facts-only'
  return [
    `You are the vision model ingesting ONE mnemonic study video into Engram, facts-only. Work from ${PROJECT} and run shell commands with the PowerShell tool (this is Windows — backslash paths).`,
    ``,
    `VIDEO`,
    `- title: ${video.title}`,
    `- source: ${video.source}`,
    `- mvs id: ${video.id}`,
    `- file: ${video.path}`,
    `- slug: ${video.slug}`,
    `- run dir: ${runDir}`,
    ``,
    `Author this ONE video facts-only by following these self-contained steps exactly (do not open other docs):`,
    ``,
    `1. EXTRACT FRAMES (no transcript, no context frames):`,
    `   ${PY} ${TOOLS}\\ingest_video.py --video "${video.path}" --out-root "${outRoot}" --skip-transcript --no-context`,
    `   Then Read ${runDir}\\keyframes.json. If it has <= 2 keyframes (static scene — common on Picmonic), re-extract a spread:`,
    `   ${PY} ${TOOLS}\\ingest_video.py --video "${video.path}" --out-root "${outRoot}" --skip-transcript --no-context --sample-seconds 2 --min-gap-seconds 3 --diff-threshold 0 --max-keyframes 18`,
    ``,
    `2. TRANSCRIPT + OCR from the MVS index (writes transcript.json AND ocr.json):`,
    `   ${PY} ${TOOLS}\\mvs_transcript.py --run-dir "${runDir}" --video-id ${video.id}`,
    ``,
    `3. Read ${runDir}\\transcript.json — it is the SPINE. The narration names EVERY symbol and its meaning in order; list every one (you cannot miss a symbol the narrator names). Silently fix obvious ASR slips (e.g. "tetrahydrofluoric" -> tetrahydrofolate).`,
    ``,
    `3b. Read ${runDir}\\ocr.json (MVS's on-screen text: Picmonic's numbered fact sidebar; Sketchy's symbol->meaning labels e.g. "Splendid passenger = Splenic vein"). Use it as a SECONDARY completeness + accuracy cross-check — confirm you captured every symbol/fact it lists and that your meanings agree with its labels. It is noisy (watermarks, OCR garble) and is NOT evidence: keep every evidence quote grounded in transcript.json.`,
    ``,
    `4. The backdrop is AUTO-SELECTED (the keyframe with "selected_as_backdrop": true in ${runDir}\\keyframes.json — the latest colourful frame, which already skips Picmonic end text-review pages). Read ONLY that one frame to: (a) confirm it shows the full scene, (b) note where each symbol sits for the descriptions, (c) set sceneKind and check coverage:`,
    `   - tableau (most Sketchy/Pixorize): the one frame holds every symbol — good.`,
    `   - pan: the narration names symbols NOT visible on this frame — author only the visible ones, list the rest in caveats, and set sceneKind:"pan".`,
    `   Trust the auto-pick. Only if it is clearly wrong (cut off, or a mostly-text page) read 1-2 other frames in ${runDir}\\frames\\ and override with --backdrop-index N — do NOT scan the whole spread.`,
    `   If the frame is black/blank/corrupt (a .mov codec failure), set backdropUsable=false and note it in caveats — still author from the transcript and build; the backdrop needs manual replacement.`,
    ``,
    `5. Author ${runDir}\\draft_symbols.json (Write tool): {"model":"${modelTag}","symbols":[ ... ]}. Facts-only schema, NO geometry (no bbox/polygon/point):`,
    `   {"order":0,"fact":"short clinical fact","symbol_key":"kebab-handle","symbol_description":"concrete visible object + where it sits on the backdrop","meaning":"what it encodes","evidence":"Transcript @m:ss \\"exact quote copied from transcript.json\\" — why this mapping holds","timestamp_ms":54000}`,
    `   - ALWAYS set symbol_key (kebab-case). Reuse the same symbol_key across two records to encode two facts with one symbol.`,
    `   - evidence MUST contain an EXACT quoted span copied verbatim from transcript.json plus the @m:ss stamp — the lint verifies the quote against the transcript, so do not paraphrase inside the quotes.`,
    `   - Consult ${TOOLS}\\glossary.json for consistent symbol_key/meaning on recurring visual puns.`,
    `   - Capture EVERY narrated symbol. Dense SOAP scenes name 40+ across S/O/A/P — author the full set; if you cover only part, say which in caveats.`,
    ``,
    `6. LINT (the gate):`,
    `   ${PY} ${TOOLS}\\lint_draft.py --run-dir "${runDir}"`,
    `   Read its JSON. If ok:false, FIX draft_symbols.json and re-lint until clean or you genuinely cannot (then report the remaining error codes). Treat a "possible-under-extraction" warning as a strong sign you dropped symbols — re-scan the transcript before continuing.`,
    ``,
    `7. BUILD only if the lint is ok:true:`,
    `   ${PY} ${TOOLS}\\ingest_video.py --video "${video.path}" --out-root "${outRoot}" --reuse-run --draft-symbols "${runDir}\\draft_symbols.json" --backdrop-index <N>`,
    `   Output: ${runDir}\\${video.slug}.engram.zip. Do NOT import into the dev app.`,
    ``,
    critique ? `ESCALATION PASS — a prior attempt was insufficient. ${critique} Re-author from the transcript and fix it.` : ``,
    ``,
    `RETURN (StructuredOutput, this is data for the orchestrator not a human message): slug, built (was the .engram.zip written), backdropUsable (false if the backdrop frame is black/corrupt), zipPath, backdropIndex, symbolCount, factCount, sceneKind, caveats[], and lint:{ok,errorCodes[],warningCodes[],symbols,segments} copied from the final lint JSON, plus a short notes string.`,
  ].join('\n')
}

// Reasons a stronger re-author can actually fix → worth escalating to Opus.
function escalateReason(a) {
  if (!a) return 'author-failed'
  const lint = a.lint || {}
  if (!a.built) return (lint.errorCodes || []).length ? `lint-errors:${lint.errorCodes.join('|')}` : 'not-built'
  if ((lint.warningCodes || []).includes('possible-under-extraction')) return 'under-extraction'
  return null
}

// Built, but a human is needed — re-authoring can't help (no single frame holds it, or bad backdrop).
function reviewReason(a) {
  if (!a) return null
  if (a.backdropUsable === false) return 'backdrop-unusable'
  if (a.sceneKind === 'pan' || (a.caveats || []).some((c) => /\bpan\b/i.test(c))) return 'pan-coverage'
  return null
}

function critiqueFrom(a, reason) {
  const parts = [`Reason: ${reason}.`]
  if (a && a.lint && (a.lint.errorCodes || []).length) parts.push(`Lint errors to clear: ${a.lint.errorCodes.join(', ')}.`)
  if (reason === 'under-extraction') parts.push(`The prior pass captured only ${a ? a.symbolCount : 0} symbols on a dense scene; the narrator names many more. Re-read the transcript end to end and capture EVERY named symbol across all sections.`)
  if (reason === 'pan-coverage') parts.push(`This is a panning scene: author only symbols visible on the chosen backdrop and list the rest in caveats.`)
  if (a && a.notes) parts.push(`Prior notes: ${a.notes}`)
  return parts.join(' ')
}

function attempt(video, model, critique) {
  return agent(authorPrompt(video, critique), {
    label: `${model}:${video.slug}`,
    phase: critique ? 'Escalate' : 'Author',
    model,
    schema: AUTHOR_SCHEMA,
  })
}

async function processVideo(video) {
  try {
    const primary = video.forceModel || (video.dense ? 'opus' : 'sonnet')
    const history = []

    let a = await attempt(video, primary, null)
    history.push({ model: primary, built: !!(a && a.built), symbols: a ? a.symbolCount : 0 })
    let esc = escalateReason(a)

    if (esc) {
      // Sonnet that tripped a fixable flag escalates to Opus; an Opus primary gets one Opus retry on hard lint errors.
      const allow = primary === 'sonnet' || (a && a.lint && !a.lint.ok)
      if (allow) {
        const b = await attempt(video, 'opus', critiqueFrom(a, esc))
        history.push({ model: primary === 'sonnet' ? 'opus' : 'opus-retry', built: !!(b && b.built), symbols: b ? b.symbolCount : 0, escalatedFor: esc })
        a = b
        esc = escalateReason(b)
      }
    }

    const built = !!(a && a.built && (a.lint ? a.lint.ok : true))
    const rev = reviewReason(a)
    const reason = esc || rev
    const status = !built ? 'failed' : reason ? 'review' : 'ok'
    return {
      slug: video.slug,
      videoId: video.id,
      source: video.source,
      title: video.title,
      status,
      built,
      zipPath: a ? a.zipPath || null : null,
      finalModel: history.length ? history[history.length - 1].model : 'none',
      escalated: history.length > 1,
      symbolCount: a ? a.symbolCount : 0,
      sceneKind: a ? a.sceneKind : 'unknown',
      caveats: a ? a.caveats || [] : [],
      lint: a ? a.lint || null : null,
      unresolvedReason: reason || (built ? null : 'author-failed'),
      history,
    }
  } catch (e) {
    return {
      slug: video.slug,
      videoId: video.id,
      source: video.source,
      title: video.title,
      status: 'failed',
      built: false,
      unresolvedReason: `exception: ${(e && e.message) || e}`,
      history: [],
    }
  }
}

function queueUpdatePrompt(ok, flagged) {
  const note = (s) => String(s || '').replace(/["\n]/g, ' ').slice(0, 120)
  const cmds = [
    ...ok.map((r) => `${PY} ${TOOLS}\\ingest_queue.py ready ${r.videoId} --note "autopilot ok: ${r.symbolCount} symbols"`),
    ...flagged.map((r) => `${PY} ${TOOLS}\\ingest_queue.py flag ${r.videoId} --note "autopilot ${r.status}: ${note(r.unresolvedReason)}"`),
    `${PY} ${TOOLS}\\ingest_queue.py ready-list --write`,
  ]
  return [
    `Run each of these queue commands in order from ${PROJECT} with the PowerShell tool, then return "updated ${ok.length} ready / ${flagged.length} flagged":`,
    ``,
    ...cmds,
  ].join('\n')
}

// --- run -------------------------------------------------------------------
phase('Author')

let videos = input.videos
if (!videos) {
  const batch = input.batch || { count: 5 }
  const scope = [
    `--count ${batch.count || 5}`,
    batch.source ? `--source "${batch.source}"` : '',
    batch.course ? `--course "${batch.course}"` : '',
  ]
    .filter(Boolean)
    .join(' ')
  const pulled = await agent(
    `Run this from ${PROJECT} with the PowerShell tool and return its parsed JSON videos array:\n${PY} ${TOOLS}\\ingest_queue.py next ${scope}`,
    { label: 'queue:pull', phase: 'Author', model: 'haiku', schema: PULL_SCHEMA },
  )
  videos = (pulled && pulled.videos) || []
}

log(`Ingesting ${videos.length} video(s) — fresh subagent each, Sonnet-author + Opus-escalate.`)

const results = (await parallel(videos.map((v) => () => processVideo(v)))).filter(Boolean)

const ok = results.filter((r) => r.status === 'ok')
const review = results.filter((r) => r.status === 'review')
const failed = results.filter((r) => r.status === 'failed')
if (ok.length || review.length || failed.length) {
  phase('Report')
  await agent(queueUpdatePrompt(ok, [...review, ...failed]), { label: 'queue:update', phase: 'Report', model: 'haiku' })
}

log(`Done: ${ok.length} ready, ${review.length} built-but-flagged, ${failed.length} failed.`)

return {
  built: results.filter((r) => r.built).length,
  ok: ok.length,
  review: review.length,
  failed: failed.length,
  ledger: results.map((r) => ({
    slug: r.slug,
    status: r.status,
    finalModel: r.finalModel,
    escalated: r.escalated,
    symbols: r.symbolCount,
    sceneKind: r.sceneKind,
    zipPath: r.zipPath,
    caveats: r.caveats,
    unresolvedReason: r.unresolvedReason,
  })),
}
