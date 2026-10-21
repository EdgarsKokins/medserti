import type { Profile } from "./types";

/** Sign-up is finished once the certificate (or, for nurses, registration) dates are in */
export const profileComplete = (p: Pick<Profile, "certificateIssued" | "certificateExpires">) => !!(p.certificateIssued || p.certificateExpires);
