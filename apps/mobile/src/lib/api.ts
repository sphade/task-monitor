import axios, { AxiosError, type AxiosInstance, type AxiosResponse } from 'axios';
import Toast from 'react-native-toast-message';

import { getToken, useAuthStore } from '@/store/auth';
import type { ApiErrorBody, Envelope, Paginated } from '@/types/api';

/**
 * Base URL from env. Defaults to the local Workers dev server (`pnpm dev:api`)
 * so the monorepo works out of the box; override per environment via
 * EXPO_PUBLIC_API_URL.
 *
 * Android emulators reach the host machine via 10.0.2.2, and physical devices
 * need the LAN IP (see .env.example).
 */
const baseURL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8787';

const common = {
  baseURL,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  timeout: 20000,
};

/** Unauthenticated client (login, OTP, forgot/reset password). */
export const publicApi: AxiosInstance = axios.create(common);

/** Authenticated client — attaches the JWT and logs out on 401. */
export const privateApi: AxiosInstance = axios.create(common);

privateApi.interceptors.request.use((config) => {
  const token = getToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

privateApi.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    if (error.response?.status === 401) {
      await useAuthStore.getState().logout();
      Toast.show({ type: 'error', text1: 'Session expired', text2: 'Please sign in again.' });
    }
    return Promise.reject(error);
  },
);

// ── Response helpers ───────────────────────────────────────────────────────

/**
 * Unwraps `{ message, data }`. Some endpoints return the payload directly, so
 * fall back to the raw body when `data` is absent.
 */
export function unwrap<T>(response: AxiosResponse<Envelope<T> | T>): T {
  const body = response.data as Envelope<T> & T;
  if (body && typeof body === 'object' && 'data' in body && body.data !== undefined) {
    return (body as Envelope<T>).data;
  }
  return body as T;
}

/** Reads `message` off a success envelope, when present. */
export function messageOf(response: AxiosResponse<unknown>, fallback = ''): string {
  const body = response.data as { message?: unknown };
  return typeof body?.message === 'string' ? body.message : fallback;
}

/**
 * Normalises a list response. Endpoints are inconsistent: some return a DRF
 * page (`{ count, results }`), some a bare array, some an envelope wrapping
 * either. This collapses all of those to a plain array.
 */
export function toArray<T>(response: AxiosResponse<unknown>): T[] {
  const payload = unwrap<unknown>(response as AxiosResponse<Envelope<unknown>>);
  if (Array.isArray(payload)) return payload as T[];
  const page = payload as Paginated<T> | null;
  if (page && Array.isArray(page.results)) return page.results;
  return [];
}

/** Normalises a paginated response, preserving the total count. */
export function toPage<T>(response: AxiosResponse<unknown>): { items: T[]; count: number } {
  const payload = unwrap<unknown>(response as AxiosResponse<Envelope<unknown>>);
  if (Array.isArray(payload)) return { items: payload as T[], count: payload.length };
  const page = payload as Paginated<T> | null;
  if (page && Array.isArray(page.results)) {
    return { items: page.results, count: page.count ?? page.results.length };
  }
  return { items: [], count: 0 };
}

// ── Error helpers ──────────────────────────────────────────────────────────

/**
 * Extracts a human-readable message. The API reports field errors as
 * `{ message: "Validation error", errors: { email: ["..."] } }`, so surface the
 * first field error rather than the generic label.
 */
export function apiErrorMessage(error: unknown, fallback = 'Something went wrong'): string {
  const body = (error as AxiosError<ApiErrorBody>)?.response?.data;
  if (!body) {
    // No response at all usually means the device cannot reach the host.
    const code = (error as AxiosError)?.code;
    if (code === 'ECONNABORTED') return 'The request timed out. Check your connection.';
    if (code === 'ERR_NETWORK') return 'Cannot reach the server. Check your connection.';
    return fallback;
  }
  const firstFieldError = Object.values(body.errors ?? {})
    .flat()
    .find((m) => typeof m === 'string' && m.length > 0);
  // "Validation error" is a generic label; the useful text is in `errors`.
  if (body.message && body.message !== 'Validation error') return body.message;
  return firstFieldError ?? body.detail ?? body.message ?? fallback;
}

/** Shows a toast for a failed request. */
export function toastApiError(error: unknown, title = 'Request failed') {
  Toast.show({ type: 'error', text1: title, text2: apiErrorMessage(error) });
}
