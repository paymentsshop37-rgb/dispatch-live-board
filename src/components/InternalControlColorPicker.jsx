import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Palette } from "lucide-react";
import { internalControlColor, internalControlColors } from "../utils/internalControlColors";

export default function InternalControlColorPicker({ value, onChange, disabled = false, jobLabel = "" }) {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ left: 0, top: 0 });
  const selected = internalControlColor(value);

  useEffect(() => {
    if (!open) return undefined;

    function positionMenu() {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;
      const menuWidth = 260;
      const menuHeight = 330;
      setPosition({
        left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
        top: rect.bottom + menuHeight <= window.innerHeight
          ? rect.bottom + 4
          : Math.max(8, rect.top - menuHeight - 4),
      });
    }

    function closeOnOutsideClick(event) {
      if (!buttonRef.current?.contains(event.target) && !menuRef.current?.contains(event.target)) setOpen(false);
    }

    positionMenu();
    document.addEventListener("pointerdown", closeOnOutsideClick);
    window.addEventListener("resize", positionMenu);
    window.addEventListener("scroll", positionMenu, true);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      window.removeEventListener("resize", positionMenu);
      window.removeEventListener("scroll", positionMenu, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        aria-label={`Internal Control Color${jobLabel ? ` for ${jobLabel}` : ""}: ${selected.label}`}
        title={`Internal Control: ${selected.label}`}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((current) => !current);
        }}
        className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-white/20 bg-[#111f33] text-slate-300 outline-none hover:border-blue-400 focus-visible:ring-2 focus-visible:ring-blue-400 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {selected.value !== "none"
          ? <span className="h-3.5 w-3.5 rounded-full border border-white/50" style={{ backgroundColor: selected.color }} />
          : <Palette className="h-3.5 w-3.5" />}
      </button>
      {open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          aria-label="Internal Control Color"
          style={{ left: position.left, top: position.top }}
          className="fixed z-[240] w-[260px] rounded-xl border border-slate-700 bg-[#0b1628] p-2 text-white shadow-2xl"
        >
          <p className="px-2 pb-2 text-[10px] font-black uppercase tracking-wider text-slate-400">Internal Control</p>
          {internalControlColors.map((option) => (
            <button
              key={option.value}
              type="button"
              role="menuitemradio"
              aria-checked={selected.value === option.value}
              onClick={() => {
                setOpen(false);
                if (option.value !== selected.value) onChange(option.value);
              }}
              className={`flex min-h-9 w-full items-center gap-3 rounded-lg px-2 text-left text-xs font-bold hover:bg-white/10 ${selected.value === option.value ? "bg-blue-500/15 text-blue-100" : "text-slate-200"}`}
            >
              <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-white/40" style={{ backgroundColor: option.value === "none" ? "transparent" : option.color }} />
              {option.value === "none" ? option.label : `${option.value[0].toUpperCase()}${option.value.slice(1)} — ${option.label}`}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
