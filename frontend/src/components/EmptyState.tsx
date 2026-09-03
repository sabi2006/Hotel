import type { ReactNode } from "react";

export function EmptyState({
  title,
  description,
  icon = "🍽️",
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white/80 px-6 py-12 text-center shadow-2xs">
      <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 text-2xl text-slate-500 ring-1 ring-slate-200/60 shadow-2xs">
        {typeof icon === "string" ? <span>{icon}</span> : icon}
      </div>
      <p className="mt-4 text-base font-bold text-slate-800 font-sans">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-xs font-medium text-slate-500">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
