import { EditorShell } from "@/components/editor/editor-shell";
import { EditorSkeleton } from "@/components/editor/editor-skeleton";
import { Hydrated } from "@/components/editor/hydrated";

export default function Home() {
  return (
    <main className="flex min-h-screen w-screen flex-col">
      <Hydrated fallback={<EditorSkeleton />}>
        <EditorShell />
      </Hydrated>
    </main>
  );
}
