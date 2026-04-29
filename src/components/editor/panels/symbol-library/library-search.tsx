"use client";

import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

interface LibrarySearchProps {
  value: string;
  onChange: (value: string) => void;
}

export function LibrarySearch({ value, onChange }: LibrarySearchProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    const onFocusEvent = () => {
      inputRef.current?.focus();
      inputRef.current?.select();
    };
    window.addEventListener("engram:focus-library-search", onFocusEvent);
    return () =>
      window.removeEventListener("engram:focus-library-search", onFocusEvent);
  }, []);

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape" && value) {
        e.preventDefault();
        onChange("");
      }
    },
    [value, onChange],
  );

  return (
    <div className="group relative">
      <SearchIcon
        aria-hidden
        className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
      />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Search symbols…"
        spellCheck={false}
        autoComplete="off"
        data-engram-library-search
        className="h-8 pl-7 pr-8 text-xs font-medium tracking-tight placeholder:font-normal placeholder:tracking-normal"
      />
      {value === "" ? (
        <kbd
          data-slot="kbd"
          aria-hidden
          className="pointer-events-none absolute right-2 top-1/2 flex h-[18px] -translate-y-1/2 items-center rounded border border-border/60 bg-background/60 px-1.5 font-mono text-[10px] leading-none text-muted-foreground/70 transition-opacity duration-150 group-focus-within:opacity-0"
        >
          /
        </kbd>
      ) : (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground/70 transition-colors hover:bg-white/[0.06] hover:text-foreground"
        >
          <XIcon className="size-3" />
        </button>
      )}
    </div>
  );
}
