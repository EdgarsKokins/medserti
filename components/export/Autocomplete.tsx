"use client";

import { useEffect, useRef, useState } from "react";
import type { Suggestion } from "@/lib/export/suggest";
import s from "./export.module.css";

/** Text input with a suggestion dropdown (ARIA combobox). Free text is always allowed. */
export default function Autocomplete({
  id,
  value,
  onChange,
  suggest,
  placeholder,
  maxLength,
  invalid,
  describedBy,
  noMatch,
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  suggest: (q: string) => Promise<Suggestion[]>;
  placeholder?: string;
  maxLength?: number;
  invalid?: boolean;
  describedBy?: string;
  /** shown when the user typed something with no match */
  noMatch?: string;
}) {
  const [items, setItems] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [typed, setTyped] = useState(false);
  /** the query the current items answer; "no match" waits for it so it never flashes while the list loads */
  const [answered, setAnswered] = useState("");
  const seq = useRef(0);
  const listId = `${id}-list`;

  useEffect(() => {
    if (!typed) return;
    const n = ++seq.current;
    suggest(value).then((r) => {
      if (n !== seq.current) return;
      setItems(r);
      setActive(-1);
      setAnswered(value);
    });
  }, [value, typed, suggest]);

  const pick = (x: Suggestion) => {
    onChange(x.value);
    setOpen(false);
    setTyped(false);
    setItems([]);
  };

  const showEmpty = open && typed && answered === value && value.trim().length >= 2 && items.length === 0 && !!noMatch;

  return (
    <div className={s.combo}>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        maxLength={maxLength}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && items.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        onChange={(e) => {
          onChange(e.target.value);
          setTyped(true);
          setOpen(true);
        }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={(e) => {
          if (!open || !items.length) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((a) => (a + 1) % items.length);
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((a) => (a <= 0 ? items.length - 1 : a - 1));
          } else if (e.key === "Enter" && active >= 0) {
            e.preventDefault();
            pick(items[active]);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && items.length > 0 && (
        <ul id={listId} role="listbox" className={s.options}>
          {items.map((x, i) => (
            <li
              key={x.value + i}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
              className={i === active ? s.optionActive : s.option}
              // mousedown, not click: fires before the input's blur closes the list
              onMouseDown={(e) => {
                e.preventDefault();
                pick(x);
              }}
            >
              <span>{x.value}</span>
              {x.hint && <span className={s.optionHint}>{x.hint}</span>}
            </li>
          ))}
        </ul>
      )}
      {showEmpty && <span className="small muted">{noMatch}</span>}
    </div>
  );
}
