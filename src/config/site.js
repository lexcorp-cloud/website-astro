// Build-time values (see .env / .env.example)
export const WEB3FORMS_ACCESS_KEY = import.meta.env.PUBLIC_WEB3FORMS_ACCESS_KEY || '';
export const ANALYTICS_ID = import.meta.env.PUBLIC_ANALYTICS_ID || '';

export const LINKEDIN_URL = 'https://www.linkedin.com/in/laxman-chaudhary';

export const CONTACT = {
  location: 'Kathmandu, Nepal',
  phone: '+977-9842028183',
  phoneHref: 'tel:+9779842028183',
  email: 'info@lexcorp.com.np',
  emailHref: 'mailto:info@lexcorp.com.np',
  linkedin: LINKEDIN_URL,
  linkedinLabel: 'linkedin.com/in/laxman-chaudhary',
};

export const COMPANY = {
  legalName: 'Lex Corp Pvt. Ltd.',
  shortName: 'Lex Corp',
  founder: 'Laxman Chaudhary',
};
