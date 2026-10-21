import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  IDENTIFIER_LABELS,
  LEAD_SOURCES,
  LEAD_SOURCE_LABELS,
  type DuplicateCheckDto,
  type DuplicateMatchDto,
  type LeadDetailDto,
  type LeadSource,
} from "@prosolution/shared";
import { ApiError } from "../../lib/api.ts";
import { leadNumber } from "../../lib/format.ts";
import { useAreas, useIndustries } from "../config/api.ts";
import { Button, Checkbox, Field, Input, Select, Textarea, cx } from "../../components/ui/primitives.tsx";
import { checkDuplicates, useCreateLead, useUpdateLead } from "./api.ts";

interface FormState {
  businessName: string;
  industryId: string;
  areaId: string;
  addressLine: string;
  website: string;
  instagramHandle: string;
  publicPhone: string;
  publicEmail: string;
  source: LeadSource;
  sourceUrl: string;
  sourceNote: string;
  notes: string;
}

function initial(lead?: LeadDetailDto): FormState {
  return {
    businessName: lead?.businessName ?? "",
    industryId: lead?.industry?.id ?? "",
    areaId: lead?.area?.id ?? "",
    addressLine: lead?.addressLine ?? "",
    website: lead?.website ?? "",
    instagramHandle: lead?.instagramHandle ?? "",
    publicPhone: lead?.publicPhone ?? "",
    publicEmail: lead?.publicEmail ?? "",
    source: lead?.source ?? "MANUAL_RESEARCH",
    sourceUrl: lead?.sourceUrl ?? "",
    sourceNote: lead?.sourceNote ?? "",
    notes: lead?.notes ?? "",
  };
}

const EMPTY_DUPES: DuplicateCheckDto = { exact: [], shared: [], possible: [] };

function MatchList({ matches }: { matches: DuplicateMatchDto[] }) {
  return (
    <ul className="mt-2 space-y-1">
      {matches.map((m) => (
        <li key={m.lead.id} className="text-[13px]">
          <Link to={`/leads/${m.lead.id}`} target="_blank" className="font-medium underline underline-offset-2">
            {leadNumber(m.lead.displayId)} {m.lead.businessName}
          </Link>
          <span className="text-ink-soft">
            {m.lead.areaName ? `, ${m.lead.areaName}` : ""}
            {m.matchedOn.length ? ` · same ${m.matchedOn.map((t) => IDENTIFIER_LABELS[t].toLowerCase()).join(", ")}` : ""}
            {m.lead.doNotContact ? " · do not contact" : ""}
          </span>
        </li>
      ))}
    </ul>
  );
}

export interface DuplicateDecision {
  confirmDifferentBusiness: boolean;
  approveSharedIdentifiers: boolean;
  sharedIdentifierReason: string;
}

/** Explains what matched and collects the decision the rules need. Never merges anything. */
export function DuplicatePanel({
  dupes,
  isAdmin,
  decision,
  onDecision,
  reasonError,
}: {
  dupes: DuplicateCheckDto;
  isAdmin: boolean;
  decision: DuplicateDecision;
  onDecision: (d: DuplicateDecision) => void;
  reasonError?: string;
}) {
  if (!dupes.exact.length && !dupes.shared.length && !dupes.possible.length) return null;
  return (
    <div className="space-y-3" aria-live="polite">
      {dupes.exact.length > 0 && (
        <div role="alert" className="rounded-[var(--radius-control)] border border-danger/25 bg-danger-soft px-3 py-2.5 text-danger">
          <p className="text-[14px] font-medium">This business is already in the system.</p>
          <p className="text-[13px]">Same name and contact details. Open the existing lead instead of adding it again.</p>
          <MatchList matches={dupes.exact} />
        </div>
      )}
      {dupes.shared.length > 0 && (
        <div className="rounded-[var(--radius-control)] border border-warn/30 bg-warn-soft px-3 py-2.5 text-warn">
          <p className="text-[14px] font-medium">These contact details belong to another lead.</p>
          <p className="text-[13px] text-ink-soft">
            Branches of one business can share a phone number. {isAdmin ? "If this is a separate branch, approve it below." : "Only an admin can add a separate branch with shared details."}
          </p>
          <MatchList matches={dupes.shared} />
          {isAdmin && (
            <div className="mt-3 space-y-2 text-ink">
              <Checkbox
                checked={decision.approveSharedIdentifiers}
                onChange={(v) => onDecision({ ...decision, approveSharedIdentifiers: v })}
                label="This is a separate branch or business that shares these details"
              />
              {decision.approveSharedIdentifiers && (
                <Field label="Why do they share these details?" error={reasonError}>
                  {(p) => (
                    <Input
                      {...p}
                      value={decision.sharedIdentifierReason}
                      onChange={(e) => onDecision({ ...decision, sharedIdentifierReason: e.target.value })}
                      placeholder="e.g. Same owner, two outlets, one booking number"
                    />
                  )}
                </Field>
              )}
            </div>
          )}
        </div>
      )}
      {dupes.possible.length > 0 && (
        <div className="rounded-[var(--radius-control)] border border-warn/30 bg-warn-soft px-3 py-2.5 text-warn">
          <p className="text-[14px] font-medium">A lead with the same name exists in this area.</p>
          <MatchList matches={dupes.possible} />
          <div className="mt-2 text-ink">
            <Checkbox
              checked={decision.confirmDifferentBusiness}
              onChange={(v) => onDecision({ ...decision, confirmDifferentBusiness: v })}
              label="I've checked: this is a different business"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function LeadForm({
  lead,
  isAdmin,
  onSaved,
  onCancel,
}: {
  lead?: LeadDetailDto;
  isAdmin: boolean;
  onSaved: (lead: LeadDetailDto) => void;
  onCancel: () => void;
}) {
  const industries = useIndustries("all");
  const areas = useAreas("all");
  const create = useCreateLead();
  const update = useUpdateLead();
  const mutation = lead ? update : create;
  const [form, setForm] = useState<FormState>(() => initial(lead));
  const [dupes, setDupes] = useState<DuplicateCheckDto>(EMPTY_DUPES);
  const [decision, setDecision] = useState<DuplicateDecision>({
    confirmDifferentBusiness: false,
    approveSharedIdentifiers: false,
    sharedIdentifierReason: "",
  });
  const error = mutation.error instanceof ApiError ? mutation.error : null;
  const set = (k: keyof FormState) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // Live duplicate check while typing (debounced). Only the identity fields matter.
  const identity = JSON.stringify([form.businessName, form.areaId, form.website, form.instagramHandle, form.publicPhone, form.publicEmail]);
  const seq = useRef(0);
  useEffect(() => {
    if (!form.businessName.trim() && !form.website && !form.instagramHandle && !form.publicPhone && !form.publicEmail) {
      setDupes(EMPTY_DUPES);
      return;
    }
    const mine = ++seq.current;
    const t = window.setTimeout(() => {
      checkDuplicates({
        businessName: form.businessName,
        areaId: form.areaId || null,
        website: form.website || null,
        instagramHandle: form.instagramHandle || null,
        publicPhone: form.publicPhone || null,
        publicEmail: form.publicEmail || null,
        ...(lead ? { excludeLeadId: lead.id } : {}),
      }).then(
        (d) => mine === seq.current && setDupes(d),
        () => undefined, // the server re-checks on save; a failed preview isn't fatal
      );
    }, 400);
    return () => window.clearTimeout(t);
  }, [identity]);

  useEffect(() => {
    if (error?.duplicates) setDupes(error.duplicates);
  }, [error]);

  const blocked = dupes.exact.length > 0 || (dupes.shared.length > 0 && !isAdmin);

  // Offer active options, plus whatever this lead already uses (even if since disabled).
  const industryOptions = useMemo(
    () => (industries.data?.data ?? []).filter((i) => i.isActive || i.id === lead?.industry?.id),
    [industries.data, lead],
  );
  const areaOptions = useMemo(() => (areas.data?.data ?? []).filter((a) => a.isActive || a.id === lead?.area?.id), [areas.data, lead]);

  function submit(e: FormEvent) {
    e.preventDefault();
    const payload = {
      businessName: form.businessName,
      industryId: form.industryId || null,
      areaId: form.areaId || null,
      addressLine: form.addressLine,
      website: form.website,
      instagramHandle: form.instagramHandle,
      publicPhone: form.publicPhone,
      publicEmail: form.publicEmail,
      source: form.source,
      sourceUrl: form.sourceUrl,
      sourceNote: form.sourceNote,
      notes: form.notes,
      duplicates: {
        confirmDifferentBusiness: decision.confirmDifferentBusiness,
        approveSharedIdentifiers: decision.approveSharedIdentifiers,
        sharedIdentifierReason: decision.sharedIdentifierReason,
      },
    };
    if (lead) update.mutate({ id: lead.id, input: payload }, { onSuccess: onSaved });
    else create.mutate(payload, { onSuccess: onSaved });
  }

  const showGeneralError = error && !error.duplicates && !Object.keys(error.details).length;

  return (
    <form id="lead-form" onSubmit={submit} className="space-y-5" noValidate>
      {showGeneralError && (
        <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
          {error.message}
        </div>
      )}
      <Field label="Business name" error={error?.fieldError("businessName")}>
        {(p) => <Input {...p} value={form.businessName} onChange={set("businessName")} autoFocus={!lead} />}
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" error={error?.fieldError("industryId")}>
          {(p) => (
            <Select {...p} value={form.industryId} onChange={set("industryId")}>
              <option value="">Not set</option>
              {industryOptions.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Area" error={error?.fieldError("areaId")}>
          {(p) => (
            <Select {...p} value={form.areaId} onChange={set("areaId")}>
              <option value="">Not set</option>
              {areaOptions.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}, {a.cityName}
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
      <Field label="Address (optional)" error={error?.fieldError("addressLine")}>
        {(p) => <Input {...p} value={form.addressLine} onChange={set("addressLine")} />}
      </Field>

      <fieldset className="space-y-4 rounded-[var(--radius-control)] border border-line p-4">
        <legend className="px-1 text-sm font-medium">Public business contact details</legend>
        <p className="-mt-1 text-[13px] text-ink-soft">Only details the business publishes itself. Leave blank if unknown; never guess.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Instagram" error={error?.fieldError("instagramHandle")}>
            {(p) => <Input {...p} value={form.instagramHandle} onChange={set("instagramHandle")} placeholder="@business or profile link" />}
          </Field>
          <Field label="Website" error={error?.fieldError("website")}>
            {(p) => <Input {...p} value={form.website} onChange={set("website")} placeholder="business.com" />}
          </Field>
          <Field label="Phone" error={error?.fieldError("publicPhone")}>
            {(p) => <Input {...p} type="tel" value={form.publicPhone} onChange={set("publicPhone")} placeholder="98765 43210" />}
          </Field>
          <Field label="Email" error={error?.fieldError("publicEmail")}>
            {(p) => <Input {...p} type="email" value={form.publicEmail} onChange={set("publicEmail")} />}
          </Field>
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="How we found it" error={error?.fieldError("source")}>
          {(p) => (
            <Select {...p} value={form.source} onChange={set("source")}>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {LEAD_SOURCE_LABELS[s]}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field label="Source link (optional)" hint="Where the details were found." error={error?.fieldError("sourceUrl")}>
          {(p) => <Input {...p} value={form.sourceUrl} onChange={set("sourceUrl")} placeholder="https://" />}
        </Field>
      </div>
      <Field label="Source note (optional)" error={error?.fieldError("sourceNote")}>
        {(p) => <Input {...p} value={form.sourceNote} onChange={set("sourceNote")} placeholder="e.g. Referred by a client" />}
      </Field>
      <Field label="Notes (optional)" error={error?.fieldError("notes")}>
        {(p) => <Textarea {...p} rows={3} value={form.notes} onChange={set("notes")} />}
      </Field>

      <DuplicatePanel
        dupes={dupes}
        isAdmin={isAdmin}
        decision={decision}
        onDecision={setDecision}
        reasonError={error?.fieldError("sharedIdentifierReason")}
      />

      <div className={cx("flex flex-wrap justify-end gap-2 border-t border-line pt-4")}>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={mutation.isPending} disabled={blocked}>
          {lead ? "Save changes" : "Add candidate"}
        </Button>
      </div>
    </form>
  );
}
