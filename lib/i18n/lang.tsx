"use client";

// ============================================================================
// console_v2 — runtime language context (PR 1: i18n as the app-shell standard).
//
// The Item-12 scaffold shipped the dictionary + direction helpers but no runtime
// carrier for "which language is this tree rendering in". The console_v2 shell is
// that carrier: <LangProvider> sets the language once (Arabic-first default) and
// also stamps `dir` on its wrapper, so every descendant reads the SAME language
// via useT()/useLang() instead of hardcoding "ar" or re-deciding direction. This
// is the ONE place the shell binds language → dictionary + direction.
// ============================================================================

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { DICTIONARY, type DictKey } from "@/lib/i18n/dictionary";
import { baseLang, dirFor, type Dir, type Lang } from "@/lib/i18n/dir";

interface LangValue {
  lang: Lang;
  dir: Dir;
  t: (key: DictKey) => string;
}

// Default: Arabic-first (فصحى), RTL — matches the root document direction.
const LangContext = createContext<LangValue>({
  lang: "ar",
  dir: "rtl",
  t: (key) => DICTIONARY.ar[key],
});

export function LangProvider({
  lang: langTag = "ar",
  children,
}: {
  /** Language tag ("ar", "en", "ar-SA"…); normalized to a base Lang. */
  lang?: string;
  children: ReactNode;
}) {
  const value = useMemo<LangValue>(() => {
    const lang = baseLang(langTag);
    return { lang, dir: dirFor(langTag), t: (key: DictKey) => DICTIONARY[lang][key] };
  }, [langTag]);

  return <LangContext.Provider value={value}>{children}</LangContext.Provider>;
}

/** The active language + direction for this subtree. */
export function useLang(): LangValue {
  return useContext(LangContext);
}

/** Sugar: the bound translator for the active language. `const tr = useT();`. */
export function useT(): (key: DictKey) => string {
  return useContext(LangContext).t;
}
