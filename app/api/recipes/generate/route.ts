import { NextResponse } from "next/server";

import { generateRecipes } from "@/lib/ai/generateRecipes";
import { auth } from "@/lib/auth";
import { releaseGenerationSlot, reserveGenerationSlot } from "@/lib/rateLimit";
import { generateRecipesRequestSchema } from "@/lib/validations/generate";

/**
 * POST /api/recipes/generate
 *
 * Auth -> validate -> atomically reserve a rate-limit slot -> call the AI
 * wrapper -> return recipes.
 *
 * The rate-limit slot is reserved (count-check + insert, in one
 * transaction) *before* the AI call, not after a successful one, so
 * concurrent requests from the same user can't all observe the same
 * "under cap" count during the AI call's ~20s window. If the AI call then
 * fails, the reservation is rolled back so only successful generations
 * count against the user's daily cap. The AI call itself
 * (network/timeout/malformed-response handling) is entirely Task 5's
 * responsibility (lib/ai/generateRecipes.ts); this route only translates
 * its typed `{success, ...}` result into an HTTP response.
 */
export async function POST(request: Request) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = generateRecipesRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input.", issues: parsed.error.flatten().fieldErrors },
      { status: 400 },
    );
  }

  const rateLimit = await reserveGenerationSlot(userId);
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        error: `Daily recipe generation limit reached (${rateLimit.limit}/day). Please try again tomorrow.`,
      },
      { status: 429 },
    );
  }

  const { ingredients, dietaryPreferences } = parsed.data;
  const result = await generateRecipes({
    ingredients,
    preferences: dietaryPreferences,
  });

  if (!result.success) {
    // Roll back the reservation so a failed/misconfigured attempt doesn't
    // burn the user's quota — only successful generations should count.
    if (rateLimit.logId) {
      await releaseGenerationSlot(rateLimit.logId);
    }
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  return NextResponse.json({ recipes: result.recipes }, { status: 200 });
}
