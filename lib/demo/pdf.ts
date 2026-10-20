import "server-only";

/**
 * Minimal one-page PDF writer for the demo certificates. No dependency, no embedded font:
 * Helvetica from the standard 14 fonts, with a /Differences encoding that maps bytes 128+ to the
 * Latvian glyphs (amacron, ccaron, gcommaaccent...) every viewer ships for the standard fonts.
 */

const GLYPHS: Record<string, string> = {
  ā: "amacron", Ā: "Amacron", ē: "emacron", Ē: "Emacron", ī: "imacron", Ī: "Imacron", ū: "umacron", Ū: "Umacron",
  č: "ccaron", Č: "Ccaron", ģ: "gcommaaccent", Ģ: "Gcommaaccent", ķ: "kcommaaccent", Ķ: "Kcommaaccent",
  ļ: "lcommaaccent", Ļ: "Lcommaaccent", ņ: "ncommaaccent", Ņ: "Ncommaaccent", š: "scaron", Š: "Scaron",
  ž: "zcaron", Ž: "Zcaron", ö: "odieresis", Ö: "Odieresis", ü: "udieresis", Ü: "Udieresis", õ: "otilde", ä: "adieresis",
  "·": "periodcentered",
};
const CHARS = Object.keys(GLYPHS);
const CODE = new Map(CHARS.map((c, i) => [c, 128 + i]));
const DIFFERENCES = `[128 ${CHARS.map((c) => `/${GLYPHS[c]}`).join(" ")}]`;

/** A PDF string literal in the custom encoding; unknown characters become "?" */
function str(text: string): string {
  let out = "";
  for (const ch of text) {
    const code = CODE.get(ch);
    if (code) out += String.fromCharCode(code);
    else if (ch === "(" || ch === ")" || ch === "\\") out += `\\${ch}`;
    else out += ch.charCodeAt(0) < 128 ? ch : "?";
  }
  return `(${out})`;
}

export type PdfLine = { text: string; size: number; bold?: boolean; gap?: number };

/** Wrap a line at roughly `max` characters on word boundaries */
export function wrap(text: string, max: number): string[] {
  const lines: string[] = [];
  let cur = "";
  for (const w of text.split(/\s+/)) {
    if (cur && (cur + " " + w).length > max) {
      lines.push(cur);
      cur = w;
    } else cur = cur ? `${cur} ${w}` : w;
  }
  if (cur) lines.push(cur);
  return lines;
}

/** A4 landscape certificate: text lines top to bottom, a diagonal watermark, a footer note */
export function certificatePdf(lines: PdfLine[], watermark: string, footer: string): Buffer {
  const W = 842;
  const H = 595;
  const ops: string[] = [];
  // frame
  ops.push("0.75 w 0.2 0.25 0.35 RG 28 28 786 539 re S 0.5 w 36 36 770 523 re S");
  // watermark, light grey, rotated ~30 degrees
  const a = Math.PI / 6;
  ops.push(
    `BT /F2 120 Tf 0.9 g ${Math.cos(a).toFixed(4)} ${Math.sin(a).toFixed(4)} ${(-Math.sin(a)).toFixed(4)} ${Math.cos(a).toFixed(4)} 170 120 Tm ${str(watermark)} Tj ET`,
  );
  // y is the baseline: step down by the line's own size first, so a large line never overlaps the one above
  let y = 525;
  for (const l of lines) {
    y -= (l.gap ?? 0) + l.size;
    ops.push(`BT /${l.bold ? "F2" : "F1"} ${l.size} Tf 0.1 0.12 0.18 rg 70 ${y.toFixed(1)} Td ${str(l.text)} Tj ET`);
    y -= l.size * 0.4;
  }
  ops.push(`BT /F1 9 Tf 0.35 0.38 0.45 rg 70 52 Td ${str(footer)} Tj ET`);
  const content = ops.join("\n");

  const font = (base: string) => `<< /Type /Font /Subtype /Type1 /BaseFont /${base} /Encoding << /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences ${DIFFERENCES} >> >>`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
    font("Helvetica"),
    font("Helvetica-Bold"),
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
    `<< /Title ${str(watermark)} /Producer (Medserti demo) >>`,
  ];

  let pdf = "%PDF-1.4\n%\xe2\xe3\xcf\xd3\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info ${objects.length} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  // every character above is a single byte (custom encoding), so latin1 keeps the xref offsets exact
  return Buffer.from(pdf, "latin1");
}
