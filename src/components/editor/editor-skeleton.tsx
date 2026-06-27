"use client";

// Hydration fallback. Staggered pulses (motion-reduce safe) so the load reads
// as an intentional loading state rather than a frozen frame.
const PULSE = "animate-pulse motion-reduce:animate-none";

export function EditorSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 w-full items-center gap-3 border-b border-border bg-card/40 px-4">
        <div className={`h-3 w-3 rounded-full bg-muted ${PULSE}`} />
        <div
          className={`h-3 w-32 rounded bg-muted ${PULSE}`}
          style={{ animationDelay: "120ms" }}
        />
        <div
          className={`ml-auto h-3 w-16 rounded bg-muted ${PULSE}`}
          style={{ animationDelay: "240ms" }}
        />
      </div>
      <div className="flex flex-1">
        <div className="flex w-[18%] flex-col gap-2 border-r border-border bg-card/30 p-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className={`h-7 w-full rounded bg-muted/60 ${PULSE}`}
              style={{ animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
        <div className="flex flex-1 items-center justify-center bg-stage">
          <div
            className={`aspect-[16/9] w-3/4 max-w-5xl rounded-md border border-border/60 bg-stage/80 shadow-inner ${PULSE}`}
            style={{ animationDelay: "180ms" }}
          />
        </div>
        <div className="flex w-[24%] flex-col gap-2.5 border-l border-border bg-card/30 p-3">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-16 w-full rounded-md bg-muted/50 ${PULSE}`}
              style={{ animationDelay: `${i * 130}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
