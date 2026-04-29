"use client";

import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="dark"
      enableSystem
      storageKey="engram-theme"
      disableTransitionOnChange
    >
      <TooltipProvider delay={250}>
        {children}
        <Toaster
          position="bottom-right"
          closeButton
          richColors={false}
          duration={2400}
        />
      </TooltipProvider>
    </ThemeProvider>
  );
}
