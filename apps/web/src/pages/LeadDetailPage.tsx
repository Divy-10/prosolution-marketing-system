import { useState, type ReactNode } from "react";
import { Link, useParams } from "react-router";
import {
  IDENTIFIER_LABELS,
  LEAD_SOURCE_LABELS,
  can,
  describeAuditAction,
  type LeadDetailDto,
  type LeadHistoryEntryDto,
} from "@prosolution/shared";
import { ApiError } from "../lib/api.ts";
import { formatDateTime, formatRelative, leadNumber, statusWord } from "../lib/format.ts";
import { useCurrentUser } from "../features/auth/session.tsx";
import {
  useAssignLead,
  useAssignees,
  useDoNotContact,
  useLead,
  useLeadHistory,
  useRecordContact,
  useReviewLead,
  useVerifyLead,
} from "../features/leads/api.ts";
import { LeadForm } from "../features/leads/LeadForm.tsx";
import { LeadBadges } from "../features/leads/LeadBadges.tsx";
import { Badge, Button, Field, Input, Panel, Select, Skeleton, Textarea } from "../components/ui/primitives.tsx";
import { ErrorState } from "../components/ui/states.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import { useToast } from "../components/ui/toast.tsx";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-2 sm:grid-cols-[160px_1fr] sm:gap-4">
      <dt className="text-[13px] text-ink-faint">{label}</dt>
      <dd className="min-w-0 break-words text-[14px]">{children ?? <span className="text-ink-faint">—</span>}</dd>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  const url = /^https?:\/\//i.test(href) ? href : `https://${href}`;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer nofollow" className="text-human underline underline-offset-2">
      {children}
    </a>
  );
}

/** One dialog for every action that needs a short reason or note. */
function ReasonDialog({
  title,
  description,
  label,
  confirmLabel,
  tone = "primary",
  required = true,
  withDate = false,
  pending,
  error,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: ReactNode;
  label: string;
  confirmLabel: string;
  tone?: "primary" | "danger";
  required?: boolean;
  withDate?: boolean;
  pending: boolean;
  error: ApiError | null;
  onConfirm: (text: string, date: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  return (
    <Dialog
      open
      width="sm"
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant={tone} loading={pending} disabled={required && !text.trim()} onClick={() => onConfirm(text, date)}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {error && !Object.keys(error.details).length && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error.message}
          </div>
        )}
        {withDate && (
          <Field label="Date contacted" error={error?.fieldError("contactedAt")}>
            {(p) => <Input {...p} type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}
          </Field>
        )}
        <Field label={label} error={error?.fieldError("note") ?? error?.fieldError("reason")}>
          {(p) => <Textarea {...p} rows={3} value={text} onChange={(e) => setText(e.target.value)} autoFocus />}
        </Field>
      </div>
    </Dialog>
  );
}

type Pending = null | "reject" | "approve-note" | "dnc" | "lift-dnc" | "contact" | "edit";

function Actions({ lead }: { lead: LeadDetailDto }) {
  const user = useCurrentUser();
  const isAdmin = user.role === "ADMIN";
  const toast = useToast();
  const review = useReviewLead();
  const assign = useAssignLead();
  const verify = useVerifyLead();
  const dnc = useDoNotContact();
  const contact = useRecordContact();
  const assignees = useAssignees(true);
  const [open, setOpen] = useState<Pending>(null);
  const close = () => {
    setOpen(null);
    review.reset();
    dnc.reset();
    contact.reset();
  };
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : "Couldn't save. Try again.", "error");
  const contacted = lead.contactStatus === "CONTACTED";

  return (
    <Panel className="p-5">
      <h2 className="text-lg font-semibold">Review & actions</h2>
      <div className="mt-4 space-y-5">
        {!contacted && (
          <div className="space-y-2">
            <p className="text-[13px] text-ink-faint">Review decision</p>
            <div className="flex flex-wrap gap-2">
              {lead.reviewStatus !== "APPROVED" && (
                <Button
                  variant="primary"
                  disabled={lead.doNotContact}
                  loading={review.isPending && review.variables?.decision === "APPROVE"}
                  onClick={() => review.mutate({ id: lead.id, decision: "APPROVE" }, { onSuccess: () => toast("Lead approved."), onError: fail })}
                >
                  Approve
                </Button>
              )}
              {lead.reviewStatus !== "REJECTED" && <Button onClick={() => setOpen("reject")}>Reject</Button>}
              {lead.reviewStatus !== "PENDING" && (
                <Button
                  variant="ghost"
                  loading={review.isPending && review.variables?.decision === "REOPEN"}
                  onClick={() => review.mutate({ id: lead.id, decision: "REOPEN" }, { onSuccess: () => toast("Moved back to candidates."), onError: fail })}
                >
                  Move back to candidates
                </Button>
              )}
            </div>
            {lead.doNotContact && <p className="text-[13px] text-ink-soft">Can't approve while marked do not contact.</p>}
          </div>
        )}

        <div className="space-y-2">
          <label htmlFor="assign" className="block text-[13px] text-ink-faint">
            Owner
          </label>
          <Select
            id="assign"
            value={lead.assignedTo?.id ?? ""}
            disabled={assign.isPending}
            onChange={(e) =>
              assign.mutate(
                { id: lead.id, userId: e.target.value || null },
                { onSuccess: (l) => toast(l.assignedTo ? `Assigned to ${l.assignedTo.name}.` : "Unassigned."), onError: fail },
              )
            }
          >
            <option value="">Unassigned</option>
            {(assignees.data?.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button onClick={() => setOpen("edit")}>Edit details</Button>
          <Button
            variant="ghost"
            loading={verify.isPending}
            onClick={() => verify.mutate(lead.id, { onSuccess: () => toast("Marked as verified by you."), onError: fail })}
          >
            {lead.detailsVerified ? "Verify again" : "Mark details verified"}
          </Button>
          {lead.reviewStatus === "APPROVED" && !contacted && !lead.doNotContact && (
            <Button variant="ghost" onClick={() => setOpen("contact")}>
              Record past contact
            </Button>
          )}
        </div>

        <div className="border-t border-line pt-4">
          {lead.doNotContact ? (
            isAdmin ? (
              <Button variant="ghost" onClick={() => setOpen("lift-dnc")}>
                Remove do-not-contact
              </Button>
            ) : (
              <p className="text-[13px] text-ink-soft">Only an admin can remove a do-not-contact mark.</p>
            )
          ) : (
            <Button variant="danger" onClick={() => setOpen("dnc")}>
              Mark do not contact
            </Button>
          )}
        </div>
      </div>

      {open === "reject" && (
        <ReasonDialog
          title="Reject this lead?"
          description="It moves to Rejected. You can move it back to candidates later."
          label="Why is it rejected?"
          confirmLabel="Reject lead"
          pending={review.isPending}
          error={review.error instanceof ApiError ? review.error : null}
          onClose={close}
          onConfirm={(note) => review.mutate({ id: lead.id, decision: "REJECT", note }, { onSuccess: () => (toast("Lead rejected."), close()) })}
        />
      )}
      {open === "dnc" && (
        <ReasonDialog
          title="Mark as do not contact?"
          description="Nobody will be able to approve or contact this business. The record is kept so the request keeps being respected."
          label="Reason (e.g. owner asked us not to contact them)"
          confirmLabel="Mark do not contact"
          tone="danger"
          pending={dnc.isPending}
          error={dnc.error instanceof ApiError ? dnc.error : null}
          onClose={close}
          onConfirm={(reason) => dnc.mutate({ id: lead.id, doNotContact: true, reason }, { onSuccess: () => (toast("Marked do not contact."), close()) })}
        />
      )}
      {open === "lift-dnc" && (
        <ReasonDialog
          title="Remove do-not-contact?"
          description="Only do this if it was set by mistake. The change is recorded in the audit log."
          label="Why is it being removed?"
          confirmLabel="Remove mark"
          pending={dnc.isPending}
          error={dnc.error instanceof ApiError ? dnc.error : null}
          onClose={close}
          onConfirm={(reason) => dnc.mutate({ id: lead.id, doNotContact: false, reason }, { onSuccess: () => (toast("Do-not-contact removed."), close()) })}
        />
      )}
      {open === "contact" && (
        <ReasonDialog
          title="Record past contact"
          description="For businesses contacted outside this app. Contacted leads are always kept and can't be deleted at retention review."
          label="How were they contacted?"
          confirmLabel="Record contact"
          withDate
          pending={contact.isPending}
          error={contact.error instanceof ApiError ? contact.error : null}
          onClose={close}
          onConfirm={(note, date) =>
            contact.mutate(
              { id: lead.id, note, contactedAt: new Date(`${date}T12:00:00`).toISOString() },
              { onSuccess: () => (toast("Contact recorded."), close()) },
            )
          }
        />
      )}
      {open === "edit" && (
        <Dialog open onOpenChange={(o) => !o && close()} title={`Edit ${lead.businessName}`}>
          <LeadForm lead={lead} isAdmin={isAdmin} onCancel={close} onSaved={() => (toast("Lead saved."), close())} />
        </Dialog>
      )}
    </Panel>
  );
}

function historyDetail(h: LeadHistoryEntryDto): string | null {
  const m = h.meta ?? {};
  if (h.previousStatus || h.newStatus) {
    const change = [h.previousStatus, h.newStatus]
      .filter((v): v is string => Boolean(v))
      .map(statusWord)
      .join(" → ");
    return typeof m.note === "string" ? `${change}: ${m.note}` : typeof m.reason === "string" ? `${change}: ${m.reason}` : change;
  }
  if (Array.isArray(m.fields)) return `Changed: ${(m.fields as string[]).join(", ")}`;
  if (typeof m.reason === "string") return m.reason;
  return null;
}

function History({ id }: { id: string }) {
  const history = useLeadHistory(id);
  return (
    <Panel className="p-5">
      <h2 className="text-lg font-semibold">History</h2>
      {history.isPending ? (
        <Skeleton className="mt-4 h-24 w-full" />
      ) : history.isError ? (
        <ErrorState error={history.error} onRetry={() => history.refetch()} />
      ) : (
        <ol className="mt-4 space-y-3">
          {history.data.data.map((h) => (
            <li key={h.id} className="border-l-2 border-line pl-3">
              <div className="text-[14px]">{describeAuditAction(h.action)}</div>
              {historyDetail(h) && <div className="text-[13px] text-ink-soft">{historyDetail(h)}</div>}
              <div className="text-[12px] text-ink-faint" title={formatDateTime(h.createdAt)}>
                {h.actor?.name ?? "System"} · {formatRelative(h.createdAt)}
              </div>
            </li>
          ))}
        </ol>
      )}
    </Panel>
  );
}

export function LeadDetailPage() {
  const { id = "" } = useParams();
  const user = useCurrentUser();
  const lead = useLead(id);
  const canManage = can(user.role, "leads:manage");

  if (lead.isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-9 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (lead.isError) {
    return (
      <div className="py-6">
        <ErrorState error={lead.error} onRetry={() => lead.refetch()} />
        <Link to="/leads" className="px-6 text-human hover:underline">
          Back to leads
        </Link>
      </div>
    );
  }
  const l = lead.data;

  return (
    <>
      <Link to="/leads" className="text-[14px] text-ink-soft hover:text-ink">
        ← Leads
      </Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-semibold leading-tight">{l.businessName}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] text-ink-faint">{leadNumber(l.displayId)}</span>
            <LeadBadges lead={l} />
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel className="p-5">
            <h2 className="text-lg font-semibold">Business</h2>
            <dl className="mt-2 divide-y divide-line">
              <Row label="Industry">{l.industry?.name}</Row>
              <Row label="Location">{[l.addressLine, l.area?.name, l.city?.name].filter(Boolean).join(", ") || null}</Row>
              <Row label="Instagram">{l.instagramHandle && <ExternalLink href={`instagram.com/${l.identifiers.find((i) => i.type === "INSTAGRAM")?.value ?? l.instagramHandle}`}>{l.instagramHandle}</ExternalLink>}</Row>
              <Row label="Website">{l.website && <ExternalLink href={l.website}>{l.website}</ExternalLink>}</Row>
              <Row label="Phone">{l.publicPhone}</Row>
              <Row label="Email">{l.publicEmail}</Row>
              <Row label="Details verified">
                {l.detailsVerifiedAt ? (
                  `By ${l.detailsVerifiedBy?.name ?? "a former user"}, ${formatDateTime(l.detailsVerifiedAt)}`
                ) : (
                  <span className="text-ink-soft">Not verified by a person yet</span>
                )}
              </Row>
              {l.identifiers.some((i) => i.isShared) && (
                <Row label="Shared details">
                  <span className="text-warn">
                    {l.identifiers
                      .filter((i) => i.isShared)
                      .map((i) => IDENTIFIER_LABELS[i.type])
                      .join(", ")}{" "}
                    also used by another lead (approved by an admin)
                  </span>
                </Row>
              )}
            </dl>
          </Panel>

          <Panel className="p-5">
            <h2 className="text-lg font-semibold">Source & status</h2>
            <dl className="mt-2 divide-y divide-line">
              <Row label="Found through">{LEAD_SOURCE_LABELS[l.source]}</Row>
              <Row label="Source link">{l.sourceUrl && <ExternalLink href={l.sourceUrl}>{l.sourceUrl}</ExternalLink>}</Row>
              <Row label="Source note">{l.sourceNote}</Row>
              <Row label="Added">
                {formatDateTime(l.createdAt)}
                {l.createdBy ? ` by ${l.createdBy.name}` : ""}
              </Row>
              <Row label="Review">
                {l.reviewedAt ? `${l.reviewStatus === "APPROVED" ? "Approved" : "Rejected"} by ${l.reviewedBy?.name ?? "a former user"}, ${formatDateTime(l.reviewedAt)}` : "Not reviewed yet"}
                {l.reviewNote && <div className="text-ink-soft">{l.reviewNote}</div>}
              </Row>
              <Row label="Contact">
                {l.contactedAt ? (
                  <>
                    Contacted {formatDateTime(l.contactedAt)}
                    {l.contactNote && <div className="text-ink-soft">{l.contactNote}</div>}
                  </>
                ) : (
                  "Not contacted"
                )}
              </Row>
              {l.doNotContact && (
                <Row label="Do not contact">
                  <Badge tone="danger">Since {l.doNotContactAt ? formatDateTime(l.doNotContactAt) : "—"}</Badge>
                  {l.doNotContactReason && <div className="mt-1 text-ink-soft">{l.doNotContactReason}</div>}
                </Row>
              )}
              {l.retentionHoldUntil && <Row label="Kept at retention review until">{formatDateTime(l.retentionHoldUntil)}</Row>}
              <Row label="Owner">{l.assignedTo?.name ?? "Unassigned"}</Row>
              <Row label="Notes">{l.notes && <span className="whitespace-pre-wrap">{l.notes}</span>}</Row>
            </dl>
          </Panel>
        </div>

        <div className="space-y-6">
          {canManage && <Actions lead={l} />}
          <History id={l.id} />
        </div>
      </div>
    </>
  );
}
