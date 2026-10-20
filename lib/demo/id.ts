/** The public demo account's fixed id. Client-safe, so pages and components can check it without a fetch. */
export const DEMO_USER_ID = "00000000-0000-4000-8000-0000000de300";

export const isDemoUserId = (id: string | null | undefined): boolean => id === DEMO_USER_ID;
