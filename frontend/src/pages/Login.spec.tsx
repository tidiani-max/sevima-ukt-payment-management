import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LoginScreen } from "./Login";
import { adminSession, stubFetch } from "../test/fixtures";

const setup = (onLogin = vi.fn()) => {
  render(<LoginScreen role="admin" setRole={() => {}} onLogin={onLogin} />);
  return { onLogin, user: userEvent.setup() };
};

describe("Login screen", () => {
  it("validates before calling the server", async () => {
    const calls = stubFetch({});
    const { user } = setup();
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByText("Masukkan alamat email Anda.")).toBeInTheDocument();
    expect(screen.getByText("Masukkan kata sandi Anda.")).toBeInTheDocument();
    await user.type(screen.getByLabelText(/email/i), "not-an-email");
    await user.type(screen.getByLabelText(/kata sandi/i), "x");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByText("Masukkan alamat email yang valid.")).toBeInTheDocument();
    expect(calls).toHaveLength(0);
  });

  it("shows a loading state, then reports the session on success", async () => {
    stubFetch({ "POST /auth/login": { body: adminSession } });
    const { user, onLogin } = setup();
    await user.type(screen.getByLabelText(/email/i), "admin.keuangan@um.ac.id");
    await user.type(screen.getByLabelText(/kata sandi/i), "demosevima");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    await waitFor(() => expect(onLogin).toHaveBeenCalledWith(adminSession));
  });

  it("shows a friendly error for wrong credentials and lets the user retry", async () => {
    stubFetch({ "POST /auth/login": { status: 401, body: { message: "Incorrect email or password." } } });
    const { user, onLogin } = setup();
    await user.type(screen.getByLabelText(/email/i), "admin.keuangan@um.ac.id");
    await user.type(screen.getByLabelText(/kata sandi/i), "wrong");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Email atau kata sandi salah.");
    expect(onLogin).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Masuk" })).toBeEnabled();
  });

  it("shows the rate-limit message from the server on 429", async () => {
    stubFetch({ "POST /auth/login": { status: 429, body: { message: "Too many sign-in attempts. Please wait a few minutes and try again." } } });
    const { user } = setup();
    await user.type(screen.getByLabelText(/email/i), "a@b.co");
    await user.type(screen.getByLabelText(/kata sandi/i), "x");
    await user.click(screen.getByRole("button", { name: "Masuk" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/too many sign-in attempts/i);
  });

  it("does not render demo credentials unless explicitly enabled", () => {
    setup();
    expect(screen.queryByText(/isi akun demo/i)).not.toBeInTheDocument();
  });
});
