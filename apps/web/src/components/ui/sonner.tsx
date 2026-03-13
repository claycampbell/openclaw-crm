"use client";

import { Toaster as SonnerToaster } from "sonner";
import { useTheme } from "next-themes";

export function Toaster() {
  const { theme } = useTheme() as { theme: "light" | "dark" | "system" };
  return (
    <SonnerToaster
      theme={theme}
      richColors
      position="bottom-right"
      toastOptions={{
        duration: 4000,
      }}
    />
  );
}
