import laxman from '../assets/team/laxman-chaudhary.jpg';
import { CONTACT } from '../config/site.js';

/* ------------------------------------------------------------------
   Team registry. Same idea as data/tools.js — one entry per person,
   and the About page renders whatever is here.

   TODO (awaiting real values from Laxman): the `credentials` array is
   intentionally EMPTY. Do not populate it with plausible-sounding
   guesses — years of experience, certifications and client names are
   claims a buyer may verify, and inventing them would be worse than
   omitting them. The section renders correctly with an empty array;
   fill it in only from facts supplied by the person concerned.
------------------------------------------------------------------- */

export const team = [
  {
    slug: 'laxman-chaudhary',
    name: 'Laxman Chaudhary',
    role: 'Founder & Principal Engineer',
    photo: laxman,
    focus: ['Cloud Architecture', 'DevOps', 'Cybersecurity'],
    bio: 'Founded Lex Corp to give Nepali and international businesses infrastructure work done to an enterprise standard — architected deliberately, automated end to end, and supported after go-live rather than handed over and forgotten.',
    // Populate from real, verifiable facts only. See note above.
    credentials: [],
    linkedin: CONTACT.linkedin,
    email: CONTACT.emailHref,
  },
];
