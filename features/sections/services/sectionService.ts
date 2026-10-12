import { get, ref, remove, set } from "firebase/database";
import { firebaseDatabase } from "../../../lib/firebase";
import type { BaseResponse, CreateSectionRequest, SectionDetails, SectionListParams, SectionListResponse, UpdateSectionRequest } from "../types/section";

type SectionRecord = SectionDetails & { assignedTeacher?: string };

async function gradeName(gradeId: number) {
  const snapshot = await get(ref(firebaseDatabase, `grades/${gradeId}`));
  if (!snapshot.exists()) throw new Error("The selected grade does not exist.");
  return String(snapshot.val().name);
}

export const sectionService = {
  async getList(params: SectionListParams): Promise<SectionListResponse> {
    const snapshot = await get(ref(firebaseDatabase, "sections"));
    let records = snapshot.exists() ? Object.values(snapshot.val() as Record<string, SectionRecord>) : [];
    records = records.filter((section) => (!params.name || section.name.toLowerCase().includes(params.name.toLowerCase())) && (!params.assignedTeacherName || section.assignedTeacherName.toLowerCase().includes(params.assignedTeacherName.toLowerCase())) && (!params.gradeName || section.gradeName === params.gradeName)).sort((a, b) => a.name.localeCompare(b.name));
    const totalCount = records.length;
    const start = (params.pageNumber - 1) * params.pageSize;
    return {
      results: records.slice(start, start + params.pageSize).map((section) => ({ id: section.id, name: section.name, assignedTeacher: section.assignedTeacherName || "Unassigned", gradeName: section.gradeName })),
      pageNumber: params.pageNumber, pageSize: params.pageSize, totalCount, totalPages: Math.max(1, Math.ceil(totalCount / params.pageSize)), message: "Success",
    };
  },
  async getById(id: number): Promise<SectionDetails> {
    const snapshot = await get(ref(firebaseDatabase, `sections/${id}`));
    if (!snapshot.exists()) throw new Error("Section not found.");
    return snapshot.val() as SectionDetails;
  },
  async create(request: CreateSectionRequest): Promise<SectionDetails> {
    const id = Date.now();
    const record: SectionDetails = { id, name: request.name.trim(), assignedTeacherId: request.assignedTeacherId, assignedTeacherName: request.assignedTeacherId ? "Assigned teacher" : "Unassigned", gradeId: request.gradeId, gradeName: await gradeName(request.gradeId) };
    await set(ref(firebaseDatabase, `sections/${id}`), record);
    return record;
  },
  async update(id: number, request: UpdateSectionRequest): Promise<SectionDetails> {
    const existing = await this.getById(id);
    const record: SectionDetails = { ...existing, name: request.name.trim(), assignedTeacherId: request.assignedTeacherId, assignedTeacherName: request.assignedTeacherId ? existing.assignedTeacherName || "Assigned teacher" : "Unassigned", gradeId: request.gradeId, gradeName: await gradeName(request.gradeId) };
    await set(ref(firebaseDatabase, `sections/${id}`), record);
    return record;
  },
  async delete(id: number): Promise<BaseResponse> {
    await remove(ref(firebaseDatabase, `sections/${id}`));
    return { message: "Section deleted." };
  },
};
