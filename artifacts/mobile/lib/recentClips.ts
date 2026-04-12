import AsyncStorage from "@react-native-async-storage/async-storage";

const STORAGE_KEY = "singsing_recent_clips";
const MAX_CLIPS = 10;

export interface RecentClip {
  id: string;
  trackName: string;
  artistName: string;
  artworkUrl100: string;
  clipId: string;
  clipUrl: string;
  lyricsSnippet: string;
  createdAt: number;
}

export async function getRecentClips(): Promise<RecentClip[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch {
    return [];
  }
}

export async function saveRecentClip(clip: Omit<RecentClip, "id" | "createdAt">): Promise<void> {
  try {
    const existing = await getRecentClips();
    const newClip: RecentClip = {
      ...clip,
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 6),
      createdAt: Date.now(),
    };
    const updated = [newClip, ...existing].slice(0, MAX_CLIPS);
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  } catch {}
}

export async function clearRecentClips(): Promise<void> {
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
}
