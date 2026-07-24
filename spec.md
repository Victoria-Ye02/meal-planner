# Spec: AI-Powered Recipe & Meal Planner (Portfolio Project)

## Objective
User ရဲ့ လက်ရှိရှိနေတဲ့ ingredients၊ dietary preference၊ allergy အချက်အလက်တွေကို အခြေခံပြီး AI ကနေ recipe suggestion နှင့် weekly meal plan ကို auto-generate လုပ်ပေးတဲ့ full-stack web application တစ်ခု ဖြစ်ပါတယ်။

**Target user:** ချက်ပြုတ်ဖို့ idea ရှာချင်တဲ့သူ၊ food waste လျှော့ချချင်တဲ့သူ၊ diet restriction ရှိတဲ့သူ။

**Purpose:** Portfolio piece အနေနဲ့ frontend, backend, database, AI integration လေးခုစလုံးကို တစ်ချိန်တည်း demonstrate လုပ်ဖို့။

**Success looks like:** User က account ဖွင့်ပြီး ingredients list ရိုက်ထည့်လိုက်ရင် AI က recipe 3-5 ခု suggest လုပ်ပေးနိုင်ပြီး၊ user က favorite recipe တွေကို save လုပ်နိုင်ပြီး weekly meal plan ကို ကြည့်နိုင်ရမယ်။

## Tech Stack
- **Frontend:** Next.js 14+ (App Router), React, TypeScript, Tailwind CSS
- **Backend:** Next.js API Routes (Route Handlers)
- **Database:** PostgreSQL + Prisma ORM
- **Auth:** NextAuth.js (email/password or Google OAuth)
- **AI:** Claude API (Anthropic) — recipe generation, ingredient substitution suggestions
- **Hosting:** Vercel (app) + Neon or Supabase (managed Postgres)
- **State/Data fetching:** React Query (TanStack Query) or Next.js server actions

## Commands
```
Dev:      npm run dev
Build:    npm run build
Start:    npm run start
Lint:     npm run lint --fix
Test:     npm test -- --coverage
DB Migrate: npx prisma migrate dev
DB Studio:  npx prisma studio
```

## Project Structure
```
app/                  → Next.js App Router pages & layouts
app/api/              → API route handlers (recipes, auth, ai)
components/           → Reusable React components
components/ui/        → Base UI primitives (buttons, inputs, cards)
lib/                  → Shared utilities (db client, AI client, auth config)
lib/ai/               → AI prompt templates & Claude API wrapper
prisma/               → Schema + migrations
prisma/schema.prisma  → Database models
tests/                → Unit tests
e2e/                  → Playwright end-to-end tests
public/               → Static assets
```

## Data Model (initial)
- **User** — id, email, passwordHash, dietaryPreferences[], allergies[], createdAt
- **Recipe** — id, title, ingredients[], instructions, aiGenerated (bool), imageUrl, createdBy, createdAt
- **SavedRecipe** — userId, recipeId, savedAt
- **MealPlan** — id, userId, weekStartDate
- **MealPlanEntry** — mealPlanId, recipeId, dayOfWeek, mealType (breakfast/lunch/dinner)

## Code Style
```tsx
// Functional components, named exports, explicit prop types
type RecipeCardProps = {
  recipe: Recipe;
  onSave: (id: string) => void;
};

export function RecipeCard({ recipe, onSave }: RecipeCardProps) {
  return (
    <div className="rounded-lg border p-4 shadow-sm">
      <h3 className="font-semibold">{recipe.title}</h3>
      <button onClick={() => onSave(recipe.id)}>Save</button>
    </div>
  );
}
```
- camelCase for variables/functions, PascalCase for components/types
- Server-side validation with Zod on every API route
- No `any` types — strict TypeScript mode on

## Testing Strategy
- **Unit tests (Vitest):** utility functions, AI prompt builders, validation schemas
- **Integration tests:** API routes (mock Claude API responses)
- **E2E (Playwright):** signup → add ingredients → get AI suggestion → save recipe → view meal plan
- Coverage target: 70%+ on `lib/` and `app/api/`

## Boundaries
- **Always do:** validate all user input with Zod, run lint + tests before commits, handle AI API failures gracefully (fallback UI, no silent crashes)
- **Ask first:** changing the database schema after initial migration, adding new paid dependencies/APIs, changing auth provider
- **Never do:** commit API keys/secrets, store plaintext passwords, send unvalidated user input directly to the AI prompt (prompt injection risk)

## Success Criteria
- [ ] User can sign up / log in
- [ ] User can input a list of ingredients and preferences
- [ ] AI returns 3-5 relevant recipe suggestions within ~5 seconds
- [ ] User can save recipes to favorites
- [ ] User can generate and view a 7-day meal plan
- [ ] App is deployed and publicly accessible (live demo link for portfolio)
- [ ] Responsive on mobile and desktop

## Open Questions
1. Auth method — email/password only, or add Google OAuth too?
2. AI provider budget — Claude API usage costs, need a free-tier fallback or rate limiting for public demo?
3. Image recognition (upload fridge photo) — include in MVP or as a stretch feature later?
4. Recipe images — AI-generated (extra cost) or stock/placeholder images?
