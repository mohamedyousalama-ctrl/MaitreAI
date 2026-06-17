import type { Branch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MapPin, Clock, Phone, MessageCircle, Pencil, Trash2 } from "lucide-react";

interface BranchCardProps {
  branch: Branch;
  onEdit?: (branch: Branch) => void;
  onDelete?: (branch: Branch) => void;
}

export function BranchCard({ branch, onEdit, onDelete }: BranchCardProps) {
  return (
    <div className="card flex flex-col p-5 transition hover:shadow-card-hover">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-branches/10 text-branches">
            <MapPin className="h-6 w-6" />
          </span>
          <div>
            <h3 className="font-bold text-slate-900">{branch.name}</h3>
            <span
              className={cn(
                "mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                branch.open ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", branch.open ? "bg-emerald-500" : "bg-red-500")} />
              {branch.open ? "مفتوح الآن" : "مغلق"}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={() => onEdit(branch)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-branches"
              aria-label="تعديل"
            >
              <Pencil className="h-4 w-4" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(branch)}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"
              aria-label="حذف"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      <div className="mt-4 space-y-2.5 text-sm text-slate-600">
        <p className="flex items-start gap-2">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" /> {branch.address}
        </p>
        <p className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-slate-400" /> {branch.hours}
        </p>
        <p className="flex items-center gap-2">
          <Phone className="h-4 w-4 text-slate-400" /> {branch.phone}
        </p>
      </div>

      {branch.notes && (
        <p className="mt-3 rounded-lg bg-amber-50/60 px-3 py-2 text-xs text-amber-700">{branch.notes}</p>
      )}

      <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
        <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <MessageCircle className="h-4 w-4 text-conversations" /> ربط واتساب
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-semibold",
            branch.whatsappConnected ? "bg-conversations/10 text-conversations" : "bg-red-50 text-red-600"
          )}
        >
          {branch.whatsappConnected ? "متصل" : "غير متصل"}
        </span>
      </div>
    </div>
  );
}
