/* ------------------------------------------------------------------
   Email authentication scanner — SPF, DKIM, DMARC, MX.

   Runs entirely in the browser against Cloudflare's DNS-over-HTTPS
   resolver, which is CORS-open. No backend, no API key, no rate limit
   of our own to manage.

   Accuracy matters more than a tidy score here: this tool's whole value
   is that a prospect trusts what it tells them. Where a result is
   genuinely unknowable from DNS alone (DKIM selectors, see below) we say
   "inconclusive" rather than guessing "fail".
------------------------------------------------------------------- */

const DOH = 'https://cloudflare-dns.com/dns-query';

// DKIM keys live at <selector>._domainkey.<domain>, and the selector is
// chosen by whoever set it up — it cannot be enumerated from DNS. We probe
// the selectors used by the major providers; a miss proves nothing.
const COMMON_SELECTORS = [
  'google', 'default', 'selector1', 'selector2', 'k1', 'k2',
  'mail', 'dkim', 's1', 's2', 'zoho', 'sendgrid', 'mandrill',
  'protonmail', 'fm1', 'amazonses', 'pm', 'mxvault',
];

export async function dnsQuery(name, type) {
  const url = `${DOH}?name=${encodeURIComponent(name)}&type=${encodeURIComponent(type)}`;
  const res = await fetch(url, { headers: { Accept: 'application/dns-json' } });
  if (!res.ok) throw new Error(`DNS query failed (${res.status})`);
  return res.json();
}

/** TXT values arrive quoted, and long ones are split into chunks: "a" "b". */
function cleanTxt(data) {
  return String(data || '')
    .replace(/"\s+"/g, '')
    .replace(/^"|"$/g, '')
    .trim();
}

async function txtRecords(name) {
  const json = await dnsQuery(name, 'TXT');
  if (json.Status === 3) return { nxdomain: true, records: [] };
  return {
    nxdomain: false,
    records: (json.Answer || [])
      .filter((a) => a.type === 16)
      .map((a) => cleanTxt(a.data)),
  };
}

/* ---------------------------------- SPF ---------------------------------- */

export function analyseSpf(records) {
  const spf = records.filter((r) => /^v=spf1\b/i.test(r));

  if (spf.length === 0) {
    return {
      status: 'fail',
      title: 'No SPF record',
      detail: 'Anyone can send email claiming to be from this domain — receiving servers have no list of authorised senders to check against.',
      fix: 'Publish a TXT record at the domain root starting with v=spf1, listing your mail providers and ending in -all.',
      record: null,
      penalty: 35,
    };
  }

  // More than one SPF record is an RFC 7208 violation: receivers return
  // permerror and may fail the check outright, so this is worse than a warning.
  if (spf.length > 1) {
    return {
      status: 'fail',
      title: `${spf.length} SPF records found`,
      detail: 'A domain must publish exactly one SPF record. Multiple records cause a permanent error, and many receivers will treat all of your mail as unauthenticated.',
      fix: 'Merge them into a single record by combining the include: mechanisms.',
      record: spf.join('  ||  '),
      penalty: 30,
    };
  }

  const record = spf[0];
  const notes = [];
  let penalty = 0;
  let status = 'pass';

  // SPF is capped at 10 DNS-resolving mechanisms; exceeding it is a permerror.
  const lookups = (record.match(/\b(include|a|mx|ptr|exists|redirect)[:=]/gi) || []).length;
  if (lookups > 10) {
    notes.push(`Uses ${lookups} DNS lookups — the limit is 10, above which the record fails to evaluate.`);
    penalty += 15;
    status = 'warn';
  }

  const all = record.match(/([-~?+])all\b/i);
  const qualifier = all ? all[1] : null;

  if (!all) {
    notes.push('No "all" mechanism, so the record does not say what to do with unlisted senders.');
    penalty += 12;
    status = 'warn';
  } else if (qualifier === '+') {
    notes.push('Ends in +all, which authorises the entire internet to send as this domain. This is worse than having no SPF at all.');
    penalty += 30;
    status = 'fail';
  } else if (qualifier === '?') {
    notes.push('Ends in ?all (neutral) — unlisted senders are neither authorised nor rejected, so the record has little practical effect.');
    penalty += 12;
    status = 'warn';
  } else if (qualifier === '~') {
    notes.push('Ends in ~all (softfail). Reasonable while rolling out, but -all is the stronger end state.');
    penalty += 4;
  }

  return {
    status,
    title: status === 'pass' ? 'SPF configured correctly' : 'SPF needs attention',
    detail: notes.length ? notes.join(' ') : 'Authorised senders are declared and unlisted senders are rejected.',
    fix: status === 'pass' ? null : 'Tighten the record so it ends in -all once you have confirmed every legitimate sender is listed.',
    record,
    lookups,
    penalty,
  };
}

/* --------------------------------- DMARC --------------------------------- */

export function analyseDmarc(records) {
  const dmarc = records.filter((r) => /^v=DMARC1\b/i.test(r));

  if (dmarc.length === 0) {
    return {
      status: 'fail',
      title: 'No DMARC record',
      detail: 'Without DMARC, SPF and DKIM results are advisory only. Receivers have no instruction on what to do with mail that fails, and you get no visibility into who is spoofing your domain.',
      fix: 'Publish a TXT record at _dmarc.yourdomain starting with p=none and a rua address, then tighten to quarantine and reject once reports look clean.',
      record: null,
      penalty: 35,
    };
  }

  const record = dmarc[0];
  const tags = {};
  record.split(';').forEach((part) => {
    const [k, v] = part.split('=').map((s) => (s || '').trim());
    if (k) tags[k.toLowerCase()] = v;
  });

  const policy = (tags.p || '').toLowerCase();
  const notes = [];
  let penalty = 0;
  let status = 'pass';

  if (policy === 'none') {
    notes.push('Policy is p=none, which only monitors. Spoofed mail is still delivered normally.');
    penalty += 20;
    status = 'warn';
  } else if (policy === 'quarantine') {
    notes.push('Policy is p=quarantine — failing mail goes to spam rather than being rejected.');
    penalty += 8;
  } else if (policy === 'reject') {
    notes.push('Policy is p=reject, the strongest setting.');
  } else {
    notes.push('No valid policy tag (p=) found, so the record will be ignored.');
    penalty += 25;
    status = 'fail';
  }

  if (!tags.rua) {
    notes.push('No rua address, so you receive no aggregate reports and cannot see who is sending as you.');
    penalty += 6;
    if (status === 'pass') status = 'warn';
  }

  if (tags.pct && Number(tags.pct) < 100) {
    notes.push(`Policy applies to only ${tags.pct}% of mail.`);
    penalty += 5;
    if (status === 'pass') status = 'warn';
  }

  return {
    status,
    title: status === 'pass' ? 'DMARC enforced' : 'DMARC needs attention',
    detail: notes.join(' '),
    fix: status === 'pass' ? null : 'Move towards p=reject with pct=100 and an rua address once reports confirm legitimate mail is passing.',
    record,
    policy,
    penalty,
  };
}

/* ---------------------------------- DKIM --------------------------------- */

export async function findDkim(domain) {
  const results = await Promise.all(
    COMMON_SELECTORS.map(async (sel) => {
      try {
        const { records } = await txtRecords(`${sel}._domainkey.${domain}`);
        const key = records.find((r) => /v=DKIM1|p=/i.test(r));
        return key ? { selector: sel, record: key } : null;
      } catch {
        return null;
      }
    })
  );

  const found = results.filter(Boolean);

  if (found.length === 0) {
    return {
      status: 'unknown',
      title: 'No DKIM key found on common selectors',
      // Being straight about this is the point — a false "fail" here would
      // make the whole tool untrustworthy.
      detail: `DKIM selectors are chosen freely by whoever configured mail, so they cannot be listed from DNS. We checked ${COMMON_SELECTORS.length} selectors used by the major providers and found none. DKIM may still be active under a custom selector.`,
      fix: 'Check the DNS settings in your mail provider for the selector they issued, then verify that record exists.',
      selectors: [],
      penalty: 12,
    };
  }

  const weak = found.filter((f) => /p=\s*($|;)/.test(f.record));

  return {
    status: weak.length ? 'warn' : 'pass',
    title: weak.length ? 'DKIM key revoked' : `DKIM active (${found.map((f) => f.selector).join(', ')})`,
    detail: weak.length
      ? 'A selector was found with an empty public key, which means the key has been revoked and signatures will not verify.'
      : 'A published DKIM key was found, so outgoing mail can be cryptographically signed and verified.',
    fix: weak.length ? 'Re-publish the public key from your mail provider.' : null,
    selectors: found,
    penalty: weak.length ? 15 : 0,
  };
}

/* ----------------------------------- MX ---------------------------------- */

export async function analyseMx(domain) {
  const json = await dnsQuery(domain, 'MX');
  const hosts = (json.Answer || [])
    .filter((a) => a.type === 15)
    .map((a) => String(a.data).replace(/^\d+\s+/, '').replace(/\.$/, ''));

  if (!hosts.length) {
    return {
      status: 'warn',
      title: 'No MX records',
      detail: 'This domain is not configured to receive email. That is expected for a send-only or parked domain.',
      hosts: [],
      penalty: 0,
    };
  }

  const joined = hosts.join(' ').toLowerCase();
  let provider = 'Custom or self-hosted';
  if (joined.includes('google')) provider = 'Google Workspace';
  else if (joined.includes('outlook') || joined.includes('microsoft')) provider = 'Microsoft 365';
  else if (joined.includes('zoho')) provider = 'Zoho Mail';
  else if (joined.includes('protonmail')) provider = 'Proton Mail';
  else if (joined.includes('yandex')) provider = 'Yandex';
  else if (joined.includes('mailgun') || joined.includes('sendgrid')) provider = 'Transactional provider';

  return {
    status: 'pass',
    title: `Mail handled by ${provider}`,
    detail: `${hosts.length} MX ${hosts.length === 1 ? 'host' : 'hosts'} configured.`,
    hosts,
    penalty: 0,
  };
}

/* --------------------------------- Runner -------------------------------- */

export function normaliseDomain(input) {
  let d = String(input || '').trim().toLowerCase();
  d = d.replace(/^https?:\/\//, '').replace(/^www\./, '');
  d = d.split('/')[0].split('?')[0].split('@').pop();
  return d.replace(/\.$/, '');
}

export function isValidDomain(d) {
  return /^(?=.{1,253}$)([a-z0-9](-?[a-z0-9])*\.)+[a-z]{2,}$/i.test(d);
}

export function grade(score) {
  if (score >= 90) return { letter: 'A', label: 'Strong' };
  if (score >= 75) return { letter: 'B', label: 'Good' };
  if (score >= 60) return { letter: 'C', label: 'Fair' };
  if (score >= 40) return { letter: 'D', label: 'Weak' };
  return { letter: 'F', label: 'At risk' };
}

export async function scanDomain(rawInput) {
  const domain = normaliseDomain(rawInput);
  if (!isValidDomain(domain)) throw new Error('Enter a valid domain, for example lexcorp.com.np');

  const root = await txtRecords(domain);
  if (root.nxdomain) throw new Error(`${domain} does not resolve — check the spelling.`);

  const [dmarcTxt, dkim, mx] = await Promise.all([
    txtRecords(`_dmarc.${domain}`),
    findDkim(domain),
    analyseMx(domain),
  ]);

  const spf = analyseSpf(root.records);
  const dmarc = analyseDmarc(dmarcTxt.records);

  const score = Math.max(0, 100 - (spf.penalty + dmarc.penalty + dkim.penalty + mx.penalty));

  return { domain, score, grade: grade(score), spf, dkim, dmarc, mx };
}
