import type { Pad, RecordedPerformance, Slice } from '@almasampler/shared';

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const TOKEN_STORAGE_KEY = 'almasampler.authToken';

export type AuthUser = {
  id: string;
  email: string;
  name?: string | null;
  avatarUrl?: string | null;
};

export type RemoteProject = {
  id: string;
  shareId?: string | null;
  name: string;
  bpm: number;
  samplePath?: string | null;
  sampleOriginalName?: string | null;
  sampleMimeType?: string | null;
  sampleDurationSeconds?: number | null;
  latestRecordPath?: string | null;
  latestRecording?: RecordedPerformance | null;
  slices: Slice[];
  pads: Pad[];
  waveformZoom?: number | null;
  selectedSliceId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProjectStatePayload = {
  name?: string;
  bpm?: number;
  slices?: Slice[];
  pads?: Pad[];
  waveformZoom?: number | null;
  selectedSliceId?: string | null;
  sampleDurationSeconds?: number | null;
};

export function getStoredAuthToken() {
  return window.localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredAuthToken(token: string) {
  window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStoredAuthToken() {
  window.localStorage.removeItem(TOKEN_STORAGE_KEY);
}

async function request<T>(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  const token = getStoredAuthToken();

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => null);
    const message = errorBody?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  if (response.status === 204) {
    return null as T;
  }

  return response.json() as Promise<T>;
}

export const apiClient = {
  async loginWithGoogle(credential: string) {
    return request<{ token: string; user: AuthUser }>('/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential })
    });
  },

  async getMe() {
    return request<{ user: AuthUser }>('/me');
  },

  async getProject() {
    return request<RemoteProject>('/project');
  },

  async createShareLink() {
    return request<{ shareId: string; sharePath: string }>('/project/share', {
      method: 'POST'
    });
  },

  async deleteProject() {
    await request<null>('/project', {
      method: 'DELETE'
    });
  },

  async getSharedProject(shareId: string) {
    return request<RemoteProject>(`/public/shared/${shareId}`);
  },

  async saveProjectState(payload: ProjectStatePayload) {
    return request<RemoteProject>('/project/state', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
  },

  async uploadSample(file: File, durationSeconds: number) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('durationSeconds', String(durationSeconds));

    return request<RemoteProject>('/project/sample', {
      method: 'POST',
      body: formData
    });
  },

  async downloadSample() {
    const token = getStoredAuthToken();
    const response = await fetch(`${API_BASE_URL}/project/sample`, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });

    if (!response.ok) {
      return null;
    }

    return response.blob();
  },

  async downloadSharedSample(shareId: string) {
    const response = await fetch(`${API_BASE_URL}/public/shared/${shareId}/sample`);

    if (!response.ok) {
      return null;
    }

    return response.blob();
  },

  async saveRecording(recording: RecordedPerformance) {
    return request<RemoteProject>('/project/recording', {
      method: 'POST',
      body: JSON.stringify(recording)
    });
  },

  async getRecording() {
    return request<{ recording: RecordedPerformance | null }>('/project/recording');
  }
};
