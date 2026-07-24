import { prisma } from "@/lib/db";
import { verifyPassword } from "@/lib/password";
import { loginSchema } from "@/lib/validations/auth";

/**
 * Pure auth logic, deliberately kept in a module that does NOT import the
 * `next-auth` package (unlike `lib/auth.ts`, which wires these functions
 * into `NextAuth(...)`). Importing `next-auth` itself pulls in
 * `next-auth/lib/env.js`, which imports `next/server` — that resolves fine
 * under Next.js's own runtime but fails to resolve under plain Node/Vitest
 * ("Cannot find module .../next/server"). Keeping this logic here, with no
 * next-auth dependency, is what makes it possible to unit-test directly.
 */

/**
 * Minimal shape of the token this app's JWT/session callbacks read/write.
 * `extends Record<string, unknown>` to mirror how `next-auth`'s own `JWT`
 * type is declared (it carries provider-specific extra fields like `sub`,
 * `iat`, `exp`), which keeps the real JWT object structurally assignable
 * to this when `lib/auth.ts` passes it straight through by reference.
 */
export interface AppToken extends Record<string, unknown> {
  id?: string;
}

/**
 * Minimal shape of a user/session-user object. `lib/auth.ts` reconstructs
 * a plain literal of this shape from NextAuth's real (structurally
 * incompatible — nullable `email`, no synthesized index signature on its
 * `AdapterUser & User` intersection) types before calling these functions,
 * so this can stay a plain interface.
 */
export interface AppUser {
  id?: string;
  email?: string;
}

/** Minimal shape of the session object the `session` callback receives. */
export interface AppSession {
  user?: AppUser;
}

/**
 * Validates credentials against the database and returns the safe user
 * fields NextAuth is allowed to carry forward into the JWT, or `null` for
 * any failure (bad shape, unknown email, wrong password) — NextAuth's
 * Credentials provider treats a `null` return as "authentication failed"
 * without distinguishing why, which is deliberate: it avoids leaking
 * whether a given email is registered.
 */
export async function authorizeCredentials(
  rawCredentials: Partial<Record<string, unknown>> | undefined,
): Promise<AppUser | null> {
  const parsed = loginSchema.safeParse(rawCredentials);
  if (!parsed.success) {
    return null;
  }
  const { email, password } = parsed.data;

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return null;
  }

  const passwordMatches = await verifyPassword(password, user.passwordHash);
  if (!passwordMatches) {
    return null;
  }

  // Only ever return the fields the session/JWT is allowed to carry.
  // `passwordHash` must never leave this function.
  return { id: user.id, email: user.email };
}

/** Copies the authenticated user's id onto the JWT on initial sign-in. */
export async function jwtCallback({
  token,
  user,
}: {
  token: AppToken;
  user?: AppUser;
}): Promise<AppToken> {
  if (user?.id) {
    token.id = user.id;
  }
  return token;
}

/** Copies the JWT's user id onto the session object exposed to the app. */
export async function sessionCallback({
  session,
  token,
}: {
  session: AppSession;
  token: AppToken;
}): Promise<AppSession> {
  if (session.user && typeof token.id === "string") {
    session.user.id = token.id;
  }
  return session;
}
