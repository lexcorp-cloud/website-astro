/* ------------------------------------------------------------------
   Domain registration lookup over RDAP, via the rdap.org bootstrap
   redirector.

   RDAP is the only registration source reachable from a browser — port-43
   WHOIS is a raw socket a page cannot open, and rdap.org sends
   `access-control-allow-origin: *` on the redirect, on the 200, and on
   its own 404.

   The honesty problem this file exists to solve: a 404 means two
   completely different things depending on WHO answered it.

     · rdap.org answers 404 itself when the TLD publishes no RDAP service
       at all — .np, .io and .bt all behave this way. Nothing is known.
     · the registry answers 404 (after the redirect) when it genuinely has
       no record of that domain.

   Reporting the first case as "not registered" is a false negative, so the
   two are separated by whether the request was redirected, and both are
   cross-checked against DNS delegation before anything is claimed.
------------------------------------------------------------------- */

import { normaliseDomain, isValidDomain, dnsQuery } from './email-scan.js';

const RDAP = 'https://rdap.org/domain/';

const DAY = 86400000;
const daysFromNow = (date) => Math.round((date.getTime() - Date.now()) / DAY);

/* --------------------------- status vocabulary --------------------------- */

/* RDAP publishes statuses as space-separated lowercase words ("client
   transfer prohibited"), while registrar control panels and legacy WHOIS
   show the EPP camelCase name ("clientTransferProhibited"). Keys here are
   stripped to letters so either spelling matches, and `epp` is shown back
   to the user because that is the string they will recognise elsewhere. */
const STATUS_CODES = {
  active: {
    epp: 'active',
    severity: 'pass',
    label: 'Active — no restrictions flagged',
    detail:
      'The registry reports the domain as in normal operation. Note that "active" with no lock alongside it means nothing is stopping a transfer request either.',
  },
  ok: {
    epp: 'ok',
    severity: 'warn',
    label: 'No locks set',
    detail:
      '"ok" is the EPP way of saying the domain has no status flags at all. It is not a problem in itself, but it means no transfer lock is protecting the name — most registrars set clientTransferProhibited by default, and this domain has not.',
  },
  inactive: {
    epp: 'inactive',
    severity: 'warn',
    label: 'No nameservers delegated',
    detail:
      'The domain is registered but has no nameservers at the registry, so nothing resolves — no website, no email. Normal for a name held in reserve, a problem if it is meant to be live.',
  },

  /* ---- client-side locks: set by the registrar, removable by the owner ---- */
  clienttransferprohibited: {
    epp: 'clientTransferProhibited',
    severity: 'pass',
    label: 'Transfer lock on (set by your registrar)',
    detail:
      'This is the normal, healthy state and the single most effective protection against domain hijacking: the registry will refuse a transfer to another registrar until the lock is deliberately removed from your account. Leave it on. You clear it yourself, for a few minutes, only when you are genuinely moving the domain.',
  },
  clientdeleteprohibited: {
    epp: 'clientDeleteProhibited',
    severity: 'pass',
    label: 'Deletion lock on (set by your registrar)',
    detail:
      'The registry will reject a delete request for this domain. Protective — it stops an accidental or malicious deletion from taking effect.',
  },
  clientupdateprohibited: {
    epp: 'clientUpdateProhibited',
    severity: 'pass',
    label: 'Change lock on (set by your registrar)',
    detail:
      'Contact details and nameservers cannot be modified while this is set. Good against unauthorised edits, but remember it also blocks your own DNS changes — you must remove it first, which is worth knowing before an urgent migration.',
  },
  clientrenewprohibited: {
    epp: 'clientRenewProhibited',
    severity: 'warn',
    label: 'Renewal blocked (set by your registrar)',
    detail:
      'The domain cannot be renewed while this is set. Rare, and dangerous if it is still present as expiry approaches — check with your registrar why it was applied.',
  },
  clienthold: {
    epp: 'clientHold',
    severity: 'fail',
    label: 'On hold — removed from DNS by your registrar',
    detail:
      'The registrar has asked the registry to pull this domain out of the zone, so it does not resolve at all: website down, mail bouncing. The usual causes are an unverified registrant email (ICANN gives 15 days to click the verification link), an unpaid invoice, or an abuse complaint. This is a same-day fix with your registrar.',
  },

  /* ---- server-side locks: set by the registry, the registrar cannot lift ---- */
  servertransferprohibited: {
    epp: 'serverTransferProhibited',
    severity: 'pass',
    label: 'Transfer lock on (set by the registry)',
    detail:
      'Applied at the registry, so your registrar cannot remove it. This is what a paid registry-lock product looks like, and it is also standard on reserved or institutionally held names. Strong protection; lifting it takes a verified out-of-band request.',
  },
  serverdeleteprohibited: {
    epp: 'serverDeleteProhibited',
    severity: 'pass',
    label: 'Deletion lock on (set by the registry)',
    detail: 'The registry itself will not accept a delete request for this domain.',
  },
  serverupdateprohibited: {
    epp: 'serverUpdateProhibited',
    severity: 'warn',
    label: 'Change lock on (set by the registry)',
    detail:
      'Nameserver and contact changes are frozen at the registry, and your registrar cannot lift this. On a corporate name it is usually a deliberate registry lock; otherwise it can accompany a dispute, a UDRP case or a court order.',
  },
  serverrenewprohibited: {
    epp: 'serverRenewProhibited',
    severity: 'warn',
    label: 'Renewal blocked (set by the registry)',
    detail:
      'The registry will not process a renewal. Ask your registrar to find out why before the expiry date arrives.',
  },
  serverhold: {
    epp: 'serverHold',
    severity: 'fail',
    label: 'On hold — removed from DNS by the registry',
    detail:
      'The registry has taken the domain out of the zone, so nothing resolves. Unlike clientHold your registrar cannot reverse this; it typically follows a legal order, a registry-level abuse action, or failed registrant validation.',
  },

  /* ---- generic (prefix-less) variants some ccTLD registries publish ---- */
  transferprohibited: {
    epp: 'transfer prohibited',
    severity: 'pass',
    label: 'Transfer lock on',
    detail:
      'A transfer to another registrar will be refused. The registry did not say whether the lock is registrar- or registry-set, but the protective effect is the same.',
  },
  deleteprohibited: {
    epp: 'delete prohibited',
    severity: 'pass',
    label: 'Deletion lock on',
    detail: 'A delete request for this domain will be refused.',
  },
  updateprohibited: {
    epp: 'update prohibited',
    severity: 'pass',
    label: 'Change lock on',
    detail:
      'Contacts and nameservers cannot be changed until the lock is removed — including by you.',
  },
  renewprohibited: {
    epp: 'renew prohibited',
    severity: 'warn',
    label: 'Renewal blocked',
    detail: 'Renewal is currently refused. Resolve this well before the expiry date.',
  },

  /* ---- pending operations ---- */
  pendingcreate: {
    epp: 'pendingCreate',
    severity: 'warn',
    label: 'Registration still being processed',
    detail: 'The registry has accepted a create request but has not finished it. Normally clears within minutes to hours.',
  },
  pendingrenew: {
    epp: 'pendingRenew',
    severity: 'warn',
    label: 'Renewal in progress',
    detail: 'A renewal has been submitted and is not yet complete. Confirm the new expiry date once it clears.',
  },
  pendingtransfer: {
    epp: 'pendingTransfer',
    severity: 'warn',
    label: 'Transfer to another registrar in progress',
    detail:
      'Someone has requested to move this domain to a different registrar. If you did not start it, act now — an unanswered transfer request is auto-approved by the registry after five days, and a losing registrar can only reject it before that.',
  },
  pendingupdate: {
    epp: 'pendingUpdate',
    severity: 'warn',
    label: 'Change in progress',
    detail: 'An update to the domain is queued at the registry and not yet applied.',
  },
  pendingrestore: {
    epp: 'pendingRestore',
    severity: 'warn',
    label: 'Restore requested after deletion',
    detail:
      'The domain was deleted and a restore has been requested. The registrar now has to file a restore report; if it does not, the domain falls back into redemptionPeriod and the clock keeps running.',
  },
  pendingdelete: {
    epp: 'pendingDelete',
    severity: 'fail',
    label: 'Being deleted — about to be released',
    detail:
      'This is the last stage of the lifecycle. If redemptionPeriod is not also listed, the five-day pendingDelete countdown is running and nothing can stop it: at the end the name is dropped to general availability, where drop-catch services compete for anything desirable. If this is your domain, contact your registrar immediately — after the drop, recovery is no longer a registrar matter.',
  },

  /* ---- grace periods ---- */
  addperiod: {
    epp: 'addPeriod',
    severity: 'pass',
    label: 'Newly registered (5-day add grace period)',
    detail:
      'The domain was registered within the last five days. Deleting inside this window returns the registration fee, which is also why fraudulent registrations are often churned here.',
  },
  autorenewperiod: {
    epp: 'autoRenewPeriod',
    severity: 'warn',
    label: 'Expired and auto-renewed — payment outstanding',
    detail:
      'The registry auto-renewed the domain past its expiry date and the registrar has roughly 45 days to either collect payment or cancel the renewal for a refund. In plain terms: the invoice has not been settled. It usually still resolves during this period, which is exactly why the problem goes unnoticed until the name is deleted.',
  },
  renewperiod: {
    epp: 'renewPeriod',
    severity: 'pass',
    label: 'Recently renewed (5-day grace period)',
    detail: 'A renewal was processed in the last five days and can still be reversed for a refund in that window.',
  },
  transferperiod: {
    epp: 'transferPeriod',
    severity: 'pass',
    label: 'Recently transferred (5-day grace period)',
    detail: 'The domain changed registrar within the last five days. Verify the new registrar is the one you intended.',
  },
  redemptionperiod: {
    epp: 'redemptionPeriod',
    severity: 'fail',
    label: 'Deleted — inside the 30-day redemption window',
    detail:
      'The domain has been deleted and is already out of DNS, so the site and mail are down. Only the original registrant can restore it, only through the registrar, only for about 30 days, and the redemption fee is typically several times a normal renewal. After that it moves to pendingDelete and then drops. Treat this as an emergency, not a ticket.',
  },

  /* ---- contact and disclosure states ---- */
  validated: {
    epp: 'validated',
    severity: 'pass',
    label: 'Registrant contact verified',
    detail: 'The registry or registrar has confirmed the registrant contact details, so a verification hold is not looming.',
  },
  notvalidated: {
    epp: 'not validated',
    severity: 'warn',
    label: 'Registrant contact not verified',
    detail:
      'Contact verification is outstanding. Under ICANN rules an unverified registrant email leads to clientHold — which takes the domain out of DNS entirely — so this is worth clearing now rather than later.',
  },
  proxy: {
    epp: 'proxy',
    severity: 'pass',
    label: 'Registered through a proxy service',
    detail: 'A proxy provider is the registrant of record and holds the domain on the beneficial owner’s behalf.',
  },
  private: {
    epp: 'private',
    severity: 'pass',
    label: 'Privacy service in use',
    detail: 'A privacy service is substituting its own details for the registrant’s in public data.',
  },
  obscured: {
    epp: 'obscured',
    severity: 'pass',
    label: 'Contact data deliberately obscured',
    detail: 'The registry is masking contact fields rather than omitting them. Not a fault — a disclosure policy.',
  },
  associated: {
    epp: 'associated',
    severity: 'pass',
    label: 'Associated with a registered name holder',
    detail: 'Used mainly by .name, where a domain is linked to an email-forwarding or defensive registration.',
  },
  administrative: {
    epp: 'administrative',
    severity: 'warn',
    label: 'Held for administrative reasons',
    detail: 'The registry is holding the domain for its own administrative purposes. Ask the registrar for the specifics.',
  },
  reserved: {
    epp: 'reserved',
    severity: 'pass',
    label: 'Reserved by the registry or policy',
    detail: 'The name is withheld from normal registration — reserved lists cover registry operations, geographic names and protected strings.',
  },
  removed: {
    epp: 'removed',
    severity: 'fail',
    label: 'Removed by the registry',
    detail: 'The registry has removed the object. Nothing about this domain will behave normally until that is reversed.',
  },
};

export function translateStatus(raw) {
  const key = String(raw || '').toLowerCase().replace(/[^a-z]/g, '');
  const meta = STATUS_CODES[key];

  if (!meta) {
    return {
      code: String(raw),
      epp: String(raw),
      status: 'unknown',
      title: `Unrecognised status “${raw}”`,
      detail:
        'This registry published a status code that is not in the IANA RDAP vocabulary this tool translates. Treat it as inconclusive rather than harmless, and check the registry’s own status-code page — every RDAP response links to one.',
    };
  }

  return { code: String(raw), epp: meta.epp, status: meta.severity, title: meta.label, detail: meta.detail };
}

/* ------------------------------- RDAP parsing ----------------------------- */

const fmtDate = (d) => d.toISOString().slice(0, 10);

function eventDate(events, action) {
  const hit = (events || []).find(
    (e) => String(e.eventAction || '').toLowerCase().replace(/[^a-z]/g, '') === action
  );
  const d = hit ? new Date(hit.eventDate) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
}

/** Pull the useful fields out of a jCard, which is a nested array, not an object. */
function vcard(entity) {
  const props = entity?.vcardArray?.[1] || [];
  const get = (name) => {
    const p = props.find((x) => x[0] === name);
    const v = p ? p[3] : '';
    return typeof v === 'string' ? v.trim() : '';
  };

  const adr = props.find((x) => x[0] === 'adr');
  const parts = Array.isArray(adr?.[3]) ? adr[3].filter(Boolean) : [];

  return {
    name: get('fn'),
    org: get('org'),
    email: get('email'),
    // tel arrives as a tel: URI
    tel: get('tel').replace(/^tel:/, ''),
    address: parts.join(', '),
  };
}

/** Entities nest — the abuse contact sits inside the registrar entity. */
function findEntity(entities, role) {
  for (const e of entities || []) {
    if ((e.roles || []).some((r) => String(r).toLowerCase() === role)) return e;
    const nested = findEntity(e.entities, role);
    if (nested) return nested;
  }
  return null;
}

function publicId(entity, match) {
  const hit = (entity?.publicIds || []).find((p) =>
    String(p.type || '').toLowerCase().includes(match)
  );
  return hit ? String(hit.identifier) : '';
}

/* --------------------------- expiry and DNSSEC ---------------------------- */

function expiryFinding(expiry, statuses) {
  if (!expiry) {
    return {
      status: 'unknown',
      title: 'Expiry date not published',
      detail:
        'This registry does not include an expiration event in its RDAP response. Several ccTLD registries withhold it deliberately. That is inconclusive — it does not mean the registration has no end date.',
    };
  }

  const left = daysFromNow(expiry);
  const on = `Registry expiry date is ${fmtDate(expiry)} (UTC).`;

  // The lifecycle statuses are far more urgent than the raw date, and they
  // contradict it: a deleted domain still shows a future expiry.
  if (statuses.includes('redemptionperiod') || statuses.includes('pendingdelete')) {
    return {
      status: 'fail',
      title: 'Expiry date is no longer the thing to worry about',
      detail: `${on} The domain has already been deleted and is in the redemption or pending-delete stage, so the expiry date on file is stale. Act on the status codes below instead.`,
      fix: 'Contact the registrar today — restoring a deleted domain is time-boxed and the window does not pause.',
    };
  }

  if (left < 0) {
    return {
      status: 'fail',
      title: `Expired ${Math.abs(left)} day${Math.abs(left) === 1 ? '' : 's'} ago`,
      detail: `${on} It is past that date and the domain has not been renewed at the registry. Expired names usually keep resolving for a while during the grace period, which is why this is so often discovered late.`,
      fix: 'Renew now. Grace periods are registrar policy, not a right, and the redemption fee after deletion is many times the renewal price.',
    };
  }

  if (left === 0) {
    return {
      status: 'fail',
      title: 'Expires today',
      detail: `${on} Renewal has not been recorded at the registry.`,
      fix: 'Renew immediately and confirm the new expiry date appears in a fresh lookup.',
    };
  }

  if (left <= 30) {
    return {
      status: left <= 7 ? 'fail' : 'warn',
      title: `Expires in ${left} day${left === 1 ? '' : 's'}`,
      detail: `${on} If auto-renew is on and the card on file is valid, this date rolls forward on or shortly after it passes — but an expired card is the single most common cause of a lost domain, and nothing in public registration data tells you whether the payment method still works.`,
      fix: 'Verify auto-renew and the payment method on the registrar account, and put the expiry date in a calendar owned by the company rather than a person.',
    };
  }

  const years = Math.floor(left / 365);
  return {
    status: 'pass',
    title: `Expires in ${left} days`,
    detail: `${on} ${years >= 1 ? `That is a comfortable ${years} year${years === 1 ? '' : 's'} of runway. ` : ''}Registering further ahead is cheap insurance: multi-year registration removes the annual renewal as a failure point entirely.`,
  };
}

function dnssecFinding(secureDNS) {
  if (!secureDNS || typeof secureDNS !== 'object') {
    return {
      status: 'unknown',
      title: 'DNSSEC signing not reported',
      detail:
        'This registry omitted the secureDNS section, so whether a DS record is published at the parent cannot be read from here. Inconclusive — check the DNS health tool, which queries DNSSEC directly.',
    };
  }

  const ds = [...(secureDNS.dsData || []), ...(secureDNS.keyData || [])];
  const signed = secureDNS.delegationSigned === true || ds.length > 0;

  if (signed) {
    return {
      status: 'pass',
      title: `DNSSEC signed${ds.length ? ` — ${ds.length} delegation record${ds.length === 1 ? '' : 's'} at the registry` : ''}`,
      detail:
        'The parent zone publishes a DS record for this domain, so a validating resolver can prove the answers it gets are genuine and reject forged ones. It also means DNS changes need care: a key rollover done wrong takes the domain offline for validating resolvers even though the records look correct.',
    };
  }

  return {
    status: 'warn',
    title: 'DNSSEC not signed',
    detail:
      'No DS record is published at the registry, so DNS answers for this domain cannot be cryptographically validated. Not a misconfiguration — just an unclaimed protection against cache poisoning and on-path DNS tampering. Most managed DNS providers now enable it in one click.',
  };
}

/* ------------------------- DNS cross-check (honesty) ---------------------- */

/* When RDAP has nothing to say, DNS delegation is the only evidence left
   about whether a name is in use. It is corroboration, never proof: a
   registered domain with no nameservers set is indistinguishable from an
   unregistered one from outside. */
async function delegation(domain) {
  try {
    const json = await dnsQuery(domain, 'NS');
    if (json.Status === 3) return { state: 'nxdomain', nameservers: [] };

    const ns = (json.Answer || [])
      .filter((a) => a.type === 2)
      .map((a) => String(a.data).replace(/\.$/, '').toLowerCase());

    return { state: ns.length ? 'delegated' : 'noanswer', nameservers: ns };
  } catch {
    return { state: 'unknown', nameservers: [] };
  }
}

/* --------------------------------- runner --------------------------------- */

export async function lookupDomain(rawInput) {
  const domain = normaliseDomain(rawInput);
  if (!isValidDomain(domain)) {
    throw new Error(
      'Enter a valid domain, for example lexcorp.com.np. Internationalised names must be entered in punycode (xn--…).'
    );
  }

  const tld = domain.split('.').pop();

  let res;
  try {
    res = await fetch(RDAP + encodeURIComponent(domain), {
      headers: { Accept: 'application/rdap+json' },
    });
  } catch {
    throw new Error(
      'Could not reach rdap.org. A blocker or captive network may be stopping the request — the lookup runs from your browser, so anything filtering it will break it.'
    );
  }

  // Only the redirect tells the two 404s apart, so it is read before the body.
  const redirected = res.redirected === true;
  let host = 'rdap.org';
  try {
    host = new URL(res.url).hostname;
  } catch {
    /* res.url is always populated in practice; the default stays honest if not */
  }
  const servedBy = redirected ? host : 'rdap.org';

  if (res.status === 404) {
    const dns = await delegation(domain);
    return {
      kind: redirected ? 'not-found' : 'no-rdap',
      domain,
      tld,
      servedBy,
      dns,
    };
  }

  if (!res.ok) {
    throw new Error(
      `The RDAP service for .${tld} (${servedBy}) answered ${res.status}. That is a service problem, not an answer about this domain — it says nothing about whether ${domain} is registered. Try again shortly.`
    );
  }

  const data = await res.json().catch(() => null);
  if (!data || typeof data !== 'object') {
    throw new Error(`${servedBy} returned a response this tool could not parse as RDAP JSON.`);
  }

  const events = data.events || [];
  const registered = eventDate(events, 'registration') || eventDate(events, 'reregistration');
  const expiry = eventDate(events, 'expiration');
  const changed = eventDate(events, 'lastchanged');
  const refreshed = eventDate(events, 'lastupdateofrdapdatabase');
  const transferred = eventDate(events, 'transfer');

  const rawStatuses = (data.status || []).map(String);
  const normalised = rawStatuses.map((s) => s.toLowerCase().replace(/[^a-z]/g, ''));

  const registrarEntity = findEntity(data.entities, 'registrar');
  const registrar = registrarEntity ? vcard(registrarEntity) : null;
  const abuseEntity = findEntity(data.entities, 'abuse');
  const abuse = abuseEntity ? vcard(abuseEntity) : null;

  const nameservers = (data.nameservers || [])
    .map((n) => String(n.ldhName || n.unicodeName || '').replace(/\.$/, '').toLowerCase())
    .filter(Boolean)
    .sort();

  /* Registrant disclosure: an entity can exist and still carry nothing but a
     redaction placeholder, so presence is judged on real values, not roles. */
  const contactRoles = ['registrant', 'administrative', 'technical', 'billing'];
  const contacts = contactRoles
    .map((role) => {
      const e = findEntity(data.entities, role);
      if (!e) return null;
      const card = vcard(e);
      const visible = [card.name, card.org, card.email, card.address].filter(
        (v) => v && !/redact|privacy|proxy|not disclosed|data protected|withheld/i.test(v)
      );
      return visible.length ? { role, ...card } : null;
    })
    .filter(Boolean);

  return {
    kind: 'ok',
    domain,
    unicodeName: data.unicodeName && data.unicodeName !== data.ldhName ? data.unicodeName : null,
    tld,
    servedBy,
    handle: data.handle || '',
    registrar: registrar
      ? {
          name: registrar.name || registrar.org || 'Not published',
          ianaId: publicId(registrarEntity, 'iana') || registrarEntity.handle || '',
          abuseEmail: abuse?.email || '',
          abuseTel: abuse?.tel || '',
        }
      : null,
    dates: { registered, expiry, changed, refreshed, transferred },
    expiryFinding: expiryFinding(expiry, normalised),
    statuses: rawStatuses.map(translateStatus),
    nameservers,
    dnssec: dnssecFinding(data.secureDNS),
    contacts,
    // RFC 9537: registries that redact now declare it explicitly in the response.
    declaresRedaction: Array.isArray(data.redacted) && data.redacted.length > 0,
  };
}
