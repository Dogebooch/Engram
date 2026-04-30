"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useStore } from "@/lib/store";

interface RenameDialogProps {
  picmonicId: string | null;
  initialName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameDialog({
  picmonicId,
  initialName,
  open,
  onOpenChange,
}: RenameDialogProps) {
  const renamePicmonic = useStore((s) => s.renamePicmonic);
  const [name, setName] = React.useState(initialName);
  const inputRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    if (open) {
      setName(initialName);
      const t = setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 30);
      return () => clearTimeout(t);
    }
  }, [open, initialName]);

  const onSave = () => {
    const trimmed = name.trim();
    if (!picmonicId || !trimmed) {
      onOpenChange(false);
      return;
    }
    renamePicmonic(picmonicId, trimmed);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Rename
          </DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              onSave();
            }
          }}
          placeholder="Picmonic name"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={!name.trim()}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
