import { useMemo, useState } from "react";
import { Badge, Btn, Card, DetailGrid, Drawer, DueHint, Empty, ErrorBox, FilterChips, Loading, Notice, PageHeader, Pagination, SearchInput, TableSkeleton } from "../components/shared";
import { DataTable, type Column } from "../components/DataTable";
import { CreateInvoiceDialog } from "../components/CreateInvoiceDialog";
import { Icon } from "../components/ui";
import { useAsync } from "../lib/useAsync";
import { downloadCsv, eventLabel, fmtDate, fmtDateTime, rupiah, semesterLabel, STATUSES, statusLabel } from "../lib/format";
import { dueLabel, dueState, filterInvoices, type InvoiceFilter } from "../lib/invoices";
import { paginate } from "../lib/table";
import { sortTransactions } from "../lib/transactions";
import { listInvoices } from "../services/invoice.service";
import { getMyProfile, listStudents } from "../services/student.service";
import { listTransactions } from "../services/transaction.service";
import type { Invoice, Session, Student, Transaction } from "../types";

const PAGE_SIZE = 10;

export function InvoicesPage({ session, mode, notify }: { session: Session; mode: "admin" | "student"; notify: (message: string, kind?: "success" | "error") => void }) {
  const admin = mode === "admin";
  const inv = useAsync(() => listInvoices(session), [session]);
  // Admins load their institution's students; a student only ever loads their own profile.
  const stu = useAsync(() => (admin ? listStudents(session) : getMyProfile(session).then((p) => [p])), [session, admin]);
  const trx = useAsync(() => listTransactions(session), [session]);
  const [filter, setFilter] = useState<InvoiceFilter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Invoice | null>(null);
  const [creating, setCreating] = useState(false);

  const studentsById = useMemo(() => new Map((stu.data ?? []).map((s) => [s.id, s])), [stu.data]);
  const studentOf = (id: string) => studentsById.get(id);
  const all = useMemo(() => inv.data ?? [], [inv.data]);
  const filtered = useMemo(() => filterInvoices(all, (id) => studentsById.get(id), filter, query), [all, studentsById, filter, query]);
  const pg = paginate(filtered, page, PAGE_SIZE);
  const count = (f: InvoiceFilter) => (f === "ALL" ? all.length : all.filter((i) => i.status === f).length);

  const loading = inv.loading || stu.loading;
  const error = inv.error || stu.error;
  const reload = () => { inv.reload(); stu.reload(); };

  const columns: Column<Invoice>[] = [
    { key: "no", header: "Nomor Tagihan", nowrap: true, cell: (i) => i.invoiceNumber },
    ...(admin ? [
      { key: "student", header: "Mahasiswa (NIM)", cell: (i: Invoice) => { const st = studentOf(i.studentId); return <>{st?.name ?? "—"}<span className="mt-0.5 block font-mono text-xs font-normal text-slate-600">{st?.nim ?? "—"}</span></>; } },
    ] : []),
    { key: "semester", header: "Semester Akademik", nowrap: true, cell: (i) => semesterLabel(i.semester) },
    { key: "amount", header: "Jumlah", nowrap: true, cell: (i) => <span className="font-semibold">{rupiah(i.amount)}</span> },
    { key: "issued", header: "Tanggal Terbit", nowrap: true, cell: (i) => fmtDate(i.issuedAt) },
    { key: "expires", header: "Tanggal Kedaluwarsa", nowrap: true, cell: (i) => <>{fmtDate(i.expiresAt)}<DueHint invoice={i} /></> },
    { key: "status", header: "Status", mobileTop: true, cell: (i) => <Badge status={i.status} /> },
    { key: "actions", header: "Aksi", isActions: true, cell: (i) => <Btn onClick={() => setSelected(i)} aria-label={`Lihat detail tagihan ${i.invoiceNumber}`}>Lihat</Btn> },
  ];

  const exportCsv = () => downloadCsv("tuition-invoices.csv", [
    ["Nomor Tagihan", ...(admin ? ["Mahasiswa", "NIM"] : []), "Semester Akademik", "Jumlah (Rp)", "Tanggal Terbit", "Tanggal Kedaluwarsa", "Status"],
    ...filtered.map((i) => [i.invoiceNumber, ...(admin ? [studentOf(i.studentId)?.name ?? "", studentOf(i.studentId)?.nim ?? ""] : []), semesterLabel(i.semester), i.amount, i.issuedAt, i.expiresAt, statusLabel(i.status)]),
  ]);

  const filtersActive = filter !== "ALL" || query.trim() !== "";
  return (
    <>
      <PageHeader
        eyebrow={admin ? `Institusi ${session.institution.code}` : "Akun Saya"}
        title={admin ? "Tagihan UKT" : "Tagihan Saya"}
        text={admin ? "Terbitkan dan pantau tagihan UKT untuk institusi Anda. Tagihan berubah menjadi Lunas atau Kedaluwarsa hanya ketika event pembayaran yang terverifikasi diterima." : "Tagihan UKT yang diterbitkan atas nama Anda."}
        action={<>
          <Btn onClick={exportCsv} disabled={!filtered.length}><Icon name="unduh" size={16} />Ekspor CSV</Btn>
          {admin && <Btn primary onClick={() => setCreating(true)}>Buat Tagihan</Btn>}
        </>}
      />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<InvoiceFilter> label="Filter berdasarkan status" value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
            options={[{ value: "ALL", label: "Semua", count: count("ALL") }, ...STATUSES.map((s) => ({ value: s, label: statusLabel(s), count: count(s) }))]} />
          <SearchInput className="lg:w-80" value={query} onChange={(v) => { setQuery(v); setPage(1); }} label="Cari tagihan"
            placeholder={admin ? "Cari tagihan, mahasiswa, atau NIM" : "Cari berdasarkan nomor tagihan"} />
        </div>
        {loading ? <TableSkeleton label="Memuat tagihan…" /> : error ? <ErrorBox title="Tagihan tidak dapat dimuat" message={error} retry={reload} /> : (
          <>
            <DataTable columns={columns} rows={pg.rows} rowKey={(i) => i.id} label="Tagihan UKT" onRowClick={setSelected} cardsBelow={admin ? "wide" : "xl"}
              empty={filtersActive && all.length ? (
                <Empty title="Tidak ada tagihan yang cocok dengan pencarian Anda" text="Coba kata kunci lain atau pilih status lain."
                  action={<Btn onClick={() => { setFilter("ALL"); setQuery(""); setPage(1); }}>Hapus filter</Btn>} />
              ) : (
                <Empty title="Belum ada tagihan"
                  text={admin ? "Gunakan “Buat Tagihan” untuk menerbitkan tagihan UKT pertama." : "Tagihan akan muncul di sini setelah institusi Anda menerbitkannya."} />
              )} />
            <Pagination {...pg} onPage={setPage} />
          </>
        )}
      </Card>

      {selected && (
        <Drawer title={`Tagihan ${selected.invoiceNumber}`} subtitle={semesterLabel(selected.semester)} onClose={() => setSelected(null)}>
          <InvoiceDetail invoice={selected} student={studentOf(selected.studentId)} studentError={stu.error} session={session}
            txs={sortTransactions((trx.data ?? []).filter((t) => t.invoiceId === selected.id))} txLoading={trx.loading} txError={trx.error} retryTx={trx.reload} />
        </Drawer>
      )}
      {creating && (
        <CreateInvoiceDialog session={session} students={stu.data ?? []} existing={all} onClose={() => setCreating(false)}
          onCreated={(created) => {
            setCreating(false);
            inv.setData((prev) => [created, ...(prev ?? [])]);
inv.reload();
            setFilter("ALL"); setQuery(""); setPage(1);
            notify(`Tagihan ${created.invoiceNumber} berhasil dibuat dengan status Belum Bayar.`);
          }} />
      )}
    </>
  );
}

function InvoiceDetail({ invoice: i, student, studentError, session, txs, txLoading, txError, retryTx }: {
  invoice: Invoice; student?: Student; studentError: string; session: Session; txs: Transaction[]; txLoading: boolean; txError: string; retryTx: () => void;
}) {
  const due = dueState(i);
  return (
    <div className="space-y-7">
      <section aria-label="Ringkasan tagihan" className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-2xl font-bold tracking-tight text-slate-900">{rupiah(i.amount)}</p>
          <Badge status={i.status} />
        </div>
        {due && <p className={`mt-3 flex items-center gap-1.5 text-sm font-semibold ${due.kind === "overdue" ? "text-red-700" : "text-orange-700"}`}><Icon name="clock" size={15} />{dueLabel(due)}</p>}
        {due?.kind === "overdue" && <p className="mt-1 text-xs text-slate-600">Status tetap Belum Bayar sampai sistem pembayaran mengonfirmasi bahwa tagihan telah kedaluwarsa.</p>}
      </section>

      <section aria-labelledby="inv-info">
        <h3 id="inv-info" className="mb-3 text-sm font-bold text-slate-900">Informasi tagihan</h3>
        <DetailGrid items={[
          ["Nomor Tagihan", i.invoiceNumber], ["Semester Akademik", semesterLabel(i.semester)], ["Jumlah", rupiah(i.amount)], ["Status", <Badge key="s" status={i.status} />],
          ["Tanggal Terbit", fmtDate(i.issuedAt)], ["Tanggal Kedaluwarsa", fmtDate(i.expiresAt)],
        ]} />
      </section>

      <section aria-labelledby="inv-student">
        <h3 id="inv-student" className="mb-3 text-sm font-bold text-slate-900">Mahasiswa</h3>
        {student ? (
          <DetailGrid items={[["Nama", student.name], ["NIM", <span key="n" className="font-mono">{student.nim}</span>], ["Program Studi", student.program], ["Fakultas", student.faculty], ["Institusi", `${session.institution.name} (${session.institution.code})`]]} />
        ) : <Notice tone="warning">{studentError || "Data mahasiswa tidak tersedia untuk tagihan ini."}</Notice>}
      </section>

      <section aria-labelledby="inv-tx">
        <h3 id="inv-tx" className="mb-3 text-sm font-bold text-slate-900">Riwayat Transaksi</h3>
        {txLoading ? <Loading label="Memuat transaksi…" /> : txError ? <div className="-m-5"><ErrorBox title="Transaksi tidak dapat dimuat" message={txError} retry={retryTx} /></div> : txs.length ? (
          <ul className="space-y-3">
            {txs.map((t) => (
              <li key={t.id} className="rounded-xl border border-slate-200 p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold text-slate-900">{eventLabel(t.type)}</p><Badge status={t.resultingStatus} /></div>
                <p className="mt-1.5 text-slate-700">{rupiah(t.amount)} · {fmtDateTime(t.occurredAt)}</p>
                <p className="mt-1 break-all font-mono text-xs text-slate-600">Referensi {t.id} · Event {t.eventId}</p>
              </li>
            ))}
          </ul>
        ) : <p className="rounded-xl border border-dashed border-slate-300 p-4 text-sm text-slate-600">Belum ada transaksi. Status tagihan berubah setelah event pembayaran yang terverifikasi diterima dari gateway pembayaran.</p>}
      </section>
    </div>
  );
}
