import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { WinLossPatterns } from "@/components/analytics/WinLossPatterns";

/**
 * Win/Loss Pattern Analysis page.
 * Server component — fetches data directly from the service.
 * Admin-only (enforced via API route).
 */
export default async function WinLossPage() {
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  // Build cookie header to pass auth context to the API route
  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(`${appUrl}/api/v1/analytics/win-loss`, {
      headers: {
        Cookie: cookieHeader,
      },
      // Disable cache so data is fresh
      cache: "no-store",
    });

    if (res.status === 401) {
      redirect("/login");
    }

    if (res.status === 403) {
      return (
        <div className="flex h-full items-center justify-center">
          <p className="text-muted-foreground">
            Analytics is available to workspace admins only.
          </p>
        </div>
      );
    }

    const json = await res.json();
    const data = json.data;

    return <WinLossPatterns initialData={data} />;
  } catch {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">Failed to load win/loss analysis. Please try again.</p>
      </div>
    );
  }
}
