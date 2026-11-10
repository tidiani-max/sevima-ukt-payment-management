import { useMemo, useState } from "react";
import { Badge, Btn, Card, DetailGrid, Drawer, Empty, ErrorBox, FilterChips, PageHeader, Pagination, SearchInput, TableSkeleton } from "../components/shared";
import { TransactionTable } from "../components/TransactionTable";
import { Icon } from "../components/ui";
import { downloadCsv, eventLabel, fmtDateTime, rupiah, statusLabel, TRANSACTION_RESULT } from "../lib/format";
import { matchesTransactionQuery, sortTransactions } from "../lib/transactions";
import { paginate } from "../lib/table";
import { useAsync } from "../lib/useAsync";
import { listInvoices } from "../services/invoice.service";
import { listStudents } from "../services/student.service";
import { listTransactions } from "../services/transaction.service";
import type { PaymentStatus, Session, Transaction } from "../types";

const PAGE_SIZE = 10;
type Filter = "ALL" | Extract<PaymentStatus, "PAID" | "EXPIRED">;

export function Transactions({ session }: { session: Session }) {
  const admin = session.user.role === "ADMIN";
  const trx = useAsync(() => listTransactions(session), [session]);
  // Student names are only resolved for admins; a student only sees their own transactions.
  const inv = useAsync(() => (admin ? listInvoices(session) : Promise.resolve([])), [session, admin]);
  const stu = useAsync(() => (admin ? listStudents(session) : Promise.resolve([])), [session, admin]);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Transaction | null>(null);

  const studentName = useMemo(() => {
    const students = new Map((stu.data ?? []).map((s) => [s.id, s]));
    const invoices = new Map((inv.data ?? []).map((i) => [i.id, i]));
    return (t: Transaction) => { const i = invoices.get(t.invoiceId); return i ? students.get(i.studentId)?.name : undefined; };
  }, [stu.data, inv.data]);

  const all = useMemo(() => sortTransactions(trx.data ?? []), [trx.data]);
  const filtered = useMemo(() => all.filter((t) => (filter === "ALL" || t.resultingStatus === filter) && matchesTransactionQuery(t, admin ? studentName(t) : undefined, query)), [all, filter, query, studentName, admin]);
  const pg = paginate(filtered, page, PAGE_SIZE);
  const count = (f: Filter) => (f === "ALL" ? all.length : all.filter((t) => t.resultingStatus === f).length);

  const loading = trx.loading || inv.loading || stu.loading;
  const error = trx.error || inv.error || stu.error;
  const reload = () => { trx.reload(); inv.reload(); stu.reload(); };
  const filtersActive = filter !== "ALL" || query.trim() !== "";

  return (
    <>
      <PageHeader eyebrow={admin ? `Institusi ${session.institution.code}` : "Akun Saya"} title="Riwayat Transaksi"
        text={admin ? "Transaksi yang tercatat dari event pembayaran terverifikasi yang dikirim oleh gateway pembayaran." : "Event pembayaran yang tercatat untuk tagihan Anda."}
        action={<Btn disabled={!filtered.length} onClick={() => downloadCsv("transactions.csv", [
          ["Referensi", "Tanggal", "Nomor Tagihan", ...(admin ? ["Mahasiswa"] : []), "Tipe", "Jumlah (Rp)", "Status", "ID Event Gateway"],
          ...filtered.map((t) => [t.id, t.occurredAt, t.invoiceNumber, ...(admin ? [studentName(t) ?? ""] : []), eventLabel(t.type), t.amount, statusLabel(t.resultingStatus), t.eventId]),
        ])}><Icon name="unduh" size={16} />Ekspor CSV</Btn>} />
      <Card>
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
          <FilterChips<Filter> label="Filter berdasarkan status" value={filter} onChange={(f) => { setFilter(f); setPage(1); }}
            options={[{ value: "ALL", label: "Semua", count: count("ALL") }, { value: "PAID", label: "Lunas", count: count("PAID") }, { value: "EXPIRED", label: "Kedaluwarsa", count: count("EXPIRED") }]} />
          <SearchInput className="lg:w-80" value={query} onChange={(v) => { setQuery(v); setPage(1); }} label="Cari transaksi"
            placeholder={admin ? "Cari referensi, tagihan, atau mahasiswa" : "Cari referensi atau nomor tagihan"} />
        </div>
        {loading ? <TableSkeleton label="Memuat transaksi…" /> : error ? <ErrorBox title="Transaksi tidak dapat dimuat" message={error} retry={reload} /> : (
          <>
            <TransactionTable rows={pg.rows} label="Riwayat transaksi" studentNameOf={admin ? studentName : undefined} onSelect={setSelected}
              empty={filtersActive && all.length ? (
                <Empty title="Tidak ada transaksi yang cocok dengan pencarian Anda" text="Coba kata kunci atau status lain." action={<Btn onClick={() => { setFilter("ALL"); setQuery(""); setPage(1); }}>Hapus filter</Btn>} />
              ) : (
                <Empty title="Belum ada transaksi" text={admin ? "Transaksi akan muncul setelah gateway pembayaran mengirim event yang terverifikasi." : "Anda belum memiliki transaksi. Transaksi akan muncul di sini setelah event pembayaran tercatat untuk salah satu tagihan Anda."} />
              )} />
            <Pagination {...pg} onPage={setPage} />
          </>
        )}
      </Card>
      {selected && (
        <Drawer title={`Transaksi ${selected.id}`} subtitle={eventLabel(selected.type)} onClose={() => setSelected(null)}>
          <DetailGrid items={[
            ["Referensi", <span key="r" className="font-mono">{selected.id}</span>], ["Status Tagihan Setelah Transaksi", <Badge key="s" status={selected.resultingStatus} />],
            ["Nomor Tagihan", selected.invoiceNumber], ...(admin ? [["Mahasiswa", studentName(selected) ?? "—"] as [string, string]] : []),
            ["Event Pembayaran", eventLabel(selected.type)], ["Hasil Transaksi", TRANSACTION_RESULT[selected.type]], ["Jumlah", rupiah(selected.amount)], ["Institusi", `${session.institution.name} (${session.institution.code})`], ["Tanggal", fmtDateTime(selected.occurredAt, true)],
            ["ID Event Gateway", <span key="e" className="font-mono">{selected.eventId}</span>],
          ]} />
        </Drawer>
      )}
    </>
  );
}
