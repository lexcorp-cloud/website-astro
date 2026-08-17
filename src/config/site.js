// Build-time values (see .env / .env.example)
export const WEB3FORMS_ACCESS_KEY = import.meta.env.PUBLIC_WEB3FORMS_ACCESS_KEY || '';
export const ANALYTICS_ID = import.meta.env.PUBLIC_ANALYTICS_ID || '';
export const CLARITY_ID = import.meta.env.PUBLIC_CLARITY_ID || '';

export const LINKEDIN_URL = 'https://www.linkedin.com/company/lex-corp-nepal/';

export const CONTACT = {
  location: 'Kathmandu, Nepal',

  /* Phone is published MASKED by request. Two things make that meaningful
     rather than decorative:
       1. The full number never appears in the HTML source — it is assembled
          in the browser from `phoneParts` on click, so regex scrapers that
          harvest tel: links and number patterns come up empty.
       2. It is omitted from the Organization JSON-LD for the same reason;
          masking the visible copy while publishing it in structured data
          would defeat the point entirely.
     Trade-off: a caller has to click once to see it. To publish it openly
     again, set `phoneMasked: false` and restore `telephone` in BaseLayout. */
  phoneMasked: true,
  phoneDisplay: '+977-98420•••••',
  // Split so the complete string is not greppable in the built output.
  phoneParts: ['+977-', '98420', '28183'],
  email: 'enquiries@lexcorp.com.np',
  emailHref: 'mailto:enquiries@lexcorp.com.np',
  linkedin: LINKEDIN_URL,
  linkedinLabel: 'linkedin.com/company/lex-corp-nepal',
};

export const COMPANY = {
  legalName: 'Lex Corp Pvt. Ltd.',
  shortName: 'Lex Corp',
  founder: 'Laxman Chaudhary',
};
