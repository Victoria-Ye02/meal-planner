import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

/**
 * Shared chrome for the authenticated app (Generate / Favorites / Meal
 * plan): a redirect-if-unauthenticated guard plus a small responsive nav
 * so a signed-in user can actually move between the three feature pages
 * instead of relying on typed URLs. Each page under this group already
 * re-checks `auth()` itself (defense in depth from earlier tasks); this
 * layout-level check is what actually stops an unauthenticated request
 * from rendering the nav shell at all.
 *
 * `flex-wrap` on the nav row is the responsive fix here: at 375px width
 * "Generate" + "Favorites" + "Meal plan" + "Log out" don't fit one line,
 * so they wrap onto a second line instead of overflowing the viewport.
 */
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border bg-surface">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <Link
            href="/generate"
            className="flex items-center gap-2 text-base font-semibold tracking-tight text-foreground"
          >
            <span aria-hidden="true">🍲</span>
            Meal Planner
          </Link>
          <div className="flex flex-wrap items-center gap-x-1 gap-y-2 text-sm font-medium">
            <Link
              href="/generate"
              className="rounded-control px-3 py-1.5 text-muted transition-colors duration-200 ease-out-quart hover:bg-surface-2 hover:text-foreground"
            >
              Generate
            </Link>
            <Link
              href="/favorites"
              className="rounded-control px-3 py-1.5 text-muted transition-colors duration-200 ease-out-quart hover:bg-surface-2 hover:text-foreground"
            >
              Favorites
            </Link>
            <Link
              href="/mealplan"
              className="rounded-control px-3 py-1.5 text-muted transition-colors duration-200 ease-out-quart hover:bg-surface-2 hover:text-foreground"
            >
              Meal plan
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut({ redirectTo: "/" });
              }}
            >
              <LogoutButton className="rounded-control border border-border px-3 py-1.5 text-sm font-medium text-foreground transition-colors duration-200 ease-out-quart hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50" />
            </form>
          </div>
        </nav>
      </header>
      {children}
    </div>
  );
}
