const METERED_BASE_URL =
  import.meta.env.VITE_METERED_TURN_BASE_URL ||
  import.meta.env.REACT_APP_METERED_TURN_BASE_URL ||
  'https://aqua-chat.metered.live/api/v1/turn/credentials';

const FALLBACK_ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

/** Default TTL when API does not return expiry (Metered credentials are typically long-lived). */
const DEFAULT_CACHE_TTL_MS = 23 * 60 * 60 * 1000;

let sessionCache = null;
let inflightRequest = null;

const buildCredentialsUrl = () => {
  const fullUrl = (
    import.meta.env.VITE_METERED_TURN_CREDENTIALS_URL ||
    import.meta.env.REACT_APP_METERED_TURN_CREDENTIALS_URL
  )?.trim();
  if (fullUrl) return fullUrl;

  const apiKey = (
    import.meta.env.VITE_METERED_TURN_API_KEY ||
    import.meta.env.REACT_APP_METERED_TURN_API_KEY
  )?.trim();
  if (!apiKey) return null;

  const url = new URL(METERED_BASE_URL);
  url.searchParams.set('apiKey', apiKey);
  return url.toString();
};

const normalizeEntry = (entry) => {
  if (!entry) return null;
  const rawUrls = entry.urls ?? entry.url;
  if (!rawUrls) return null;

  const server = {
    urls: Array.isArray(rawUrls) ? rawUrls : [rawUrls]
  };
  if (entry.username) server.username = entry.username;
  if (entry.credential) server.credential = entry.credential;
  return server;
};

const normalizeIceServers = (payload) => {
  const list = Array.isArray(payload)
    ? payload
    : payload?.iceServers || payload?.ice_servers || [];

  return list.map(normalizeEntry).filter(Boolean);
};

const resolveCacheTtl = (payload) => {
  const ttlSeconds = payload?.ttl || payload?.ttlSeconds || payload?.expiresIn;
  if (typeof ttlSeconds === 'number' && ttlSeconds > 60) {
    return ttlSeconds * 1000;
  }
  return DEFAULT_CACHE_TTL_MS;
};

const fetchFromMetered = async () => {
  const url = buildCredentialsUrl();
  if (!url) {
    console.warn('[ICE] VITE_METERED_TURN_API_KEY or VITE_METERED_TURN_CREDENTIALS_URL not set; using STUN fallback.');
    return { servers: FALLBACK_ICE_SERVERS, source: 'fallback' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch(url, {
      method: 'GET',
      credentials: 'omit',
      cache: 'no-store',
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`Metered API responded with ${response.status}`);
    }

    const payload = await response.json();
    const servers = normalizeIceServers(payload);

    if (!servers.length) {
      throw new Error('Metered API returned no ICE servers');
    }

    return {
      servers,
      source: 'metered',
      expiresAt: Date.now() + resolveCacheTtl(payload)
    };
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Returns Metered TURN/STUN servers for the current session.
 * Deduplicates concurrent requests and caches until expiry.
 */
export const getIceServers = async () => {
  if (sessionCache && sessionCache.expiresAt > Date.now()) {
    return sessionCache.servers;
  }

  if (inflightRequest) {
    return inflightRequest;
  }

  inflightRequest = (async () => {
    try {
      const result = await fetchFromMetered();
      sessionCache = {
        servers: result.servers,
        expiresAt: result.expiresAt || Date.now() + DEFAULT_CACHE_TTL_MS,
        source: result.source
      };
      return sessionCache.servers;
    } catch (error) {
      const message = error.name === 'AbortError' ? 'Metered API timed out' : error.message;
      console.warn(`[ICE] ${message}; using STUN fallback.`);
      sessionCache = {
        servers: FALLBACK_ICE_SERVERS,
        expiresAt: Date.now() + 5 * 60 * 1000,
        source: 'fallback'
      };
      return sessionCache.servers;
    } finally {
      inflightRequest = null;
    }
  })();

  return inflightRequest;
};

/** Warm ICE credentials when the chat shell loads to reduce call setup latency. */
export const prefetchIceServers = () => {
  getIceServers().catch(() => {});
};

export const clearIceServerCache = () => {
  sessionCache = null;
  inflightRequest = null;
};

export const getIceServerCacheInfo = () =>
  sessionCache
    ? { source: sessionCache.source, expiresAt: sessionCache.expiresAt }
    : null;
