/** Three months before expiry: the regulation's last day to apply (point 46). Light, so /export can show it before docx loads. */
export function applyByDate(validUntil: string | null): string | null {
  if (!validUntil) return null;
  const d = new Date(validUntil + "T00:00:00Z");
  d.setUTCMonth(d.getUTCMonth() - 3);
  return d.toISOString().slice(0, 10);
}
