import { useMemo, useState, type FormEvent } from "react";
import { can, type IndustryDto, type ServiceDto } from "@prosolution/shared";
import { ApiError } from "../lib/api.ts";
import { useCurrentUser } from "../features/auth/session.tsx";
import { useIndustries, useSaveService, useServices } from "../features/config/api.ts";
import { Badge, Button, Field, Input, PageHeader, Panel, Select, Skeleton, Textarea } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState } from "../components/ui/states.tsx";
import { Dialog, useConfirm } from "../components/ui/dialog.tsx";
import { useToast } from "../components/ui/toast.tsx";

const EMPTY = {
  name: "",
  category: "",
  description: "",
  idealCustomer: "",
  keyBenefits: "",
  exampleOffer: "",
  cta: "",
  restrictions: "",
  portfolioUrl: "",
};
type Form = typeof EMPTY;

function toForm(s: ServiceDto): Form {
  return {
    name: s.name,
    category: s.category,
    description: s.description,
    idealCustomer: s.idealCustomer ?? "",
    keyBenefits: s.keyBenefits.join("\n"),
    exampleOffer: s.exampleOffer ?? "",
    cta: s.cta ?? "",
    restrictions: s.restrictions ?? "",
    portfolioUrl: s.portfolioUrl ?? "",
  };
}

function ServiceDialog({ service, categories, onClose }: { service: ServiceDto | null; categories: string[]; onClose: () => void }) {
  const save = useSaveService();
  const toast = useToast();
  const [form, setForm] = useState<Form>(service ? toForm(service) : EMPTY);
  const error = save.error instanceof ApiError ? save.error : null;
  const set = (k: keyof Form) => (e: { target: { value: string } }) => setForm({ ...form, [k]: e.target.value });

  function submit(e: FormEvent) {
    e.preventDefault();
    const input = {
      ...form,
      keyBenefits: form.keyBenefits
        .split("\n")
        .map((b) => b.trim())
        .filter(Boolean),
    };
    save.mutate(
      { ...(service ? { id: service.id } : {}), input },
      { onSuccess: (s) => (toast(service ? `Saved ${s.name}.` : `Added ${s.name}.`), onClose()) },
    );
  }

  return (
    <Dialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={service ? `Edit ${service.name}` : "Add a service"}
      description="Describe what ProSolution actually delivers. Don't add prices here."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" type="submit" form="service-form" loading={save.isPending}>
            {service ? "Save service" : "Add service"}
          </Button>
        </>
      }
    >
      <form id="service-form" onSubmit={submit} className="space-y-4" noValidate>
        {error && !Object.keys(error.details).length && (
          <div role="alert" className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2.5 text-sm text-danger">
            {error.message}
          </div>
        )}
        <Field label="Name" error={error?.fieldError("name")}>
          {(p) => <Input {...p} value={form.name} onChange={set("name")} />}
        </Field>
        <Field label="Category" hint="Groups services in lists, e.g. Website, Marketing, Social & content." error={error?.fieldError("category")}>
          {(p) => <Input {...p} value={form.category} onChange={set("category")} list="service-categories" />}
        </Field>
        <datalist id="service-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <Field label="What's included" error={error?.fieldError("description")}>
          {(p) => <Textarea {...p} rows={4} value={form.description} onChange={set("description")} />}
        </Field>
        <Field label="Ideal customer" error={error?.fieldError("idealCustomer")}>
          {(p) => <Textarea {...p} rows={2} value={form.idealCustomer} onChange={set("idealCustomer")} />}
        </Field>
        <Field label="Key benefits" hint="One per line. Describe capabilities, not guaranteed results." error={error?.fieldError("keyBenefits")}>
          {(p) => <Textarea {...p} rows={3} value={form.keyBenefits} onChange={set("keyBenefits")} />}
        </Field>
        <Field label="Restrictions" hint="Conditions the AI must mention or respect." error={error?.fieldError("restrictions")}>
          {(p) => <Textarea {...p} rows={2} value={form.restrictions} onChange={set("restrictions")} />}
        </Field>
        <Field label="Example offer (optional)" error={error?.fieldError("exampleOffer")}>
          {(p) => <Textarea {...p} rows={2} value={form.exampleOffer} onChange={set("exampleOffer")} />}
        </Field>
        <Field label="Call to action (optional)" error={error?.fieldError("cta")}>
          {(p) => <Input {...p} value={form.cta} onChange={set("cta")} />}
        </Field>
        <Field label="Portfolio link (optional)" error={error?.fieldError("portfolioUrl")}>
          {(p) => <Input {...p} value={form.portfolioUrl} onChange={set("portfolioUrl")} placeholder="https://" />}
        </Field>
      </form>
    </Dialog>
  );
}

export function ServicesPage() {
  const user = useCurrentUser();
  const editable = can(user.role, "knowledge:manage");
  const [status, setStatus] = useState<"all" | "active" | "inactive">("all");
  const services = useServices(status);
  const industries = useIndustries("all");
  const save = useSaveService();
  const toast = useToast();
  const [confirmEl, confirm] = useConfirm();
  const [editing, setEditing] = useState<ServiceDto | "new" | null>(null);

  const industryNames = useMemo(() => new Map((industries.data?.data ?? []).map((i: IndustryDto) => [i.id, i.name])), [industries.data]);
  const categories = useMemo(() => [...new Set((services.data?.data ?? []).map((s) => s.category))].sort(), [services.data]);

  async function toggle(s: ServiceDto) {
    if (s.isActive) {
      const ok = await confirm({
        title: `Disable ${s.name}?`,
        body: "It stays in the records but won't be offered for new campaigns or recommended by the AI. You can enable it again any time.",
        confirmLabel: "Disable service",
        tone: "danger",
      });
      if (!ok) return;
    }
    save.mutate(
      { id: s.id, input: { isActive: !s.isActive } },
      {
        onSuccess: () => toast(s.isActive ? `Disabled ${s.name}.` : `Enabled ${s.name}.`),
        onError: (e) => toast(e instanceof ApiError ? e.message : "Couldn't save.", "error"),
      },
    );
  }

  return (
    <>
      {confirmEl}
      <PageHeader
        title="Services"
        description={
          editable
            ? "What ProSolution offers. The AI will only recommend active services from this list. No prices are stored."
            : "What ProSolution offers. Read-only: ask an admin to change services."
        }
        actions={
          editable && (
            <Button variant="primary" onClick={() => setEditing("new")}>
              Add service
            </Button>
          )
        }
      />
      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} className="w-auto">
            <option value="all">Active and disabled</option>
            <option value="active">Active only</option>
            <option value="inactive">Disabled only</option>
          </Select>
        </div>
        {services.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : services.isError ? (
          <ErrorState error={services.error} onRetry={() => services.refetch()} />
        ) : services.data.data.length === 0 ? (
          status === "all" ? (
            <EmptyState
              title="No services yet"
              action={editable && <Button onClick={() => setEditing("new")}>Add service</Button>}
            >
              Run <span className="font-mono">pnpm db:seed</span> to load ProSolution's 11 services, or add them here.
            </EmptyState>
          ) : (
            <EmptyState title="No services match this filter" />
          )
        ) : (
          <ul className="divide-y divide-line">
            {services.data.data.map((s) => (
              <li key={s.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 max-w-[75ch]">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-sans text-[15px] font-semibold">{s.name}</h3>
                    <Badge tone="neutral">{s.category}</Badge>
                    {!s.isActive && <Badge tone="warn">Disabled</Badge>}
                  </div>
                  <p className="mt-1 text-[14px] text-ink-soft">{s.description}</p>
                  {s.industryIds.length > 0 && (
                    <p className="mt-1.5 text-[13px] text-ink-faint">
                      Suggested for: {s.industryIds.map((id) => industryNames.get(id)).filter(Boolean).join(", ")}
                    </p>
                  )}
                  {s.restrictions && <p className="mt-1 text-[13px] text-warn">{s.restrictions}</p>}
                </div>
                {editable && (
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" onClick={() => setEditing(s)} aria-label={`Edit ${s.name}`}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => toggle(s)}>
                      {s.isActive ? "Disable" : "Enable"}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>
      {editing && <ServiceDialog service={editing === "new" ? null : editing} categories={categories} onClose={() => setEditing(null)} />}
    </>
  );
}
