export const services = [
  {
    slug: 'cloud-engineering',
    icon: 'cloud',
    title: 'Cloud Engineering',
    blurb: 'Architecture and migration designed for scale, cost control, and resilience across AWS, Azure, and GCP.',
    bullets: ['Cloud Architecture Design', 'Cloud Migration', 'Multi-Cloud Solutions', 'Managed Cloud Services'],
  },
  {
    slug: 'devops-engineering',
    icon: 'pipeline',
    title: 'DevOps Engineering',
    blurb: 'Delivery pipelines and infrastructure as code that turn releases into a routine, not an event.',
    bullets: ['CI/CD Pipelines', 'Infrastructure as Code', 'Docker & Kubernetes', 'Monitoring & Automation'],
  },
  {
    slug: 'server-infrastructure',
    icon: 'server',
    title: 'Server & Infrastructure',
    blurb: 'Hardened Linux estates, networking, and load balancing engineered for uptime under real traffic.',
    bullets: ['Linux Administration', 'Networking', 'Virtualization', 'Load Balancing'],
  },
  {
    slug: 'software-development',
    icon: 'code',
    title: 'Software Development',
    blurb: 'Web, mobile, and API platforms built on the same infrastructure discipline we bring to operations.',
    bullets: ['Web Applications', 'Mobile Applications', 'APIs', 'SaaS Platforms'],
  },
  {
    slug: 'artificial-intelligence',
    icon: 'ai',
    title: 'Artificial Intelligence',
    blurb: 'LLM integration and document intelligence wired into the workflows your team already runs.',
    bullets: ['LLM Integration', 'AI Chatbots', 'Machine Learning', 'Document AI'],
  },
  {
    slug: 'cybersecurity',
    icon: 'shield',
    title: 'Cybersecurity',
    blurb: 'Assessment, penetration testing, and compliance readiness applied before an incident forces the issue.',
    bullets: ['Security Assessment', 'Penetration Testing', 'Cloud Security', 'Compliance'],
  },
  {
    slug: 'digital-transformation',
    icon: 'transform',
    title: 'Digital Transformation',
    blurb: 'Consulting and solution architecture that modernises operations without stalling the business.',
    bullets: ['IT Consulting', 'Solution Architecture', 'Business Automation'],
  },
  {
    slug: 'managed-services',
    icon: 'pulse',
    title: 'Managed Services',
    blurb: 'Continuous monitoring, backup, and support so your platform has an owner around the clock.',
    bullets: ['Infrastructure Monitoring', 'Backup', 'Maintenance', 'Technical Support'],
  },
];

export const technologies = [
  'AWS', 'Azure', 'Google Cloud', 'Docker', 'Kubernetes', 'Terraform',
  'Ansible', 'GitLab CI/CD', 'Nginx', 'PostgreSQL', 'MySQL', 'Redis',
  'Node.js', 'Python', 'Java',
];

export const whyLexCorp = [
  {
    icon: 'users',
    title: 'Experienced engineers',
    description: 'Senior, hands-on delivery across cloud, DevOps, and security engagements — not handed off to juniors.',
  },
  {
    icon: 'shield',
    title: 'Secure by design',
    description: 'Security decisions made at architecture time, then verified continuously rather than bolted on at the end.',
  },
  {
    icon: 'scale',
    title: 'Scalable architecture',
    description: 'Systems sized for the traffic you expect next year, with clear headroom and cost visibility.',
  },
  {
    icon: 'bolt',
    title: 'Automation-first',
    description: 'Infrastructure as code and automated pipelines replace manual toil and configuration drift.',
  },
  {
    icon: 'route',
    title: 'End-to-end delivery',
    description: 'From blueprint and build through cutover and long-term operations — one accountable partner.',
  },
];

export const process = [
  {
    step: '01',
    title: 'Assess',
    description: 'We audit the current estate, map dependencies, and quantify risk, cost, and performance gaps.',
  },
  {
    step: '02',
    title: 'Architect',
    description: 'You get a documented blueprint: topology, security model, environments, and a migration path.',
  },
  {
    step: '03',
    title: 'Automate',
    description: 'Infrastructure as code, CI/CD, and policy guardrails make the design reproducible and reviewable.',
  },
  {
    step: '04',
    title: 'Operate',
    description: 'Monitoring, backup, and incident response keep the platform healthy long after go-live.',
  },
];

export const stats = [
  { value: 8, suffix: '', label: 'Service Domains' },
  { value: 15, suffix: '+', label: 'Core Technologies' },
  { value: 99.9, suffix: '%', label: 'Uptime Target' },
  { value: 24, suffix: '/7', label: 'Managed Support' },
];
