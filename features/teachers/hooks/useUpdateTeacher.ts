import { useMutation, useQueryClient } from "@tanstack/react-query";
import { teacherService } from "../services/teacherService";
import { toastService } from "../../../app/services/toastService";
import type { UpdateTeacherRequest } from "../types/teacher";

export function useUpdateTeacher() {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: ({
      id,
      request,
    }: {
      id: string;
      request: UpdateTeacherRequest;
    }) => teacherService.update(id, request),

    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["teachers"],
      });

      queryClient.invalidateQueries({
        queryKey: ["teachers", variables.id],
      });

      queryClient.invalidateQueries({
        queryKey: ["sections"],
      });

      toastService.success("Teacher updated successfully.");
    },

    onError: (error) => {
      toastService.error(error);
    },
  });

  return {
    updateTeacher: mutation.mutate,
    isPending: mutation.isPending,
  };
}
