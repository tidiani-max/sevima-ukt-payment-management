import { useMemo, useState } from "react";
import { Card, Empty, ErrorBox, PageHeader, Pagination, Btn, SearchInput, TableSkeleton } from "../components/shared";
import { DataTable, type Column } from "../components/DataTable";
import { matchesTerm, paginate } from "../lib/table";
import { useAsync } from "../lib/useAsync";
import { listStudents } from "../services/student.service";
import type { Session, Student } from "../types";

const PAGE_SIZE = 10;
const columns: Column<Student>[] = [
  { key: "name", header: "Nama", cell: (s) => s.name },
  { key: "nim", header: "NIM", cell: (s) => <span className="font-mono text-[13px]">{s.nim}</span> },
  { key: "program", header: "Program Studi", cell: (s) => s.program },
  { key: "faculty", header: "Fakultas", cell: (s) => s.faculty },
];

export function StudentsPage({ session }: { session: Session }) {
  const st = useAsync(() => listStudents(session), [session]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const all = useMemo(() => st.data ?? [], [st.data]);
  const filtered = useMemo(() => all.filter((s) => matchesTerm(query, s.name, s.nim, s.program, s.faculty)), [all, query]);
  const pg = paginate(filtered, page, PAGE_SIZE);

  return (
    <>
      <PageHeader eyebrow={`Institusi ${session.institution.code}`} title="Mahasiswa" text="Mahasiswa yang terdaftar di institusi Anda." />
      <Card>
        <div className="border-b border-slate-100 p-4 sm:p-5">
          <SearchInput className="sm:w-96" value={query} onChange={(v) => { setQuery(v); setPage(1); }} label="Cari mahasiswa" placeholder="Cari berdasarkan nama, NIM, atau program studi" />
        </div>
        {st.loading ? <TableSkeleton label="Memuat data mahasiswa…" /> : st.error ? <ErrorBox title="Data mahasiswa tidak dapat dimuat" message={st.error} retry={st.reload} /> : (
          <>
            <DataTable columns={columns} rows={pg.rows} rowKey={(s) => s.id} label="Mahasiswa"
              empty={query.trim() && all.length ? (
                <Empty title="Tidak ada mahasiswa yang cocok dengan pencarian Anda" text="Periksa ejaan, atau coba nama, NIM, atau program studi." action={<Btn onClick={() => { setQuery(""); setPage(1); }}>Hapus pencarian</Btn>} />
              ) : <Empty title="Belum ada mahasiswa" text="Mahasiswa yang terdaftar di institusi Anda akan muncul di sini." />} />
            <Pagination {...pg} onPage={setPage} />
          </>
        )}
      </Card>
    </>
  );
}
