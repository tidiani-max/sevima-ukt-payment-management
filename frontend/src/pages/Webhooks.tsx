import { useEffect, useMemo, useState } from "react";
import { Btn, Card, DetailGrid, Drawer, Empty, ErrorBox, Field, inputCls, Notice, PageHeader, Pagination, Pill, SearchInput, TableSkeleton, type Tone } from "../components/shared";
import { DataTable, type Column } from "../components/DataTable";
import { fmtDateTime, PROCESSING_INFO, PROCESSING_STATUSES, rupiah } from "../lib/format";
import { friendlyError } from "../lib/errors";
import { matchesTerm, paginate } from "../lib/table";
import { useAsync } from "../lib/useAsync";
import { listInstitutions } from "../services/institution.service";
import { listInvoices } from "../services/invoice.service";
import { buildPayload, listWebhookEvents, SIGNATURE_HEADER, simulateWebhook, WEBHOOK_PATH, type SimulationResult } from "../services/webhook.service";
import type { ProcessingStatus, Session, WebhookEvent, WebhookEventType } from "../types";
import type { PageKey } from "../App";

const PAGE_SIZE = 10;
const TONE: Record<ProcessingStatus, Tone> = {
  PROCESSED: "green", DUPLICATE: "orange", INVALID_SIGNATURE: "red", INVALID_PAYLOAD: "red", INVOICE_NOT_FOUND: "red", AMOUNT_MISMATCH: "red",
  INVALID_STATE: "orange", REQUIRES_REVIEW: "orange", EVENT_CONFLICT: "red", UNKNOWN_INSTITUTION: "red",
};
const ICON = { green: "centang", orange: "clock", red: "peringatan", slate: "info" } as const;
const ProcessingPill = ({ status }: { status: ProcessingStatus }) => <Pill tone={TONE[status]} icon={ICON[TONE[status]]}>{PROCESSING_INFO[status].label}</Pill>;

const eventKey = (e: WebhookEvent) => `${e.eventId}|${e.processingStatus}|${e.receivedAt}`;

const SignaturePill = ({ valid }: { valid: boolean }) => <Pill tone={valid ? "green" : "red"} icon={valid ? "centang" : "peringatan"}>{valid ? "Valid" : "Tidak valid"}</Pill>;

/** Both timestamps, always labelled: the gateway's event time is not the time this application received the request. */
const Timestamps = ({ e }: { e: WebhookEvent }) => (
  <dl className="min-w-[11rem] space-y-1 text-xs">
    <div><dt className="inline font-medium text-slate-600">Terjadi (gateway): </dt><dd className="inline font-normal text-slate-900">{fmtDateTime(e.occurredAt, true)}</dd></div>
    <div><dt className="inline font-medium text-slate-600">Diterima (aplikasi): </dt><dd className="inline font-normal text-slate-900">{fmtDateTime(e.receivedAt, true)}</dd></div>
  </dl>
);

export function WebhookMonitor({ session }: { session: Session }) {
  const ev = useAsync(() => listWebhookEvents(session), [session]);
  const [status, setStatus] = useState<"ALL" | ProcessingStatus>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<WebhookEvent | null>(null);

  const all = useMemo(() => [...(ev.data ?? [])].sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime()), [ev.data]);
  const filtered = useMemo(() => all.filter((e) => (status === "ALL" || e.processingStatus === status) && matchesTerm(query, e.eventId, e.invoiceNumber, e.institutionCode, e.eventType)), [all, status, query]);
  const pg = paginate(filtered, page, PAGE_SIZE);
  const filtersActive = status !== "ALL" || query.trim() !== "";

  const columns: Column<WebhookEvent>[] = [
    { key: "id", header: "Event ID", cell: (e) => <><span className="font-mono text-[13px]">{e.eventId}</span><span className="mt-0.5 block font-mono text-xs font-normal text-slate-600">{e.eventType}</span></> },
    { key: "invoice", header: "Nomor Tagihan", cell: (e) => <>{e.invoiceNumber}<span className="mt-0.5 block text-xs font-normal text-slate-600">Institusi {e.institutionCode}</span></> },
    { key: "amount", header: "Jumlah", nowrap: true, cell: (e) => rupiah(e.amount) },
    { key: "times", header: "Waktu", wide: true, cell: (e) => <Timestamps e={e} /> },
    { key: "sig", header: "Signature", nowrap: true, cell: (e) => <SignaturePill valid={e.signatureValid} /> },
    {
      key: "result", header: "Status Pemrosesan", wide: true, cell: (e) => (
        <div className="min-w-[10rem]">
          <ProcessingPill status={e.processingStatus} />
          <p className="mt-1 text-xs text-slate-600">HTTP {e.httpStatus}</p>
          {e.processingStatus !== "PROCESSED" && <p className="mt-0.5 text-xs font-medium text-slate-700">{e.errorMessage ?? PROCESSING_INFO[e.processingStatus].detail}</p>}
        </div>
      ),
    },
    { key: "actions", header: "Aksi", isActions: true, cell: (e) => <Btn onClick={() => setSelected(e)} aria-label={`Lihat detail event ${e.eventId}, ${PROCESSING_INFO[e.processingStatus].label}`}>Lihat</Btn> },
  ];

  return (
    <>
      <PageHeader eyebrow={`Institusi ${session.institution.code}`} title="Pemantauan Webhook"
        text="Setiap event pembayaran yang diterima dari gateway dicatat di sini, termasuk yang ditolak. Pemeriksaan signature dilakukan oleh backend." />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="lg:w-64">
            <label htmlFor="wh-status" className="sr-only">Filter berdasarkan status pemrosesan</label>
            <select id="wh-status" value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(1); }} className={inputCls()}>
              <option value="ALL">Semua status pemrosesan</option>
              {PROCESSING_STATUSES.map((s) => <option key={s} value={s}>{PROCESSING_INFO[s].label}</option>)}
            </select>
          </div>
          <SearchInput className="lg:w-80" value={query} onChange={(v) => { setQuery(v); setPage(1); }} label="Cari event webhook" placeholder="Cari ID event, tagihan, atau institusi" />
        </div>
        {ev.loading ? <TableSkeleton label="Memuat event webhook…" /> : ev.error ? <ErrorBox title="Event webhook tidak dapat dimuat" message={ev.error} retry={ev.reload} /> : (
          <>
            <DataTable columns={columns} rows={pg.rows} rowKey={eventKey} label="Event webhook" onRowClick={setSelected} cardsBelow="xl"
              empty={filtersActive && all.length ? (
                <Empty title="Tidak ada event yang cocok dengan filter Anda" text="Coba status pemrosesan atau kata kunci lain." action={<Btn onClick={() => { setStatus("ALL"); setQuery(""); setPage(1); }}>Hapus filter</Btn>} />
              ) : <Empty title="Belum ada event webhook" text="Event akan muncul di sini ketika gateway pembayaran mengirim notifikasi ke backend." />} />
            <Pagination {...pg} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && (
        <Drawer title={`Event ${selected.eventId}`} subtitle={selected.eventType} onClose={() => setSelected(null)}>
          <div className="space-y-6">
            <DetailGrid items={[
              ["Tipe Event", selected.eventType], ["Status Pemrosesan", <ProcessingPill key="p" status={selected.processingStatus} />],
              ["Institusi", selected.institutionCode], ["Nomor Tagihan", selected.invoiceNumber],
              ["Jumlah", rupiah(selected.amount)], ["Status Respons HTTP", String(selected.httpStatus)],
              ["Terjadi pada (gateway)", fmtDateTime(selected.occurredAt, true)], ["Diterima pada (aplikasi ini)", fmtDateTime(selected.receivedAt, true)],
              ["Verifikasi Signature", <SignaturePill key="sg" valid={selected.signatureValid} />],
            ]} />
            {selected.processingStatus !== "PROCESSED" && <Notice tone={TONE[selected.processingStatus] === "red" ? "danger" : "warning"} title={PROCESSING_INFO[selected.processingStatus].label}>{selected.errorMessage ?? PROCESSING_INFO[selected.processingStatus].detail}</Notice>}
            <div>
              <h3 className="mb-2 text-sm font-bold text-slate-900">Request yang tercatat</h3>
              <pre tabIndex={0} className="overflow-x-auto rounded-xl bg-[#101827] p-4 text-xs leading-6 text-blue-100"><code>{JSON.stringify({ request_body: buildPayload(selected), headers: { [SIGNATURE_HEADER]: selected.signature }, received_at: selected.receivedAt, signature_valid: selected.signatureValid, http_status: selected.httpStatus, processing_status: selected.processingStatus, ...(selected.errorMessage ? { error_message: selected.errorMessage } : {}) }, null, 2)}</code></pre>
            </div>
          </div>
        </Drawer>
      )}
    </>
  );
}

const UNKNOWN_CODE = "XX999";
const newEvent = () => ({ eventId: `evt_${Date.now().toString(36)}`, occurredAt: new Date().toISOString() });
const EVENT_HELP: Record<WebhookEventType, { title: string; text: string }> = {
  "payment.success": { title: "Pembayaran berhasil", text: "Gateway melaporkan bahwa tagihan telah dibayar. Jika backend menerima event ini, tagihan berubah menjadi Lunas." },
  "payment.expired": { title: "Pembayaran kedaluwarsa", text: "Gateway melaporkan bahwa batas waktu pembayaran berakhir tanpa pembayaran. Jika backend menerima event ini, tagihan berubah menjadi Kedaluwarsa." },
};

export function GatewaySimulator({ session, go }: { session: Session; go: (p: PageKey) => void }) {
  const insts = useAsync(listInstitutions, []);
  const invs = useAsync(() => listInvoices(session), [session]);
  const [type, setType] = useState<WebhookEventType>("payment.success");
  const [code, setCode] = useState(session.institution.code);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<{ invoiceNumber?: string; amount?: string }>({});
  const [result, setResult] = useState<SimulationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [event, setEvent] = useState(newEvent);
  const [prefilled, setPrefilled] = useState(false);
  const [tamper, setTamper] = useState(false);
  const [lastSentId, setLastSentId] = useState("");

  const unpaid = useMemo(() => (invs.data ?? []).filter((i) => i.status === "UNPAID"), [invs.data]);
  // Convenience: start from the institution's first unpaid invoice (once), so the form is not empty.
  useEffect(() => {
    if (prefilled || !unpaid[0]) return;
    setPrefilled(true); // one-shot; never overwrite anything the person has already typed
    if (!invoiceNumber && !amount) { setInvoiceNumber(unpaid[0].invoiceNumber); setAmount(String(unpaid[0].amount)); }
  }, [unpaid, prefilled, invoiceNumber, amount]);

  const pickInvoice = (value: string) => {
    setInvoiceNumber(value);
    const match = (invs.data ?? []).find((i) => i.invoiceNumber === value);
    if (match) setAmount(String(match.amount)); // the amount follows the chosen invoice
    setErrors((e) => ({ ...e, invoiceNumber: undefined }));
  };
  const amountNumber = Number(amount);
  const payload = buildPayload({ eventId: event.eventId, eventType: type, institutionCode: code, invoiceNumber: invoiceNumber.trim(), amount: Number.isFinite(amountNumber) ? amountNumber : 0, occurredAt: event.occurredAt });

  const send = async () => {
    if (busy) return;
    const found: typeof errors = {};
    if (!invoiceNumber.trim()) found.invoiceNumber = "Masukkan nomor tagihan.";
    if (!(amountNumber > 0)) found.amount = "Masukkan jumlah yang lebih besar dari nol.";
    setErrors(found);
    if (Object.keys(found).length) return;
    setBusy(true); setResult(null);
    try { setResult(await simulateWebhook({ payload, tamperSignature: tamper })); setLastSentId(payload.event_id); setEvent(newEvent()); }
    catch (e) { setResult({ sent: false, message: friendlyError(e) }); }
    finally { setBusy(false); }
  };

  return (
    <>
      <PageHeader eyebrow="Alat pengembang" title="Simulator Gateway"
        text="Siapkan event pembayaran uji untuk webhook backend. Signature dihitung dan diverifikasi oleh backend, tidak pernah di browser." />
      <Notice tone="info" className="mb-5" title="Alat pengujian, bukan gateway pembayaran sungguhan">
        Request dikirim melalui simulator backend khusus pengembangan, yang menandatangani request body persis dengan secret institusi Anda dan mengirimkannya ke endpoint webhook yang sebenarnya. Hasil di bawah ini adalah hasil nyata, dan setiap event disimpan ke audit log. Alat ini tidak tersedia di production.
      </Notice>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,.85fr)_minmax(0,1.15fr)]">
        <Card className="space-y-4 p-5 sm:p-6">
          <h2 className="text-base font-bold text-slate-900">Pengaturan simulasi</h2>
          <Field label="Tipe Event" required hint={<><b>{EVENT_HELP[type].title}.</b> {EVENT_HELP[type].text}</>}>
            <select value={type} onChange={(e) => setType(e.target.value as WebhookEventType)} className={inputCls()}>
              {(Object.keys(EVENT_HELP) as WebhookEventType[]).map((t) => <option key={t} value={t}>{t} — {EVENT_HELP[t].title}</option>)}
            </select>
          </Field>
          <Field label="Kode Institusi" required hint={insts.error ? "Daftar institusi tidak dapat dimuat, sehingga hanya institusi Anda yang ditawarkan." : "Secara default menggunakan institusi Anda. Pilih “Kode tidak terdaftar” untuk menguji institusi yang tidak dikenal."}>
            <select value={code} onChange={(e) => setCode(e.target.value)} className={inputCls()}>
              {(insts.data ?? [session.institution]).map((i) => <option key={i.id} value={i.code}>{i.name} · {i.code}</option>)}
              <option value={UNKNOWN_CODE}>Kode tidak terdaftar · {UNKNOWN_CODE}</option>
            </select>
          </Field>
          <Field label="Nomor Tagihan" required error={errors.invoiceNumber} hint="Mulai mengetik untuk memilih salah satu tagihan belum bayar Anda, atau masukkan nomor apa pun untuk menguji tagihan yang tidak dikenal.">
            <input value={invoiceNumber} onChange={(e) => pickInvoice(e.target.value)} list="unpaid-invoices" autoComplete="off" placeholder="mis. UKT-2026-0001" className={inputCls(errors.invoiceNumber)} />
          </Field>
          <datalist id="unpaid-invoices">{unpaid.map((i) => <option key={i.id} value={i.invoiceNumber} />)}</datalist>
          <Field label="Jumlah (Rp)" required error={errors.amount} hint={amountNumber > 0 ? rupiah(amountNumber) : "Rupiah utuh, hanya angka."}>
            <input inputMode="numeric" value={amount} onChange={(e) => { setAmount(e.target.value.replace(/\D/g, "").slice(0, 12)); setErrors((x) => ({ ...x, amount: undefined })); }} autoComplete="off" placeholder="mis. 6500000" className={inputCls(errors.amount)} />
          </Field>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><Field label="Event ID" hint="Mengirim ID event yang sama dua kali memungkinkan Anda menguji deteksi duplikat."><input readOnly value={event.eventId} className={`${inputCls()} font-mono`} /></Field></div>
            <Btn onClick={() => setEvent((e) => ({ ...e, eventId: newEvent().eventId }))} aria-label="Buat ID event baru">ID Baru</Btn>
            <Btn onClick={() => setEvent((e) => ({ ...e, eventId: lastSentId }))} disabled={!lastSentId || lastSentId === event.eventId} aria-label="Gunakan ulang ID event dari request terakhir yang dikirim">Gunakan Ulang</Btn>
          </div>
          <div className="flex items-start gap-3">
            <input id="tamper" type="checkbox" checked={tamper} onChange={(e) => setTamper(e.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#165DFF]" />
            <label htmlFor="tamper" className="text-sm text-slate-700"><span className="font-semibold text-slate-900">Kirim dengan signature tidak valid</span><span className="block text-xs text-slate-600">Meminta backend merusak signature untuk menguji penolakan.</span></label>
          </div>
          <Btn primary className="w-full" onClick={send} disabled={busy} aria-busy={busy}>{busy ? "Mengirim…" : "Kirim Webhook Simulasi"}</Btn>
          {result && <SimulationOutcome result={result} openMonitor={() => go("webhooks")} />}
        </Card>

        <section aria-label="Pratinjau request" className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-[#101827]">
          <div className="border-b border-white/10 px-5 py-4">
            <p className="text-sm font-semibold text-white">Pratinjau request <span className="font-normal text-slate-300">(belum dikirim sampai Anda mengirimnya)</span></p>
            <p className="mt-1 break-all font-mono text-xs text-slate-300">{WEBHOOK_PATH} · Content-Type: application/json</p>
          </div>
          <pre tabIndex={0} className="overflow-x-auto p-5 text-xs leading-6 text-blue-100 sm:p-6"><code>{JSON.stringify(payload, null, 2)}</code></pre>
          <div className="border-t border-white/10 p-5">
            <div className="flex flex-col gap-1 rounded-lg bg-white/5 px-3 py-2.5 text-xs sm:flex-row sm:justify-between sm:gap-4">
              <span className="font-mono text-slate-200">{SIGNATURE_HEADER}</span>
              <span className="break-all font-mono text-slate-300 sm:text-right">{result?.signature ?? "Dihitung oleh backend (HMAC-SHA256 dari raw request body)"}</span>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}

/** Reports exactly what happened. "Processed" is only claimed when the (real or demo) handler says so. */
function SimulationOutcome({ result, openMonitor }: { result: SimulationResult; openMonitor: () => void }) {
  let tone: "warning" | "success" | "danger" = "warning";
  let title = "Tidak terkirim";
  if (result.sent) {
    const st = result.processingStatus;
    if (st === "PROCESSED") { tone = "success"; title = "Event diproses"; }
    else if (st === "DUPLICATE") { tone = "warning"; title = "Event diterima, tetapi tidak diterapkan (duplikat)"; }
    else if (st) { tone = "danger"; title = `Event ditolak: ${PROCESSING_INFO[st].label}`; }
    else { tone = "warning"; title = "Event diterima, tetapi tidak diterapkan"; }
  }
  return (
    <div role="status">
      <Notice tone={tone} title={title}>
        <p>{result.message}</p>
        {result.sent && <p className="mt-1 font-mono text-xs">HTTP {result.httpStatus ?? "—"}{result.processingStatus ? ` · ${result.processingStatus}` : ""}</p>}
        {result.sent && <button type="button" onClick={openMonitor} className="mt-2 inline-flex min-h-11 items-center font-semibold underline">Buka Pemantauan Webhook untuk memverifikasi</button>}
      </Notice>
    </div>
  );
}
