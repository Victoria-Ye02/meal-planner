import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import {
  authorizeCredentials,
  jwtCallback,
  sessionCallback,
} from "@/lib/authCallbacks";

// The actual auth logic (credential verification, JWT/session shaping)
// lives in `lib/authCallbacks.ts` — see that file's header comment for why
// it's split out (importing `next-auth` itself breaks under Vitest/Node,
// so the unit-testable logic can't live in this file).
export const { handlers, auth, signIn, signOut } = NextAuth({
  session: {
    // JWT sessions: no NextAuth adapter/Session table exists in the Prisma
    // schema (Task 2 only defines the app's own domain models), so the
    // session is encoded entirely in the signed JWT rather than looked up
    // from the database on every request.
    strategy: "jwt",
  },
  pages: {
    signIn: "/login",
  },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    // Adapted rather than passed by reference: NextAuth's real `User`/
    // `Session` types (`User | AdapterUser`, `AdapterUser & User`) don't
    // structurally match `authCallbacks.ts`'s minimal `AppUser` shape
    // closely enough for TypeScript to accept the whole object directly
    // (nullable `email`, and an intersection type with no synthesized
    // index signature). Re-building a plain `{ id, email }` literal from
    // the known-present fields sidesteps that friction while calling the
    // exact same tested logic.
    async jwt({ token, user }) {
      return jwtCallback({
        token,
        user: user ? { id: user.id, email: user.email ?? undefined } : undefined,
      });
    },
    async session({ session, token }) {
      const result = await sessionCallback({
        session: {
          user: session.user
            ? { id: session.user.id, email: session.user.email ?? undefined }
            : undefined,
        },
        token,
      });
      if (session.user && result.user?.id) {
        session.user.id = result.user.id;
      }
      return session;
    },
  },
});
