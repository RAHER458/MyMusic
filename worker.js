/** 
 * RH MUSIC — Cloudflare Worker API
 * Sources: Audius + YouTube Music via public Piped API instances
 *
 * Endpoints:
 *   GET /api/health
 *   GET /api/search?q=...
 *   GET /api/stream?id=...
 *
 * YouTube IDs use the prefix "yt_".
 */

const AUDIUS_BASE = "https://api.audius.co/v1";
const APP_NAME = "RH_MUSIC";

const PIPED_INSTANCES = [
  "https://pipedapi.kavin.rocks",
  "https://pipedapi.leptons.xyz",
  "https://pipedapi.nosebs.ru",
  "https://piped-api.privacy.com.de",
  "https://pipedapi.adminforge.de",
  "https://api.piped.yt",
  "https://pipedapi.owo.si",
  "https://pipedapi.reallyaweso.me",
  "https://api.piped.private.coffee"
];

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
  headers.set("cross-origin-resource-policy", "cross-origin");

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

async function audiusFetch(path, env) {
  const url = new URL(AUDIUS_BASE + path);

  url.searchParams.set("app_name", APP_NAME);

  if (env.AUDIUS_API_KEY) {
    url.searchParams.set("api_key", env.AUDIUS_API_KEY);
  }

  const response = await fetch(url.toString(), {
    headers: {
      accept: "application/json"
    },
    cf: {
      cacheTtl: 30,
      cacheEverything: true
    }
  });

  if (!response.ok) {
    throw new Error("Audius HTTP " + response.status);
  }

  return response.json();
}

function mapAudius(track) {
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

function getVideoId(item) {
  if (item.videoId) {
    return String(item.videoId);
  }

  const raw = String(item.url || item.link || "");

  try {
    const url = new URL(raw, "https://www.youtube.com");
    const videoId = url.searchParams.get("v");

    if (videoId) {
      return videoId;
    }

    const match = url.pathname.match(
      /\/watch\/([A-Za-z0-9_-]{11})/
    );

    if (match) {
      return match[1];
    }
  } catch {
    // Try the regular expression below.
  }

  const match = raw.match(/[?&]v=([A-Za-z0-9_-]{11})/);

  return match ? match[1] : "";
}

async function pipedRequest(path) {
  let lastError = "Нет доступных Piped-серверов";

  for (const base of PIPED_INSTANCES) {
    try {
      const response = await fetch(base + path, {
        headers: {
          accept: "application/json",
          "user-agent": "RH-MUSIC/1.0"
        },
        signal: AbortSignal.timeout(6500)
      });

      if (!response.ok) {
        lastError = "Piped HTTP " + response.status;
        continue;
      }

      return await response.json();
    } catch (error) {
      lastError = error?.message || lastError;
    }
  }

  throw new Error(lastError);
}

async function searchPiped(query) {
  const path =
    "/search?query=" +
    encodeURIComponent(query) +
    "&filter=music_songs";

  const data = await pipedRequest(path);

  const items = Array.isArray(data)
    ? data
    : data.items || data.relatedStreams || [];

  return items
    .filter(item =>
      item &&
      (
        item.type === "stream" ||
        item.videoId ||
        item.url
      )
    )
    .map(item => {
      const videoId = getVideoId(item);

      if (!videoId) {
        return null;
      }

      return {
        id: "yt_" + videoId,
        title: item.title || "Без названия",
        artist:
          item.uploaderName ||
          item.uploader ||
          item.channelName ||
          "YouTube Music",
        artwork:
          item.thumbnail ||
          item.thumbnailUrl ||
          "",
        duration: Number(item.duration) || 0,
        source: "YouTube Music",
        permalink:
          "https://www.youtube.com/watch?v=" + videoId,
        streamUrl: ""
      };
    })
    .filter(Boolean)
    .slice(0, 15);
}

async function streamAudius(request, id, env) {
  const streamUrl = new URL(
    `${AUDIUS_BASE}/tracks/${encodeURIComponent(id)}/stream`
  );

  streamUrl.searchParams.set("app_name", APP_NAME);

  if (env.AUDIUS_API_KEY) {
    streamUrl.searchParams.set("api_key", env.AUDIUS_API_KEY);
  }

  const headers = new Headers({
    accept: "*/*"
  });

  const range = request.headers.get("range");

  if (range) {
    headers.set("range", range);
  }

  const upstream = await fetch(streamUrl.toString(), {
    headers,
    redirect: "follow"
  });

  if (!upstream.ok && upstream.status !== 206) {
    return json(
      {
        error: "Этот трек Audius сейчас недоступен."
      },
      upstream.status || 502
    );
  }

  return withCors(
    new Response(upstream.body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: upstream.headers
    })
  );
}

async function streamYouTube(request, videoId) {
  const data = await pipedRequest(
    "/streams/" + encodeURIComponent(videoId)
  );

  const streams = Array.isArray(data.audioStreams)
    ? data.audioStreams
    : [];

  const stream = streams
    .filter(item => item && item.url)
    .sort(
      (a, b) =>
        (Number(b.bitrate) || 0) -
        (Number(a.bitrate) || 0)
    )[0];

  if (!stream) {
    return json(
      {
        error:
          "Для этой композиции не найден аудиопоток. Попробуй другой результат."
      },
      502
    );
  }

  const headers = new Headers({
    accept: "*/*"
  });

  const range = request.headers.get("range");

  if (range) {
    headers.set("range", range);
  }

  const upstream = await fetch(stream.url, {
    headers,
    redirect: "follow",
    signal: AbortSignal.timeout(15000)
  });

  if (!upstream.ok && upstream.status !== 206) {
    return json(
      {
        error: "Аудиопоток временно недоступен."
      },
      502
    );
  }

  const outputHeaders = new Headers(upstream.headers);

  outputHeaders.set("access-control-allow-origin", "*");
  outputHeaders.set(
    "access-control-allow-methods",
    "GET, OPTIONS"
  );
  outputHeaders.set(
    "access-control-allow-headers",
    "Content-Type, Range"
  );
  outputHeaders.set(
    "cross-origin-resource-policy",
    "cross-origin"
  );

  if (!outputHeaders.has("content-type") && stream.mimeType) {
    outputHeaders.set("content-type", stream.mimeType);
  }

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outputHeaders
  });
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
      return json({
        service: "RH MUSIC API",
        status: "online",
        sources: [
          "Audius",
          "YouTube Music via Piped"
        ]
      });
    }

    if (url.pathname === "/api/search") {
      const query = (
        url.searchParams.get("q") || ""
      ).trim();

      if (query.length > 160) {
        return json(
          {
            error: "Поисковый запрос слишком длинный."
          },
          400
        );
      }

      if (!query) {
        try {
          const result = await audiusFetch(
            "/tracks/trending?limit=20",
            env
          );

          const tracks = (
            Array.isArray(result.data)
              ? result.data
              : []
          )
            .filter(track => track?.id)
            .map(mapAudius);

          return json({
            tracks,
            sources: ["Audius"]
          });
        } catch {
          return json(
            {
              tracks: [],
              sources: [],
              error:
                "Не удалось загрузить популярные треки. Попробуй поиск по названию."
            },
            502
          );
        }
      }

      const [audiusResult, pipedResult] =
        await Promise.allSettled([
          (async () => {
            const result = await audiusFetch(
              "/tracks/search?query=" +
                encodeURIComponent(query) +
                "&limit=20",
              env
            );

            return (
              Array.isArray(result.data)
                ? result.data
                : []
            )
              .filter(track => track?.id)
              .map(mapAudius);
          })(),

          searchPiped(query)
        ]);

      const tracks = [];

      if (audiusResult.status === "fulfilled") {
        tracks.push(...audiusResult.value);
      }

      if (pipedResult.status === "fulfilled") {
        tracks.push(...pipedResult.value);
      }

      if (!tracks.length) {
        return json(
          {
            tracks: [],
            sources: [],
            error:
              "Источники музыки временно не ответили. Попробуй ещё раз позже."
          },
          502
        );
      }

      return json({
        tracks,
        sources: [
          ...new Set(tracks.map(track => track.source))
        ]
      });
    }

    if (url.pathname === "/api/stream") {
      const id = (
        url.searchParams.get("id") || ""
      ).trim();

      if (id.startsWith("yt_")) {
        const videoId = id.slice(3);

        if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) {
          return json(
            {
              error: "Некорректный YouTube ID."
            },
            400
          );
        }

        try {
          return await streamYouTube(request, videoId);
        } catch (error) {
          return json(
            {
              error:
                "Не удалось получить аудиопоток YouTube: " +
                (error?.message || "ошибка")
            },
            502
          );
        }
      }

      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(id)) {
        return json(
          {
            error: "Некорректный ID трека."
          },
          400
        );
      }

      try {
        return await streamAudius(request, id, env);
      } catch (error) {
        return json(
          {
            error:
              "Не удалось открыть аудиопоток Audius: " +
              (error?.message || "ошибка")
          },
          502
        );
      }
    }

    return json({
      service: "RH MUSIC API",
      status: "online",
      message:
        "API работает. Используй /api/health, /api/search и /api/stream."
    });
  }
};