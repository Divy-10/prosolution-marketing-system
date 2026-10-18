import * as RadixDialog from "@radix-ui/react-dialog";
import { useState, type ReactNode } from "react";
import { Button, cx } from "./primitives.tsx";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: "sm" | "md";
}

export function Dialog({ open, onOpenChange, title, description, children, footer, width = "md" }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-ink/40" />
        <RadixDialog.Content
          className={cx(
            "fixed left-1/2 top-[8vh] z-50 max-h-[84vh] w-[calc(100vw-32px)] -translate-x-1/2 overflow-y-auto rounded-[var(--radius-panel)] border border-line bg-surface shadow-[0_24px_60px_-20px_rgba(22,20,51,0.35)] focus:outline-none",
            width === "sm" ? "max-w-[420px]" : "max-w-[560px]",
          )}
        >
          <div className="px-6 pb-2 pt-5">
            <RadixDialog.Title className="font-display text-xl font-semibold">{title}</RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="mt-1 text-ink-soft">{description}</RadixDialog.Description>
            ) : (
              <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
            )}
          </div>
          <div className="px-6 py-3">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line px-6 py-4">{footer}</div>}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

interface ConfirmOptions {
  title: string;
  body: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
}

/** Confirmation dialog for consequential actions. Returns [element, ask]. */
export function useConfirm(): [ReactNode, (opts: ConfirmOptions) => Promise<boolean>] {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const close = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
  };
  const element = state ? (
    <Dialog
      open
      onOpenChange={(o) => !o && close(false)}
      title={state.title}
      width="sm"
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            Cancel
          </Button>
          <Button variant={state.tone ?? "primary"} onClick={() => close(true)} autoFocus>
            {state.confirmLabel}
          </Button>
        </>
      }
    >
      <div className="text-ink-soft">{state.body}</div>
    </Dialog>
  ) : null;
  const ask = (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setState({ ...opts, resolve }));
  return [element, ask];
}
