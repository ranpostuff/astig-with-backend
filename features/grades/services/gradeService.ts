import { get, ref, set, update as updateDatabase } from "firebase/database";
import { firebaseDatabase } from "../../../lib/firebase";
import type { CreateGradeRequest, GradeResponse, GetGradesParams, PaginatedGradeResponse } from "../types/grade";

type GradeRecord = { id: number; name: string; description: string | null; createdAt: number; createdBy?: string | null };
function toResponse(record: GradeRecord): GradeResponse { return { ...record, createdBy: record.createdBy || null, createdAt: new Date(record.createdAt).toISOString(), message: "Success" }; }

export const gradeService = {
  async getGrades(params: GetGradesParams): Promise<PaginatedGradeResponse> {
    const snapshot = await get(ref(firebaseDatabase, "grades"));
    let records = snapshot.exists() ? Object.values(snapshot.val() as Record<string, GradeRecord>) : [];
    if (params.name) records = records.filter((grade) => grade.name.toLowerCase().includes(params.name!.toLowerCase()));
    records.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const totalCount = records.length;
    const start = (params.pageNumber - 1) * params.pageSize;
    return { results: records.slice(start, start + params.pageSize).map(toResponse), pageNumber: params.pageNumber, pageSize: params.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / params.pageSize)), message: "Success" };
  },
  async getGrade(id: number): Promise<GradeResponse> {
    const snapshot = await get(ref(firebaseDatabase, `grades/${id}`));
    if (!snapshot.exists()) throw new Error("Grade not found.");
    return toResponse(snapshot.val() as GradeRecord);
  },
  async createGrade(request: CreateGradeRequest): Promise<GradeResponse> {
    const existingSnapshot = await get(ref(firebaseDatabase, "grades"));
    const existing = existingSnapshot.exists() ? Object.values(existingSnapshot.val() as Record<string, GradeRecord>) : [];
    if (existing.some((grade) => grade.name.trim().toLowerCase() === request.name.trim().toLowerCase())) {
      throw new Error("A grade with this name already exists.");
    }
    const record: GradeRecord = { id: Date.now(), name: request.name.trim(), description: request.description?.trim() || null, createdAt: Date.now() };
    await set(ref(firebaseDatabase, `grades/${record.id}`), record);
    return toResponse(record);
  },
  async updateGrade(id: number, request: CreateGradeRequest): Promise<GradeResponse> {
    const existing = await this.getGrade(id);
    const allSnapshot = await get(ref(firebaseDatabase, "grades"));
    const all = allSnapshot.exists() ? Object.values(allSnapshot.val() as Record<string, GradeRecord>) : [];
    if (all.some((grade) => grade.id !== id && grade.name.trim().toLowerCase() === request.name.trim().toLowerCase())) {
      throw new Error("A grade with this name already exists.");
    }
    const record: GradeRecord = { id, name: request.name.trim(), description: request.description?.trim() || null, createdAt: new Date(existing.createdAt).getTime() };
    const [sectionsSnapshot, studentsSnapshot] = await Promise.all([
      get(ref(firebaseDatabase, "sections")),
      get(ref(firebaseDatabase, "students")),
    ]);
    const updates: Record<string, unknown> = { [`grades/${id}`]: record };
    if (sectionsSnapshot.exists()) {
      for (const section of Object.values(sectionsSnapshot.val() as Record<string, { id: number; gradeId: number }>)) {
        if (Number(section.gradeId) === Number(id)) updates[`sections/${section.id}/gradeName`] = record.name;
      }
    }
    if (studentsSnapshot.exists()) {
      for (const student of Object.values(studentsSnapshot.val() as Record<string, { lrn: string; gradeId: number }>)) {
        if (Number(student.gradeId) !== Number(id)) continue;
        updates[`students/${student.lrn}/gradeName`] = record.name;
        updates[`studentDirectory/${student.lrn}/gradeName`] = record.name;
      }
    }
    await updateDatabase(ref(firebaseDatabase), updates);
    return toResponse(record);
  },
  async deleteGrade(id: number): Promise<void> {
    const [sectionsSnapshot, studentsSnapshot] = await Promise.all([
      get(ref(firebaseDatabase, "sections")),
      get(ref(firebaseDatabase, "students")),
    ]);
    const sections = sectionsSnapshot.exists()
      ? Object.values(sectionsSnapshot.val() as Record<string, { gradeId: number }>)
      : [];
    const students = studentsSnapshot.exists()
      ? Object.values(studentsSnapshot.val() as Record<string, { gradeId: number }>)
      : [];
    if (sections.some((section) => Number(section.gradeId) === Number(id)) || students.some((student) => Number(student.gradeId) === Number(id))) {
      throw new Error("Delete or move this grade's sections and students before deleting the grade.");
    }
    await updateDatabase(ref(firebaseDatabase), { [`grades/${id}`]: null });
  },
};
