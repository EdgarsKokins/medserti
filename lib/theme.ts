/** Shared by the server layout and the client toggle (constants exported from a "use client" file are not readable on the server) */
export type Theme = "system" | "light" | "dark";
export const THEME_COOKIE = "theme";
export const isTheme = (v: unknown): v is Theme => v === "system" || v === "light" || v === "dark";
