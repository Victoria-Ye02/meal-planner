import { expect, test } from "@playwright/test";

/**
 * The one true end-to-end test for this project: signup -> generate ->
 * save -> meal plan, exercised through the real UI against the real dev
 * server, the real Neon Postgres database, and the real OpenRouter/Claude
 * API (see task-13-brief.md — there is no mocking layer available for a
 * genuine E2E test of this flow, and .env's DATABASE_URL/
 * OPENROUTER_API_KEY are what make that possible here). Every other
 * branch/edge case (validation errors, auth failures, rate limiting,
 * malformed AI responses, ...) is already covered by the Vitest unit/API
 * tests in tests/ — this test is deliberately narrow: only the happy path.
 *
 * A fresh, timestamp-based email is used so re-running this test never
 * collides with the `User.email` unique constraint from a previous run.
 * Best-effort cleanup (unassigning the meal plan slot, unsaving the
 * recipe) runs at the end so repeated runs don't accumulate visible
 * clutter in the meal plan/favorites views; the underlying `User` and
 * `Recipe` rows themselves are left in place, since this app has no
 * account-deletion feature to invoke — acceptable for a portfolio project
 * (see task-13-brief.md's "test-database isolation" note).
 */
test("signup -> generate -> save -> meal plan", async ({ page }) => {
  test.slow(); // real AI generation call can take up to ~20s on its own

  const uniqueEmail = `e2e-test-${Date.now()}@example.com`;
  const password = "TestPassword123!";

  // --- Sign up ---
  await page.goto("/signup");
  await page.getByLabel("Email").fill(uniqueEmail);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign up" }).click();

  // Signup signs the user straight in and redirects to "/".
  await expect(
    page.getByRole("heading", { name: /Welcome back/ }),
  ).toBeVisible({ timeout: 15_000 });

  // --- Generate ---
  await page.getByRole("link", { name: "Generate a recipe" }).click();
  await expect(page).toHaveURL(/\/generate$/);

  await page.getByLabel("Ingredients").fill("chicken breast");
  await page.getByLabel("Ingredients").press("Enter");
  await expect(page.getByText("chicken breast", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Generate recipes" }).click();

  // The real AI call can take close to REQUEST_TIMEOUT_MS (20s) in
  // lib/ai/generateRecipes.ts, plus network/render time.
  const firstRecipeHeading = page.getByRole("heading", { level: 3 }).first();
  await expect(firstRecipeHeading).toBeVisible({ timeout: 45_000 });
  const recipeTitle = (await firstRecipeHeading.textContent())?.trim();
  expect(recipeTitle).toBeTruthy();

  // --- Save ---
  // Scoped to RecipeCard's own root div (its distinguishing class, see
  // components/RecipeCard.tsx) rather than a generic `div` — a generic
  // `div` filter would also match ancestor containers (the results grid,
  // the page wrapper, ...), which contain *every* card's "Save" button and
  // would make `.getByRole("button", { name: "Save" })` ambiguous.
  const firstCard = page
    .locator("div.rounded-lg.border.border-zinc-200")
    .filter({ hasText: recipeTitle! })
    .first();
  await firstCard.getByRole("button", { name: "Save" }).click();
  await expect(
    firstCard.getByRole("button", { name: "Saved" }),
  ).toBeVisible({ timeout: 10_000 });

  // --- Favorites ---
  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page).toHaveURL(/\/favorites$/);
  await expect(
    page.getByRole("heading", { name: recipeTitle!, exact: true }),
  ).toBeVisible();

  // --- Meal plan: assign the saved recipe to a slot ---
  await page.getByRole("link", { name: "Meal plan" }).click();
  await expect(page).toHaveURL(/\/mealplan$/);

  // Pinned to the first row's first meal column (Sunday/Breakfast) by
  // fixed table position, not by "whichever slot currently has a
  // combobox" — that would be a Locator that silently re-resolves to a
  // *different* slot the moment this one's own combobox disappears after
  // a successful assign (its own `<select>` still lists the same recipe
  // as a hidden `<option>`, which made an earlier version of this test
  // pass for the wrong reason). A brand-new account's freshly
  // upserted plan (see app/(dashboard)/mealplan/page.tsx) has zero
  // entries, so this slot is guaranteed empty going in.
  const targetSlot = page.locator("tbody tr").first().locator("td").nth(1);
  await targetSlot.getByRole("combobox").selectOption({ label: recipeTitle! });
  await targetSlot.getByRole("button", { name: "Assign" }).click();

  // Once assigned, the slot swaps its picker for the recipe title + a
  // "Remove" button (see components/MealPlanCalendar.tsx's `handleAssign`).
  await expect(targetSlot.getByRole("button", { name: "Remove" })).toBeVisible(
    { timeout: 10_000 },
  );
  await expect(targetSlot.getByText(recipeTitle!)).toBeVisible();

  // --- Best-effort cleanup: unassign the slot, then unsave the recipe ---
  await targetSlot.getByRole("button", { name: "Remove" }).click();
  await expect(targetSlot.getByRole("combobox")).toBeVisible({
    timeout: 10_000,
  });

  await page.getByRole("link", { name: "Favorites" }).click();
  await expect(page).toHaveURL(/\/favorites$/);
  await page.getByRole("button", { name: "Saved" }).click();
  await expect(
    page.getByRole("heading", { name: recipeTitle!, exact: true }),
  ).not.toBeVisible({ timeout: 10_000 });
});
