import type { MetadataRoute } from "next";

/** Public pages are open to search engines; the app, its API and the admin are not worth crawling */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/admin", "/dashboard", "/certificates", "/courses", "/profile", "/export"] },
    sitemap: "https://medserti.lv/sitemap.xml",
  };
}
