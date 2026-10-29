/**
 * RH MUSIC — MULTI-SOURCE API
 *
 * Sources:
 *   1. Audius
 *   2. Verome API / YouTube Music
 *
 * Routes:
 *   GET /api/health
 *   GET /api/search?q=...
 *   GET /api/stream?id=...          Audius
 *   GET /api/verome/stream?id=...   Verome
 *
 * Optional Worker secret:
 *   AUDIUS_API_KEY
 */

const AUDIUS_BASE = "https://api.audius.co/v1";
const VEROME_BASE = "https://verome-api.deno.dev";

const APP_NAME = "RH_MUSIC";

// Абсолютный адрес нужен для корректного воспроизведения,
// даже если интерфейс открыт на GitHub Pages.
const WORKER_BASE = "https://mymusic.95wr5n8mg8.workers.dev";


/* =========================
   COMMON HELPERS
========================= */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "GET, HEAD, OPTIONS",
      "access-control-allow-headers": "Content-Type, Range",
      "access-control-expose-headers":
        "Content-Length, Content-Range, Accept-Ranges"
    }
  });
}

function withCors(response) {
  const headers = new Headers(response.headers);

  headers.set("access-control-allow-origin", "*");
  headers.set(
    "access-control-allow-methods",
    "GET, HEAD, OPTIONS"
  );
  headers.set(
    "access-control-allow-headers",
    "Content-Type, Range"
  );
  headers.set(
    "access-control-expose-headers",
    "Content-Length, Content-Range, Accept-Ranges"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    signal: AbortSignal.timeout(15000),
    headers: {
      "accept": "application/json",
      ...(options.headers || {})
    }
  });

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  return response.json();
}

function parseDuration(value) {
  if (typeof value === "number") {
    return Math.max(0, Math.floor(value));
  }

  if (typeof value !== "string") {
    return 0;
  }

  const parts = value.trim().split(":").map(Number);

  if (
    parts.length === 2 &&
    parts.every(Number.isFinite)
  ) {
    return parts[0] * 60 + parts[1];
  }

  if (
    parts.length === 3 &&
    parts.every(Number.isFinite)
  ) {
    return parts[0] * 3600 +
      parts[1] * 60 +
      parts[2];
  }

  return 0;
}


/* =========================
   AUDIUS
========================= */

async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);

  url.searchParams.set("app_name", APP_NAME);

  if (env.AUDIUS_API_KEY) {
    url.searchParams.set(
      "api_key",
      env.AUDIUS_API_KEY
    );
  }

  return fetchJson(url.toString(), {
    cf: {
      cacheTtl: 30,
      cacheEverything: true
    }
  });
}

function mapAudiusTrack(track) {
  const artwork = track.artwork || {};

  return {
    id: String(track.id),
    title: track.title || "Без названия",
    artist:
      track.user?.name ||
      track.user?.handle ||
      "Неизвестный исполнитель",
    artwork:
      artwork["480x480"] ||
      artwork["150x150"] ||
      artwork["1000x1000"] ||
      "",
    duration: Number(track.duration) || 0,
    source: "Audius",
    permalink: track.permalink
      ? "https://audius.co" + track.permalink
      : "",
    streamUrl: ""
  };
}

async function searchAudius(query, env) {
  const endpoint = query
    ? "/tracks/search?query=" +
      encodeURIComponent(query) +
      "&limit=25"
    : "/tracks/trending?limit=20";

  const result = await audiusFetch(endpoint, env);

  return (Array.isArray(result.data) ? result.data : [])
    .filter(track => track && track.id)
    .map(mapAudiusTrack);
}


/* =========================
   VEROME / YOUTUBE MUSIC
========================= */

async function searchVerome(query) {
  const url = new URL(
    VEROME_BASE + "/api/search"
  );

  url.searchParams.set("q", query);
  url.searchParams.set("filter", "songs");

  // Не запускаем дополнительный поиск YouTube
  // для каждого найденного трека.
  url.searchParams.set("fallback", "0");

  const data = await fetchJson(url.toString());

  const results = Array.isArray(data.results)
    ? data.results
    : [];

  return results
    .filter(track => {
      return track &&
        track.videoId &&
        track.resultType !== "artist" &&
        track.resultType !== "album" &&
        track.resultType !== "playlist";
    })
    .map(track => {
      const videoId = String(track.videoId);

      const thumbnail =
        track.thumbnails?.find(item => item?.url)?.url ||
        "";

      const artist = Array.isArray(track.artists)
        ? track.artists
            .map(item => item?.name)
            .filter(Boolean)
            .join(", ")
        : "";

      return {
        // Префикс не позволяет смешать ID разных источников.
        id: "verome_" + videoId,

        // Отдельно храним настоящий YouTube video ID.
        videoId,

        title: track.title || "Без названия",

        artist: artist || "Неизвестный исполнитель",

        artwork: thumbnail,

        duration: parseDuration(track.duration),

        source: "Verome · YouTube Music",

        permalink:
          "https://music.youtube.com/watch?v=" +
          encodeURIComponent(videoId),

        // Этот маршрут разрешает поток и передаёт аудио.
        streamUrl:
          WORKER_BASE +
          "/api/verome/stream?id=" +
          encodeURIComponent(videoId)
      };
    });
}


/* =========================
   AUDIUS STREAM
========================= */

async function streamAudius(request, env, id) {
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
    return json({
      error: "Некорректный ID трека."
    }, 400);
  }

  const url = new URL(
    AUDIUS_BASE +
    "/tracks/" +
    encodeURIComponent(id) +
    "/stream"
  );

  url.searchParams.set("app_name", APP_NAME);

  if (env.AUDIUS_API_KEY) {
    url.searchParams.set(
      "api_key",
      env.AUDIUS_API_KEY
    );
  }

  const headers = new Headers({
    "accept": "*/*"
  });

  const range = request.headers.get("range");

  if (range) {
    headers.set("range", range);
  }

  const upstream = await fetch(url.toString(), {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(20000)
  });

  if (!upstream.ok && upstream.status !== 206) {
    return json({
      error: "Этот трек сейчас недоступен."
    }, upstream.status || 502);
  }

  return withCors(new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers
  }));
}


/* =========================
   VEROME STREAM
========================= */

async function streamVerome(request, id) {
  // Принимаем только стандартные YouTube video ID.
  if (!/^[a-zA-Z0-9_-]{11}$/.test(id)) {
    return json({
      error: "Некорректный ID композиции Verome."
    }, 400);
  }

  // Сначала получаем доступные аудиопотоки.
  const resolverUrl = new URL(
    VEROME_BASE + "/api/stream"
  );

  resolverUrl.searchParams.set("id", id);

  const resolved = await fetchJson(
    resolverUrl.toString()
  );

  const streams = Array.isArray(
    resolved.streamingUrls
  )
    ? resolved.streamingUrls
    : [];

  if (!resolved.success || streams.length === 0) {
    return json({
      error:
        "Verome не смог получить аудио для этой композиции."
    }, 502);
  }

  // Выбираем первый доступный аудиопоток.
  // При необходимости можно будет добавить выбор качества.
  const stream = streams.find(item => {
    return item &&
      typeof item.url === "string" &&
      /^https?:\/\//i.test(item.url);
  });

  if (!stream) {
    return json({
      error: "Источник не вернул доступную аудиоссылку."
    }, 502);
  }

  // Передаём URL через предусмотренный Verome аудиопрокси.
  const proxyUrl = new URL(
    VEROME_BASE + "/api/proxy"
  );

  proxyUrl.searchParams.set("url", stream.url);

  const headers = new Headers({
    "accept": "*/*"
  });

  const range = request.headers.get("range");

  if (range) {
    headers.set("range", range);
  }

  const upstream = await fetch(proxyUrl.toString(), {
    method: request.method === "HEAD" ? "HEAD" : "GET",
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(30000)
  });

  if (!upstream.ok && upstream.status !== 206) {
    return json({
      error:
        "Не удалось получить аудио от Verome. Попробуй другой трек."
    }, 502);
  }

  return withCors(new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: upstream.headers
  }));
}


/* =========================
   MAIN WORKER
========================= */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "access-control-allow-origin": "*",
          "access-control-allow-methods":
            "GET, HEAD, OPTIONS",
          "access-control-allow-headers":
            "Content-Type, Range",
          "access-control-expose-headers":
            "Content-Length, Content-Range, Accept-Ranges"
        }
      });
    }

    if (
      request.method !== "GET" &&
      request.method !== "HEAD"
    ) {
      return json({
        error: "Метод не поддерживается."
      }, 405);
    }

    /* Health check */

    if (url.pathname === "/api/health") {
      return json({
        service: "RH MUSIC API",
        status: "online",
        sources: [
          "Audius",
          "Verome / YouTube Music"
        ]
      });
    }

    /* Search */

    if (url.pathname === "/api/search") {
      const query = (
        url.searchParams.get("q") || ""
      ).trim();

      if (query.length > 160) {
        return json({
          error: "Поисковый запрос слишком длинный."
        }, 400);
      }

      // Пустой запрос — популярные композиции Audius.
      if (!query) {
        try {
          const tracks = await searchAudius("", env);

          return json({
            tracks,
            sources: ["Audius"]
          });
        } catch {
          return json({
            tracks: [],
            sources: [],
            error:
              "Не удалось загрузить популярные композиции."
          }, 502);
        }
      }

      // Запрашиваем оба источника параллельно.
      const results = await Promise.allSettled([
        searchAudius(query, env),
        searchVerome(query)
      ]);

      const audiusTracks =
        results[0].status === "fulfilled"
          ? results[0].value
          : [];

      const veromeTracks =
        results[1].status === "fulfilled"
          ? results[1].value
          : [];

      // Audius и Verome объединяются в общий список.
      const combined = [
        ...veromeTracks,
        ...audiusTracks
      ];

      const unique = [];
      const seen = new Set();

      for (const track of combined) {
        const key = track.source + ":" + track.id;

        if (seen.has(key)) continue;

        seen.add(key);
        unique.push(track);
      }

      const sources = [];

      if (veromeTracks.length > 0) {
        sources.push("Verome / YouTube Music");
      }

      if (audiusTracks.length > 0) {
        sources.push("Audius");
      }

      // Даже если один источник недоступен,
      // второй продолжает работать.
      return json({
        tracks: unique,
        sources,
        sourceStatus: {
          audius: results[0].status === "fulfilled",
          verome: results[1].status === "fulfilled"
        }
      });
    }

    /* Audius playback */

    if (url.pathname === "/api/stream") {
      const id = (
        url.searchParams.get("id") || ""
      ).trim();

      try {
        return await streamAudius(
          request,
          env,
          id
        );
      } catch {
        return json({
          error: "Не удалось открыть аудиопоток Audius."
        }, 502);
      }
    }

    /* Verome playback */

    if (url.pathname === "/api/verome/stream") {
      const id = (
        url.searchParams.get("id") || ""
      ).trim();

      try {
        return await streamVerome(request, id);
      } catch (error) {
        return json({
          error:
            "Ошибка Verome: " +
            (error?.message || "источник недоступен")
        }, 502);
      }
    }

    /* Static Assets */

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return json({
      service: "RH MUSIC API",
      status: "online",
      message: "API работает."
    });
  }
};