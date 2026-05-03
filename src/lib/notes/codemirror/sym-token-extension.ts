import {
  Decoration,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
  type DecorationSet,
} from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";

const SYM_TOKEN_RE =
  /\{sym:([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\}/gi;

export interface ResolvedSymbolChip {
  displayName: string;
  imageUrl: string | null;
  broken: boolean;
}

export type SymbolChipResolver = (uuid: string) => ResolvedSymbolChip;

const defaultResolver: SymbolChipResolver = () => ({
  displayName: "symbol",
  imageUrl: null,
  broken: false,
});

let activeResolver: SymbolChipResolver = defaultResolver;
let activeOnSelect: ((uuid: string) => void) | null = null;
let activeOnBrokenClick: ((uuid: string) => void) | null = null;
let activeOnDoubleClick:
  | ((uuid: string, offset: number, anchor: DOMRect) => void)
  | null = null;
let activeOnContextMenu:
  | ((uuid: string, offset: number, x: number, y: number, anchor: DOMRect) => void)
  | null = null;
let activeOnHoverChange: ((uuid: string | null) => void) | null = null;

export function setSymbolChipResolver(resolver: SymbolChipResolver): void {
  activeResolver = resolver;
}

export function setSymbolChipOnSelect(handler: (uuid: string) => void): void {
  activeOnSelect = handler;
}

/**
 * Registered handler for clicks on broken (red `[missing]`) chips. Fires
 * immediately — bypasses the single/double click delay because broken chips
 * have no description to edit.
 */
export function setSymbolChipOnBrokenClick(
  handler: (uuid: string) => void,
): void {
  activeOnBrokenClick = handler;
}

/**
 * Double-click on a non-broken chip → open the description popover.
 * `offset` = byte offset of the chip's `{sym:UUID}` token start in the
 * notes string, used by the popover to locate which bullet's description
 * to edit (a uuid may appear in multiple bullets via multi-tag).
 */
export function setSymbolChipOnDoubleClick(
  handler: (uuid: string, offset: number, anchor: DOMRect) => void,
): void {
  activeOnDoubleClick = handler;
}

/**
 * Right-click on any chip → open the chip context menu. `offset` carries
 * the same multi-tag-disambiguating role as in onDoubleClick.
 */
export function setSymbolChipOnContextMenu(
  handler: (uuid: string, offset: number, x: number, y: number, anchor: DOMRect) => void,
): void {
  activeOnContextMenu = handler;
}

export function setSymbolChipOnHoverChange(
  handler: (uuid: string | null) => void,
): void {
  activeOnHoverChange = handler;
}

const DOUBLE_CLICK_WINDOW_MS = 280;

/**
 * Lazy delegate that reads the chip span's byte offset from a `data-chip-offset`
 * attribute set by the surrounding ViewPlugin when it builds the decoration
 * range (see `buildDecorations`). The decoration range maps DOM atomic ranges
 * to doc offsets, so we stash the start offset here so click handlers can
 * round-trip into a `setNotes` mutation that targets the exact bullet line
 * (necessary for multi-tagged uuids).
 */
function readChipOffset(span: HTMLElement): number {
  const raw = span.dataset.chipOffset;
  return raw ? Number.parseInt(raw, 10) || 0 : 0;
}

class SymbolChipWidget extends WidgetType {
  constructor(
    readonly uuid: string,
    readonly resolved: ResolvedSymbolChip,
    readonly from: number,
    readonly to: number,
  ) {
    super();
  }

  override eq(other: SymbolChipWidget): boolean {
    return (
      other.uuid === this.uuid &&
      other.resolved.displayName === this.resolved.displayName &&
      other.resolved.imageUrl === this.resolved.imageUrl &&
      other.resolved.broken === this.resolved.broken &&
      other.from === this.from &&
      other.to === this.to
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "eng-sym-chip";
    span.dataset.symId = this.uuid;
    span.dataset.chipOffset = String(this.from);
    span.dataset.chipEnd = String(this.to);
    span.setAttribute("role", "button");
    span.setAttribute("tabindex", "-1");

    const resolved = this.resolved;

    if (resolved.broken) {
      span.classList.add("eng-sym-chip-broken");
      const dot = document.createElement("span");
      dot.className = "eng-sym-chip__dot";
      span.appendChild(dot);
      const label = document.createElement("span");
      label.className = "eng-sym-chip__label";
      label.textContent = "missing";
      span.appendChild(label);
      span.title = `Symbol ${this.uuid.slice(0, 8)}… not on canvas`;
    } else {
      if (resolved.imageUrl) {
        const img = document.createElement("img");
        img.className = "eng-sym-chip__img";
        img.src = resolved.imageUrl;
        img.alt = "";
        img.draggable = false;
        img.loading = "lazy";
        span.appendChild(img);
      }
      const label = document.createElement("span");
      label.className = "eng-sym-chip__label";
      label.textContent = resolved.displayName;
      span.appendChild(label);
      span.title = resolved.displayName;
    }

    // Click handling on chips:
    //   • Broken chips: single click → open the swap-broken picker. Fires
    //     immediately on mousedown (no delay, no dblclick window) since
    //     broken chips have no description to edit.
    //   • Normal chips: defer the single-click action through a short
    //     window so a real dblclick can override it. mousedown still
    //     preventDefaults so CodeMirror doesn't move the cursor into the
    //     atomic chip range.
    let pendingSingleClick: ReturnType<typeof setTimeout> | null = null;
    span.addEventListener("mousedown", (e) => {
      // Only handle left-click here. Right-click is handled by contextmenu.
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      if (resolved.broken) {
        if (activeOnBrokenClick) activeOnBrokenClick(this.uuid);
        else activeOnSelect?.(this.uuid);
        return;
      }
      if (pendingSingleClick) clearTimeout(pendingSingleClick);
      pendingSingleClick = setTimeout(() => {
        pendingSingleClick = null;
        activeOnSelect?.(this.uuid);
      }, DOUBLE_CLICK_WINDOW_MS);
    });
    span.addEventListener("dblclick", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pendingSingleClick) {
        clearTimeout(pendingSingleClick);
        pendingSingleClick = null;
      }
      if (resolved.broken) {
        // dblclick on broken chip: same as the single-click swap action.
        activeOnBrokenClick?.(this.uuid);
        return;
      }
      const anchor = span.getBoundingClientRect();
      const offset = readChipOffset(span);
      activeOnDoubleClick?.(this.uuid, offset, anchor);
    });
    span.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (pendingSingleClick) {
        clearTimeout(pendingSingleClick);
        pendingSingleClick = null;
      }
      const anchor = span.getBoundingClientRect();
      const offset = readChipOffset(span);
      activeOnContextMenu?.(
        this.uuid,
        offset,
        e.clientX,
        e.clientY,
        anchor,
      );
    });
    span.addEventListener("mouseenter", () => {
      activeOnHoverChange?.(this.uuid);
    });
    span.addEventListener("mouseleave", () => {
      activeOnHoverChange?.(null);
    });

    return span;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

function isInsideCode(view: EditorView, pos: number): boolean {
  const node = syntaxTree(view.state).resolveInner(pos, 1);
  for (let n: typeof node | null = node; n; n = n.parent) {
    const name = n.type.name;
    if (
      name === "FencedCode" ||
      name === "InlineCode" ||
      name === "CodeBlock" ||
      name === "CodeText"
    ) {
      return true;
    }
  }
  return false;
}

function buildDecorations(view: EditorView): DecorationSet {
  const decorations: { from: number; to: number; deco: Decoration }[] = [];
  for (const { from, to } of view.visibleRanges) {
    const text = view.state.doc.sliceString(from, to);
    SYM_TOKEN_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = SYM_TOKEN_RE.exec(text))) {
      const matchFrom = from + m.index;
      const matchTo = matchFrom + m[0].length;
      if (isInsideCode(view, matchFrom)) continue;
      const uuid = m[1].toLowerCase();
      const resolved = activeResolver(uuid);
      const deco = Decoration.replace({
        widget: new SymbolChipWidget(uuid, resolved, matchFrom, matchTo),
        inclusive: false,
      });
      decorations.push({ from: matchFrom, to: matchTo, deco });
    }
  }
  return Decoration.set(
    decorations.map(({ from, to, deco }) => deco.range(from, to)),
    true,
  );
}

export const symbolChipExtension = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildDecorations(view);
    }
    update(u: ViewUpdate) {
      // Rebuild on doc/viewport changes (normal CM lifecycle) and on any
      // explicit external dispatch (e.g. canvas-symbols-changed, library-loaded
      // signals from React) so chip resolver state reflects latest store state.
      if (u.docChanged || u.viewportChanged || u.transactions.length > 0) {
        this.decorations = buildDecorations(u.view);
      }
    }
  },
  {
    decorations: (v) => v.decorations,
    provide: (plugin) =>
      EditorView.atomicRanges.of((view) => {
        const p = view.plugin(plugin);
        return p ? p.decorations : Decoration.none;
      }),
  },
);
