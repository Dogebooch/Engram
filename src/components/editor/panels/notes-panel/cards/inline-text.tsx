"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface InlineTextProps {
  value: string;
  placeholder?: string;
  ariaLabel: string;
  className?: string;
  inputClassName?: string;
  /** Called with the trimmed next value. Returning early on no-op is the caller's job. */
  onCommit: (next: string) => void;
}

/**
 * Click-to-edit text primitive. Display mode renders a transparent button
 * showing the value (or placeholder if empty); click swaps to a focused
 * input with the value selected. Enter/blur commits, Esc reverts.
 *
 * Used for fact name, section name, and symbol description in the cards
 * panel. The keydown/blur idiom mirrors the deleted DescriptionPopover so
 * we keep the hardened "cancel via ref so blur skips commit" behavior.
 */
export function InlineText({
  value,
  placeholder,
  ariaLabel,
  className,
  inputClassName,
  onCommit,
}: InlineTextProps) {
  const [editing, setEditing] = React.useState(false);
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const cancelledRef = React.useRef(false);

  React.useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, [editing]);

  const enter = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    cancelledRef.current = false;
    setEditing(true);
  }, []);

  const commit = React.useCallback(
    (next: string) => {
      const trimmed = next.trim();
      // Empty-name commits are dropped by the helper (returns input unchanged);
      // here we still let the caller decide whether to write. Suppress no-op
      // writes to keep undo history clean.
      if (trimmed !== value.trim()) onCommit(trimmed);
      setEditing(false);
    },
    [value, onCommit],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      commit(e.currentTarget.value);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      cancelledRef.current = true;
      setEditing(false);
    }
  };

  const onBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (cancelledRef.current) return;
    commit(e.currentTarget.value);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        defaultValue={value}
        className={cn("eng-inline-text__input", inputClassName)}
        aria-label={ariaLabel}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
        onClick={(e) => e.stopPropagation()}
        spellCheck
        autoComplete="off"
        placeholder={placeholder}
      />
    );
  }

  const empty = value.trim().length === 0;
  return (
    <button
      type="button"
      className={cn(
        "eng-inline-text",
        empty && "eng-inline-text--empty",
        className,
      )}
      onClick={enter}
      aria-label={`${ariaLabel} (click to edit)`}
    >
      {empty ? placeholder ?? "" : value}
    </button>
  );
}
