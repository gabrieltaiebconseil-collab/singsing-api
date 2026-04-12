const API_BASE = "https://singsing-production.up.railway.app";

export interface SongResult {
  trackId: number;
  trackName: string;
  artistName: string;
  collectionName: string;
  artworkUrl100: string;
  previewUrl: string;
  trackTimeMillis: number;
  lyricsStatus?: "synced" | "plain";
}

export interface ClipResult {
  clipId: string;
  clipUrl: string;
}

export interface ReplySuggestion {
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  previewUrl: string;
  lyrics: string;
  why: string;
}

export async function searchSongs(
  query: string,
  attribute?: string
): Promise<{ results: SongResult[] }> {
  const params = new URLSearchParams({ q: query });
  if (attribute) params.set("attribute", attribute);
  const res = await fetch(`${API_BASE}/api/songs/search?${params}`);
  if (!res.ok) throw new Error("Search failed");
  return res.json();
}

export async function getLyrics(
  title: string,
  artist: string
): Promise<{
  lyrics: string;
  source: "synced" | "ai" | "plain" | "none";
  words?: Array<{ word: string; time: number }>;
}> {
  const params = new URLSearchParams({ title, artist });
  const res = await fetch(`${API_BASE}/api/songs/lyrics?${params}`);
  if (!res.ok) throw new Error("Lyrics fetch failed");
  return res.json();
}

export async function generateClip(
  previewUrl: string,
  startTime: number,
  endTime: number,
  trackDurationMs: number
): Promise<ClipResult> {
  const res = await fetch(`${API_BASE}/api/songs/clip/host`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ previewUrl, startTime, endTime, trackDurationMs }),
  });
  if (!res.ok) throw new Error("Clip generation failed");
  return res.json();
}

export async function getAISuggestions(
  message: string
): Promise<{ suggestions: ReplySuggestion[] }> {
  const res = await fetch(`${API_BASE}/api/songs/reply-suggestions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });
  if (!res.ok) throw new Error("AI suggestions failed");
  return res.json();
}

export function getClipUrl(clipId: string): string {
  return `${API_BASE}/api/songs/clip/${clipId}`;
}
