import Link from "next/link";

import { auth, signOut } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-black">
        <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Welcome back{session.user.email ? `, ${session.user.email}` : ""}
        </h1>
        <p className="max-w-md text-zinc-600 dark:text-zinc-400">
          You&apos;re signed in. Recipe and meal planning features are coming
          soon.
        </p>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
          >
            Log out
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-zinc-50 px-6 text-center dark:bg-black">
      <h1 className="text-3xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
        AI Recipe & Meal Planner
      </h1>
      <p className="max-w-md text-zinc-600 dark:text-zinc-400">
        Project scaffolding is set up. Features are coming soon.
      </p>
      <div className="flex gap-3">
        <Link
          href="/login"
          className="rounded-md border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-900 dark:border-zinc-700 dark:text-zinc-50"
        >
          Log in
        </Link>
        <Link
          href="/signup"
          className="rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white dark:bg-zinc-50 dark:text-zinc-900"
        >
          Sign up
        </Link>
      </div>
    </div>
  );
}
