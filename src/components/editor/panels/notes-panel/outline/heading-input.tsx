"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

interface HeadingInputProps {
  /** Current committed name (from the parsed heading). */
  value: string;
  /** Called with a non-empty, changed name on blur/Enter. */
  onCommit: (name: string) => void;
  autoFocus?: boolean;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Inline-editable heading title. Keeps a local draft while focused; commits on
 * blur or Enter (ignored if blank or unchanged), reverts on Escape. The parent
 * owns the markdown rewrite via `setHeadingText`.
 */
export function HeadingInput({
  value,
  onCommit,
  autoFocus,
  className,
  placeholder,
  "aria-label": ariaLabel,
}: HeadingInputProps) {
  const [draft, setDraft] = React.useState(value);
  const ref = React.useRef<HTMLInputElement>(null);

  // Resync the draft when the committed name changes externally (rename via
  // another surface). Render-phase adjustment — no setState-in-effect.
  const [prevValue, setPrevValue] = React.useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value);
  }

  React.useEffect(() => {
    if (autoFocus) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [autoFocus]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed || trimmed === value) {
      setDraft(value);
      return;
    }
    onCommit(trimmed);
  };

  return (
    <input
      ref={ref}
      value={draft}
      spellCheck={false}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          ref.current?.blur();
        } else if (e.key === "Escape") {
          e.preventDefault();
          setDraft(value);
          ref.current?.blur();
        }
      }}
      className={cn(
        "min-w-0 flex-1 bg-transparent outline-none placeholder:italic placeholder:text-muted-foreground/40",
        className,
      )}
    />
  );
}
