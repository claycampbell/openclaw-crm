"use client";

import { useState, useEffect, Suspense } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { signUp } from "@/lib/auth-client";
import { trackEvent } from "@/lib/analytics";
import { Logo } from "@/components/brand/logo";
import { Building2 } from "lucide-react";

interface InviteInfo {
  workspaceName: string;
  email: string;
  role: string;
}

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inviteToken = searchParams.get("invite");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workspaceName, setWorkspaceName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadingInvite, setLoadingInvite] = useState(!!inviteToken);

  // Fetch invite details if token is present
  useEffect(() => {
    if (!inviteToken) return;
    fetch(`/api/v1/invites/${inviteToken}/info`)
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          setInviteInfo(data.data);
          setEmail(data.data.email);
        }
      })
      .finally(() => setLoadingInvite(false));
  }, [inviteToken]);

  const isInviteFlow = !!inviteToken && !!inviteInfo;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      setLoading(false);
      return;
    }

    try {
      const result = await signUp.email({
        name,
        email,
        password,
      });

      if (result.error) {
        setError(result.error.message || "Registration failed");
        setLoading(false);
        return;
      }

      if (isInviteFlow) {
        // Accept the invite — this adds the user to the workspace
        const acceptRes = await fetch(`/api/v1/invites/${inviteToken}/accept`, {
          method: "POST",
        });

        if (acceptRes.ok) {
          const acceptData = await acceptRes.json();
          // Switch to the workspace
          await fetch("/api/v1/workspaces/switch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ workspaceId: acceptData.data.workspaceId }),
          });
          trackEvent("signup_completed_via_invite");
          router.push("/home");
        } else {
          // Invite accept failed — send to workspace selection
          router.push("/select-workspace");
        }
      } else {
        // Standard flow — create a new workspace
        const wsName = workspaceName.trim() || `${name}'s Workspace`;
        const wsRes = await fetch("/api/v1/workspaces", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: wsName }),
        });

        if (!wsRes.ok) {
          router.push("/select-workspace");
          return;
        }

        trackEvent("signup_completed");
        router.push("/home");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass =
    "flex h-10 w-full rounded-xl border border-foreground/8 dark:border-white/[0.06] bg-background/60 dark:bg-white/[0.04] px-4 text-[14px] text-foreground placeholder:text-muted-foreground/40 outline-none transition-colors focus:border-foreground/20 dark:focus:border-white/15 focus:ring-0";

  if (loadingInvite) {
    return (
      <div className="rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-8 py-8">
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-foreground/20 border-t-foreground" />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-foreground/[0.06] dark:border-white/[0.06] bg-foreground/[0.015] dark:bg-white/[0.02] px-8 py-8">
      <div className="text-center mb-6">
        <div className="flex justify-center mb-4">
          <Logo size="lg" />
        </div>
        {isInviteFlow ? (
          <>
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <Building2 className="h-6 w-6 text-primary" />
            </div>
            <h1 className="text-title-4">Join {inviteInfo.workspaceName}</h1>
            <p className="text-body-sm text-muted-foreground/70 mt-1.5">
              Create your account to get started
            </p>
          </>
        ) : (
          <>
            <h1 className="text-title-4">Create an account</h1>
            <p className="text-body-sm text-muted-foreground/70 mt-1.5">
              Get started with your CRM
            </p>
          </>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-xl bg-destructive/10 px-4 py-2.5 text-[13px] text-destructive">
            {error}
          </div>
        )}
        <div className="space-y-1.5">
          <label htmlFor="name" className="text-label text-muted-foreground">
            Name
          </label>
          <input
            id="name"
            type="text"
            placeholder="Your name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
            className={inputClass}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="email" className="text-label text-muted-foreground">
            Email
          </label>
          <input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            readOnly={isInviteFlow}
            className={`${inputClass} ${isInviteFlow ? "opacity-60 cursor-not-allowed" : ""}`}
          />
          {isInviteFlow && (
            <p className="text-caption text-muted-foreground/50">
              This email is tied to your invite
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <label
            htmlFor="password"
            className="text-label text-muted-foreground"
          >
            Password
          </label>
          <input
            id="password"
            type="password"
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            className={inputClass}
          />
        </div>

        {/* Only show workspace name field when NOT joining via invite */}
        {!isInviteFlow && (
          <div className="space-y-1.5">
            <label
              htmlFor="workspace-name"
              className="text-label text-muted-foreground"
            >
              Workspace name
            </label>
            <input
              id="workspace-name"
              type="text"
              placeholder={name ? `${name}'s Workspace` : "My Workspace"}
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              className={inputClass}
            />
            <p className="text-caption">Leave blank to use your name</p>
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-full bg-foreground py-2.5 text-[13px] font-medium text-background shadow-[0_1px_4px_rgba(0,0,0,0.1),0_0px_1px_rgba(0,0,0,0.06)] transition-all hover:opacity-80 hover:shadow-[0_2px_8px_rgba(0,0,0,0.15)] disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading
            ? isInviteFlow
              ? "Joining..."
              : "Creating account..."
            : isInviteFlow
              ? `Join ${inviteInfo.workspaceName}`
              : "Create account"}
        </button>
      </form>

      <p className="mt-6 text-center text-[13px] text-muted-foreground/60">
        Already have an account?{" "}
        <Link
          href={isInviteFlow ? `/login?redirect=/invite/${inviteToken}` : "/login"}
          className="text-foreground transition-colors hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense>
      <RegisterForm />
    </Suspense>
  );
}
