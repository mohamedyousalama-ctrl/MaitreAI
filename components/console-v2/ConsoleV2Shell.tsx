"use client";

// ============================================================================
// console_v2 — the app shell (PR 1). The canonical wrapper every console_v2 page
// renders inside: it establishes the language (LangProvider, Arabic-first RTL),
// applies the `.kv-console` font/RTL base, paints the emerald console background,
// and lays out the one rail beside the page content. Pages are children.
//
// This is the shell standard PRs 4–17 build their pages on. It deliberately does
// NOT re-implement data bootstrap / role gating — those belong to the page PRs
// that wire real endpoints; PR 1 is the chrome + the contracts.
// ============================================================================

import type { ReactNode } from "react";
import { LangProvider, useLang } from "@/lib/i18n/lang";
import { Rail } from "./Rail";

function ShellFrame({ tenantName, children }: { tenantName?: string; children: ReactNode }) {
  const { dir } = useLang();
  return (
    <div
      className="kv-console"
      dir={dir}
      style={{
        display: "flex",
        height: "100vh",
        width: "100%",
        overflow: "hidden",
        background: "var(--kv-bg-console)",
        color: "var(--kv-text)",
      }}
    >
      <Rail tenantName={tenantName} />
      <main
        className="kv-scroll"
        style={{ flex: 1, minWidth: 0, height: "100%", overflowY: "auto", padding: "24px 28px" }}
      >
        {children}
      </main>
    </div>
  );
}

export function ConsoleV2Shell({
  lang = "ar",
  tenantName,
  children,
}: {
  lang?: string;
  tenantName?: string;
  children: ReactNode;
}) {
  return (
    <LangProvider lang={lang}>
      <ShellFrame tenantName={tenantName}>{children}</ShellFrame>
    </LangProvider>
  );
}
