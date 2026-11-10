import { api } from "./api";
import type { Semester } from "../types";
/** Single source of academic semesters (`GET /semesters`, scoped to the caller's institution). */
export const listSemesters = (): Promise<Semester[]> => api<Semester[]>("/semesters");
