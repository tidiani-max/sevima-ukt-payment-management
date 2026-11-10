import { api } from "./api";
import type { Session, Transaction } from "../types";
export const listTransactions = (s: Session): Promise<Transaction[]> =>
  api<Transaction[]>(s.user.role === "ADMIN" ? "/transactions?limit=500" : "/me/transactions?limit=500");
