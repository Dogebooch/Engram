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
  /**
   * `"library"` (or absent — back-compat) renders the existing image-or-name
   * chip. `"region"` renders an inline polygon glyph + "region" label, so
   * users can distinguish trace bullets from icon bullets at a glance.
   */
  kind?: "library" | "region";
}

export type SymbolChipResolver = (uuid: string) => ResolvedSymbolChip;

const defaultResolver: SymbolChipResolver = () => ({
  displayName: "symbol",
  imageUrl: null,
  broken: false,
});

let activeResolver: SymbolChipResolver = defaultResolver;
let activeOnSelect: ((uuid: string) => void) | null = null;
let activeOnHoverChange: ((uuid: string | null) => void) | null = null;

export function setSymbolChipResolver(resolver: SymbolChipResolver): void {
  activeResolver = resolver;
}

export function setSymbolChipOnSelect(handler: (uuid: string) => void): void {
  activeOnSelect = handler;
}

export function setSymbolChipOnHoverChange(
  handler: (uuid: string | null) => void,
): void {
  activeOnHoverChange = handler;
}

class SymbolChipWidget extends WidgetType {
  constructor(
    readonly uuid: string,
    readonly resolved: ResolvedSymbolChip,
  ) {
    super();
  }

  override eq(other: SymbolChipWidget): boolean {
    return (
      other.uuid === this.uuid &&
      other.resolved.displayName === this.resolved.displayName &&
      other.resolved.imageUrl === this.resolved.imageUrl &&
      other.resolved.broken === this.resolved.broken &&
      (other.resolved.kind ?? "library") === (this.resolved.kind ?? "library")
    );
  }

  override toDOM(): HTMLElement {
    const span = document.createElement("span");
    span.className = "eng-sym-chip";
    span.dataset.symId = this.uuid;
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
    } else if (resolved.kind === "region") {
      span.classList.add("eng-sym-chip-region");
      // Inline SVG polygon glyph — irregular pentagon to read as "traced
      // shape" rather than "geometric icon". Stroke-only matches the
      // canvas region's visual: an outline, not a filled object.
      const glyph = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "svg",
      );
      glyph.setAttribute("class", "eng-sym-chip__glyph");
      glyph.setAttribute("viewBox", "0 0 16 16");
      glyph.setAttribute("aria-hidden", "true");
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "polygon",
      );
      path.setAttribute("points", "3,5 8,2 13,4 14,11 9,14 4,12 2,8");
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.4");
      path.setAttribute("stroke-linejoin", "round");
      glyph.appendChild(path);
      span.appendChild(glyph);
      const label = document.createElement("span");
      label.className = "eng-sym-chip__label";
      label.textContent = resolved.displayName || "region";
      span.appendChild(label);
      span.title = "Traced region";
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

    span.addEventListener("mousedown", (e) => {
      e.preventDefault();
      e.stopPropagation();
      activeOnSelect?.(this.uuid);
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
        widget: new SymbolChipWidget(uuid, resolved),
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
