import { Router } from "express";
import { hostedClips } from "./songs";

export const sharePageRouter = Router();

function escHtml(str: string): string {
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitizeUrl(url: string): string {
  const s = String(url || "").trim();
  if (!s) return "";
  try {
    const parsed = new URL(s);
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.href;
    }
  } catch {}
  return "";
}

function safeStr(val: unknown, maxLen = 500): string {
  if (typeof val === "string") return val.slice(0, maxLen);
  if (val === null || val === undefined) return "";
  return String(val).slice(0, maxLen);
}

sharePageRouter.get("/:id", (req, res) => {
  const clip = hostedClips.get(req.params.id);
  const clipId = req.params.id;
  const host = req.headers.host || process.env.REPLIT_DEV_DOMAIN || "localhost";
  const protocol = (req.headers["x-forwarded-proto"] as string) || "https";
  const baseUrl = `${protocol}://${host}`;
  const audioUrl = `${baseUrl}/api/songs/clip/${clipId}`;

  if (!clip) {
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.status(404).send(renderExpiredPage(baseUrl));
    return;
  }

  const meta = clip.meta || {};
  const trackName = safeStr(meta.trackName) || "Sing Sing Clip";
  const artistName = safeStr(meta.artistName);
  const artworkUrl = sanitizeUrl(safeStr(meta.artworkUrl));
  const lyrics = safeStr(meta.lyrics, 1000);
  const senderName = safeStr(meta.senderName) || "Quelqu\u2019un";

  const artworkLarge = artworkUrl ? artworkUrl.replace("100x100", "600x600") : "";

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.send(renderSharePage({
    clipId,
    audioUrl,
    trackName,
    artistName,
    artworkLarge,
    lyrics,
    senderName,
    baseUrl,
  }));
});

function renderExpiredPage(baseUrl: string): string {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Clip expir\u00e9 — Sing Sing</title>
<style>
${baseStyles()}
.expired-icon { font-size: 48px; margin-bottom: 16px; }
.expired-title { font-size: 22px; font-weight: 700; color: #fff; margin-bottom: 8px; }
.expired-sub { font-size: 14px; color: rgba(255,255,255,0.5); line-height: 1.5; max-width: 280px; text-align: center; }
.home-btn {
  margin-top: 32px;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 14px 28px; border-radius: 20px;
  background: rgba(100,50,180,0.25);
  border: 1.5px solid rgba(150,100,255,0.40);
  color: #fff; font-size: 15px; font-weight: 600;
  text-decoration: none;
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  transition: transform 0.15s, background 0.15s;
}
.home-btn:active { transform: scale(0.96); background: rgba(100,50,180,0.40); }
</style>
</head>
<body>
<div class="container">
  <div class="expired-icon">\u23f3</div>
  <div class="expired-title">Clip expir\u00e9</div>
  <div class="expired-sub">Ce Sing n'est plus disponible. Les clips expirent apr\u00e8s 10 minutes.</div>
  <a href="${escHtml(baseUrl)}" class="home-btn">\ud83c\udfb5 Cr\u00e9er un Sing</a>
</div>
<div class="footer">\ud83c\udfb5 Sing Sing \u2014 Find a song, clip a lyric, share the vibe</div>
</body>
</html>`;
}

interface SharePageData {
  clipId: string;
  audioUrl: string;
  trackName: string;
  artistName: string;
  artworkLarge: string;
  lyrics: string;
  senderName: string;
  baseUrl: string;
}

function renderSharePage(d: SharePageData): string {
  const replyUrl = `${d.baseUrl}?reply_to=${encodeURIComponent(d.clipId)}&sender=${encodeURIComponent(d.senderName)}`;
  const ogDescription = d.lyrics
    ? `"${d.lyrics}" \u2014 ${d.trackName}, ${d.artistName}`
    : `${d.trackName} \u2014 ${d.artistName}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escHtml(d.senderName)} t'a envoy\u00e9 un Sing \ud83c\udfb5</title>
<meta property="og:title" content="${escHtml(d.senderName)} t'a envoy\u00e9 un Sing \ud83c\udfb5">
<meta property="og:description" content="${escHtml(ogDescription)}">
${d.artworkLarge ? `<meta property="og:image" content="${escHtml(d.artworkLarge)}">` : ""}
<meta property="og:type" content="music.song">
<meta name="twitter:card" content="summary_large_image">
<style>
${baseStyles()}

.artwork-glow {
  position: absolute; top: 0; left: 50%; transform: translateX(-50%);
  width: 400px; height: 400px; border-radius: 50%;
  background: ${d.artworkLarge ? `url('${escHtml(d.artworkLarge)}')` : "radial-gradient(circle, rgba(100,50,180,0.4), transparent)"};
  background-size: cover; background-position: center;
  filter: blur(80px) saturate(180%); opacity: 0.5;
  pointer-events: none; z-index: 0;
}

.artwork {
  position: relative; z-index: 1;
  width: 220px; height: 220px; border-radius: 20px;
  object-fit: cover;
  box-shadow: 0 20px 60px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.10);
  margin-bottom: 28px;
}
.no-artwork {
  position: relative; z-index: 1;
  width: 220px; height: 220px; border-radius: 20px;
  background: rgba(255,255,255,0.08);
  border: 1px solid rgba(255,255,255,0.15);
  display: flex; align-items: center; justify-content: center;
  font-size: 64px; margin-bottom: 28px;
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
}

.lyrics {
  font-family: Georgia, 'Times New Roman', serif;
  font-size: 20px; font-weight: 600; font-style: italic;
  color: #fff; text-align: center; line-height: 1.5;
  max-width: 320px; margin-bottom: 8px;
  position: relative; z-index: 1;
}
.lyrics::before { content: '\\201C'; }
.lyrics::after { content: '\\201D'; }

.song-info {
  font-size: 14px; color: rgba(255,255,255,0.55);
  text-align: center; margin-bottom: 24px;
  position: relative; z-index: 1;
}

.divider {
  width: 200px; height: 1px;
  background: linear-gradient(90deg, transparent, rgba(255,255,255,0.20), transparent);
  margin: 0 auto 20px;
  position: relative; z-index: 1;
}

.sender {
  font-size: 16px; color: rgba(255,255,255,0.75);
  text-align: center; margin-bottom: 20px;
  position: relative; z-index: 1;
}
.sender strong { color: #fff; font-weight: 700; }

.cta {
  position: relative; z-index: 1;
  display: inline-flex; align-items: center; gap: 8px;
  padding: 16px 32px; border-radius: 20px;
  background: rgba(100,50,180,0.25);
  border: 1.5px solid rgba(150,100,255,0.45);
  color: #fff; font-size: 16px; font-weight: 600;
  text-decoration: none; cursor: pointer;
  backdrop-filter: blur(40px) saturate(160%);
  -webkit-backdrop-filter: blur(40px) saturate(160%);
  opacity: 0; transform: translateY(12px);
  transition: opacity 0.6s ease, transform 0.6s ease, background 0.15s;
  pointer-events: none;
}
.cta.visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
.cta:active { transform: scale(0.96); background: rgba(100,50,180,0.40); }

.audio-player {
  position: relative; z-index: 1;
  margin-bottom: 24px;
}
.audio-player audio {
  width: 280px; height: 40px; border-radius: 20px;
  filter: invert(1) hue-rotate(180deg) brightness(0.85);
}
</style>
</head>
<body>
<div class="container">
  <div class="artwork-glow"></div>

  ${d.artworkLarge
    ? `<img class="artwork" src="${escHtml(d.artworkLarge)}" alt="${escHtml(d.trackName)}" />`
    : `<div class="no-artwork">\ud83c\udfb5</div>`
  }

  ${d.lyrics ? `<div class="lyrics">${escHtml(d.lyrics)}</div>` : ""}

  <div class="song-info">${escHtml(d.trackName)}${d.artistName ? ` \u2014 ${escHtml(d.artistName)}` : ""}</div>

  <div class="audio-player">
    <audio id="player" controls preload="auto" src="${escHtml(d.audioUrl)}"></audio>
  </div>

  <div class="divider"></div>

  <div class="sender"><strong>${escHtml(d.senderName)}</strong> t'a envoy\u00e9 un Sing \ud83c\udfb5</div>

  <div class="divider"></div>

  <a id="cta" class="cta" href="${escHtml(replyUrl)}">R\u00e9ponds avec un Sing \u2192</a>
</div>

<div class="footer">\ud83c\udfb5 Sing Sing \u2014 Find a song, clip a lyric, share the vibe</div>

<script>
(function() {
  var player = document.getElementById('player');
  var cta = document.getElementById('cta');

  try { player.play().catch(function(){}); } catch(e) {}

  setTimeout(function() {
    cta.classList.add('visible');
  }, 4000);

  player.addEventListener('timeupdate', function() {
    if (player.currentTime >= 2 && !cta.classList.contains('visible')) {
      cta.classList.add('visible');
    }
  });
})();
</script>
</body>
</html>`;
}

function baseStyles(): string {
  return `
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body {
  background: linear-gradient(160deg, #0d0a1a 0%, #0a0f1e 40%, #0f0a0d 100%);
  min-height: 100vh; min-height: 100dvh;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  color: #fff;
  -webkit-font-smoothing: antialiased;
  overflow-x: hidden;
}
.container {
  min-height: 100vh; min-height: 100dvh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  padding: 40px 24px 80px;
  position: relative; overflow: hidden;
}
.footer {
  position: fixed; bottom: 0; left: 0; right: 0;
  text-align: center; padding: 16px;
  font-size: 12px; color: rgba(255,255,255,0.25);
  letter-spacing: 0.3px;
}
`;
}
