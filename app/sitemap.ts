import type { MetadataRoute } from "next";
import { LOCALES, localePath, PUBLIC_PATHS } from "@/lib/locale";

const BASE = "https://medserti.lv";

/** Every public page in every language, each listing its other language versions (hreflang) */
export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) =>
    LOCALES.map((locale) => ({
      url: `${BASE}${localePath(path, locale)}`,
      changeFrequency: "monthly" as const,
      priority: path === "/" ? 1 : 0.5,
      alternates: { languages: Object.fromEntries(LOCALES.map((l) => [l, `${BASE}${localePath(path, l)}`])) },
    })),
  );
}
