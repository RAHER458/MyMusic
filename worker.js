/**
 * RH MUSIC — MULTI-SOURCE MUSIC API
 * Sources:
 *   1. Audius
 *   2. Internet Archive
 *
 * Routes:
 *   GET /api/health
 *   GET /api/search?q=artist%20song
 *   GET /api/stream?id=AUDIUS_TRACK_ID
 */

const AUDIUS_BASE = "https://api.audius.co/v1";
const AUDIUS_APP_NAME = "RH_MUSIC";

const ARCHIVE_SEARCH =
  "https://archive.org/advancedsearch.php";

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

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "accept": "application/json",
      ...(options.headers || {})
    },
    signal: AbortSignal.timeout(12000)
  });

  if (!response.ok) {
    throw new Error("HTTP " + response.status);
  }

  return response.json();
}

/* =========================
   AUDIUS
========================= */

async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);

  url.searchParams.set("app_name", AUDIUS_APP_NAME);

  if (env.AUDIUS_API_KEY) {
    url.searchParams.set("api_key", env.AUDIUS_API_KEY);
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
   INTERNET ARCHIVE
========================= */

function archiveTitle(item) {
  if (Array.isArray(item.title)) {
    return item.title[0] || "Без названия";
  }

  return item.title || "Без названия";
}

function archiveCreator(item) {
  if (Array.isArray(item.creator)) {
    return item.creator.join(", ");
  }

  return item.creator || "Неизвестный исполнитель";
}

function encodeArchivePathPart(value) {
  return encodeURIComponent(value).replace(
    /[!'()*]/g,
    char => "%" + char.charCodeAt(0).toString(16).toUpperCase()
  );
}

async function getArchiveAudio(identifier) {
  const url =
    "https://archive.org/metadata/" +
    encodeURIComponent(identifier);

  const metadata = await fetchJson(url);

  const files = Array.isArray(metadata.files)
    ? metadata.files
    : [];

  const supported = files.filter(file => {
    if (!file.name) return false;

    const name = String(file.name).toLowerCase();

    // Оставляем только аудиоформаты,
    // которые обычно поддерживаются браузерами.
    const supportedFormat =
      /\.(mp3|ogg|oga|m4a|aac|wav|flac|opus)$/i.test(name);

    // Исключаем служебные и технические файлы.
    const forbidden =
      name.includes("_meta.") ||
      name.endsWith(".xml") ||
      name.endsWith(".json") ||
      name.endsWith(".sqlite") ||
      name.endsWith(".torrent");

    return supportedFormat && !forbidden;
  });

  // MP3 предпочтительнее для воспроизведения
  // на iPhone и в большинстве браузеров.
  supported.sort((a, b) => {
    const rank = name => {
      const lower = name.toLowerCase();

      if (lower.endsWith(".mp3")) return 0;
      if (lower.endsWith(".m4a")) return 1;
      if (lower.endsWith(".aac")) return 2;
      if (lower.endsWith(".ogg") || lower.endsWith(".oga")) return 3;
      if (lower.endsWith(".opus")) return 4;
      if (lower.endsWith(".wav")) return 5;
      if (lower.endsWith(".flac")) return 6;

      return 10;
    };

    return rank(a.name) - rank(b.name);
  });

  const audioFile = supported[0];

  if (!audioFile) return null;

  const streamUrl =
    "https://archive.org/download/" +
    encodeURIComponent(identifier) +
    "/" +
    encodeArchivePathPart(audioFile.name);

  const rawDuration =
    audioFile.length &&
    Number(audioFile.length) > 0
      ? 0
      : 0;

  return {
    audioFile,
    streamUrl,
    duration: rawDuration
  };
}

async function searchInternetArchive(query) {
  if (!query) return [];

  const url = new URL(ARCHIVE_SEARCH);

  url.searchParams.set(
    "q",
    "(" + query.replace(/[+\-!(){}\[\]^"~*?:\\/]/g, " ") +
      ") AND mediatype:audio"
  );

  url.searchParams.append("fl[]", "identifier");
  url.searchParams.append("fl[]", "title");
  url.searchParams.append("fl[]", "creator");
  url.searchParams.append("fl[]", "mediatype");

  url.searchParams.set("rows", "15");
  url.searchParams.set("page", "1");
  url.searchParams.set("output", "json");

  const result = await fetchJson(url.toString());

  const docs = result?.response?.docs || [];

  // Получаем метаданные аудиофайлов параллельно.
  // Ограничиваем число записей, чтобы не перегружать API.
  const checked = await Promise.allSettled(
    docs.slice(0, 12).map(async item => {
      if (!item.identifier) return null;

      const audio = await getArchiveAudio(item.identifier);

      if (!audio) return null;

      return {
        id: "archive:" + item.identifier,
        title: archiveTitle(item),
        artist: archiveCreator(item),
        artwork:
          "https://archive.org/services/img/" +
          encodeURIComponent(item.identifier),
        duration: audio.duration,
        source: "Internet Archive",
        permalink:
          "https://archive.org/details/" +
          encodeURIComponent(item.identifier),
        streamUrl: audio.streamUrl
      };
    })
  );

  return checked
    .filter(result => result.status === "fulfilled")
    .map(result => result.value)
    .filter(Boolean);
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
          "access-control-allow-methods": "GET, OPTIONS",
          "access-control-allow-headers": "Content-Type, Range"
        }
      });
    }

    if (url.pathname === "/api/health") {
      return json({
        service: "RH MUSIC API",
        status: "online",
        sources: [
          "Audius",
          "Internet Archive"
        ]
      });
    }

    if (url.pathname === "/api/search") {
      const query = (url.searchParams.get("q") || "").trim();

      if (query.length > 160) {
        return json({
          error: "Поисковый запрос слишком длинный."
        }, 400);
      }

      // Без запроса показываем популярные треки Audius.
      if (!query) {
        try {
          const tracks = await searchAudius("", env);

          return json({
            tracks,
            sources: ["Audius"]
          });
        } catch (error) {
          return json({
            tracks: [],
            sources: [],
            error: "Не удалось загрузить популярную музыку."
          }, 502);
        }
      }

      // Ищем одновременно в обоих источниках.
      const results = await Promise.allSettled([
        searchAudius(query, env),
        searchInternetArchive(query)
      ]);

      const audiusTracks =
        results[0].status === "fulfilled"
          ? results[0].value
          : [];

      const archiveTracks =
        results[1].status === "fulfilled"
          ? results[1].value
          : [];

      // Объединяем результаты и убираем дубликаты.
      const combined = [
        ...audiusTracks,
        ...archiveTracks
      ];

      const unique = [];
      const seen = new Set();

      for (const track of combined) {
        const key = track.source + ":" + track.id;

        if (seen.has(key)) continue;

        seen.add(key);
        unique.push(track);
      }

      const activeSources = [];

      if (audiusTracks.length) {
        activeSources.push("Audius");
      }

      if (archiveTracks.length) {
        activeSources.push("Internet Archive");
      }

      return json({
        tracks: unique,
        sources: activeSources,
        sourceStatus: {
          audius: results[0].status === "fulfilled",
          internetArchive: results[1].status === "fulfilled"
        }
      });
    }

    if (url.pathname === "/api/stream") {
      const id = (url.searchParams.get("id") || "").trim();

      // Прямые ссылки Internet Archive передаются в index.html
      // через поле streamUrl. Этот маршрут нужен для Audius.
      if (
        !/^[a-zA-Z0-9_-]{1,100}$/.test(id) ||
        id.startsWith("archive:")
      ) {
        return json({
          error: "Некорректный ID трека."
        }, 400);
      }

      try {
        const streamUrl = new URL(
          AUDIUS_BASE +
          "/tracks/" +
          encodeURIComponent(id) +
          "/stream"
        );

        streamUrl.searchParams.set("app_name", AUDIUS_APP_NAME);

        if (env.AUDIUS_API_KEY) {
          streamUrl.searchParams.set(
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

        const upstream = await fetch(streamUrl.toString(), {
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
      } catch (error) {
        return json({
          error: "Не удалось открыть аудиопоток."
        }, 502);
      }
    }

    // Сохраняем поддержку Cloudflare Static Assets,
    // если она настроена в проекте.
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