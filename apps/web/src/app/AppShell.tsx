import { useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router";
import * as RadixDialog from "@radix-ui/react-dialog";
import { ROLE_LABELS } from "@prosolution/shared";
import { useCurrentUser, useLogout, useSession } from "../features/auth/session.tsx";
import { Badge, cx } from "../components/ui/primitives.tsx";
import { visibleNav } from "./navigation.ts";

function Brand() {
  return (
    <div className="flex items-center gap-2.5 px-5 pb-5 pt-5">
      <img src="/logo-mark.png" alt="" width={36} height={36} className="size-9" />
      <div className="leading-tight">
        <div className="font-display text-[17px] font-semibold tracking-tight">ProSolution</div>
        <div className="text-[12px] text-ink-faint">Outreach</div>
      </div>
    </div>
  );
}

function NavContent({ onNavigate }: { onNavigate?: () => void }) {
  const user = useCurrentUser();
  return (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-6">
      {visibleNav(user.role).map((group) => (
        <div key={group.label} className="mt-4 first:mt-0">
          <div className="px-2 pb-1 text-[12px] font-medium text-ink-faint">{group.label}</div>
          <ul className="space-y-0.5">
            {group.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={item.path}
                  end={item.path === "/"}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    cx(
                      "group relative flex items-center justify-between gap-2 rounded-[var(--radius-control)] px-2.5 py-1.5 text-[14px] transition-colors",
                      isActive ? "bg-human-soft font-medium text-human-deep" : "text-ink-soft hover:bg-ink/[0.04] hover:text-ink",
                      item.phase !== undefined && !isActive && "text-ink-faint",
                    )
                  }
                >
                  <span>{item.label}</span>
                  {item.phase !== undefined && (
                    <span className="text-[11px] font-normal text-ink-faint tabular" title={`Arrives in phase ${item.phase}`}>
                      Phase {item.phase}
                    </span>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function UserBlock() {
  const user = useCurrentUser();
  const logout = useLogout();
  return (
    <div className="border-t border-line px-4 py-3">
      <NavLink to="/account" className="block rounded-[var(--radius-control)] px-1 py-1 hover:bg-ink/[0.04]">
        <div className="truncate text-sm font-medium">{user.name}</div>
        <div className="truncate text-[12px] text-ink-faint">{ROLE_LABELS[user.role]}</div>
      </NavLink>
      <button
        type="button"
        onClick={() => logout.mutate(false)}
        className="mt-1 px-1 text-[13px] text-ink-soft hover:text-ink"
      >
        Sign out
      </button>
    </div>
  );
}

export function AppShell() {
  const { session } = useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[248px_1fr]">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-surface lg:flex">
        <Brand />
        <NavContent />
        <UserBlock />
      </aside>

      {/* Mobile top bar + drawer */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-surface px-4 py-2 lg:hidden">
        <div className="flex items-center gap-2">
          <img src="/logo-mark.png" alt="" className="size-8" />
          <span className="font-display font-semibold">ProSolution</span>
        </div>
        <RadixDialog.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <RadixDialog.Trigger className="rounded-[var(--radius-control)] border border-line-strong px-3 py-1.5 text-sm">
            Menu
          </RadixDialog.Trigger>
          <RadixDialog.Portal>
            <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
            <RadixDialog.Content className="fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-surface focus:outline-none">
              <RadixDialog.Title className="sr-only">Navigation</RadixDialog.Title>
              <RadixDialog.Description className="sr-only">Main navigation</RadixDialog.Description>
              <Brand />
              <NavContent onNavigate={() => setMenuOpen(false)} />
              <UserBlock />
            </RadixDialog.Content>
          </RadixDialog.Portal>
        </RadixDialog.Root>
      </header>

      <div className="min-w-0">
        <div className="flex items-center justify-end gap-3 px-4 pt-4 sm:px-8">
          {session?.config.humanApprovalRequired ? (
            <Badge tone="human" className="text-[12px]">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-human" />
              Human approval on
            </Badge>
          ) : (
            <Badge tone="warn">Human approval off</Badge>
          )}
          {session?.config.environment !== "production" && <Badge tone="neutral">Local development</Badge>}
        </div>
        <main id="main" key={location.pathname} className="mx-auto max-w-[1200px] px-4 pb-16 pt-4 sm:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
