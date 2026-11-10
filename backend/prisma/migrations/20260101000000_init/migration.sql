-- Initial schema. Hand-maintained to match prisma/schema.prisma, plus database-level business invariants
-- that Prisma cannot express (CHECK constraints, partial unique index). Apply with `prisma migrate deploy`.

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'STUDENT');
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'EXPIRED');
CREATE TYPE "TransactionType" AS ENUM ('payment.success', 'payment.expired');
CREATE TYPE "ProcessingStatus" AS ENUM ('PROCESSED', 'DUPLICATE', 'INVALID_SIGNATURE', 'INVALID_PAYLOAD', 'INVOICE_NOT_FOUND', 'AMOUNT_MISMATCH', 'INVALID_STATE', 'REQUIRES_REVIEW', 'EVENT_CONFLICT');

-- CreateTable
CREATE TABLE "Institution" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "hmacSecretEnc" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Institution_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Student" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "nim" VARCHAR(32) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "program" VARCHAR(200) NOT NULL,
    "faculty" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Student_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studentId" UUID,
    "email" VARCHAR(254) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "role" "Role" NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Semester" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "value" VARCHAR(64) NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "current" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Semester_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Invoice" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "studentId" UUID NOT NULL,
    "semesterId" UUID NOT NULL,
    "invoiceNumber" VARCHAR(64) NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
    "issuedAt" DATE NOT NULL,
    "expiresAt" DATE NOT NULL,
    "paidAt" TIMESTAMPTZ(3),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebhookEvent" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "institutionCode" VARCHAR(32) NOT NULL,
    "eventId" VARCHAR(100),
    "eventType" VARCHAR(64),
    "invoiceNumber" VARCHAR(64),
    "amount" BIGINT,
    "occurredAt" TIMESTAMPTZ(3),
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rawBody" TEXT NOT NULL,
    "signature" VARCHAR(200),
    "signatureValid" BOOLEAN NOT NULL,
    "processingStatus" "ProcessingStatus" NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "errorMessage" TEXT,
    "requestId" VARCHAR(64),
    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Transaction" (
    "id" UUID NOT NULL,
    "institutionId" UUID NOT NULL,
    "invoiceId" UUID NOT NULL,
    "webhookEventId" UUID NOT NULL,
    "eventId" VARCHAR(100) NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "resultingStatus" "PaymentStatus" NOT NULL,
    "occurredAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "PlatformSecurityEvent" (
    "id" UUID NOT NULL,
    "receivedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "institutionCodeClaimed" VARCHAR(64),
    "reason" VARCHAR(64) NOT NULL,
    "httpStatus" INTEGER NOT NULL,
    "bodySnippet" TEXT NOT NULL,
    "sourceIp" VARCHAR(64),
    "requestId" VARCHAR(64),
    CONSTRAINT "PlatformSecurityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "session" (
    "sid" VARCHAR NOT NULL,
    "sess" JSON NOT NULL,
    "expire" TIMESTAMP(6) NOT NULL,
    CONSTRAINT "session_pkey" PRIMARY KEY ("sid")
);

CREATE TABLE "RateLimit" (
    "key" VARCHAR(200) NOT NULL,
    "count" INTEGER NOT NULL,
    "windowStart" TIMESTAMPTZ(3) NOT NULL,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "Institution_code_key" ON "Institution"("code");
CREATE UNIQUE INDEX "Student_institutionId_nim_key" ON "Student"("institutionId", "nim");
CREATE UNIQUE INDEX "Student_id_institutionId_key" ON "Student"("id", "institutionId");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_studentId_key" ON "User"("studentId");
CREATE INDEX "User_institutionId_idx" ON "User"("institutionId");
CREATE UNIQUE INDEX "Semester_institutionId_value_key" ON "Semester"("institutionId", "value");
CREATE UNIQUE INDEX "Semester_id_institutionId_key" ON "Semester"("id", "institutionId");
CREATE UNIQUE INDEX "Invoice_institutionId_invoiceNumber_key" ON "Invoice"("institutionId", "invoiceNumber");
CREATE UNIQUE INDEX "Invoice_id_institutionId_key" ON "Invoice"("id", "institutionId");
CREATE INDEX "Invoice_institutionId_status_createdAt_idx" ON "Invoice"("institutionId", "status", "createdAt" DESC);
CREATE INDEX "Invoice_institutionId_studentId_idx" ON "Invoice"("institutionId", "studentId");
CREATE UNIQUE INDEX "WebhookEvent_id_institutionId_key" ON "WebhookEvent"("id", "institutionId");
CREATE INDEX "WebhookEvent_institutionId_receivedAt_idx" ON "WebhookEvent"("institutionId", "receivedAt" DESC);
CREATE INDEX "WebhookEvent_institutionId_eventId_idx" ON "WebhookEvent"("institutionId", "eventId");
CREATE UNIQUE INDEX "Transaction_institutionId_eventId_key" ON "Transaction"("institutionId", "eventId");
CREATE UNIQUE INDEX "Transaction_webhookEventId_institutionId_key" ON "Transaction"("webhookEventId", "institutionId");
CREATE INDEX "Transaction_institutionId_occurredAt_idx" ON "Transaction"("institutionId", "occurredAt" DESC);
CREATE INDEX "Transaction_invoiceId_idx" ON "Transaction"("invoiceId");
CREATE INDEX "PlatformSecurityEvent_receivedAt_idx" ON "PlatformSecurityEvent"("receivedAt" DESC);
CREATE INDEX "IDX_session_expire" ON "session"("expire");

-- AddForeignKey (composite keys keep every child row inside the tenant of its parent)
ALTER TABLE "Student" ADD CONSTRAINT "Student_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User" ADD CONSTRAINT "User_studentId_institutionId_fkey" FOREIGN KEY ("studentId", "institutionId") REFERENCES "Student"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Semester" ADD CONSTRAINT "Semester_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_studentId_institutionId_fkey" FOREIGN KEY ("studentId", "institutionId") REFERENCES "Student"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_semesterId_institutionId_fkey" FOREIGN KEY ("semesterId", "institutionId") REFERENCES "Semester"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_institutionId_fkey" FOREIGN KEY ("institutionId") REFERENCES "Institution"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_invoiceId_institutionId_fkey" FOREIGN KEY ("invoiceId", "institutionId") REFERENCES "Invoice"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_webhookEventId_institutionId_fkey" FOREIGN KEY ("webhookEventId", "institutionId") REFERENCES "WebhookEvent"("id", "institutionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------------------------------------------
-- Business invariants enforced by the database (not expressible in schema.prisma)
-- ---------------------------------------------------------------------------------------------------------------
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_dates_ordered" CHECK ("expiresAt" >= "issuedAt");
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paid_consistency" CHECK (("status" = 'PAID') = ("paidAt" IS NOT NULL));
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "User" ADD CONSTRAINT "User_role_student_link" CHECK (("role" = 'STUDENT') = ("studentId" IS NOT NULL));
ALTER TABLE "User" ADD CONSTRAINT "User_email_lowercase" CHECK ("email" = lower("email"));

-- A student is billed once per semester: only one non-EXPIRED invoice per (institution, student, semester).
-- An EXPIRED invoice may be re-issued.
CREATE UNIQUE INDEX "Invoice_one_active_per_student_semester"
    ON "Invoice"("institutionId", "studentId", "semesterId") WHERE "status" <> 'EXPIRED';
