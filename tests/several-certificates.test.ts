// Certificates in more than one specialty (Kārlis Stirāns: neurologist and algologist). Each is recertified on its own
// (Reg. 391 point 51): own period, own total, own 60% in its specialty; one upload counts toward one of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { assignedCert, certProgress } from "../lib/certAssign";
import { asProfile, pickCert, profileCerts } from "../lib/profileCerts";
import { computeProgress } from "../lib/rules";
import { dueReminder, reminderKey } from "../lib/notifications";
import type { CmeCertificate, Profile } from "../lib/types";

const ALGO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const profile: Profile = {
  fullName: "Kārlis Tests", profession: "doctor", specialty: "Neirologs", specialtyCode: null, certificationKind: "specialty",
  certificateNumber: "", certificateIssued: "2024-01-15", certificateExpires: null,
  extraCertificates: [{ id: ALGO, specialty: "Algologs", specialtyCode: "4", certificateNumber: "", certificateIssued: "2025-03-01", certificateExpires: null }],
};
const cert = (id: string, over: Partial<CmeCertificate>): CmeCertificate =>
  ({ id, userId: "u", fileName: `${id}.pdf`, filePath: "", contentType: "application/pdf", uploadedAt: "2026-01-01T00:00:00Z", status: "confirmed",
    title: "", organizer: "", date: "2026-05-10", endDate: null, points: 10, academicHours: null, category: "professional_meeting",
    inSpecialty: false, emergencyCare: false, practicalHours: null, approvalId: null, country: "LV", confidence: null, parseNotes: null, ...over }) as CmeCertificate;

test("an upload goes to the certificate whose specialty it names; the rest to the main one", () => {
  assert.equal(assignedCert(cert("a", { title: "Algoloģijas seminārs" }), profile), ALGO);
  assert.equal(assignedCert(cert("b", { title: "Neiroloģijas kongress" }), profile), "main");
  assert.equal(assignedCert(cert("c", { title: "BLS un AED apmācība" }), profile), "main");
  // the title is more specific than who organised it
  assert.equal(assignedCert(cert("g", { title: "Algoloģijas kursi", organizer: "Latvijas Neirologu biedrība" }), profile), ALGO);
  assert.equal(assignedCert(cert("h", { title: "Sēde", organizer: "Latvijas Neirologu biedrība" }), profile), "main");
});

test("the user's choice wins, and a choice of a removed certificate falls back", () => {
  assert.equal(assignedCert(cert("d", { title: "BLS un AED apmācība", countsFor: ALGO }), profile), ALGO);
  assert.equal(assignedCert(cert("e", { title: "Algoloģijas seminārs", countsFor: "main" }), profile), "main");
  assert.equal(assignedCert(cert("f", { title: "Algoloģijas seminārs", countsFor: "gone" }), profile), ALGO);
});

test("each certificate has its own period, total and specialty share; nothing counts twice", () => {
  const uploads = [
    cert("n1", { title: "Neiroloģijas kongress", points: 40, inSpecialty: true }),
    cert("a1", { title: "Algoloģijas seminārs", points: 30 }),
    cert("a2", { title: "BLS un AED apmācība", points: 8, emergencyCare: true, practicalHours: 4, countsFor: ALGO }),
  ];
  const main = certProgress(profile, uploads, pickCert(profile, "main"), new Date("2026-10-30"));
  const algo = certProgress(profile, uploads, pickCert(profile, ALGO), new Date("2026-10-30"));
  assert.deepEqual(main.certs.map((c) => c.id), ["n1"]);
  assert.deepEqual(algo.certs.map((c) => c.id), ["a1", "a2"]);
  assert.equal(main.progress.total, 40);
  assert.equal(algo.progress.total, 38);
  assert.equal(main.progress.required, 250);
  assert.equal(algo.progress.required, 250);
  // placed on algology by its specialty, the seminar is in algology's specialty; the BLS course the user moved is not
  assert.equal(algo.progress.specialty, 30);
  assert.equal(algo.progress.emergencyPoints, 8);
  assert.equal(main.progress.windowStart, "2024-01-15");
  assert.equal(algo.progress.windowStart, "2025-03-01");
});

test("one certificate: exactly the old progress", () => {
  const single: Profile = { ...profile, extraCertificates: undefined };
  const uploads = [cert("x", { title: "Algoloģijas seminārs", points: 12, inSpecialty: false })];
  const p = certProgress(single, uploads, pickCert(single, null)).progress;
  assert.deepEqual(p, computeProgress(single, uploads));
  assert.equal(profileCerts(single).length, 1);
});

test("nurses have one record, whatever the profile holds", () => {
  assert.equal(profileCerts({ ...profile, profession: "nurse" }).length, 1);
  assert.equal(asProfile(profile, pickCert(profile, ALGO)).specialty, "Algologs");
});

test("reminders: each certificate counts its own; the main one keeps the old key", () => {
  assert.equal(reminderKey("2030-03-01", 365), "2030-03-01:365");
  assert.equal(reminderKey("2030-03-01", 365, ALGO), `${ALGO}:2030-03-01:365`);
  const sent = [reminderKey("2030-03-01", 365)];
  assert.equal(dueReminder("2030-03-01", "2029-03-02", sent), null, "main already sent");
  assert.equal(dueReminder("2030-03-01", "2029-03-02", sent, ALGO)?.days, 365, "same end date, other certificate");
});
