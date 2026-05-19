import { serverFetch } from '$lib/api/server';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
  try {
    const data = await serverFetch(`/trends/hashtags/${encodeURIComponent(params.tag)}/history`);
    return json({ success: true, data });
  } catch (err) {
    return json({ success: false, data: [] }, { status: 500 });
  }
};
