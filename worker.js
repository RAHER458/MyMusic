/**
 * RH MUSIC — Cloudflare Worker
 * Audius: open-catalog search and licensed stream endpoint.
 * Yandex Music: metadata search only; playback remains in the official client.
 */
const AUDIUS_BASE = "https://api.audius.co/v1";
const APP_NAME = "RH_MUSIC";

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
async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);
  url.searchParams.set("app_name", APP_NAME);
  if (env.AUDIUS_API_KEY) url.searchParams.set("api_key", env.AUDIUS_API_KEY);
  const response = await fetch(url, { headers: { accept: "application/json" }, signal: AbortSignal.timeout(10000), cf: { cacheTtl: 30, cacheEverything: true } });
  if (!response.ok) throw new Error("Audius HTTP " + response.status);
  return response.json();
}
function mapAudius(track) {
  const art = track.artwork || {};
  return {
    id: String(track.id), title: track.title || "Без названия",
    artist: track.user?.name || track.user?.handle || "Неизвестный исполнитель",
    artwork: art["480x480"] || art["1000x1000"] || art["150x150"] || "",
    duration: Number(track.duration) || 0, source: "Audius",
    permalink: track.permalink ? "https://audius.co" + track.permalink : ""
  };
}
async function searchYandex(query, token) {
  const url = new URL("https://api.music.yandex.net/search");
  url.searchParams.set("text", query);
  url.searchParams.set("type", "track");
  url.searchParams.set("page", "0");
  const headers = { accept: "application/json" };
  if (token) headers.authorization = "OAuth " + token;
  const response = await fetch(url, { headers, signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.error) throw new Error(data.error?.message || "Yandex HTTP " + response.status);
  return (data.result?.tracks?.results || []).slice(0, 25).map(track => {
    const album = track.albums?.[0] || {};
    let artwork = album.coverUri || track.coverUri || "";
    if (artwork) {
      artwork = artwork.replace("%%", "400x400");
      if (!/^https?:\/\//i.test(artwork)) artwork = "https://" + artwork;
    }
    return {
      id: "ym_" + String(track.id), title: track.title || "Без названия",
      artist: (track.artists || []).map(a => a.name).filter(Boolean).join(", ") || "Неизвестный исполнитель",
      artwork, duration: Math.round((Number(track.durationMs) || 0) / 1000),
      source: "Яндекс Музыка",
      permalink: "https://music.yandex.ru/album/" + String(album.id || "") + "/track/" + String(track.id)
    };
  });
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
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: {
      "access-control-allow-origin": "*", "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "Content-Type, Range, Authorization"
    }});
    if (request.method !== "GET") return json({ error: "Method not allowed" }, 405);
    if (url.pathname === "/api/health") return json({ service: "RH MUSIC API", status: "online", sources: ["Audius", "Yandex Music metadata", "Spotify official embed"] });
    if (url.pathname === "/api/yandex/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (!q || q.length > 160) return json({ error: "Укажи поисковый запрос длиной до 160 символов." }, 400);
      const token = (request.headers.get("authorization") || "").replace(/^OAuth\s+/i, "").trim();
      try { return json({ tracks: await searchYandex(q, token), sources: ["Яндекс Музыка"] }); }
      catch (error) { return json({ error: "Яндекс Музыка: " + (error?.message || "ошибка запроса") }, 502); }
    }
    if (url.pathname === "/api/search") {
      const q = (url.searchParams.get("q") || "").trim();
      if (q.length > 160) return json({ error: "Поисковый запрос слишком длинный." }, 400);
      try {
        const path = q
          ? "/tracks/search?query=" + encodeURIComponent(q) + "&limit=30"
          : "/tracks/trending?limit=30";
        const result = await audiusFetch(path, env);
        const tracks = (Array.isArray(result.data) ? result.data : []).filter(t => t?.id).map(mapAudius);
        return json({ tracks, sources: ["Audius"] });
      } catch (error) { return json({ error: "Audius: " + (error?.message || "ошибка каталога") }, 502); }
    }
    if (url.pathname === "/api/stream") {
      const id = (url.searchParams.get("id") || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return json({ error: "Некорректный ID трека." }, 400);
      try { return await streamAudius(request, id, env); }
      catch (error) { return json({ error: "Не удалось открыть поток Audius: " + (error?.message || "ошибка") }, 502); }
    }
    return json({ service: "RH MUSIC API", status: "online", endpoints: ["/api/health", "/api/search", "/api/yandex/search", "/api/stream"] });
  }
};