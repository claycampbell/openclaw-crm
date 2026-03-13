"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const shortcuts = [
  {
    category: "Navigation",
    items: [
      { keys: ["Ctrl", "K"], description: "Open search / command palette" },
      { keys: ["?"], description: "Show keyboard shortcuts" },
    ],
  },
  {
    category: "Records",
    items: [
      { keys: ["N"], description: "New record (on list page)" },
      { keys: ["Esc"], description: "Close dialog / panel" },
    ],
  },
  {
    category: "Chat",
    items: [
      { keys: ["Enter"], description: "Send message" },
      { keys: ["Shift", "Enter"], description: "New line in message" },
    ],
  },
  {
    category: "General",
    items: [
      { keys: ["Ctrl", "Z"], description: "Undo" },
      { keys: ["Ctrl", "S"], description: "Save (where applicable)" },
    ],
  },
];

export function KeyboardShortcuts() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Only trigger on "?" without modifiers and not in an input
      if (
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !(e.target instanceof HTMLInputElement) &&
        !(e.target instanceof HTMLTextAreaElement) &&
        !(e.target as HTMLElement)?.isContentEditable
      ) {
        e.preventDefault();
        setOpen(true);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 py-2">
          {shortcuts.map((group) => (
            <div key={group.category}>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                {group.category}
              </h3>
              <div className="space-y-1.5">
                {group.items.map((shortcut, i) => (
                  <div key={i} className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{shortcut.description}</span>
                    <div className="flex items-center gap-1">
                      {shortcut.keys.map((key, j) => (
                        <span key={j}>
                          {j > 0 && (
                            <span className="mx-0.5 text-xs text-muted-foreground">+</span>
                          )}
                          <kbd className="inline-flex items-center justify-center rounded border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground min-w-[24px]">
                            {key}
                          </kbd>
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground text-center pt-2 border-t border-border">
          Press <kbd className="rounded border border-border bg-muted px-1 py-0.5 text-[10px] font-medium">?</kbd> anytime to show this dialog
        </p>
      </DialogContent>
    </Dialog>
  );
}
