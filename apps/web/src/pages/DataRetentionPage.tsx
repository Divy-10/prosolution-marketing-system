import { useState } from "react";
import { Link } from "react-router";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { retentionConfirmationPhrase, type RetentionListDto } from "@prosolution/shared";
import { api, ApiError, qs } from "../lib/api.ts";
import { formatDateTime, leadNumber } from "../lib/format.ts";
import { Badge, Button, Field, Input, PageHeader, Panel, Skeleton } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState, Pagination } from "../components/ui/states.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import { useToast } from "../components/ui/toast.tsx";

const STATUS_LABEL = { PENDING: "Candidate", APPROVED: "Approved", REJECTED: "Rejected" } as const;

/** The typed-confirmation step before any permanent deletion. */
export function DeleteLeadsDialog({
  count,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  count: number;
  pending: boolean;
  error: ApiError | null;
  onConfirm: (confirmation: string) => void;
  onClose: () => void;
}) {
  const phrase = retentionConfirmationPhrase(count);
  const [typed, setTyped] = useState("");
  return (
    <Dialog
      open
      width="sm"
      onOpenChange={(o) => !o && onClose()}
      title={`Permanently delete ${count} lead${count === 1 ? "" : "s"}?`}
      description="This can't be undone. The audit log keeps a record of the deletion (lead number, industry, area and age), but not the business details."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="danger" loading={pending} disabled={typed !== phrase} onClick={() => onConfirm(typed)}>
            Delete permanently
          </Button>
        </>
      }
    >
      {error && (
        <div role="alert" className="mb-4 rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error.message}
        </div>
      )}
      <Field label={`Type ${phrase} to confirm`}>
        {(p) => <Input {...p} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} className="font-mono" />}
      </Field>
    </Dialog>
  );
}

export function DataRetentionPage() {
  const qc = useQueryClient();
  const toast = useToast();
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const list = useQuery({
    queryKey: ["retention", page],
    queryFn: () => api.get<RetentionListDto>(`/retention/eligible${qs({ page, pageSize: 50 })}`),
    placeholderData: keepPreviousData,
  });
  const done = () => {
    setSelected(new Set());
    void qc.invalidateQueries({ queryKey: ["retention"] });
    void qc.invalidateQueries({ queryKey: ["leads"] });
  };
  const keep = useMutation({
    mutationFn: (leadIds: string[]) => api.post<{ kept: number; holdUntil: string }>("/retention/keep", { leadIds }),
    onSuccess: (r) => (toast(`Kept ${r.kept} lead${r.kept === 1 ? "" : "s"} until ${formatDateTime(r.holdUntil)}.`), done()),
    onError: (e) => (toast(e instanceof ApiError ? e.message : "Couldn't keep the leads.", "error"), done()),
  });
  const remove = useMutation({
    mutationFn: ({ leadIds, confirmation }: { leadIds: string[]; confirmation: string }) =>
      api.post<{ deleted: number }>("/retention/delete", { leadIds, confirmation }),
    onSuccess: (r) => {
      toast(`Deleted ${r.deleted} lead${r.deleted === 1 ? "" : "s"}. The deletion is recorded in the audit log.`);
      setConfirming(false);
      done();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "NOT_ELIGIBLE") {
        setConfirming(false);
        toast(e.message, "error");
        done();
      }
    },
  });

  const rows = list.data?.data ?? [];
  const allOnPage = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  return (
    <>
      <PageHeader
        title="Data retention"
        description="Leads that were never contacted and are older than the retention period. Nothing is deleted automatically: review each one, keep it, or delete it permanently."
      />
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-4">
          <div className="text-[14px] text-ink-soft">
            {list.data ? (
              <>
                Threshold <strong className="font-medium text-ink">{list.data.thresholdDays} days</strong> (created before{" "}
                {formatDateTime(list.data.cutoff)}).{" "}
                <Link to="/service-profile" className="text-human hover:underline">
                  Change
                </Link>
              </>
            ) : (
              <Skeleton className="h-5 w-64" />
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!selected.size} loading={keep.isPending} onClick={() => keep.mutate([...selected])}>
              Keep selected
            </Button>
            <Button variant="danger" disabled={!selected.size} onClick={() => (remove.reset(), setConfirming(true))}>
              Delete selected{selected.size ? ` (${selected.size})` : ""}
            </Button>
          </div>
        </div>
        <p className="px-5 pt-3 text-[13px] text-ink-soft">
          Always kept and never listed here: contacted leads, do-not-contact leads, and leads kept within the last period.
        </p>

        {list.isPending ? (
          <Skeleton className="m-4 h-40" />
        ) : list.isError ? (
          <ErrorState error={list.error} onRetry={() => list.refetch()} />
        ) : list.data.total === 0 ? (
          <EmptyState title="No leads need review">Uncontacted leads appear here once they're older than {list.data.thresholdDays} days.</EmptyState>
        ) : (
          <>
            <div className="mt-2 overflow-x-auto border-t border-line">
              <table className="w-full min-w-[680px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-faint">
                    <th scope="col" className="w-10 px-4 py-2.5">
                      <input
                        type="checkbox"
                        aria-label="Select all on this page"
                        className="size-4 accent-human"
                        checked={allOnPage}
                        onChange={() =>
                          setSelected((s) => {
                            const n = new Set(s);
                            for (const r of rows) {
                              if (allOnPage) n.delete(r.id);
                              else n.add(r.id);
                            }
                            return n;
                          })
                        }
                      />
                    </th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Business</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Industry · Area</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Review</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Age</th>
                  </tr>
                </thead>
                <tbody className={list.isPlaceholderData ? "opacity-60" : undefined}>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-line last:border-b-0">
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          aria-label={`Select ${r.businessName}`}
                          className="size-4 accent-human"
                          checked={selected.has(r.id)}
                          onChange={() => toggle(r.id)}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/leads/${r.id}`} className="font-medium hover:text-human hover:underline">
                          {r.businessName}
                        </Link>
                        <div className="font-mono text-[12px] text-ink-faint">{leadNumber(r.displayId)}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{[r.industryName, r.areaName].filter(Boolean).join(" · ") || "—"}</td>
                      <td className="px-4 py-3">
                        <Badge tone={r.reviewStatus === "APPROVED" ? "human" : r.reviewStatus === "REJECTED" ? "neutral" : "system"}>
                          {STATUS_LABEL[r.reviewStatus]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-soft tabular" title={formatDateTime(r.createdAt)}>
                        {r.ageDays} days
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
          </>
        )}
      </Panel>

      {confirming && (
        <DeleteLeadsDialog
          count={selected.size}
          pending={remove.isPending}
          error={remove.error instanceof ApiError ? remove.error : null}
          onClose={() => setConfirming(false)}
          onConfirm={(confirmation) => remove.mutate({ leadIds: [...selected], confirmation })}
        />
      )}
    </>
  );
}
