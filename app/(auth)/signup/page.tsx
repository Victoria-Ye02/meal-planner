"use client";

import { signIn } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const data = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        setError(data?.error ?? "Something went wrong. Please try again.");
        return;
      }

      // Account created — sign the user straight in and land them on an
      // authenticated placeholder home page.
      const signInResult = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (signInResult?.error) {
        setError("Account created. Please log in.");
        router.push("/login");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Failed to reach the server. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 bg-background px-6 py-16">
      <div className="w-full max-w-sm rounded-card border border-border bg-surface p-7 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold tracking-tight text-foreground">
          Create an account
        </h1>
        <p className="mb-6 text-sm text-muted">
          Start turning what&apos;s in your kitchen into recipes.
        </p>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="rounded-control border border-border bg-background px-3 py-2.5 text-foreground transition-colors duration-200 ease-out-quart focus:border-primary"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              minLength={8}
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="rounded-control border border-border bg-background px-3 py-2.5 text-foreground transition-colors duration-200 ease-out-quart focus:border-primary"
            />
          </div>
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <button
            type="submit"
            disabled={isSubmitting}
            className="mt-1 inline-flex items-center justify-center rounded-control bg-primary px-3 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-colors duration-200 ease-out-quart hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isSubmitting ? "Creating account…" : "Sign up"}
          </button>
        </form>
        <p className="mt-5 text-sm text-muted">
          Already have an account?{" "}
          <Link
            href="/login"
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover"
          >
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
