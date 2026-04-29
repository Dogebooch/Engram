"use client";

import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

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
    <div className="relative">
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
        className="h-8 pl-7 pr-7 text-xs"
      />
      <button
        type="button"
        aria-label="Clear search"
        onClick={() => onChange("")}
        className={cn(
          "absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground/70 transition-opacity hover:text-foreground",
          value ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        <XIcon className="size-3" />
      </button>
    </div>
  );
}
