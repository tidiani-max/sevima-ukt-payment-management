import { api } from "./api";
import type { Institution } from "../types";
/** Returns only the signed-in user's own institution (the API has no cross-tenant directory). */
export const listInstitutions = (): Promise<Institution[]> => api<Institution[]>("/institutions");
