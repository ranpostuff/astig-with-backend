import { get, ref, remove, set, update as updateDatabase } from "firebase/database";
import { firebaseDatabase } from "../../../lib/firebase";
import type { FirebaseStudentRecord } from "../../tracking/types";
import type { CreateStudentRequest, StudentDetails, StudentListParams, StudentListResponse, UpdateStudentRequest } from "../types/student";

function toDetails(record: FirebaseStudentRecord): StudentDetails {
  return {
    ...record,
    createdBy: null,
    updatedBy: null,
    createdDate: new Date(record.createdAt).toISOString(),
    updatedDate: new Date(record.updatedAt).toISOString(),
    message: "Success",
  };
}

function directoryRecord(record: FirebaseStudentRecord): FirebaseStudentRecord {
  return { ...record, parentName: null, parentMobileNo: "", parentEmail: null };
}

async function sectionInfo(sectionId: number) {
  const snapshot = await get(ref(firebaseDatabase, `sections/${sectionId}`));
  if (!snapshot.exists()) throw new Error("The selected section does not exist.");
  return snapshot.val() as { id: number; name: string; gradeId: number; gradeName: string };
}

export const studentService = {
  async getList(params: StudentListParams): Promise<StudentListResponse> {
    const snapshot = await get(ref(firebaseDatabase, "students"));
    let records = snapshot.exists() ? Object.values(snapshot.val() as Record<string, FirebaseStudentRecord>) : [];
    const name = params.name?.toLowerCase().trim();
    records = records.filter((student) => {
      const fullName = `${student.firstName} ${student.middleName || ""} ${student.lastName}`.toLowerCase();
      return (!name || fullName.includes(name)) && (!params.sectionName || student.sectionName === params.sectionName) && (!params.grade || student.gradeName === params.grade) && (!params.parentEmail || student.parentEmail?.includes(params.parentEmail)) && (!params.parentMobileNumber || student.parentMobileNo.includes(params.parentMobileNumber));
    }).sort((a, b) => a.lastName.localeCompare(b.lastName));
    const totalCount = records.length;
    const start = (params.pageNumber - 1) * params.pageSize;
    const page = records.slice(start, start + params.pageSize);
    return {
      results: page.map((student) => ({ id: student.id, firstName: student.firstName, middleName: student.middleName, lastName: student.lastName, extension: student.extension, studentPicUrl: student.studentPicUrl, sectionName: student.sectionName, gradeName: student.gradeName })),
      pageNumber: params.pageNumber,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / params.pageSize)),
      message: "Success",
    };
  },

  async getById(id: number) {
    const snapshot = await get(ref(firebaseDatabase, `students/${id}`));
    if (!snapshot.exists()) throw new Error("Student not found.");
    return toDetails(snapshot.val() as FirebaseStudentRecord);
  },

  async create(request: CreateStudentRequest) {
    const section = await sectionInfo(request.sectionId);
    const now = Date.now();
    const record: FirebaseStudentRecord = {
      id: Number(request.lrn), lrn: request.lrn, firstName: request.firstName.trim(), middleName: request.middleName?.trim() || null, lastName: request.lastName.trim(), extension: request.extension?.trim() || null, parentName: request.parentName?.trim() || null, parentMobileNo: request.parentMobileNo, parentEmail: request.parentEmail?.trim() || null, studentPicUrl: request.studentPicUrl || null, sectionId: section.id, sectionName: section.name, gradeId: section.gradeId, gradeName: section.gradeName, createdAt: now, updatedAt: now,
    };
    await updateDatabase(ref(firebaseDatabase), {
      [`students/${record.lrn}`]: record,
      [`studentDirectory/${record.lrn}`]: directoryRecord(record),
    });
    return toDetails(record);
  },

  async update(id: number, request: UpdateStudentRequest) {
    const existing = await this.getById(id);
    const section = await sectionInfo(request.sectionId);
    const record: FirebaseStudentRecord = {
      id: Number(request.lrn), lrn: request.lrn, firstName: request.firstName.trim(), middleName: request.middleName?.trim() || null, lastName: request.lastName.trim(), extension: request.extension?.trim() || null, parentName: request.parentName?.trim() || existing.parentName || null, parentMobileNo: request.parentMobileNo, parentEmail: request.parentEmail?.trim() || null, studentPicUrl: request.studentPicUrl || null, sectionId: section.id, sectionName: section.name, gradeId: section.gradeId, gradeName: section.gradeName, createdAt: new Date(existing.createdDate).getTime(), updatedAt: Date.now(),
    };
    if (String(id) !== record.lrn) {
      await updateDatabase(ref(firebaseDatabase), {
        [`students/${id}`]: null,
        [`studentDirectory/${id}`]: null,
      });
    }
    await updateDatabase(ref(firebaseDatabase), {
      [`students/${record.lrn}`]: record,
      [`studentDirectory/${record.lrn}`]: directoryRecord(record),
    });
    return toDetails(record);
  },

  async delete(id: number) {
    await updateDatabase(ref(firebaseDatabase), {
      [`students/${id}`]: null,
      [`studentDirectory/${id}`]: null,
    });
    return { message: "Student deleted." };
  },
};
