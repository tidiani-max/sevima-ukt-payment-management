import type { ReactNode } from "react";

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Keep the value on one line (dates, amounts). */
  nowrap?: boolean;
  /** Small screens: show beside the row title instead of in the detail grid (use for status). */
  mobileTop?: boolean;
  /** Small screens: span the full card width. */
  wide?: boolean;
  /** Row action buttons; rendered as the last item on small-screen cards. */
  isActions?: boolean;
}

const BREAKPOINT = {
  md: { table: "hidden md:block", cards: "md:hidden" },
  lg: { table: "hidden lg:block", cards: "lg:hidden" },
  xl: { table: "hidden xl:block", cards: "xl:hidden" },
  wide: { table: "hidden min-[1366px]:block", cards: "min-[1366px]:hidden" },
} as const;

/**
 * Responsive data table: a real <table> from the chosen breakpoint up, and a stacked card list below it,
 * so rows stay readable on phones without sideways scrolling. The first column is the row's title.
 * Row click is a pointer convenience only; keyboard users reach details through an actions column.
 */
export function DataTable<T>({ columns, rows, rowKey, label, onRowClick, cardsBelow = "md", empty }: {
  columns: Column<T>[]; rows: T[]; rowKey: (row: T) => string; label: string; onRowClick?: (row: T) => void; cardsBelow?: keyof typeof BREAKPOINT; empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  const bp = BREAKPOINT[cardsBelow];
  const [first, ...rest] = columns;
  const top = rest.filter((c) => c.mobileTop);
  const body = rest.filter((c) => !c.mobileTop && !c.isActions);
  const actions = rest.find((c) => c.isActions);
  const clickable = onRowClick ? "cursor-pointer hover:bg-blue-50/50" : "";

  return (
    <>
      <div className={`${bp.table} overflow-x-auto`}>
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{label}</caption>
          <thead>
            <tr className="bg-slate-50">
              {columns.map((c) => (
                <th key={c.key} scope="col" className="whitespace-nowrap px-3 py-3 text-xs font-semibold uppercase tracking-wide text-slate-600 first:pl-5 last:pr-5">{c.header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={rowKey(r)} onClick={onRowClick && (() => onRowClick(r))} className={`border-t border-slate-100 ${clickable}`}>
                {columns.map((c, i) => (
                  <td key={c.key} className={`px-3 py-3.5 align-middle text-slate-700 first:pl-5 last:pr-5 ${c.nowrap ? "whitespace-nowrap" : ""} ${i === 0 ? "font-semibold text-slate-900" : ""}`}>{c.cell(r)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul aria-label={label} className={`${bp.cards} divide-y divide-slate-100`}>
        {rows.map((r) => (
          <li key={rowKey(r)} onClick={onRowClick && (() => onRowClick(r))} className={`p-4 ${clickable}`}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 break-words font-semibold text-slate-900">{first.cell(r)}</div>
              {top.map((c) => <div key={c.key} className="shrink-0">{c.cell(r)}</div>)}
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
              {body.map((c) => (
                <div key={c.key} className={`min-w-0 ${c.wide ? "col-span-2" : ""}`}>
                  <dt className="text-xs font-medium text-slate-600">{c.header}</dt>
                  <dd className="mt-0.5 break-words text-slate-900">{c.cell(r)}</dd>
                </div>
              ))}
            </dl>
            {actions && <div className="mt-3 flex [&_button]:w-full">{actions.cell(r)}</div>}
          </li>
        ))}
      </ul>
    </>
  );
}
