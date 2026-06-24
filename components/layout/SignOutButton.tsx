"use client";

import { useState } from "react";
import { LogOut, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Renders nothing in demo mode (Supabase not configured) — there is no session
// to end. Logout posts to the server route /auth/signout, which clears the auth
// cookies server-side and redirects to /login (robust — the old client-side
// signOut + router.push raced the middleware and could fail to log out).
export function SignOutButton() {
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  if (!supabase) return null;

  return (
    <form action="/auth/signout" method="post" onSubmit={() => setLoading(true)}>
      <button
        type="submit"
        title="تسجيل الخروج"
        className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      >
        {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <LogOut className="h-5 w-5" />}
      </button>
    </form>
  );
}
