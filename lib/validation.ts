/* Field rules shared by the forms and the API routes, so the browser and the server reject the same input. Client-safe. */

const NAME_MIN = 2;
export const NAME_MAX = 60;
const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 32;
export const EMAIL_MAX = 254;
export const SPECIALTY_MAX = 120;
export const CERT_NO_MAX = 30;
const MESSAGE_MIN = 10;
export const MESSAGE_MAX = 2000;
/** "Report a problem" message */
export const FEEDBACK_MAX = 1000;

/** Letters of any alphabet (Latvian ā, č, Russian ж), joined by single spaces, hyphens or apostrophes: "Anna-Marija O'Brien" */
const NAME = /^[\p{L}\p{M}]+(?:[ '’-][\p{L}\p{M}]+)*$/u;
/** Free text such as a specialty: letters, digits, spaces and plain punctuation; no emoji or symbols */
const PLAIN_TEXT = /^[\p{L}\p{M}\p{N} .,;:'’"()/&+–-]*$/u;
/** Certificate or register number: letters, digits and - / . */
const CERT_NO = /^[\p{L}\p{N} ./-]*$/u;
export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Length in characters as people count them (an emoji is one, not two) */
const charCount = (s: string) => [...s].length;

export const validName = (s: string) => {
  const v = s.trim().replace(/\s+/g, " ");
  return charCount(v) >= NAME_MIN && charCount(v) <= NAME_MAX && NAME.test(v);
};
export const validPlainText = (s: string, max: number) => charCount(s.trim()) <= max && PLAIN_TEXT.test(s.trim());
export const validCertNo = (s: string) => charCount(s.trim()) <= CERT_NO_MAX && CERT_NO.test(s.trim());
export const validEmail = (s: string) => s.trim().length <= EMAIL_MAX && EMAIL.test(s.trim());
export const validPassword = (s: string) => charCount(s) >= PASSWORD_MIN && charCount(s) <= PASSWORD_MAX;
/** A message may hold any text people type, but not control characters */
// eslint-disable-next-line no-control-regex
export const validMessage = (s: string) => charCount(s.trim()) >= MESSAGE_MIN && charCount(s.trim()) <= MESSAGE_MAX && !/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/.test(s);

/** "  anna   bērziņa " -> "anna bērziņa" */
export const tidyName = (s: string) => s.trim().replace(/\s+/g, " ");
