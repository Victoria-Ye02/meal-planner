import Link from "next/link";

import { auth, signOut } from "@/lib/auth";
import { LogoutButton } from "@/components/LogoutButton";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-background px-6 py-16 text-center">
        <span className="text-3xl" aria-hidden="true">
          🍲
        </span>
        <h1 className="max-w-full break-words text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
          Welcome back{session.user.email ? `, ${session.user.email}` : ""}
        </h1>
        <p className="max-w-md text-muted">
          Generate a recipe from what&apos;s in your kitchen, save your
          favorites, and plan out the week.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          <Link
            href="/generate"
            className="inline-flex items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover"
          >
            Generate a recipe
          </Link>
          <Link
            href="/favorites"
            className="inline-flex items-center justify-center rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-surface-2"
          >
            Favorites
          </Link>
          <Link
            href="/mealplan"
            className="inline-flex items-center justify-center rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-surface-2"
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
          <LogoutButton className="rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50" />
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 bg-background px-6 py-16 text-center">
      <span className="text-4xl" aria-hidden="true">
        🍲
      </span>
      <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
        AI Recipe &amp; Meal Planner
      </h1>
      <p className="max-w-md text-muted">
        Tell it what&apos;s in your kitchen, get AI-suggested recipes, save your
        favorites, and build out the week&apos;s meals.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link
          href="/login"
          className="inline-flex items-center justify-center rounded-control border border-border bg-surface px-4 py-2.5 text-sm font-medium text-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-surface-2"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="inline-flex items-center justify-center rounded-control bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
