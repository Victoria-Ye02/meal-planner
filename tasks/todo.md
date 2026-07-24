# Task List: AI-Powered Recipe & Meal Planner

## Phase 1: Foundation

### Task 1: Project scaffolding

**Description:** Create the Next.js app with TypeScript, Tailwind, ESLint/Prettier configured.
**Acceptance criteria:**

- [ ] `npx create-next-app` project runs with `npm run dev` showing a default page
- [ ] Tailwind classes render correctly
- [ ] Lint config in place
      **Verification:**
- [ ] `npm run build` succeeds
- [ ] `npm run lint` passes
      **Dependencies:** None
      **Files:** `package.json`, `tailwind.config.ts`, `app/layout.tsx`, `app/page.tsx`
      **Estimated scope:** S

### Task 2: Database schema + Prisma + Neon connection

**Description:** Define Prisma schema (User, Recipe, SavedRecipe, MealPlan, MealPlanEntry) from spec.md and connect to a Neon Postgres instance.
**Acceptance criteria:**

- [ ] `prisma/schema.prisma` matches the data model in spec.md
- [ ] `npx prisma migrate dev` runs clean against Neon
- [ ] `npx prisma studio` shows all tables
      **Verification:**
- [ ] Migration applies with no errors
- [ ] Manual check: tables visible in Prisma Studio
      **Dependencies:** Task 1
      **Files:** `prisma/schema.prisma`, `lib/db.ts`, `.env`
      **Estimated scope:** S

### Task 3: Auth (signup/login)

**Description:** Set up NextAuth with email/password credentials provider; build signup and login pages.
**Acceptance criteria:**

- [ ] User can create an account with email/password
- [ ] User can log in and see an authenticated state
- [ ] Passwords are hashed (bcrypt), never stored plaintext
      **Verification:**
- [ ] Manual check: sign up → log out → log in works
- [ ] `npm test -- --grep auth` passes (basic unit test on hashing/validation)
      **Dependencies:** Task 2
      **Files:** `app/api/auth/[...nextauth]/route.ts`, `app/(auth)/signup/page.tsx`, `app/(auth)/login/page.tsx`, `lib/auth.ts`
      **Estimated scope:** M

## Checkpoint: After Tasks 1-3

- [ ] All tests pass
- [ ] Application builds without errors
- [ ] Signup → login flow works end-to-end
- [ ] Review with human before proceeding

## Phase 2: Core AI Recipe Feature

### Task 4: Ingredient input UI

**Description:** Build a form where the logged-in user enters ingredients (tag-style input) and optional dietary preferences.
**Acceptance criteria:**

- [ ] User can add/remove ingredient tags
- [ ] Form validates at least 1 ingredient before submit
      **Verification:**
- [ ] Manual check: form blocks empty submission, accepts valid input
      **Dependencies:** Task 3
      **Files:** `app/(dashboard)/generate/page.tsx`, `components/IngredientInput.tsx`
      **Estimated scope:** S

### Task 5: Claude API wrapper + prompt template

**Description:** Server-side module that calls the Claude API with a constrained prompt template (ingredients/preferences as data fields, not raw injected text) and requests structured JSON output.
**Acceptance criteria:**

- [ ] `lib/ai/generateRecipes.ts` takes `{ingredients, preferences}` and returns typed `Recipe[]`
- [ ] Prompt explicitly instructs JSON-only structured output
- [ ] Handles API errors/timeouts with a typed error result
      **Verification:**
- [ ] Unit test with mocked Claude API response parses correctly
- [ ] Unit test with malformed AI response triggers graceful error, not a crash
      **Dependencies:** Task 2
      **Files:** `lib/ai/generateRecipes.ts`, `lib/ai/promptTemplate.ts`, `tests/ai/generateRecipes.test.ts`
      **Estimated scope:** M

### Task 6: Recipe generation API endpoint

**Description:** `POST /api/recipes/generate` — validates request body with Zod, enforces per-user daily rate limit, calls the AI wrapper, returns recipes.
**Acceptance criteria:**

- [ ] Rejects invalid/empty ingredient lists with 400
- [ ] Enforces rate limit (e.g. 20 generations/day/user), returns 429 when exceeded
- [ ] Returns AI-generated recipes as JSON on success
      **Verification:**
- [ ] API route test: valid request → 200 with recipes
- [ ] API route test: over rate limit → 429
      **Dependencies:** Task 4, Task 5
      **Files:** `app/api/recipes/generate/route.ts`, `lib/rateLimit.ts`
      **Estimated scope:** M

### Task 7: Recipe results UI

**Description:** Display AI-generated recipes as cards with loading and error states.
**Acceptance criteria:**

- [ ] Loading spinner while waiting for AI response
- [ ] Error state with retry option if generation fails
- [ ] Recipes render with title, ingredients, instructions
      **Verification:**
- [ ] Manual check: full flow from ingredient input to seeing recipe cards
      **Dependencies:** Task 6
      **Files:** `components/RecipeCard.tsx`, `app/(dashboard)/generate/page.tsx`
      **Estimated scope:** S

## Checkpoint: After Tasks 4-7

- [ ] Logged-in user can type ingredients and receive AI recipe suggestions end-to-end
- [ ] AI failure shows a graceful fallback, not a crash
- [ ] Review with human before proceeding

## Phase 3: Save & Meal Plan

### Task 8: Save/unsave recipe

**Description:** Add save button to `RecipeCard`; API to create/delete `SavedRecipe` rows.
**Acceptance criteria:**

- [ ] Clicking save persists the recipe to the user's favorites
- [ ] Clicking again unsaves it
      **Verification:**
- [ ] API route test for save/unsave
- [ ] Manual check: state reflects saved/unsaved correctly
      **Dependencies:** Task 7
      **Files:** `app/api/recipes/save/route.ts`, `components/RecipeCard.tsx`
      **Estimated scope:** S

### Task 9: Favorites page

**Description:** Page listing the user's saved recipes.
**Acceptance criteria:**

- [ ] Shows all recipes the user has saved
- [ ] Empty state when no favorites yet
      **Verification:**
- [ ] Manual check: save 2 recipes, confirm both appear
      **Dependencies:** Task 8
      **Files:** `app/(dashboard)/favorites/page.tsx`
      **Estimated scope:** S

### Task 10: Weekly meal plan generation

**Description:** API + logic to build a `MealPlan` with `MealPlanEntry` rows assigning recipes (saved or newly generated) to days/meal types for a week.
**Acceptance criteria:**

- [ ] User can create a new week's meal plan
- [ ] Each day can have breakfast/lunch/dinner assigned
      **Verification:**
- [ ] API route test: creating a plan persists entries correctly
      **Dependencies:** Task 9
      **Files:** `app/api/mealplan/route.ts`, `prisma/schema.prisma` (if entries need adjustment)
      **Estimated scope:** M

### Task 11: Meal plan calendar UI

**Description:** Weekly calendar view showing assigned recipes per day/meal slot.
**Acceptance criteria:**

- [ ] 7-day grid renders with assigned meals
- [ ] User can add/remove a recipe from a slot
      **Verification:**
- [ ] Manual check: assign a recipe to Monday dinner, confirm it displays
      **Dependencies:** Task 10
      **Files:** `app/(dashboard)/mealplan/page.tsx`, `components/MealPlanCalendar.tsx`
      **Estimated scope:** M

## Checkpoint: After Tasks 8-11

- [ ] User can save a recipe and see it on Favorites
- [ ] User can build and view a 7-day meal plan
- [ ] Review with human before proceeding

## Phase 4: Polish & Deploy

### Task 12: Responsive + state polish

**Description:** Pass over all pages for mobile responsiveness and consistent loading/empty/error states.
**Acceptance criteria:**

- [ ] All pages usable on a 375px-wide viewport
- [ ] Every async action has a visible loading state
      **Verification:**
- [ ] Manual check on mobile viewport + desktop
      **Dependencies:** Task 11
      **Files:** various components
      **Estimated scope:** M

### Task 13: Tests

**Description:** Fill out unit tests (AI wrapper, validation schemas), API route tests, and one Playwright E2E happy-path test (signup → generate → save → meal plan).
**Acceptance criteria:**

- [ ] Coverage on `lib/` and `app/api/` reaches ~70%+
- [ ] E2E happy path passes
      **Verification:**
- [ ] `npm test -- --coverage`
- [ ] `npx playwright test`
      **Dependencies:** Task 12
      **Files:** `tests/**`, `e2e/**`
      **Estimated scope:** M

### Task 14: Deploy

**Description:** Deploy to Vercel, connect production Neon DB, set env vars (Claude API key, NextAuth secret, DB URL), write README with setup instructions and live demo link.
**Acceptance criteria:**

- [ ] App is live and publicly accessible
- [ ] README documents setup, tech stack, and demo link
      **Verification:**
- [ ] Manual check: full user flow works on the deployed URL from a fresh/incognito session
      **Dependencies:** Task 13
      **Files:** `README.md`, Vercel project settings
      **Estimated scope:** S

## Checkpoint: Complete

- [ ] All success criteria in spec.md met
- [ ] Live demo link works
- [ ] Ready to add to portfolio
