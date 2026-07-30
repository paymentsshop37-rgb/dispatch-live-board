import React, { useEffect, useRef, useState } from "react";
import { formatTime12Hour, normalizeTimeForStorage, timeFromInputParts, timeInputParts } from "../utils/timeFormat";

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export default function AmPmTimeInput({ value, onChange, className = "", name = "time" }) {
  const containerRef = useRef(null);
  const inputFocusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(() => formatTime12Hour(value));
  const parts = timeInputParts(value);

  useEffect(() => {
    if (!inputFocusedRef.current) setText(formatTime12Hour(value));
  }, [value]);

  function commitText() {
    const normalized = normalizeTimeForStorage(text);
    if (normalized) {
      setText(formatTime12Hour(normalized));
      if (normalized !== normalizeTimeForStorage(value)) onChange(normalized);
    } else {
      setText(formatTime12Hour(value));
    }
  }

  function updatePicker(next) {
    const normalized = timeFromInputParts(next.hour ?? parts.hour, next.minute ?? parts.minute, next.period ?? parts.period);
    setText(formatTime12Hour(normalized));
    onChange(normalized);
  }

  function closePicker() {
    commitText();
    inputFocusedRef.current = false;
    setOpen(false);
  }

  return (
    <div ref={containerRef} className="relative inline-block w-[118px] max-w-[125px] align-middle">
      <input
        name={name}
        aria-label="Time"
        autoComplete="off"
        inputMode="text"
        placeholder="08:05 AM"
        value={text}
        style={{ width: "118px", maxWidth: "125px" }}
        className={`h-9 rounded-lg border px-2 text-center text-sm font-semibold tabular-nums outline-none ${className}`}
        onFocus={() => { inputFocusedRef.current = true; }}
        onClick={() => setOpen(true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement)) closePicker();
          }, 0);
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            closePicker();
            event.currentTarget.blur();
          }
          if (event.key === "Escape") {
            setText(formatTime12Hour(value));
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      />
      {open && (
        <div className="absolute left-0 top-full z-[80] mt-1 w-56 rounded-xl border border-slate-300 bg-white p-2 text-slate-900 shadow-xl">
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
            <select aria-label="Hour" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.hour} onChange={(event) => updatePicker({ hour: event.target.value })}>{hours.map((hour) => <option key={hour} value={hour}>{hour.padStart(2, "0")}</option>)}</select>
            <select aria-label="Minute" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.minute} onChange={(event) => updatePicker({ minute: event.target.value })}>{minutes.map((minute) => <option key={minute}>{minute}</option>)}</select>
            <select aria-label="AM or PM" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.period} onChange={(event) => updatePicker({ period: event.target.value })}><option>AM</option><option>PM</option></select>
          </div>
          <button type="button" onClick={closePicker} className="mt-2 h-8 w-full rounded-lg bg-blue-600 text-xs font-bold text-white">Done</button>
        </div>
      )}
    </div>
  );
}
