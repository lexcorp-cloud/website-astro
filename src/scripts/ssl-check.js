/* ------------------------------------------------------------------
   TLS certificate check via public Certificate Transparency logs (crt.sh).

   Important honesty caveat, surfaced in the UI as well as here: CT logs
   record certificates that were *issued*, not the one a server is
   currently presenting. A browser cannot open a raw TLS socket, so the
   live chain and cipher suite are out of reach without a backend. What
   this does reliably answer is "when does the newest certificate expire,
   who issued it, and has anything unexpected been issued for us" — which
   is what actually causes outages and catches mis-issuance.
------------------------------------------------------------------- */

import { normaliseDomain, isValidDomain, grade } from './email-scan.js';

const CRT_SH = 'https://crt.sh/';

const DAY = 86400000;
const daysBetween = (a, b) => Math.round((a - b) / DAY);

async function fetchCerts(domain) {
  const url = `${CRT_SH}?q=${encodeURIComponent(domain)}&output=json&exclude=expired`;
  const res = await fetch(url);
  if (!res.ok) throw new Error('Certificate Transparency lookup failed — crt.sh may be busy, try again shortly.');
  const json = await res.json().catch(() => []);
  return Array.isArray(json) ? json : [];
}

/** crt.sh issuer strings are long DNs; pull out the human-readable O= part. */
function issuerName(dn) {
  const m = String(dn || '').match(/O=([^,]+)/);
  return (m ? m[1] : String(dn || 'Unknown')).replace(/"/g, '').trim();
}

export async function checkCertificate(rawInput) {
  const domain = normaliseDomain(rawInput);
  if (!isValidDomain(domain)) throw new Error('Enter a valid domain, for example lexcorp.com.np');

  const certs = await fetchCerts(domain);

  if (!certs.length) {
    return {
      domain,
      score: 0,
      grade: grade(0),
      current: {
        status: 'fail',
        title: 'No unexpired certificate found',
        detail: `No currently valid certificate for ${domain} appears in public Certificate Transparency logs. If the site is served over HTTPS it may be using a private or self-signed certificate, which browsers will reject.`,
        fix: 'Issue a publicly trusted certificate — Let’s Encrypt is free and automatable.',
      },
      issuers: null,
      history: null,
      coverage: null,
    };
  }

  const now = Date.now();

  // Newest by expiry is the one keeping the site alive.
  const sorted = [...certs].sort(
    (a, b) => new Date(b.not_after).getTime() - new Date(a.not_after).getTime()
  );
  const newest = sorted[0];
  const expires = new Date(newest.not_after);
  const issued = new Date(newest.not_before);
  const daysLeft = daysBetween(expires.getTime(), now);
  const issuer = issuerName(newest.issuer_name);

  /* ---------- expiry ---------- */
  let status = 'pass';
  let penalty = 0;
  let title = `Valid for ${daysLeft} more days`;
  let fix = null;
  let detail = `Issued by ${issuer} on ${issued.toISOString().slice(0, 10)}, expiring ${expires.toISOString().slice(0, 10)}.`;

  if (daysLeft <= 0) {
    status = 'fail';
    penalty = 55;
    title = 'Certificate has expired';
    detail = `The newest certificate in CT logs expired on ${expires.toISOString().slice(0, 10)}. Browsers will be showing a full-page security warning.`;
    fix = 'Renew immediately, then automate renewal so this cannot recur.';
  } else if (daysLeft <= 14) {
    status = 'fail';
    penalty = 35;
    title = `Expires in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`;
    detail += ' That is inside the window where a failed renewal becomes an outage.';
    fix = 'Renew now and verify that automated renewal is actually running.';
  } else if (daysLeft <= 30) {
    status = 'warn';
    penalty = 15;
    title = `Expires in ${daysLeft} days`;
    detail += ' Worth confirming that automatic renewal is in place.';
    fix = 'Check your renewal automation and monitoring.';
  }

  /* ---------- issuer concentration ---------- */
  const issuers = [...new Set(certs.map((c) => issuerName(c.issuer_name)))];

  /* ---------- unexpected issuance ---------- */
  // A sudden spread of issuers can indicate mis-issuance; more often it is
  // simply several services (CDN, mail, hosting) each getting their own cert.
  const manyIssuers = issuers.length >= 4;

  /* ---------- name coverage ---------- */
  const names = [
    ...new Set(
      certs
        .flatMap((c) => String(c.name_value || '').split('\n'))
        .map((n) => n.trim())
        .filter(Boolean)
    ),
  ];
  const wildcard = names.some((n) => n.startsWith('*.'));

  const score = Math.max(0, 100 - penalty - (manyIssuers ? 8 : 0));

  return {
    domain,
    score,
    grade: grade(score),
    current: { status, title, detail, fix, record: `${newest.name_value}`.split('\n').slice(0, 6).join('\n') },
    issuers: {
      status: manyIssuers ? 'warn' : 'pass',
      title: manyIssuers
        ? `${issuers.length} different certificate authorities have issued for this domain`
        : `Issued by ${issuers.join(', ')}`,
      detail: manyIssuers
        ? 'Multiple CAs is usually just several services each obtaining their own certificate — but it is worth confirming you recognise all of them, since an unrecognised issuer can indicate mis-issuance.'
        : 'A single, consistent certificate authority.',
      fix: manyIssuers ? 'Publish a CAA record to restrict issuance to the CAs you actually use.' : null,
      record: issuers.join('\n'),
    },
    history: {
      status: 'pass',
      title: `${certs.length} unexpired certificate${certs.length === 1 ? '' : 's'} in public logs`,
      detail:
        'Certificate Transparency is a public, append-only record of every certificate issued by a trusted CA. Anyone can audit it — including you, to spot certificates you did not request.',
    },
    coverage: {
      status: 'pass',
      title: wildcard ? 'Wildcard certificate in use' : `${names.length} hostname${names.length === 1 ? '' : 's'} covered`,
      detail: wildcard
        ? 'A wildcard covers every subdomain. Convenient, but one compromised key exposes them all — per-host certificates limit that blast radius.'
        : 'Certificates are scoped to specific hostnames rather than a wildcard, which limits the impact of a key compromise.',
      record: names.slice(0, 10).join('\n') + (names.length > 10 ? `\n… and ${names.length - 10} more` : ''),
    },
  };
}
