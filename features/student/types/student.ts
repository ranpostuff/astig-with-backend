export interface Student {
  id: number;
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  extension?: string | null;
  studentPicUrl?: string | null;
  sectionId: number;
  sectionName: string;
  gradeId: number;
  gradeName: string;
}

export interface StudentDetails {
  id: number;
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  extension?: string | null;
  parentMobileNo: string;
  parentName?: string | null;
  parentEmail?: string | null;
  studentPicUrl?: string | null;

  sectionId: number;
  sectionName: string;
  gradeName: string;
  gradeId: number;

  createdBy?: string | null;
  updatedBy?: string | null;
  createdDate: string;
  updatedDate: string;

  message: string;
}

export interface CreateStudentRequest {
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  extension?: string | null;
  parentMobileNo: string;
  parentName?: string | null;
  parentEmail?: string | null;
  studentPicUrl?: string | null;
  sectionId: number;
}

export interface UpdateStudentRequest {
  lrn: string;
  firstName: string;
  middleName?: string | null;
  lastName: string;
  extension?: string | null;
  parentMobileNo: string;
  parentName?: string | null;
  parentEmail?: string | null;
  studentPicUrl?: string | null;
  sectionId: number;
}

export interface StudentListParams {
  name?: string;
  sectionId?: number;
  sectionName?: string;
  gradeId?: number;
  grade?: string;
  parentEmail?: string;
  parentMobileNumber?: string;
  pageNumber: number;
  pageSize: number;
}

export interface StudentListResponse {
  results: Student[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  message: string;
}

export interface BaseResponse {
  message: string;
}
