const BASE_URL = import.meta.env.VITE_API_URL ?? ''

interface RequestOptions {
  method?: string
  body?: unknown
  headers?: Record<string, string>
}

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, headers = {} } = options

  // Include stored token
  const token = localStorage.getItem('auth_token')
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const data = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, data.error ?? res.statusText)
  }

  if (res.status === 204) return null as T

  return res.json()
}

export const api = {
  // Auth
  login: (username: string, password: string) =>
    request<{ user: AuthUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: { username, password },
    }),

  logout: () =>
    request('/api/auth/logout', { method: 'POST' }),

  me: () =>
    request<{ user: AuthUser }>('/api/auth/me'),

  changePassword: (oldPassword: string, newPassword: string) =>
    request('/api/auth/password', {
      method: 'PUT',
      body: { oldPassword, newPassword },
    }),

  // ── Templates ──
  listTemplates: () =>
    request<{ templates: TemplateSummary[] }>('/api/seasons/templates'),

  getTemplate: (id: string) =>
    request<{ template: SeasonFull }>(`/api/seasons/templates/${id}`),

  createTemplate: (label: string, data: unknown) =>
    request<{ template: TemplateSummary }>('/api/seasons/templates', {
      method: 'POST',
      body: { label, data },
    }),

  updateTemplate: (id: string, body: { label?: string; data?: unknown; dataPatch?: Record<string, unknown>; version: number }) =>
    request<{ season: SeasonFull }>(`/api/seasons/templates/${id}`, {
      method: 'PUT',
      body,
    }),

  deleteTemplate: (id: string) =>
    request(`/api/seasons/templates/${id}`, { method: 'DELETE' }),

  forkTemplate: (id: string, label?: string) =>
    request<{ season: SeasonSummary }>(`/api/seasons/templates/${id}/fork`, {
      method: 'POST',
      body: { label },
    }),

  // ── Seasons (private copies) ──
  listSeasons: () =>
    request<{ seasons: SeasonSummaryWithAccess[] }>('/api/seasons'),

  getSeason: (id: string) =>
    request<{ season: SeasonFull }>(`/api/seasons/${id}`),

  createSeason: (label: string, data: unknown) =>
    request<{ season: SeasonSummary }>('/api/seasons', {
      method: 'POST',
      body: { label, data },
    }),

  updateSeason: (id: string, body: { label?: string; data?: unknown; dataPatch?: Record<string, unknown>; version: number }) =>
    request<{ season: SeasonFull }>(`/api/seasons/${id}`, {
      method: 'PUT',
      body,
    }),

  deleteSeason: (id: string) =>
    request(`/api/seasons/${id}`, { method: 'DELETE' }),

  duplicateSeason: (id: string) =>
    request<{ season: SeasonSummary }>(`/api/seasons/${id}/duplicate`, { method: 'POST' }),

  // ── Permissions / Sharing ──
  listPermissions: (seasonId: string) =>
    request<{ permissions: SeasonPermission[] }>(`/api/seasons/${seasonId}/permissions`),

  addPermission: (seasonId: string, userId: string, role: 'editor' | 'viewer') =>
    request<{ ok: boolean }>(`/api/seasons/${seasonId}/permissions`, {
      method: 'POST',
      body: { userId, role },
    }),

  removePermission: (seasonId: string, userId: string) =>
    request(`/api/seasons/${seasonId}/permissions/${userId}`, { method: 'DELETE' }),

  // ── Snapshots ──
  listSnapshots: (seasonId: string, limit = 50, offset = 0) =>
    request<{ snapshots: SnapshotSummary[] }>(`/api/seasons/${seasonId}/snapshots?limit=${limit}&offset=${offset}`),

  getSnapshot: (seasonId: string, snapshotId: string, full = false) =>
    request<{ snapshot: SnapshotFull }>(`/api/seasons/${seasonId}/snapshots/${snapshotId}${full ? '?full=1' : ''}`),

  createSnapshot: (seasonId: string, description?: string) =>
    request<{ snapshot?: SnapshotSummary; skipped?: boolean }>(`/api/seasons/${seasonId}/snapshots`, {
      method: 'POST',
      body: { description },
    }),

  rollbackToSnapshot: (seasonId: string, snapshotId: string) =>
    request<{ season: { id: string; version: number; updatedAt: string } }>(`/api/seasons/${seasonId}/snapshots/${snapshotId}/rollback`, {
      method: 'POST',
    }),

  // ── Users (admin only) ──
  listUsers: () =>
    request<{ users: AuthUser[] }>('/api/users'),

  createUser: (data: { username: string; password: string; displayName?: string; role?: string }) =>
    request<{ user: AuthUser }>('/api/users', { method: 'POST', body: data }),

  updateUser: (id: string, data: { displayName?: string; role?: string; password?: string }) =>
    request('/api/users/' + id, { method: 'PUT', body: data }),

  deleteUser: (id: string) =>
    request('/api/users/' + id, { method: 'DELETE' }),
}

export interface AuthUser {
  id: string
  username: string
  displayName: string
  role: string
}

export interface TemplateSummary {
  id: string
  label: string
  version: number
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SeasonSummary {
  id: string
  label: string
  version: number
  ownerId?: string | null
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface SeasonSummaryWithAccess extends SeasonSummary {
  ownerDisplayName: string | null
  isOwner: boolean
  permissionRole: 'owner' | 'admin' | 'editor' | 'viewer' | null
}

export interface SeasonFull extends SeasonSummary {
  data: unknown
}

export interface SeasonPermission {
  id: string
  userId: string
  role: 'editor' | 'viewer'
  username: string | null
  displayName: string | null
}

export interface SnapshotSummary {
  id: string
  seasonId: string
  userId: string | null
  userDisplayName: string | null
  description: string | null
  snapshotType: 'full' | 'diff'
  changedFields: string[] | null
  changeCount: number | null
  createdAt: string
}

export interface SnapshotFull extends SnapshotSummary {
  data: unknown
}

export { ApiError }
