import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router";
import {
  LEAD_RETENTION_MAX_DAYS,
  LEAD_RETENTION_MIN_DAYS,
  can,
  type CompanyProfileDto,
} from "@prosolution/shared";
import { ApiError } from "../lib/api.ts";
import { formatDateTime } from "../lib/format.ts";
import { useCurrentUser } from "../features/auth/session.tsx";
import { useCompanyProfile, useSaveCompanyProfile, useSaveSystemSettings, useSystemSettings } from "../features/config/api.ts";
import { Button, Checkbox, Field, Input, PageHeader, Panel, Skeleton, Textarea } from "../components/ui/primitives.tsx";
import { ErrorState } from "../components/ui/states.tsx";
import { useToast } from "../components/ui/toast.tsx";
import { useConfirm } from "../components/ui/dialog.tsx";

type ProfileForm = Omit<CompanyProfileDto, "updatedAt">;
const textFields: (keyof ProfileForm)[] = [
  "companyName",
  "tagline",
  "description",
  "city",
  "publicEmail",
  "publicPhone",
  "instagramHandle",
  "website",
  "qualificationNotes",
];

function toForm(p: CompanyProfileDto): Record<string, string | boolean> {
  const out: Record<string, string | boolean> = { requireOnlinePresence: p.requireOnlinePresence };
  for (const k of textFields) out[k] = (p[k] as string | null) ?? "";
  return out;
}

function CompanyProfileForm({ profile, editable }: { profile: CompanyProfileDto; editable: boolean }) {
  const save = useSaveCompanyProfile();
  const toast = useToast();
  const [form, setForm] = useState(() => toForm(profile));
  useEffect(() => setForm(toForm(profile)), [profile]);
  const error = save.error instanceof ApiError ? save.error : null;
  const text = (k: keyof ProfileForm) => String(form[k] ?? "");
  const set = (k: keyof ProfileForm) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      {
        companyName: text("companyName"),
        tagline: text("tagline"),
        description: text("description"),
        city: text("city"),
        publicEmail: text("publicEmail"),
        publicPhone: text("publicPhone"),
        instagramHandle: text("instagramHandle"),
        website: text("website"),
        qualificationNotes: text("qualificationNotes"),
        requireOnlinePresence: Boolean(form.requireOnlinePresence),
      },
      { onSuccess: () => toast("Company profile saved.") },
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <fieldset disabled={!editable} className="grid gap-5 p-6 md:grid-cols-2">
        {error && !Object.keys(error.details).length && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger md:col-span-2">
            {error.message}
          </div>
        )}
        <Field label="Company name" error={error?.fieldError("companyName")}>
          {(p) => <Input {...p} value={text("companyName")} onChange={set("companyName")} />}
        </Field>
        <Field label="Tagline" error={error?.fieldError("tagline")}>
          {(p) => <Input {...p} value={text("tagline")} onChange={set("tagline")} />}
        </Field>
        <div className="md:col-span-2">
          <Field label="About the company" hint="Used later as background for AI-drafted messages." error={error?.fieldError("description")}>
            {(p) => <Textarea {...p} rows={4} value={text("description")} onChange={set("description")} />}
          </Field>
        </div>
        <Field label="City" error={error?.fieldError("city")}>
          {(p) => <Input {...p} value={text("city")} onChange={set("city")} />}
        </Field>
        <Field label="Website" error={error?.fieldError("website")}>
          {(p) => <Input {...p} value={text("website")} onChange={set("website")} placeholder="prosolution.in" />}
        </Field>
        <Field label="Public email" error={error?.fieldError("publicEmail")}>
          {(p) => <Input {...p} type="email" value={text("publicEmail")} onChange={set("publicEmail")} />}
        </Field>
        <Field label="Public phone" error={error?.fieldError("publicPhone")}>
          {(p) => <Input {...p} value={text("publicPhone")} onChange={set("publicPhone")} />}
        </Field>
        <Field label="Instagram" error={error?.fieldError("instagramHandle")}>
          {(p) => <Input {...p} value={text("instagramHandle")} onChange={set("instagramHandle")} placeholder="@_pro.solutions_" />}
        </Field>
        <div className="md:col-span-2">
          <Field
            label="Qualification preferences"
            hint="What makes a business a good fit, and rules the AI must follow (Phase 5)."
            error={error?.fieldError("qualificationNotes")}
          >
            {(p) => <Textarea {...p} rows={4} value={text("qualificationNotes")} onChange={set("qualificationNotes")} />}
          </Field>
        </div>
        <div className="md:col-span-2">
          <Checkbox
            checked={Boolean(form.requireOnlinePresence)}
            onChange={(v) => setForm({ ...form, requireOnlinePresence: v })}
            label="Only qualify businesses with a website or Instagram profile"
            description="Applied by research and qualification in later phases."
            disabled={!editable}
          />
        </div>
      </fieldset>
      {editable && (
        <div className="flex items-center justify-between gap-3 border-t border-line px-6 py-4">
          <span className="text-[13px] text-ink-faint">
            {profile.updatedAt ? `Last saved ${formatDateTime(profile.updatedAt)}` : "Not saved yet"}
          </span>
          <Button type="submit" variant="primary" loading={save.isPending}>
            Save profile
          </Button>
        </div>
      )}
    </form>
  );
}

function RetentionSetting({ editable }: { editable: boolean }) {
  const settings = useSystemSettings();
  const save = useSaveSystemSettings();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [days, setDays] = useState("");
  useEffect(() => {
    if (settings.data) setDays(String(settings.data.leadRetentionDays));
  }, [settings.data]);
  const error = save.error instanceof ApiError ? save.error : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const n = Number(days);
    if (settings.data && n < settings.data.leadRetentionDays) {
      const ok = await confirm({
        title: "Shorten the retention period?",
        body: `More leads will become eligible for review. Nothing is deleted automatically; an admin still has to review and confirm each deletion.`,
        confirmLabel: "Save shorter period",
      });
      if (!ok) return;
    }
    save.mutate({ leadRetentionDays: n }, { onSuccess: () => toast("Retention period saved.") });
  }

  if (settings.isPending) return <Skeleton className="m-6 h-20" />;
  if (settings.isError) return <ErrorState error={settings.error} onRetry={() => settings.refetch()} />;

  return (
    <form onSubmit={submit} className="space-y-4 p-6" noValidate>
      {confirmEl}
      <p className="max-w-[62ch] text-[14px] text-ink-soft">
        Leads that were never contacted become <strong className="font-medium text-ink">eligible for review</strong> after this many days.
        They are never deleted automatically. Contacted and do-not-contact leads are always kept.
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <div className="w-40">
          <Field label="Days" error={error?.fieldError("leadRetentionDays")}>
            {(p) => (
              <Input
                {...p}
                type="number"
                inputMode="numeric"
                min={LEAD_RETENTION_MIN_DAYS}
                max={LEAD_RETENTION_MAX_DAYS}
                value={days}
                disabled={!editable}
                onChange={(e) => setDays(e.target.value)}
              />
            )}
          </Field>
        </div>
        {editable && (
          <Button type="submit" variant="primary" loading={save.isPending} disabled={days === String(settings.data.leadRetentionDays)}>
            Save
          </Button>
        )}
        {editable && (
          <Link to="/data-retention" className="pb-2 text-[14px] text-human hover:underline">
            Review eligible leads
          </Link>
        )}
      </div>
    </form>
  );
}

export function ServiceProfilePage() {
  const user = useCurrentUser();
  const editable = can(user.role, "settings:manage");
  const profile = useCompanyProfile();

  return (
    <>
      <PageHeader
        title="Service profile"
        description={
          editable
            ? "Who ProSolution is and what makes a good lead. Services and target market have their own pages."
            : "Read-only. Ask an admin to change the company profile."
        }
      />
      <div className="space-y-6">
        <Panel>
          <h2 className="px-6 pt-5 text-lg font-semibold">Company</h2>
          {profile.isPending ? (
            <div className="space-y-3 p-6">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : profile.isError ? (
            <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
          ) : (
            <>
              {!profile.data.updatedAt && (
                <p className="mx-6 mt-3 rounded-[var(--radius-control)] bg-warn-soft px-3 py-2 text-[14px] text-warn">
                  No company profile saved yet. Run <span className="font-mono">pnpm db:seed</span> to load ProSolution's details, or fill in the form.
                </p>
              )}
              <CompanyProfileForm profile={profile.data} editable={editable} />
            </>
          )}
        </Panel>
        <Panel>
          <h2 className="px-6 pt-5 text-lg font-semibold">Lead retention</h2>
          <RetentionSetting editable={editable} />
        </Panel>
      </div>
    </>
  );
}
