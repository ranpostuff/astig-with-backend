import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toastService } from "../../../app/services/toastService";
import { gradeService } from "../services/gradeService";
import { gradeKeys } from "./useGrades";
import type { CreateGradeRequest } from "../types/grade";
import { sectionKeys } from "../../sections/hooks/sectionKeys";
import { studentKeys } from "../../student/hooks/studentKeys";

interface UpdateGradeVariables {
  id: number;
  request: CreateGradeRequest;
}

export function useUpdateGrade() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, request }: UpdateGradeVariables) =>
      gradeService.updateGrade(id, request),

    onSuccess: (response, variables) => {
      queryClient.invalidateQueries({
        queryKey: gradeKeys.all,
      });

      queryClient.invalidateQueries({
        queryKey: gradeKeys.detail(variables.id),
      });

      queryClient.invalidateQueries({ queryKey: sectionKeys.all });
      queryClient.invalidateQueries({ queryKey: studentKeys.all });

      toastService.success(response.message || "Grade updated successfully.");
    },

    onError: (error) => {
      toastService.error(error);
    },
  });
}
