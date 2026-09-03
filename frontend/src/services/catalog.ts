import { api } from "@/services/api";
import type {
  Category,
  FoodType,
  MealType,
  Page,
  Product,
  RestaurantTable,
  TableStatus,
} from "@/types";

// --- categories ---------------------------------------------------------

export interface CategoryPayload {
  name: string;
  description?: string | null;
  displayOrder?: number;
  isActive?: boolean;
}

export const categoriesService = {
  async list(params: { isActive?: boolean; search?: string } = {}): Promise<Category[]> {
    const { data } = await api.get<Category[]>("/categories", { params });
    return data;
  },

  async create(payload: CategoryPayload): Promise<Category> {
    const { data } = await api.post<Category>("/categories", payload);
    return data;
  },

  async update(id: string, payload: Partial<CategoryPayload>): Promise<Category> {
    const { data } = await api.patch<Category>(`/categories/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/categories/${id}`);
  },
};

// --- products -----------------------------------------------------------

export interface ProductPayload {
  name: string;
  description?: string | null;
  image?: string | null;
  price: number;
  gstPercentage: number;
  quantityAvailable: number;
  categoryId: string;
  foodType: FoodType;
  mealType: MealType;
  isAvailable: boolean;
}

export interface ProductListParams {
  search?: string;
  categoryId?: string;
  foodType?: FoodType;
  mealType?: MealType;
  isAvailable?: boolean;
  page?: number;
  pageSize?: number;
}

export const productsService = {
  async list(params: ProductListParams = {}): Promise<Page<Product>> {
    const { data } = await api.get<Page<Product>>("/products", { params });
    return data;
  },

  async create(payload: ProductPayload): Promise<Product> {
    const { data } = await api.post<Product>("/products", payload);
    return data;
  },

  async update(id: string, payload: Partial<ProductPayload>): Promise<Product> {
    const { data } = await api.patch<Product>(`/products/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/products/${id}`);
  },
};

// --- tables -------------------------------------------------------------

export interface TablePayload {
  tableNumber: string;
  capacity: number;
  isActive?: boolean;
}

export const tablesService = {
  async list(params: { status?: TableStatus; isActive?: boolean } = {}): Promise<RestaurantTable[]> {
    const { data } = await api.get<RestaurantTable[]>("/tables", { params });
    return data;
  },

  async create(payload: TablePayload): Promise<RestaurantTable> {
    const { data } = await api.post<RestaurantTable>("/tables", payload);
    return data;
  },

  async update(id: string, payload: Partial<TablePayload>): Promise<RestaurantTable> {
    const { data } = await api.patch<RestaurantTable>(`/tables/${id}`, payload);
    return data;
  },

  async remove(id: string): Promise<void> {
    await api.delete(`/tables/${id}`);
  },
};
