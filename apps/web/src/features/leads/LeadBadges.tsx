import type { LeadListItemDto } from "@prosolution/shared";
import { Badge } from "../../components/ui/primitives.tsx";

/** Status pills for a lead. Text always carries the meaning; colour only supports it. */
export function LeadBadges({ lead }: { lead: LeadListItemDto }) {
  return (
    <span className="inline-flex flex-wrap gap-1.5">
      {lead.contactStatus === "CONTACTED" ? (
        <Badge tone="ok">Contacted</Badge>
      ) : lead.reviewStatus === "APPROVED" ? (
        <Badge tone="human">Approved</Badge>
      ) : lead.reviewStatus === "REJECTED" ? (
        <Badge tone="neutral">Rejected</Badge>
      ) : (
        <Badge tone="system">Candidate</Badge>
      )}
      {lead.doNotContact && <Badge tone="danger">Do not contact</Badge>}
      {lead.detailsVerified && <Badge tone="ok">Details verified</Badge>}
      {lead.hasSharedIdentifiers && <Badge tone="warn">Shared contact details</Badge>}
    </span>
  );
}
