import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { DeleteLeadsDialog } from "./DataRetentionPage.tsx";

describe("retention deletion confirmation", () => {
  it("keeps the delete button disabled until the exact phrase is typed", async () => {
    const onConfirm = vi.fn();
    render(<DeleteLeadsDialog count={3} pending={false} error={null} onConfirm={onConfirm} onClose={() => {}} />);
    const button = screen.getByRole("button", { name: "Delete permanently" });
    expect(button).toBeDisabled();
    const input = screen.getByLabelText("Type DELETE 3 LEADS to confirm");
    await userEvent.type(input, "delete 3 leads");
    expect(button).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, "DELETE 3 LEADS");
    expect(button).toBeEnabled();
    await userEvent.click(button);
    expect(onConfirm).toHaveBeenCalledWith("DELETE 3 LEADS");
  });

  it("uses the singular phrase for one lead", () => {
    render(<DeleteLeadsDialog count={1} pending={false} error={null} onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByLabelText("Type DELETE 1 LEAD to confirm")).toBeInTheDocument();
  });
});
