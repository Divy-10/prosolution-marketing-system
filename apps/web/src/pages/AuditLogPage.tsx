import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AUDIT_ACTIONS, ROLE_LABELS, describeAuditAction, type AuditLogDto, type Paginated } from "@prosolution/shared";
import { api, qs } from "../lib/api.ts";
import { formatDateTime, formatRelative } from "../lib/format.ts";
import { Badge, Input, PageHeader, Panel, Select, Skeleton } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState, Pagination } from "../components/ui/states.tsx";

interface Filters {
  action: string;
  from: string;
  to: string;
  page: number;
}

function toIsoStart(date: string) {
  return date ? new Date(`${date}T00:00:00`).toISOString() : undefined;
}
function toIsoEnd(date: string) {
  return date ? new Date(`${date}T23:59:59.999`).toISOString() : undefined;
}

const STATUS_LABELS: Record<string, string> = { ...ROLE_LABELS, ACTIVE: "Active", INACTIVE: "Inactive" };
const statusLabel = (v: string) => STATUS_LABELS[v] ?? v;

function Who({ row }: { row: AuditLogDto }) {
  if (row.actor) {
    return (
      <>
        <div className="font-medium">{row.actor.name}</div>
        <div className="text-[13px] text-ink-soft">{row.actor.email}</div>
      </>
    );
  }
  // Failed sign-ins happen before anyone is signed in: show the account that was tried.
  if (row.action === "auth.login_failed" || row.action === "auth.account_locked") {
    const tried = typeof row.meta?.email === "string" ? row.meta.email : null;
    return (
      <>
        <Badge tone="neutral">Not signed in</Badge>
        {tried && <div className="mt-1 text-[13px] text-ink-soft">tried {tried}</div>}
      </>
    );
  }
  // The person's account row no longer exists (accounts are normally deactivated, not deleted).
  if (!row.action.startsWith("system.")) return <Badge tone="neutral">Removed account</Badge>;
  return <Badge tone="system">System</Badge>;
}

function Change({ row }: { row: AuditLogDto }) {
  if (row.previousStatus || row.newStatus) {
    return (
      <span className="text-[13px]">
        {row.previousStatus && <span className="text-ink-soft">{statusLabel(row.previousStatus)}</span>}
        {row.previousStatus && row.newStatus && <span className="px-1 text-ink-faint" aria-label="changed to">→</span>}
        {row.newStatus && <span className="font-medium">{statusLabel(row.newStatus)}</span>}
      </span>
    );
  }
  const reason = typeof row.meta?.reason === "string" ? row.meta.reason.replaceAll("_", " ") : null;
  return reason ? <span className="text-[13px] text-ink-soft">{reason}</span> : <span className="text-ink-faint">—</span>;
}

export function AuditLogPage() {
  const [filters, setFilters] = useState<Filters>({ action: "", from: "", to: "", page: 1 });
  const query = useQuery({
    queryKey: ["audit", filters],
    queryFn: () =>
      api.get<Paginated<AuditLogDto>>(
        `/audit${qs({ action: filters.action, from: toIsoStart(filters.from), to: toIsoEnd(filters.to), page: filters.page, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader
        title="Audit log"
        description="A permanent record of sign-ins and changes. Entries can't be edited or deleted, by anyone."
      />
      <Panel>
        <div className="flex flex-wrap items-end gap-3 border-b border-line p-4">
          <label className="text-[13px] text-ink-soft">
            <span className="mb-1 block">Action</span>
            <Select value={filters.action} onChange={(e) => setFilters({ ...filters, action: e.target.value, page: 1 })} className="w-auto">
              <option value="">All actions</option>
              {Object.entries(AUDIT_ACTIONS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </label>
          <label className="text-[13px] text-ink-soft">
            <span className="mb-1 block">From</span>
            <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value, page: 1 })} className="w-auto" />
          </label>
          <label className="text-[13px] text-ink-soft">
            <span className="mb-1 block">To</span>
            <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value, page: 1 })} className="w-auto" />
          </label>
        </div>

        {query.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : query.data.total === 0 ? (
          <EmptyState title="Nothing recorded for these filters">Try a wider date range or a different action.</EmptyState>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-faint">
                    <th scope="col" className="px-4 py-2.5 font-medium">When</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Who</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">What happened</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Change</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">From IP</th>
                  </tr>
                </thead>
                <tbody className={query.isPlaceholderData ? "opacity-60" : undefined}>
                  {query.data.data.map((row) => (
                    <tr key={row.id} className="border-b border-line align-top last:border-b-0">
                      <td className="whitespace-nowrap px-4 py-3 text-ink-soft" title={formatDateTime(row.createdAt)}>
                        {formatRelative(row.createdAt)}
                      </td>
                      <td className="px-4 py-3">
                        <Who row={row} />
                      </td>
                      <td className="px-4 py-3">
                        <div>{describeAuditAction(row.action)}</div>
                        <div className="font-mono text-[12px] text-ink-faint">{row.action}</div>
                      </td>
                      <td className="px-4 py-3">
                        <Change row={row} />
                      </td>
                      <td className="px-4 py-3 font-mono text-[13px] text-ink-soft">{row.ip ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={query.data.page} pageSize={query.data.pageSize} total={query.data.total} onPage={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </Panel>
    </>
  );
}
