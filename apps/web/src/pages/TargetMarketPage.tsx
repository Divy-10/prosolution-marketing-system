import { useEffect, useMemo, useState, type FormEvent } from "react";
import { can, type AreaDto, type IndustryDto } from "@prosolution/shared";
import { ApiError } from "../lib/api.ts";
import { useCurrentUser } from "../features/auth/session.tsx";
import { useAreas, useCities, useIndustries, useSaveArea, useSaveIndustry, useServices } from "../features/config/api.ts";
import { Badge, Button, Checkbox, Field, Input, PageHeader, Panel, Select, Skeleton, Textarea } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState } from "../components/ui/states.tsx";
import { Dialog, useConfirm } from "../components/ui/dialog.tsx";
import { Tabs } from "../components/ui/tabs.tsx";
import { useToast } from "../components/ui/toast.tsx";

// ── Industries ──────────────────────────────────────────────────────────────
function IndustryDialog({ industry, onClose }: { industry: IndustryDto | null; onClose: () => void }) {
  const services = useServices("all");
  const save = useSaveIndustry();
  const toast = useToast();
  const [name, setName] = useState(industry?.name ?? "");
  const [description, setDescription] = useState(industry?.description ?? "");
  const [aiGuidance, setAiGuidance] = useState(industry?.aiGuidance ?? "");
  const [serviceIds, setServiceIds] = useState<string[]>(industry?.serviceIds ?? []);
  const error = save.error instanceof ApiError ? save.error : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { ...(industry ? { id: industry.id } : {}), input: { name, description, aiGuidance, serviceIds } },
      { onSuccess: (i) => (toast(industry ? `Saved ${i.name}.` : `Added ${i.name}.`), onClose()) },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={industry ? `Edit ${industry.name}` : "Add an industry"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="industry-form" loading={save.isPending}>
            {industry ? "Save industry" : "Add industry"}
          </Button>
        </>
      }
    >
      <form id="industry-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(error.details).length && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error.message}
          </div>
        )}
        <Field label="Name" error={error?.fieldError("name")}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} />}
        </Field>
        <Field label="Description (optional)" error={error?.fieldError("description")}>
          {(p) => <Textarea {...p} rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />}
        </Field>
        <Field label="Guidance for the AI (optional)" hint="Used from Phase 5, e.g. what to look for in this kind of business." error={error?.fieldError("aiGuidance")}>
          {(p) => <Textarea {...p} rows={3} value={aiGuidance} onChange={(e) => setAiGuidance(e.target.value)} />}
        </Field>
        <fieldset>
          <legend className="mb-2 text-sm font-medium">Suggested services</legend>
          <p className="mb-3 text-[13px] text-ink-soft">Starting suggestions only. The AI still checks what fits each business.</p>
          {services.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(services.data?.data ?? []).map((s) => (
                <Checkbox
                  key={s.id}
                  checked={serviceIds.includes(s.id)}
                  onChange={(v) => setServiceIds(v ? [...serviceIds, s.id] : serviceIds.filter((x) => x !== s.id))}
                  label={
                    <>
                      {s.name} {!s.isActive && <span className="text-ink-faint">(disabled)</span>}
                    </>
                  }
                />
              ))}
            </div>
          )}
        </fieldset>
      </form>
    </Dialog>
  );
}

function IndustriesTab({ editable }: { editable: boolean }) {
  const industries = useIndustries("all");
  const services = useServices("all");
  const save = useSaveIndustry();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [editing, setEditing] = useState<IndustryDto | "new" | null>(null);
  const serviceNames = useMemo(() => new Map((services.data?.data ?? []).map((s) => [s.id, s.name])), [services.data]);

  async function toggle(i: IndustryDto) {
    if (i.isActive) {
      const ok = await confirm({
        title: `Disable ${i.name}?`,
        body: `It won't be offered for new leads or campaigns. ${i.leadCount ? `The ${i.leadCount} existing lead${i.leadCount === 1 ? "" : "s"} keep it.` : ""}`,
        confirmLabel: "Disable industry",
        tone: "danger",
      });
      if (!ok) return;
    }
    save.mutate(
      { id: i.id, input: { isActive: !i.isActive } },
      { onSuccess: () => toast(i.isActive ? `Disabled ${i.name}.` : `Enabled ${i.name}.`) },
    );
  }

  if (industries.isPending) return <Skeleton className="m-4 h-40" />;
  if (industries.isError) return <ErrorState error={industries.error} onRetry={() => industries.refetch()} />;

  return (
    <>
      {confirmEl}
      <div className="flex items-center justify-between gap-3 px-5 py-3">
        <p className="text-[14px] text-ink-soft">{industries.data.data.length} industries</p>
        {editable && (
          <Button size="sm" variant="primary" onClick={() => setEditing("new")}>
            Add industry
          </Button>
        )}
      </div>
      {industries.data.data.length === 0 ? (
        <EmptyState title="No industries yet">
          Run <span className="font-mono">pnpm db:seed</span> to load the 16 approved industries.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line border-t border-line">
          {industries.data.data.map((i) => (
            <li key={i.id} className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.name}</span>
                  {!i.isActive && <Badge tone="warn">Disabled</Badge>}
                  <span className="text-[13px] text-ink-faint tabular">
                    {i.leadCount} lead{i.leadCount === 1 ? "" : "s"}
                  </span>
                </div>
                {i.serviceIds.length > 0 && (
                  <p className="mt-0.5 text-[13px] text-ink-soft">{i.serviceIds.map((id) => serviceNames.get(id)).filter(Boolean).join(" · ")}</p>
                )}
                {i.description && <p className="mt-0.5 text-[13px] text-ink-faint">{i.description}</p>}
              </div>
              {editable && (
                <div className="flex shrink-0 gap-2">
                  <Button size="sm" onClick={() => setEditing(i)} aria-label={`Edit ${i.name}`}>
                    Edit
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(i)}>
                    {i.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {editing && <IndustryDialog industry={editing === "new" ? null : editing} onClose={() => setEditing(null)} />}
    </>
  );
}

// ── Areas ───────────────────────────────────────────────────────────────────
function RenameAreaDialog({ area, onClose }: { area: AreaDto; onClose: () => void }) {
  const save = useSaveArea();
  const toast = useToast();
  const [name, setName] = useState(area.name);
  const error = save.error instanceof ApiError ? save.error : null;
  return (
    <Dialog
      open
      width="sm"
      onOpenChange={(o) => !o && onClose()}
      title={`Rename ${area.name}`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            loading={save.isPending}
            onClick={() => save.mutate({ id: area.id, input: { name } }, { onSuccess: (a) => (toast(`Renamed to ${a.name}.`), onClose()) })}
          >
            Save name
          </Button>
        </>
      }
    >
      <Field label="Area name" error={error?.fieldError("name") ?? (error && !error.details.name ? error.message : undefined)}>
        {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
      </Field>
    </Dialog>
  );
}

function AreasTab({ editable }: { editable: boolean }) {
  const cities = useCities();
  const [cityId, setCityId] = useState<string>("");
  useEffect(() => {
    if (!cityId && cities.data?.data[0]) setCityId(cities.data.data[0].id);
  }, [cities.data, cityId]);
  const areas = useAreas("all", cityId || undefined);
  const save = useSaveArea();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [newName, setNewName] = useState("");
  const [renaming, setRenaming] = useState<AreaDto | null>(null);
  const addError = save.error instanceof ApiError && save.variables && !save.variables.id ? save.error : null;

  function add(e: FormEvent) {
    e.preventDefault();
    save.mutate(
      { input: { cityId, name: newName } },
      { onSuccess: (a) => (toast(`Added ${a.name}.`), setNewName("")) },
    );
  }

  async function toggle(a: AreaDto) {
    if (a.isActive) {
      const ok = await confirm({
        title: `Disable ${a.name}?`,
        body: "It won't be offered for new leads. Existing leads keep their area.",
        confirmLabel: "Disable area",
        tone: "danger",
      });
      if (!ok) return;
    }
    save.mutate({ id: a.id, input: { isActive: !a.isActive } }, { onSuccess: () => toast(a.isActive ? `Disabled ${a.name}.` : `Enabled ${a.name}.`) });
  }

  if (cities.isPending) return <Skeleton className="m-4 h-40" />;
  if (cities.isError) return <ErrorState error={cities.error} onRetry={() => cities.refetch()} />;
  if (cities.data.data.length === 0) {
    return (
      <EmptyState title="No cities yet">
        Run <span className="font-mono">pnpm db:seed</span> to load Surat and its areas.
      </EmptyState>
    );
  }

  return (
    <>
      {confirmEl}
      <div className="flex flex-wrap items-end gap-3 px-5 py-4">
        <label className="text-[13px] text-ink-soft">
          <span className="mb-1 block">City</span>
          <Select value={cityId} onChange={(e) => setCityId(e.target.value)} className="w-auto">
            {cities.data.data.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}, {c.state}
              </option>
            ))}
          </Select>
        </label>
        {editable && (
          <form onSubmit={add} className="flex flex-wrap items-end gap-2" noValidate>
            <div className="w-56">
              <Field label="New area" error={addError ? (addError.fieldError("name") ?? addError.message) : undefined}>
                {(p) => <Input {...p} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rander" />}
              </Field>
            </div>
            <Button type="submit" disabled={!newName.trim()} loading={save.isPending && !save.variables?.id}>
              Add area
            </Button>
          </form>
        )}
      </div>
      {areas.isPending ? (
        <Skeleton className="m-4 h-40" />
      ) : areas.isError ? (
        <ErrorState error={areas.error} onRetry={() => areas.refetch()} />
      ) : areas.data.data.length === 0 ? (
        <EmptyState title="No areas in this city yet" />
      ) : (
        <ul className="grid border-t border-line sm:grid-cols-2 lg:grid-cols-3">
          {areas.data.data.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 border-b border-line px-5 py-3 sm:[&:nth-child(odd)]:border-r lg:[&:nth-child(odd)]:border-r-0 lg:[&:not(:nth-child(3n))]:border-r">
              <div>
                <span className={a.isActive ? "font-medium" : "font-medium text-ink-faint line-through"}>{a.name}</span>
                <span className="ml-2 text-[13px] text-ink-faint tabular">{a.leadCount}</span>
                {!a.isActive && <Badge tone="warn" className="ml-2">Disabled</Badge>}
              </div>
              {editable && (
                <div className="flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(a)} aria-label={`Rename ${a.name}`}>
                    Rename
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => toggle(a)}>
                    {a.isActive ? "Disable" : "Enable"}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      {renaming && <RenameAreaDialog area={renaming} onClose={() => setRenaming(null)} />}
    </>
  );
}

export function TargetMarketPage() {
  const user = useCurrentUser();
  const editable = can(user.role, "knowledge:manage");
  const [tab, setTab] = useState<"industries" | "areas">("industries");
  return (
    <>
      <PageHeader
        title="Target market"
        description={
          editable
            ? "The industries and areas ProSolution targets. Disable instead of deleting, so existing leads keep their history."
            : "The industries and areas ProSolution targets. Read-only: ask an admin to change them."
        }
      />
      <Panel>
        <Tabs
          label="Target market"
          value={tab}
          onChange={setTab}
          items={[
            { value: "industries", label: "Industries" },
            { value: "areas", label: "Areas" },
          ]}
        />
        {tab === "industries" ? <IndustriesTab editable={editable} /> : <AreasTab editable={editable} />}
      </Panel>
    </>
  );
}
