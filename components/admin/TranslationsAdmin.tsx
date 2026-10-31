"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { checkValue, emptyOverrides, previewTemplate, type BlockId, type Cell, type Entry, type StoredOverrides } from "@/lib/i18n/catalog";
import { LOCALES, type Locale } from "@/lib/locale";
import { fold } from "@/lib/text";
import s from "./admin.module.css";

type Loc = Locale;
type Block = { id: BlockId; name: string; href?: string };
type Props = { entries: Entry[]; blocks: Block[]; saved: StoredOverrides; hasPrevious: boolean; stale: string[] };

const LOCS: readonly Loc[] = LOCALES;
const LOC_NAME: Record<Loc, string> = { lv: "Latviski", en: "Angliski", ru: "Krieviski" };
const SHOWN_KEY = "medserti-admin-langs";
const MAX_RESULTS = 150;

const id = (loc: Loc, key: string) => `${loc}|${key}`;
const countKeys = (o: StoredOverrides) => LOCS.reduce((n, l) => n + Object.keys(o[l]).length, 0);
const clone = (o: StoredOverrides): StoredOverrides => {
  const out = emptyOverrides();
  for (const l of LOCS) out[l] = { ...o[l] };
  return out;
};
const isEdited = (o: StoredOverrides, key: string) => LOCS.some((l) => o[l][key] !== undefined);

function timeNow() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function TranslationsAdmin({ entries, blocks, saved: initialSaved, hasPrevious: initialPrev, stale }: Props) {
  const [saved, setSaved] = useState(initialSaved);
  const [draft, setDraft] = useState(() => clone(initialSaved));
  const [hasPrevious, setHasPrevious] = useState(initialPrev);
  const [tab, setTab] = useState<"texts" | "backup">("texts");
  const [block, setBlock] = useState<BlockId>(blocks[0]?.id ?? "nav");
  const [query, setQuery] = useState("");
  const [onlyEdited, setOnlyEdited] = useState(false);
  // which language columns to show; all three by default, remembered per browser
  const [locs, setLocs] = useState<readonly Loc[]>(LOCS);
  useEffect(() => {
    try {
      const v = JSON.parse(localStorage.getItem(SHOWN_KEY) ?? "null");
      if (Array.isArray(v)) {
        const ok = LOCS.filter((l) => v.includes(l));
        if (ok.length) setLocs(ok);
      }
    } catch {}
  }, []);
  function toggleLoc(l: Loc) {
    setLocs((cur) => {
      const next = cur.includes(l) ? cur.filter((x) => x !== l) : LOCS.filter((x) => x === l || cur.includes(x));
      if (!next.length) return cur;
      try {
        localStorage.setItem(SHOWN_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ kind: "ok" | "bad" | "info"; text: string } | null>(null);
  const [serverProblems, setServerProblems] = useState<Record<string, string>>({});
  const mainRef = useRef<HTMLDivElement>(null);

  const byKey = useMemo(() => new Map(entries.map((e) => [e.key, e])), [entries]);

  // unsaved changes: every (language, key) where the draft differs from what is saved
  const unsaved = useMemo(() => {
    const out = new Set<string>();
    for (const l of LOCS) {
      const keys = new Set([...Object.keys(draft[l]), ...Object.keys(saved[l])]);
      for (const k of keys) if (draft[l][k] !== saved[l][k]) out.add(id(l, k));
    }
    return out;
  }, [draft, saved]);
  const dirty = unsaved.size > 0;

  const errors = useMemo(() => {
    const out: Record<string, string> = {};
    for (const l of LOCS)
      for (const [k, v] of Object.entries(draft[l])) {
        const e = byKey.get(k);
        const err = e ? checkValue(e[l], v) : "Šāda teksta vairs nav.";
        if (err) out[id(l, k)] = err;
      }
    for (const [k, msg] of Object.entries(serverProblems)) out[k] ??= msg;
    return out;
  }, [draft, byKey, serverProblems]);
  const errorCount = Object.keys(errors).length;

  const editedPerBlock = useMemo(() => {
    const out = {} as Record<BlockId, number>;
    for (const e of entries) if (isEdited(draft, e.key)) out[e.block] = (out[e.block] ?? 0) + 1;
    return out;
  }, [entries, draft]);
  const unsavedPerBlock = useMemo(() => {
    const out = new Set<BlockId>();
    for (const u of unsaved) {
      const e = byKey.get(u.slice(3));
      if (e) out.add(e.block);
    }
    return out;
  }, [unsaved, byKey]);

  // leave-page guard: closing the tab, and links inside the app
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (ev: BeforeUnloadEvent) => {
      ev.preventDefault();
      ev.returnValue = "";
    };
    const onClick = (ev: MouseEvent) => {
      const a = (ev.target as HTMLElement | null)?.closest?.("a");
      if (!a || a.target === "_blank" || a.hasAttribute("download") || ev.defaultPrevented) return;
      if (!confirm("Jums ir nesaglabātas izmaiņas. Aiziet no lapas, tās nesaglabājot?")) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty]);

  const onChange = useCallback(
    (key: string, loc: Loc, value: string) => {
      const def = byKey.get(key)?.[loc].def;
      setDraft((d) => {
        const next = { ...d, [loc]: { ...d[loc] } };
        if (value === def) delete next[loc][key];
        else next[loc][key] = value;
        return next;
      });
      setServerProblems((p) => {
        if (!p[id(loc, key)]) return p;
        const { [id(loc, key)]: _, ...rest } = p;
        return rest;
      });
    },
    [byKey],
  );
  const onReset = useCallback((key: string, loc: Loc) => {
    setDraft((d) => {
      if (d[loc][key] === undefined) return d;
      const next = { ...d, [loc]: { ...d[loc] } };
      delete next[loc][key];
      return next;
    });
  }, []);

  /* ---------- what to show ---------- */
  const q = fold(query.trim());
  const visible = useMemo(() => {
    let list = q
      ? entries.filter((e) =>
          [e.label, e.key, ...LOCS.flatMap((l) => [e[l].def, draft[l][e.key] ?? ""])].some((v) => fold(v).includes(q)),
        )
      : entries.filter((e) => e.block === block);
    if (onlyEdited) list = list.filter((e) => isEdited(draft, e.key) || LOCS.some((l) => unsaved.has(id(l, e.key))));
    return list;
  }, [entries, q, block, onlyEdited, draft, unsaved]);
  const shown = visible.slice(0, MAX_RESULTS);
  const current = blocks.find((b) => b.id === block);
  const blockName = (bid: BlockId) => blocks.find((b) => b.id === bid)?.name ?? "";

  /* ---------- saving ---------- */
  async function save() {
    if (errorCount) {
      setNotice({ kind: "bad", text: `Vispirms izlabojiet ${errorCount === 1 ? "1 kļūdu" : `${errorCount} kļūdas`} (iezīmētas sarkanā krāsā).` });
      const first = Object.keys(errors)[0];
      const e = byKey.get(first.slice(3));
      if (e && !q) setBlock(e.block);
      requestAnimationFrame(() => document.getElementById(`t-${first}`)?.focus());
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch("/api/admin/translations", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const probs: Record<string, string> = {};
        for (const p of (body.problems ?? []) as { key: string; locale: Loc; message: string }[]) probs[id(p.locale, p.key)] = p.message;
        setServerProblems(probs);
        setNotice({ kind: "bad", text: body.error ?? "Neizdevās saglabāt. Mēģiniet vēlreiz." });
        return;
      }
      setSaved(body.overrides);
      setDraft(clone(body.overrides));
      setHasPrevious(!!body.hasPrevious);
      setServerProblems({});
      setNotice({ kind: "ok", text: `Saglabāts ${timeNow()}. Lapās izmaiņas parādās uzreiz vai ne vēlāk kā pēc minūtes.` });
    } catch {
      setNotice({ kind: "bad", text: "Nav savienojuma. Izmaiņas nav saglabātas, mēģiniet vēlreiz." });
    } finally {
      setBusy(false);
    }
  }

  function discard() {
    if (!confirm(`Atcelt ${unsaved.size === 1 ? "1 nesaglabātu izmaiņu" : `${unsaved.size} nesaglabātas izmaiņas`}?`)) return;
    setDraft(clone(saved));
    setServerProblems({});
    setNotice(null);
  }

  async function logout() {
    if (dirty && !confirm("Jums ir nesaglabātas izmaiņas. Iziet, tās nesaglabājot?")) return;
    await fetch("/api/admin/logout", { method: "POST" }).catch(() => null);
    window.location.reload();
  }

  function pickBlock(b: BlockId) {
    setBlock(b);
    setQuery("");
    mainRef.current?.scrollIntoView({ block: "start" });
  }

  return (
    <div className={s.admin}>
      <header className={s.head}>
        <div>
          <h1>Teksti un tulkojumi</h1>
          <p className="muted">Šeit varat labot jebkuru lapas tekstu latviski, angliski un krieviski. Izmaiņas stājas spēkā pēc saglabāšanas.</p>
        </div>
        <div className={s.headActions}>
        <div className={s.tabs} role="tablist" aria-label="Sadaļa">
          <button type="button" role="tab" aria-selected={tab === "texts"} className={s.tab} onClick={() => setTab("texts")}>
            Teksti
          </button>
          <button type="button" role="tab" aria-selected={tab === "backup"} className={s.tab} onClick={() => setTab("backup")}>
            Rezerves kopija
          </button>
        </div>
        <button type="button" className="btn" onClick={logout}>
          Iziet
        </button>
        </div>
      </header>

      {stale.length > 0 && (
        <p className="alert">
          {stale.length === 1 ? "1 agrāks labojums" : `${stale.length} agrāki labojumi`} vairs netiek izmantoti, jo šie teksti kodā ir mainīti
          vai noņemti. Saglabājot tie tiks izdzēsti. ({stale.join(", ")})
        </p>
      )}

      {tab === "backup" ? (
        <Backup
          saved={saved}
          dirty={dirty}
          hasPrevious={hasPrevious}
          byKey={byKey}
          onImport={(o, skipped) => {
            setDraft(o);
            setServerProblems({});
            setTab("texts");
            setOnlyEdited(true);
            setQuery("");
            setNotice({
              kind: "info",
              text: `Fails ielādēts${skipped ? ` (${skipped} nezināmi teksti izlaisti)` : ""}. Pārskatiet labotos tekstus un spiediet “Saglabāt”.`,
            });
          }}
          onRestored={(o) => {
            setSaved(o);
            setDraft(clone(o));
            setServerProblems({});
            setNotice({ kind: "ok", text: `Atjaunota iepriekšējā versija (${timeNow()}).` });
            setTab("texts");
          }}
          onError={(text) => setNotice({ kind: "bad", text })}
        />
      ) : (
        <div className={s.shell}>
          <nav className={s.side} aria-label="Bloki">
            <label className={s.blockSelect}>
              <span className="sr-only">Bloks</span>
              <select value={block} onChange={(e) => pickBlock(e.target.value as BlockId)}>
                {blocks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                    {editedPerBlock[b.id] ? ` (${editedPerBlock[b.id]} labots)` : ""}
                    {unsavedPerBlock.has(b.id) ? " •" : ""}
                  </option>
                ))}
              </select>
            </label>
            <ul className={s.blockList}>
              {blocks.map((b) => (
                <li key={b.id}>
                  <button
                    type="button"
                    className={s.blockBtn}
                    aria-current={!q && b.id === block ? "true" : undefined}
                    onClick={() => pickBlock(b.id)}
                  >
                    <span>{b.name}</span>
                    <span className={s.blockMeta}>
                      {unsavedPerBlock.has(b.id) && <span className={s.unsavedDot} title="Nesaglabātas izmaiņas" aria-label="nesaglabātas izmaiņas" />}
                      {editedPerBlock[b.id] ? <span className={s.count} title="Laboto tekstu skaits">{editedPerBlock[b.id]}</span> : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          <div className={s.main} ref={mainRef}>
            <div className={s.toolbar}>
              <label className={s.search}>
                <span className="sr-only">Meklēt visos tekstos</span>
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Meklēt visos tekstos (LV, EN, RU)"
                  autoComplete="off"
                />
              </label>
              <label className={s.check}>
                <input type="checkbox" checked={onlyEdited} onChange={(e) => setOnlyEdited(e.target.checked)} />
                Tikai labotie
              </label>
              <div className={s.langPick} role="group" aria-label="Rādītās valodas">
                {LOCS.map((l) => (
                  <button key={l} type="button" aria-pressed={locs.includes(l)} onClick={() => toggleLoc(l)} title={LOC_NAME[l]}>
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className={s.blockHead}>
              <h2>{q ? `Meklēšanas rezultāti: ${visible.length}` : current?.name}</h2>
              {!q && current?.href && (
                <a href={current.href} target="_blank" rel="noreferrer" className="btn">
                  Skatīt lapā ↗
                </a>
              )}
            </div>

            {shown.length === 0 ? (
              <p className="muted">{q ? "Nekas netika atrasts." : onlyEdited ? "Šajā blokā nav laboto tekstu." : "Šajā blokā nav tekstu."}</p>
            ) : (
              <ol className={s.rows}>
                {shown.map((e, i) => {
                  const prev = shown[i - 1];
                  const heading = q ? (prev?.block !== e.block ? blockName(e.block) : null) : prev?.section !== e.section ? e.section : null;
                  return (
                    <li key={e.key}>
                      {heading && <h3 className={s.section}>{heading}</h3>}
                      <Row
                        entry={e}
                        locs={locs}
                        lv={draft.lv[e.key]}
                        en={draft.en[e.key]}
                        ru={draft.ru[e.key]}
                        lvUnsaved={unsaved.has(id("lv", e.key))}
                        enUnsaved={unsaved.has(id("en", e.key))}
                        ruUnsaved={unsaved.has(id("ru", e.key))}
                        lvError={errors[id("lv", e.key)]}
                        enError={errors[id("en", e.key)]}
                        ruError={errors[id("ru", e.key)]}
                        onChange={onChange}
                        onReset={onReset}
                      />
                    </li>
                  );
                })}
              </ol>
            )}
            {visible.length > MAX_RESULTS && <p className="muted">Rādīti pirmie {MAX_RESULTS}. Precizējiet meklēšanu.</p>}
          </div>
        </div>
      )}

      <div className={s.saveBar} role="region" aria-label="Saglabāšana">
        <div className={s.saveInner}>
          <p className={s.saveStatus} aria-live="polite">
            {notice ? (
              <span className={notice.kind === "bad" ? s.bad : notice.kind === "ok" ? s.ok : undefined}>{notice.text}</span>
            ) : dirty ? (
              `${unsaved.size === 1 ? "1 nesaglabāta izmaiņa" : `${unsaved.size} nesaglabātas izmaiņas`}`
            ) : (
              `Viss saglabāts. Laboti teksti: ${countKeys(saved)}.`
            )}
          </p>
          <div className={s.saveActions}>
            <button type="button" className="btn" onClick={discard} disabled={!dirty || busy}>
              Atcelt izmaiņas
            </button>
            <button type="button" className="btn btn-primary" onClick={save} disabled={!dirty || busy}>
              {busy ? "Saglabā..." : "Saglabāt"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- one text: label, then LV, EN and RU side by side (the columns picked in the toolbar) ---------- */

type RowProps = {
  entry: Entry;
  locs: readonly Loc[];
  lv: string | undefined;
  en: string | undefined;
  ru: string | undefined;
  lvUnsaved: boolean;
  enUnsaved: boolean;
  ruUnsaved: boolean;
  lvError?: string;
  enError?: string;
  ruError?: string;
  onChange: (key: string, loc: Loc, value: string) => void;
  onReset: (key: string, loc: Loc) => void;
};

const Row = memo(function Row(p: RowProps) {
  const { entry, locs, onChange, onReset } = p;
  const value = { lv: p.lv, en: p.en, ru: p.ru };
  const unsaved = { lv: p.lvUnsaved, en: p.enUnsaved, ru: p.ruUnsaved };
  const error = { lv: p.lvError, en: p.enError, ru: p.ruError };
  const edited = LOCS.some((l) => value[l] !== undefined);
  return (
    <article className={`${s.row} ${edited ? s.rowEdited : ""}`}>
      <div className={s.rowHead}>
        <h4 className={s.label}>{entry.label}</h4>
        <code className={s.key} title="Teksta kods (izstrādātājam)">{entry.key}</code>
      </div>
      <div className={s.cols} style={{ "--cols": locs.length } as React.CSSProperties}>
        {locs.map((l) => (
          <CellEditor key={l} entry={entry} loc={l} cell={entry[l]} value={value[l]} unsaved={unsaved[l]} error={error[l]} onChange={onChange} onReset={onReset} />
        ))}
      </div>
    </article>
  );
});

function CellEditor({
  entry,
  loc,
  cell,
  value,
  unsaved,
  error,
  onChange,
  onReset,
}: {
  entry: Entry;
  loc: Loc;
  cell: Cell;
  value: string | undefined;
  unsaved: boolean;
  error?: string;
  onChange: RowProps["onChange"];
  onReset: RowProps["onReset"];
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const domId = `t-${id(loc, entry.key)}`;
  const edited = value !== undefined;
  const text = value ?? cell.def;

  if (cell.kind === "code") {
    return (
      <div className={s.cell}>
        <div className={s.cellHead}>
          <span className={s.lang}>{LOC_NAME[loc]}</span>
          <span className="tag">Iestatīts kodā</span>
        </div>
        <div className={s.codeBox} lang={loc}>
          {cell.samples.map((x, i) => (
            <p key={i}>{x}</p>
          ))}
        </div>
        <p className={s.hint}>
          Šis teksts mainās atkarībā no skaita vai citiem apstākļiem (piem., “1 diena”, “2 dienas”), tāpēc to var mainīt tikai kodā.
        </p>
      </div>
    );
  }

  function insert(p: string) {
    const el = ref.current;
    const token = `{${p}}`;
    if (!el) return onChange(entry.key, loc, text + token);
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    onChange(entry.key, loc, text.slice(0, start) + token + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const describedBy = [error ? `${domId}-err` : "", edited ? `${domId}-def` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`${s.cell} ${edited ? s.cellEdited : ""}`}>
      <div className={s.cellHead}>
        <label htmlFor={domId} className={s.lang}>
          {LOC_NAME[loc]}
        </label>
        {edited && <span className="tag tag-accent">Labots</span>}
        {unsaved && <span className={s.unsavedTag}>Nesaglabāts</span>}
      </div>
      <AutoTextarea
        ref={ref}
        id={domId}
        lang={loc}
        value={text}
        invalid={!!error}
        describedBy={describedBy}
        onChange={(v) => onChange(entry.key, loc, v)}
      />
      {error && (
        <p id={`${domId}-err`} className={s.error} role="alert">
          {error}
        </p>
      )}
      {cell.kind === "template" && cell.params.length > 0 && (
        <div className={s.fields}>
          <span className={s.hint}>Lauki, kurus aizpilda lapa:</span>
          {cell.params.map((p) => (
            <button key={p} type="button" className={s.chip} onClick={() => insert(p)} title="Ievietot kursora vietā">
              {`{${p}}`}
            </button>
          ))}
        </div>
      )}
      {cell.params.length > 0 && cell.kind === "text" && (
        <p className={s.hint}>
          Saglabājiet laukus {cell.params.map((p) => `{${p}}`).join(", ")}: to vietā lapa ievieto vērtības.
        </p>
      )}
      {cell.kind === "template" && cell.params.length > 0 && !error && (
        <p className={s.preview} lang={loc}>
          <span className={s.hint}>Piemērs: </span>
          {previewTemplate(text, cell.params, loc)}
        </p>
      )}
      {edited && (
        <div className={s.defaultRow}>
          <p id={`${domId}-def`} className={s.default} lang={loc}>
            <span>Sākotnējais: </span>
            {cell.def}
          </p>
          <button type="button" className={`btn ${s.resetBtn}`} onClick={() => onReset(entry.key, loc)}>
            Atjaunot noklusējumu
          </button>
        </div>
      )}
    </div>
  );
}

function AutoTextarea({
  ref,
  id: domId,
  lang,
  value,
  invalid,
  describedBy,
  onChange,
}: {
  ref: React.RefObject<HTMLTextAreaElement | null>;
  id: string;
  lang: string;
  value: string;
  invalid: boolean;
  describedBy?: string;
  onChange: (v: string) => void;
}) {
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [ref]);
  useLayoutEffect(fit, [value, fit]);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let w = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth !== w) {
        w = el.clientWidth;
        fit();
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, fit]);
  return (
    <textarea
      ref={ref}
      id={domId}
      lang={lang}
      rows={1}
      value={value}
      spellCheck
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      className={s.textarea}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

/* ---------- backup: export, import, undo ---------- */

function Backup({
  saved,
  dirty,
  hasPrevious,
  byKey,
  onImport,
  onRestored,
  onError,
}: {
  saved: StoredOverrides;
  dirty: boolean;
  hasPrevious: boolean;
  byKey: Map<string, Entry>;
  onImport: (o: StoredOverrides, skipped: number) => void;
  onRestored: (o: StoredOverrides) => void;
  onError: (text: string) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  function download() {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const data = { app: "medserti", kind: "text-overrides", exportedAt: d.toISOString(), lv: saved.lv, en: saved.en, ru: saved.ru };
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `medserti-teksti-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function load(file: File) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(await file.text());
    } catch {
      return onError("Failu neizdevās nolasīt. Vai tā ir Medserti rezerves kopija (.json)?");
    }
    const src = parsed as Partial<Record<Loc, unknown>> | null;
    if (!src || typeof src !== "object" || !LOCS.some((l) => typeof src[l] === "object")) {
      return onError("Failā nav Medserti tekstu.");
    }
    const out = emptyOverrides();
    let skipped = 0;
    for (const l of LOCS) {
      const m = src[l];
      if (!m || typeof m !== "object") continue;
      for (const [k, v] of Object.entries(m as Record<string, unknown>)) {
        const e = byKey.get(k);
        if (!e || e[l].kind === "code" || typeof v !== "string") skipped++;
        else if (v !== e[l].def) out[l][k] = v;
      }
    }
    if (!confirm(`Aizstāt pašreizējos labojumus ar faila saturu (${countKeys(out)} teksti)? Tie stāsies spēkā tikai pēc “Saglabāt”.`)) return;
    onImport(out, skipped);
  }

  async function restore() {
    const msg = dirty
      ? "Atjaunot versiju, kas bija pirms pēdējās saglabāšanas? Jūsu nesaglabātās izmaiņas tiks zaudētas."
      : "Atjaunot versiju, kas bija pirms pēdējās saglabāšanas?";
    if (!confirm(msg)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/admin/translations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "restore" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return onError(body.error ?? "Neizdevās atjaunot.");
      onRestored(body.overrides);
    } catch {
      onError("Nav savienojuma. Mēģiniet vēlreiz.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={s.backup}>
      <section className={s.backupItem}>
        <h2>Lejupielādēt rezerves kopiju</h2>
        <p className="muted">
          Saglabā visus labotos tekstus vienā failā (LV: {Object.keys(saved.lv).length}, EN: {Object.keys(saved.en).length}, RU:{" "}
          {Object.keys(saved.ru).length}). Nesaglabātās
          izmaiņas failā neiekļūst.
        </p>
        <button type="button" className="btn btn-primary" onClick={download}>
          Lejupielādēt (.json)
        </button>
      </section>
      <section className={s.backupItem}>
        <h2>Ielādēt no faila</h2>
        <p className="muted">
          Aizstāj pašreizējos labojumus ar rezerves kopijas saturu. Pēc ielādes pārskatiet tekstus un spiediet “Saglabāt”.
        </p>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          id="import-file"
          onChange={(e) => {
            const f = e.target.files?.[0];
            e.target.value = "";
            if (f) void load(f);
          }}
        />
        <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
          Izvēlēties failu
        </button>
      </section>
      <section className={s.backupItem}>
        <h2>Atsaukt pēdējo saglabāšanu</h2>
        <p className="muted">
          Atjauno tekstus, kādi tie bija pirms pēdējās saglabāšanas. Nospiežot vēlreiz, atgriežas pēdējā versija.
        </p>
        <button type="button" className="btn" onClick={restore} disabled={!hasPrevious || busy}>
          {busy ? "Atjauno..." : "Atjaunot iepriekšējo versiju"}
        </button>
        {!hasPrevious && <p className={s.hint}>Iepriekšējas versijas vēl nav.</p>}
      </section>
    </div>
  );
}
