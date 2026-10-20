import s from "./landing-visuals.module.css";

interface Props {
  label: string;
  email: string;
  emailSubject: string;
  emailFrom: string;
  paper: string;
  paperTitle: string;
  paperName: string;
  portal: string;
  portalLine: string;
  questions: string[];
  deadline: string;
}

/**
 * Hero visual for the problem: the same sample doctor's certificates spread over an inbox, a paper folder
 * and an organizer's website, with the questions nobody can answer at a glance. Drawn in HTML, decorative.
 */
export default function ScatteredDocs(p: Props) {
  return (
    <figure className={s.scatter} aria-label={p.label}>
      <div className={`${s.doc} ${s.docEmail}`} aria-hidden>
        <div className={s.docTag}>{p.email}</div>
        <div className={s.mailRow}>
          <span className={s.mailClip}>PDF</span>
          <span className={s.mailText}>
            <span className={s.mailSubject}>{p.emailSubject}</span>
            <span className={s.mailFrom}>{p.emailFrom}</span>
          </span>
        </div>
        <div className={`${s.mailRow} ${s.mailFaded}`}>
          <span className={s.mailClip}>PDF</span>
          <span className={s.mailText}>
            <span className={s.mailLine} />
            <span className={s.mailLineShort} />
          </span>
        </div>
      </div>

      <div className={`${s.doc} ${s.docPaper}`} aria-hidden>
        <div className={s.docTag}>{p.paper}</div>
        <div className={s.paperSheet}>
          <div className={s.paperTitle}>{p.paperTitle}</div>
          <div className={s.paperName}>{p.paperName}</div>
          <span className={s.paperLine} />
          <span className={s.paperLine} />
          <span className={s.paperLineShort} />
        </div>
      </div>

      <div className={`${s.doc} ${s.docPortal}`} aria-hidden>
        <div className={s.docTag}>{p.portal}</div>
        <div className={s.portalLine}>{p.portalLine}</div>
        <span className={s.portalField} />
      </div>

      <ul className={s.note} aria-hidden>
        {p.questions.map((q) => (
          <li key={q}>{q}</li>
        ))}
      </ul>

      <div className={s.scatterDeadline} aria-hidden>{p.deadline}</div>
    </figure>
  );
}
