/* ------------------------------------------------------------------
   Tool registry — the single place a tool is declared.

   Adding an entry here automatically puts the tool in the hub page, the
   switcher rail on every tool page, and the footer. The page file itself
   is the only other thing to write.

   Order matters: it is the order shown in the switcher.
------------------------------------------------------------------- */

export const tools = [
  {
    slug: 'email-security',
    href: '/tools/email-security',
    icon: 'mail',
    // Short label for the switcher rail — must stay brief or the rail wraps.
    short: 'Email Security',
    name: 'Email Security Scanner',
    tagline: 'SPF · DKIM · DMARC',
    category: 'Email',
    description:
      'Check whether someone can send email pretending to be your domain. Returns a graded report with the exact records found and plain-English fixes.',
    status: 'live',
  },
  {
    slug: 'dns-health',
    href: '/tools/dns-health',
    icon: 'globe',
    short: 'DNS Health',
    name: 'DNS Health Check',
    tagline: 'NS · DNSSEC · CAA · IPv6',
    category: 'DNS',
    description:
      'Audit a domain’s DNS for resilience gaps — single-provider nameservers, missing DNSSEC or CAA, no IPv6, and risky TTLs.',
    status: 'live',
  },
  {
    slug: 'ssl-checker',
    href: '/tools/ssl-checker',
    icon: 'shield',
    short: 'SSL Expiry',
    name: 'SSL Certificate Checker',
    tagline: 'Expiry · Issuer · History',
    category: 'Security',
    description:
      'See when a domain’s TLS certificate expires, who issued it, and every certificate ever issued for it from public Certificate Transparency logs.',
    status: 'live',
  },
  {
    slug: 'downtime-cost',
    href: '/tools/downtime-cost',
    icon: 'clock',
    short: 'Downtime Cost',
    name: 'Downtime Cost Calculator',
    tagline: 'Revenue · Productivity · SLA',
    category: 'Calculators',
    description:
      'Work out what an hour of downtime actually costs your business in lost revenue and idle staff time, and what each SLA tier really allows.',
    status: 'live',
  },
];

export const getTool = (slug) => tools.find((t) => t.slug === slug);

export const categories = [...new Set(tools.map((t) => t.category))];
