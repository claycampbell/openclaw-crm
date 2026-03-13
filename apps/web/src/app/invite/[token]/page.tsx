"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Building2, CheckCircle2, XCircle, Loader2 } from "lucide-react";

interface InviteInfo {
  workspaceName: string;
  email: string;
  role: string;
}

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const router = useRouter();
  const [status, setStatus] = useState<"loading" | "preview" | "accepting" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);

  useEffect(() => {
    async function handleInvite() {
      // Step 1: Fetch invite details (public endpoint, no auth needed)
      try {
        const infoRes = await fetch(`/api/v1/invites/${token}/info`);
        if (!infoRes.ok) {
          setStatus("error");
          setMessage("This invite link is invalid or has expired.");
          return;
        }
        const infoData = await infoRes.json();
        setInviteInfo(infoData.data);

        // Step 2: Check if user has a session by calling a lightweight auth check
        const sessionRes = await fetch("/api/auth/get-session");
        const hasSession = sessionRes.ok && sessionRes.status === 200;
        let sessionData = null;
        if (hasSession) {
          try {
            sessionData = await sessionRes.json();
          } catch {
            // not logged in
          }
        }

        if (!sessionData?.session) {
          // Not authenticated — show preview with register/login options
          setStatus("preview");
          return;
        }

        // Step 3: User is authenticated — try to accept the invite
        setStatus("accepting");
        const acceptRes = await fetch(`/api/v1/invites/${token}/accept`, { method: "POST" });
        if (acceptRes.ok) {
          const acceptData = await acceptRes.json();
          setStatus("success");
          setMessage(`You've joined ${infoData.data.workspaceName}!`);
          // Switch to the workspace
          await fetch("/api/v1/workspaces/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: acceptData.data.workspaceId }),
          });
          setTimeout(() => router.push("/home"), 1500);
        } else {
          const errData = await acceptRes.json().catch(() => ({ error: { message: "Could not accept invite." } }));
          setStatus("error");
          setMessage(errData.error?.message ?? "Could not accept invite.");
        }
      } catch {
        setStatus("error");
        setMessage("Something went wrong. Please try again.");
      }
    }

    handleInvite();
  }, [token, router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-8 py-8">
        <div className="text-center mb-6">
          <div className="flex justify-center mb-4">
            <Logo size="lg" />
          </div>
        </div>

        {status === "loading" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-body-sm text-muted-foreground/70">Loading invite...</p>
          </div>
        )}

        {status === "preview" && inviteInfo && (
          <div className="space-y-6">
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                <Building2 className="h-7 w-7 text-primary" />
              </div>
              <h1 className="text-title-4">You&apos;re invited to join</h1>
              <p className="text-lg font-semibold mt-1">{inviteInfo.workspaceName}</p>
              <p className="text-body-sm text-muted-foreground/70 mt-1">
                as a {inviteInfo.role}
              </p>
            </div>

            <div className="space-y-3">
              <Link
                href={`/register?invite=${token}`}
                className="flex w-full justify-center rounded-full bg-foreground py-2.5 text-[13px] font-medium text-background shadow-[0_1px_4px_rgba(0,0,0,0.1),0_0px_1px_rgba(0,0,0,0.06)] transition-all hover:opacity-80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)]"
              >
                Create an account to join
              </Link>
              <Link
                href={`/login?redirect=/invite/${token}`}
                className="flex w-full justify-center rounded-full border border-foreground/10 py-2.5 text-[13px] font-medium text-foreground transition-all hover:bg-foreground/5"
              >
                Sign in to existing account
              </Link>
            </div>
          </div>
        )}

        {status === "accepting" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            <p className="text-body-sm text-muted-foreground/70">Joining workspace...</p>
          </div>
        )}

        {status === "success" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <CheckCircle2 className="h-10 w-10 text-emerald-500" />
            <p className="text-title-4">{message}</p>
            <p className="text-body-sm text-muted-foreground/70">Redirecting you now...</p>
          </div>
        )}

        {status === "error" && (
          <div className="flex flex-col items-center gap-3 py-8">
            <XCircle className="h-10 w-10 text-destructive" />
            <p className="text-title-4 text-destructive">{message}</p>
            <Link
              href="/login"
              className="mt-2 text-body-sm text-muted-foreground/70 underline hover:text-foreground transition-colors"
            >
              Go to sign in
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
