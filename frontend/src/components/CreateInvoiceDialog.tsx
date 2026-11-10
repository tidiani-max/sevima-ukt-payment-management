import { useMemo, useRef, useState } from "react";
import { Btn, Field, inputCls, Modal, Notice } from "./shared";
import { friendlyError } from "../lib/errors";
import { rupiah } from "../lib/format";
import { useAsync } from "../lib/useAsync";
import { toDateInputValue } from "../lib/dates";
import { parseAmount, suggestInvoiceNumber, validateInvoiceForm, MAX_INVOICE_NUMBER_LENGTH, type InvoiceFormErrors, type InvoiceFormValues } from "../lib/invoices";
import { createInvoice } from "../services/invoice.service";
import { mergeSemesters } from "../lib/semesters";
import { listSemesters } from "../services/semester.service";
import type { Invoice, Session, Student } from "../types";

const FORM_ID = "create-invoice-form";

export function CreateInvoiceDialog({ session, students, existing, onClose, onCreated }: {
  session: Session; students: Student[]; existing: Invoice[]; onClose: () => void; onCreated: (invoice: Invoice) => void;
}) {
  const existingNumbers = useMemo(() => existing.map((i) => i.invoiceNumber), [existing]);
  const sem = useAsync(listSemesters, []);
  const semesters = useMemo(() => mergeSemesters(sem.data ?? [], existing), [sem.data, existing]);
  const sortedStudents = useMemo(() => [...students].sort((a, b) => a.name.localeCompare(b.name)), [students]);

  const [values, setValues] = useState<InvoiceFormValues>(() => ({
    studentId: "", invoiceNumber: suggestInvoiceNumber(existingNumbers, new Date().getFullYear()), semester: "", amount: "",
    issuedAt: toDateInputValue(), expiresAt: "",
  }));
  const [errors, setErrors] = useState<InvoiceFormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState("");
  const inFlight = useRef(false); // synchronous guard: state updates are async, so a fast double-click could slip through `busy`
  const form = useRef<HTMLFormElement>(null);

  const ctx = { studentIds: students.map((s) => s.id), existingInvoiceNumbers: existingNumbers };
  const change = (key: keyof InvoiceFormValues, raw: string) => {
    const value = key === "amount" ? raw.replace(/\D/g, "").slice(0, 12) : raw;
    const next = { ...values, [key]: value };
    setValues(next);
    setServerError("");
    if (submitted) setErrors(validateInvoiceForm(next, ctx)); // after the first attempt, errors update live
  };
  const bind = (key: keyof InvoiceFormValues) => ({ value: values[key], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => change(key, e.target.value) });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (inFlight.current) return;
    setSubmitted(true);
    const found = validateInvoiceForm(values, ctx);
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    inFlight.current = true; setBusy(true); setServerError("");
    try {
      // institutionId is intentionally not sent: the backend derives it from the session.
      const created = await createInvoice(session, {
        studentId: values.studentId, invoiceNumber: values.invoiceNumber.trim(), semester: values.semester,
        amount: parseAmount(values.amount), issuedAt: values.issuedAt, expiresAt: values.expiresAt,
      });
      onCreated(created); // the parent closes the dialog, which discards the form state
    } catch (x) {
      const message = friendlyError(x);
      if ((x as { status?: number }).status === 409) setErrors({ invoiceNumber: message });
      else setServerError(message);
      inFlight.current = false; setBusy(false);
    }
  };

  const amountNumber = parseAmount(values.amount);
  return (
    <Modal
      title="Buat Tagihan" subtitle="Tagihan baru selalu berstatus Belum Bayar; status hanya berubah melalui event pembayaran yang telah diverifikasi."
      onClose={onClose} closeDisabled={busy}
      footer={<>
        <Btn onClick={onClose} disabled={busy}>Batal</Btn>
        <Btn primary type="submit" form={FORM_ID} disabled={busy || !students.length} aria-busy={busy}>{busy ? "Membuat…" : "Buat Tagihan"}</Btn>
      </>}
    >
      <form id={FORM_ID} ref={form} onSubmit={submit} noValidate className="space-y-4">
        <div className="rounded-xl border border-blue-100 bg-blue-50 p-3 text-sm">
          <p className="font-semibold text-slate-800">{session.institution.name}</p>
          <p className="mt-0.5 text-xs text-slate-600">Institusi {session.institution.code} diambil dari akun Anda.</p>
        </div>
        {!students.length && <Notice tone="warning" title="Belum ada mahasiswa">Tagihan hanya dapat diterbitkan untuk mahasiswa yang terdaftar di institusi Anda.</Notice>}

        <Field label="Mahasiswa" required error={errors.studentId}>
          <select data-autofocus {...bind("studentId")} className={inputCls(errors.studentId)}>
            <option value="">Pilih mahasiswa</option>
            {sortedStudents.map((s) => <option key={s.id} value={s.id}>{s.name} — {s.nim}</option>)}
          </select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Nomor Tagihan" required error={errors.invoiceNumber} hint="Harus unik di institusi Anda.">
            <input {...bind("invoiceNumber")} maxLength={MAX_INVOICE_NUMBER_LENGTH + 10} autoComplete="off" placeholder="mis. UKT-2026-0005" className={inputCls(errors.invoiceNumber)} />
          </Field>
          <Field label="Semester Akademik" required error={errors.semester}
            hint={sem.loading ? "Memuat daftar semester…" : sem.error ? <>{sem.error} <button type="button" onClick={sem.reload} className="font-semibold text-[#0f4ed8] underline">Coba lagi</button></> : undefined}>
            <select {...bind("semester")} disabled={sem.loading} className={inputCls(errors.semester)}>
              <option value="">{sem.loading ? "Memuat…" : "Pilih semester"}</option>
              {semesters.map((s) => <option key={s.value} value={s.value}>{s.label}{s.current ? " (saat ini)" : ""}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Jumlah UKT (Rp)" required error={errors.amount} hint={amountNumber > 0 ? <>Jumlah: <b>{rupiah(amountNumber)}</b></> : "Rupiah utuh, hanya angka."}>
          <input {...bind("amount")} inputMode="numeric" autoComplete="off" placeholder="mis. 6500000" className={inputCls(errors.amount)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tanggal Terbit" required error={errors.issuedAt}>
            <input type="date" {...bind("issuedAt")} className={inputCls(errors.issuedAt)} />
          </Field>
          <Field label="Tanggal Kedaluwarsa" required error={errors.expiresAt} hint="Pada atau setelah tanggal terbit.">
            <input type="date" {...bind("expiresAt")} min={values.issuedAt || undefined} className={inputCls(errors.expiresAt)} />
          </Field>
        </div>
        {serverError && <div role="alert"><Notice tone="danger" title="Tagihan tidak dapat dibuat">{serverError}</Notice></div>}
      </form>
    </Modal>
  );
}
