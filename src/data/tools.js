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
  {
    slug: 'my-ip',
    href: '/tools/my-ip',
    icon: 'pin',
    short: 'My IP',
    name: 'What Is My IP',
    tagline: 'IP · ISP · Device',
    category: 'Network',
    description:
      'Your public IPv4 and IPv6 address, ISP, location, and everything your browser reveals about your device and connection.',
    status: 'live',
  },
  {
    slug: 'speed-test',
    href: '/tools/speed-test',
    icon: 'pulse',
    short: 'Speed Test',
    name: 'Internet Speed Test',
    tagline: 'Download · Upload · Latency',
    category: 'Network',
    description:
      'Measure download and upload throughput, latency and jitter straight from your browser. No app, no signup.',
    status: 'live',
  },
  {
    slug: 'subnet-calculator',
    href: '/tools/subnet-calculator',
    icon: 'globe',
    short: 'Subnet Calc',
    name: 'Subnet / CIDR Calculator',
    tagline: 'CIDR · Mask · Hosts',
    category: 'Network',
    description:
      'Work out network and broadcast addresses, usable host range, netmask and wildcard for any IPv4 CIDR block — and split a network into equal subnets.',
    status: 'live',
  },
  {
    slug: 'cron-explainer',
    href: '/tools/cron-explainer',
    icon: 'clock',
    short: 'Cron Explainer',
    name: 'Cron Expression Explainer',
    tagline: 'Schedule · Next runs',
    category: 'Developer',
    description:
      'Translate a crontab expression into plain English and see the next five times it will actually fire, so a misplaced asterisk is obvious before it ships.',
    status: 'live',
  },
  {
    slug: 'dev-utilities',
    href: '/tools/dev-utilities',
    icon: 'code',
    short: 'Dev Utilities',
    name: 'Developer Utilities',
    tagline: 'Base64 · UUID · Hash · Epoch',
    category: 'Developer',
    description:
      'Four everyday conversions in one place: Base64 encode and decode, UUID v4 generation, SHA hashing, and Unix timestamp conversion.',
    status: 'live',
  },
  {
    slug: 'jwt-decoder',
    href: '/tools/jwt-decoder',
    icon: 'shield',
    short: 'JWT Decoder',
    name: 'JWT Decoder',
    tagline: 'Header · Claims · Expiry',
    category: 'Developer',
    description:
      'Decode a JSON Web Token to inspect its header and claims, with expiry and timing checks in readable dates. Decoding happens locally — the token is never sent anywhere.',
    status: 'live',
  },
  {
    slug: 'password-generator',
    href: '/tools/password-generator',
    icon: 'bolt',
    short: 'Password Gen',
    name: 'Password & Passphrase Generator',
    tagline: 'Entropy · Crack time',
    category: 'Security',
    description:
      'Generate cryptographically random passwords or passphrases, with the actual entropy in bits and an honest estimate of how long an offline attack would take.',
    status: 'live',
  },
  {
    slug: 'yaml-json',
    href: '/tools/yaml-json',
    icon: 'transform',
    short: 'YAML ⇄ JSON',
    name: 'YAML ⇄ JSON Converter',
    tagline: 'Two-way · Validating',
    category: 'Developer',
    description:
      'Convert between YAML and JSON in either direction, with parse errors reported by line so a broken manifest is quick to find.',
    status: 'live',
  },
  {
    slug: 'sizing-calculator',
    href: '/tools/sizing-calculator',
    icon: 'server',
    short: 'Sizing Calc',
    name: 'Server & Kubernetes Sizing',
    tagline: 'Concurrency · CPU · Memory',
    category: 'Calculators',
    description:
      'Size workers, pods, CPU and memory from your traffic and latency using Little’s Law, and get a Kubernetes resources block you can paste in.',
    status: 'live',
  },
];

export const getTool = (slug) => tools.find((t) => t.slug === slug);

export const categories = [...new Set(tools.map((t) => t.category))];
