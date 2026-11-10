import { useCallback, useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "./components/ui";
import { useMediaQuery } from "./lib/useMediaQuery";
import { InvoicesPage } from "./pages/Invoices";
import { LoginScreen } from "./pages/Login";
import { Overview } from "./pages/Overview";
import { StudentDashboard } from "./pages/StudentDashboard";
import { StudentsPage } from "./pages/Students";
import { Transactions } from "./pages/Transactions";
import { GatewaySimulator, WebhookMonitor } from "./pages/Webhooks";
import { UNAUTHORIZED_EVENT } from "./services/api";
import { getSession, logout } from "./services/auth.service";
import { getConfig } from "./services/config.service";
import type { Session } from "./types";

export type PageKey = "overview" | "invoices" | "students" | "transactions" | "webhooks" | "simulator" | "dashboard" | "my-invoices" | "my-transactions";
type Nav = { key: PageKey; label: string; icon: IconName };

// Every item here leads to a working page (placeholder pages for Reports / Settings / Help were removed).
const adminMain: Nav[] = [
  { key: "overview", label: "Ringkasan", icon: "beranda" },
  { key: "invoices", label: "Tagihan UKT", icon: "tagihan" },
  { key: "students", label: "Mahasiswa", icon: "mahasiswa" },
  { key: "transactions", label: "Riwayat Transaksi", icon: "pembayaran" },
];
const adminGateway: Nav[] = [
  { key: "webhooks", label: "Pemantauan Webhook", icon: "laporan" },
  { key: "simulator", label: "Simulator Gateway", icon: "pengaturan" },
];
const studentNav: Nav[] = [
  { key: "dashboard", label: "Dasbor", icon: "beranda" },
  { key: "my-invoices", label: "Tagihan Saya", icon: "tagihan" },
  { key: "my-transactions", label: "Riwayat Transaksi", icon: "pembayaran" },
];
const TITLES: Record<PageKey, string> = {
  overview: "Ringkasan", invoices: "Tagihan UKT", students: "Mahasiswa", transactions: "Riwayat Transaksi", webhooks: "Pemantauan Webhook",
  simulator: "Simulator Gateway", dashboard: "Dasbor", "my-invoices": "Tagihan Saya", "my-transactions": "Riwayat Transaksi",
};

const GroupLabel = ({ children, first }: { children: string; first?: boolean }) => (
  <p className={`mb-2 px-3 text-xs font-bold uppercase tracking-[.1em] text-slate-600 ${first ? "" : "mt-7"}`}>{children}</p>
);

type Toast = { id: number; message: string; kind: "success" | "error" };

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [booting, setBooting] = useState(true); // true until the session-restore request has answered
  const [loginNotice, setLoginNotice] = useState("");
  const [simulatorEnabled, setSimulatorEnabled] = useState(false);
  const [role, setRole] = useState<"admin" | "mahasiswa">("admin");
  const [active, setActive] = useState<PageKey>("overview");
  const [menuOpen, setMenuOpen] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const menuButton = useRef<HTMLButtonElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const isDesktop = useMediaQuery("(min-width: 1024px)");

  const notify = useCallback((message: string, kind: "success" | "error" = "success") => {
    window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), message, kind });
    toastTimer.current = window.setTimeout(() => setToast(null), 6000);
  }, []);
  // Session restoration: the HttpOnly cookie survives a browser refresh; ask the server who we are.
  useEffect(() => {
    let alive = true;
    getSession()
      .then((s) => { if (alive && s) { setSession(s); setActive(s.user.role === "ADMIN" ? "overview" : "dashboard"); } })
      .catch(() => { /* backend unreachable: fall through to the sign-in screen */ })
      .finally(() => { if (alive) setBooting(false); });
    return () => { alive = false; };
  }, []);

  // Any 401 on an established session (expired / revoked) returns the user to sign-in with an explanation.
  useEffect(() => {
    const onExpired = () => { setSession(null); setMenuOpen(false); setToast(null); setLoginNotice("Sesi Anda telah berakhir. Silakan masuk kembali."); };
    window.addEventListener(UNAUTHORIZED_EVENT, onExpired);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onExpired);
  }, []);

  // The Gateway Simulator only exists when the backend has the mock gateway enabled.
  useEffect(() => {
    if (session?.user.role === "ADMIN") getConfig().then((c) => setSimulatorEnabled(c.mockGatewayEnabled));
    else setSimulatorEnabled(false);
  }, [session]);

  const go = useCallback((p: PageKey) => { setActive(p); setMenuOpen(false); }, []);

  useEffect(() => { document.title = session ? `${TITLES[active]} · Sistem Pembayaran UKT SEVIMA` : "Masuk · Sistem Pembayaran UKT SEVIMA"; }, [session, active]);

  // Mobile navigation drawer: Escape closes it; focus moves in on open and back to the menu button on close.
  useEffect(() => {
    if (!menuOpen) return;
    closeButton.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { setMenuOpen(false); menuButton.current?.focus(); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);
  useEffect(() => { if (isDesktop) setMenuOpen(false); }, [isDesktop]);

  if (booting) {
    return <div role="status" aria-live="polite" className="grid min-h-screen place-items-center bg-[#f5f7fb] text-sm font-medium text-slate-600">Memulihkan sesi Anda…</div>;
  }
  if (!session) {
    return <LoginScreen role={role} setRole={setRole} notice={loginNotice} onLogin={(s) => { setLoginNotice(""); setSession(s); setActive(s.user.role === "ADMIN" ? "overview" : "dashboard"); }} />;
  }

  const admin = session.user.role === "ADMIN";
  const signOut = () => {
    logout().catch(() => { /* the local session is cleared regardless; a failed server call must not trap the user */ });
    setLoginNotice("");
    setToast(null); setMenuOpen(false); setSession(null);
  };
  // Plain functions (not nested components) so the buttons keep their identity -- and keyboard focus -- across re-renders.
  const navButton = (item: Nav) => (
    <button key={item.key} type="button" onClick={() => go(item.key)} aria-current={active === item.key ? "page" : undefined}
      className={`flex min-h-11 w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${active === item.key ? "bg-[#edf3ff] text-[#0f4ed8]" : "text-slate-700 hover:bg-slate-50 hover:text-slate-900"}`}>
      <Icon name={item.icon} size={19} /><span>{item.label}</span>
    </button>
  );

  let page;
  switch (active) {
    case "overview": page = <Overview session={session} go={go} />; break;
    case "invoices": page = <InvoicesPage session={session} mode="admin" notify={notify} />; break;
    case "my-invoices": page = <InvoicesPage session={session} mode="student" notify={notify} />; break;
    case "transactions": case "my-transactions": page = <Transactions session={session} />; break;
    case "webhooks": page = <WebhookMonitor session={session} />; break;
    case "simulator": page = simulatorEnabled ? <GatewaySimulator session={session} go={go} /> : <Overview session={session} go={go} />; break;
    case "students": page = <StudentsPage session={session} />; break;
    case "dashboard": page = <StudentDashboard session={session} go={go} />; break;
  }

  return (
    <div className="min-h-screen bg-[#f5f7fb] text-[#17223b]">
      <a href="#main" className="sr-only z-[70] rounded-lg bg-white px-4 py-2 text-sm font-semibold text-[#0f4ed8] shadow-lg focus:not-sr-only focus:fixed focus:left-3 focus:top-3">Lewati ke konten utama</a>
      {menuOpen && <div className="fixed inset-0 z-30 bg-slate-950/40 lg:hidden" aria-hidden="true" onClick={() => setMenuOpen(false)} />}

      <aside
        aria-label="Bilah samping" inert={!isDesktop && !menuOpen}
        className={`fixed inset-y-0 left-0 z-40 flex w-[272px] max-w-[86vw] flex-col border-r border-slate-200 bg-white transition-transform duration-300 lg:w-[252px] ${menuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}`}
      >
        <div className="flex h-[72px] shrink-0 items-center gap-3 border-b border-slate-100 px-5">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#165DFF] text-white shadow-[0_8px_20px_rgba(22,93,255,.25)]"><Icon name="mahasiswa" size={24} /></div>
          <div><div className="text-[19px] font-bold leading-none tracking-[-.02em] text-[#15305b]">SEVIMA</div><div className="mt-1 text-[11px] font-semibold tracking-[.08em] text-slate-600">PEMBAYARAN UKT</div></div>
          <button ref={closeButton} type="button" className="ml-auto grid h-11 w-11 place-items-center rounded-lg text-slate-600 hover:bg-slate-100 lg:hidden" aria-label="Tutup menu navigasi" onClick={() => { setMenuOpen(false); menuButton.current?.focus(); }}><Icon name="tutup" /></button>
        </div>
        <nav aria-label="Navigasi utama" className="flex-1 overflow-y-auto px-4 py-6">
          <GroupLabel first>{admin ? "Menu Utama" : "Akun Saya"}</GroupLabel>
          <div className="space-y-1">{(admin ? adminMain : studentNav).map(navButton)}</div>
          {admin && (<><GroupLabel>Gateway Pembayaran</GroupLabel><div className="space-y-1">{adminGateway.filter((n) => n.key !== "simulator" || simulatorEnabled).map(navButton)}</div></>)}
        </nav>
        <div className="m-4 shrink-0 rounded-2xl bg-[#f6f8fc] p-3.5">
          <div className="flex items-center gap-3">
            <div aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#153d78] text-xs font-bold text-white">{session.user.name.split(" ").map((w) => w[0]).slice(0, 2).join("")}</div>
            <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-900">{session.user.name}</p><p className="truncate text-xs text-slate-600">{admin ? "Admin Keuangan" : "Mahasiswa"}</p></div>
          </div>
          <button type="button" onClick={signOut} className="mt-3 flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-700 hover:bg-slate-50 hover:text-red-700"><Icon name="logout" size={16} />Keluar</button>
        </div>
      </aside>

      <div className="lg:pl-[252px]">
        <header className="sticky top-0 z-20 flex h-[72px] items-center gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur md:px-8">
          <button ref={menuButton} type="button" className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-slate-700 hover:bg-slate-100 lg:hidden" aria-label="Buka menu navigasi" aria-expanded={menuOpen} onClick={() => setMenuOpen(true)}><Icon name="menu" /></button>
          <div className="ml-auto min-w-0 text-right">
            <p className="truncate text-sm font-semibold text-slate-800">{session.institution.name}</p>
            <p className="text-xs text-slate-600">Institusi {session.institution.code}</p>
          </div>
        </header>
        <main id="main" tabIndex={-1} className="mx-auto max-w-[1500px] p-4 outline-none sm:p-6 md:p-8">{page}</main>
      </div>

      {/* Always mounted so assistive tech reliably announces new messages. */}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-4 bottom-4 z-[60] flex justify-center sm:inset-x-auto sm:bottom-6 sm:right-6 sm:justify-end">
        {toast && (
          <div key={toast.id} role={toast.kind === "error" ? "alert" : "status"}
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium text-white shadow-2xl ${toast.kind === "error" ? "bg-red-800" : "bg-[#17223b]"}`}>
            <Icon name={toast.kind === "error" ? "peringatan" : "centang"} size={18} className="mt-0.5 shrink-0" />
            <p className="min-w-0 flex-1">{toast.message}</p>
            <button type="button" onClick={() => setToast(null)} aria-label="Tutup notifikasi" className="-m-1 grid h-8 w-8 shrink-0 place-items-center rounded-lg hover:bg-white/15"><Icon name="tutup" size={15} /></button>
          </div>
        )}
      </div>
    </div>
  );
}
