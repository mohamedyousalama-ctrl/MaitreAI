"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

/** Slide-over panel used to host entity create/edit forms. */
export function Drawer({ open, onClose, title, subtitle, children, footer }: DrawerProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="animate-overlay absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="animate-drawer absolute inset-y-0 start-0 flex w-full max-w-md flex-col bg-white shadow-2xl">
        <header className="flex items-start justify-between border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
        {footer && <footer className="border-t border-slate-100 p-4">{footer}</footer>}
      </div>
    </div>
  );
}

/** Standard cancel/save footer for drawers. */
export function DrawerFooter({
  onCancel,
  onSave,
  saveLabel = "حفظ",
  accent = "bg-dashboard",
  disabled,
}: {
  onCancel: () => void;
  onSave: () => void;
  saveLabel?: string;
  accent?: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2">
      <button
        onClick={onCancel}
        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50"
      >
        إلغاء
      </button>
      <button
        onClick={onSave}
        disabled={disabled}
        className={cn(
          "rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-card transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50",
          accent
        )}
      >
        {saveLabel}
      </button>
    </div>
  );
}
