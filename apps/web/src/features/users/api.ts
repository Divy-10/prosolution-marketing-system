import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { CreateUserInput, Paginated, Role, UpdateUserInput, UserDto } from "@prosolution/shared";
import { api, qs } from "../../lib/api.ts";

export interface UserFilters {
  q: string;
  role: Role | "";
  status: "all" | "active" | "inactive";
  page: number;
}

export function useUsers(filters: UserFilters) {
  return useQuery({
    queryKey: ["users", filters],
    queryFn: () =>
      api.get<Paginated<UserDto>>(
        `/users${qs({ q: filters.q, role: filters.role, status: filters.status, page: filters.page, pageSize: 20 })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateUsers() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ["users"] });
}

export function useCreateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({ mutationFn: (input: CreateUserInput) => api.post<UserDto>("/users", input), onSuccess: invalidate });
}

export function useUpdateUser() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: UpdateUserInput }) => api.patch<UserDto>(`/users/${id}`, input),
    onSuccess: invalidate,
  });
}

export function useResetPassword() {
  const invalidate = useInvalidateUsers();
  return useMutation({
    mutationFn: ({ id, temporaryPassword }: { id: string; temporaryPassword: string }) =>
      api.post<UserDto>(`/users/${id}/reset-password`, { temporaryPassword }),
    onSuccess: invalidate,
  });
}

/** A readable random temporary password, e.g. "k7qm-2xpt-9hfa-wd4r" (≈80 bits). */
export function generateTemporaryPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  const chars = Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
  return chars.match(/.{4}/g)!.join("-");
}
