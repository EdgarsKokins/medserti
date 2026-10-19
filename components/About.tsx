import { t, type Locale } from "@/lib/i18n";
import s from "./about.module.css";

/* "Who we are" on the public login / register pages: founding story and the two founders */
export default function About({ locale }: { locale: Locale }) {
  const a = t(locale).about;
  return (
    <section className={s.about} aria-labelledby="about-title">
      <h2 id="about-title" className={s.title}>{a.title}</h2>

      <div className={s.story}>
        <h3 className={s.kicker}>{a.storyTitle}</h3>
        {a.story.map((p, i) => (
          <p key={i} className={i === 0 ? s.lead : undefined}>{p}</p>
        ))}
      </div>

      <ul className={s.people}>
        {a.people.map((person) => (
          <li key={person.name} className={s.person}>
            {/* Photo placeholder: replace with <img> once the portraits are in /public/team/ */}
            <div className={s.photo} role="img" aria-label={`${person.name}: ${a.photoPending}`}>
              <span className={s.initial} aria-hidden>{person.name.charAt(0)}</span>
              <span className={s.pending} aria-hidden>{a.photoPending}</span>
            </div>
            <div>
              <h3 className={s.name}>{person.name}</h3>
              <p className={s.role}>{person.role}</p>
              <p className={s.bio}>{person.bio}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
