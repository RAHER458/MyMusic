/**
 * RH MUSIC — Cloudflare Worker API
 *
 * Routes:
 *   GET /api/search?q=artist%20song
 *   GET /api/stream?id=AUDIUS_TRACK_ID
 *   GET /api/health
 *
 * Optional Worker secret:
 *   AUDIUS_API_KEY — Audius API key (improves rate limits; read-only search may work without it).
 *
 * Deployment note:
 * This Worker expects the HTML frontend to be served from the same origin,
 * usually through a Cloudflare Workers Static Assets binding named ASSETS.
 * If your current setup already serves index.html another way, keep that setup
 * and merge these /api routes into the existing fetch handler.
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
      "access-control-allow-headers": "Content-Type, Range"
    }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, OPTIONS");
  headers.set("access-control-allow-headers", "Content-Type, Range");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);
  url.searchParams.set("app_name", APP_NAME);
  if (env.AUDIUS_API_KEY) url.searchParams.set("api_key", env.AUDIUS_API_KEY);
  const response = await fetch(url.toString(), {
    headers: { "accept": "application/json" },
    cf: { cacheTtl: 30, cacheEverything: true }
  });
  if (!response.ok) throw new Error("Audius API вернул HTTP " + response.status);
  return response.json();
}

function mapTrack(track) {
  const artwork = track.artwork || {};
  return {
    id: String(track.id),
    title: track.title || "Без названия",
    artist: track.user?.name || track.user?.handle || "Неизвестный исполнитель",
    artwork: artwork["480x480"] || artwork["150x150"] || artwork["1000x1000"] || "",
    duration: Number(track.duration) || 0,
    source: "Audius",
    permalink: track.permalink ? "https://audius.co" + track.permalink : "",
    streamUrl: ""
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type, Range"
        }
      });
    }

    if (url.pathname === "/api/health") {
      return json({ service: "RH MUSIC API", status: "online", source: "Audius" });
    }

    if (url.pathname === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim();
      if (query.length > 160) return json({ error: "Поисковый запрос слишком длинный." }, 400);
      try {
        const endpoint = query
          ? "/tracks/search?query=" + encodeURIComponent(query) + "&limit=25"
          : "/tracks/trending?limit=20";
        const result = await audiusFetch(endpoint, env);
        const tracks = (Array.isArray(result.data) ? result.data : [])
          .filter(t => t && t.id)
          .map(mapTrack);
        return json({ tracks, source: "Audius" });
      } catch (error) {
        return json({ error: "Не удалось связаться с Audius. Попробуй позже. Подробности: " + error.message }, 502);
      }
    }

    if (url.pathname === "/api/stream") {
      const id = (url.searchParams.get("id") || "").trim();
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) return json({ error: "Некорректный ID трека." }, 400);
      try {
        const streamUrl = new URL(`${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}/stream`);
        streamUrl.searchParams.set("app_name", APP_NAME);
        if (env.AUDIUS_API_KEY) streamUrl.searchParams.set("api_key", env.AUDIUS_API_KEY);

        const headers = new Headers({ "accept": "*/*" });
        const range = request.headers.get("range");
        if (range) headers.set("range", range);

        // Forward the stream instead of downloading or storing the audio.
        const upstream = await fetch(streamUrl.toString(), { method: "GET", headers, redirect: "follow" });
        if (!upstream.ok && upstream.status !== 206) {
          return json({ error: "Этот трек сейчас недоступен для воспроизведения." }, upstream.status || 502);
        }
        return withCors(new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers: upstream.headers
        }));
      } catch (error) {
        return json({ error: "Не удалось открыть аудиопоток: " + error.message }, 502);
      }
    }

    // Static Assets binding: configure it in Cloudflare if this Worker should serve index.html.
    if (env.ASSETS) return env.ASSETS.fetch(request);

    return json({
      service: "RH MUSIC API",
      status: "online",
      message: "API работает. Настрой раздачу index.html через Cloudflare Static Assets или Pages."
    });
  }
};
