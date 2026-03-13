"use client";

import { useState, useCallback, useRef } from "react";
import type { ConfirmDialogProps } from "@/components/confirm-dialog";

export interface ConfirmDialogOptions {
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "default" | "destructive";
}

export function useConfirmDialog() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmDialogOptions>({
    title: "",
    description: "",
  });
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((opts: ConfirmDialogOptions): Promise<boolean> => {
    setOptions(opts);
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const handleConfirm = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(true);
    resolveRef.current = null;
  }, []);

  const handleCancel = useCallback(() => {
    setOpen(false);
    resolveRef.current?.(false);
    resolveRef.current = null;
  }, []);

  const dialogProps: ConfirmDialogProps = {
    open,
    title: options.title,
    description: options.description,
    confirmLabel: options.confirmLabel ?? "Confirm",
    cancelLabel: options.cancelLabel ?? "Cancel",
    variant: options.variant ?? "default",
    onConfirm: handleConfirm,
    onCancel: handleCancel,
  };

  return { dialogProps, confirm };
}

// Re-export the component for convenience
export { ConfirmDialog } from "@/components/confirm-dialog";
export type { ConfirmDialogProps } from "@/components/confirm-dialog";
