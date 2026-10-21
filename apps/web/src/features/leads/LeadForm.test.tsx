import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import type { DuplicateCheckDto, DuplicateMatchDto } from "@prosolution/shared";
import { DuplicatePanel, type DuplicateDecision } from "./LeadForm.tsx";

const match = (kind: DuplicateMatchDto["kind"], matchedOn: DuplicateMatchDto["matchedOn"] = []): DuplicateMatchDto => ({
  kind,
  lead: { id: "l1", displayId: 12, businessName: "Brew Lab Cafe", areaName: "Vesu", reviewStatus: "PENDING", contactStatus: "NOT_CONTACTED", doNotContact: false },
  matchedOn,
});
const none: DuplicateCheckDto = { exact: [], shared: [], possible: [] };
const decision: DuplicateDecision = { confirmDifferentBusiness: false, approveSharedIdentifiers: false, sharedIdentifierReason: "" };

function renderPanel(dupes: DuplicateCheckDto, isAdmin: boolean, onDecision = vi.fn()) {
  render(
    <MemoryRouter>
      <DuplicatePanel dupes={dupes} isAdmin={isAdmin} decision={decision} onDecision={onDecision} />
    </MemoryRouter>,
  );
  return onDecision;
}

describe("duplicate warnings in the lead form", () => {
  it("shows nothing when there are no matches", () => {
    const { container } = render(<DuplicatePanel dupes={none} isAdmin decision={decision} onDecision={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("explains an exact duplicate and links to the existing lead, with no override", () => {
    renderPanel({ ...none, exact: [match("EXACT", ["PHONE"])] }, true);
    expect(screen.getByRole("alert")).toHaveTextContent("This business is already in the system.");
    expect(screen.getByRole("link", { name: /LD-000012 Brew Lab Cafe/ })).toHaveAttribute("href", "/leads/l1");
    expect(screen.getByText(/same phone/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("tells non-admins that only an admin can add a branch with shared details", () => {
    renderPanel({ ...none, shared: [match("SHARED_IDENTIFIER", ["PHONE"])] }, false);
    expect(screen.getByText(/Only an admin can add a separate branch/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });

  it("lets an admin approve a separate branch", async () => {
    const onDecision = renderPanel({ ...none, shared: [match("SHARED_IDENTIFIER", ["PHONE"])] }, true);
    await userEvent.click(screen.getByRole("checkbox", { name: /separate branch/ }));
    expect(onDecision).toHaveBeenCalledWith({ ...decision, approveSharedIdentifiers: true });
  });

  it("asks for confirmation when only the name matches in the same area", async () => {
    const onDecision = renderPanel({ ...none, possible: [match("POSSIBLE")] }, false);
    expect(screen.getByText("A lead with the same name exists in this area.")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("checkbox", { name: /different business/ }));
    expect(onDecision).toHaveBeenCalledWith({ ...decision, confirmDifferentBusiness: true });
  });
});
