// Build-time values (see .env / .env.example)
export const WEB3FORMS_ACCESS_KEY = import.meta.env.PUBLIC_WEB3FORMS_ACCESS_KEY || '';
export const ANALYTICS_ID = import.meta.env.PUBLIC_ANALYTICS_ID || '';
export const CLARITY_ID = import.meta.env.PUBLIC_CLARITY_ID || '';

export const LINKEDIN_URL = 'https://www.linkedin.com/company/lex-corp-nepal/';

export const CONTACT = {
  location: 'Kathmandu, Nepal',
  phone: '+977-9842028183',
  phoneHref: 'tel:+9779842028183',
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
