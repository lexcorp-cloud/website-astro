/**
 * Two-resolver DNS comparison over DNS-over-HTTPS.
 *
 * Only Cloudflare and Google publish DoH endpoints that send CORS headers, so a
 * page-side script can read nothing else: Quad9 and AdGuard answer the request
 * but omit Access-Control-Allow-Origin, and the browser discards the body.
 * Both endpoints return the same JSON shape, so one normaliser covers both.
 */

const TYPE_CODES = {
  A: 1, AAAA: 28, CNAME: 5, MX: 15, TXT: 16, NS: 2, SOA: 6, CAA: 257,
};

const TYPE_NAMES = Object.fromEntries(
  Object.entries(TYPE_CODES).map(([name, code]) => [code, name]),
);

export const RESOLVERS = [
  {
    id: 'cloudflare',
    label: 'Cloudflare',
    addr: '1.1.1.1',
    url: (name, code) =>
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${code}`,
    headers: { Accept: 'application/dns-json' },
  },
  {
    id: 'google',
    label: 'Google',
    addr: '8.8.8.8',
    url: (name, code) =>
      `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${code}`,
    headers: {},
  },
];

const RCODES = {
  0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN',
  4: 'NOTIMP', 5: 'REFUSED', 9: 'NOTAUTH', 10: 'NOTZONE',
};

export function rcodeName(status) {
  return RCODES[status] || `RCODE ${status}`;
}

export function typeName(code) {
  return TYPE_NAMES[code] || `TYPE${code}`;
}

export function typeCode(name) {
  return TYPE_CODES[String(name || '').toUpperCase()] || 0;
}

/**
 * Deliberately not email-scan's normaliseDomain: that helper strips a leading
 * "www." (right for finding an org's MX, wrong here — www is the record people
 * migrate most). Underscore labels (_dmarc, _acme-challenge) must also survive.
 */
export function normaliseName(input) {
  let n = String(input || '').trim().toLowerCase();
  n = n.replace(/^https?:\/\//, '');
  n = n.split('/')[0].split('?')[0].split('#')[0];
  n = n.split('@').pop();
  n = n.replace(/:\d+$/, '');
  return n.replace(/\.$/, '');
}

export function isQueryableName(n) {
  if (!n || n.length > 253) return false;
  // Trailing label allows a-z0-9- so punycode TLDs (xn--p1ai) are queryable.
  return /^(\*\.)?([a-z0-9_](-*[a-z0-9_])*\.)+[a-z][a-z0-9-]{1,62}$/i.test(n);
}

function stripDot(s) {
  return s.length > 1 && s.endsWith('.') ? s.slice(0, -1) : s;
}

/**
 * Long TXT records arrive as several quoted strings; consumers concatenate them,
 * so the segment boundaries must not count as a difference between resolvers.
 */
function joinTxt(data) {
  const parts = data.match(/"((?:[^"\\]|\\.)*)"/g);
  return parts ? parts.map((p) => p.slice(1, -1)).join('') : data.trim();
}

/** Comparison key: same record from two resolvers must produce the same string. */
export function recordKey(type, data) {
  const raw = String(data || '').trim().replace(/\s+/g, ' ');
  if (type === 16) return `16|${joinTxt(raw)}`;
  if (type === 15) {
    const [pref, ...host] = raw.split(' ');
    return `15|${pref} ${stripDot(host.join(' ').toLowerCase())}`;
  }
  if (type === 257) return `257|${raw.toLowerCase().replace(/"/g, '')}`;
  if (type === 6) {
    return `6|${raw.toLowerCase().split(' ').map(stripDot).join(' ')}`;
  }
  return `${type}|${stripDot(raw.toLowerCase())}`;
}

export function fmtSeconds(s) {
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return rem ? `${m}m ${rem}s` : `${m}m`;
  const h = Math.floor(m / 60);
  const mm = m % 60;
  return mm ? `${h}h ${mm}m` : `${h}h`;
}

async function fetchJson(resolver, name, code, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(resolver.url(name, code), {
      headers: resolver.headers,
      signal: ctrl.signal,
      cache: 'no-store',
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Never rejects — every failure comes back as { state: 'error' } so a caller can
 * render one dead resolver next to one live one instead of losing both.
 */
export async function queryResolver(resolver, name, code, timeoutMs = 9000) {
  const started = performance.now();
  try {
    const json = await fetchJson(resolver, name, code, timeoutMs);
    const ms = Math.round(performance.now() - started);
    const status = typeof json.Status === 'number' ? json.Status : -1;
    const answers = Array.isArray(json.Answer) ? json.Answer : [];
    const authority = Array.isArray(json.Authority) ? json.Authority : [];

    const records = answers
      .filter((a) => a && typeof a.data === 'string')
      .map((a) => ({
        name: stripDot(String(a.name || '').toLowerCase()),
        type: Number(a.type),
        ttl: Number(a.TTL),
        data: a.data.trim(),
      }));

    const matching = records.filter((r) => r.type === code);
    const ttlPool = (matching.length ? matching : records).map((r) => r.ttl)
      .filter((t) => Number.isFinite(t));

    // Negative answers carry the zone SOA; its TTL is how long "missing" sticks.
    const soa = authority.find((r) => Number(r.type) === 6);
    const soaMin = soa ? Number(String(soa.data).trim().split(/\s+/).pop()) : NaN;

    let state = 'answers';
    if (status === 3) state = 'nxdomain';
    else if (status === 0 && records.length === 0) state = 'nodata';
    else if (status !== 0) state = 'rcode';

    return {
      id: resolver.id,
      label: resolver.label,
      addr: resolver.addr,
      ms,
      status,
      state,
      records,
      matching,
      ttl: ttlPool.length ? Math.min(...ttlPool) : NaN,
      negTtl: soa && Number.isFinite(Number(soa.TTL)) ? Number(soa.TTL) : NaN,
      soaMinimum: Number.isFinite(soaMin) ? soaMin : NaN,
      truncated: json.TC === true,
      keys: records.map((r) => recordKey(r.type, r.data)).sort(),
    };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || /abort/i.test(String(err.message)));
    return {
      id: resolver.id,
      label: resolver.label,
      addr: resolver.addr,
      ms: Math.round(performance.now() - started),
      state: 'error',
      records: [],
      matching: [],
      keys: [],
      error: aborted
        ? `No answer within ${Math.round(timeoutMs / 1000)}s`
        : `Request failed (${err && err.message ? err.message : 'network or CORS block'})`,
    };
  }
}

export function checkPropagation(name, code, timeoutMs = 9000) {
  return Promise.all(RESOLVERS.map((r) => queryResolver(r, name, code, timeoutMs)));
}

function sameKeys(a, b) {
  return a.length === b.length && a.every((k, i) => k === b[i]);
}

/**
 * Answer order is not significant in DNS — resolvers rotate round-robin sets on
 * purpose — so comparison happens on sorted key sets, never on array order.
 */
export function compareResults(a, b, code = 0) {
  if (a.state === 'error' && b.state === 'error') {
    return {
      tone: 'bad',
      title: 'Both resolvers unreachable',
      detail: 'Neither DoH endpoint answered, so nothing was compared. This is a problem with the browser’s network path (offline, captive portal, DoH blocked by a filtering proxy or extension), not with the domain.',
    };
  }
  if (a.state === 'error' || b.state === 'error') {
    const dead = a.state === 'error' ? a : b;
    const live = a.state === 'error' ? b : a;
    return {
      tone: 'warn',
      title: `Only ${live.label} answered`,
      detail: `${dead.label} could not be reached, so no comparison is possible. Re-run in a moment; if it keeps failing, something on this network is blocking ${dead.label}’s DoH endpoint.`,
    };
  }
  if (a.state === 'rcode' || b.state === 'rcode') {
    const same = a.status === b.status;
    return {
      tone: same ? 'bad' : 'warn',
      title: same
        ? `Both resolvers return ${rcodeName(a.status)}`
        : `Resolvers disagree: ${rcodeName(a.status)} vs ${rcodeName(b.status)}`,
      detail: same
        ? 'A matching server-side failure is not a propagation problem. SERVFAIL usually means a broken delegation (nameservers that do not answer for the zone) or a DNSSEC validation failure; REFUSED means the resolver declined the query.'
        : 'One resolver is failing where the other succeeds — typically a DNSSEC validation difference or one nameserver in the delegation misbehaving. Check the delegation before assuming it is a cache issue.',
    };
  }
  const missA = a.state === 'nxdomain';
  const missB = b.state === 'nxdomain';
  if (missA !== missB) {
    const gone = missA ? a : b;
    const has = missA ? b : a;
    return {
      tone: 'warn',
      title: 'Mid-propagation — one resolver says the name does not exist',
      detail: `${has.label} resolves this name, but ${gone.label} returns NXDOMAIN. That is a cached negative answer: ${gone.label} asked before the record existed and is holding "no such name" until its negative TTL expires. Nothing is broken — it clears on its own.`,
    };
  }
  if (missA && missB) {
    return {
      tone: 'neutral',
      title: 'Consistent — both resolvers say the name does not exist',
      detail: 'Both returned NXDOMAIN. If you have just created the record, both resolvers now hold a negative cache entry and will keep answering NXDOMAIN until it expires — see the negative TTL on each card.',
    };
  }
  const emptyA = a.state === 'nodata';
  const emptyB = b.state === 'nodata';
  if (emptyA && emptyB) {
    return {
      tone: 'neutral',
      title: 'Consistent — the name exists but has no records of this type',
      detail: 'Both resolvers returned NOERROR with an empty answer (NODATA). The domain is delegated and answering; it just has nothing at this record type. Check you picked the right type, and the right label.',
    };
  }
  if (emptyA !== emptyB) {
    const empty = emptyA ? a : b;
    const full = emptyA ? b : a;
    return {
      tone: 'warn',
      title: 'Not yet consistent — one resolver has no records of this type',
      detail: `${full.label} returns ${full.matching.length || full.records.length} record(s) while ${empty.label} returns an empty answer for the same query. That is a stale cache on ${empty.label}, or a record only just published.`,
      onlyLabel: full.label,
      only: full.records.map((r) => `${typeName(r.type)} ${r.data}`),
    };
  }
  if (sameKeys(a.keys, b.keys)) {
    return {
      tone: 'good',
      title: 'Consistent — both resolvers agree',
      detail: 'Identical answer sets from two independent resolvers. Answer order was ignored, as it should be: round-robin rotation is normal and does not mean the records differ.',
    };
  }
  const setB = new Set(b.keys);
  const setA = new Set(a.keys);

  /**
   * A zone served by two DNS providers (NS1 + Route 53, say) hands out a
   * different SOA and NS set depending on which authoritative side answered.
   * That difference is permanent and correct, so it must not be sold as a
   * stale cache the user can wait out.
   */
  const delegationType = code === 6 || code === 2;
  return {
    tone: 'warn',
    title: 'Not yet consistent — the answer sets differ',
    detail: delegationType
      ? 'The two resolvers return different records for the same query. For SOA and NS this has two very different causes: either one resolver is still serving a cached copy of the old delegation, or the zone is genuinely hosted at more than one DNS provider, in which case each resolver reports whichever authoritative side answered it and the difference is permanent and correct. Compare the nameserver hostnames below — if they belong to two different providers, this is multi-provider hosting, not propagation. Differing SOA serial numbers alone are also normal between providers.'
      : 'The two resolvers return different records for the same query. Usually one is still serving a cached copy of the old answer — wait for the TTL shown on that card to run down, then re-check. But a difference that never converges is not a cache at all: Google’s resolver forwards your approximate network location to the authoritative server (EDNS Client Subnet) and Cloudflare’s deliberately does not, so a CDN or a latency-routed or geo-routed record answers the two of them differently on purpose, permanently. Re-check once the longer TTL above has expired — if the sets still differ, this is routing, not propagation.',
    diff: [
      {
        label: a.label,
        items: a.records.filter((r) => !setB.has(recordKey(r.type, r.data)))
          .map((r) => `${typeName(r.type)} ${r.data}`),
      },
      {
        label: b.label,
        items: b.records.filter((r) => !setA.has(recordKey(r.type, r.data)))
          .map((r) => `${typeName(r.type)} ${r.data}`),
      },
    ],
  };
}
