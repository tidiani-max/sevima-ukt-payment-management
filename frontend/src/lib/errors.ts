/**
 * Turns anything thrown by a service into a message that is safe and useful to show to a person.
 * Raw technical text (stack traces, "Failed to fetch", HTTP status text) is never passed through.
 * Duck-typed on `status` so it works with the ApiError thrown by services/api.ts without importing it.
 */
export function friendlyError(e: unknown, overrides: Partial<Record<number, string>> = {}): string {
  const status = typeof (e as { status?: unknown })?.status === "number" ? (e as { status: number }).status : undefined;
  if (status !== undefined && overrides[status]) return overrides[status]!;
  const serverMessage = e instanceof Error ? e.message.trim() : "";

  if (status === undefined) {
    return e instanceof TypeError ? "Tidak dapat terhubung ke server. Periksa koneksi Anda lalu coba lagi." : "Terjadi kesalahan. Silakan coba lagi.";
  }
  if (status === 401) return "Sesi Anda telah berakhir. Silakan masuk kembali.";
  if (status === 403) return "Anda tidak memiliki izin untuk melakukan tindakan ini.";
  if (status === 404) return "Informasi yang diminta tidak ditemukan.";
  if (status === 429) return serverMessage || "Terlalu banyak permintaan. Harap tunggu sejenak lalu coba lagi.";
  if (status === 400 || status === 409 || status === 422) return serverMessage || "Permintaan tidak dapat diselesaikan. Periksa detailnya lalu coba lagi.";
  if (status >= 500) return "Server mengalami masalah. Silakan coba lagi beberapa saat lagi.";
  return "Permintaan tidak dapat diselesaikan. Silakan coba lagi.";
}
