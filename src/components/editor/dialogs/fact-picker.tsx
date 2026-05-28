"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useStore } from "@/lib/store";
import { parseNotes } from "@/lib/notes/parse";
import { UNASSIGNED_FACT_NAME, type ParsedFact } from "@/lib/notes/types";

interface FactRow {
  factId: string;
  factName: string;
  sectionName: string | null;
  symbolCount: number;
  isUnassigned: boolean;
}

function buildRows(notes: string): FactRow[] {
  const parsed = parseNotes(notes);
  const rows: FactRow[] = [];
  for (const fact of parsed.factsById.values()) {
    rows.push({
      factId: fact.factId,
      factName: fact.name,
      sectionName: fact.sectionName,
      symbolCount: fact.symbolRefs.length,
      isUnassigned: fact.name === UNASSIGNED_FACT_NAME,
    });
  }
  // Order: by section appearance, then by heading line.
  const lineOf = (factId: string): number => {
    const f = parsed.factsById.get(factId) as ParsedFact | undefined;
    return f?.headingLine ?? 0;
  };
  rows.sort((a, b) => lineOf(a.factId) - lineOf(b.factId));
  return rows;
}

export function FactPicker() {
  const factPicker = useStore((s) => s.factPicker);
  const closeFactPicker = useStore((s) => s.closeFactPicker);
  const tagSymbolsWithFact = useStore((s) => s.tagSymbolsWithFact);
  const tagSymbolsWithNewFact = useStore((s) => s.tagSymbolsWithNewFact);
  const moveSymbolToFact = useStore((s) => s.moveSymbolToFact);
  const currentPicmonicId = useStore((s) => s.currentPicmonicId);
  const notes = useStore((s) =>
    currentPicmonicId ? (s.picmonics[currentPicmonicId]?.notes ?? "") : "",
  );

  const open = factPicker?.open ?? false;
  const mode = factPicker?.mode ?? "tag";
  const symbolIds = factPicker?.symbolIds ?? [];
  const fromFactId = factPicker?.fromFactId ?? null;

  const [query, setQuery] = React.useState("");
  const [prevOpen, setPrevOpen] = React.useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (!open) setQuery("");
  }

  const rows = React.useMemo(() => (open ? buildRows(notes) : []), [
    open,
    notes,
  ]);

  const trimmed = query.trim();
  // Show "Create new" only when:
  //  - query is non-empty
  //  - no existing fact has that exact name (case-insensitive)
  //  - the query isn't the reserved Unassigned name
  const showCreateNew = React.useMemo(() => {
    if (mode === "move") return false;
    if (!trimmed) return false;
    if (trimmed.toLowerCase() === UNASSIGNED_FACT_NAME.toLowerCase()) return false;
    const target = trimmed.toLowerCase();
    return !rows.some((r) => r.factName.trim().toLowerCase() === target);
  }, [mode, rows, trimmed]);

  const onPickExisting = (row: FactRow) => {
    if (mode === "move") {
      const moved =
        fromFactId != null && symbolIds.length === 1
          ? moveSymbolToFact(symbolIds[0], fromFactId, row.factId)
          : false;
      closeFactPicker();
      toast(moved ? "Moved" : "Already there", {
        description: row.factName,
        duration: 1400,
      });
      return;
    }

    const wrote = tagSymbolsWithFact(symbolIds, row.factId);
    closeFactPicker();
    toast(wrote ? "Tagged" : "Already tagged", {
      description: row.factName,
      duration: 1400,
    });
  };

  const onCreate = () => {
    if (!trimmed) return;
    const factId = tagSymbolsWithNewFact(symbolIds, trimmed);
    closeFactPicker();
    if (factId) {
      toast("Tagged", { description: trimmed, duration: 1400 });
    }
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) closeFactPicker();
      }}
      title={mode === "move" ? "Move to Fact" : "Tag with Fact"}
      description={
        mode === "move"
          ? "Pick where this symbol row should live."
          : "Pick an existing Fact or create a new one."
      }
      className="eng-fact-picker"
    >
      <Command shouldFilter>
      <CommandInput
        placeholder={
          mode === "move"
            ? "Pick a Fact to move to..."
            : rows.length > 0
            ? "Filter Facts, or type a new name…"
            : "Type a name to create your first Fact…"
        }
        value={query}
        onValueChange={setQuery}
      />
      <div className="eng-fact-picker__hint" aria-hidden>
        <span>
          {mode === "move"
            ? "move row"
            : symbolIds.length > 1
            ? `${symbolIds.length} symbols`
            : "1 symbol"}
        </span>
        <span className="eng-fact-picker__hint-sep">·</span>
        <span>
          ↵ <span className="opacity-60">{mode === "move" ? "move" : "tag"}</span>
        </span>
        <span className="eng-fact-picker__hint-sep">·</span>
        <span>
          esc <span className="opacity-60">close</span>
        </span>
      </div>
      <CommandList className="eng-fact-picker__list">
        {rows.length === 0 && !showCreateNew ? (
          <CommandEmpty>
            <span className="eng-fact-picker__empty">
              <span className="eng-fact-picker__empty-caret">▍</span>
              {mode === "move"
                ? "no other Facts yet"
                : "type a name to create your first Fact"}
            </span>
          </CommandEmpty>
        ) : null}
        {rows.length > 0 ? (
          <CommandGroup heading="Facts">
            {rows.map((row) => (
              <CommandItem
                key={row.factId}
                value={`${row.sectionName ?? ""} ${row.factName}`}
                onSelect={() => onPickExisting(row)}
                className="eng-fact-picker__item"
              >
                <div className="eng-fact-picker__row">
                  {row.sectionName && (
                    <span className="eng-fact-picker__section">
                      {row.sectionName}
                    </span>
                  )}
                  <span
                    className="eng-fact-picker__name"
                    data-unassigned={row.isUnassigned ? "" : undefined}
                  >
                    {row.factName}
                  </span>
                </div>
                <span className="eng-fact-picker__count" aria-label="symbols tagged">
                  {row.symbolCount}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        ) : null}
        {showCreateNew ? (
          <CommandGroup heading="Create">
            <CommandItem
              key={`__create__${trimmed}`}
              value={`__create__${trimmed}`}
              onSelect={onCreate}
              className="eng-fact-picker__item eng-fact-picker__item--create"
            >
              <span className="eng-fact-picker__plus">+</span>
              <span className="eng-fact-picker__row">
                <span className="eng-fact-picker__create-label">
                  create new fact
                </span>
                <span className="eng-fact-picker__create-name">
                  {trimmed}
                </span>
              </span>
            </CommandItem>
          </CommandGroup>
        ) : null}
      </CommandList>
      </Command>
    </CommandDialog>
  );
}
