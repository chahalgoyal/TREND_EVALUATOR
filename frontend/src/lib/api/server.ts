// Server-side API proxy — bypasses CORS entirely
// SvelteKit load functions run on the server, not the browser

import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

const BASE_URL = publicEnv.PUBLIC_API_BASE_URL || 'http://4.224.99.28:3000/api/v1';
const API_KEY = env.API_KEY || '';

interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    limit: number;
    count: number;
    nextCursor?: string;
  };
}

export async function serverFetch<T>(path: string): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (API_KEY) {
    headers['x-api-key'] = API_KEY;
  }

  const res = await fetch(`${BASE_URL}${path}`, { headers });

  if (!res.ok) {
    throw new Error(`API ${res.status}: ${res.statusText}`);
  }

  const json: ApiResponse<T> = await res.json();
  return json.data;
}
