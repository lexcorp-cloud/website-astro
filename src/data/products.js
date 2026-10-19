/* ------------------------------------------------------------------
   Product registry — the single place a Lex Corp product is declared.

   Adding an entry here puts it on /products and in the "Our products"
   band on the home page. Order is the order shown.

   status: 'live' shows the visit button; anything else shows "Coming soon".
------------------------------------------------------------------- */

export const products = [
  {
    slug: 'lex-corp-cloud',
    name: 'Lex Corp Cloud',
    url: 'https://cloud.lexcorp.com.np',
    icon: 'cloud',
    tagline: 'Cloud servers in Nepal. Pay in Nepali Rupees.',
    description:
      'Get a cloud server (VPS) on AWS, Alibaba Cloud, DigitalOcean or Datahub without an international card. Pay with Khalti, eSewa, FonePay or bank transfer, and your server is ready within 24 hours.',
    keyPoints: [
      'Pay in NPR with local wallets or bank transfer',
      'Choice of AWS, Alibaba Cloud, DigitalOcean or Datahub',
      'Ready within 24 hours, with full SSH access',
      'PAN bill for every payment',
    ],
    audience: 'Students, developers and small businesses in Nepal',
    status: 'live',
  },
];
