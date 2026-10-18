import { Link } from "react-router";
import type { NavItem } from "../app/navigation.ts";
import { Panel, PageHeader } from "../components/ui/primitives.tsx";

/** Honest placeholder for a screen that a later roadmap phase delivers. */
export function ComingSoonPage({ item }: { item: NavItem }) {
  return (
    <>
      <PageHeader title={item.label} />
      <Panel className="max-w-[720px] p-6">
        <p className="text-[13px] font-medium text-ink-faint">Arrives in phase {item.phase}</p>
        <p className="mt-2 text-[17px] leading-relaxed text-ink">{item.summary}</p>
        <p className="mt-4 text-[14px] text-ink-soft">
          The full plan is in <span className="font-mono text-[13px]">docs/ARCHITECTURE.md</span>.{" "}
          <Link to="/" className="text-human hover:underline">
            Back to overview
          </Link>
        </p>
      </Panel>
    </>
  );
}

export function NotFoundPage() {
  return (
    <div className="py-10">
      <h1 className="text-2xl font-semibold">Page not found</h1>
      <p className="mt-2 text-ink-soft">
        Check the address, or{" "}
        <Link to="/" className="text-human hover:underline">
          go to the overview
        </Link>
        .
      </p>
    </div>
  );
}
