import { useEffect, useState } from "react";
import { ROLES, ROLE_LABELS, type Role, type UserDto } from "@prosolution/shared";
import { useCurrentUser } from "../features/auth/session.tsx";
import { useUsers, type UserFilters } from "../features/users/api.ts";
import { CreateUserDialog, ManageUserDialog } from "../features/users/UserDialogs.tsx";
import { Badge, Button, Input, PageHeader, Panel, Select, Skeleton } from "../components/ui/primitives.tsx";
import { EmptyState, ErrorState, Pagination } from "../components/ui/states.tsx";
import { formatDateTime, formatRelative } from "../lib/format.ts";

export function UsersPage() {
  const me = useCurrentUser();
  const [filters, setFilters] = useState<UserFilters>({ q: "", role: "", status: "all", page: 1 });
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [managing, setManaging] = useState<UserDto | null>(null);
  const users = useUsers(filters);

  // Debounce the search box so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setFilters((f) => (f.q === search ? f : { ...f, q: search, page: 1 })), 250);
    return () => window.clearTimeout(t);
  }, [search]);

  const filtered = filters.q || filters.role || filters.status !== "all";

  return (
    <>
      <PageHeader
        title="Users"
        description="Who can sign in, and what each person can do."
        actions={
          <Button variant="primary" onClick={() => setCreating(true)}>
            Add user
          </Button>
        }
      />

      <Panel>
        <div className="flex flex-wrap gap-3 border-b border-line p-4">
          <Input
            type="search"
            placeholder="Search name or email"
            aria-label="Search users"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-[280px]"
          />
          <Select
            aria-label="Filter by role"
            value={filters.role}
            onChange={(e) => setFilters({ ...filters, role: e.target.value as Role | "", page: 1 })}
            className="w-auto"
          >
            <option value="">All roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABELS[r]}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Filter by status"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value as UserFilters["status"], page: 1 })}
            className="w-auto"
          >
            <option value="all">Active and inactive</option>
            <option value="active">Active only</option>
            <option value="inactive">Inactive only</option>
          </Select>
        </div>

        {users.isPending ? (
          <div className="space-y-3 p-4" aria-busy="true">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : users.isError ? (
          <ErrorState error={users.error} onRetry={() => users.refetch()} />
        ) : users.data.total === 0 ? (
          filtered ? (
            <EmptyState title="No users match these filters">Clear the search or change the filters.</EmptyState>
          ) : (
            <EmptyState title="No users yet" action={<Button onClick={() => setCreating(true)}>Add user</Button>} />
          )
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-[14px]">
                <thead>
                  <tr className="border-b border-line text-[13px] text-ink-faint">
                    <th scope="col" className="px-4 py-2.5 font-medium">Person</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Role</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Status</th>
                    <th scope="col" className="px-4 py-2.5 font-medium">Last sign-in</th>
                    <th scope="col" className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody className={users.isPlaceholderData ? "opacity-60" : undefined}>
                  {users.data.data.map((u) => (
                    <tr key={u.id} className="border-b border-line last:border-b-0 hover:bg-paper/60">
                      <td className="px-4 py-3">
                        <div className="font-medium">
                          {u.name} {u.id === me.id && <span className="font-normal text-ink-faint">(you)</span>}
                        </div>
                        <div className="text-[13px] text-ink-soft">{u.email}</div>
                      </td>
                      <td className="px-4 py-3">{ROLE_LABELS[u.role]}</td>
                      <td className="px-4 py-3">
                        {!u.isActive ? (
                          <Badge tone="neutral">Inactive</Badge>
                        ) : u.mustChangePassword ? (
                          <Badge tone="warn">Awaiting first sign-in</Badge>
                        ) : (
                          <Badge tone="ok">Active</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-soft" title={u.lastLoginAt ? formatDateTime(u.lastLoginAt) : undefined}>
                        {u.lastLoginAt ? formatRelative(u.lastLoginAt) : "Never"}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" onClick={() => setManaging(u)} aria-label={`Manage ${u.name}`}>
                          Manage
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={users.data.page} pageSize={users.data.pageSize} total={users.data.total} onPage={(page) => setFilters({ ...filters, page })} />
          </>
        )}
      </Panel>

      <CreateUserDialog open={creating} onOpenChange={setCreating} />
      {managing && <ManageUserDialog user={managing} currentUserId={me.id} onClose={() => setManaging(null)} />}
    </>
  );
}
