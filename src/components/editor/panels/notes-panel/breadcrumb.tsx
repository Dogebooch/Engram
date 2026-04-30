"use client";

import type { CursorBreadcrumb } from "./use-sync-editor-to-canvas";

interface NotesBreadcrumbProps {
  breadcrumb: CursorBreadcrumb;
}

export function NotesBreadcrumb({ breadcrumb }: NotesBreadcrumbProps) {
  const hasContext =
    breadcrumb.factName != null || breadcrumb.sectionName != null;
  return (
    <div
      className="eng-notes-breadcrumb"
      data-eng-breadcrumb
      data-empty={hasContext ? "false" : "true"}
    >
      {hasContext ? (
        <>
          {breadcrumb.sectionName && (
            <span
              className="eng-notes-breadcrumb__section"
              title={breadcrumb.sectionName}
            >
              {breadcrumb.sectionName}
            </span>
          )}
          {breadcrumb.sectionName && breadcrumb.factName && (
            <span className="eng-notes-breadcrumb__sep" aria-hidden>
              /
            </span>
          )}
          {breadcrumb.factName && (
            <span
              className="eng-notes-breadcrumb__fact"
              title={breadcrumb.factName}
            >
              {breadcrumb.factName}
            </span>
          )}
        </>
      ) : (
        <span className="eng-notes-breadcrumb__placeholder">
          no fact &middot; cursor outside heading
        </span>
      )}
    </div>
  );
}
