import { Router } from "express";
import { exec, execFile } from "child_process";
import { createWriteStream, existsSync, mkdirSync, unlinkSync, readFileSync, readdirSync } from "fs";
import { pipeline } from "stream/promises";
import { Readable } from "stream";
import { join } from "path";
import { tmpdir } from "os";
import { CLASSICS_DB, type ClassicSong } from "../data/classics-db.js";

const router = Router();

const MIN_CLIP_DURATION = 3;

interface HostedClip {
  data: Buffer;
  createdAt: number;
  meta?: {
    trackName?: string;
    artistName?: string;
    artworkUrl?: string;
    lyrics?: string;
    senderName?: string;
  };
}

export const hostedClips = new Map<string, HostedClip>();

setInterval(() => {
  const now = Date.now();
  const TTL = 10 * 60 * 1000;
  for (const [id, clip] of hostedClips) {
    if (now - clip.createdAt > TTL) {
      hostedClips.delete(id);
    }
  }
}, 60 * 1000);

interface LyricWord {
  word: string;
  time: number;
}

function parseSyncedLyrics(syncedLyrics: string): LyricWord[] {
  const lines = syncedLyrics.split("\n");
  const words: LyricWord[] = [];

  for (const line of lines) {
    const lineMatch = line.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
    if (!lineMatch) continue;

    const minutes = parseInt(lineMatch[1], 10);
    const seconds = parseFloat(lineMatch[2]);
    const timeInSeconds = minutes * 60 + seconds;
    const text = lineMatch[3].trim();

    if (!text) continue;

    const lineWords = text.split(/\s+/);
    const wordDuration = lineWords.length > 1 ? 0.3 : 0;

    lineWords.forEach((w: string, i: number) => {
      if (w.trim()) {
        words.push({
          word: w,
          time: parseFloat((timeInSeconds + i * wordDuration).toFixed(2)),
        });
      }
    });
  }

  return words;
}

function plainTextToProportionalWords(text: string, estimatedDuration: number): LyricWord[] {
  const lines = text.split("\n").filter((l) => l.trim().length > 0);
  const allWords: string[] = [];

  for (const line of lines) {
    const lineWords = line.trim().split(/\s+/).filter((w) => w.length > 0);
    allWords.push(...lineWords);
  }

  if (allWords.length === 0) return [];

  return allWords.map((word, index) => ({
    word,
    time: parseFloat(((index / allWords.length) * estimatedDuration).toFixed(2)),
  }));
}

async function searchLrclib(query: string): Promise<any[]> {
  try {
    const url = `https://lrclib.net/api/search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { "User-Agent": "SingSing/1.0" },
    });
    if (!response.ok) return [];
    const data = await response.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function titleSimilarity(a: string, b: string): number {
  const wordsA = a.split(/\s+/).filter((w) => w.length > 2);
  const wordsB = b.split(/\s+/).filter((w) => w.length > 2);
  if (!wordsA.length || !wordsB.length) return 0;
  const common = wordsA.filter((w) => wordsB.includes(w));
  return common.length / Math.max(wordsA.length, wordsB.length);
}

function isTitleMatch(lrclibTitle: string, itunesTitle: string): boolean {
  const lrc = (lrclibTitle || "").toLowerCase().trim();
  const itunes = itunesTitle.toLowerCase().trim();
  if (!lrc || !itunes) return false;
  if (lrc === itunes) return true;
  if (lrc.includes(itunes) || itunes.includes(lrc)) return true;
  return titleSimilarity(lrc, itunes) > 0.5;
}

function findTitleMatchedResult(results: any[], itunesTitle: string, requireSynced: boolean): any | null {
  for (const item of results) {
    const hasContent = requireSynced ? item.syncedLyrics : (item.syncedLyrics || (item.plainLyrics && item.plainLyrics.trim().length > 10));
    if (!hasContent) continue;
    if (isTitleMatch(item.trackName || item.name || "", itunesTitle)) return item;
  }
  return null;
}

async function fetchGeniusLyrics(title: string, artist: string): Promise<string | null> {
  try {
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(title + " " + artist)}`;
    const searchResponse = await fetch(searchUrl, {
      headers: {
        "Authorization": "Bearer " + (process.env.GENIUS_ACCESS_TOKEN || ""),
      },
    });

    if (!searchResponse.ok) return null;

    const searchData = await searchResponse.json();
    const hits = searchData?.response?.hits;
    if (!hits || hits.length === 0) return null;

    const songUrl = hits[0]?.result?.url;
    if (!songUrl) return null;

    const pageResponse = await fetch(songUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; SingSing/1.0)" },
    });

    if (!pageResponse.ok) return null;

    const html = await pageResponse.text();

    const lyricsMatches = html.match(/data-lyrics-container="true"[^>]*>([\s\S]*?)(?=<\/div>)/g);
    if (!lyricsMatches || lyricsMatches.length === 0) return null;

    let lyrics = lyricsMatches
      .map((m) => m.replace(/data-lyrics-container="true"[^>]*>/, ""))
      .join("\n");

    lyrics = lyrics
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#039;/g, "'")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    return lyrics.length > 10 ? lyrics : null;
  } catch {
    return null;
  }
}

async function generateLyricsWithAI(title: string, artist: string): Promise<string | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) return null;

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: `Write the lyrics of "${title}" by ${artist} in the original language. Return only the lyrics, no commentary, no title, no attribution. If you don't know the exact lyrics, write approximate lyrics that match the style and theme of the song.`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    const text = data?.content?.[0]?.text;
    return text && text.length > 10 ? text.trim() : null;
  } catch {
    return null;
  }
}

async function generateTimestampedLyricsWithAI(title: string, artist: string, durationSeconds: number): Promise<LyricWord[] | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) return null;

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 4096,
        messages: [
          {
            role: "user",
            content: `Write the complete lyrics of "${title}" by ${artist}. Return ONLY a JSON array of objects: [{"word": "string", "time": number}] where time is the estimated timestamp in seconds for each word in the full song. The song duration is approximately ${durationSeconds} seconds. Space the timestamps proportionally across the song duration. No other text, no markdown, no code blocks — just the raw JSON array.`,
          },
        ],
      }),
    });

    if (!response.ok) return null;

    const data = await response.json();
    let text = data?.content?.[0]?.text;
    if (!text) return null;

    text = text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) return null;

    const words: LyricWord[] = parsed
      .filter((item: any) => item.word && typeof item.time === "number")
      .map((item: any) => ({
        word: String(item.word),
        time: parseFloat(Number(item.time).toFixed(2)),
      }));

    return words.length > 5 ? words : null;
  } catch {
    return null;
  }
}

function findClosestTitleMatch(results: any[], targetTitle: string): any | null {
  if (results.length === 0) return null;

  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\u00C0-\u024F]/g, "");
  const target = normalize(targetTitle);

  let bestMatch: any = null;
  let bestScore = 0;

  for (const item of results) {
    const itemTitle = normalize(item.trackName || item.name || "");
    if (!itemTitle) continue;

    let score = 0;
    if (itemTitle === target) {
      score = 1;
    } else if (itemTitle.includes(target) || target.includes(itemTitle)) {
      score = 0.8;
    } else {
      const targetWords = target.split(/\s+/);
      const itemWords = itemTitle.split(/\s+/);
      const common = targetWords.filter((w: string) => itemWords.some((iw: string) => iw.includes(w) || w.includes(iw)));
      score = targetWords.length > 0 ? common.length / targetWords.length * 0.6 : 0;
    }

    if (score > bestScore && item.syncedLyrics) {
      bestScore = score;
      bestMatch = item;
    }
  }

  return bestMatch;
}

async function createClipFile(
  previewUrl: string,
  startTime: number,
  endTime: number,
  trackDurationMs: number,
  log: any
): Promise<{ data: Buffer; cleanup: () => void } | null> {
  const clipTmpDir = join(tmpdir(), "singsing-clips");
  if (!existsSync(clipTmpDir)) {
    mkdirSync(clipTmpDir, { recursive: true });
  }

  const id = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  const inputPath = join(clipTmpDir, `input-${id}.m4a`);
  const outputPath = join(clipTmpDir, `clip-${id}.m4a`);

  const audioResponse = await fetch(previewUrl);
  if (!audioResponse.ok || !audioResponse.body) {
    return null;
  }

  const fileStream = createWriteStream(inputPath);
  await pipeline(Readable.fromWeb(audioResponse.body as any), fileStream);

  const previewDuration = 30;
  const trackDuration = trackDurationMs ? trackDurationMs / 1000 : 180;
  const previewStartInSong = Math.max(0, trackDuration * 0.3);

  const rawClipStart = startTime - previewStartInSong;
  const rawClipEnd = endTime - previewStartInSong;

  log.info({
    startTime,
    endTime,
    trackDuration,
    previewStartInSong,
    rawClipStart,
    rawClipEnd,
    previewDuration,
  }, "Clip time conversion");

  if (rawClipStart < -1 || rawClipEnd > previewDuration + 1) {
    log.warn({ rawClipStart, rawClipEnd }, "Selection outside preview bounds");
  }

  let clipStartInPreview = Math.max(0, rawClipStart);
  let clipEndInPreview = Math.min(previewDuration, rawClipEnd);

  let clipDuration = clipEndInPreview - clipStartInPreview;
  if (clipDuration < MIN_CLIP_DURATION) {
    clipEndInPreview = Math.min(previewDuration, clipStartInPreview + MIN_CLIP_DURATION);
    clipDuration = clipEndInPreview - clipStartInPreview;

    if (clipDuration < MIN_CLIP_DURATION) {
      clipStartInPreview = Math.max(0, clipEndInPreview - MIN_CLIP_DURATION);
      clipDuration = clipEndInPreview - clipStartInPreview;
    }
  }

  log.info({ clipStartInPreview: clipStartInPreview.toFixed(2), clipDuration: clipDuration.toFixed(2) }, "FFmpeg cut params");

  const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -ss ${clipStartInPreview.toFixed(2)} -t ${clipDuration.toFixed(2)} -c:a aac -b:a 128k -ar 44100 -ac 1 "${outputPath}"`;

  await new Promise<void>((resolve, reject) => {
    exec(ffmpegCmd, { timeout: 15000 }, (error, _stdout, stderr) => {
      if (error) {
        log.error({ error, stderr }, "FFmpeg clip extraction failed");
        reject(error);
      } else {
        resolve();
      }
    });
  });

  if (!existsSync(outputPath)) {
    try { unlinkSync(inputPath); } catch {}
    return null;
  }

  const clipData = readFileSync(outputPath);
  const cleanup = () => {
    try { unlinkSync(inputPath); } catch {}
    try { unlinkSync(outputPath); } catch {}
  };

  return { data: clipData, cleanup };
}

function normalizeForLookup(query: string): string {
  return query.toLowerCase().trim()
    .replace(/[\u00E9\u00E8\u00EA\u00EB]/g, "e")
    .replace(/[\u00E0\u00E2\u00E4]/g, "a")
    .replace(/[\u00F9\u00FB\u00FC]/g, "u")
    .replace(/[\u00EE\u00EF]/g, "i")
    .replace(/[\u00F4\u00F6]/g, "o")
    .replace(/\u00E7/g, "c")
    .replace(/[''`\u2019\u2018]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ");
}

function classicLookup(query: string): ClassicSong | null {
  const normalized = normalizeForLookup(query);
  if (normalized.length < 3) return null;

  const normalizedNoSpaces = normalized.replace(/\s+/g, "");

  let bestMatch: ClassicSong | null = null;
  let bestScore = 0;

  for (const [key, val] of Object.entries(CLASSICS_DB)) {
    const normalizedKey = normalizeForLookup(key);
    const normalizedKeyNoSpaces = normalizedKey.replace(/\s+/g, "");

    if (normalized === normalizedKey || normalizedNoSpaces === normalizedKeyNoSpaces) return val;

    let score = 0;

    if (normalizedKey.length >= 5 && normalized.includes(normalizedKey)) {
      score = normalizedKey.length / normalized.length;
    } else if (normalized.length >= 5 && normalizedKey.includes(normalized)) {
      score = normalized.length / normalizedKey.length;
    } else {
      const normWords = normalized.split(" ").filter(w => w.length >= 2);
      const keyWords = normalizedKey.split(" ").filter(w => w.length >= 2);
      if (normWords.length >= 2 && keyWords.length >= 2) {
        const matchCount = normWords.filter(w => keyWords.some(kw => kw === w)).length;
        const ratio = matchCount / Math.max(normWords.length, keyWords.length);
        if (matchCount >= 2 && ratio > 0.6) {
          score = ratio * 0.8;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = val;
    }
  }

  return bestScore >= 0.4 ? bestMatch : null;
}

async function createYouTubeClipFile(
  youtubeQuery: string,
  startSeconds: number,
  durationSeconds: number,
  log: any
): Promise<{ data: Buffer; cleanup: () => void } | null> {
  const clipTmpDir = join(tmpdir(), "singsing-yt-clips");
  if (!existsSync(clipTmpDir)) {
    mkdirSync(clipTmpDir, { recursive: true });
  }

  const id = Date.now().toString() + Math.random().toString(36).substr(2, 6);
  const rawPath = join(clipTmpDir, `yt-raw-${id}`);
  const clipPath = join(clipTmpDir, `yt-clip-${id}.m4a`);

  const sanitizedQuery = youtubeQuery.replace(/[^\w\s\-'àâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ]/gi, '').slice(0, 200);
  if (!sanitizedQuery.trim()) {
    log.error("YouTube query is empty after sanitization");
    return null;
  }

  const ytArgs = [
    "-x", "--audio-format", "m4a", "--audio-quality", "128K",
    "-o", `${rawPath}.%(ext)s`,
    `ytsearch1:${sanitizedQuery}`,
    "--no-playlist", "--no-warnings"
  ];

  log.info({ youtubeQuery: sanitizedQuery, startSeconds, durationSeconds }, "yt-dlp full download starting");

  try {
    await new Promise<void>((resolve, reject) => {
      execFile("yt-dlp", ytArgs, { timeout: 120000 }, (error, stdout, stderr) => {
        if (error) {
          log.error({ error, stdout, stderr }, "yt-dlp download failed");
          reject(error);
        } else {
          log.info("yt-dlp download complete");
          resolve();
        }
      });
    });
  } catch {
    return null;
  }

  const downloadedFiles = readdirSync(clipTmpDir).filter(f => f.startsWith(`yt-raw-${id}`));
  if (downloadedFiles.length === 0) {
    log.error("yt-dlp output file not found");
    return null;
  }

  const downloadedPath = join(clipTmpDir, downloadedFiles[0]);
  log.info({ downloadedPath }, "Downloaded file found, clipping with ffmpeg");

  const ffmpegArgs = [
    "-y", "-i", downloadedPath,
    "-ss", startSeconds.toFixed(2), "-t", durationSeconds.toFixed(2),
    "-c:a", "aac", "-b:a", "128k", "-ar", "44100", "-ac", "1",
    clipPath
  ];

  try {
    await new Promise<void>((resolve, reject) => {
      execFile("ffmpeg", ffmpegArgs, { timeout: 15000 }, (error, _stdout, stderr) => {
        if (error) {
          log.error({ error, stderr }, "FFmpeg clip extraction failed");
          reject(error);
        } else {
          resolve();
        }
      });
    });
  } catch {
    try { unlinkSync(downloadedPath); } catch {}
    return null;
  }

  if (!existsSync(clipPath)) {
    try { unlinkSync(downloadedPath); } catch {}
    return null;
  }

  const clipData = readFileSync(clipPath);
  const cleanup = () => {
    try { unlinkSync(downloadedPath); } catch {}
    try { unlinkSync(clipPath); } catch {}
  };

  return { data: clipData, cleanup };
}

async function identifySongWithAI(query: string, log: any): Promise<{ title: string; artist: string; year: number; youtube_query: string; iconic_lyrics_fragment: string; confidence: string } | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) return null;

  try {
    const response = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: `Tu es un expert musical. L'utilisateur cherche: "${query}"\n\nIdentifie LA chanson iconique et retourne ce JSON:\n{"title":"titre exact","artist":"artiste exact","year":1969,"youtube_query":"titre artiste annee original","iconic_lyrics_fragment":"le passage le plus connu","confidence":"certain"}\n\nToujours identifier LA version originale iconique. Retourne UNIQUEMENT le JSON, rien d'autre.` }],
      }),
    });
    if (!response.ok) return null;
    const data = await response.json();
    let text = data?.content?.[0]?.text?.trim();
    if (!text) return null;
    text = text.replace(/^```json?\s*/i, "").replace(/\s*```$/i, "").trim();
    return JSON.parse(text);
  } catch (err) {
    log.error({ err }, "AI song identification failed");
    return null;
  }
}

interface ChorusInfo {
  startTime: number;
  endTime: number;
  startWordIndex: number;
  endWordIndex: number;
  chorusText: string;
  inPreview: boolean;
}

interface LrcLine {
  time: number;
  text: string;
  normalized: string;
}

function parseLrcLines(syncedLyrics: string): LrcLine[] {
  const result: LrcLine[] = [];
  for (const line of syncedLyrics.split("\n")) {
    const match = line.match(/\[(\d+):(\d+\.\d+)\]\s*(.*)/);
    if (!match) continue;
    const time = parseInt(match[1], 10) * 60 + parseFloat(match[2]);
    const text = match[3].trim();
    if (!text) continue;
    result.push({
      time,
      text,
      normalized: text.toLowerCase().replace(/[^\w\s\u00C0-\u024F]/g, "").trim(),
    });
  }
  return result;
}

function detectChorusFromLrc(syncedLyrics: string, words: LyricWord[], trackDurationMs: number): ChorusInfo | null {
  const lrcLines = parseLrcLines(syncedLyrics);
  if (lrcLines.length < 4) return null;

  const lineCounts = new Map<string, number>();
  for (const line of lrcLines) {
    if (line.normalized.length > 5) {
      lineCounts.set(line.normalized, (lineCounts.get(line.normalized) || 0) + 1);
    }
  }

  let bestLine: string | null = null;
  let bestScore = 0;
  for (const [text, count] of lineCounts) {
    if (count < 2) continue;
    const lengthBonus = Math.min(text.length / 30, 1.5);
    const score = count * lengthBonus;
    if (score > bestScore) {
      bestScore = score;
      bestLine = text;
    }
  }

  if (!bestLine) {
    const pairCounts = new Map<string, { count: number; firstIdx: number }>();
    for (let i = 0; i < lrcLines.length - 1; i++) {
      if (lrcLines[i].normalized.length <= 5) continue;
      const pair = lrcLines[i].normalized + " | " + lrcLines[i + 1].normalized;
      if (!pairCounts.has(pair)) {
        pairCounts.set(pair, { count: 1, firstIdx: i });
      } else {
        pairCounts.get(pair)!.count++;
      }
    }

    let bestPairIdx = -1;
    let bestPairScore = 0;
    for (const [, info] of pairCounts) {
      if (info.count >= 2 && info.count > bestPairScore) {
        bestPairScore = info.count;
        bestPairIdx = info.firstIdx;
      }
    }

    if (bestPairIdx >= 0) {
      return buildChorusInfo(lrcLines, bestPairIdx, bestPairIdx + 1, words, trackDurationMs, lineCounts);
    }
    return null;
  }

  const firstIdx = lrcLines.findIndex(l => l.normalized === bestLine);
  if (firstIdx < 0) return null;

  let endIdx = firstIdx;
  for (let i = firstIdx + 1; i < lrcLines.length && i <= firstIdx + 4; i++) {
    const count = lineCounts.get(lrcLines[i].normalized) || 0;
    if (count >= 2 && lrcLines[i].normalized.length > 5) {
      endIdx = i;
    } else {
      break;
    }
  }

  return buildChorusInfo(lrcLines, firstIdx, endIdx, words, trackDurationMs, lineCounts);
}

function buildChorusInfo(
  lrcLines: LrcLine[],
  startLineIdx: number,
  endLineIdx: number,
  words: LyricWord[],
  trackDurationMs: number,
  _lineCounts: Map<string, number>,
): ChorusInfo | null {
  const chorusStartTime = lrcLines[startLineIdx].time;
  const nextLineTime = endLineIdx + 1 < lrcLines.length ? lrcLines[endLineIdx + 1].time : lrcLines[endLineIdx].time + 5;
  const chorusEndTime = nextLineTime;

  let startWordIdx = 0;
  let endWordIdx = words.length - 1;
  for (let i = 0; i < words.length; i++) {
    if (words[i].time >= chorusStartTime - 0.1) {
      startWordIdx = i;
      break;
    }
  }
  for (let i = words.length - 1; i >= 0; i--) {
    if (words[i].time < chorusEndTime) {
      endWordIdx = i;
      break;
    }
  }

  if (endWordIdx <= startWordIdx) return null;

  const previewStart = (trackDurationMs / 1000) * 0.3;
  const previewEnd = previewStart + 30;
  const chorusDuration = chorusEndTime - chorusStartTime;
  const overlapStart = Math.max(chorusStartTime, previewStart);
  const overlapEnd = Math.min(chorusEndTime, previewEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  const inPreview = chorusDuration > 0 && (overlap / chorusDuration) >= 0.6;

  return {
    startTime: chorusStartTime,
    endTime: chorusEndTime,
    startWordIndex: startWordIdx,
    endWordIndex: endWordIdx,
    chorusText: words.slice(startWordIdx, endWordIdx + 1).map(w => w.word).join(" "),
    inPreview,
  };
}

function detectChorus(words: LyricWord[], trackDurationMs: number): ChorusInfo | null {
  return null;
}

function isChorusInPreviewWindow(chorusStart: number, chorusEnd: number, trackDurationMs: number): boolean {
  const previewStart = (trackDurationMs / 1000) * 0.3;
  const previewEnd = previewStart + 30;
  const chorusDuration = chorusEnd - chorusStart;
  if (chorusDuration <= 0) return false;
  const overlapStart = Math.max(chorusStart, previewStart);
  const overlapEnd = Math.min(chorusEnd, previewEnd);
  const overlap = Math.max(0, overlapEnd - overlapStart);
  return (overlap / chorusDuration) >= 0.6;
}

async function getSyncedLyricsForTrack(title: string, artist: string): Promise<string | null> {
  try {
    const results1 = await searchLrclib(title + " " + artist);
    const match1 = findTitleMatchedResult(results1, title, true);
    if (match1?.syncedLyrics) return match1.syncedLyrics;

    const results2 = await searchLrclib(title);
    const match2 = findTitleMatchedResult(results2, title, true);
    if (match2?.syncedLyrics) return match2.syncedLyrics;

    return null;
  } catch {
    return null;
  }
}

async function checkLyricsAvailability(title: string, artist: string): Promise<"synced" | "plain" | "ai_available" | "waveform_only"> {
  try {
    const results1 = await searchLrclib(title + " " + artist);
    if (findTitleMatchedResult(results1, title, true)) return "synced";
    if (findTitleMatchedResult(results1, title, false)) return "plain";

    const results2 = await searchLrclib(title);
    if (findTitleMatchedResult(results2, title, true)) return "synced";
    if (findTitleMatchedResult(results2, title, false)) return "plain";

    const geniusConfirmed = await checkGeniusAvailability(title, artist);
    if (geniusConfirmed) return "ai_available";

    const hasAI = !!(process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL && process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY);
    if (hasAI) return "ai_available";

    return "waveform_only";
  } catch {
    return "waveform_only";
  }
}

async function checkGeniusAvailability(title: string, artist: string): Promise<boolean> {
  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const resp = await fetch(`https://genius.com/api/search?q=${query}`, {
      headers: { "User-Agent": "SingSing/1.0" },
      signal: AbortSignal.timeout(3000),
    });
    if (!resp.ok) return false;
    const data = await resp.json();
    const hit = data?.response?.hits?.[0]?.result;
    if (!hit) return false;
    const titleMatch = stringSimilarity(hit.title || "", title) > 0.4;
    const artistMatch = stringSimilarity(hit.primary_artist?.name || "", artist) > 0.3;
    return titleMatch && artistMatch;
  } catch {
    return false;
  }
}

async function searchGeniusForLyrics(title: string, artist: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`${title} ${artist}`);
    const resp = await fetch(`https://genius.com/api/search?q=${query}`, {
      headers: { "User-Agent": "SingSing/1.0" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const hit = data?.response?.hits?.[0]?.result;
    if (!hit) return null;
    const titleMatch = stringSimilarity(hit.title || "", title) > 0.4;
    const artistMatch = stringSimilarity(hit.primary_artist?.name || "", artist) > 0.3;
    if (!titleMatch || !artistMatch) return null;
    return hit.title;
  } catch {
    return null;
  }
}

async function searchGeniusByLyrics(lyricsSnippet: string, log: any): Promise<{ title: string; artist: string } | null> {
  const token = process.env.GENIUS_ACCESS_TOKEN;
  if (!token) {
    log.warn("GENIUS_ACCESS_TOKEN not set, skipping Genius lyrics search");
    return null;
  }
  try {
    const searchUrl = `https://api.genius.com/search?q=${encodeURIComponent(lyricsSnippet)}`;
    const resp = await Promise.race([
      fetch(searchUrl, {
        headers: { "Authorization": `Bearer ${token}` },
      }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("Genius timeout")), 5000)),
    ]) as Response;

    if (!resp.ok) {
      log.warn({ status: resp.status }, "Genius API returned non-OK status");
      return null;
    }

    const data = await resp.json();
    const hits = data?.response?.hits;
    if (!hits || hits.length === 0) return null;

    const best = hits[0]?.result;
    if (!best) return null;

    const title = best.title || "";
    const artist = best.primary_artist?.name || "";
    if (!title || !artist) return null;

    log.info({ geniusTitle: title, geniusArtist: artist, query: lyricsSnippet }, "Genius lyrics search found match");
    return { title, artist };
  } catch (err) {
    log.warn({ err }, "Genius lyrics search failed");
    return null;
  }
}

const aiSearchCache = new Map<string, { results: any[]; timestamp: number }>();
const AI_CACHE_TTL = 24 * 60 * 60 * 1000;
const AI_CACHE_MAX = 500;

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of aiSearchCache) {
    if (now - entry.timestamp > AI_CACHE_TTL) aiSearchCache.delete(key);
  }
}, 60 * 60 * 1000);

type SearchMode = "paroles" | "artiste" | "titre" | "album" | "soundtrack" | "humeur" | "evenement" | "vocal";
type AppLang = "fr" | "en" | "es" | "it" | "tr" | "ar" | "pt" | "de" | "mix";

const LANG_RULES: Record<AppLang, { claudeInstruction: string; itunesCountry: string }> = {
  fr: {
    claudeInstruction: `RÈGLE ABSOLUE: Propose en priorité des chansons françaises ou très connues en France. Si la chanson cherchée est dans une autre langue, accepte-la. Mais pour les suggestions automatiques (humeur, événements), toujours favoriser le français.`,
    itunesCountry: "fr",
  },
  en: {
    claudeInstruction: `Suggest primarily English-language songs. International hits in other languages are OK if specifically searched.`,
    itunesCountry: "us",
  },
  es: {
    claudeInstruction: `Propón principalmente canciones en español. España y Latinoamérica.`,
    itunesCountry: "es",
  },
  it: {
    claudeInstruction: `Suggerisci principalmente canzoni italiane.`,
    itunesCountry: "it",
  },
  tr: {
    claudeInstruction: `Öncelikli olarak Türkçe şarkılar öner.`,
    itunesCountry: "tr",
  },
  ar: {
    claudeInstruction: `اقترح أغاني عربية بالدرجة الأولى. المغرب، الجزائر، تونس، مصر، الخليج.`,
    itunesCountry: "sa",
  },
  pt: {
    claudeInstruction: `Sugira principalmente músicas em português. Brasil e Portugal.`,
    itunesCountry: "br",
  },
  de: {
    claudeInstruction: `Schlage hauptsächlich deutschsprachige Songs vor.`,
    itunesCountry: "de",
  },
  mix: {
    claudeInstruction: `Suggest songs from diverse languages and cultures worldwide. Always include variety.`,
    itunesCountry: "us",
  },
};

function getModePrompt(mode: SearchMode, query: string): string {
  if (mode === "evenement") {
    const eventPrompts: Record<string, string> = {
      fete_meres: "Trouve 5 chansons magnifiques et touchantes pour la f\u00EAte des m\u00E8res. Toutes langues. Des chansons qui font pleurer de bonheur. Mix g\u00E9n\u00E9rations.",
      fete_peres: "Trouve 5 chansons \u00E9mouvantes pour la f\u00EAte des p\u00E8res. Toutes langues. Chansons sur le lien p\u00E8re-enfant, l'admiration, la gratitude.",
      fete_grandmeres: "Trouve 5 chansons douces et tendres pour les grands-m\u00E8res. Toutes langues. Nostalgie, amour inconditionnel, sagesse.",
      fete_grandperes: "Trouve 5 chansons pour les grands-p\u00E8res. Toutes langues. Respect, transmission, aventure de vie.",
      naissance: "Trouve 5 chansons tendres et joyeuses pour c\u00E9l\u00E9brer une naissance.",
      anniversaire: "Trouve 5 chansons parfaites pour souhaiter un joyeux anniversaire. Mix de langues. Dr\u00F4les et touchantes.",
      premier_message_elle: "Trouve 5 chansons parfaites pour un premier message de drague \u00E9l\u00E9gant envoy\u00E9 \u00E0 une femme. Romantiques, pas vulgaires, l\u00E9g\u00E8rement s\u00E9duisantes. Toutes langues. Des paroles qui font sourire et donnent envie de r\u00E9pondre.",
      premier_message_lui: "Trouve 5 chansons parfaites pour un premier message de drague envoy\u00E9 \u00E0 un homme. Confiantes, s\u00E9duisantes, l\u00E9g\u00E8res. Toutes langues. Des paroles qui intriguent et donnent envie de r\u00E9pondre.",
      saint_valentin: "Trouve 5 chansons d'amour intemporelles pour la Saint Valentin. Romantiques, passionn\u00E9es, de toutes langues et \u00E9poques. Mix classiques et modernes.",
      demande_mariage: "Trouve 5 chansons inoubliables pour accompagner une demande en mariage. Bouleversantes d'amour. Toutes langues.",
      mariage: "Trouve 5 chansons romantiques et inoubliables pour f\u00E9liciter des mari\u00E9s. Toutes langues.",
      reconciliation: "Trouve 5 chansons de r\u00E9conciliation et de pardon. \u00C9mouvantes, sinc\u00E8res, qui demandent pardon ou c\u00E9l\u00E8brent le retour. Toutes langues.",
      anniversaire_couple: "Trouve 5 chansons pour c\u00E9l\u00E9brer un anniversaire de couple. Amour qui dure, complicit\u00E9, bonheur partag\u00E9. Toutes langues.",
      rupture: "Trouve 5 chansons pour accompagner quelqu'un apr\u00E8s une rupture. Empathiques mais pas trop sombres.",
      aid_el_fitr: "Trouve 5 chansons de joie et de c\u00E9l\u00E9bration pour l'A\u00EFd el-Fitr. Mix arabe, fran\u00E7ais, turc, international. Festives et spirituelles.",
      aid_el_adha: "Trouve 5 chansons pour l'A\u00EFd el-Adha. Gratitude, famille, partage. Mix cultures musulmanes.",
      ramadan: "Trouve 5 chansons spirituelles et apaisantes pour le Ramadan. Mix arabe, turc, international. Recueillement et partage.",
      roch_hachana: "Trouve 5 chansons pour Roch Hachana. Renouveau, espoir, famille. Mix h\u00E9breu, fran\u00E7ais, international.",
      hanoucca: "Trouve 5 chansons joyeuses pour Hanoukka. Lumi\u00E8re, famille, c\u00E9l\u00E9bration. Mix cultures juives.",
      noel: "Trouve 5 chansons de No\u00EBl intemporelles et touchantes. Pas forc\u00E9ment les classiques \u2014 des chansons qui donnent des frissons. Toutes langues.",
      paques: "Trouve 5 chansons de renouveau et de joie pour P\u00E2ques. Printemps, renaissance, famille. Toutes langues.",
      diwali: "Trouve 5 chansons joyeuses et color\u00E9es pour Diwali. Mix hindi, international. Lumi\u00E8re, victoire du bien.",
      nouvel_an_chinois: "Trouve 5 chansons festives pour le Nouvel An chinois. Mix mandarin, cantonais, international. Prosp\u00E9rit\u00E9, famille, chance.",
      nouvel_an: "Trouve 5 chansons universelles pour le Nouvel An. Espoir, nouveau d\u00E9part, f\u00EAte. Toutes langues et cultures.",
      diplome: "Trouve 5 chansons qui c\u00E9l\u00E8brent la r\u00E9ussite et l'accomplissement. Motivantes et joyeuses.",
      nouveau_job: "Trouve 5 chansons qui c\u00E9l\u00E8brent un nouveau d\u00E9part professionnel. Motivantes.",
      promotion: "Trouve 5 chansons de victoire et de succ\u00E8s. Energiques et fi\u00E8res.",
      nouvelle_maison: "Trouve 5 chansons sur le foyer, la maison, le chez-soi.",
      victoire_sportive: "Trouve 5 chansons de victoire et de triomphe pour c\u00E9l\u00E9brer une victoire sportive. Euphorie, fiert\u00E9, d\u00E9passement. Toutes langues.",
      guerison: "Trouve 5 chansons de force et de r\u00E9tablissement pour quelqu'un qui gu\u00E9rit. Encourageantes, lumineuses, pleines d'espoir. Toutes langues.",
      au_revoir: "Trouve 5 chansons d'au revoir et de s\u00E9paration. Touchantes sans \u00EAtre tristes.",
      retraite: "Trouve 5 chansons pour c\u00E9l\u00E9brer une retraite bien m\u00E9rit\u00E9e. Joyeuses et nostalgiques.",
      condoleances: "Trouve 5 chansons douces et r\u00E9confortantes pour accompagner un deuil. Respectueuses.",
      encouragement: "Trouve 5 chansons pour encourager quelqu'un dans une \u00E9preuve. Puissantes et bienveillantes.",
    };
    const parts = query.split(":");
    const eventKey = parts[0];
    const personalization = parts.slice(1).join(":").trim();
    const basePrompt = eventPrompts[eventKey] || `Trouve 5 chansons parfaites pour l'\u00E9v\u00E9nement "${query}". Toutes langues.`;
    if (personalization) {
      return `${basePrompt} C'est pour ${personalization}. Personnalise tes suggestions en cons\u00E9quence.`;
    }
    return basePrompt;
  }

  const prompts: Record<string, string> = {
    paroles: `L'utilisateur cherche une chanson dont il connait un fragment de paroles: "${query}". Identifie la chanson exacte.`,
    artiste: `L'utilisateur cherche des chansons de cet artiste: "${query}". Trouve le nom exact iTunes.`,
    titre: `L'utilisateur cherche une chanson avec ce titre approximatif: "${query}". Trouve le titre exact.`,
    humeur: `L'utilisateur veut des chansons qui correspondent \u00E0 cette humeur/\u00E9motion: "${query}". Sugg\u00E8re 5 chansons parfaites de toutes langues.`,
    soundtrack: `L'utilisateur cherche une chanson li\u00E9e \u00E0 ce film/s\u00E9rie/\u00E9v\u00E9nement: "${query}". Identifie les chansons associ\u00E9es.`,
    vocal: `L'utilisateur a fredonn\u00E9 ou dit ces mots: "${query}". C'est peut-\u00EAtre approximatif \u2014 identifie la chanson probable.`,
    album: `L'utilisateur cherche des chansons de cet album: "${query}". Trouve l'album exact et ses chansons.`,
  };
  return prompts[mode] || prompts.paroles;
}

function stringSimilarity(a: string, b: string): number {
  const al = a.toLowerCase().trim();
  const bl = b.toLowerCase().trim();
  if (al === bl) return 1;
  if (!al || !bl) return 0;
  const longer = al.length > bl.length ? al : bl;
  const shorter = al.length > bl.length ? bl : al;
  if (longer.includes(shorter)) return shorter.length / longer.length;
  let matches = 0;
  const shorterWords = shorter.split(/\s+/);
  const longerWords = longer.split(/\s+/);
  for (const sw of shorterWords) {
    if (longerWords.some(lw => lw === sw)) matches++;
  }
  return shorterWords.length > 0 ? matches / Math.max(shorterWords.length, longerWords.length) : 0;
}

async function aiInterpretQuery(query: string, mode: SearchMode, log: any, lang: AppLang = "fr"): Promise<{ itunes_queries: string[]; likely_song: string | null; likely_artist: string | null; search_lang: string | null } | null> {
  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;
  if (!baseUrl || !apiKey) return null;

  const langRule = LANG_RULES[lang]?.claudeInstruction || LANG_RULES.fr.claudeInstruction;

  try {
    const response = await Promise.race([
      fetch(`${baseUrl}/v1/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-haiku-4-5",
          max_tokens: 500,
          system: `Tu es un expert musical mondial. La préférence langue de l'utilisateur est "${lang}". ${langRule}

RÈGLE CRITIQUE DE LANGUE: La préférence "${lang}" = suggestions par défaut UNIQUEMENT. Ne filtre JAMAIS.
- Si la requête contient un artiste/titre dans une langue spécifique → utilise cette langue (search_lang)
- Si la requête contient "en espagnol", "in english", "italiano", etc. → utilise cette langue
- Si la requête est vague (humeur, événement, pas d'artiste/titre précis) → utilise la préférence "${lang}"

Exemples:
- "despacito" → search_lang: "es" (titre espagnol détecté)
- "shakira" → search_lang: "es" (artiste hispanique)
- "une chanson italienne pour mariage" → search_lang: "it" (demande explicite)
- "something in english about love" → search_lang: "en" (demande explicite)
- "chanson triste" (user=fr) → search_lang: "fr" (vague → préférence)
- "bir şarkı" → search_lang: "tr" (requête en turc)
- "mamma mia" → search_lang: "it" (titre italien)
- "bohemian rhapsody" → search_lang: "en" (titre anglais connu)
- "por favor una cancion" → search_lang: "es" (requête en espagnol)`,
          messages: [{
            role: "user",
            content: `${getModePrompt(mode, query)}

Retourne UNIQUEMENT ce JSON valide, sans markdown:
{
  "itunes_queries": ["query iTunes précise 1", "query iTunes précise 2", "query iTunes précise 3"],
  "likely_song": "titre exact ou null",
  "likely_artist": "artiste exact ou null",
  "search_lang": "fr|en|es|it|tr|ar|pt|de"
}

Règles:
- itunes_queries doit contenir "titre artiste" format pour meilleurs résultats
- search_lang = la langue DÉTECTÉE de la requête (pas forcément la préférence utilisateur)
- Si requête vague (humeur, événement sans artiste précis) → search_lang = "${lang}"
- Si artiste/titre identifié dans une autre langue → search_lang = langue de cet artiste/titre
- Jamais de markdown, uniquement le JSON brut`,
          }],
        }),
      }),
      new Promise<Response>((_, reject) => setTimeout(() => reject(new Error("AI timeout")), 5000)),
    ]) as Response;

    if (!response.ok) return null;
    const data = await response.json();
    let text = data?.content?.[0]?.text?.trim();
    if (!text) return null;
    if (text.startsWith("```")) text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    return JSON.parse(text);
  } catch (err) {
    log.warn({ err }, "AI search interpretation failed");
    return null;
  }
}

async function searchItunes(query: string, attribute?: string, limit = 10, country = "fr"): Promise<any[]> {
  try {
    let url = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=${limit}&country=${country}`;
    if (attribute && ["artistTerm", "songTerm", "albumTerm"].includes(attribute)) {
      url += `&attribute=${attribute}`;
    }
    const response = await fetch(url);
    const data = await response.json();
    return (data.results || []).map((item: any) => ({
      trackId: item.trackId,
      trackName: item.trackName || "Unknown",
      artistName: item.artistName || "Unknown",
      collectionName: item.collectionName || "Unknown",
      artworkUrl100: item.artworkUrl100 || "",
      previewUrl: item.previewUrl || "",
      trackTimeMillis: item.trackTimeMillis || 0,
      releaseDate: item.releaseDate || null,
      trackCount: item.trackCount || 0,
    }));
  } catch {
    return [];
  }
}

async function enrichWithLyricsStatus(songs: any[]): Promise<any[]> {
  return Promise.all(
    songs.map(async (song: any) => {
      const lyricsStatus = await checkLyricsAvailability(song.trackName, song.artistName);
      return { ...song, lyricsStatus };
    })
  );
}

async function youtubeSearchMetadata(query: string, log: any): Promise<any | null> {
  const sanitizedQuery = query.replace(/[^\w\s\-'àâäéèêëïîôùûüÿçœæÀÂÄÉÈÊËÏÎÔÙÛÜŸÇŒÆ]/gi, '').slice(0, 200);
  if (!sanitizedQuery.trim()) return null;

  try {
    const result = await new Promise<string>((resolve, reject) => {
      execFile("yt-dlp", [
        "--dump-json", "--no-playlist", "--no-warnings",
        `ytsearch1:${sanitizedQuery}`
      ], { timeout: 15000 }, (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      });
    });

    const info = JSON.parse(result);
    return {
      id: info.id,
      title: info.title || query,
      artist: info.channel || info.uploader || "Unknown",
      duration: info.duration || 0,
      thumbnail: info.thumbnail || "",
      youtube_id: info.id,
      source: "youtube",
    };
  } catch (err) {
    log.warn({ err, query: sanitizedQuery }, "YouTube metadata search failed");
    return null;
  }
}

type CuratedSong = { title: string; artist: string; searchQuery: string; fragment: string; why: string; familiarity: string };

const CURATED_EVENTS: Record<string, CuratedSong[]> = {
  anniversaire: [
    { title: "Happy Birthday to You", artist: "Stevie Wonder", searchQuery: "Happy Birthday Stevie Wonder", fragment: "Happy birthday to you, happy birthday to you", why: "La version la plus connue au monde", familiarity: "iconique" },
    { title: "Joyeux Anniversaire", artist: "Socle / Traditionnel", searchQuery: "Joyeux Anniversaire chanson fran\u00E7aise", fragment: "Joyeux anniversaire, joyeux anniversaire", why: "Le classique fran\u00E7ais universel", familiarity: "iconique" },
    { title: "In Da Club", artist: "50 Cent", searchQuery: "In Da Club 50 Cent", fragment: "Go shawty, it's your birthday", why: "Le hit birthday de toute une g\u00E9n\u00E9ration", familiarity: "iconique" },
    { title: "Birthday", artist: "The Beatles", searchQuery: "Birthday Beatles", fragment: "They say it's your birthday", why: "Le rock birthday intemporel", familiarity: "iconique" },
    { title: "Anniversaire", artist: "Tryo", searchQuery: "Anniversaire Tryo", fragment: "C'est ton anniversaire aujourd'hui", why: "Le hit fran\u00E7ais moderne pour les anniversaires", familiarity: "populaire" },
  ],
  fete_meres: [
    { title: "La Mamma", artist: "Charles Aznavour", searchQuery: "La Mamma Aznavour", fragment: "La mamma, la mamma", why: "L'hymne universel \u00E0 toutes les mamans", familiarity: "iconique" },
    { title: "Bohemian Rhapsody", artist: "Queen", searchQuery: "Bohemian Rhapsody Queen", fragment: "Mama, just killed a man", why: "Pour les mamans qui ont de l'humour", familiarity: "iconique" },
    { title: "You Are So Beautiful", artist: "Joe Cocker", searchQuery: "You Are So Beautiful Joe Cocker", fragment: "You are so beautiful to me", why: "Bouleversant et universel", familiarity: "iconique" },
    { title: "Maman", artist: "Louane", searchQuery: "Maman Louane", fragment: "Maman, je t'aime plus que tout", why: "Le tube fran\u00E7ais moderne pour les mamans", familiarity: "populaire" },
    { title: "A Song for Mama", artist: "Boyz II Men", searchQuery: "A Song for Mama Boyz II Men", fragment: "Mama you know I love you", why: "Fait pleurer \u00E0 coup s\u00FBr", familiarity: "populaire" },
  ],
  saint_valentin: [
    { title: "La Vie en Rose", artist: "Edith Piaf", searchQuery: "La Vie en Rose Edith Piaf", fragment: "C'est lui pour moi, moi pour lui dans la vie", why: "Le plus beau chant d'amour fran\u00E7ais", familiarity: "iconique" },
    { title: "Perfect", artist: "Ed Sheeran", searchQuery: "Perfect Ed Sheeran", fragment: "I found a love for me", why: "Le tube romantique moderne incontournable", familiarity: "iconique" },
    { title: "All of Me", artist: "John Legend", searchQuery: "All of Me John Legend", fragment: "All of me loves all of you", why: "Bouleversant d'amour", familiarity: "iconique" },
    { title: "Thinking Out Loud", artist: "Ed Sheeran", searchQuery: "Thinking Out Loud Ed Sheeran", fragment: "Take me into your loving arms", why: "Romantique et intemporel", familiarity: "populaire" },
    { title: "Je t'aime", artist: "Lara Fabian", searchQuery: "Je t'aime Lara Fabian", fragment: "Je t'aime, plus que tout au monde", why: "La d\u00E9claration d'amour ultime en fran\u00E7ais", familiarity: "populaire" },
  ],
  premier_message_elle: [
    { title: "Can't Take My Eyes Off You", artist: "Frankie Valli", searchQuery: "Can't Take My Eyes Off You Frankie Valli", fragment: "You're just too good to be true", why: "\u00C9l\u00E9gant, romantique, impossible de r\u00E9sister", familiarity: "iconique" },
    { title: "Something", artist: "The Beatles", searchQuery: "Something Beatles", fragment: "Something in the way she moves", why: "Classe absolue pour un premier message", familiarity: "iconique" },
    { title: "Bella", artist: "Ma\u00EEtre Gims", searchQuery: "Bella Maitre Gims", fragment: "Tu es bella, bella, bella", why: "Moderne, direct, fait sourire", familiarity: "populaire" },
    { title: "Just the Way You Are", artist: "Bruno Mars", searchQuery: "Just the Way You Are Bruno Mars", fragment: "You're amazing just the way you are", why: "Le compliment parfait en musique", familiarity: "iconique" },
    { title: "\u00C9videmment", artist: "France Gall", searchQuery: "Evidemment France Gall", fragment: "\u00C9videmment", why: "Cultissime et inattendu", familiarity: "populaire" },
  ],
  noel: [
    { title: "Petit Papa No\u00EBl", artist: "Tino Rossi", searchQuery: "Petit Papa Noel Tino Rossi", fragment: "Petit papa No\u00EBl quand tu descendras du ciel", why: "La chanson de No\u00EBl la plus vendue en France", familiarity: "iconique" },
    { title: "All I Want for Christmas Is You", artist: "Mariah Carey", searchQuery: "All I Want for Christmas Mariah Carey", fragment: "All I want for Christmas is you", why: "Le No\u00EBl mondial incontournable", familiarity: "iconique" },
    { title: "Last Christmas", artist: "Wham!", searchQuery: "Last Christmas Wham", fragment: "Last Christmas I gave you my heart", why: "Nostalgie de No\u00EBl universelle", familiarity: "iconique" },
    { title: "Douce Nuit", artist: "Traditionnel", searchQuery: "Douce Nuit Sainte Nuit", fragment: "Douce nuit, sainte nuit", why: "Le classique de No\u00EBl le plus chant\u00E9 au monde", familiarity: "iconique" },
    { title: "Mon Beau Sapin", artist: "Traditionnel", searchQuery: "Mon Beau Sapin chanson", fragment: "Mon beau sapin, roi des for\u00EAts", why: "L'enfance de No\u00EBl en France", familiarity: "iconique" },
  ],
  nouvel_an: [
    { title: "Alors on Danse", artist: "Stromae", searchQuery: "Alors on Danse Stromae", fragment: "Alors on danse", why: "Le tube de f\u00EAte universel francophone", familiarity: "iconique" },
    { title: "Happy New Year", artist: "ABBA", searchQuery: "Happy New Year ABBA", fragment: "Happy new year, happy new year", why: "Le classique du 1er janvier mondial", familiarity: "iconique" },
    { title: "Get Lucky", artist: "Daft Punk", searchQuery: "Get Lucky Daft Punk", fragment: "We're up all night to get lucky", why: "Pour une nuit de f\u00EAte inoubliable", familiarity: "iconique" },
    { title: "Auld Lang Syne", artist: "Traditionnel", searchQuery: "Auld Lang Syne New Year", fragment: "Should auld acquaintance be forgot", why: "L'hymne universel du Nouvel An", familiarity: "iconique" },
    { title: "Bonne Ann\u00E9e", artist: "Julio Iglesias", searchQuery: "Bonne Annee Julio Iglesias", fragment: "Bonne ann\u00E9e, bonne sant\u00E9", why: "La tradition fran\u00E7aise du Nouvel An", familiarity: "populaire" },
  ],
};

async function searchCuratedEvent(eventKey: string, log: any, country = "fr"): Promise<any[] | null> {
  const curated = CURATED_EVENTS[eventKey];
  if (!curated) return null;

  log.info({ eventKey, count: curated.length }, "Using curated event list");

  const results = await Promise.all(
    curated.map(async (song) => {
      try {
        const itunesResults = await searchItunes(song.searchQuery, undefined, 5, country);
        const match = itunesResults.find((r: any) =>
          stringSimilarity(r.trackName, song.title) > 0.4 &&
          stringSimilarity(r.artistName, song.artist) > 0.3
        ) || itunesResults[0];
        if (!match) return null;
        return {
          ...match,
          curatedFragment: song.fragment,
          curatedWhy: song.why,
          familiarity: song.familiarity,
          isCurated: true,
        };
      } catch {
        return null;
      }
    })
  );

  return results.filter(Boolean);
}

router.post("/youtube-search", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2 || query.length > 500) {
    res.status(400).json({ error: "Invalid query (2-500 chars)" });
    return;
  }

  try {
    const result = await youtubeSearchMetadata(query, req.log);
    if (!result) {
      res.status(404).json({ error: "Not found on YouTube" });
      return;
    }
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "YouTube search failed");
    res.status(500).json({ error: "YouTube search failed" });
  }
});

router.get("/search", async (req, res) => {
  const q = req.query.q as string;
  const attribute = req.query.attribute as string | undefined;
  const mode = (req.query.mode as SearchMode) || undefined;
  const lang = (req.query.lang as AppLang) || "fr";
  const country = LANG_RULES[lang]?.itunesCountry || "fr";
  if (!q) {
    res.status(400).json({ error: "Missing query parameter 'q'" });
    return;
  }

  try {
    const cacheKey = `${mode || "direct"}:${q.toLowerCase().trim()}:${attribute || ""}:${lang}`;
    const cached = aiSearchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < AI_CACHE_TTL) {
      res.json({ results: cached.results, source: "cache" });
      return;
    }

    let rawResults: any[];

    if (mode === "evenement") {
      const eventKey = q.split(":")[0];
      const curatedResults = await searchCuratedEvent(eventKey, req.log, country);
      if (curatedResults && curatedResults.length > 0) {
        const filtered = await enrichWithLyricsStatus(curatedResults);
        if (filtered.length > 0) {
          filtered[0].isCoupDeCoeur = true;
          aiSearchCache.set(cacheKey, { results: filtered, timestamp: Date.now() });
          res.json({ results: filtered });
          return;
        }
        req.log.info({ eventKey }, "Curated list had no lyrics matches, falling back to AI");
      }
    }

    if (mode && mode !== "album") {
      const geniusPromise = mode === "paroles" ? searchGeniusByLyrics(q, req.log) : Promise.resolve(null);
      const [ai, geniusMatch] = await Promise.all([
        aiInterpretQuery(q, mode, req.log, lang),
        geniusPromise,
      ]);

      if (ai && ai.itunes_queries && ai.itunes_queries.length > 0) {
        const detectedLang = ai.search_lang && LANG_RULES[ai.search_lang as AppLang]
          ? ai.search_lang as AppLang
          : lang;
        const effectiveCountry = LANG_RULES[detectedLang]?.itunesCountry || country;
        req.log.info({ mode, lang, detectedLang, effectiveCountry, queries: ai.itunes_queries, likely: ai.likely_song }, "AI interpreted search");

        const searchPromises = ai.itunes_queries.map(query => searchItunes(query, undefined, 5, effectiveCountry));
        const directSearch = searchItunes(q, attribute, 10, effectiveCountry);
        const allResults = await Promise.all([directSearch, ...searchPromises]);

        const seenIds = new Set<number>();
        const seenNames = new Set<string>();
        const merged: any[] = [];
        for (const batch of allResults) {
          for (const track of batch) {
            if (!track.trackId || seenIds.has(track.trackId)) continue;
            const nameKey = `${(track.trackName || "").toLowerCase().trim()}::${(track.artistName || "").toLowerCase().trim()}`;
            if (seenNames.has(nameKey)) continue;
            seenIds.add(track.trackId);
            seenNames.add(nameKey);
            merged.push(track);
          }
        }

        if (ai.likely_artist) {
          const specificSearch = await searchItunes(`${ai.likely_song || ""} ${ai.likely_artist}`.trim(), undefined, 5, effectiveCountry);
          for (const track of specificSearch) {
            if (!track.trackId || seenIds.has(track.trackId)) continue;
            const nameKey = `${(track.trackName || "").toLowerCase().trim()}::${(track.artistName || "").toLowerCase().trim()}`;
            if (seenNames.has(nameKey)) continue;
            seenIds.add(track.trackId);
            seenNames.add(nameKey);
            merged.push(track);
          }
        }

        const remixKeywords = ["remix", "remaster", "live", "cover", "feat.", "version", "edit", "tribute", "karaoke", "instrumental", "acoustic", "deluxe", "bonus"];
        merged.sort((a, b) => {
          let scoreA = 0;
          let scoreB = 0;

          if (ai.likely_song) {
            scoreA += stringSimilarity(a.trackName, ai.likely_song!) * 50;
            scoreB += stringSimilarity(b.trackName, ai.likely_song!) * 50;
          }

          if (ai.likely_artist) {
            if (stringSimilarity(a.artistName, ai.likely_artist!) > 0.6) scoreA += 40;
            if (stringSimilarity(b.artistName, ai.likely_artist!) > 0.6) scoreB += 40;
          }

          const aNameL = (a.trackName || "").toLowerCase();
          const bNameL = (b.trackName || "").toLowerCase();
          const isRemixA = remixKeywords.some(k => aNameL.includes(k));
          const isRemixB = remixKeywords.some(k => bNameL.includes(k));
          if (!isRemixA) scoreA += 30;
          if (!isRemixB) scoreB += 30;

          const yearA = a.releaseDate ? new Date(a.releaseDate).getFullYear() : 9999;
          const yearB = b.releaseDate ? new Date(b.releaseDate).getFullYear() : 9999;
          if (yearA < yearB) scoreA += 10;
          if (yearB < yearA) scoreB += 10;

          scoreA += Math.min((a.trackCount || 0) / 100, 20);
          scoreB += Math.min((b.trackCount || 0) / 100, 20);

          return scoreB - scoreA;
        });

        rawResults = merged.slice(0, 15);

        if (geniusMatch) {
          const gName = `${geniusMatch.title.toLowerCase().trim()}::${geniusMatch.artist.toLowerCase().trim()}`;
          const alreadyHasGenius = seenNames.has(gName) || rawResults.some((r: any) =>
            stringSimilarity(r.trackName || "", geniusMatch.title) > 0.5 &&
            stringSimilarity(r.artistName || "", geniusMatch.artist) > 0.4
          );
          if (!alreadyHasGenius) {
            req.log.info({ geniusTitle: geniusMatch.title, geniusArtist: geniusMatch.artist }, "Genius found song not in iTunes results, searching iTunes for it");
            const geniusItunesResults = await searchItunes(`${geniusMatch.title} ${geniusMatch.artist}`, undefined, 5, effectiveCountry);
            if (geniusItunesResults.length > 0) {
              for (const track of geniusItunesResults) {
                if (!track.trackId || seenIds.has(track.trackId)) continue;
                const nameKey = `${(track.trackName || "").toLowerCase().trim()}::${(track.artistName || "").toLowerCase().trim()}`;
                if (seenNames.has(nameKey)) continue;
                seenIds.add(track.trackId);
                seenNames.add(nameKey);
                track.geniusMatch = true;
                rawResults.unshift(track);
                break;
              }
            }
            if (!rawResults.some((r: any) => r.geniusMatch)) {
              const ytQuery = `${geniusMatch.artist} ${geniusMatch.title}`;
              const ytResult = await youtubeSearchMetadata(ytQuery, req.log);
              if (ytResult) {
                rawResults.unshift({
                  trackId: `yt-${ytResult.youtube_id}`,
                  trackName: geniusMatch.title,
                  artistName: geniusMatch.artist,
                  collectionName: "",
                  artworkUrl100: ytResult.thumbnail,
                  previewUrl: "",
                  trackTimeMillis: (ytResult.duration || 0) * 1000,
                  releaseDate: null,
                  trackCount: 0,
                  source: "youtube",
                  youtubeId: ytResult.youtube_id,
                  youtubeQuery: ytQuery,
                  geniusMatch: true,
                });
              }
            }
          }
        }

        if (ai.likely_song && rawResults.length === 0) {
          req.log.info({ likely_song: ai.likely_song, likely_artist: ai.likely_artist }, "iTunes returned 0 results, trying YouTube fallback");
          const ytQuery = ai.likely_artist ? `${ai.likely_artist} ${ai.likely_song}` : ai.likely_song;
          const ytResult = await youtubeSearchMetadata(ytQuery, req.log);
          if (ytResult) {
            rawResults.push({
              trackId: `yt-${ytResult.youtube_id}`,
              trackName: ai.likely_song,
              artistName: ai.likely_artist || ytResult.artist,
              collectionName: "",
              artworkUrl100: ytResult.thumbnail,
              previewUrl: "",
              trackTimeMillis: (ytResult.duration || 0) * 1000,
              releaseDate: null,
              trackCount: 0,
              source: "youtube",
              youtubeId: ytResult.youtube_id,
              youtubeQuery: ytQuery,
            });
          }
        } else if (ai.likely_song && ai.likely_artist) {
          const hasExactMatch = rawResults.some((r: any) =>
            stringSimilarity(r.trackName, ai.likely_song!) > 0.5 &&
            stringSimilarity(r.artistName, ai.likely_artist!) > 0.4
          );
          if (!hasExactMatch) {
            req.log.info({ likely_song: ai.likely_song, likely_artist: ai.likely_artist }, "No exact iTunes match, adding YouTube fallback");
            const ytQuery = `${ai.likely_artist} ${ai.likely_song}`;
            const ytResult = await youtubeSearchMetadata(ytQuery, req.log);
            if (ytResult) {
              rawResults.unshift({
                trackId: `yt-${ytResult.youtube_id}`,
                trackName: ai.likely_song,
                artistName: ai.likely_artist,
                collectionName: "",
                artworkUrl100: ytResult.thumbnail,
                previewUrl: "",
                trackTimeMillis: (ytResult.duration || 0) * 1000,
                releaseDate: null,
                trackCount: 0,
                source: "youtube",
                youtubeId: ytResult.youtube_id,
                youtubeQuery: ytQuery,
              });
            }
          }
        }
      } else {
        rawResults = await searchItunes(q, attribute, 10, country);
      }
    } else {
      rawResults = await searchItunes(q, attribute, 10, country);
    }

    const filtered = await enrichWithLyricsStatus(rawResults);

    const enhanced = await Promise.all(
      filtered.map(async (song: any) => {
        if (song.lyricsStatus !== "synced" || !song.trackTimeMillis) return song;

        try {
          const syncedLyrics = await getSyncedLyricsForTrack(song.trackName, song.artistName);
          if (!syncedLyrics) return song;

          const words = parseSyncedLyrics(syncedLyrics);
          const chorus = detectChorusFromLrc(syncedLyrics, words, song.trackTimeMillis);

          if (!chorus) return song;
          if (chorus.inPreview) return { ...song, chorusInPreview: true };

          const suffixes = ["live", "remastered", "acoustic", "radio edit"];
          const altSearches = suffixes.map(s =>
            Promise.race([
              fetch(`https://itunes.apple.com/search?term=${encodeURIComponent(song.trackName + " " + song.artistName + " " + s)}&entity=song&limit=3&country=${country}`)
                .then(r => r.json()),
              new Promise<{ results: never[] }>(resolve => setTimeout(() => resolve({ results: [] }), 3000)),
            ]).catch(() => ({ results: [] as never[] }))
          );
          const altResults = await Promise.all(altSearches);

          for (const altData of altResults) {
            for (const alt of altData.results || []) {
              if (!alt.previewUrl || !alt.trackTimeMillis) continue;
              if (!isTitleMatch(alt.trackName || "", song.trackName)) continue;

              if (isChorusInPreviewWindow(chorus.startTime, chorus.endTime, alt.trackTimeMillis)) {
                const altLyricsStatus = await checkLyricsAvailability(alt.trackName, alt.artistName);
                if (altLyricsStatus) {
                  return {
                    ...song,
                    chorusInPreview: false,
                    alternativeVersion: {
                      trackId: alt.trackId,
                      trackName: alt.trackName || song.trackName,
                      artistName: alt.artistName || song.artistName,
                      collectionName: alt.collectionName || "",
                      artworkUrl100: alt.artworkUrl100 || song.artworkUrl100,
                      previewUrl: alt.previewUrl,
                      trackTimeMillis: alt.trackTimeMillis,
                      lyricsStatus: altLyricsStatus,
                      chorusBadge: "Version avec le refrain",
                    },
                  };
                }
              }
            }
          }

          return { ...song, chorusInPreview: false };
        } catch {
          return song;
        }
      })
    );

    const remixKw = ["remix", "remaster", "live", "cover", "tribute", "karaoke", "instrumental"];
    const withOriginalFlag = enhanced.map((song: any, idx: number) => {
      if (idx !== 0 || enhanced.length < 2) return song;
      const nameL = ((song.alternativeVersion?.trackName || song.trackName) || "").toLowerCase();
      const isClean = !remixKw.some(k => nameL.includes(k));
      if (!isClean) return song;
      const secondName = ((enhanced[1].alternativeVersion?.trackName || enhanced[1].trackName) || "").toLowerCase();
      const sameSong = stringSimilarity(nameL, secondName) > 0.5;
      return sameSong ? { ...song, isOriginal: true } : song;
    });

    if (aiSearchCache.size > AI_CACHE_MAX) {
      const firstKey = aiSearchCache.keys().next().value;
      if (firstKey) aiSearchCache.delete(firstKey);
    }
    aiSearchCache.set(cacheKey, { results: withOriginalFlag, timestamp: Date.now() });

    res.json({ results: withOriginalFlag });
  } catch (err) {
    req.log.error({ err }, "iTunes search failed");
    res.status(500).json({ error: "Search failed" });
  }
});

router.get("/lyrics", async (req, res) => {
  const title = req.query.title as string;
  const artist = req.query.artist as string;
  const trackDurationMs = parseFloat(req.query.trackDurationMs as string) || 0;

  if (!title || !artist) {
    res.status(400).json({ error: "Missing 'title' or 'artist' query parameter" });
    return;
  }

  const estimatedDuration = trackDurationMs > 0 ? trackDurationMs / 1000 : 180;

  try {
    req.log.info({ title, artist }, "Lyrics fallback chain starting");

    const results = await searchLrclib(title + " " + artist);
    let syncedMatch = findTitleMatchedResult(results, title, true);

    if (syncedMatch) {
      req.log.info("Synced lyrics found via lrclib (title+artist, title validated)");
      const words = parseSyncedLyrics(syncedMatch.syncedLyrics);
      const duration = syncedMatch.duration || (words.length > 0 ? words[words.length - 1].time + 2 : 0);
      const chorusInfo = detectChorusFromLrc(syncedMatch.syncedLyrics, words, trackDurationMs);
      res.json({ found: true, words, duration, source: "synced", chorusInfo });
      return;
    }

    const titleResults = await searchLrclib(title);
    syncedMatch = findTitleMatchedResult(titleResults, title, true);

    if (syncedMatch) {
      req.log.info("Synced lyrics found via lrclib (title only, title validated)");
      const words = parseSyncedLyrics(syncedMatch.syncedLyrics);
      const duration = syncedMatch.duration || (words.length > 0 ? words[words.length - 1].time + 2 : 0);
      const chorusInfo = detectChorusFromLrc(syncedMatch.syncedLyrics, words, trackDurationMs);
      res.json({ found: true, words, duration, source: "synced", chorusInfo });
      return;
    }

    const artistResults = await searchLrclib(artist);
    const artistSyncedMatch = findTitleMatchedResult(artistResults, title, true);

    if (artistSyncedMatch) {
      req.log.info("Synced lyrics found via lrclib (artist search, title validated)");
      const words = parseSyncedLyrics(artistSyncedMatch.syncedLyrics);
      const duration = artistSyncedMatch.duration || (words.length > 0 ? words[words.length - 1].time + 2 : 0);
      const chorusInfo = detectChorusFromLrc(artistSyncedMatch.syncedLyrics, words, trackDurationMs);
      res.json({ found: true, words, duration, source: "synced", chorusInfo });
      return;
    }

    const allLrclibResults = [...results, ...titleResults, ...artistResults];
    const plainMatch = allLrclibResults.find((r: any) => r.plainLyrics && isTitleMatch(r.trackName || "", title));
    if (plainMatch) {
      req.log.info("Plain lyrics found via lrclib, generating proportional timestamps");
      const plainWords = plainTextToProportionalWords(plainMatch.plainLyrics, estimatedDuration);
      if (plainWords.length > 0) {
        res.json({ found: true, words: plainWords, duration: estimatedDuration, source: "plain", chorusInfo: null });
        return;
      }
    }

    req.log.info("No lrclib lyrics, checking Genius confirmation");
    const geniusConfirmed = await searchGeniusForLyrics(title, artist);
    if (geniusConfirmed) {
      req.log.info({ geniusTitle: geniusConfirmed }, "Song confirmed on Genius, using AI to generate timestamped lyrics");
    }

    req.log.info("Trying AI timestamped generation");
    const aiWords = await generateTimestampedLyricsWithAI(title, artist, estimatedDuration);

    if (aiWords && aiWords.length > 0) {
      req.log.info({ wordCount: aiWords.length }, "Timestamped lyrics generated via AI");
      res.json({ found: true, words: aiWords, duration: estimatedDuration, source: "ai", chorusInfo: null });
      return;
    }

    req.log.info("No lyrics found via any source");
    res.json({ found: false, words: [], duration: 0, source: "none", chorusInfo: null });
  } catch (err) {
    req.log.error({ err }, "Lyrics fetch failed");
    res.status(500).json({ error: "Lyrics fetch failed" });
  }
});

router.post("/identify", async (req, res) => {
  const { query } = req.body;
  if (!query || typeof query !== "string" || query.trim().length < 2 || query.length > 500) {
    res.status(400).json({ error: "Missing or invalid query (2-500 chars)" });
    return;
  }

  try {
    const classic = classicLookup(query);
    if (classic) {
      req.log.info({ query, classic: classic.title }, "Classic DB hit");
      res.json({ ...classic, source: "classics_db", confidence: "certain" });
      return;
    }

    const aiResult = await identifySongWithAI(query, req.log);
    if (aiResult) {
      req.log.info({ query, identified: aiResult.title }, "AI identified song");
      res.json({ ...aiResult, source: "ai" });
      return;
    }

    res.json({ error: "Could not identify song", source: "none" });
  } catch (err) {
    req.log.error({ err }, "Song identification failed");
    res.status(500).json({ error: "Identification failed" });
  }
});

router.post("/clip-youtube", async (req, res) => {
  const { youtubeQuery, startSeconds, durationSeconds } = req.body;

  if (!youtubeQuery || typeof youtubeQuery !== "string" || youtubeQuery.trim().length < 2 || youtubeQuery.length > 300) {
    res.status(400).json({ error: "Invalid youtubeQuery (2-300 chars)" });
    return;
  }
  const start = parseFloat(startSeconds);
  const duration = parseFloat(durationSeconds);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 3 || duration > 30) {
    res.status(400).json({ error: "startSeconds must be >= 0, durationSeconds must be 3-30" });
    return;
  }

  try {
    const result = await createYouTubeClipFile(youtubeQuery, start, duration, req.log);
    if (!result) {
      res.status(502).json({ error: "Failed to create YouTube clip" });
      return;
    }

    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Content-Disposition", "attachment; filename=singsing.m4a");
    res.setHeader("Content-Length", result.data.length);
    res.send(result.data);

    result.cleanup();
  } catch (err) {
    req.log.error({ err }, "YouTube clip creation failed");
    res.status(500).json({ error: "Failed to create YouTube clip" });
  }
});

router.post("/clip-youtube/host", async (req, res) => {
  const { youtubeQuery, startSeconds, durationSeconds, trackName, artistName, artworkUrl, lyrics, senderName } = req.body;

  if (!youtubeQuery || typeof youtubeQuery !== "string" || youtubeQuery.trim().length < 2 || youtubeQuery.length > 300) {
    res.status(400).json({ error: "Invalid youtubeQuery (2-300 chars)" });
    return;
  }
  const start = parseFloat(startSeconds);
  const duration = parseFloat(durationSeconds);
  if (!Number.isFinite(start) || start < 0 || !Number.isFinite(duration) || duration < 3 || duration > 30) {
    res.status(400).json({ error: "startSeconds must be >= 0, durationSeconds must be 3-30" });
    return;
  }

  try {
    const result = await createYouTubeClipFile(youtubeQuery, start, duration, req.log);
    if (!result) {
      res.status(502).json({ error: "Failed to create YouTube clip" });
      return;
    }

    const clipId = Date.now().toString(36) + Math.random().toString(36).substr(2, 6);
    hostedClips.set(clipId, {
      data: result.data,
      createdAt: Date.now(),
      meta: { trackName, artistName, artworkUrl, lyrics, senderName },
    });
    result.cleanup();

    const domain = process.env.REPLIT_DEV_DOMAIN || "localhost:8080";
    const protocol = domain.includes("localhost") ? "http" : "https";
    const clipUrl = `${protocol}://${domain}/s/${clipId}`;

    res.json({ clipId, clipUrl });
  } catch (err) {
    req.log.error({ err }, "YouTube clip hosting failed");
    res.status(500).json({ error: "Failed to host YouTube clip" });
  }
});

const previewCache = new Map<string, { data: Buffer; fetchedAt: number }>();
const PREVIEW_CACHE_TTL = 5 * 60 * 1000;

router.get("/preview-audio", async (req, res) => {
  const previewUrl = req.query.url as string;
  if (!previewUrl || !previewUrl.startsWith("https://")) {
    res.status(400).json({ error: "Missing or invalid preview URL" });
    return;
  }

  try {
    let audioData: Buffer;
    const cached = previewCache.get(previewUrl);
    if (cached && Date.now() - cached.fetchedAt < PREVIEW_CACHE_TTL) {
      audioData = cached.data;
    } else {
      const audioRes = await fetch(previewUrl);
      if (!audioRes.ok) {
        res.status(502).json({ error: "Failed to fetch preview" });
        return;
      }
      audioData = Buffer.from(await audioRes.arrayBuffer());
      previewCache.set(previewUrl, { data: audioData, fetchedAt: Date.now() });
      if (previewCache.size > 50) {
        const oldest = [...previewCache.entries()].sort((a, b) => a[1].fetchedAt - b[1].fetchedAt)[0];
        if (oldest) previewCache.delete(oldest[0]);
      }
    }

    const total = audioData.length;
    const rangeHeader = req.headers.range;

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : total - 1;
        const chunk = audioData.subarray(start, end + 1);
        res.status(206);
        res.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
        res.setHeader("Accept-Ranges", "bytes");
        res.setHeader("Content-Length", chunk.length);
        res.setHeader("Content-Type", "audio/mp4");
        res.send(chunk);
        return;
      }
    }

    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Content-Length", total);
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.send(audioData);
  } catch (err) {
    req.log.error({ err }, "Preview audio proxy failed");
    if (!res.headersSent) res.status(500).json({ error: "Proxy error" });
  }
});

router.get("/clip", async (req, res) => {
  const previewUrl = req.query.previewUrl as string;
  const startTime = parseFloat(req.query.startTime as string);
  const endTime = parseFloat(req.query.endTime as string);
  const trackDurationMs = parseFloat(req.query.trackDurationMs as string);

  if (!previewUrl || isNaN(startTime) || isNaN(endTime)) {
    res.status(400).json({ error: "Missing previewUrl, startTime, or endTime" });
    return;
  }

  try {
    const result = await createClipFile(previewUrl, startTime, endTime, trackDurationMs, req.log);
    if (!result) {
      res.status(502).json({ error: "Failed to create clip" });
      return;
    }

    res.setHeader("Content-Type", "audio/mp4");
    res.setHeader("Content-Disposition", "attachment; filename=singsing.m4a");
    res.setHeader("Content-Length", result.data.length);
    res.send(result.data);

    result.cleanup();
  } catch (err) {
    req.log.error({ err }, "Clip creation failed");
    res.status(500).json({ error: "Failed to create clip" });
  }
});

router.post("/clip/host", async (req, res) => {
  const { previewUrl, startTime, endTime, trackDurationMs, trackName, artistName, artworkUrl, lyrics, senderName } = req.body;

  if (!previewUrl || isNaN(parseFloat(startTime)) || isNaN(parseFloat(endTime))) {
    res.status(400).json({ error: "Missing previewUrl, startTime, or endTime" });
    return;
  }

  try {
    const result = await createClipFile(
      previewUrl,
      parseFloat(startTime),
      parseFloat(endTime),
      parseFloat(trackDurationMs || "0"),
      req.log
    );

    if (!result) {
      res.status(502).json({ error: "Failed to create clip" });
      return;
    }

    const clipId = Date.now().toString(36) + Math.random().toString(36).substr(2, 8);
    const toStr = (v: unknown, max = 500): string | undefined => {
      if (typeof v === "string" && v.trim()) return v.trim().slice(0, max);
      return undefined;
    };
    hostedClips.set(clipId, {
      data: result.data,
      createdAt: Date.now(),
      meta: {
        trackName: toStr(trackName),
        artistName: toStr(artistName),
        artworkUrl: toStr(artworkUrl),
        lyrics: toStr(lyrics, 1000),
        senderName: toStr(senderName),
      },
    });
    result.cleanup();

    req.log.info({ clipId, size: result.data.length }, "Clip hosted");

    const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
    const protocol = req.headers["x-forwarded-proto"] || "https";
    const clipUrl = `${protocol}://${host}/api/songs/clip/${clipId}`;

    res.json({ clipId, clipUrl });
  } catch (err) {
    req.log.error({ err }, "Clip hosting failed");
    res.status(500).json({ error: "Failed to host clip" });
  }
});

router.get("/clip/:id", (req, res) => {
  const clip = hostedClips.get(req.params.id);
  if (!clip) {
    res.status(404).json({ error: "Clip not found or expired" });
    return;
  }

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Content-Disposition", "attachment; filename=singsing.m4a");
  res.setHeader("Content-Length", clip.data.length);
  res.send(clip.data);
});

router.post("/reply-suggestions", async (req, res) => {
  const { message, language } = req.body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "Missing 'message' field" });
    return;
  }

  const LANG_MAP: Record<string, string> = {
    fr: "French",
    en: "English",
    es: "Spanish",
    it: "Italian",
    tr: "Turkish",
    other: "any language",
  };
  const preferredLang = LANG_MAP[language || "fr"] || "French";

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  try {
    req.log.info({ messageLength: message.length }, "Generating reply suggestions");

    const aiResponse = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 2048,
        system: `You are a music recommendation engine for a mobile app called Sing Sing. Your ONLY job is to suggest songs whose lyrics can serve as conversational replies to messages. You output ONLY valid JSON arrays. Never output explanations, caveats, or refusals. You are recommending songs by title and artist with short descriptive paraphrases of their lyrical themes — this is standard music recommendation, not reproduction of copyrighted material.`,
        messages: [
          {
            role: "user",
            content: `Message received: "${message.trim()}"

Suggest 3 ${preferredLang} songs whose lyrics serve as a direct conversational reply to this message.

Rules:
- The song's lyrical theme must directly respond to the message (as if answering the person)
- For lyrics_fragment: provide a short paraphrase or well-known hook that captures the reply (a few words)
- Prioritize well-known, popular songs that are easy to find on music platforms
- Output ONLY the JSON array below, nothing else

[{"search_query":"iTunes search terms","artist":"name","title":"song title","lyrics_fragment":"short lyric hook or paraphrase that replies","why":"1 sentence in French explaining the reply","language":"${language || "fr"}"}]`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      req.log.error({ status: aiResponse.status }, "AI suggestion request failed");
      res.status(502).json({ error: "AI service error" });
      return;
    }

    const aiData = await aiResponse.json();
    let text = aiData?.content?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: "Empty AI response" });
      return;
    }

    text = text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    let suggestions: any[];
    try {
      suggestions = JSON.parse(text);
    } catch {
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        try {
          suggestions = JSON.parse(jsonMatch[0]);
        } catch {
          req.log.error({ text }, "Failed to parse AI suggestions JSON");
          res.status(502).json({ error: "Invalid AI response format" });
          return;
        }
      } else {
        req.log.error({ text }, "Failed to parse AI suggestions JSON");
        res.status(502).json({ error: "Invalid AI response format" });
        return;
      }
    }

    if (!Array.isArray(suggestions) || suggestions.length === 0) {
      res.status(502).json({ error: "No suggestions generated" });
      return;
    }

    const validSuggestionInputs = suggestions
      .slice(0, 3)
      .filter((s: any) => s && typeof s.title === "string" && typeof s.artist === "string" && typeof s.lyrics_fragment === "string" && typeof s.why === "string");

    const verified = await Promise.all(
      validSuggestionInputs.map(async (suggestion: any) => {
        try {
          const searchQuery = suggestion.search_query || `${suggestion.title} ${suggestion.artist}`;
          const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&entity=song&limit=5`;
          const itunesResp = await fetch(itunesUrl);
          const itunesData = await itunesResp.json();
          const results = itunesData.results || [];

          const matchedSong = results.find((r: any) =>
            isTitleMatch(r.trackName || "", suggestion.title) &&
            (r.artistName || "").toLowerCase().includes((suggestion.artist || "").toLowerCase().split(" ")[0])
          ) || results.find((r: any) => isTitleMatch(r.trackName || "", suggestion.title));

          if (!matchedSong || !matchedSong.previewUrl) {
            return null;
          }

          const lyricsStatus = await checkLyricsAvailability(matchedSong.trackName, matchedSong.artistName);

          return {
            title: suggestion.title,
            artist: suggestion.artist,
            lyrics_fragment: suggestion.lyrics_fragment,
            why: suggestion.why,
            verified: true,
            has_lyrics: lyricsStatus !== "waveform_only",
            lyrics_status: lyricsStatus,
            itunes: {
              trackId: matchedSong.trackId,
              trackName: matchedSong.trackName,
              artistName: matchedSong.artistName,
              collectionName: matchedSong.collectionName || "",
              artworkUrl100: matchedSong.artworkUrl100 || "",
              previewUrl: matchedSong.previewUrl || "",
              trackTimeMillis: matchedSong.trackTimeMillis || 0,
            },
          };
        } catch (err) {
          req.log.warn({ err, suggestion }, "Failed to verify suggestion");
          return null;
        }
      })
    );

    const validSuggestions = verified.filter((s) => s !== null);

    req.log.info({ count: validSuggestions.length }, "Reply suggestions generated");
    res.json({ suggestions: validSuggestions });
  } catch (err) {
    req.log.error({ err }, "Reply suggestions failed");
    res.status(500).json({ error: "Failed to generate suggestions" });
  }
});

router.post("/clash-verdict", async (req, res) => {
  const { player1, player2 } = req.body;

  if (!player1 || !player2) {
    res.status(400).json({ error: "Missing player data" });
    return;
  }

  const baseUrl = process.env.AI_INTEGRATIONS_ANTHROPIC_BASE_URL;
  const apiKey = process.env.AI_INTEGRATIONS_ANTHROPIC_API_KEY;

  if (!baseUrl || !apiKey) {
    res.status(503).json({ error: "AI service not configured" });
    return;
  }

  try {
    const aiResponse = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: `Tu es le juge d'un clash musical Sing Sing.

Joueur 1 "${player1.name}": "${player1.trackName}" de ${player1.artistName}
Paroles choisies: "${player1.lyrics}"

Joueur 2 "${player2.name}": "${player2.trackName}" de ${player2.artistName}
Paroles choisies: "${player2.lyrics}"

D\u00E9clare le gagnant avec un verdict court, punchy et dr\u00F4le en fran\u00E7ais (style commentateur sportif).

Return ONLY JSON, no markdown:
{"winner": 1 or 2, "verdict": "Le Sing de [name] \u00E9tait chirurgical \u2014 KO technique."}`,
          },
        ],
      }),
    });

    if (!aiResponse.ok) {
      res.status(502).json({ error: "AI service error" });
      return;
    }

    const aiData = await aiResponse.json();
    let text = aiData?.content?.[0]?.text;
    if (!text) {
      res.status(502).json({ error: "Empty AI response" });
      return;
    }

    text = text.trim();
    if (text.startsWith("```")) {
      text = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    }

    const result = JSON.parse(text);
    res.json(result);
  } catch (err) {
    req.log.error({ err }, "Clash verdict failed");
    res.status(500).json({ error: "Failed to generate verdict" });
  }
});

export default router;
