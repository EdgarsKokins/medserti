/** Icons for Medserti's three parts (certificates, courses, lectures): the dashboard tiles and the sign-in panel */
const svg = { width: 34, height: 34, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };

export const IconDoc = () => (
  <svg {...svg}><path d="M7 3h7l4 4v13a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1z" /><path d="M14 3v4h4" /><path d="M9 13l2 2 4-4" /></svg>
);
export const IconCal = () => (
  <svg {...svg}><rect x="3.5" y="5" width="17" height="15" rx="2.5" /><path d="M3.5 10h17M8 3v4M16 3v4" /><circle cx="12" cy="15" r="1.4" fill="currentColor" /></svg>
);
export const IconPlay = () => (
  <svg {...svg}><rect x="3" y="5" width="18" height="14" rx="3" /><path d="M10.5 9.5v5l4-2.5z" fill="currentColor" /></svg>
);
