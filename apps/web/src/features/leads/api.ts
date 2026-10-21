import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  CheckDuplicatesInput,
  CreateLeadInput,
  DuplicateCheckDto,
  LeadDetailDto,
  LeadHistoryEntryDto,
  LeadListItemDto,
  LeadView,
  Paginated,
  UpdateLeadInput,
  UserRefDto,
} from "@prosolution/shared";
import { api, qs } from "../../lib/api.ts";

export interface LeadFilters {
  view: LeadView;
  q: string;
  industryId: string;
  areaId: string;
  assignedToId: string;
  page: number;
}

export type LeadCounts = Record<"candidates" | "approved" | "contacted" | "rejected", number>;

export function useLeads(f: LeadFilters) {
  return useQuery({
    queryKey: ["leads", f],
    queryFn: () =>
      api.get<Paginated<LeadListItemDto> & { counts: LeadCounts }>(
        `/leads${qs({ view: f.view, q: f.q, industryId: f.industryId, areaId: f.areaId, assignedToId: f.assignedToId, page: f.page, pageSize: 25 })}`,
      ),
    placeholderData: keepPreviousData,
  });
}

export function useLead(id: string) {
  return useQuery({ queryKey: ["lead", id], queryFn: () => api.get<LeadDetailDto>(`/leads/${id}`) });
}

export function useLeadHistory(id: string) {
  return useQuery({ queryKey: ["lead-history", id], queryFn: () => api.get<{ data: LeadHistoryEntryDto[] }>(`/leads/${id}/history`) });
}

export function useAssignees(enabled: boolean) {
  return useQuery({ queryKey: ["lead-assignees"], queryFn: () => api.get<{ data: UserRefDto[] }>("/leads/assignees"), enabled });
}

export function checkDuplicates(input: CheckDuplicatesInput) {
  return api.post<DuplicateCheckDto>("/leads/check-duplicates", input);
}

function useLeadMutation<V>(fn: (v: V) => Promise<LeadDetailDto>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: (lead) => {
      qc.setQueryData(["lead", lead.id], lead);
      void qc.invalidateQueries({ queryKey: ["leads"] });
      void qc.invalidateQueries({ queryKey: ["lead-history", lead.id] });
    },
  });
}

export const useCreateLead = () => useLeadMutation((input: CreateLeadInput) => api.post<LeadDetailDto>("/leads", input));
export const useUpdateLead = () =>
  useLeadMutation(({ id, input }: { id: string; input: UpdateLeadInput }) => api.patch<LeadDetailDto>(`/leads/${id}`, input));
export const useReviewLead = () =>
  useLeadMutation(({ id, decision, note }: { id: string; decision: "APPROVE" | "REJECT" | "REOPEN"; note?: string }) =>
    api.post<LeadDetailDto>(`/leads/${id}/review`, { decision, note }),
  );
export const useAssignLead = () =>
  useLeadMutation(({ id, userId }: { id: string; userId: string | null }) => api.post<LeadDetailDto>(`/leads/${id}/assign`, { userId }));
export const useVerifyLead = () => useLeadMutation((id: string) => api.post<LeadDetailDto>(`/leads/${id}/verify-details`));
export const useDoNotContact = () =>
  useLeadMutation(({ id, doNotContact, reason }: { id: string; doNotContact: boolean; reason: string }) =>
    api.post<LeadDetailDto>(`/leads/${id}/do-not-contact`, { doNotContact, reason }),
  );
export const useRecordContact = () =>
  useLeadMutation(({ id, contactedAt, note }: { id: string; contactedAt: string; note: string }) =>
    api.post<LeadDetailDto>(`/leads/${id}/record-contact`, { contactedAt, note }),
  );
