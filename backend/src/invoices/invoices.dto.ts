import { IsInt, IsString, IsUUID, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';

export class CreateInvoiceDto {
  @IsUUID() studentId!: string;
  @IsString() @Matches(/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/, { message: 'invoiceNumber may contain letters, digits, ".", "_", "-", "/" (max 64 characters).' }) invoiceNumber!: string;
  /** Semester API value, e.g. "Ganjil 2026/2027". Must exist at the caller's institution. */
  @IsString() @MinLength(1) @MaxLength(64) semester!: string;
  @IsInt({ message: 'amount must be a whole number of rupiah.' }) @Min(1, { message: 'amount must be greater than zero.' }) @Max(1_000_000_000_000) amount!: number;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'issuedAt must be a date in YYYY-MM-DD format.' }) issuedAt!: string;
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'expiresAt must be a date in YYYY-MM-DD format.' }) expiresAt!: string;
}
