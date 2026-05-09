import { useStore } from "@/lib/store";
import { newId } from "@/lib/id";
import { formatBulletBody } from "@/lib/notes/bullet";
import type { SymbolLayer } from "@/lib/types/canvas";
import { PE_SEED } from "@/scripts/seed-pe-labels";

const REGION_REF = "region:rect";

/**
 * Atomically rewrite the current Picmonic's `notes` and `canvas.symbols` from
 * the PE seed dataset. Backdrop, groups, factHotspots, factMeta, and timeline
 * are preserved. One `setState` call → one zundo entry → undoable in one step.
 *
 * Returns the count of bullets seeded, or null if no Picmonic is open.
 *
 * Temporary helper. Removed alongside `seed-pe-labels.ts`.
 */
export function applyPESeed(): number | null {
  const state = useStore.getState();
  const id = state.currentPicmonicId;
  if (!id) return null;
  const existing = state.picmonics[id];
  if (!existing) return null;

  const noteLines: string[] = [];
  const symbols: SymbolLayer[] = [];
  let layerIndex = 0;

  for (const section of PE_SEED) {
    noteLines.push(`# ${section.name}`);
    for (const fact of section.facts) {
      noteLines.push(`## ${fact.name}`);
      for (const b of fact.bullets) {
        const layerId = newId();
        const body = formatBulletBody({
          description: b.description,
          meaning: b.meaning,
          encoding: b.encoding,
        });
        noteLines.push(`* {sym:${layerId}} ${body}`);
        symbols.push({
          id: layerId,
          ref: REGION_REF,
          x: b.x,
          y: b.y,
          width: b.width,
          height: b.height,
          rotation: 0,
          layerIndex: layerIndex++,
          groupId: null,
          animation: null,
          animationDelay: null,
          animationDuration: null,
        });
      }
      noteLines.push("");
    }
  }

  const newNotes = noteLines.join("\n").replace(/\n+$/, "") + "\n";

  useStore.setState((s) => {
    const cur = s.picmonics[id];
    if (!cur) return s;
    return {
      picmonics: {
        ...s.picmonics,
        [id]: {
          ...cur,
          notes: newNotes,
          canvas: { ...cur.canvas, symbols },
          meta: { ...cur.meta, updatedAt: Date.now() },
        },
      },
    };
  });

  return symbols.length;
}
