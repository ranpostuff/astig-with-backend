import { getApp, getApps, initializeApp } from "firebase/app";
import {
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
  signOut,
  sendPasswordResetEmail,
} from "firebase/auth";
import { get, ref, update as updateDatabase } from "firebase/database";

import { firebaseConfig, firebaseDatabase } from "../../../lib/firebase";
import { toastService } from "../../../app/services/toastService";
import type {
  CreateTeacherRequest,
  Teacher,
  TeacherListParams,
  TeacherListResponse,
  UpdateTeacherRequest,
} from "../types/teacher";

type TeacherRecord = Teacher & {
  createdAt: number;
  updatedAt: number;
};

function teacherCreatorAuth() {
  const name = "astig-teacher-creator";
  const app = getApps().find((item) => item.name === name) || initializeApp(firebaseConfig, name);
  return getAuth(getApp(app.name));
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export const teacherService = {
  async getList(params: TeacherListParams): Promise<TeacherListResponse> {
    const snapshot = await get(ref(firebaseDatabase, "teachers"));
    let records = snapshot.exists()
      ? Object.values(snapshot.val() as Record<string, TeacherRecord>)
      : [];
    const name = params.name?.trim().toLowerCase();
    const address = params.address?.trim().toLowerCase();
    records = records
      .filter((teacher) => {
        const fullName = [teacher.firstName, teacher.middleName, teacher.lastName, teacher.extension]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        return (!name || fullName.includes(name)) && (!address || teacher.address.toLowerCase().includes(address));
      })
      .sort((a, b) => a.lastName.localeCompare(b.lastName));

    const totalCount = records.length;
    const start = (params.pageNumber - 1) * params.pageSize;
    return {
      results: records.slice(start, start + params.pageSize),
      pageNumber: params.pageNumber,
      pageSize: params.pageSize,
      totalCount,
      totalPages: Math.max(1, Math.ceil(totalCount / params.pageSize)),
      message: "Success",
    };
  },

  async getById(id: string): Promise<Teacher> {
    const snapshot = await get(ref(firebaseDatabase, `teachers/${id}`));
    if (!snapshot.exists()) throw new Error("Teacher not found.");
    return snapshot.val() as TeacherRecord;
  },

  async create(request: CreateTeacherRequest): Promise<Teacher> {
    const secondaryAuth = teacherCreatorAuth();
    const credential = await createUserWithEmailAndPassword(
      secondaryAuth,
      request.email.trim().toLowerCase(),
      request.password || Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, "0")).join("") + "aA1!",
    );
    const now = Date.now();
    const teacher: TeacherRecord = {
      id: credential.user.uid,
      email: request.email.trim().toLowerCase(),
      firstName: normalize(request.firstName),
      middleName: request.middleName ? normalize(request.middleName) : null,
      lastName: normalize(request.lastName),
      extension: request.extension ? normalize(request.extension) : null,
      address: normalize(request.address),
      dateOfBirth: request.dateOfBirth,
      profilePictureUrl: request.profilePictureUrl || null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      await updateDatabase(ref(firebaseDatabase), {
        [`teachers/${teacher.id}`]: teacher,
        [`users/${teacher.id}`]: {
          role: "teacher",
          roles: ["teacher"],
          email: teacher.email,
          firstName: teacher.firstName,
          middleName: teacher.middleName,
          lastName: teacher.lastName,
          extension: teacher.extension,
          dateOfBirth: teacher.dateOfBirth,
          createdAt: now,
        },
      });
    } catch (error) {
      await deleteUser(credential.user).catch(() => undefined);
      throw error;
    } finally {
      await signOut(secondaryAuth).catch(() => undefined);
    }

    if (!request.password) {
      try {
        await sendPasswordResetEmail(secondaryAuth, teacher.email);
      } catch {
        toastService.error("Teacher created, but the password setup email could not be sent. Use Firebase Authentication to send a password reset email before they log in.");
      }
    }
    return teacher;
  },

  async delete(id: string): Promise<void> {
    const sectionsSnapshot = await get(ref(firebaseDatabase, "sections"));
    if (sectionsSnapshot.exists()) {
      const sections = Object.values(sectionsSnapshot.val() as Record<string, { assignedTeacherId?: string }>);
      if (sections.some((section) => section.assignedTeacherId === id)) {
        throw new Error("Assign this teacher's section to another adviser before deleting the teacher.");
      }
    }
    await updateDatabase(ref(firebaseDatabase), {
      [`teachers/${id}`]: null,
      [`users/${id}`]: null,
    });
  },

  async update(id: string, request: UpdateTeacherRequest): Promise<Teacher> {
    const existing = await this.getById(id) as TeacherRecord;
    const teacher: TeacherRecord = {
      ...existing,
      firstName: normalize(request.firstName),
      middleName: request.middleName ? normalize(request.middleName) : null,
      lastName: normalize(request.lastName),
      extension: request.extension ? normalize(request.extension) : null,
      address: normalize(request.address),
      dateOfBirth: request.dateOfBirth,
      profilePictureUrl: request.profilePictureUrl || null,
      updatedAt: Date.now(),
    };
    const updates: Record<string, unknown> = {
      [`teachers/${id}`]: teacher,
      [`users/${id}/firstName`]: teacher.firstName,
      [`users/${id}/middleName`]: teacher.middleName,
      [`users/${id}/lastName`]: teacher.lastName,
      [`users/${id}/extension`]: teacher.extension,
      [`users/${id}/dateOfBirth`]: teacher.dateOfBirth,
    };
    const sectionsSnapshot = await get(ref(firebaseDatabase, "sections"));
    if (sectionsSnapshot.exists()) {
      const teacherName = [teacher.firstName, teacher.middleName, teacher.lastName, teacher.extension]
        .filter(Boolean)
        .join(" ");
      for (const section of Object.values(sectionsSnapshot.val() as Record<string, { id: number; assignedTeacherId?: string }>)) {
        if (section.assignedTeacherId === id) updates[`sections/${section.id}/assignedTeacherName`] = teacherName;
      }
    }
    await updateDatabase(ref(firebaseDatabase), updates);
    return teacher;
  },
};
