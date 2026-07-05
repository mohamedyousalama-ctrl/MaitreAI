"use client";

// ============================================================================
// console_v2 — LangShell (item 4). The OUTERMOST wrapper for the whole /c group:
// it establishes the language (LangProvider, Arabic-first) and stamps `dir` on a
// full-height wrapper, so EVERY /c surface — including the chromeless login and
// tenant-picker (which have no rail) — reads one language and renders RTL. It
// deliberately carries NO rail and NO background, so login/select paint their own
// full-screen chrome; the authed area layers <AppFrame> (rail + main) on top.
// ============================================================================

import type { ReactNode } from "react";
import { LangProvider, useLang } from "@/lib/i18n/lang";

function DirWrapper({ children }: { children: ReactNode }) {
  const { dir } = useLang();
  return (
    <div dir={dir} style={{ minHeight: "100vh", width: "100%" }}>
      {children}
    </div>
  );
}

export function LangShell({ lang = "ar", children }: { lang?: string; children: ReactNode }) {
  return (
    <LangProvider lang={lang}>
      <DirWrapper>{children}</DirWrapper>
    </LangProvider>
  );
}
