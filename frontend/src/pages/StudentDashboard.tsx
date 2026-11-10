import { useMemo } from "react";
import { Badge, Btn, Card, DetailGrid, DueHint, Empty, ErrorBox, Notice, PageHeader, SectionTitle, Skeleton } from "../components/shared";
import { StatCard, Icon } from "../components/ui";
import { TransactionTable } from "../components/TransactionTable";
import { fmtDate, fmtDateTime, rupiah, semesterLabel } from "../lib/format";
import { dueLabel, dueState, pickCurrentInvoice, summarizeInvoices } from "../lib/invoices";
import { paymentFor, sortTransactions } from "../lib/transactions";
import { useAsync } from "../lib/useAsync";
import { listInvoices } from "../services/invoice.service";
import { getMyProfile } from "../services/student.service";
import { listTransactions } from "../services/transaction.service";
import type { Invoice, PaymentStatus, Session } from "../types";
import type { PageKey } from "../App";

const ACCENT: Record<PaymentStatus, string> = { PAID: "border-l-emerald-600", UNPAID: "border-l-orange-500", EXPIRED: "border-l-red-600" };

export function StudentDashboard({ session, go }: { session: Session; go: (p: PageKey) => void }) {
  const me = useAsync(() => getMyProfile(session), [session]);
  const inv = useAsync(() => listInvoices(session), [session]);
  const trx = useAsync(() => listTransactions(session), [session]);

  const invoices = useMemo(() => inv.data ?? [], [inv.data]);
  const s = useMemo(() => summarizeInvoices(invoices), [invoices]);
  const current = useMemo(() => pickCurrentInvoice(invoices), [invoices]);
  const recent = useMemo(() => sortTransactions(trx.data ?? []).slice(0, 5), [trx.data]);
  const paidAt = current && current.status === "PAID" ? paymentFor(current.id, trx.data ?? [])?.occurredAt : undefined;

  return (
    <>
      <PageHeader eyebrow={session.institution.name} title={`Selamat datang, ${session.user.name}`} text="Ringkasan tagihan UKT dan riwayat pembayaran Anda." />

      <Card className="mb-5">
        <SectionTitle>Informasi Mahasiswa</SectionTitle>
        <div className="p-5 sm:p-6">
          {me.loading ? <Skeleton className="h-24" /> : me.error ? <div className="-m-5"><ErrorBox title="Profil Anda tidak dapat dimuat" message={me.error} retry={me.reload} /></div> : me.data ? (
            <DetailGrid items={[
              ["Nama Mahasiswa", me.data.name], ["NIM", <span key="n" className="font-mono">{me.data.nim}</span>],
              ["Program Studi", me.data.program], ["Fakultas", me.data.faculty], ["Institusi", session.institution.name],
              ["Semester Akademik", current ? semesterLabel(current.semester) : "—"],
            ]} />
          ) : null}
        </div>
      </Card>

      {inv.error ? <Card><ErrorBox title="Tagihan Anda tidak dapat dimuat" message={inv.error} retry={inv.reload} /></Card> : inv.loading ? (
        <div role="status" aria-busy="true"><span className="sr-only">Memuat tagihan…</span><Skeleton className="h-36" /><Skeleton className="mt-5 h-64" /></div>
      ) : (
        <>
          <section aria-label="Ikhtisar tagihan" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Total Tagihan" value={String(s.total)} detail={s.total ? `${rupiah(s.billed)} total ditagihkan` : "Belum ada tagihan yang diterbitkan"} icon="tagihan" color="blue" />
            <StatCard title="Tagihan Lunas" value={String(s.paid)} detail={s.paid ? `${rupiah(s.collected)} telah dibayar` : "Belum ada pembayaran"} icon="centang" color="green" />
            <StatCard title="Tagihan Belum Bayar" value={String(s.unpaid)} detail={s.unpaid ? `${rupiah(s.outstanding)} menunggu pembayaran` : "Tidak ada yang menunggu pembayaran"} icon="clock" color="orange" />
            <StatCard title="Tagihan Kedaluwarsa" value={String(s.expired)} detail={s.expired ? "Hubungi bagian keuangan" : "Tidak ada tagihan kedaluwarsa"} icon="peringatan" color="red" />
          </section>

          <section aria-labelledby="current-title" className="mt-5">
            {current ? (
              <Card className={`border-l-4 p-5 sm:p-6 ${ACCENT[current.status]}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 id="current-title" className="text-base font-bold text-slate-900">Tagihan UKT Saat Ini</h2>
                    <p className="mt-1 text-sm text-slate-600">{semesterLabel(current.semester)}</p>
                  </div>
                  <Badge status={current.status} />
                </div>
                <p className="mt-4 text-3xl font-bold tracking-tight text-slate-900">{rupiah(current.amount)}</p>
                <div className="mt-5"><DetailGrid items={[
                  ["Nomor Tagihan", current.invoiceNumber], ["Semester Akademik", semesterLabel(current.semester)],
                  ["Tanggal Terbit", fmtDate(current.issuedAt)], ["Tanggal Kedaluwarsa", <>{fmtDate(current.expiresAt)}<DueHint invoice={current} /></>],
                  ...(paidAt ? [["Dibayar Pada", fmtDateTime(paidAt)] as [string, string]] : []),
                ]} /></div>
                <InvoiceNotice invoice={current} />
                {s.unpaid > 1 && <Notice tone="warning" className="mt-3" title={`Anda memiliki ${s.unpaid} tagihan belum bayar`}>Tagihan yang ditampilkan adalah yang paling cepat kedaluwarsa. Lihat semuanya di Tagihan Saya.</Notice>}
                <p className="mt-4 text-xs text-slate-600">Portal ini hanya menampilkan status tagihan dan tidak memproses pembayaran. Status diperbarui setelah gateway pembayaran mengonfirmasi pembayaran.</p>
              </Card>
            ) : (
              <Card><h2 id="current-title" className="sr-only">Tagihan UKT Saat Ini</h2><Empty title="Belum ada tagihan UKT" text="Institusi Anda belum menerbitkan tagihan atas nama Anda. Tagihan akan muncul di sini setelah diterbitkan." /></Card>
            )}
          </section>

          <Card className="mt-5 overflow-hidden">
            <SectionTitle action={<Btn onClick={() => go("my-transactions")}>Lihat semua<Icon name="panah" size={15} /></Btn>}>Riwayat Transaksi</SectionTitle>
            {trx.loading ? <div className="p-5"><Skeleton className="h-24" /></div> : trx.error ? <ErrorBox title="Transaksi Anda tidak dapat dimuat" message={trx.error} retry={trx.reload} /> : (
              <TransactionTable rows={recent} label="Transaksi terbaru" empty={<Empty title="Belum ada transaksi" text="Transaksi akan muncul di sini setelah event pembayaran tercatat untuk salah satu tagihan Anda." />} />
            )}
          </Card>
          <div className="mt-5"><Btn primary onClick={() => go("my-invoices")}>Lihat semua tagihan</Btn></div>
        </>
      )}
    </>
  );
}

/** Plain-language status guidance. An unpaid invoice past its date is never relabelled as expired or paid. */
function InvoiceNotice({ invoice }: { invoice: Invoice }) {
  const due = dueState(invoice);
  const when = fmtDate(invoice.expiresAt);
  if (invoice.status === "PAID") return <Notice tone="success" className="mt-5" title="Tagihan ini telah dibayar">Tidak diperlukan tindakan lebih lanjut untuk tagihan ini.</Notice>;
  if (invoice.status === "EXPIRED") return <Notice tone="danger" className="mt-5" title="Tagihan ini telah kedaluwarsa">Tagihan ini kedaluwarsa pada {when}. Silakan hubungi bagian keuangan institusi Anda.</Notice>;
  if (due?.kind === "overdue") return <Notice tone="danger" className="mt-5" title={dueLabel(due)}>Tanggal kedaluwarsa ({when}) telah terlewat. Tagihan tetap berstatus Belum Bayar sampai sistem pembayaran mengonfirmasi kedaluwarsanya. Silakan hubungi bagian keuangan.</Notice>;
  if (due) return <Notice tone="warning" className="mt-5" title={dueLabel(due)}>Tagihan ini kedaluwarsa pada {when}. Harap selesaikan pembayaran Anda sebelum tanggal tersebut.</Notice>;
  return <Notice tone="info" className="mt-5" title="Tagihan ini belum dibayar">Harap selesaikan pembayaran Anda sebelum {when}.</Notice>;
}
