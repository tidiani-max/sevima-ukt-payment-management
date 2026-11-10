import { useMemo } from "react";
import { Card, ErrorBox, Empty, PageHeader, SectionTitle, Skeleton } from "../components/shared";
import { StatCard, Icon } from "../components/ui";
import { TransactionTable } from "../components/TransactionTable";
import { rupiah } from "../lib/format";
import { summarizeInvoices } from "../lib/invoices";
import { sortTransactions } from "../lib/transactions";
import { useAsync } from "../lib/useAsync";
import { listInvoices } from "../services/invoice.service";
import { listStudents } from "../services/student.service";
import { listTransactions } from "../services/transaction.service";
import type { Session } from "../types";
import type { PageKey } from "../App";

const pct = (n: number, total: number) => (total ? Math.round((n / total) * 100) : 0);

/** Financial admin dashboard. Every figure is computed from the invoices/transactions returned by the services. */
export function Overview({ session, go }: { session: Session; go: (p: PageKey) => void }) {
  const inv = useAsync(() => listInvoices(session), [session]);
  const trx = useAsync(() => listTransactions(session), [session]);
  const stu = useAsync(() => listStudents(session), [session]);
  const loading = inv.loading || trx.loading || stu.loading;
  const error = inv.error || trx.error || stu.error;
  const reload = () => { inv.reload(); trx.reload(); stu.reload(); };

  const s = useMemo(() => summarizeInvoices(inv.data ?? []), [inv.data]);
  const recent = useMemo(() => sortTransactions(trx.data ?? []).slice(0, 5), [trx.data]);
  const studentsById = useMemo(() => new Map((stu.data ?? []).map((x) => [x.id, x])), [stu.data]);
  const invoiceById = useMemo(() => new Map((inv.data ?? []).map((x) => [x.id, x])), [inv.data]);

  return (
    <>
      <PageHeader eyebrow={session.institution.name} title="Ringkasan" text={`Selamat datang kembali, ${session.user.name}. Berikut kondisi terkini tagihan UKT di institusi Anda.`} />
      {error ? <Card><ErrorBox title="Dasbor tidak dapat dimuat" message={error} retry={reload} /></Card> : loading ? (
        <div role="status" aria-busy="true">
          <span className="sr-only">Memuat dasbor…</span>
          <div className="grid gap-4 sm:grid-cols-2">{[0, 1].map((k) => <Skeleton key={k} className="h-32" />)}</div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((k) => <Skeleton key={k} className="h-36" />)}</div>
          <Skeleton className="mt-5 h-72" />
        </div>
      ) : (
        <>
          <section aria-label="Ringkasan jumlah" className="grid gap-4 sm:grid-cols-2">
            <StatCard title="Total Dana Terkumpul" value={rupiah(s.collected)} detail={`Dari ${s.paid} tagihan lunas`} icon="centang" color="green" />
            <StatCard title="Total Dana Belum Terbayar" value={rupiah(s.outstanding)} detail={`Dari ${s.unpaid} tagihan belum bayar · Tagihan kedaluwarsa (${rupiah(s.expiredAmount)}) tidak termasuk`} icon="dompet" color="orange" />
          </section>
          <section aria-label="Jumlah tagihan" className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Tagihan" value={String(s.total)} detail={`${rupiah(s.billed)} total ditagihkan`} icon="tagihan" color="blue" />
            <StatCard title="Total Tagihan Lunas" value={String(s.paid)} detail={`${pct(s.paid, s.total)}% dari seluruh tagihan`} icon="centang" color="green" />
            <StatCard title="Total Tagihan Belum Bayar" value={String(s.unpaid)} detail={`${pct(s.unpaid, s.total)}% dari seluruh tagihan`} icon="clock" color="orange" />
            <StatCard title="Total Tagihan Kedaluwarsa" value={String(s.expired)} detail={`${pct(s.expired, s.total)}% dari seluruh tagihan`} icon="peringatan" color="red" />
          </section>

          {s.total > 0 && (
            <Card className="mt-5 p-5 sm:p-6">
              <h2 className="text-base font-bold text-slate-900">Distribusi status tagihan</h2>
              <div role="img" aria-label={`${s.paid} lunas, ${s.unpaid} belum bayar, ${s.expired} kedaluwarsa dari ${s.total} tagihan`} className="mt-4 flex h-3 overflow-hidden rounded-full bg-slate-100">
                <span className="bg-emerald-600" style={{ width: `${pct(s.paid, s.total)}%` }} />
                <span className="bg-orange-500" style={{ width: `${pct(s.unpaid, s.total)}%` }} />
                <span className="bg-red-600" style={{ width: `${pct(s.expired, s.total)}%` }} />
              </div>
              <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-700">
                <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-emerald-600" />Lunas: {s.paid}</li>
                <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-orange-500" />Belum Bayar: {s.unpaid}</li>
                <li className="flex items-center gap-2"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-red-600" />Kedaluwarsa: {s.expired}</li>
              </ul>
            </Card>
          )}

          <Card className="mt-5 overflow-hidden">
            <SectionTitle action={<button type="button" onClick={() => go("transactions")} className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-[#0f4ed8] hover:bg-blue-50">Lihat semua<Icon name="panah" size={15} /></button>}>Aktivitas Pembayaran Terbaru</SectionTitle>
            <TransactionTable rows={recent} label="Aktivitas pembayaran terbaru"
              studentNameOf={(t) => { const i = invoiceById.get(t.invoiceId); return i ? studentsById.get(i.studentId)?.name : undefined; }}
              empty={<Empty title="Belum ada aktivitas pembayaran" text="Transaksi akan muncul di sini setelah gateway pembayaran mengirim event yang terverifikasi." />} />
          </Card>
        </>
      )}
    </>
  );
}
