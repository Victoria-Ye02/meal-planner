import { NextResponse } from "next/server";

import { generateRecipes } from "@/lib/ai/generateRecipes";
import { auth } from "@/lib/auth";
import { checkRateLimit, recordGeneration } from "@/lib/rateLimit";
import { generateRecipesRequestSchema } from "@/lib/validations/generate";

/**
 * POST /api/recipes/generate
 *
 * Auth -> validate -> rate-limit -> call the AI wrapper -> return recipes.
 * The AI call itself (network/timeout/malformed-response handling) is
 * entirely Task 5's responsibility (lib/ai/generateRecipes.ts); this route
 * only translates its typed `{success, ...}` result into an HTTP response.
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

  const rateLimit = await checkRateLimit(userId);
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
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  // Only record usage against the user's daily cap once a generation call
  // actually succeeds, so failed/misconfigured attempts don't burn quota.
  await recordGeneration(userId);

  return NextResponse.json({ recipes: result.recipes }, { status: 200 });
}
