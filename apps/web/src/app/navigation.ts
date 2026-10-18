import { can, type Permission, type Role } from "@prosolution/shared";

export interface NavItem {
  path: string;
  label: string;
  /** Hidden from roles without this permission. */
  permission?: Permission;
  /** Roadmap phase that delivers this screen. Undefined = available now. */
  phase?: number;
  /** One line shown on the placeholder page until the phase ships. */
  summary?: string;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV: NavGroup[] = [
  {
    label: "Daily work",
    items: [
      { path: "/", label: "Overview" },
      {
        path: "/approvals",
        label: "Approvals",
        permission: "approvals:decide",
        phase: 8,
        summary: "Review each AI-drafted message, edit it, then approve, skip or mark the business as do-not-contact.",
      },
      {
        path: "/send-queue",
        label: "Send queue",
        permission: "leads:work_assigned",
        phase: 8,
        summary: "Approved Instagram messages to send by hand: copy, open the profile, send, then mark as sent.",
      },
      {
        path: "/inbox",
        label: "Inbox",
        permission: "leads:work_assigned",
        phase: 7,
        summary: "Replies that arrive through the official Instagram API, classified by Claude, with suggested responses for you to send.",
      },
      {
        path: "/follow-ups",
        label: "Follow-ups",
        permission: "leads:work_assigned",
        phase: 10,
        summary: "Follow-ups that are due, drafted for approval, and only where the messaging rules allow them.",
      },
    ],
  },
  {
    label: "Pipeline",
    items: [
      {
        path: "/campaigns",
        label: "Campaigns",
        permission: "campaigns:read",
        phase: 3,
        summary: "Target an industry and area, e.g. cafes in Vesu and Adajan, with a daily lead target, tone and services.",
      },
      {
        path: "/leads",
        label: "Leads",
        permission: "leads:read",
        phase: 3,
        summary: "Every business in one place, with duplicate protection, status, owner and full history.",
      },
      {
        path: "/analytics",
        label: "Analytics",
        permission: "analytics:read",
        phase: 11,
        summary: "Observed results per campaign: researched, approved, sent, replies, interested, meetings.",
      },
    ],
  },
  {
    label: "Setup",
    items: [
      {
        path: "/services",
        label: "Services",
        permission: "knowledge:manage",
        phase: 3,
        summary: "ProSolution's service knowledge base: what Claude may recommend. Prices stay editable and need approval.",
      },
      {
        path: "/ai-settings",
        label: "AI configuration",
        permission: "prompts:manage",
        phase: 5,
        summary: "Versioned prompts, tone, language and restrictions, with a preview before anything goes live.",
      },
      {
        path: "/instagram",
        label: "Instagram connection",
        permission: "integrations:manage",
        phase: 7,
        summary: "Connect @_pro.solutions_ through Meta's official login. Shows granted permissions and token health.",
      },
      { path: "/users", label: "Users", permission: "users:manage" },
      { path: "/audit-log", label: "Audit log", permission: "audit:read" },
    ],
  },
];

export function visibleNav(role: Role): NavGroup[] {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.permission || can(role, i.permission)) })).filter(
    (g) => g.items.length > 0,
  );
}

export const PLANNED_ITEMS = NAV.flatMap((g) => g.items).filter((i) => i.phase !== undefined);
