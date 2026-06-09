import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { moveBulletToIndex } from "@/lib/notes/reorder-bullet";
import { moveFact, type MoveFactAnchor } from "@/lib/notes/move-fact";
import { moveSection, type MoveSectionAnchor } from "@/lib/notes/move-section";

/**
 * Pointer-drag reordering for the Form view, modeled on `symbol-row-drag.ts`:
 * a ghost follows the cursor, `document.elementFromPoint` resolves the drop over
 * `data-drag-*` targets, a drop-indicator line shows the landing spot, and on
 * release the matching `src/lib/notes/` helper rewrites the canonical markdown.
 */

const DRAG_THRESHOLD = 5;
const BODY_DRAGGING_ATTR = "data-engram-outline-dragging";

type Payload =
  | { kind: "row"; symbolId: string; fromFactId: string; label: string; imageUrl: string | null }
  | { kind: "fact"; factId: string; label: string }
  | { kind: "section"; sectionId: string; label: string };

type RowDrop = { kind: "row"; toFactId: string; toIndex: number };
type FactDrop =
  | { kind: "fact"; targetFactId: string; after: boolean }
  | { kind: "fact-into-section"; sectionId: string | null };
type SectionDrop = { kind: "section"; targetSectionId: string; after: boolean };
type Drop = RowDrop | FactDrop | SectionDrop;

function positionIndicator(indicator: HTMLElement, rect: DOMRect, after: boolean): void {
  indicator.style.display = "block";
  indicator.style.left = `${rect.left}px`;
  indicator.style.width = `${rect.width}px`;
  indicator.style.top = `${(after ? rect.bottom : rect.top) - 1}px`;
}

function resolveDrop(
  payload: Payload,
  x: number,
  y: number,
  indicator: HTMLElement,
): Drop | null {
  const el = document.elementFromPoint(x, y);
  if (!(el instanceof Element)) {
    indicator.style.display = "none";
    return null;
  }

  if (payload.kind === "row") {
    const row = el.closest("[data-drag-row]") as HTMLElement | null;
    if (row) {
      const toFactId = row.getAttribute("data-fact-id") ?? "";
      const idx = Number(row.getAttribute("data-bullet-index") ?? "0");
      const rect = row.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2;
      positionIndicator(indicator, rect, after);
      return { kind: "row", toFactId, toIndex: after ? idx + 1 : idx };
    }
    const fact = el.closest("[data-drag-fact]") as HTMLElement | null;
    if (fact) {
      const toFactId = fact.getAttribute("data-fact-id") ?? "";
      positionIndicator(indicator, fact.getBoundingClientRect(), true);
      return { kind: "row", toFactId, toIndex: Number.MAX_SAFE_INTEGER };
    }
    indicator.style.display = "none";
    return null;
  }

  if (payload.kind === "fact") {
    const factEl = el.closest("[data-drag-fact]") as HTMLElement | null;
    if (factEl) {
      const targetFactId = factEl.getAttribute("data-fact-id") ?? "";
      if (targetFactId === payload.factId) {
        indicator.style.display = "none";
        return null;
      }
      const rect = factEl.getBoundingClientRect();
      const after = y > rect.top + rect.height / 2;
      positionIndicator(indicator, rect, after);
      return { kind: "fact", targetFactId, after };
    }
    const secEl = el.closest("[data-drag-section]") as HTMLElement | null;
    if (secEl) {
      const sectionId = secEl.getAttribute("data-section-id") || null;
      const head = secEl.querySelector("[data-section-head]") as HTMLElement | null;
      positionIndicator(indicator, (head ?? secEl).getBoundingClientRect(), true);
      return { kind: "fact-into-section", sectionId };
    }
    indicator.style.display = "none";
    return null;
  }

  // section
  const secEl = el.closest("[data-drag-section]") as HTMLElement | null;
  if (secEl) {
    const targetSectionId = secEl.getAttribute("data-section-id") ?? "";
    if (targetSectionId === payload.sectionId) {
      indicator.style.display = "none";
      return null;
    }
    const rect = secEl.getBoundingClientRect();
    const after = y > rect.top + rect.height / 2;
    positionIndicator(indicator, rect, after);
    return { kind: "section", targetSectionId, after };
  }
  indicator.style.display = "none";
  return null;
}

function applyDrop(payload: Payload, drop: Drop): void {
  const st = useStore.getState();
  const cid = st.currentPicmonicId;
  if (!cid) return;
  const notes = st.picmonics[cid]?.notes ?? "";
  const parsed = parseNotes(notes);

  let newNotes = notes;
  let ok = false;

  if (payload.kind === "row" && drop.kind === "row") {
    const r = moveBulletToIndex(notes, parsed, payload.symbolId, payload.fromFactId, drop.toFactId, drop.toIndex);
    newNotes = r.newNotes;
    ok = r.ok;
  } else if (payload.kind === "fact") {
    let anchor: MoveFactAnchor | null = null;
    if (drop.kind === "fact-into-section") {
      anchor = { type: "section-end", sectionId: drop.sectionId };
    } else if (drop.kind === "fact") {
      const target = parsed.factsById.get(drop.targetFactId);
      if (target) {
        const siblings =
          target.sectionId == null
            ? parsed.rootFacts
            : (parsed.sections.find((s) => s.sectionId === target.sectionId)?.facts ?? []);
        const i = siblings.findIndex((f) => f.factId === drop.targetFactId);
        const next = siblings[i + 1];
        anchor = drop.after
          ? next
            ? { type: "before-fact", factId: next.factId }
            : { type: "section-end", sectionId: target.sectionId }
          : { type: "before-fact", factId: drop.targetFactId };
      }
    }
    if (anchor) {
      const r = moveFact(notes, parsed, payload.factId, anchor);
      newNotes = r.newNotes;
      ok = r.ok;
    }
  } else if (payload.kind === "section" && drop.kind === "section") {
    const i = parsed.sections.findIndex((s) => s.sectionId === drop.targetSectionId);
    const next = parsed.sections[i + 1];
    const anchor: MoveSectionAnchor = drop.after
      ? next
        ? { type: "before-section", sectionId: next.sectionId }
        : { type: "end" }
      : { type: "before-section", sectionId: drop.targetSectionId };
    const r = moveSection(notes, parsed, payload.sectionId, anchor);
    newNotes = r.newNotes;
    ok = r.ok;
  }

  if (ok && newNotes !== notes) {
    st.setLastSyncSource("editor");
    st.setNotes(cid, newNotes);
  }
}

export function beginOutlineDrag(payload: Payload, event: PointerEvent): void {
  const startX = event.clientX;
  const startY = event.clientY;
  let dragging = false;
  let ghost: HTMLElement | null = null;
  let indicator: HTMLElement | null = null;
  let drop: Drop | null = null;

  const start = () => {
    dragging = true;
    document.body.setAttribute(BODY_DRAGGING_ATTR, "");
    ghost = document.createElement("div");
    ghost.className = "eng-row-drag-ghost";
    ghost.style.pointerEvents = "none";
    if (payload.kind === "row" && payload.imageUrl) {
      const img = document.createElement("img");
      img.src = payload.imageUrl;
      img.alt = "";
      ghost.appendChild(img);
    }
    const text = document.createElement("span");
    text.textContent = payload.label;
    ghost.appendChild(text);
    document.body.appendChild(ghost);

    indicator = document.createElement("div");
    indicator.className = "eng-outline-drop";
    indicator.style.pointerEvents = "none";
    indicator.style.display = "none";
    document.body.appendChild(indicator);
  };

  const onMove = (ev: PointerEvent) => {
    if (!dragging) {
      if (
        Math.abs(ev.clientX - startX) < DRAG_THRESHOLD &&
        Math.abs(ev.clientY - startY) < DRAG_THRESHOLD
      ) {
        return;
      }
      start();
    }
    if (ghost) {
      ghost.style.transform = `translate(${ev.clientX + 12}px, ${ev.clientY + 14}px)`;
    }
    drop = indicator ? resolveDrop(payload, ev.clientX, ev.clientY, indicator) : null;
  };

  const onUp = () => {
    document.removeEventListener("pointermove", onMove);
    document.removeEventListener("pointerup", onUp);
    document.body.removeAttribute(BODY_DRAGGING_ATTR);
    ghost?.remove();
    indicator?.remove();
    if (dragging && drop) applyDrop(payload, drop);
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
}
