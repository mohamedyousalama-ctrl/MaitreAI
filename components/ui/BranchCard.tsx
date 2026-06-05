import type { Branch } from "@/lib/types";
import { cn } from "@/lib/utils";
import { MapPin, Clock, Truck, Phone, MessageCircle } from "lucide-react";

export function BranchCard({ branch }: { branch: Branch }) {
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

      <div className="mt-4">
        <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500">
          <Truck className="h-3.5 w-3.5" /> مناطق التوصيل
        </p>
        <div className="flex flex-wrap gap-1.5">
          {branch.deliveryZones.map((z) => (
            <span key={z} className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
              {z}
            </span>
          ))}
        </div>
      </div>

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
