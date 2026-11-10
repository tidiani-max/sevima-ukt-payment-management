import { Badge, Btn } from "./shared";
import { DataTable, type Column } from "./DataTable";
import { eventLabel, fmtDateTime, rupiah } from "../lib/format";
import type { Transaction } from "../types";

/** Transaction rows, reused by the admin overview, the transaction history page and the student dashboard. */
export function TransactionTable({ rows, label, studentNameOf, onSelect, empty }: {
  rows: Transaction[]; label: string; studentNameOf?: (t: Transaction) => string | undefined; onSelect?: (t: Transaction) => void; empty: React.ReactNode;
}) {
  const columns: Column<Transaction>[] = [
    { key: "ref", header: "Referensi", cell: (t) => <span className="font-mono text-[13px]">{t.id}</span> },
    { key: "date", header: "Tanggal", nowrap: true, cell: (t) => fmtDateTime(t.occurredAt) },
    { key: "invoice", header: "Nomor Tagihan", cell: (t) => t.invoiceNumber },
    ...(studentNameOf ? [{ key: "student", header: "Mahasiswa", cell: (t: Transaction) => studentNameOf(t) ?? "—" }] : []),
    { key: "type", header: "Event Pembayaran", cell: (t) => eventLabel(t.type) },
    { key: "amount", header: "Jumlah", nowrap: true, cell: (t) => <span className="font-semibold">{rupiah(t.amount)}</span> },
    { key: "status", header: "Status Tagihan", mobileTop: true, cell: (t) => <Badge status={t.resultingStatus} /> },
    ...(onSelect ? [{
      key: "actions", header: "Aksi", isActions: true,
      cell: (t: Transaction) => <Btn onClick={() => onSelect(t)} aria-label={`Lihat detail transaksi ${t.id}`}>Lihat</Btn>,
    }] : []),
  ];
  return <DataTable columns={columns} rows={rows} rowKey={(t) => t.id} label={label} onRowClick={onSelect} cardsBelow="xl" empty={empty} />;
}
