import React from "react";
import { timeFromInputParts, timeInputParts } from "../utils/timeFormat";

const hours = Array.from({ length: 12 }, (_, index) => String(index + 1));
const minutes = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));

export default function AmPmTimeInput({ value, onChange, className = "", name = "time" }) {
  const parts = timeInputParts(value);
  const update = (next) => onChange(timeFromInputParts(next.hour ?? parts.hour, next.minute ?? parts.minute, next.period ?? parts.period));
  return (
    <div className={`grid grid-cols-[1fr_1fr_auto] gap-2 ${className}`}>
      <select name={`${name}Hour`} aria-label="Hour" value={parts.hour} onChange={(event) => update({ hour: event.target.value })}>{hours.map((hour) => <option key={hour} value={hour}>{hour.padStart(2, "0")}</option>)}</select>
      <select name={`${name}Minute`} aria-label="Minute" value={parts.minute} onChange={(event) => update({ minute: event.target.value })}>{minutes.map((minute) => <option key={minute}>{minute}</option>)}</select>
      <select name={`${name}Period`} aria-label="AM or PM" value={parts.period} onChange={(event) => update({ period: event.target.value })}><option>AM</option><option>PM</option></select>
    </div>
  );
}
