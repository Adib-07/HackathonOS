import { customFetch, setBaseUrl } from "@workspace/api-client-react";

// Set the base URL for API calls
setBaseUrl("");

interface ApiResponse<T> {
  ok: boolean;
  status: number;
  json: () => Promise<T>;
  text: () => Promise<string>;
}

function createApiResponse<T>(data: T, status = 200): ApiResponse<T> {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

function createErrorResponse<T>(status: number, message: string): ApiResponse<T> {
  return {
    ok: false,
    status,
    json: async () => ({ error: message } as T),
    text: async () => message,
  };
}

export const api = {
  get: async <T>(url: string): Promise<ApiResponse<T>> => {
    try {
      const data = await customFetch<T>(url, { method: "GET" });
      return createApiResponse(data);
    } catch (error) {
      if (error instanceof Response) {
        return createErrorResponse(error.status, error.statusText);
      }
      if (error && typeof error === "object" && "status" in error) {
        return createErrorResponse((error as { status: number }).status, (error as { message?: string }).message || "Request failed");
      }
      return createErrorResponse(500, "Network error");
    }
  },
  post: async <T>(url: string, body: unknown): Promise<ApiResponse<T>> => {
    try {
      const data = await customFetch<T>(url, {
        method: "POST",
        body: JSON.stringify(body),
      });
      return createApiResponse(data);
    } catch (error) {
      if (error instanceof Response) {
        return createErrorResponse(error.status, error.statusText);
      }
      if (error && typeof error === "object" && "status" in error) {
        return createErrorResponse((error as { status: number }).status, (error as { message?: string }).message || "Request failed");
      }
      return createErrorResponse(500, "Network error");
    }
  },
  patch: async <T>(url: string, body: unknown): Promise<ApiResponse<T>> => {
    try {
      const data = await customFetch<T>(url, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      return createApiResponse(data);
    } catch (error) {
      if (error instanceof Response) {
        return createErrorResponse(error.status, error.statusText);
      }
      if (error && typeof error === "object" && "status" in error) {
        return createErrorResponse((error as { status: number }).status, (error as { message?: string }).message || "Request failed");
      }
      return createErrorResponse(500, "Network error");
    }
  },
  delete: async <T>(url: string): Promise<ApiResponse<T>> => {
    try {
      const data = await customFetch<T>(url, { method: "DELETE" });
      return createApiResponse(data);
    } catch (error) {
      if (error instanceof Response) {
        return createErrorResponse(error.status, error.statusText);
      }
      if (error && typeof error === "object" && "status" in error) {
        return createErrorResponse((error as { status: number }).status, (error as { message?: string }).message || "Request failed");
      }
      return createErrorResponse(500, "Network error");
    }
  },
};