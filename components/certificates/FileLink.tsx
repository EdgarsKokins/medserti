"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { t, type Locale } from "@/lib/i18n";
import { canHover, fileUrl, firstPage, pages } from "./filePreview";
import styles from "./certificates.module.css";

const HOVER_DELAY = 300;
const CARD_WIDTH = 360;
const GAP = 10;

/**
 * "Fails" in the certificate list. Hover (or keyboard focus) for a moment shows the first page in a floating card;
 * a click or tap opens the whole file in an in-page viewer. Ctrl/Cmd-click and middle-click still open the file in a new tab.
 */
export default function FileLink({ id, fileName, locale, className }: { id: string; fileName: string; locale: Locale; className?: string }) {
  const d = t(locale).certs;
  const link = useRef<HTMLAnchorElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [card, setCard] = useState(false);
  const [viewer, setViewer] = useState(false);
  // focus returns to the link when the viewer closes; that focus should not pop the preview up again
  const returning = useRef(false);
  const closeViewer = useCallback(() => {
    setViewer(false);
    returning.current = true;
    // after the dialog has closed: while it is modal, everything outside it is inert and cannot take focus
    window.setTimeout(() => link.current?.focus({ preventScroll: true }), 0);
  }, []);
  const cardId = `file-preview-${id}`;

  const show = useCallback(() => {
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setCard(true), HOVER_DELAY);
  }, []);
  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setCard(false);
  }, []);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      <a
        ref={link}
        href={fileUrl(id)}
        className={className}
        target="_blank"
        rel="noreferrer"
        aria-describedby={card ? cardId : undefined}
        onMouseEnter={() => canHover() && show()}
        onMouseLeave={hide}
        // keyboard focus previews like hover; a tap's focus does not (the tap opens the viewer)
        onFocus={(e) => {
          if (returning.current) returning.current = false;
          else if (e.currentTarget.matches(":focus-visible")) show();
        }}
        onBlur={hide}
        onKeyDown={(e) => e.key === "Escape" && hide()}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.button !== 0) return; // the user asked for a tab
          e.preventDefault();
          hide();
          setViewer(true);
        }}
      >
        {d.file}
      </a>
      {card && link.current && <PreviewCard id={id} cardId={cardId} anchor={link.current} alt={d.filePreviewAlt(fileName)} loading={d.fileLoading} error={d.fileError} />}
      {viewer && <FileViewer id={id} fileName={fileName} locale={locale} onClose={closeViewer} />}
    </>
  );
}

/** Floating first-page card, kept inside the viewport */
function PreviewCard({ id, cardId, anchor, alt, loading, error }: { id: string; cardId: string; anchor: HTMLElement; alt: string; loading: string; error: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  // the card's height is known only once the page image has loaded: place it again then
  const [loaded, setLoaded] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    firstPage(id, CARD_WIDTH).then((u) => live && setSrc(u), () => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [id]);

  // place it left of the link (the link sits at the row's right edge), else right; flip above when there is no room below
  useLayoutEffect(() => {
    const a = anchor.getBoundingClientRect();
    const h = box.current?.offsetHeight ?? CARD_WIDTH * 1.42;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = a.left - CARD_WIDTH - GAP;
    if (left < GAP) left = Math.min(a.right + GAP, vw - CARD_WIDTH - GAP);
    let top = a.top + a.height / 2 - h / 2;
    top = Math.max(GAP, Math.min(top, vh - h - GAP));
    setPos({ left: Math.max(GAP, left), top });
  }, [anchor, src, loaded]);

  return (
    <div
      ref={box}
      id={cardId}
      role="tooltip"
      className={styles.previewCard}
      style={{ width: CARD_WIDTH, left: pos?.left ?? -9999, top: pos?.top ?? 0 }}
    >
      {src ? (
        <img src={src} alt={alt} className={styles.previewImg} onLoad={() => setLoaded(true)} />
      ) : failed ? (
        <p className="small muted">{error}</p>
      ) : (
        <div className={styles.previewSkeleton} aria-label={loading} />
      )}
    </div>
  );
}

/** The whole file in the page: native modal dialog (focus trap, Esc), all pages as images */
function FileViewer({ id, fileName, locale, onClose }: { id: string; fileName: string; locale: Locale; onClose: () => void }) {
  const d = t(locale).certs;
  const dialog = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<{ urls: string[]; total: number } | "loading" | "error">("loading");

  useEffect(() => {
    const el = dialog.current;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    if (el && !el.open) el.showModal();
    let live = true;
    pages(id).then((r) => live && setState(r), () => live && setState("error"));
    return () => {
      live = false;
      root.style.overflow = prev;
      if (el?.open) el.close();
    };
  }, [id]);

  return (
    <dialog
      ref={dialog}
      className={styles.viewer}
      aria-labelledby={`viewer-title-${id}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={styles.viewerHead}>
        <h2 id={`viewer-title-${id}`} className={styles.viewerTitle}>{fileName}</h2>
        <a className="btn" href={fileUrl(id)} target="_blank" rel="noreferrer">{d.fileOpenNewTab}</a>
        <button type="button" className={`btn ${styles.viewerClose}`} onClick={onClose} aria-label={d.fileClose} autoFocus>
          ✕
        </button>
      </div>
      <div className={styles.viewerBody}>
        {state === "loading" ? (
          <div className={styles.viewerSkeleton} role="status" aria-label={d.fileLoading} />
        ) : state === "error" ? (
          <p className="alert alert-bad" role="alert">{d.fileError}</p>
        ) : (
          <>
            {state.urls.map((u, i) => (
              <img key={u} src={u} alt={d.filePageAlt(i + 1, state.total)} className={styles.viewerPage} />
            ))}
            {state.total > state.urls.length && <p className="small muted">{d.fileMorePages(state.total - state.urls.length)}</p>}
          </>
        )}
      </div>
    </dialog>
  );
}
