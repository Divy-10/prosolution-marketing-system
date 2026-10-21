import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AreaDto,
  CityDto,
  CompanyProfileDto,
  CompanyProfileInput,
  CreateAreaInput,
  CreateIndustryInput,
  CreateServiceInput,
  IndustryDto,
  ServiceDto,
  SystemSettingsDto,
  UpdateAreaInput,
  UpdateIndustryInput,
  UpdateServiceInput,
} from "@prosolution/shared";
import { api, qs } from "../../lib/api.ts";

type Status = "all" | "active" | "inactive";

// ── Settings ────────────────────────────────────────────────────────────────
export function useCompanyProfile() {
  return useQuery({ queryKey: ["company-profile"], queryFn: () => api.get<CompanyProfileDto>("/settings/company-profile") });
}
export function useSaveCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CompanyProfileInput) => api.put<CompanyProfileDto>("/settings/company-profile", input),
    onSuccess: (data) => qc.setQueryData(["company-profile"], data),
  });
}
export function useSystemSettings() {
  return useQuery({ queryKey: ["system-settings"], queryFn: () => api.get<SystemSettingsDto>("/settings/system") });
}
export function useSaveSystemSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { leadRetentionDays: number }) => api.patch<SystemSettingsDto>("/settings/system", input),
    onSuccess: (data) => {
      qc.setQueryData(["system-settings"], data);
      void qc.invalidateQueries({ queryKey: ["retention"] });
    },
  });
}

// ── Catalogue ───────────────────────────────────────────────────────────────
export function useServices(status: Status = "all") {
  return useQuery({ queryKey: ["services", status], queryFn: () => api.get<{ data: ServiceDto[] }>(`/services${qs({ status })}`) });
}
export function useIndustries(status: Status = "all") {
  return useQuery({ queryKey: ["industries", status], queryFn: () => api.get<{ data: IndustryDto[] }>(`/industries${qs({ status })}`) });
}
export function useCities() {
  return useQuery({ queryKey: ["cities"], queryFn: () => api.get<{ data: CityDto[] }>("/cities") });
}
export function useAreas(status: Status = "all", cityId?: string) {
  return useQuery({
    queryKey: ["areas", status, cityId ?? ""],
    queryFn: () => api.get<{ data: AreaDto[] }>(`/areas${qs({ status, cityId })}`),
  });
}

function useInvalidate(...keys: string[]) {
  const qc = useQueryClient();
  return () => Promise.all(keys.map((k) => qc.invalidateQueries({ queryKey: [k] })));
}

export function useSaveService() {
  const invalidate = useInvalidate("services", "industries");
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateServiceInput | UpdateServiceInput }) =>
      id ? api.patch<ServiceDto>(`/services/${id}`, input) : api.post<ServiceDto>("/services", input),
    onSuccess: invalidate,
  });
}
export function useSaveIndustry() {
  const invalidate = useInvalidate("industries", "services");
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateIndustryInput | UpdateIndustryInput }) =>
      id ? api.patch<IndustryDto>(`/industries/${id}`, input) : api.post<IndustryDto>("/industries", input),
    onSuccess: invalidate,
  });
}
export function useSaveArea() {
  const invalidate = useInvalidate("areas", "cities");
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CreateAreaInput | UpdateAreaInput }) =>
      id ? api.patch<AreaDto>(`/areas/${id}`, input) : api.post<AreaDto>("/areas", input),
    onSuccess: invalidate,
  });
}
