import { useRef, useState } from "react";
import { Icon } from "../components/ui";
import { Field, inputCls, Spinner } from "../components/shared";
import { friendlyError } from "../lib/errors";
import { SHOW_DEMO_ACCOUNTS } from "../services/api";
import { login } from "../services/auth.service";
import type { Session } from "../types";

type RoleTab = "admin" | "mahasiswa"; // internal identifiers; labels below are what people see
const DEMO: Record<RoleTab, string> = { admin: "admin.keuangan@um.ac.id", mahasiswa: "nadia.putri@student.um.ac.id" };
const DEMO_PASSWORD = "demosevima";
const ROLE_LABEL: Record<RoleTab, string> = { admin: "Admin Keuangan", mahasiswa: "Mahasiswa" };

export function LoginScreen({ role, setRole, onLogin, notice }: { role: RoleTab; setRole: (role: RoleTab) => void; onLogin: (session: Session) => void; notice?: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(false);
  const inFlight = useRef(false);
  const form = useRef<HTMLFormElement>(null);

  const fillDemo = (r: RoleTab) => { setEmail(DEMO[r]); setPassword(DEMO_PASSWORD); setErrors({}); setFormError(""); };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (inFlight.current) return;
    const found: typeof errors = {};
    if (!email.trim()) found.email = "Masukkan alamat email Anda.";
    else if (!/^\S+@\S+\.\S+$/.test(email.trim())) found.email = "Masukkan alamat email yang valid.";
    if (!password) found.password = "Masukkan kata sandi Anda.";
    setErrors(found); setFormError("");
    if (Object.keys(found).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    inFlight.current = true; setLoading(true);
    try { onLogin(await login(email, password)); }
    catch (e) { setFormError(friendlyError(e, { 401: "Email atau kata sandi salah." })); inFlight.current = false; setLoading(false); }
  };

  return (
    <div className="grid min-h-screen bg-[#f5f7fb] lg:grid-cols-[1.08fr_.92fr]">
      <section aria-label="Tentang platform" className="relative hidden overflow-hidden bg-[#0d2b5b] p-14 text-white lg:flex lg:flex-col">
        <div aria-hidden="true" className="absolute -bottom-52 -left-40 h-[520px] w-[520px] rounded-full bg-[#165DFF]/20 blur-2xl" />
        <div className="relative flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-[#165DFF]"><Icon name="mahasiswa" size={25} /></div>
          <div>
            <p className="text-xl font-bold">SEVIMA</p>
            <p className="text-[11px] font-semibold tracking-[.15em] text-blue-200">SISTEM PEMBAYARAN KULIAH</p>
          </div>
        </div>
        <div className="relative my-auto max-w-xl">
          <span className="inline-flex rounded-full border border-blue-300/30 bg-white/10 px-3 py-1.5 text-xs font-semibold text-blue-100">Integrasi Pembayaran Kuliah</span>
          <h2 className="mt-6 text-4xl font-bold leading-tight tracking-[-.04em]">Kelola pembayaran kuliah secara aman dan transparan.</h2>
          <p className="mt-5 max-w-lg text-sm leading-7 text-blue-100/85">
            Satu platform terpadu untuk menerbitkan tagihan kuliah, memeriksa transaksi, memantau webhook pembayaran, dan melacak status pembayaran setiap mahasiswa.
          </p>
          <ul className="mt-10 grid grid-cols-3 gap-3">
            {[["Multi-institusi", "Setiap akun terikat pada satu institusi"], ["Jejak audit lengkap", "Setiap event webhook tercatat dengan rapi"], ["Pengujian gateway", "Simulasikan berbagai event pembayaran"]].map(([heading, text]) => (
              <li key={heading} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <Icon name="centang" size={18} className="text-blue-300" />
                <p className="mt-3 text-sm font-semibold">{heading}</p>
                <p className="mt-1 text-xs leading-5 text-blue-100/75">{text}</p>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-blue-200/70">© 2026 SEVIMA · Sistem Manajemen Pembayaran Pendidikan</p>
      </section>

      <main className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-[430px]">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#165DFF] text-white"><Icon name="mahasiswa" size={22} /></div>
            <div><p className="text-lg font-bold leading-none text-[#15305b]">SEVIMA</p><p className="mt-1 text-[11px] font-semibold tracking-[.12em] text-slate-600">SISTEM PEMBAYARAN UKT</p></div>
          </div>
          <p className="text-sm font-semibold text-[#0f4ed8]">Selamat datang kembali</p>
          <h1 className="mt-2 text-3xl font-bold tracking-[-.04em] text-slate-900">Masuk ke akun Anda</h1>
          <p className="mt-2 text-sm text-slate-600">
            Gunakan akun institusi Anda untuk melanjutkan.
          </p>

          {notice && <div role="status" className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm font-medium text-amber-900">{notice}</div>}

          <div role="group" aria-label="Masuk sebagai" className="mt-7 grid grid-cols-2 rounded-xl bg-slate-100 p-1">
            {(["admin", "mahasiswa"] as const).map((item) => (
              <button key={item} type="button" aria-pressed={role === item}
                onClick={() => { setRole(item); setErrors({}); setFormError(""); if (SHOW_DEMO_ACCOUNTS) fillDemo(item); }}
                className={`min-h-11 rounded-lg px-3 text-sm font-semibold transition ${role === item ? "bg-white text-[#0f4ed8] shadow-sm" : "text-slate-700 hover:text-slate-900"}`}>
                {ROLE_LABEL[item]}
              </button>
            ))}
          </div>

          <form ref={form} onSubmit={submit} className="mt-6 space-y-4" noValidate>
            <Field label="Email" error={errors.email} required>
              <input type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder={role === "admin" ? "nama@universitas.ac.id" : "nama@student.universitas.ac.id"} className={`${inputCls(errors.email)} !h-12`} />
            </Field>
            <Field label="Kata Sandi" error={errors.password} required>
              <input type="password" name="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Masukkan kata sandi Anda" className={`${inputCls(errors.password)} !h-12`} />
            </Field>
            {formError && (
              <div role="alert" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-900">
                <Icon name="peringatan" size={17} className="mt-0.5 shrink-0" />{formError}
              </div>
            )}
            <button type="submit" disabled={loading} aria-busy={loading}
              className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#165DFF] text-sm font-semibold text-white shadow-lg shadow-blue-200 transition hover:bg-[#0f4ed8] disabled:cursor-not-allowed disabled:opacity-70">
              {loading ? <><Spinner size={16} />Sedang masuk…</> : "Masuk"}
            </button>
          </form>

          {SHOW_DEMO_ACCOUNTS && (
            <>
              <button type="button" onClick={() => fillDemo(role)} className="mt-4 min-h-11 w-full rounded-lg text-center text-sm font-semibold text-[#0f4ed8] hover:bg-blue-50">Isi akun demo</button>
              <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-600">Lingkungan demo</p>
                <p className="mt-2 text-sm text-slate-700">Universitas Negeri Malang · Universitas Brawijaya · Universitas Indonesia</p>
              </div>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
