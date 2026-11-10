/**
 * RH MUSIC — multi-source music catalog API
 * Audius: open catalog + full streams.
 * Deezer and JioSaavn: official short preview URLs only.
 * Yandex Music: metadata/search links only.
 * No protected full-song URLs or DRM workarounds.
 */
const AUDIUS_BASE = "https://api.audius.co/v1";
const SAYA_BASE = "https://sayamusicapi.sayaproject-mailflow.workers.dev";
const APP_NAME = "RH_MUSIC";
const DEFAULT_LIMIT = 20;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type, Range, Authorization"
    }
  });
}
function cors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type, Range, Authorization");
  headers.set("cross-origin-resource-policy", "cross-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
async function readJson(url, label, timeout = 9000) {
  const response = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(timeout),
    cf: { cacheTtl: 20, cacheEverything: true }
  });
  if (!response.ok) throw new Error(label + " HTTP " + response.status);
  return response.json();
}
async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);
  url.searchParams.set("app_name", APP_NAME);
  if (env.AUDIUS_API_KEY) url.searchParams.set("api_key", env.AUDIUS_API_KEY);
  return readJson(url, "Audius", 12000);
}
async function sayaFetch(path, params = {}) {
  const url = new URL(SAYA_BASE + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  const payload = await readJson(url, "Music provider", 10000);
  if (payload?.ok === false) throw new Error(payload.message || "Provider error");
  return payload?.data ?? payload;
}
function mapAudius(track) {
  const art = track.artwork || {};
  return {
    id: String(track.id),
    title: track.title || "Без названия",
    artist: track.user?.name || track.user?.handle || "Неизвестный исполнитель",
    artwork: art["480x480"] || art["1000x1000"] || art["150x150"] || "",
    duration: Number(track.duration) || 0,
    source: "Audius",
    permalink: track.permalink ? "https://audius.co" + track.permalink : "",
    streamUrl: "",
    previewOnly: false
  };
}
async function searchAudius(query, page, limit, env) {
  const offset = page * limit;
  const path = query
    ? "/tracks/search?query=" + encodeURIComponent(query) + "&limit=" + limit + "&offset=" + offset
    : "/tracks/trending?limit=" + limit + "&offset=" + offset;
  const result = await audiusFetch(path, env);
  return (Array.isArray(result.data) ? result.data : []).filter(t => t?.id).map(mapAudius);
}
async function searchYandex(query, page, token, limit) {
  const url = new URL("https://api.music.yandex.net/search");
  url.searchParams.set("text", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("page", String(page));
  const headers = { accept: "application/json" };
  if (token) headers.authorization = "OAuth " + token;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || "Yandex HTTP " + response.status);
  return (data.result?.tracks?.results || []).slice(0, limit).map(track => {
    const album = track.albums?.[0] || {};
    let artwork = album.coverUri || track.coverUri || "";
    if (artwork) {
      artwork = artwork.replace("%%", "400x400");
      if (!/^https?:\/\//i.test(artwork)) artwork = "https://" + artwork;
    }
    return {
      id: "ym_" + String(track.id),
      title: track.title || "Без названия",
      artist: (track.artists || []).map(a => a.name).filter(Boolean).join(", ") || "Неизвестный исполнитель",
      artwork,
      duration: Math.round((Number(track.durationMs) || 0) / 1000),
      source: "Яндекс Музыка",
      permalink: "https://music.yandex.ru/album/" + String(album.id || "") + "/track/" + String(track.id),
      streamUrl: "",
      previewOnly: false
    };
  });
}
function mapDeezer(track) {
  const artist = track.artist || {};
  const album = track.album || {};
  return {
    id: "dz_" + String(track.id),
    title: track.title || track.title_short || "Без названия",
    artist: artist.name || "Неизвестный исполнитель",
    artwork: album.cover_xl || album.cover_big || album.cover_medium || "",
    duration: Number(track.duration) || 0,
    source: "Deezer",
    permalink: track.link || "",
    streamUrl: track.preview || "",
    previewOnly: true
  };
}
async function searchDeezer(query, page, limit) {
  if (!query) {
    if (page > 0) return [];
    const data = await sayaFetch("/v1/deezer/chart");
    const tracks = data.tracks?.data || data.tracks || [];
    return (Array.isArray(tracks) ? tracks : []).slice(0, limit).map(mapDeezer);
  }
  if (page > 0) return [];
  const data = await sayaFetch("/v1/deezer/search/tracks", { q: query });
  const tracks = data.data || [];
  return (Array.isArray(tracks) ? tracks : []).slice(0, limit).map(mapDeezer);
}
function mapJioSaavn(track) {
  return {
    id: "jio_" + String(track.id),
    title: track.title || "Без названия",
    artist: track.artist || track.singers || "Неизвестный исполнитель",
    artwork: track.image || "",
    duration: Number(track.durationSeconds) || 0,
    source: "JioSaavn",
    permalink: track.officialUrl || "",
    streamUrl: track.previewUrl || "",
    previewOnly: true
  };
}
async function searchJioSaavn(query, page, limit) {
  if (!query) return [];
  const data = await sayaFetch("/v1/jiosaavn/search/songs", { q: query, page: page + 1 });
  const tracks = data.results || [];
  return (Array.isArray(tracks) ? tracks : []).slice(0, limit).map(mapJioSaavn);
}
async function streamAudius(request, id, env) {
  const url = new URL(AUDIUS_BASE + "/tracks/" + encodeURIComponent(id) + "/stream");
  url.searchParams.set("app_name", APP_NAME);
  if (env.AUDIUS_API_KEY) url.searchParams.set("api_key", env.AUDIUS_API_KEY);
  const headers = new Headers({ accept: "*/*" });
  const range = request.headers.get("range");
  if (range) headers.set("range", range);
  const upstream = await fetch(url, { headers, redirect: "follow", signal: AbortSignal.timeout(20000) });
  if (!upstream.ok && upstream.status !== 206) return json({ error: "Audius stream unavailable" }, upstream.status || 502);
  return cors(new Response(upstream.body, { status: upstream.status, statusText: upstream.statusText, headers: upstream.headers }));
}
function readPaging(url) {
  const page = Math.max(0, Math.min(500, Number.parseInt(url.searchParams.get("page") || "0", 10) || 0));
  const requested = Number.parseInt(url.searchParams.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT;
  const limit = Math.max(1, Math.min(DEFAULT_LIMIT, requested));
  return { page, limit };
}
function uniqueTracks(tracks) {
  const seen = new Set();
  return tracks.filter(track => {
    const key = track.source + ":" + track.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type, Range, Authorization"
    }});
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (url.pathname === "/api/health") {
      return json({
        service: "RH MUSIC API",
        status: "online",
        sources: [
          { name: "Audius", capability: "full open streams + search + trending" },
          { name: "Deezer", capability: "search + 30-second previews + charts" },
          { name: "JioSaavn", capability: "search + official previews" },
          { name: "Yandex Music", capability: "metadata/search links" }
        ]
      });
    }
    if (url.pathname === "/api/yandex/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length > 160) return json({ error: "Укажи поисковый запрос длиной до 160 символов." }, 400);
      const { page, limit } = readPaging(url);
      const token = (request.headers.get("authorization") || "").replace(/^OAuth\s+/i, "").trim();
      try {
        const tracks = await searchYandex(q, page, token, limit);
        return json({ tracks, page, hasMore: tracks.length === limit, sources: ["Яндекс Музыка"] });
      } catch (error) {
        return json({ error: "Яндекс Музыка: " + (error?.message || "ошибка запроса") }, 502);
      }
    }
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length > 160) return json({ error: "Поисковый запрос слишком длинный." }, 400);
      const { page, limit } = readPaging(url);
      const jobs = [
        searchAudius(q, page, limit, env).then(tracks => ({ source: "Audius", tracks })),
        searchDeezer(q, page, limit).then(tracks => ({ source: "Deezer", tracks }))
      ];
      if (q) {
        jobs.push(searchYandex(q, page, "", limit).then(tracks => ({ source: "Яндекс Музыка", tracks })));
        jobs.push(searchJioSaavn(q, page, limit).then(tracks => ({ source: "JioSaavn", tracks })));
      }
      const settled = await Promise.allSettled(jobs);
      const tracks = [];
      const warnings = [];
      const sources = [];
      for (const item of settled) {
        if (item.status === "fulfilled") {
          tracks.push(...item.value.tracks);
          if (item.value.tracks.length) sources.push(item.value.source);
        } else {
          warnings.push(item.reason?.message || "Источник временно недоступен");
        }
      }
      const unique = uniqueTracks(tracks);
      const hasMore = settled.some(item => {
        if (item.status !== "fulfilled") return false;
        if (item.value.source === "JioSaavn") return item.value.tracks.length >= 10;
        return ["Audius", "Яндекс Музыка"].includes(item.value.source) && item.value.tracks.length >= limit;
      });
      if (!unique.length && warnings.length) {
        return json({ error: "Музыкальные каталоги временно недоступны.", details: warnings, tracks: [], page, hasMore: false }, 502);
      }
      return json({
        tracks: unique,
        page,
        limit,
        hasMore,
        sources,
        warnings
      });
    }
    if (url.pathname === "/api/stream") {
      const id = (url.searchParams.get("id") || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return json({ error: "Некорректный ID трека." }, 400);
      try { return await streamAudius(request, id, env); }
      catch (error) { return json({ error: "Не удалось открыть поток Audius: " + (error?.message || "ошибка") }, 502); }
    }
    return json({
      service: "RH MUSIC API",
      status: "online",
      endpoints: ["/api/health", "/api/search?q=...&page=0", "/api/stream"],
      note: "Audius full streams; Deezer/JioSaavn official previews; Yandex metadata only."
    });
  }
};
