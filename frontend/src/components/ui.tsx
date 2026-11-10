import { type ReactNode } from "react";

// Icon names are internal identifiers (never shown to users).
export type IconName =
  | "beranda" | "tagihan" | "pembayaran" | "mahasiswa" | "laporan" | "pengaturan" | "cari" | "menu" | "panah"
  | "dompet" | "peringatan" | "centang" | "unduh" | "tutup" | "clock" | "info" | "logout";

const paths: Record<IconName, ReactNode> = {
  beranda: (<><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5M9 21v-7h6v7" /></>),
  tagihan: (<><path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" /><path d="M9 8h6M9 12h6" /></>),
  pembayaran: (<><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18M7 15h3" /></>),
  mahasiswa: (<><path d="m3 9 9-5 9 5-9 5-9-5Z" /><path d="M7 12v4c3 2.2 7 2.2 10 0v-4M21 9v6" /></>),
  laporan: (<><path d="M5 20V10M12 20V4M19 20v-7" /><path d="M3 20h18" /></>),
  pengaturan: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3v-.2h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  cari: (<><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  panah: <path d="m9 18 6-6-6-6" />,
  dompet: (<><path d="M4 6h14a2 2 0 0 1 2 2v11H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h12v3" /><path d="M15 11h5v4h-5a2 2 0 0 1 0-4Z" /></>),
  peringatan: (<><path d="M10.3 3.7 2.5 18a2 2 0 0 0 1.8 3h15.4a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z" /><path d="M12 9v4M12 17h.01" /></>),
  centang: <path d="m5 12 4 4L19 6" />,
  unduh: (<><path d="M12 3v12m0 0 4-4m-4 4-4-4" /><path d="M5 21h14" /></>),
  tutup: <path d="m6 6 12 12M18 6 6 18" />,
  clock: (<><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>),
  info: (<><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></>),
  logout: (<><path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" /><path d="m16 8 4 4-4 4M20 12H9" /></>),
};

export function Icon({ name, size = 20, className = "" }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  );
}

const TONES = {
  blue: "bg-blue-50 text-[#165DFF]",
  green: "bg-emerald-50 text-emerald-700",
  orange: "bg-orange-50 text-orange-700",
  red: "bg-red-50 text-red-700",
};

/** Summary figure. `detail` gives context for the number (never decoration). */
export function StatCard({ title, value, detail, icon, color }: {
  title: string; value: string; detail: string; icon: IconName; color: keyof typeof TONES;
}) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_3px_12px_rgba(29,45,74,.03)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-600">{title}</p>
          <p className="mt-2 break-words text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONES[color]}`}><Icon name={icon} size={20} /></span>
      </div>
      <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-600">{detail}</p>
    </article>
  );
}
