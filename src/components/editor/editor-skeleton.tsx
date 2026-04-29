"use client";

export function EditorSkeleton() {
  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-12 w-full items-center gap-3 border-b border-border bg-card/40 px-4">
        <div className="h-3 w-3 animate-pulse rounded-full bg-muted" />
        <div className="h-3 w-32 animate-pulse rounded bg-muted" />
        <div className="ml-auto h-3 w-16 animate-pulse rounded bg-muted" />
      </div>
      <div className="flex flex-1">
        <div className="w-[18%] border-r border-border bg-card/30" />
        <div className="flex flex-1 items-center justify-center bg-stage">
          <div className="aspect-[16/9] w-3/4 max-w-5xl rounded-md border border-border/60 bg-stage/80 shadow-inner" />
        </div>
        <div className="w-[24%] border-l border-border bg-card/30" />
      </div>
    </div>
  );
}
