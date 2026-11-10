import { expect, test, type Page } from "@playwright/test";

const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "demosevima";
const NUMBER = `UKT-E2E-${Date.now().toString().slice(-8)}`;
const AMOUNT = "6500000";
const UM_ADMIN = "admin.keuangan@um.ac.id";
const UB_ADMIN = "admin.keuangan@ub.ac.id";
const NADIA = "nadia.putri@student.um.ac.id";

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Kata Sandi").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
  // Only wait for the signed-in UI when the credentials are valid (the wrong-password test passes a different password).
  if (password === PASSWORD) await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();
}
const signOut = (page: Page) => page.getByRole("button", { name: "Keluar" }).click();
const goTo = (page: Page, name: string) => page.getByRole("navigation", { name: "Navigasi utama" }).getByRole("button", { name, exact: true }).click();
const iso = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

test.describe("sign-in", () => {
  test("wrong password shows a friendly error and stays on the sign-in screen", async ({ page }) => {
    await signIn(page, UM_ADMIN, "definitely-wrong");
    await expect(page.getByRole("alert")).toContainText("Email atau kata sandi salah.");
    await expect(page.getByRole("heading", { name: "Masuk ke akun Anda" })).toBeVisible();
  });
});

test.describe.serial("UKT payment lifecycle (admin -> mock gateway -> student)", () => {
  test("administrator signs in, the session survives a browser refresh, and an invoice is created", async ({ page }) => {
    await signIn(page, UM_ADMIN);
    // "Admin Keuangan" is also a role-tab label on the login screen, so it proves nothing.
    // Wait for something that only exists once signed in, before reloading (reload aborts an in-flight login).
    const mainNav = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(mainNav).toBeVisible();
    await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();
    await page.reload(); // HttpOnly session cookie + GET /auth/me => still signed in
    await expect(mainNav).toBeVisible();
    await expect(page.getByRole("button", { name: "Keluar" })).toBeVisible();

    await goTo(page, "Tagihan UKT");
    await page.getByRole("button", { name: "Buat Tagihan" }).click();
    const dialog = page.getByRole("dialog");
    const nadiaId = await dialog.getByLabel("Mahasiswa").locator("option", { hasText: "Nadia" }).first().getAttribute("value");
    await dialog.getByLabel("Mahasiswa").selectOption(nadiaId!);
    await dialog.getByLabel("Nomor Tagihan").fill(NUMBER);
    await dialog.getByLabel("Jumlah UKT (Rp)").fill(AMOUNT);
    await dialog.getByLabel("Tanggal Terbit").fill(iso(0));
    await dialog.getByLabel("Tanggal Kedaluwarsa").fill(iso(60));

    // A student can be billed once per semester, so try each semester until the server accepts one (fresh stacks accept the first).
    const values = await dialog.getByLabel("Semester Akademik").locator("option").evaluateAll((o) => (o as HTMLOptionElement[]).map((x) => x.value).filter(Boolean));
    let created = false;
    for (const v of values) {
      await dialog.getByLabel("Semester Akademik").selectOption(v);
      // Wait for the real POST /api/invoices answer. (Locator.isVisible() ignores its timeout option and returns
      // immediately, so polling the toast with it raced the network call and skipped past a successful create.)
      const [response] = await Promise.all([
        page.waitForResponse((r) => r.request().method() === "POST" && new URL(r.url()).pathname.endsWith("/invoices")),
        dialog.getByRole("button", { name: "Buat Tagihan" }).click(),
      ]);
      if (response.ok()) { created = true; break; }
      await expect(dialog.getByRole("button", { name: "Buat Tagihan" })).toBeEnabled(); // rejected (e.g. 409): form is usable again, try the next semester
    }
    expect(created).toBe(true);
    await expect(page.getByText(`Tagihan ${NUMBER} berhasil dibuat`)).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(NUMBER) })).toContainText("Belum Bayar");
  });

  test("the mock gateway pays it through the real webhook pipeline; duplicates and bad signatures are handled", async ({ page }) => {
    await signIn(page, UM_ADMIN);
    await goTo(page, "Simulator Gateway");
    await page.getByLabel("Nomor Tagihan").fill(NUMBER);
    await page.getByLabel("Jumlah (Rp)").fill(AMOUNT);

    await page.getByLabel("Kirim dengan signature tidak valid").check();
    await page.getByRole("button", { name: "Kirim Webhook Simulasi" }).click();
    await expect(page.getByText(/Event ditolak: Signature tidak valid/)).toBeVisible();
    await page.getByLabel("Kirim dengan signature tidak valid").uncheck();

    await page.getByRole("button", { name: "Kirim Webhook Simulasi" }).click();
    await expect(page.getByText("Event diproses")).toBeVisible();

    await page.getByRole("button", { name: "Gunakan ulang ID event dari request terakhir yang dikirim" }).click();
    await page.getByRole("button", { name: "Kirim Webhook Simulasi" }).click();
    await expect(page.getByText(/tidak diterapkan \(duplikat\)/)).toBeVisible();

    await goTo(page, "Pemantauan Webhook");
    await expect(page.getByText(NUMBER).first()).toBeVisible();
    await expect(page.getByRole("row", { name: new RegExp(NUMBER) }).filter({ hasText: /Diproses/ })).toHaveCount(1);

    await goTo(page, "Tagihan UKT");
    await expect(page.getByRole("row", { name: new RegExp(NUMBER) })).toContainText("Lunas");
  });

  test("the student sees the PAID invoice and its transaction history", async ({ page }) => {
    await signIn(page, NADIA);
    await goTo(page, "Tagihan Saya");
    await expect(page.getByRole("row", { name: new RegExp(NUMBER) })).toContainText("Lunas");
    await goTo(page, "Riwayat Transaksi");
    await expect(page.getByText(NUMBER).first()).toBeVisible();
    // students never get administrator pages
    await expect(page.getByRole("button", { name: "Pemantauan Webhook" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Simulator Gateway" })).toHaveCount(0);
  });

  test("another institution's administrator cannot see the invoice (tenant isolation through the UI)", async ({ page }) => {
    await signIn(page, UB_ADMIN);
    await goTo(page, "Tagihan UKT");
    await expect(page.getByText("UKT-2026-0001").first()).toBeVisible(); // their own, same number as UM's
    await expect(page.getByText(NUMBER)).toHaveCount(0);
  });

  test("signing out ends the session server-side", async ({ page }) => {
    await signIn(page, UM_ADMIN);
    await signOut(page);
    await expect(page.getByRole("heading", { name: "Masuk ke akun Anda" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("heading", { name: "Masuk ke akun Anda" })).toBeVisible();
  });
});
