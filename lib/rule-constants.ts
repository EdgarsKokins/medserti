/* The rule numbers on their own, without the specialty list, so the UI dictionaries can quote them (lib/i18n/*.ts). */

/**
 * Recertification rules from Cabinet Regulation No. 391 "Ārstniecības personu sertifikācijas kārtība"
 * (18 June 2024, consolidated text as of 21 Aug 2026 with amendments No. 703 and No. 487, likumi.lv/ta/id/352922).
 * Annex 4 is the No. 487 version (18 Aug 2026). It dropped the old caps on items 5-6 (20%) and 19-21 (60%),
 * which this app never applied, and added items 4.1 (12 TIP) and 30 (10 TIP per opinion).
 */
export const RULES = {
  sourceUrl: "https://likumi.lv/ta/id/352922",
  /** point 6: certificate issued for five years */
  validityYears: 5,
  /** point 51: 250 TIP doctors/dentists/functional specialists, 150 other professions, 100 methods */
  points: { doctorTier: 250, otherProfessions: 150, method: 100 },
  /** point 51: at least 60% from activity related to the certified specialty */
  specialtyShare: 0.6,
  /** point 51: at least 8 TIP from emergency medical care training, incl. at least 4 practical hours. Added by No. 703 point 1.22,
   * in force from 01 May 2026 (No. 703 point 4), with no transitional rule, so it applies to every recertification from then */
  emergencyMinPoints: 8,
  emergencyMinPracticalHours: 4,
  /** Annex 4 footnote 3, item 10 (practical training): "nedrīkst pārsniegt 16 % no resertifikācijai specialitātē nepieciešamā tālākizglītības punktu skaita" */
  practicalCapShare: 0.16,
  /** point 86: functional specialists except physiotherapists may recertify on 150 TIP until this date */
  functionalTransitionUntil: "2028-01-01",
  functionalTransitionPoints: 150,
} as const;

/**
 * Nurses are not certified (Medical Treatment Law Section 26(2)). They re-register with the Health Inspectorate
 * every 5 years on at least 100 academic hours, 1 hour = 1 TIP (Cabinet Regulation No. 630, points 20, 25, 26.3, Annex 6;
 * likumi.lv/ta/id/355331).
 */
export const NURSE_RULES = {
  sourceUrl: "https://likumi.lv/ta/id/355331",
  points: 100,
  /** point 33: "Pārreģistrācijas termiņš reģistrā ir pieci gadi" */
  validityYears: 5,
  /**
   * point 26.3, in force from 01 Jan 2027 (point 64): "neatliekamās medicīniskās palīdzības sniegšanā (8 akadēmisko stundu
   * apjomā), infekciju kontrolē (4 akadēmisko stundu apjomā) un pacientu drošībā (8 akadēmisko stundu apjomā), kā arī vismaz
   * 50 akadēmisko stundu apjomā no māsas (vispārējās aprūpes māsas) kompetences tēmām". Before that, point 25 asks for
   * emergency care training with no minimum. Applies when the registration ends on or after this date.
   */
  emergencyFrom: "2027-01-01",
  emergencyMinHours: 8,
  infectionControlMinHours: 4,
  patientSafetyMinHours: 8,
  /** "kā arī" = in addition: hours of the three topics above do not also count here */
  nursingMinHours: 50,
} as const;
