"use client";

import { useEffect, useState } from "react";
import { Bot } from "lucide-react";

interface PromptDialogProps {
  open: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

/** Centered RTL prompt modal with a free-text field — the in-app replacement for
 *  the native window.prompt (e.g. the §E7 handover summary on release). */
export function PromptDialog({
  open,
  title,
  message,
  placeholder,
  initialValue = "",
  confirmLabel = "تأكيد",
  cancelLabel = "إلغاء",
  onConfirm,
  onCancel,
}: PromptDialogProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    if (open) setValue(initialValue);
  }, [open, initialValue]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="animate-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onCancel} />
      <div className="animate-modal relative w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex flex-col items-center text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#f0e7da] text-[#b5502e]">
            <Bot className="h-6 w-6" />
          </span>
          <h3 className="mt-4 text-lg font-bold text-[#2a211b]">{title}</h3>
          {message && <p className="mt-1 text-sm text-[#6a5c4e]">{message}</p>}
        </div>
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={2}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              onConfirm(value);
            }
          }}
          className="mt-4 w-full resize-none rounded-xl border border-[#e4d8c8] bg-[#faf6ef] px-3 py-2.5 text-sm text-[#2a211b] outline-none placeholder:text-[#9b8b7c] focus:border-[#b5502e]"
        />
        <div className="mt-5 flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[#e4d8c8] bg-white px-4 py-2.5 text-sm font-semibold text-[#6a5c4e] hover:bg-[#faf6ef]"
          >
            {cancelLabel}
          </button>
          <button
            onClick={() => onConfirm(value)}
            className="flex-1 rounded-xl bg-[#3c7a52] px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
