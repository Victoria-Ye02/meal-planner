# Implementation Plan: AI-Powered Recipe & Meal Planner

## Overview

Next.js full-stack app where a user enters ingredients/preferences, an AI (Claude API) generates recipe suggestions, and the user can save favorites and build a weekly meal plan. Built vertically: each phase ends with a working, demoable slice.

## Architecture Decisions

- **Auth:** Email/password via NextAuth (simplest for solo/portfolio scope; OAuth can be added later)
- **AI provider:** Claude API, called only from server-side API routes (never exposed to client) — mitigates key leakage and prompt injection
- **Database:** PostgreSQL via Prisma, hosted on Neon (free tier works for a portfolio demo)
- **Image handling:** MVP uses stock/placeholder images per recipe category, not AI-generated images (keeps AI cost down) — deferred, not skipped
- **Rate limiting:** Simple per-user daily cap on AI generation calls to control API cost on a public demo

## Task List

### Phase 1: Foundation

- [ ] Task 1: Project scaffolding (Next.js + TS + Tailwind + lint/format config)
- [ ] Task 2: Database schema + Prisma + Neon connection
- [ ] Task 3: Auth (NextAuth email/password, signup/login pages)

### Checkpoint: Foundation

- [ ] `npm run build` succeeds
- [ ] User can sign up and log in
- [ ] DB connection verified (`npx prisma studio` shows tables)
- [ ] Review with human before proceeding

### Phase 2: Core AI Recipe Feature

- [ ] Task 4: Ingredient input UI + form validation
- [ ] Task 5: Claude API wrapper + recipe-generation prompt template (`lib/ai/`)
- [ ] Task 6: `POST /api/recipes/generate` endpoint (validates input, calls AI, returns structured recipes)
- [ ] Task 7: Recipe results UI (`RecipeCard`, loading/error states)

### Checkpoint: Core Feature

- [ ] End-to-end: logged-in user types ingredients → sees 3-5 AI recipe suggestions
- [ ] AI failure (timeout/error) shows graceful fallback, not a crash
- [ ] Review with human before proceeding

### Phase 3: Save & Meal Plan

- [ ] Task 8: Save/unsave recipe (`SavedRecipe` API + button on `RecipeCard`)
- [ ] Task 9: Favorites page (list saved recipes)
- [ ] Task 10: Weekly meal plan generation (schema + API to assign recipes to days/meals)
- [ ] Task 11: Meal plan calendar UI

### Checkpoint: Save & Plan

- [ ] User can save a recipe and see it on Favorites
- [ ] User can generate and view a 7-day meal plan
- [ ] Review with human before proceeding

### Phase 4: Polish & Deploy

- [ ] Task 12: Responsive pass (mobile/desktop) + empty/loading/error states everywhere
- [ ] Task 13: Tests — unit (AI prompt builder, validation), API route tests (mocked AI), one Playwright E2E happy path
- [ ] Task 14: Deploy to Vercel + Neon prod DB + env vars + README with live demo link

### Checkpoint: Complete

- [ ] All success criteria from spec.md met
- [ ] Live demo link works from a fresh browser session
- [ ] Ready to add to portfolio

## Risks and Mitigations

| Risk                                                          | Impact     | Mitigation                                                                                |
| ------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------- |
| Claude API cost on public demo                                | Medium     | Per-user daily rate limit; consider a "demo mode" with cached sample responses            |
| AI returns malformed/unparseable recipe JSON                  | Medium     | Use structured output / strict prompt format + server-side schema validation with retry   |
| Prompt injection via ingredient input                         | Low-Medium | Never pass raw user input into system prompt; sanitize and constrain to a data field only |
| Scope creep (adding image recognition, OAuth, etc. mid-build) | Medium     | Stick to MVP task list; log extras as "Phase 5 / stretch goals" instead                   |

## Open Questions

- Deploy under custom domain or default Vercel URL? (default is fine for MVP)
- Any specific visual style/brand for the portfolio (colors, fonts)? — can default to a clean neutral theme if no preference
