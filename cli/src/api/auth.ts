import { request, apiRequest } from "./http";
import type { Me } from "./types";

export function fetchMe(apiUrl: string, token: string) {
  return request<Me>(apiUrl, token, "/auth/me");
}

export function getMe() {
  return apiRequest<Me>("/auth/me");
}
