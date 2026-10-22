"use client";

import s from "./landing-visuals.module.css";
import { useWaitUntilSeen } from "./useWaitUntilSeen";

interface HowLabels {
  steps: { title: string; body: string }[];
  sampleTitle: string;
  sampleName: string;
  sampleCourse: string;
  sampleOrg: string;
  sampleDates: string;
  sampleCredits: string;
  readDate: string;
  readPoints: string;
  readPlace: string;
  readPlaceValue: string;
  ledgerTitle: string;
  ledgerTotal: string;
  checksDone: string[];
  checkSpecialty: string;
  deadline: string;
  readDateValue: string;
  remainingValue: string;
  deadlineValue: string;
  ledgerRows: { date: string; title: string; tip: number }[];
  docsZip: string;
  docsFiles: string[];
  docsCopies: string;
}

/**
 * One step: the stage renders finished by default (no JS, slow JS, arriving via #how).
 * Only a stage that starts below the fold is held in its "before" state and plays when scrolled to.
 */
function Step({ no, title, body, children }: { no: number; title: string; body: string; children: React.ReactNode }) {
  const [ref, waiting] = useWaitUntilSeen<HTMLLIElement>(0.4);
  return (
    <li ref={ref} className={waiting ? s.wait : undefined}>
      <div className={s.stage}>{children}</div>
      {/* number in its own column, so the title and the line under it start at the same edge */}
      <div className={s.stepHead}>
        <span className={s.stepNo} aria-hidden>{no}</span>
        <div>
          <h3 className={s.stepTitle}>{title}</h3>
          <p className={s.stepBody}>{body}</p>
        </div>
      </div>
    </li>
  );
}

/** One example doctor across four steps: a certificate is read, it lands in the report, the report shows what is still open, the recertification documents are ready */
export default function HowItWorks({ l }: { l: HowLabels }) {
  const total = l.ledgerRows.reduce((a, r) => a + r.tip, 0);
  const checks = [
    ...l.checksDone.map((label) => ({ label, done: true })),
    { label: l.checkSpecialty, done: false },
    { label: l.remainingValue, done: false },
  ];

  return (
    <ol className={s.how}>
      <Step no={1} title={l.steps[0].title} body={l.steps[0].body}>
        <div className={s.cert} aria-hidden>
          <div className={s.certOrg}>{l.sampleOrg}</div>
          <div className={s.certTitle}>{l.sampleTitle}</div>
          <div className={s.certName}>{l.sampleName}</div>
          <div className={s.certCourse}>{l.sampleCourse}</div>
          <div className={s.certRow}>
            <span className={`${s.hl} ${s.hl1}`}>{l.sampleDates}</span>
            <span className={`${s.hl} ${s.hl2}`}>{l.sampleCredits}</span>
          </div>
        </div>
        <dl className={s.read} aria-hidden>
          <div className={s.chip} style={{ animationDelay: "0.9s" }}><dt>{l.readDate}</dt><dd>{l.readDateValue}</dd></div>
          <div className={s.chip} style={{ animationDelay: "1.1s" }}><dt>{l.readPoints}</dt><dd>+16 TIP</dd></div>
          <div className={s.chip} style={{ animationDelay: "1.3s" }}><dt>{l.readPlace}</dt><dd>{l.readPlaceValue}</dd></div>
        </dl>
      </Step>

      <Step no={2} title={l.steps[1].title} body={l.steps[1].body}>
        <div className={s.ledger} aria-hidden>
          <div className={s.ledgerHead}>{l.ledgerTitle}</div>
          {l.ledgerRows.map((r, i) => (
            <div key={i} className={`${s.ledgerRow} ${i === l.ledgerRows.length - 1 ? s.ledgerNew : ""}`} style={{ animationDelay: `${0.2 + i * 0.15}s` }}>
              <span className={s.ledgerDate}>{r.date}</span>
              <span className={s.ledgerTitleCell}>{r.title}</span>
              <span className={s.ledgerTip}>+{r.tip}</span>
            </div>
          ))}
          <div className={s.ledgerTotal}>
            <span>{l.ledgerTotal}</span>
            <span>{total} TIP</span>
          </div>
        </div>
      </Step>

      <Step no={3} title={l.steps[2].title} body={l.steps[2].body}>
        <div aria-hidden>
          <ul className={s.checks}>
            {checks.map((c, i) => (
              <li key={c.label} className={c.done ? s.checkDone : s.checkOpen}>
                <span className={s.tick} style={{ animationDelay: `${0.3 + i * 0.25}s` }}>{c.done ? "✓" : ""}</span>
                {c.label}
              </li>
            ))}
          </ul>
          <div className={s.deadline} style={{ animationDelay: `${0.3 + checks.length * 0.25}s` }}>
            <span>{l.deadline}</span>
            <span>{l.deadlineValue}</span>
          </div>
        </div>
      </Step>

      <Step no={4} title={l.steps[3].title} body={l.steps[3].body}>
        <div className={s.docs} aria-hidden>
          <div className={s.docsZip}>{l.docsZip}</div>
          {[...l.docsFiles, l.docsCopies].map((name, i) => (
            <div key={name} className={s.docRow} style={{ animationDelay: `${0.2 + i * 0.2}s` }}>
              <span className={s.docIcon} />
              <span className={s.docName}>{name}</span>
              <span className={s.docTick}>✓</span>
            </div>
          ))}
        </div>
      </Step>
    </ol>
  );
}
