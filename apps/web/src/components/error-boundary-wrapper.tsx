"use client";

import { ErrorBoundary } from "react-error-boundary";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

function ErrorFallback({
  error,
  resetErrorBoundary,
}: {
  error: unknown;
  resetErrorBoundary: () => void;
}) {
  const message =
    error instanceof Error ? error.message : "An unexpected error occurred";
  return (
    <div className="flex flex-col items-center justify-center gap-4 p-8 text-center">
      <h2 className="text-lg font-semibold">Something went wrong</h2>
      <p className="text-sm text-muted-foreground max-w-md">{message}</p>
      <Button onClick={resetErrorBoundary} variant="outline">
        Try again
      </Button>
    </div>
  );
}

export function ErrorBoundaryWrapper({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onError={(error) => {
        const msg = error instanceof Error ? error.message : String(error);
        toast.error("An error occurred", { description: msg });
      }}
    >
      {children}
    </ErrorBoundary>
  );
}
