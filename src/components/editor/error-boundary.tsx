"use client";

import * as React from "react";
import { TriangleAlertIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface State {
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  fallback?: (args: { error: Error; reset: () => void }) => React.ReactNode;
}

export class CanvasErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[engram] canvas error", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset });
      }
      return <DefaultFallback error={this.state.error} reset={this.reset} />;
    }
    return this.props.children;
  }
}

function DefaultFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-stage p-12">
      <div className="max-w-md space-y-4 rounded-xl border border-border bg-card p-6">
        <div className="flex items-center gap-2 text-destructive">
          <TriangleAlertIcon className="size-4" />
          <span className="text-sm font-medium">Canvas crashed</span>
        </div>
        <p className="font-mono text-xs leading-relaxed text-muted-foreground break-words">
          {error.message}
        </p>
        <Button variant="outline" size="sm" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
