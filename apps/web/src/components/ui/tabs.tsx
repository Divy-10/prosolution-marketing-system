import { cx } from "./primitives.tsx";

export interface TabItem<T extends string> {
  value: T;
  label: string;
  count?: number;
}

/** Simple accessible tab row (buttons with aria-pressed); content is rendered by the caller. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  label,
}: {
  items: TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-line px-2">
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.value)}
            className={cx(
              "-mb-px flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-[14px] transition-colors",
              active ? "border-human font-medium text-human-deep" : "border-transparent text-ink-soft hover:text-ink",
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className={cx("rounded-full px-1.5 text-[12px] tabular", active ? "bg-human-soft" : "bg-ink/[0.06]")}>{item.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
