/** Never expose an HTML error page as a JSON parsing error to a curator. */
export async function readDiscoveryResponse<T>(response: Response): Promise<T> {
  if (response.redirected || response.status === 401) {
    throw new Error('Your session may have expired. Sign in again, then reload these settings.');
  }
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('The server could not confirm the request. Reload these settings before retrying a save.');
  }
  let data;
  try { data = await response.json(); }
  catch { throw new Error('The server returned an incomplete response. Reload these settings before retrying a save.'); }
  if (!response.ok) throw new Error(data?.error ?? 'Discovery settings are temporarily unavailable. Please try again.');
  return data as T;
}

export async function discoveryAdminRequest(body: Record<string, unknown>) {
  let response;
  try {
    response = await fetch('/api/admin/discovery', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
  } catch {
    throw new Error('The connection was interrupted. The save could not be confirmed; reload these settings before retrying.');
  }
  return readDiscoveryResponse<{ ok: boolean; result: unknown }>(response);
}
