import { api } from "./api";
import type { Session, Student } from "../types";
// The server scopes both calls to the session's institution; nothing here is a security control.
export const listStudents = (_s: Session): Promise<Student[]> => api<Student[]>("/students?limit=500");
export const getMyProfile = (_s: Session): Promise<Student> => api<Student>("/me/student");
