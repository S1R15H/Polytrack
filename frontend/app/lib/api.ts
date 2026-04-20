export interface SavedRoute {
  id: string;
  name: string;
  origin_name: string;
  destination_name: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  mode: string;
  distance: string;
  duration: string;
  created_at: string;
}

const API_BASE_URL = typeof window !== "undefined"
  ? (import.meta.env.VITE_API_URL ?? "http://localhost:8000/api")
  : "http://localhost:8000/api";

export async function saveRoute(routeData: Omit<SavedRoute, 'id' | 'created_at'>): Promise<SavedRoute> {
  const response = await fetch(`${API_BASE_URL}/routes/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(routeData),
  });
  if (!response.ok) throw new Error('Failed to save route');
  return response.json();
}

export async function getSavedRoutes(): Promise<SavedRoute[]> {
  const response = await fetch(`${API_BASE_URL}/routes/saved`);
  if (!response.ok) throw new Error('Failed to fetch saved routes');
  return response.json();
}

export async function deleteSavedRoute(id: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/routes/${id}`, {
    method: 'DELETE',
  });
  if (!response.ok) throw new Error('Failed to delete route');
}

export async function askAi(message: string): Promise<string> {
  const response = await fetch(`${API_BASE_URL}/ai/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!response.ok) throw new Error('Failed to get AI response');
  const data = await response.json();
  return data.reply;
}
