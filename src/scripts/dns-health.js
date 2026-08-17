/* ------------------------------------------------------------------
   DNS health audit — resilience and hygiene, not just record lookup.

   Same client-side DoH approach as the email scanner. Checks the things
   that actually cause outages or leave a domain exploitable: a single
   nameserver provider, no DNSSEC, no CAA, missing IPv6, and TTLs that make
   a migration painful.
------------------------------------------------------------------- */

import { dnsQuery, normaliseDomain, isValidDomain, grade } from './email-scan.js';

/** Reduce ns1.zoho.com → zoho.com so we can tell providers apart. */
function providerOf(host) {
  const parts = String(host).replace(/\.$/, '').toLowerCase().split('.');
  // Handle two-part public suffixes (.co.uk, .com.np) so we don't collapse to "com.np".
  const twoPart = ['co', 'com', 'net', 'org', 'gov', 'edu', 'ac'];
  if (parts.length >= 3 && twoPart.includes(parts[parts.length - 2])) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

async function records(name, type) {
  const json = await dnsQuery(name, type);
  return {
    status: json.Status,
    answers: json.Answer || [],
    ad: json.AD === true, // resolver reports DNSSEC-validated
  };
}

/* ------------------------------- checks -------------------------------- */

export async function checkNameservers(domain) {
  const { answers } = await records(domain, 'NS');
  const hosts = answers.filter((a) => a.type === 2).map((a) => String(a.data).replace(/\.$/, ''));

  if (!hosts.length) {
    return {
      status: 'fail',
      title: 'No nameservers found',
      detail: 'The domain has no NS records, so nothing can resolve it.',
      fix: 'Point the domain at your DNS provider’s nameservers at the registrar.',
      penalty: 40,
    };
  }

  const providers = [...new Set(hosts.map(providerOf))];
  const notes = [`${hosts.length} nameserver${hosts.length === 1 ? '' : 's'} across ${providers.length} provider${providers.length === 1 ? '' : 's'}.`];
  let penalty = 0;
  let status = 'pass';

  if (hosts.length < 2) {
    notes.push('Only one nameserver is published — if it goes down, the domain stops resolving entirely.');
    penalty += 20;
    status = 'fail';
  }

  // Two nameservers at one provider still share a blast radius; this is the
  // single most common resilience gap and rarely noticed until an outage.
  if (providers.length === 1 && hosts.length >= 2) {
    notes.push(`All nameservers sit with one provider (${providers[0]}). A provider-wide outage takes the domain offline — adding a secondary DNS provider removes that single point of failure.`);
    penalty += 10;
    status = 'warn';
  }

  return {
    status,
    title: status === 'pass' ? 'Nameservers look resilient' : 'Nameserver setup has a single point of failure',
    detail: notes.join(' '),
    fix: status === 'pass' ? null : 'Run at least two nameservers, ideally split across two independent DNS providers.',
    record: hosts.join('\n'),
    penalty,
  };
}

export async function checkDnssec(domain) {
  // A DS record at the parent zone is the authoritative signal that the
  // delegation is signed; the resolver's AD flag corroborates it.
  const ds = await records(domain, 'DS');
  const signed = ds.answers.some((a) => a.type === 43);

  if (signed) {
    return {
      status: 'pass',
      title: 'DNSSEC enabled',
      detail: 'The delegation is signed, so responses can be validated and cache-poisoning attacks are much harder.',
      penalty: 0,
    };
  }

  return {
    status: 'warn',
    title: 'DNSSEC not enabled',
    detail: 'Without DNSSEC there is no cryptographic proof that a DNS answer is genuine, which leaves visitors open to spoofed responses and cache poisoning.',
    fix: 'Enable DNSSEC at your DNS provider, then publish the DS record at your registrar. Both halves are required.',
    penalty: 12,
  };
}

export async function checkCaa(domain) {
  const { answers } = await records(domain, 'CAA');
  const caa = answers.filter((a) => a.type === 257);

  if (caa.length) {
    return {
      status: 'pass',
      title: 'CAA record present',
      detail: 'Only the certificate authorities you named can issue certificates for this domain.',
      record: caa.map((a) => String(a.data)).join('\n'),
      penalty: 0,
    };
  }

  return {
    status: 'warn',
    title: 'No CAA record',
    detail: 'Any certificate authority in the world may issue a certificate for this domain. A CAA record restricts that to the ones you actually use.',
    fix: 'Publish a CAA record naming your CA, for example: 0 issue "letsencrypt.org"',
    penalty: 8,
  };
}

export async function checkAddresses(domain) {
  const [v4, v6] = await Promise.all([records(domain, 'A'), records(domain, 'AAAA')]);
  const a = v4.answers.filter((x) => x.type === 1).map((x) => x.data);
  const aaaa = v6.answers.filter((x) => x.type === 28).map((x) => x.data);

  if (!a.length && !aaaa.length) {
    return {
      status: 'fail',
      title: 'No address records',
      detail: 'The domain resolves to no IPv4 or IPv6 address, so nothing is reachable at the apex.',
      fix: 'Add an A (or AAAA) record, or a CNAME/ALIAS at the apex if your provider supports it.',
      penalty: 25,
    };
  }

  if (!aaaa.length) {
    return {
      status: 'warn',
      title: 'IPv4 only — no IPv6',
      detail: `Resolves to ${a.length} IPv4 address${a.length === 1 ? '' : 'es'} but publishes no AAAA record. IPv6-only mobile networks reach the site through translation, which adds latency.`,
      fix: 'Add AAAA records once your host or CDN supports IPv6 — most do by default.',
      record: a.join('\n'),
      penalty: 6,
    };
  }

  return {
    status: 'pass',
    title: 'IPv4 and IPv6 both published',
    detail: `${a.length} A record${a.length === 1 ? '' : 's'} and ${aaaa.length} AAAA record${aaaa.length === 1 ? '' : 's'}.`,
    record: [...a, ...aaaa].join('\n'),
    penalty: 0,
  };
}

export async function checkTtl(domain) {
  const { answers } = await records(domain, 'A');
  const ttls = answers.filter((a) => a.type === 1).map((a) => a.TTL);

  if (!ttls.length) {
    return { status: 'unknown', title: 'TTL not assessed', detail: 'No A record to read a TTL from.', penalty: 0 };
  }

  const ttl = Math.min(...ttls);
  const mins = Math.round(ttl / 60);

  if (ttl > 86400) {
    return {
      status: 'warn',
      title: `TTL is very long (${Math.round(ttl / 3600)} hours)`,
      detail: 'Changes to this record take up to that long to reach everyone. Migrations and failovers become slow and risky.',
      fix: 'Drop the TTL to 300–3600 seconds a day before any planned change.',
      penalty: 6,
    };
  }

  if (ttl < 60) {
    return {
      status: 'warn',
      title: `TTL is very short (${ttl} seconds)`,
      detail: 'Short TTLs multiply DNS queries and add latency on every cold lookup. This is only worth it during an active migration.',
      fix: 'Raise the TTL back to 300–3600 seconds once the migration is finished.',
      penalty: 4,
    };
  }

  return {
    status: 'pass',
    title: `TTL is sensible (${mins} minute${mins === 1 ? '' : 's'})`,
    detail: 'Long enough to cache well, short enough to change without a long wait.',
    penalty: 0,
  };
}

/* -------------------------------- runner ------------------------------- */

export async function scanDns(rawInput) {
  const domain = normaliseDomain(rawInput);
  if (!isValidDomain(domain)) throw new Error('Enter a valid domain, for example lexcorp.com.np');

  const probe = await dnsQuery(domain, 'NS');
  if (probe.Status === 3) throw new Error(`${domain} does not resolve — check the spelling.`);

  const [ns, dnssec, caa, addr, ttl] = await Promise.all([
    checkNameservers(domain),
    checkDnssec(domain),
    checkCaa(domain),
    checkAddresses(domain),
    checkTtl(domain),
  ]);

  const score = Math.max(
    0,
    100 - (ns.penalty + dnssec.penalty + caa.penalty + addr.penalty + ttl.penalty)
  );

  return { domain, score, grade: grade(score), ns, dnssec, caa, addr, ttl };
}
