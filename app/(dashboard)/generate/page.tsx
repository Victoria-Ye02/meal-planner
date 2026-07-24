import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { GenerateForm } from "./GenerateForm";

export default async function GeneratePage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-12 sm:py-16">
      <div className="w-full max-w-4xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Generate a recipe
        </h1>
        <p className="mb-8 max-w-prose text-muted">
          Add the ingredients you have on hand and any dietary preferences, then
          let the AI suggest a few things to cook.
        </p>
        <GenerateForm />
      </div>
    </div>
  );
}
