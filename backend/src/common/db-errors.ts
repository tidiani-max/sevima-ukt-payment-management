/** Extracts the violated unique constraint/index/columns from a Prisma P2002 raised through the pg driver adapter. */
export function uniqueViolation(e: unknown): string | undefined {
  const err = e as { code?: string; message?: string; meta?: { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } } } };
  if (err?.code !== 'P2002') return undefined;
  const c = err.meta?.driverAdapterError?.cause?.constraint;
  const t = err.meta?.target;
  return [c?.index, ...(c?.fields ?? []), ...(Array.isArray(t) ? t : [t])].filter(Boolean).join(',') + ' ' + (err.message ?? '');
}
