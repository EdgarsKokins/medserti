"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { useDict } from "@/components/i18n/DictProvider";
import { availableSteps, isShown, nextIndex, placeBubble, scrollTopFor, tourSelector, TOUR_STEPS, type Box, type TourStep } from "@/lib/tour";
import s from "./guidedTour.module.css";

const PAD = 8;
const PHONE = 640;

const targetOf = (step: TourStep) => document.querySelector<HTMLElement>(tourSelector(step));
const stepShown = (step: TourStep) => {
  const el = targetOf(step);
  return !!el && isShown(el.getBoundingClientRect(), window.getComputedStyle(el));
};
const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The page dims and a light moves over the real elements, one short sentence at a time; the last step opens the real
 * upload. A native modal dialog as wide as the screen: it brings the focus trap, the inert page and Escape, and sits
 * above everything without a z-index.
 */
export default function TourOverlay({
  nurse,
  onlyUpload,
  onShown,
  onClose,
  onLeaveForDate,
}: {
  nurse: boolean;
  /** coming back from the date step: only what is left */
  onlyUpload: boolean;
  onShown: () => void;
  onClose: () => void;
  onLeaveForDate: () => void;
}) {
  const dict = useDict();
  const d = dict.tour;
  const dialog = useRef<HTMLDialogElement>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const primary = useRef<HTMLButtonElement>(null);
  const [list, setList] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const [spot, setSpot] = useState<Box & { radius: number } | null>(null);
  const [size, setSize] = useState({ w: 340, h: 200 });
  const [view, setView] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));
  const step = list?.[index];

  const finish = useCallback(() => {
    if (dialog.current?.open) dialog.current.close();
    onClose();
  }, [onClose]);

  // which steps can run; none: nothing opens, nothing is remembered
  useEffect(() => {
    const steps = availableSteps(onlyUpload ? ["upload"] : TOUR_STEPS, stepShown);
    if (!steps.length) return onClose();
    setList(steps);
  }, [onlyUpload, onClose]);

  const ready = !!list;
  useEffect(() => {
    if (!ready) return;
    const el = dialog.current;
    if (el && !el.open) el.showModal();
    onShown();
    return () => {
      if (el?.open) el.close();
    };
  }, [ready, onShown]);

  // each step: bring its element into the free part of the screen
  useEffect(() => {
    if (!step) return;
    const el = targetOf(step);
    if (el) {
      const w = window.innerWidth;
      const reserved = w <= PHONE ? (bubble.current?.offsetHeight ?? 200) + 24 : 0;
      window.scrollTo({ top: scrollTopFor(el.getBoundingClientRect(), window.scrollY, window.innerHeight, reserved), behavior: calm() ? "auto" : "smooth" });
    }
  }, [step]);

  // the bubble is hidden until its place is known, and a hidden button cannot take the focus
  const placed = !!spot;
  useEffect(() => {
    if (step && placed) primary.current?.focus({ preventScroll: true });
  }, [step, placed]);

  // the light follows its element while the page scrolls or the window changes; if the element goes, so does the step
  useEffect(() => {
    if (!list || !step) return;
    const follow = () => {
      if (!stepShown(step)) {
        const next = nextIndex(list, index, 1, stepShown);
        if (next === null) finish();
        else setIndex(next);
        return;
      }
      const el = targetOf(step)!;
      const b = el.getBoundingClientRect();
      const radius = Math.min(parseFloat(window.getComputedStyle(el).borderTopLeftRadius) || 10, 40) + PAD;
      const box = { top: b.top - PAD, left: b.left - PAD, width: b.width + PAD * 2, height: b.height + PAD * 2, radius };
      setSpot((prev) => (prev && (Object.keys(box) as (keyof typeof box)[]).every((k) => Math.abs(prev[k] - box[k]) < 0.5) ? prev : box));
      setView((v) => (v.w === window.innerWidth && v.h === window.innerHeight ? v : { w: window.innerWidth, h: window.innerHeight }));
      const r = bubble.current;
      if (r) setSize((v) => (v.w === r.offsetWidth && v.h === r.offsetHeight ? v : { w: r.offsetWidth, h: r.offsetHeight }));
    };
    follow();
    const beat = setInterval(follow, 40);
    return () => clearInterval(beat);
  }, [list, step, index, finish]);

  if (!list) return null;
  const last = index === list.length - 1;
  const phone = view.w <= PHONE;
  const place = spot && !phone ? placeBubble(spot, size, view) : null;
  const bubbleStyle = place ? ({ top: place.top, left: place.left, "--arrow-at": `${place.arrowAt}px` } as CSSProperties) : undefined;

  const words: Record<TourStep, { title: string; text: string }> = {
    certs: { title: d.certsTitle, text: d.certsText },
    courses: { title: d.coursesTitle, text: d.coursesText },
    lectures: { title: d.lecturesTitle, text: d.lecturesText },
    ring: nurse ? { title: d.ringTitleNurse, text: d.ringTextNurse } : { title: d.ringTitle, text: d.ringText },
    date: nurse ? { title: d.dateTitleNurse, text: d.dateTextNurse } : { title: d.dateTitle, text: d.dateText },
    tabs: { title: d.tabsTitle, text: d.tabsText },
    upload: { title: d.uploadTitle, text: d.uploadText },
  };

  function forward() {
    if (step === "upload") {
      // the real upload button: the file picker on a computer, the file or camera choice on a phone; the demo account's
      // button is a link to the certificates page. Still inside the person's click, which browsers require for a picker.
      const button = targetOf("upload");
      dialog.current?.close();
      button?.click();
      return onClose();
    }
    const next = nextIndex(list!, index, 1, stepShown);
    if (next === null) finish();
    else setIndex(next);
  }

  function backward() {
    const prev = nextIndex(list!, index, -1, stepShown);
    if (prev !== null) setIndex(prev);
  }

  return (
    <dialog
      ref={dialog}
      className={s.shell}
      aria-labelledby="tour-title"
      aria-describedby="tour-text"
      onCancel={(e) => {
        // Escape skips
        e.preventDefault();
        finish();
      }}
    >
      {spot && <div className={s.spot} style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height, borderRadius: spot.radius }} aria-hidden />}
      <div ref={bubble} className={`${s.bubble} ${phone ? s.sheet : ""} ${place ? s[place.side] : ""} ${spot ? "" : s.waiting}`} style={bubbleStyle}>
        <div className={s.top}>
          {list.length > 1 ? (
            <span className={s.dots} aria-hidden>
              {list.map((x, i) => <i key={x} className={i === index ? s.dotOn : i < index ? s.dotPast : undefined} />)}
            </span>
          ) : <span />}
          <button type="button" className={s.skip} onClick={finish}>{d.skip}</button>
        </div>
        <div aria-live="polite">
          {list.length > 1 && <span className="sr-only">{d.stepOf(index + 1, list.length)}. </span>}
          <h2 id="tour-title" key={`t-${step}`} className={s.title}>{step && words[step].title}</h2>
          <p id="tour-text" key={`p-${step}`} className={s.text}>{step && words[step].text}</p>
        </div>
        {step === "date" && (
          <Link href="/profile#expires" className={s.dateLink} onClick={onLeaveForDate}>{d.dateLink} →</Link>
        )}
        <div className={s.actions}>
          {index > 0 && <button type="button" className={`btn ${s.btn}`} onClick={backward}>{d.back}</button>}
          <button ref={primary} type="button" className={`btn btn-primary ${s.btn}`} onClick={forward}>
            {step === "upload" ? d.add : last ? d.done : d.next}
          </button>
        </div>
      </div>
    </dialog>
  );
}
