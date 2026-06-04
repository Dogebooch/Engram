"use client";

import * as React from "react";
import { ChevronLeftIcon, ChevronRightIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PicmonicIndexEntry } from "@/lib/types/index-entry";
import type { MedicineVideo } from "@/lib/types/source-video";
import type { MedicineVideosLoadResult } from "@/lib/medicine-videos";
import {
  normalizeVideoPath,
  normalizeVideoTitle,
} from "@/lib/import/source-video-match";
import { cn } from "@/lib/utils";

type ChecklistFilter = "pending" | "imported" | "probable";
type ChecklistStatus = ChecklistFilter;

interface ImportChecklistRailProps {
  loadResult: MedicineVideosLoadResult;
  index: readonly PicmonicIndexEntry[];
}

export function ImportChecklistRail({
  loadResult,
  index,
}: ImportChecklistRailProps) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [filter, setFilter] = React.useState<ChecklistFilter>("pending");
  const [source, setSource] = React.useState("all");
  const [course, setCourse] = React.useState("all");

  const rows = React.useMemo(() => {
    if (loadResult.status !== "ok") return [];
    return loadResult.videos.map((video) => ({
      video,
      status: statusForVideo(video, index),
    }));
  }, [index, loadResult]);

  const counts = React.useMemo(() => {
    const next = { pending: 0, imported: 0, probable: 0 };
    for (const row of rows) next[row.status] += 1;
    return next;
  }, [rows]);

  const sources = React.useMemo(
    () => Array.from(new Set(rows.map((r) => r.video.source))).sort(),
    [rows],
  );
  const courses = React.useMemo(() => {
    const base = rows.filter((r) => source === "all" || r.video.source === source);
    return Array.from(new Set(base.map((r) => r.video.course))).sort();
  }, [rows, source]);

  const visible = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((row) => {
        if (filter === "pending") {
          if (row.status === "imported") return false;
        } else if (row.status !== filter) {
          return false;
        }
        if (source !== "all" && row.video.source !== source) return false;
        if (course !== "all" && row.video.course !== course) return false;
        if (!q) return true;
        const haystack = `${row.video.title} ${row.video.source} ${row.video.course}`.toLowerCase();
        return haystack.includes(q);
      })
      .slice(0, 150);
  }, [course, filter, query, rows, source]);

  if (collapsed) {
    return (
      <aside className="flex h-full w-12 shrink-0 flex-col items-center border-l border-border/60 bg-card/25 py-3">
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed(false)}
          aria-label="Show import checklist"
        >
          <ChevronLeftIcon />
        </Button>
        <div className="mt-4 rotate-90 whitespace-nowrap font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          {loadResult.status === "ok"
            ? `${counts.pending + counts.probable} pending`
            : "checklist"}
        </div>
      </aside>
    );
  }

  return (
    <aside className="flex h-full w-[310px] shrink-0 flex-col border-l border-border/60 bg-card/25">
      <div className="flex items-center justify-between border-b border-border/60 px-3 py-2">
        <div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
            Medicine Videos
          </div>
          <div className="mt-0.5 text-xs text-muted-foreground">
            {loadResult.status === "ok"
              ? `${counts.pending + counts.probable} pending · ${counts.imported} imported`
              : "Unavailable"}
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setCollapsed(true)}
          aria-label="Collapse import checklist"
        >
          <ChevronRightIcon />
        </Button>
      </div>

      {loadResult.status !== "ok" ? (
        <div className="p-3 text-xs leading-relaxed text-muted-foreground">
          {loadResult.message}
        </div>
      ) : (
        <>
          <div className="space-y-2 border-b border-border/60 p-3">
            <div className="relative">
              <SearchIcon
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground/70"
              />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search videos..."
                className="h-7 pl-7 text-xs"
              />
            </div>
            <div className="grid grid-cols-3 gap-1">
              {(["pending", "imported", "probable"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  className={cn(
                    "rounded-md border px-2 py-1 text-center font-mono text-[10px] uppercase tracking-[0.12em] transition-colors",
                    filter === value
                      ? "border-accent/50 bg-accent/15 text-foreground"
                      : "border-border/60 text-muted-foreground hover:text-foreground",
                  )}
                >
                  {value}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={source}
                onChange={(e) => {
                  setSource(e.target.value);
                  setCourse("all");
                }}
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
              >
                <option value="all">All sources</option>
                {sources.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                className="h-7 rounded-md border border-border/60 bg-background px-2 text-xs text-foreground"
              >
                <option value="all">All courses</option>
                {courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {visible.length === 0 ? (
              <div className="px-2 py-8 text-center text-xs text-muted-foreground">
                No videos match this view.
              </div>
            ) : (
              <ul className="space-y-1">
                {visible.map(({ video, status }) => (
                  <li
                    key={video.id}
                    className="rounded-md border border-border/40 bg-background/35 px-2 py-1.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate text-xs font-medium text-foreground" title={video.title}>
                          {video.title}
                        </div>
                        <div className="mt-0.5 truncate text-[10px] text-muted-foreground">
                          {video.source} · {video.course}
                        </div>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-sm px-1.5 py-0.5 font-mono text-[9px] uppercase tracking-[0.12em]",
                          status === "imported"
                            ? "bg-accent/15 text-accent-foreground"
                            : status === "probable"
                              ? "bg-muted text-muted-foreground"
                              : "text-muted-foreground/70",
                        )}
                      >
                        {status === "probable" ? "possible" : status}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      )}
    </aside>
  );
}

function statusForVideo(
  video: MedicineVideo,
  index: readonly PicmonicIndexEntry[],
): ChecklistStatus {
  let probable = false;
  const videoPath = normalizeVideoPath(video.path);
  const videoTitle = normalizeVideoTitle(video.title);
  for (const entry of index) {
    const source = entry.sourceVideo;
    if (!source || source.provider !== "mvs") continue;
    if (
      source.confidence === "matched" &&
      ((typeof source.id === "number" && source.id === video.id) ||
        (source.path && normalizeVideoPath(source.path) === videoPath))
    ) {
      return "imported";
    }
    if (
      source.confidence === "probable" &&
      normalizeVideoTitle(source.title) === videoTitle
    ) {
      probable = true;
    }
  }
  return probable ? "probable" : "pending";
}
