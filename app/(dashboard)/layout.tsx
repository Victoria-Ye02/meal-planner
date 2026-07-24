import Link from "next/link";
import { redirect } from "next/navigation";

import { auth, signOut } from "@/lib/auth";

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
    <div className="flex flex-1 flex-col">
      <header className="border-b border-zinc-200 dark:border-zinc-800">
        <nav className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-x-4 gap-y-2 px-6 py-4">
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm font-medium">
            <Link
              href="/generate"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Generate
            </Link>
            <Link
              href="/favorites"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Favorites
            </Link>
            <Link
              href="/mealplan"
              className="text-zinc-700 hover:text-zinc-900 dark:text-zinc-300 dark:hover:text-zinc-50"
            >
              Meal plan
            </Link>
          </div>
          <form
            action={async () => {
              "use server";
              await signOut({ redirectTo: "/" });
            }}
          >
            <button
              type="submit"
              className="rounded-md border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
            >
              Log out
            </button>
          </form>
        </nav>
      </header>
      {children}
    </div>
  );
}
