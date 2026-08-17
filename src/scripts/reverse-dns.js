/* ------------------------------------------------------------------
   Reverse DNS (PTR) and forward-confirmed reverse DNS (FCrDNS).

   Everything resolves through the same CORS-open Cloudflare DoH
   endpoint the email scanner uses, so there is no backend and no view
   of DNS other than Cloudflare's cache. That limit is stated on the
   page itself, not only here.

   The IPv6 half is the part worth reading carefully: ip6.arpa names are
   built from 32 individually dot-separated nibbles of the *fully
   expanded* address, so the address has to be expanded before it is
   reversed. Compressed input ("2001:db8::1") reversed naively produces
   a name that looks plausible and is wrong.
------------------------------------------------------------------- */

import { dnsQuery, isValidDomain } from './email-scan.js';

const TYPE = { A: 1, CNAME: 5, SOA: 6, PTR: 12, AAAA: 28 };

/* An empty answer means "no PTR exists" only for NOERROR and NXDOMAIN. Any
   other rcode is the resolver failing, which is not the same claim at all. */
const RCODE = { 0: 'NOERROR', 1: 'FORMERR', 2: 'SERVFAIL', 3: 'NXDOMAIN', 4: 'NOTIMP', 5: 'REFUSED' };
export const rcodeText = (n) => RCODE[n] || (n == null ? 'no status' : `rcode ${n}`);

const trimDot = (s) => String(s || '').replace(/\.$/, '').trim();

/* ------------------------------- IPv4 ------------------------------- */

/** Returns four numbers, or null. Leading zeros are read as decimal and
 *  normalised away in the output so the echoed IP is never ambiguous. */
export function parseIpv4(input) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(input || '').trim());
  if (!m) return null;
  const octets = m.slice(1, 5).map(Number);
  return octets.some((n) => n > 255) ? null : octets;
}

/* ------------------------------- IPv6 ------------------------------- */

/**
 * Expand an IPv6 address to its 32 lowercase hex nibbles, or null if the
 * address is not valid. Handles "::" compression and the embedded IPv4
 * forms (::ffff:192.0.2.1).
 */
export function expandIpv6(input) {
  let s = String(input || '').trim().toLowerCase();
  if (s.startsWith('[') && s.endsWith(']')) s = s.slice(1, -1);
  // A zone index (fe80::1%en0) is meaningful only on the local host.
  s = s.split('%')[0];

  if (!s || !/^[0-9a-f:.]+$/.test(s)) return null;

  // Exactly one "::" at most; a bare ":" at either end is only legal as
  // part of "::", which the slice below already accounts for.
  const first = s.indexOf('::');
  if (first !== s.lastIndexOf('::')) return null;
  const hasDouble = first !== -1;
  if (/^:[^:]/.test(s) || /[^:]:$/.test(s)) return null;

  const headStr = hasDouble ? s.slice(0, first) : s;
  const tailStr = hasDouble ? s.slice(first + 2) : '';

  const head = headStr ? headStr.split(':') : [];
  const tail = tailStr ? tailStr.split(':') : [];
  if (head.includes('') || tail.includes('')) return null;

  // A dotted-quad is legal only as the final group, and only once. When a
  // "::" is present the quad has to sit *after* it: it always occupies the
  // low 32 bits, so "1.2.3.4::" (quad in the high bits, zeros after) is not
  // a form that exists and must not expand to 0102:0304::.
  const dotted = [...head, ...tail].filter((g) => g.includes('.'));
  if (dotted.length > 1) return null;
  if (dotted.length === 1) {
    const owner = hasDouble ? tail : head;
    if (!owner.length || !owner[owner.length - 1].includes('.')) return null;
    const quad = parseIpv4(owner[owner.length - 1]);
    if (!quad) return null;
    owner.pop();
    owner.push(
      (((quad[0] << 8) | quad[1]) >>> 0).toString(16).padStart(4, '0'),
      (((quad[2] << 8) | quad[3]) >>> 0).toString(16).padStart(4, '0')
    );
  }

  const groups = [...head, ...tail];
  if (groups.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;

  // "::" stands for one or more zero groups, so 8 explicit groups plus a
  // "::" (1:2:3:4:5:6:7:8::) is malformed rather than redundant.
  if (hasDouble ? groups.length > 7 : groups.length !== 8) return null;

  const filled = hasDouble
    ? [...head, ...new Array(8 - groups.length).fill('0'), ...tail]
    : head;

  return filled.map((g) => g.padStart(4, '0')).join('');
}

/** Group the 32 nibbles back into the readable, fully expanded form. */
export function groupIpv6(hex) {
  return hex.match(/.{4}/g).join(':');
}

/* --------------------------- Identity keys -------------------------- */

/** Family-tagged canonical form, so 2001:db8::1 and 2001:0db8:0:0:0:0:0:1
 *  compare equal when checking a forward lookup against the original IP. */
export function ipKey(ip) {
  const v4 = parseIpv4(ip);
  if (v4) return `v4:${v4.join('.')}`;
  const hex = expandIpv6(ip);
  return hex ? `v6:${hex}` : null;
}

/* ---------------------------- Reverse name -------------------------- */

/**
 * Build the reverse-lookup name for an IP.
 * IPv4: octets reversed + .in-addr.arpa
 * IPv6: all 32 nibbles of the expanded address reversed, each its own label.
 * Returns null when the input is not an IP address at all.
 */
export function toPtrName(input) {
  const v4 = parseIpv4(input);
  if (v4) {
    const ip = v4.join('.');
    return {
      family: 4,
      ip,
      expanded: ip,
      key: `v4:${ip}`,
      arpa: `${v4.slice().reverse().join('.')}.in-addr.arpa`,
      labels: 4,
    };
  }

  const hex = expandIpv6(input);
  if (!hex) return null;
  return {
    family: 6,
    ip: String(input).trim().toLowerCase().replace(/^\[|\]$/g, '').split('%')[0],
    expanded: groupIpv6(hex),
    key: `v6:${hex}`,
    arpa: `${hex.split('').reverse().join('.')}.ip6.arpa`,
    labels: 32,
  };
}

/* ------------------------- Special-use ranges ----------------------- */

/** Addresses with no public reverse delegation, so "no PTR" is expected
 *  rather than a misconfiguration. Worth naming instead of shrugging. */
export function specialUse(target) {
  if (target.family === 4) {
    const [a, b] = parseIpv4(target.ip);
    if (a === 0) return 'the 0.0.0.0/8 "this network" range';
    if (a === 10) return 'the 10.0.0.0/8 private range (RFC 1918)';
    if (a === 172 && b >= 16 && b <= 31) return 'the 172.16.0.0/12 private range (RFC 1918)';
    if (a === 192 && b === 168) return 'the 192.168.0.0/16 private range (RFC 1918)';
    if (a === 100 && b >= 64 && b <= 127) return 'the 100.64.0.0/10 carrier-grade NAT range';
    if (a === 127) return 'the 127.0.0.0/8 loopback range';
    if (a === 169 && b === 254) return 'the 169.254.0.0/16 link-local range';
    if (a === 192 && b === 0) return 'a reserved 192.0.0.0/16 block (includes the 192.0.2.0/24 documentation range)';
    if (a === 198 && (b === 51 || b === 18 || b === 19)) return 'a documentation or benchmarking range';
    if (a === 203 && b === 0) return 'the 203.0.113.0/24 documentation range';
    if (a >= 224 && a <= 239) return 'the multicast range';
    if (a >= 240) return 'a reserved range';
    return null;
  }

  const hex = target.key.slice(3);
  if (/^0{31}1$/.test(hex)) return 'the ::1 loopback address';
  if (/^0{32}$/.test(hex)) return 'the :: unspecified address';
  if (/^0{20}ffff/.test(hex)) return 'an IPv4-mapped address — look up the embedded IPv4 address instead';
  if (/^fe[89ab]/.test(hex)) return 'the fe80::/10 link-local range';
  if (/^f[cd]/.test(hex)) return 'the fc00::/7 unique-local range';
  if (/^20010db8/.test(hex)) return 'the 2001:db8::/32 documentation range';
  if (/^ff/.test(hex)) return 'the multicast range';
  return null;
}

/* ------------------------------ Queries ----------------------------- */

async function addressesFor(hostname) {
  const [v4, v6] = await Promise.all([
    dnsQuery(hostname, 'A').catch(() => null),
    dnsQuery(hostname, 'AAAA').catch(() => null),
  ]);
  const pick = (json, type) =>
    ((json && json.Answer) || []).filter((r) => r.type === type).map((r) => trimDot(r.data));

  return {
    addrs: [...pick(v4, TYPE.A), ...pick(v6, TYPE.AAAA)],
    cnames: pick(v4, TYPE.CNAME),
    nxdomain: !!(v4 && v6 && v4.Status === 3 && v6.Status === 3),
    reachable: !!(v4 || v6),
  };
}

/** Which zone actually answers for this reverse name, and its primary NS.
 *  Best-effort: a failure here must not fail the lookup. */
async function reverseZone(arpa) {
  try {
    const json = await dnsQuery(arpa, 'SOA');
    const soa = [...(json.Answer || []), ...(json.Authority || [])].find((r) => r.type === TYPE.SOA);
    if (!soa) return null;
    return { zone: trimDot(soa.name), primary: trimDot(String(soa.data).split(/\s+/)[0]) };
  } catch {
    return null;
  }
}

/** Strip scheme, port and path from a hostname. "www." is deliberately
 *  kept: www.example.com and example.com can point at different IPs, so
 *  dropping it would look up an address the user never asked about. */
export function cleanHost(input) {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .split('/')[0]
    .split('?')[0]
    .split('#')[0]
    .split('@')
    .pop()
    .replace(/:\d+$/, '')
    .replace(/\.$/, '');
}

/* ------------------------------- Runner ----------------------------- */

/**
 * Full reverse lookup: PTR, then the forward A/AAAA of every returned
 * hostname, then whether any of them lands back on the original IP.
 * Throws only for input that cannot be turned into an IP at all.
 */
export async function runReverseLookup(rawInput) {
  const input = String(rawInput || '').trim();
  if (!input) throw new Error('Enter an IP address, or a hostname to resolve first.');

  let target = toPtrName(input);
  let resolvedFrom = null;

  if (!target) {
    const host = cleanHost(input);
    if (!isValidDomain(host)) {
      throw new Error(`"${input}" is not a valid IP address or hostname.`);
    }
    const fwd = await addressesFor(host);
    // Neither query came back at all: that is a blocked or broken DoH path,
    // not a statement about the hostname. Say so instead of inventing an
    // authoritative "no records" answer. The wording routes the page to its
    // network-failure advice.
    if (!fwd.reachable) {
      throw new Error(`DNS query failed while resolving ${host}.`);
    }
    if (!fwd.addrs.length) {
      throw new Error(
        fwd.nxdomain
          ? `${host} does not resolve — check the spelling.`
          : `${host} has no A or AAAA record, so there is no address to reverse.`
      );
    }
    target = toPtrName(fwd.addrs[0]);
    if (!target) throw new Error(`Could not read the address returned for ${host}.`);
    resolvedFrom = { host, addr: fwd.addrs[0], others: fwd.addrs.slice(1) };
  }

  const special = specialUse(target);

  const [ptrJson, zone] = await Promise.all([
    dnsQuery(target.arpa, 'PTR'),
    reverseZone(target.arpa),
  ]);

  const answers = (ptrJson.Answer || []).filter((r) => r.type === TYPE.PTR);
  const hostnames = [...new Set(answers.map((r) => trimDot(r.data)))].filter(Boolean);
  const ttl = answers.length ? answers[0].TTL : null;
  const rcode = typeof ptrJson.Status === 'number' ? ptrJson.Status : null;

  if (!hostnames.length) {
    // SERVFAIL/REFUSED means the resolver could not answer. Reporting that as
    // "no PTR record exists" would send the user off to ask their ISP for a
    // record that may already be there.
    const broken = rcode !== 0 && rcode !== 3;
    return {
      input,
      target,
      resolvedFrom,
      special,
      zone,
      ttl: null,
      rcode,
      rcodeText: rcodeText(rcode),
      nxdomain: rcode === 3,
      hostnames: [],
      checks: [],
      status: broken ? 'resolver' : 'none',
    };
  }

  const checks = await Promise.all(
    hostnames.map(async (host) => {
      try {
        const fwd = await addressesFor(host);
        return {
          host,
          addrs: fwd.addrs,
          cnames: fwd.cnames,
          nxdomain: fwd.nxdomain,
          match: fwd.addrs.some((a) => ipKey(a) === target.key),
          // addressesFor swallows both query failures, so an unreachable
          // resolver would otherwise arrive here indistinguishable from a
          // hostname that genuinely has no address — and be scored FAIL.
          error: fwd.reachable ? null : 'the A and AAAA queries did not complete',
        };
      } catch (err) {
        return { host, addrs: [], cnames: [], nxdomain: false, match: false, error: err.message };
      }
    })
  );

  return {
    input,
    target,
    resolvedFrom,
    special,
    zone,
    ttl,
    rcode,
    rcodeText: rcodeText(rcode),
    nxdomain: false,
    hostnames,
    checks,
    // A PTR exists but no forward lookup completed: unknown, not failed.
    status: checks.some((c) => c.match)
      ? 'pass'
      : checks.every((c) => c.error)
        ? 'unknown'
        : 'fail',
  };
}

/* --------------------------- "Use my IP" ---------------------------- */

/** Convenience only. Returns null on any failure so the caller can fall
 *  back to an empty input instead of surfacing an error the user did not
 *  ask for. */
export async function fetchPublicIp() {
  const endpoints = ['https://api64.ipify.org?format=json', 'https://api.ipify.org?format=json'];
  for (const url of endpoints) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      if (!res.ok) continue;
      const json = await res.json();
      if (json && json.ip && ipKey(json.ip)) return String(json.ip);
    } catch {
      /* CORS, offline, blocked by an extension — all equally uninteresting. */
    }
  }
  return null;
}
