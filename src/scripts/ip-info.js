/* ------------------------------------------------------------------
   Public IP + connection + device details.

   Most of what this reports needs no network call at all — the browser
   already knows the device, GPU, screen and connection quality. Only the
   public IP and its geo/ISP lookup require a request, and both sources
   are CORS-open and free.
------------------------------------------------------------------- */

/** Cloudflare's trace endpoint: fastest source, key=value lines, no rate limit. */
export async function cloudflareTrace() {
  const res = await fetch('https://www.cloudflare.com/cdn-cgi/trace', { cache: 'no-store' });
  if (!res.ok) throw new Error('Could not reach the IP service.');
  const text = await res.text();
  return Object.fromEntries(
    text.trim().split('\n').map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    })
  );
}

const isV6 = (ip) => typeof ip === 'string' && ip.includes(':');

/**
 * Resolve both address families. A visitor is usually reachable over one or
 * both; which one the browser prefers varies, so we ask for each explicitly
 * rather than assuming the first answer is IPv4.
 */
export async function bothAddresses(primary) {
  const grab = async (url) => {
    try {
      const r = await fetch(url, { cache: 'no-store' });
      if (!r.ok) return null;
      const j = await r.json();
      return j.ip || null;
    } catch {
      return null;
    }
  };

  const [v4Guess, dual] = await Promise.all([
    grab('https://api.ipify.org?format=json'),   // IPv4-only endpoint
    grab('https://api64.ipify.org?format=json'), // prefers IPv6 when available
  ]);

  const candidates = [primary, v4Guess, dual].filter(Boolean);
  return {
    v4: candidates.find((ip) => !isV6(ip)) || null,
    v6: candidates.find(isV6) || null,
  };
}

/** Geo/ISP enrichment. Rate-limited on the free tier, so failure is tolerated. */
export async function geoLookup() {
  try {
    const r = await fetch('https://ipapi.co/json/', { cache: 'no-store' });
    if (!r.ok) return null;
    const j = await r.json();
    if (j.error) return null;
    return {
      city: j.city,
      region: j.region,
      country: j.country_name,
      countryCode: j.country_code,
      org: j.org,
      asn: j.asn,
      timezone: j.timezone,
    };
  } catch {
    return null;
  }
}

/* ---------------- browser-side facts (no network) ---------------- */

function parseUserAgent(ua) {
  const browsers = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ];
  let browser = 'Unknown';
  let version = '';
  for (const [re, name] of browsers) {
    const m = ua.match(re);
    if (m) {
      browser = name;
      version = m[1];
      break;
    }
  }

  let os = 'Unknown';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10 or 11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if (/Mac OS X/.test(ua)) os = 'macOS';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad/.test(ua)) os = 'iOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return { browser, version: version.split('.')[0], os };
}

function gpuRenderer() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const dbg = gl?.getExtension('WEBGL_debug_renderer_info');
    if (!gl || !dbg) return null;
    // Strip the ANGLE wrapper so the actual GPU name is readable.
    return String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL))
      .replace(/^ANGLE \(/, '')
      .replace(/\)$/, '')
      .split(',')
      .slice(0, 2)
      .join(',')
      .trim();
  } catch {
    return null;
  }
}

export function deviceInfo() {
  const { browser, version, os } = parseUserAgent(navigator.userAgent || '');
  const c = navigator.connection || {};

  return {
    browser: version ? `${browser} ${version}` : browser,
    os,
    gpu: gpuRenderer(),
    cores: navigator.hardwareConcurrency || null,
    memory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : null,
    screen: screen.width ? `${screen.width} × ${screen.height}` : null,
    pixelRatio: `${window.devicePixelRatio}×`,
    // Some embedded/headless contexts report 0 — omit rather than print "0 × 0".
    viewport: window.innerWidth > 0 ? `${window.innerWidth} × ${window.innerHeight}` : null,
    languages: (navigator.languages || [navigator.language]).slice(0, 3).join(', '),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    touch: navigator.maxTouchPoints > 0 ? `Yes (${navigator.maxTouchPoints} points)` : 'No',
    connectionType: c.effectiveType ? c.effectiveType.toUpperCase() : null,
    downlink: c.downlink ? `${c.downlink} Mbps (estimate)` : null,
    rtt: c.rtt != null ? `${c.rtt} ms` : null,
    cookies: navigator.cookieEnabled ? 'Enabled' : 'Blocked',
    doNotTrack: navigator.doNotTrack === '1' ? 'On' : 'Off',
    colourScheme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'Dark' : 'Light',
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'Requested' : 'Not requested',
  };
}

/** Everything, resolved together. Geo is best-effort and never blocks. */
export async function collect() {
  const trace = await cloudflareTrace();
  const [addresses, geo] = await Promise.all([bothAddresses(trace.ip), geoLookup()]);

  return {
    addresses,
    geo,
    edge: { colo: trace.colo, tls: trace.tls, http: trace.http, warp: trace.warp === 'on', country: trace.loc },
    device: deviceInfo(),
  };
}
