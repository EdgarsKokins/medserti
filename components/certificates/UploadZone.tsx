"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { CmeCertificate } from "@/lib/types";
import type { Locale } from "@/lib/locale";
import { useDict } from "@/components/i18n/DictProvider";
import {
  ACCEPT,
  decideCheck,
  getServerUploadSnapshot,
  getUploadSnapshot,
  onCertificatesStored,
  startUpload,
  subscribeUploads,
  type UploadState,
} from "./uploadStore";
import styles from "./certificates.module.css";

const STATE_CLASS: Record<UploadState, string> = {
  queued: "badge",
  check: "badge badge-warn",
  reading: "badge",
  uploading: "badge",
  done: "badge badge-ok",
  failed: "badge badge-bad",
};

/** More files than this collapse into one summary line while they upload */
const GROUP_FROM = 4;

export default function UploadZone({
  onUploaded,
  locale,
  courseId = null,
}: {
  /** files picked here are certificates for this Medserti course ("Pievienot sertifikātu" on a course) */
  courseId?: string | null;
  /** replay: the queue's copies from before this page mounted, older than the page's own list */
  onUploaded: (certs: CmeCertificate[], replay: boolean) => void;
  locale: Locale;
}) {
  const d = useDict().upload;
  const input = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [expanded, setExpanded] = useState(false);
  // the queue lives in uploadStore, so a batch started on the dashboard keeps running here
  const { items, busy } = useSyncExternalStore(subscribeUploads, getUploadSnapshot, getServerUploadSnapshot);

  const uploaded = useRef(onUploaded);
  useEffect(() => {
    uploaded.current = onUploaded;
  }, [onUploaded]);
  useEffect(() => {
    // certificates stored before this page mounted (upload started elsewhere), then each new one as it lands
    const before = getUploadSnapshot().stored;
    if (before.length) uploaded.current(before, true);
    return onCertificatesStored((certs) => uploaded.current(certs, false));
  }, []);

  // which picker the last files came from: "Izvēlēties citu" reopens the same one (the camera for a photo just taken)
  const lastSource = useRef<"file" | "camera">("file");
  function handle(fileList: FileList | null, source: "file" | "camera" = "file") {
    // while a batch runs, new files queue behind it (a retaken photo)
    if (!fileList?.length) return;
    lastSource.current = source;
    if (!busy) setExpanded(false);
    startUpload(Array.from(fileList), d, courseId);
    if (input.current) input.current.value = "";
    if (camera.current) camera.current.value = "";
  }

  const finished = items.filter((it) => it.state === "done" || it.state === "failed").length;
  const failed = items.filter((it) => it.state === "failed").length;
  const grouped = items.length >= GROUP_FROM;
  // collapsed, the list still shows what needs the user: failed files and photos to check
  const listed = grouped && !expanded ? items.filter((it) => it.state === "failed" || it.state === "check") : items;
  const qualityTitle = (issues: string[]) =>
    issues.includes("screen") ? d.qualityScreen : issues.includes("small") ? d.qualitySmall : issues.includes("dark") ? d.qualityDark : issues.includes("bright") ? d.qualityBright : d.qualityBlurry;

  return (
    <div className={styles.upload}>
      <div
        className={`${styles.drop} ${over ? styles.dropActive : ""}`}
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            input.current?.click();
          }
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          handle(e.dataTransfer.files);
        }}
      >
        <svg className={styles.dropIcon} viewBox="0 0 24 24" width="26" height="26" aria-hidden>
          <path d="M12 15V4m0 0L7.5 8.5M12 4l4.5 4.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span className={styles.dropMain}>
          <span className={styles.dropMouse}>{d.drop}</span>
          <span className={styles.dropTouch}>{d.dropTouch}</span>
        </span>
        <span className={styles.dropHint}>{d.hint}</span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          onChange={(e) => handle(e.target.files)}
        />
      </div>
      {/* phones only (see .photoBtn): opens the camera straight away */}
      <button type="button" className={`btn ${styles.photoBtn}`} disabled={busy} onClick={() => camera.current?.click()}>
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden>
          <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.5-2h6l1.5 2h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <circle cx="12" cy="13" r="3.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
        {d.takePhoto}
      </button>
      <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={(e) => handle(e.target.files, "camera")} />
      {grouped && (
        <div className={styles.batch} role="status">
          <span className={styles.batchText}>
            {busy ? d.batchBusy(finished, items.length) : d.batchDone(finished - failed, items.length)}
            {failed > 0 && <span className="badge badge-bad">{d.batchFailed(failed)}</span>}
          </span>
          <button type="button" className={styles.linkBtn} aria-expanded={expanded} aria-controls="upload-files" onClick={() => setExpanded((v) => !v)}>
            {expanded ? d.hideFiles : d.showFiles}
          </button>
          <span className={styles.batchBar} aria-hidden>
            <span style={{ width: `${Math.round((finished / items.length) * 100)}%` }} />
          </span>
        </div>
      )}
      {listed.length > 0 && (
        <ul className={styles.uploads} id="upload-files">
          {listed.map((it) => (
            <li key={it.key}>
              <span className={styles.uploadName}>{it.name}</span>
              <span className={styles.uploadState}>
                {it.message && <span className="small muted">{it.message}</span>}
                <span className={STATE_CLASS[it.state]}>
                  {it.state === "check" && it.ask && it.ask.kind !== "quality" ? d.checkFile : d.states[it.state]}
                  {it.state === "reading" && it.progress ? ` ${it.progress}%` : ""}
                </span>
              </span>
              {it.state === "check" && it.ask && (
                <div className={styles.quality} role="alert">
                  {it.ask.kind === "quality" ? (
                    <>
                      <strong className={styles.qualityTitle}>{qualityTitle(it.ask.issues)}</strong>
                      <ul className={styles.qualityTips}>
                        <li>{d.qualityTip1}</li>
                        <li>{d.qualityTip2}</li>
                        <li>{d.qualityTip3}</li>
                      </ul>
                    </>
                  ) : (
                    <strong className={styles.qualityTitle}>{it.ask.kind === "noText" ? d.noText : d.notCertificate}</strong>
                  )}
                  <div className={styles.qualityActions}>
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={() => {
                        decideCheck(it.key, "another");
                        // opened from the click itself: browsers only allow a picker on a user gesture
                        (lastSource.current === "camera" ? camera : input).current?.click();
                      }}
                    >
                      {it.ask.kind === "quality" ? d.chooseAnother : d.chooseAnotherFile}
                    </button>
                    <button type="button" className="btn" onClick={() => decideCheck(it.key, "upload")}>
                      {d.uploadAnyway}
                    </button>
                    {/* the wrong file: never a hard block, but one click to drop it */}
                    {it.ask.kind !== "quality" && (
                      <button type="button" className="btn btn-danger" onClick={() => decideCheck(it.key, "remove")}>
                        {d.remove}
                      </button>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
