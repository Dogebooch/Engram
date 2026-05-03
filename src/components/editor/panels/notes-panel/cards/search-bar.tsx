"use client";

import * as React from "react";
import { SearchIcon, XIcon } from "lucide-react";

interface SearchBarProps {
  query: string;
  onChange: (query: string) => void;
  matchCount: number;
  totalCount: number;
}

export function SearchBar({
  query,
  onChange,
  matchCount,
  totalCount,
}: SearchBarProps) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  return (
    <div className="eng-notes-search">
      <SearchIcon className="eng-notes-search__icon" aria-hidden />
      <input
        ref={inputRef}
        type="search"
        className="eng-notes-search__input"
        placeholder="filter facts, symbols, descriptions…"
        value={query}
        onChange={(e) => onChange(e.target.value)}
        spellCheck={false}
        autoComplete="off"
      />
      {query.length > 0 ? (
        <>
          <span className="eng-notes-search__count" aria-live="polite">
            {matchCount} / {totalCount}
          </span>
          <button
            type="button"
            className="eng-notes-search__clear"
            onClick={() => {
              onChange("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
          >
            <XIcon aria-hidden />
          </button>
        </>
      ) : null}
    </div>
  );
}
