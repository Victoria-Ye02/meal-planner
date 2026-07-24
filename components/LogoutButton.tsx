"use client";

import { useFormStatus } from "react-dom";

/**
 * Submit button for the `signOut` server action forms. Must be rendered
 * inside a `<form action={...}>` — `useFormStatus` reads pending state from
 * the nearest parent form, so this can't be inlined into the (server
 * component) layout/page that renders the form itself.
 */
export function LogoutButton({ className }: { className?: string }) {
  const { pending } = useFormStatus();

  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? "Logging out…" : "Log out"}
    </button>
  );
}
