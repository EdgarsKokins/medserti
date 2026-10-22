"use client";

import { createContext, use, useContext } from "react";
import dynamic from "next/dynamic";
import type { Dict } from "@/lib/i18n/en";
import { overlay } from "@/lib/i18n/overrides";
import { isLocale, type Locale } from "@/lib/locale";

/*
 * UI strings for client components, one language per page load.
 * Each dictionary is a separate chunk (LvDict, EnDict, RuDict), loaded with import() for the page's language only.
 * The <Preload> twin is the same import through next/dynamic: during SSR it adds the chunk to the page's preload list,
 * so the browser fetches it with the other scripts and hydration does not wait an extra round trip.
 * A language switch (router.refresh) loads the next chunk inside the transition; the page keeps its state.
 */

type Loaded = Promise<Dict> & { status?: "fulfilled"; value?: Dict };

const IMPORTS: Record<Locale, () => Promise<{ dict: Dict }>> = {
  lv: () => import("./LvDict"),
  en: () => import("./EnDict"),
  ru: () => import("./RuDict"),
};

const PRELOAD: Record<Locale, React.ComponentType> = {
  lv: dynamic(() => import("./LvDict")),
  en: dynamic(() => import("./EnDict")),
  ru: dynamic(() => import("./RuDict")),
};

const loaded: Partial<Record<Locale, Loaded>> = {};

function load(locale: Locale): Loaded {
  let p = loaded[locale];
  if (!p) {
    p = IMPORTS[locale]().then((m) => m.dict) as Loaded;
    // marks the promise as settled for use(), so later renders read it without suspending
    p.then((v) => Object.assign(p!, { status: "fulfilled", value: v }));
    loaded[locale] = p;
  }
  return p;
}

// in the browser, start on the page's language as soon as this module runs (the root layout sets <html lang>)
if (typeof document !== "undefined" && isLocale(document.documentElement.lang)) load(document.documentElement.lang);

const DictContext = createContext<{ locale: Locale; dict: Dict } | null>(null);

export default function DictProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  const dict = use<Dict>(load(locale) as Promise<Dict>);
  const Preload = PRELOAD[locale];
  return (
    <DictContext value={{ locale, dict }}>
      <Preload />
      {children}
    </DictContext>
  );
}

function useDictContext() {
  const c = useContext(DictContext);
  if (!c) throw new Error("useDict() outside <DictProvider>");
  return c;
}

/** The current language's dictionary with the /admin overrides on top (set by components/I18nOverrides.tsx) */
export function useDict(): Dict {
  const { locale, dict } = useDictContext();
  return overlay(locale, dict);
}
