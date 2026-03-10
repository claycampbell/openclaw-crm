import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { RepCoachingCards } from "@/components/analytics/RepCoachingCards";

/**
 * Rep Performance Coaching page.
 * Server component — fetches data directly from the API route.
 * Admin-only (enforced via API route).
 */
export default async function RepCoachingPage() {
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(`${appUrl}/api/v1/analytics/rep-coaching`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (res.status === 401) {
      redirect("/login");
    }

    if (res.status === 403) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">
            Rep coaching is available to workspace admins only.
          </p>
        </div>
      );
    }

    const json = await res.json();
    const report = json.data;

    return <RepCoachingCards report={report} />;
  } catch {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">
          Failed to load coaching report. Please try again.
        </p>
      </div>
    );
  }
}
