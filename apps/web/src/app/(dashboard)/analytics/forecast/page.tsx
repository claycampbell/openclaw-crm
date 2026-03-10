import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ForecastView } from "@/components/analytics/ForecastView";

/**
 * Pipeline Forecast page.
 * Server component — fetches data from the API route.
 * Admin-only (enforced via API route).
 */
export default async function ForecastPage() {
  const cookieStore = await cookies();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3001";

  const cookieHeader = cookieStore
    .getAll()
    .map((c) => `${c.name}=${c.value}`)
    .join("; ");

  try {
    const res = await fetch(`${appUrl}/api/v1/analytics/forecast`, {
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
            Pipeline forecast is available to workspace admins only.
          </p>
        </div>
      );
    }

    const json = await res.json();
    const forecast = json.data;

    return <ForecastView forecast={forecast} />;
  } catch {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">
          Failed to load pipeline forecast. Please try again.
        </p>
      </div>
    );
  }
}
