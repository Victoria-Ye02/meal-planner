import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

import { AssistantChat } from "./AssistantChat";

export default async function AssistantPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex flex-1 flex-col items-center gap-6 px-6 py-8 sm:py-10">
      <div className="w-full max-w-2xl">
        <h1 className="mb-2 text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
          Cooking assistant
        </h1>
        <p className="mb-6 text-muted">
          Ask about your saved recipes or this week&apos;s meal plan —
          substitutions, cook times, what&apos;s for dinner Tuesday.
        </p>
        <AssistantChat />
      </div>
    </div>
  );
}
