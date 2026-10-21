import { t, type Locale } from "@/lib/i18n";
import { TEAM_PHOTOS } from "@/lib/team";
import s from "./about.module.css";

/* "Who we are" on the landing page and /par-mums: founding story and the two founders */
export default function About({ locale, page = false }: { locale: Locale; page?: boolean }) {
  const a = t(locale).about;
  return (
    <section className={s.about} aria-labelledby="about-title">
      {page ? (
        <h1 id="about-title" className={s.pageTitle}>{a.title}</h1>
      ) : (
        <h2 id="about-title" className={s.title}>{a.title}</h2>
      )}

      <div className={s.story}>
        <h3 className={s.kicker}>{a.storyTitle}</h3>
        {a.story.map((p, i) => (
          <p key={i} className={i === 0 ? s.lead : undefined}>{p}</p>
        ))}
      </div>

      <ul className={s.people}>
        {a.people.map((person) => (
          <li key={person.name} className={s.person}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={TEAM_PHOTOS[person.name]} alt={person.name} className={s.photo} width={150} height={188} loading="lazy" />
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
