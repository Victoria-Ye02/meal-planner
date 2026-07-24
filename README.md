# AI-Powered Recipe & Meal Planner

A full-stack app where you enter the ingredients you have on hand, get 3-5 AI-generated recipe suggestions, save your favorites, and build a 7-day meal plan.

**Live demo:** https://meal-planner-livid-theta.vercel.app

## Features

- Email/password authentication (NextAuth v5)
- Ingredient + dietary preference input, AI recipe generation (Claude via OpenRouter)
- Save/unsave recipes to favorites
- Weekly meal plan calendar (assign saved recipes to day/meal slots)
- Per-user daily rate limit on AI generation calls

## Tech Stack

- **Frontend:** Next.js 16 (App Router), React 19, TypeScript, Tailwind CSS v4
- **Backend:** Next.js API Route Handlers
- **Database:** PostgreSQL (Neon) + Prisma ORM 7
- **Auth:** NextAuth v5, email/password credentials
- **AI:** Claude models via [OpenRouter](https://openrouter.ai)'s OpenAI-compatible API
- **Testing:** Vitest (unit/integration), Playwright (E2E)
- **Hosting:** Vercel

## Local Setup

1. Clone the repo and install dependencies:
   ```bash
   git clone https://github.com/Victoria-Ye02/meal-planner.git
   cd meal-planner
   npm install
   ```

2. Copy `.env.example` to `.env` and fill in the values:
   ```bash
   cp .env.example .env
   ```

   | Variable | Description |
   |---|---|
   | `DATABASE_URL` | PostgreSQL connection string (a free [Neon](https://neon.tech) project works well) |
   | `NEXTAUTH_SECRET` | Random secret for session signing — generate with `openssl rand -base64 32` |
   | `NEXTAUTH_URL` | `http://localhost:3000` for local dev |
   | `OPENROUTER_API_KEY` | API key from [openrouter.ai](https://openrouter.ai) |

3. Run migrations and start the dev server:
   ```bash
   npx prisma migrate dev
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Commands

```
Dev:         npm run dev
Build:       npm run build
Start:       npm run start
Lint:        npm run lint
Unit tests:  npm test -- --coverage
E2E tests:   npm run e2e
DB migrate:  npx prisma migrate dev
DB Studio:   npx prisma studio
```

## Notes

- The AI provider is **OpenRouter**, not a native Anthropic API key — see `tasks/plan.md`'s Architecture Decisions for why.
- The Playwright E2E test (`e2e/happy-path.spec.ts`) exercises the full signup → generate → save → meal-plan flow against a real database and a real AI call. It's meant to be run manually/locally, not wired into per-push CI, since it writes permanent rows to whatever database `DATABASE_URL` points at.
