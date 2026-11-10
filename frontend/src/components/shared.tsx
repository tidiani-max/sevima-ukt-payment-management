import { cloneElement, useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from "react";
import { Icon, type IconName } from "./ui";
import { statusLabel } from "../lib/format";
import { dueLabel, dueState } from "../lib/invoices";
import type { PageInfo } from "../lib/table";
import type { Invoice, PaymentStatus } from "../types";

// ---------- Status ----------
export type Tone = "green" | "orange" | "red" | "slate";
const TONE_CLASS: Record<Tone, string> = { green: "status-paid", orange: "status-unpaid", red: "status-expired", slate: "status-neutral" };

export const Pill = ({ tone, icon, children }: { tone: Tone; icon?: IconName; children: ReactNode }) => (
  <span className={`status ${TONE_CLASS[tone]}`}>{icon && <Icon name={icon} size={12} className="mr-1 shrink-0" />}{children}</span>
);

const STATUS_STYLE: Record<PaymentStatus, { tone: Tone; icon: IconName }> = {
  PAID: { tone: "green", icon: "centang" },
  UNPAID: { tone: "orange", icon: "clock" },
  EXPIRED: { tone: "red", icon: "tutup" },
};
/** Colour + icon + text label, so status never relies on colour alone. */
export const Badge = ({ status }: { status: PaymentStatus }) => (
  <Pill tone={STATUS_STYLE[status].tone} icon={STATUS_STYLE[status].icon}>{statusLabel(status)}</Pill>
);

/** Shows how close an UNPAID invoice is to its expiration date (renders nothing for other statuses). */
export function DueHint({ invoice }: { invoice: Pick<Invoice, "status" | "expiresAt"> }) {
  const d = dueState(invoice);
  if (!d) return null;
  return (
    <span className={`mt-1 flex items-center gap-1 text-xs font-medium ${d.kind === "overdue" ? "text-red-700" : "text-orange-700"}`}>
      <Icon name="clock" size={12} className="shrink-0" />{dueLabel(d)}
    </span>
  );
}

// ---------- Layout ----------
export const Card = ({ children, className = "" }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-slate-200/80 bg-white shadow-[0_3px_12px_rgba(29,45,74,.03)] ${className}`}>{children}</section>
);

export const PageHeader = ({ eyebrow, title, text, action }: { eyebrow: string; title: string; text: string; action?: ReactNode }) => (
  <div className="mb-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
    <div className="min-w-0">
      <p className="text-sm font-semibold text-[#0f4ed8]">{eyebrow}</p>
      <h1 className="mt-1 break-words text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      <p className="mt-1.5 max-w-3xl text-sm text-slate-600">{text}</p>
    </div>
    {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
  </div>
);

export const SectionTitle = ({ children, action }: { children: ReactNode; action?: ReactNode }) => (
  <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
    <h2 className="text-base font-bold text-slate-900">{children}</h2>{action}
  </div>
);

export const Btn = ({ primary, className = "", type = "button", ...p }: ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) => (
  <button
    {...p}
    type={type}
    className={`inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-10 ${
      primary ? "bg-[#165DFF] text-white shadow-[0_7px_18px_rgba(22,93,255,.22)] hover:bg-[#0f4ed8]" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
    } ${className}`}
  />
);

// ---------- Feedback states ----------
export const Spinner = ({ size = 18 }: { size?: number }) => (
  <svg className="animate-spin" width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity=".25" strokeWidth="3" />
    <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

export const Loading = ({ label = "Memuat…" }: { label?: string }) => (
  <div role="status" className="flex items-center justify-center gap-3 p-10 text-sm text-slate-600"><Spinner />{label}</div>
);

export const Skeleton = ({ className = "" }: { className?: string }) => <div aria-hidden="true" className={`animate-pulse rounded-lg bg-slate-200/80 ${className}`} />;

/** Placeholder rows shown while a table's data loads. */
export const TableSkeleton = ({ rows = 5, label = "Memuat…" }: { rows?: number; label?: string }) => (
  <div role="status" aria-busy="true" className="space-y-3 p-5 sm:p-6">
    <span className="sr-only">{label}</span>
    {Array.from({ length: rows }, (_, i) => <Skeleton key={i} className="h-10 w-full" />)}
  </div>
);

export const ErrorBox = ({ message, retry, title = "Data tidak dapat dimuat" }: { message: string; retry?: () => void; title?: string }) => (
  <div role="alert" className="m-5 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900 sm:flex-row sm:items-center">
    <Icon name="peringatan" size={20} className="shrink-0 text-red-700" />
    <div className="flex-1"><p className="font-semibold">{title}</p><p className="mt-0.5 text-red-800">{message}</p></div>
    {retry && <Btn onClick={retry}>Coba lagi</Btn>}
  </div>
);

export const Empty = ({ title, text, action }: { title: string; text: string; action?: ReactNode }) => (
  <div className="px-6 py-12 text-center">
    <p className="font-semibold text-slate-700">{title}</p>
    <p className="mx-auto mt-1 max-w-md text-sm text-slate-600">{text}</p>
    {action && <div className="mt-4 flex justify-center">{action}</div>}
  </div>
);

const NOTICE: Record<"info" | "success" | "warning" | "danger", { cls: string; icon: IconName }> = {
  info: { cls: "border-blue-200 bg-blue-50 text-blue-950", icon: "info" },
  success: { cls: "border-emerald-200 bg-emerald-50 text-emerald-950", icon: "centang" },
  warning: { cls: "border-orange-300 bg-orange-50 text-orange-950", icon: "clock" },
  danger: { cls: "border-red-200 bg-red-50 text-red-950", icon: "peringatan" },
};
export function Notice({ tone = "info", title, children, className = "" }: { tone?: keyof typeof NOTICE; title?: string; children: ReactNode; className?: string }) {
  return (
    <div className={`flex gap-3 rounded-xl border p-4 text-sm ${NOTICE[tone].cls} ${className}`}>
      <Icon name={NOTICE[tone].icon} size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{title && <p className="font-semibold">{title}</p>}<div className={title ? "mt-0.5" : ""}>{children}</div></div>
    </div>
  );
}

// ---------- Dialogs ----------
const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Accessible modal: role=dialog, labelled by its title, Escape closes, focus moves in and is trapped,
 * page scroll is locked, and focus returns to the opener on close.
 */
export function Modal({ title, subtitle, onClose, children, footer, variant = "center", closeDisabled = false }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; variant?: "center" | "drawer"; closeDisabled?: boolean;
}) {
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const latest = useRef({ onClose, closeDisabled });
  useEffect(() => { latest.current = { onClose, closeDisabled }; });

  useEffect(() => {
    const el = panel.current!;
    const opener = document.activeElement as HTMLElement | null;
    const items = () => Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? items()[0] ?? el).focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { if (!latest.current.closeDisabled) latest.current.onClose(); return; }
      if (e.key !== "Tab") return;
      const list = items();
      if (!list.length) { e.preventDefault(); return; }
      const first = list[0], last = list[list.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && (document.activeElement === last || !el.contains(document.activeElement))) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = overflow; opener?.focus?.(); };
  }, []);

  const drawer = variant === "drawer";
  return (
    <div
      className={`fixed inset-0 z-50 flex bg-slate-950/40 backdrop-blur-sm ${drawer ? "justify-end" : "items-end justify-center sm:items-center sm:p-4"}`}
      onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose(); }}
    >
      <div
        ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1}
        className={`flex w-full flex-col bg-white shadow-2xl outline-none ${drawer ? "h-full max-w-xl" : "max-h-[100dvh] max-w-lg overflow-hidden rounded-t-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl"}`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 id={titleId} className="break-words text-lg font-bold text-slate-900">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-slate-600">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} disabled={closeDisabled} aria-label="Tutup dialog"
            className="-mr-2 -mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            <Icon name="tutup" size={19} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
      </div>
    </div>
  );
}
export const Drawer = (p: { title: string; subtitle?: string; onClose: () => void; children: ReactNode }) => <Modal variant="drawer" {...p} />;

// ---------- Forms ----------
type ControlProps = { id?: string; "aria-invalid"?: boolean; "aria-describedby"?: string; "aria-required"?: boolean };
/** Label + control + error/hint, wired together with htmlFor, aria-invalid and aria-describedby. */
export function Field({ label, error, hint, required, children }: { label: string; error?: string; hint?: ReactNode; required?: boolean; children: ReactElement<ControlProps> }) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold text-slate-700">
        {label}{required && <span aria-hidden="true" className="text-red-700"> *</span>}
      </label>
      {cloneElement(children, { id, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy, "aria-required": required || undefined })}
      {error ? <p id={`${id}-error`} className="mt-1.5 flex items-start gap-1 text-xs font-medium text-red-700"><Icon name="peringatan" size={13} className="mt-px shrink-0" />{error}</p>
        : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-600">{hint}</p> : null}
    </div>
  );
}
export const inputCls = (err?: string) =>
  `h-11 w-full rounded-xl border bg-white px-3 text-sm text-slate-900 outline-none placeholder:text-slate-500 focus:ring-3 disabled:bg-slate-50 disabled:text-slate-500 ${
    err ? "border-red-600 focus:border-red-600 focus:ring-red-100" : "border-slate-500 focus:border-[#165DFF] focus:ring-blue-100"
  }`;

export function SearchInput({ value, onChange, label, placeholder, className = "" }: { value: string; onChange: (v: string) => void; label: string; placeholder: string; className?: string }) {
  const id = useId();
  return (
    <div className={`relative ${className}`}>
      <label htmlFor={id} className="sr-only">{label}</label>
      <Icon name="cari" size={17} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
      <input id={id} type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} autoComplete="off"
        className="h-11 w-full rounded-xl border border-slate-500 bg-white pl-10 pr-10 text-sm outline-none placeholder:text-slate-500 focus:border-[#165DFF] focus:ring-3 focus:ring-blue-100 [&::-webkit-search-cancel-button]:appearance-none" />
      {value && (
        <button type="button" onClick={() => onChange("")} aria-label="Hapus pencarian"
          className="absolute right-1 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-lg text-slate-600 hover:bg-slate-100"><Icon name="tutup" size={15} /></button>
      )}
    </div>
  );
}

export function FilterChips<T extends string>({ label, options, value, onChange }: {
  label: string; options: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-10 rounded-lg px-3.5 text-sm font-semibold transition ${value === o.value ? "bg-[#165DFF] text-white" : "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50"}`}>
          {o.label}{o.count !== undefined && <span className={`ml-1.5 text-xs ${value === o.value ? "text-white" : "text-slate-600"}`}>({o.count})</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pages, total, from, to, onPage }: PageInfo & { onPage: (p: number) => void }) {
  if (!total) return null;
  return (
    <nav aria-label="Navigasi halaman" className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 px-5 py-4 sm:flex-row sm:px-6">
      <p className="text-sm text-slate-600" aria-live="polite">Menampilkan {from}–{to} dari {total}</p>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <Btn disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Halaman sebelumnya">Sebelumnya</Btn>
          <span className="px-1 text-sm text-slate-600">Halaman {page} dari {pages}</span>
          <Btn disabled={page >= pages} onClick={() => onPage(page + 1)} aria-label="Halaman berikutnya">Berikutnya</Btn>
        </div>
      )}
    </nav>
  );
}

/** Label / value pairs for detail views. */
export function DetailGrid({ items }: { items: [label: string, value: ReactNode][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0"><dt className="text-xs font-medium text-slate-600">{k}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-900">{v}</dd></div>
      ))}
    </dl>
  );
}
