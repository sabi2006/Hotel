import { api } from "@/services/api";
import type { Page, User, UserRole } from "@/types";

export interface UserListParams {
  role?: UserRole;
  isActive?: boolean;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface CreateUserPayload {
  name: string;
  email: string;
  phone?: string;
  password: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  name?: string;
  email?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
}

export const usersService = {
  async list(params: UserListParams = {}): Promise<Page<User>> {
    const { data } = await api.get<Page<User>>("/users", { params });
    return data;
  },

  async create(payload: CreateUserPayload): Promise<User> {
    const { data } = await api.post<User>("/users", payload);
    return data;
  },

  async update(id: string, payload: UpdateUserPayload): Promise<User> {
    const { data } = await api.patch<User>(`/users/${id}`, payload);
    return data;
  },

  async resetPassword(id: string, newPassword: string): Promise<void> {
    await api.post(`/users/${id}/reset-password`, { newPassword });
  },

  async disable(id: string): Promise<void> {
    await api.delete(`/users/${id}`);
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/users/${id}`, { params: { permanent: true } });
  },
};
