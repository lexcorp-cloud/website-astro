import laxman from '../assets/team/laxman-chaudhary.jpg';

/* ------------------------------------------------------------------
   Team registry. Same idea as data/tools.js — one entry per person,
   and /team plus the About teaser render whatever is here.

   Everything in `credentials` comes from Laxman's own profile
   (~/Desktop/LEX CORP/Founder/README.md). Nothing here is inferred:
   certifications are named exactly as issued, and figures are the ones
   he states. Do not add a claim without a source.

   NOTE: these are PERSONAL contacts (his own profile and address),
   deliberately distinct from the company details in config/site.js.
   The company LinkedIn and enquiries@ address belong in the footer and
   contact page; a person's card should point at the person.
------------------------------------------------------------------- */

export const team = [
  {
    slug: 'laxman-chaudhary',
    name: 'Laxman Chaudhary',
    role: 'Founder & Director',
    photo: laxman,
    focus: ['DevOps', 'Cloud Architecture', 'Infrastructure Automation'],
    bio: 'DevOps and cloud engineer with over eight years building, automating and securing infrastructure across AWS, Alibaba Cloud and GCP. Founded Lex Corp to bring that standard of work — architected deliberately, automated end to end, and supported after go-live — to businesses in Nepal and abroad.',
    credentials: [
      '8+ years in DevOps, cloud and infrastructure engineering',
      'RHCSA — Red Hat Certified System Administrator',
      'Alibaba Cloud ACP & ACA — Cloud Computing and Cloud Security',
      'ZStack ZCCT & ZCCC — technical and consultant certification',
      'BE Computer Science & Engineering, East West Institute of Technology',
    ],
    highlights: [
      'Cut deployment times by up to 80% through containerisation and CI/CD',
      'Reduced cloud costs 40–45% with high-availability PostgreSQL redesign',
      'Improved operational efficiency ~70% through infrastructure automation',
    ],
    linkedin: 'https://www.linkedin.com/in/laxman-chaudhary',
    email: 'mailto:hello@chaudharylaxman.com.np',
  },
];
