import type { ReactNode } from "react";
import { ApiError } from "../../lib/api.ts";
import { Button } from "./primitives.tsx";

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2 px-6 py-10">
      <h3 className="text-lg font-semibold">{title}</h3>
      {children && <div className="max-w-[60ch] text-ink-soft">{children}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const apiError = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="flex flex-col items-start gap-2 px-6 py-8">
      <h3 className="text-lg font-semibold text-danger">This didn't load</h3>
      <p className="max-w-[60ch] text-ink-soft">
        {apiError?.message ?? "Something went wrong while loading this page."}
      </p>
      {apiError?.requestId && (
        <p className="text-[13px] text-ink-faint">
          Reference: <span className="font-mono">{apiError.requestId}</span>
        </p>
      )}
      {onRetry && (
        <Button size="sm" onClick={onRetry} className="mt-2">
          Try again
        </Button>
      )}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 text-sm text-ink-soft">
      <span className="tabular">
        {from}–{to} of {total}
      </span>
      <div className="flex gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          Previous
        </Button>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
        </Button>
      </div>
    </nav>
  );
}
