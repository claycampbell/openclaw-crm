"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/v1/invites/${token}/accept`, { method: "POST" })
      .then(async (res) => {
        const data = await res.json();
        if (res.ok) {
          setStatus("success");
          setMessage("You've joined the workspace!");
          setTimeout(() => router.push("/home"), 2000);
        } else {
          setStatus("error");
          setMessage(data.error?.message ?? "Invalid or expired invite link.");
        }
      })
      .catch(() => {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      });
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50">
      <div className="w-full max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
        <div className="mb-4 text-3xl font-bold tracking-tight">Aria</div>
        {status === "loading" && <p className="text-muted-foreground">Accepting invite...</p>}
        {status === "success" && (
          <>
            <p className="text-green-600 font-medium">{message}</p>
            <p className="mt-2 text-sm text-muted-foreground">Redirecting you now...</p>
          </>
        )}
        {status === "error" && (
          <>
            <p className="text-destructive font-medium">{message}</p>
            <a href="/home" className="mt-4 inline-block text-sm underline">Go to Aria</a>
          </>
        )}
      </div>
    </div>
  );
}
