import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatTime12Hour, normalizeTimeForStorage, timeFromInputParts, timeInputParts } from "../utils/timeFormat";

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export default function AmPmTimeInput({ value, onChange, className = "", name = "time" }) {
  const containerRef = useRef(null);
  const pickerRef = useRef(null);
  const inputFocusedRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [pickerPosition, setPickerPosition] = useState({ left: 0, top: 0 });
  const [text, setText] = useState(() => formatTime12Hour(value));
  const parts = timeInputParts(value);

  useEffect(() => {
    if (!inputFocusedRef.current) setText(formatTime12Hour(value));
  }, [value]);

  useEffect(() => {
    if (!open) return undefined;

    function positionPicker() {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const pickerWidth = 224;
      const pickerHeight = 92;
      const left = Math.max(8, Math.min(rect.left, window.innerWidth - pickerWidth - 8));
      const fitsBelow = rect.bottom + pickerHeight + 8 <= window.innerHeight;
      setPickerPosition({
        left,
        top: fitsBelow ? rect.bottom + 4 : Math.max(8, rect.top - pickerHeight - 4),
      });
    }

    positionPicker();
    window.addEventListener("resize", positionPicker);
    window.addEventListener("scroll", positionPicker, true);
    return () => {
      window.removeEventListener("resize", positionPicker);
      window.removeEventListener("scroll", positionPicker, true);
    };
  }, [open]);

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
        className={`h-9 rounded-lg border px-2 text-center text-sm font-semibold tabular-nums outline-none focus:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-500/25 ${className}`}
        onFocus={() => { inputFocusedRef.current = true; }}
        onClick={() => setOpen(true)}
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          window.setTimeout(() => {
            if (!containerRef.current?.contains(document.activeElement) && !pickerRef.current?.contains(document.activeElement)) closePicker();
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
      {open && createPortal(
        <div
          ref={pickerRef}
          style={{ left: pickerPosition.left, top: pickerPosition.top }}
          className="fixed z-[200] w-56 rounded-xl border border-slate-300 bg-white p-2 text-slate-900 shadow-xl"
        >
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1">
            <select aria-label="Hour" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.hour} onChange={(event) => updatePicker({ hour: event.target.value })}>{hours.map((hour) => <option key={hour} value={hour}>{hour.padStart(2, "0")}</option>)}</select>
            <select aria-label="Minute" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.minute} onChange={(event) => updatePicker({ minute: event.target.value })}>{minutes.map((minute) => <option key={minute}>{minute}</option>)}</select>
            <select aria-label="AM or PM" className="h-9 rounded-lg border border-slate-300 bg-white px-2 text-sm" value={parts.period} onChange={(event) => updatePicker({ period: event.target.value })}><option>AM</option><option>PM</option></select>
          </div>
          <button type="button" onClick={closePicker} className="mt-2 h-8 w-full rounded-lg bg-blue-600 text-xs font-bold text-white">Done</button>
        </div>,
        document.body,
      )}
    </div>
  );
}
