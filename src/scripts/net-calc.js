/* ------------------------------------------------------------------
   IPv4 subnet maths. Pure arithmetic — no network, nothing to fail.

   Uses unsigned 32-bit integers throughout. JavaScript bitwise ops are
   signed, so every result is passed through `>>> 0` before use; skipping
   that is the classic way subnet calculators produce negative octets.
------------------------------------------------------------------- */

export function parseIpv4(input) {
  const parts = String(input).trim().split('.');
  if (parts.length !== 4) return null;

  const octets = parts.map((p) => {
    if (!/^\d{1,3}$/.test(p)) return NaN;
    return Number(p);
  });

  if (octets.some((o) => Number.isNaN(o) || o < 0 || o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

export const toIpv4 = (n) =>
  [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');

export const maskFromPrefix = (prefix) =>
  prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;

export const prefixFromMask = (mask) => {
  // A valid mask is contiguous ones followed by contiguous zeros.
  const inverted = ~mask >>> 0;
  if (((inverted + 1) & inverted) !== 0) return null;
  let bits = 0;
  let m = mask;
  while (m) {
    bits += m & 1;
    m >>>= 1;
  }
  return bits;
};

/** Private / reserved ranges, useful context when planning a network. */
function classify(network) {
  const ranges = [
    [parseIpv4('10.0.0.0'), 8, 'Private (RFC 1918)'],
    [parseIpv4('172.16.0.0'), 12, 'Private (RFC 1918)'],
    [parseIpv4('192.168.0.0'), 16, 'Private (RFC 1918)'],
    [parseIpv4('127.0.0.0'), 8, 'Loopback'],
    [parseIpv4('169.254.0.0'), 16, 'Link-local (APIPA)'],
    [parseIpv4('100.64.0.0'), 10, 'Carrier-grade NAT'],
    [parseIpv4('224.0.0.0'), 4, 'Multicast'],
    [parseIpv4('0.0.0.0'), 8, 'This network'],
  ];

  for (const [base, bits, label] of ranges) {
    if ((network >>> (32 - bits)) === (base >>> (32 - bits))) return label;
  }
  return 'Public';
}

/**
 * Accepts "10.0.0.0/24", "10.0.0.0 255.255.255.0", or an address plus a
 * separate prefix. Returns null on anything it cannot make sense of.
 */
export function calculate(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  let addrPart;
  let prefix;

  if (raw.includes('/')) {
    const [a, p] = raw.split('/');
    addrPart = a.trim();
    if (!/^\d{1,2}$/.test(p.trim())) return null;
    prefix = Number(p.trim());
  } else if (/\s+/.test(raw)) {
    const [a, m] = raw.split(/\s+/);
    addrPart = a;
    const mask = parseIpv4(m);
    if (mask === null) return null;
    prefix = prefixFromMask(mask);
    if (prefix === null) return null; // non-contiguous mask
  } else {
    addrPart = raw;
    prefix = 24; // sensible default so a bare address still returns something
  }

  const addr = parseIpv4(addrPart);
  if (addr === null || prefix < 0 || prefix > 32) return null;

  const mask = maskFromPrefix(prefix);
  const network = (addr & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const total = prefix === 32 ? 1 : 2 ** (32 - prefix);

  // /31 is a point-to-point link (RFC 3021) and /32 is a single host — neither
  // reserves network and broadcast addresses, which trips up naive calculators.
  let usable;
  let firstHost;
  let lastHost;
  if (prefix >= 31) {
    usable = total;
    firstHost = network;
    lastHost = broadcast;
  } else {
    usable = total - 2;
    firstHost = (network + 1) >>> 0;
    lastHost = (broadcast - 1) >>> 0;
  }

  return {
    input: `${toIpv4(addr)}/${prefix}`,
    prefix,
    netmask: toIpv4(mask),
    wildcard: toIpv4(~mask >>> 0),
    network: toIpv4(network),
    broadcast: prefix >= 31 ? '—' : toIpv4(broadcast),
    firstHost: toIpv4(firstHost),
    lastHost: toIpv4(lastHost),
    totalAddresses: total,
    usableHosts: usable,
    range: `${toIpv4(network)} – ${toIpv4(broadcast)}`,
    type: classify(network),
    binaryMask: toIpv4(mask)
      .split('.')
      .map((o) => Number(o).toString(2).padStart(8, '0'))
      .join('.'),
    note:
      prefix === 32
        ? 'A /32 is a single host address — no network or broadcast address is reserved.'
        : prefix === 31
          ? 'A /31 is a point-to-point link (RFC 3021). Both addresses are usable.'
          : null,
  };
}

/** Split a network into equal subnets of the requested prefix. */
export function subdivide(input, newPrefix) {
  const base = calculate(input);
  if (!base || newPrefix < base.prefix || newPrefix > 32) return null;

  const count = 2 ** (newPrefix - base.prefix);
  // Cap the list: 4096 rows is already unusable in a browser, and a /8 → /32
  // split would be 16 million.
  const cap = 256;
  const step = newPrefix === 32 ? 1 : 2 ** (32 - newPrefix);
  const start = parseIpv4(base.network);

  const rows = [];
  for (let i = 0; i < Math.min(count, cap); i++) {
    const net = (start + i * step) >>> 0;
    const bcast = (net + step - 1) >>> 0;
    rows.push({
      cidr: `${toIpv4(net)}/${newPrefix}`,
      range: `${toIpv4(net)} – ${toIpv4(bcast)}`,
      hosts: newPrefix >= 31 ? step : step - 2,
    });
  }

  return { count, shown: rows.length, truncated: count > cap, rows };
}
