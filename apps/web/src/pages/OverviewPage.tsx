import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { can, ROLE_LABELS } from "@prosolution/shared";
import { api } from "../lib/api.ts";
import { useCurrentUser, useSession } from "../features/auth/session.tsx";
import { Badge, Panel, cx } from "../components/ui/primitives.tsx";

type Actor = "person" | "system";

/** The outreach pipeline from the architecture. Who acts at each step is encoded in colour and text. */
const PIPELINE: { label: string; actor: Actor; phase: number; note: string }[] = [
  { label: "Campaign", actor: "person", phase: 3, note: "You choose industry, areas and services" },
  { label: "Add leads", actor: "person", phase: 2, note: "Manual entry now; CSV import in Phase 6" },
  { label: "Duplicate check", actor: "system", phase: 2, note: "Handle, website, phone, email" },
  { label: "Public research", actor: "system", phase: 6, note: "Own website and public profile only" },
  { label: "AI draft", actor: "system", phase: 5, note: "Claude, grounded in collected facts" },
  { label: "Quality check", actor: "system", phase: 5, note: "Rules plus a second Claude review" },
  { label: "Approval", actor: "person", phase: 8, note: "Edit, approve, skip or do-not-contact" },
  { label: "Send", actor: "person", phase: 8, note: "By hand on Instagram; API only for replies" },
  { label: "Reply sorting", actor: "system", phase: 10, note: "Opt-outs caught before AI runs" },
  { label: "Sales hand-off", actor: "person", phase: 10, note: "Hot leads go to a person; AI stops" },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 17 ? "Good afternoon" : "Good evening";
}

function PipelineTrack() {
  return (
    <Panel className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pb-1 pt-5">
        <h2 className="text-lg font-semibold">How a lead moves through ProSolution Outreach</h2>
        <div className="flex gap-3 text-[13px] text-ink-soft">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-full bg-human" aria-hidden="true" /> A person acts
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2 rounded-[2px] bg-system" aria-hidden="true" /> System or AI
          </span>
        </div>
      </div>
      <p className="px-5 text-[14px] text-ink-soft">
        Phases 1–2 set up sign-in, roles, the audit trail, your service profile and lead review. Each step lights up as its phase ships.
      </p>
      <ol className="mt-4 grid grid-cols-1 border-t border-line sm:grid-cols-2 lg:grid-cols-5">
        {PIPELINE.map((step, i) => (
          <li
            key={step.label}
            className={cx(
              "relative border-b border-line px-5 py-4 last:border-b-0 sm:max-lg:[&:nth-child(odd)]:border-r sm:max-lg:[&:nth-last-child(-n+2)]:border-b-0 lg:[&:not(:nth-child(5n))]:border-r",
              i >= 5 && "lg:border-b-0",
            )}
          >
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className={cx("size-2.5 shrink-0", step.actor === "person" ? "rounded-full bg-human" : "rounded-[3px] bg-system")}
              />
              <span className="font-display text-[13px] font-medium text-ink-faint tabular">{String(i + 1).padStart(2, "0")}</span>
              <span className="sr-only">{step.actor === "person" ? "Person:" : "System:"}</span>
            </div>
            <div className="mt-1.5 font-display text-[17px] font-semibold leading-tight">{step.label}</div>
            <p className="mt-1 text-[13px] leading-snug text-ink-soft">{step.note}</p>
            <div className="mt-2 text-[12px] text-ink-faint">Phase {step.phase}</div>
          </li>
        ))}
      </ol>
    </Panel>
  );
}

function StatusRow({ label, value, tone, children }: { label: string; value: string; tone: "ok" | "warn" | "neutral" | "human" | "danger"; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3 first:border-t-0">
      <div>
        <div className="text-[14px] font-medium">{label}</div>
        {children && <div className="text-[13px] text-ink-soft">{children}</div>}
      </div>
      <Badge tone={tone}>{value}</Badge>
    </div>
  );
}

export function OverviewPage() {
  const user = useCurrentUser();
  const { session } = useSession();
  const ready = useQuery({
    queryKey: ["health-ready"],
    queryFn: () => api.get<{ status: string; database: string }>("/health/ready"),
    retry: false,
  });

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-[28px] font-semibold leading-tight">
          {greeting()}, {user.name.split(" ")[0]}
        </h1>
        <p className="mt-1 text-ink-soft">
          Signed in as {ROLE_LABELS[user.role].toLowerCase()}. Leads are ready; campaigns arrive in Phase 3.
        </p>
      </div>

      <PipelineTrack />

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
        <Panel>
          <h2 className="px-5 pb-2 pt-5 text-lg font-semibold">Workspace status</h2>
          <div>
            <StatusRow
              label="Database"
              value={ready.isPending ? "Checking" : ready.isSuccess ? "Connected" : "Unreachable"}
              tone={ready.isPending ? "neutral" : ready.isSuccess ? "ok" : "danger"}
            />
            <StatusRow
              label="Human approval before sending"
              value={session?.config.humanApprovalRequired ? "Required" : "Off"}
              tone={session?.config.humanApprovalRequired ? "human" : "warn"}
            >
              No message leaves without a person approving it.
            </StatusRow>
            <StatusRow label="Claude AI" value="Not set up yet" tone="neutral">
              Connected in Phase 5.
            </StatusRow>
            <StatusRow label="Instagram (official Meta API)" value="Not connected" tone="neutral">
              Connected in Phase 7. First messages are sent by hand; the API handles replies.
            </StatusRow>
          </div>
        </Panel>

        <Panel className="p-5">
          <h2 className="text-lg font-semibold">What you can do now</h2>
          <ul className="mt-3 space-y-3 text-[14px]">
            <li>
              <Link to="/leads" className="font-medium text-human hover:underline">
                {can(user.role, "leads:manage") ? "Add and review leads" : "See leads"}
              </Link>
              <p className="text-ink-soft">Candidates found from public information wait for review before anyone contacts them.</p>
            </li>
            {can(user.role, "knowledge:manage") && (
              <li>
                <Link to="/services" className="font-medium text-human hover:underline">
                  Check services and target market
                </Link>
                <p className="text-ink-soft">The 11 services, 16 industries and Surat areas the rest of the app builds on.</p>
              </li>
            )}
            {can(user.role, "users:manage") && (
              <li>
                <Link to="/users" className="font-medium text-human hover:underline">
                  Add your team
                </Link>
                <p className="text-ink-soft">Create accounts with the right role. Each person sets their own password on first sign-in.</p>
              </li>
            )}
            {can(user.role, "audit:read") && (
              <li>
                <Link to="/audit-log" className="font-medium text-human hover:underline">
                  Review the audit log
                </Link>
                <p className="text-ink-soft">Every sign-in and change to users is recorded and can't be edited.</p>
              </li>
            )}
            <li>
              <Link to="/account" className="font-medium text-human hover:underline">
                Manage your account
              </Link>
              <p className="text-ink-soft">Change your password or sign out of other devices.</p>
            </li>
          </ul>
        </Panel>
      </div>
    </div>
  );
}
