import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { GenerateForm } from "./GenerateForm";

export default async function GeneratePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-16">
      <div className="w-full max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
          Generate a recipe
        </h1>
        <p className="mb-6 text-sm text-zinc-600 dark:text-zinc-400">
          Add the ingredients you have on hand and any dietary preferences, then
          generate recipe ideas.
        </p>
        <GenerateForm />
      </div>
    </div>
  );
}
