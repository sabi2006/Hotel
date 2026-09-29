import type { ReactNode } from "react";

import { InboxIcon } from "@/components/Icons";

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title: string;
  description?: string;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-line-strong bg-white px-6 py-12 text-center">
      <div className="mx-auto flex size-12 items-center justify-center rounded-lg bg-surface-sunken text-xl text-subtle">
        {icon ?? <InboxIcon size={22} />}
      </div>
      <p className="mt-4 text-base font-semibold text-ink">{title}</p>
      {description && <p className="mx-auto mt-1 max-w-sm text-sm text-muted">{description}</p>}
      {action && <div className="mt-5 flex justify-center">{action}</div>}
    </div>
  );
}
