import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { can, type LeadView } from "@prosolution/shared";
import { formatRelative, leadNumber } from "../lib/format.ts";
import { useCurrentUser } from "../features/auth/session.tsx";
import { useAreas, useIndustries } from "../features/config/api.ts";
import { useAssignees, useLeads, type LeadFilters } from "../features/leads/api.ts";
import { LeadForm } from "../features/leads/LeadForm.tsx";
import { LeadBadges } from "../features/leads/LeadBadges.tsx";
import { Button, Input, PageHeader, Panel, Select, Skeleton } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState, Pagination } from "../components/ui/states.tsx";
import { Dialog } from "../components/ui/dialog.tsx";
import { Tabs } from "../components/ui/tabs.tsx";
import { useToast } from "../components/ui/toast.tsx";

const VIEW_HELP: Record<LeadView, string> = {
  candidates: "Businesses added but not yet reviewed. Check the details, then approve or reject.",
  approved: "Reviewed and approved, not contacted yet.",
  contacted: "Businesses that have been contacted. These are always kept.",
  rejected: "Reviewed and rejected. They can be reopened.",
  all: "Every lead you can see.",
};

export function LeadsPage() {
  const user = useCurrentUser();
  const canManage = can(user.role, "leads:manage");
  const navigate = useNavigate();
  const toast = useToast();
  const [filters, setFilters] = useState<LeadFilters>({ view: "candidates", q: "", industryId: "", areaId: "", assignedToId: "", page: 1 });
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const leads = useLeads(filters);
  const industries = useIndustries("all");
  const areas = useAreas("all");
  const assignees = useAssignees(canManage);

  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  const counts = leads.data?.counts;
  const filtered = Boolean(filters.q || filters.industryId || filters.areaId || filters.assignedToId);

  return (
    <>
      <PageHeader
        title="Leads"
        description={
          user.role === "SALES_USER"
            ? "Leads assigned to you."
            : "Businesses ProSolution may contact. Add candidates from public information, review them, then they move to Approved."
        }
        actions={
          canManage && (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Add lead
            </Button>
          )
        }
      />
      <Panel>
        <Tabs<LeadView>
          label="Lead status"
          value={filters.view}
          onChange={(view) => setFilters({ ...filters, view, page: 1 })}
          items={[
            { value: "candidates", label: "Candidates", ...(counts ? { count: counts.candidates } : {}) },
            { value: "approved", label: "Approved", ...(counts ? { count: counts.approved } : {}) },
            { value: "contacted", label: "Contacted", ...(counts ? { count: counts.contacted } : {}) },
            { value: "rejected", label: "Rejected", ...(counts ? { count: counts.rejected } : {}) },
            { value: "all", label: "All" },
          ]}
        />
        <p className="px-5 pt-3 text-[13px] text-ink-soft">{VIEW_HELP[filters.view]}</p>
        <div className="flex flex-wrap gap-3 p-4">
          <Input
            type="search"
            aria-label="Search leads"
            placeholder="Name, LD number, phone, @handle"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[280px]"
          />
          <Select aria-label="Filter by industry" value={filters.industryId} onChange={(e) => setFilters({ ...filters, industryId: e.target.value, page: 1 })} className="w-auto">
            <option value="">All industries</option>
            {(industries.data?.data ?? []).map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </Select>
          <Select aria-label="Filter by area" value={filters.areaId} onChange={(e) => setFilters({ ...filters, areaId: e.target.value, page: 1 })} className="w-auto">
            <option value="">All areas</option>
            {(areas.data?.data ?? []).map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
          {canManage && (
            <Select aria-label="Filter by owner" value={filters.assignedToId} onChange={(e) => setFilters({ ...filters, assignedToId: e.target.value, page: 1 })} className="w-auto">
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {(assignees.data?.data ?? []).map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </Select>
          )}
        </div>

        {leads.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : leads.isError ? (
          <ErrorState error={leads.error} onRetry={() => leads.refetch()} />
        ) : leads.data.total === 0 ? (
          filtered ? (
            <EmptyState title="No leads match these filters">Clear the search or change the filters.</EmptyState>
          ) : filters.view === "candidates" ? (
            <EmptyState
              title="No candidates waiting for review"
              action={canManage && <Button onClick={() => setAdding(true)}>Add lead</Button>}
            >
              {canManage
                ? "Add a business you found through public information. It starts here as a candidate."
                : "New candidates will appear here once a manager adds them."}
            </EmptyState>
          ) : (
            <EmptyState title="Nothing here yet" />
          )
        ) : (
          <>
            <div className="overflow-x-auto border-t border-line">
              <table className="w-full min-w-[760px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-faint">
                    <th scope="col" className="px-4 py-2.5 font-medium">Business</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Industry</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Area</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Owner</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Added</th>
                  </tr>
                </thead>
                <tbody className={leads.isPlaceholderData ? "opacity-60" : undefined}>
                  {leads.data.data.map((l) => (
                    <tr key={l.id} className="border-b border-line last:border-b-0 hover:bg-paper/60">
                      <td className="px-4 py-3">
                        <Link to={`/leads/${l.id}`} className="font-medium text-ink hover:text-human hover:underline">
                          {l.businessName}
                        </Link>
                        <div className="font-mono text-[12px] text-ink-faint">{leadNumber(l.displayId)}</div>
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{l.industry?.name ?? "—"}</td>
                      <td className="px-4 py-3 text-ink-soft">{l.area?.name ?? "—"}</td>
                      <td className="px-4 py-3">
                        <LeadBadges lead={l} />
                      </td>
                      <td className="px-4 py-3 text-ink-soft">{l.assignedTo?.name ?? "Unassigned"}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-soft">{formatRelative(l.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={leads.data.page} pageSize={leads.data.pageSize} total={leads.data.total} onPage={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </Panel>

      {adding && (
        <Dialog open onOpenChange={(o) => !o && setAdding(false)} title="Add a lead" description="It starts as a candidate until someone reviews it.">
          <LeadForm
            isAdmin={user.role === "ADMIN"}
            onCancel={() => setAdding(false)}
            onSaved={(lead) => {
              setAdding(false);
              toast(`Added ${lead.businessName} as a candidate.`);
              navigate(`/leads/${lead.id}`);
            }}
          />
        </Dialog>
      )}
    </>
  );
}
