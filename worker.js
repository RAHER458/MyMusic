export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = url.searchParams.get('url');

    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }

    if (!target) {
      return new Response('Missing ?url= parameter', { status: 400, headers: cors });
    }

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch (e) {
      return new Response('Invalid url', { status: 400, headers: cors });
    }

    const allowed = [
      'www.youtube.com',
      'youtube.com',
      'm.youtube.com',
      'api.jamendo.com',
      'api.soundcloud.com',
      'soundcloud.com',
      'api-v2.soundcloud.com',
    ];
    if (!allowed.includes(targetUrl.hostname)) {
      return new Response('Host not allowed: ' + targetUrl.hostname, { status: 403, headers: cors });
    }

    const resp = await fetch(targetUrl.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const newResp = new Response(resp.body, resp);
    Object.entries(cors).forEach(([k, v]) => newResp.headers.set(k, v));
    return newResp;
  },
};