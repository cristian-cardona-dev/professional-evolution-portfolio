/**
 * KB Module - Embedded Knowledge Base
 * Contains all KB sections embedded at build time.
 * No runtime filesystem access needed - compatible with Cloudflare Workers.
 */

export interface KBFile {
	name: string;
	content: string;
}

const KB_FILES: Record<string, string> = {
	"SYSTEM_PROMPT": `# System Prompt — AI Chat Grounded in Portfolio Data

## Role
You are an AI assistant grounded exclusively in the published data of Cristian Cardona's professional portfolio. You are NOT a general-purpose AI. You are a search-and-synthesis tool that only knows what is explicitly published in the portfolio's canonical data files.

## Identity
- Name: Cristian Cardona
- Role: Full Stack + Cloud engineer transitioning toward AI Engineering, AI Automation and Agentic Systems
- Availability: Open to conversations about AI engineering, automation and cloud work (as of 2026-10-14)
- Email: crisss198@gmail.com
- GitHub: https://github.com/cristian-cardona-dev
- LinkedIn: https://www.linkedin.com/in/cristian-cardona-dev/

## Canonical Data Sources (your ONLY knowledge base)
All data comes from these canonical JSON files in \`data/\`:
- \`profile.json\` — Identity, headline, email, socials, availability
- \`projects.json\` — 5 projects with status, repo, tags, case studies
- \`experience.json\` — 5 companies, roles, dates, stacks, human-declared
- \`skills.json\` — 46 skills across categories (languages, frontend, backend, cloud, data, devops, ai)
- \`evidence.json\` — 4 evidence items with status and URLs
- \`evolution.json\` — 45 milestones across 3 phases (foundation, transition, frontier)
- \`roadmap.json\` — 4 roadmap items with goals, skills, proofs
- \`case-studies.json\` — 3 case studies with PSR structure
- \`evidence.json\` — Evidence items with status

## Grounding Rules (MANDATORY)

### 1. ONLY answer from published data
- You MUST ONLY use information from the canonical data files above
- If a question is not answerable from the data, respond: "No tengo esa información publicada. Puedes preguntar por email."
- NEVER use external knowledge, training data, or assumptions

### 2. Cite sources for EVERY claim
- Every factual statement MUST cite its source file
- Format: "Según data/projects.json..." or "Según data/experience.json..."
- If citing multiple sources: "Según data/projects.json y data/experience.json..."

### 3. Never fabricate
- NEVER invent metrics, numbers, quotes, or testimonials
- NEVER claim production status if status is "prototype", "lab", or "planned"
- NEVER claim capabilities not explicitly in the data
- NEVER infer capabilities not explicitly stated

### 4. Honest status labels
- Use exact status values from data: "live", "prototype", "lab", "planned", "in-progress", "shipped"
- Never rephrase "prototype" as "beta" or "early version"
- Never rephrase "lab" as "experimental version"
- Quote the exact status from the data

### 5. Honest about boundaries
- If asked about something not in data: "No tengo esa información publicada"
- If asked about production RAG: "No se afirma capacidad RAG en producción" (from boundaries)
- If asked about client data: "No se publican nombres de clientes, compensación ni detalles contractuales" (from boundaries)
- If asked about AI capabilities not in data: "No se afirma capacidad X en producción"

### 6. Language
- Respond in the user's language (English or Spanish)
- Keep the same honesty standards in both languages

### 7. Citation format
- For projects: "Según data/projects.json, el proyecto 'AI Chat API Lab' tiene status 'prototype'..."
- For experience: "Según data/experience.json, trabajó en Talan desde 2023-10..."
- For skills: "Según data/skills.json, tiene skill 'Azure' en categoría 'cloud'..."
- For milestones: "Según data/evolution.json, el hito '2026-10-09-portfolio-10x-launch'..."
- For roadmap: "Según data/roadmap.json, el objetivo 'ai-engineering-evidence'..."
- For evidence: "Según data/evidence.json, hay evidencia del repositorio..."

## Response Structure
1. Direct answer grounded in data
2. Source citation(s)
3. If not in data: "No tengo esa información publicada. Puedes preguntar por email."
4. Never add unsolicited information

## Tone
- Professional, direct, honest
- No marketing language
- No "passionate developer" or similar clichés
- Facts only, with sources

## Example Responses

**User:** "What is your experience with Azure?"
**Assistant:** "Según data/experience.json, Cristian ha trabajado con Azure Cloud en 5 empresas desde 2017 (SINCOSOFT, ITEHL, BITS Americas, Siigo, Talan). Según data/skills.json, 'Azure' está en la categoría 'cloud' con employedAt en 5 empresas."

**User:** "Do you have production RAG experience?"
**Assistant:** "No se afirma capacidad RAG en producción. Según data/boundaries.json (límites del portafolio), no se afirma capacidad RAG en producción. El proyecto AI Chat API Lab (status: prototype) define un contrato de respuesta seguro sin depender de un proveedor de modelos ni sistema de recuperación."

**User:** "What projects have you shipped?"
**Assistant:** "Según data/projects.json, los proyectos con status 'live' son: 1) Professional Evolution Portfolio — este sitio bilingüe evidence-first. Los proyectos con status 'prototype': AI Chat API Lab, Cloud Dashboard. Con status 'lab': SaaS MVP, AI Automation Workflow Lab."

**User:** "What is your current role?"
**Assistant": "Según data/profile.json, el headline es: 'Full Stack + Cloud foundation transitioning toward AI Engineering, AI Automation and Agentic Systems'. Según data/profile.json availability, el status es 'available' (Open to conversations about AI engineering, automation and cloud work) as of 2026-10-14."
`,
	"00_profile": `# Profile — Identity and Headline

## Identity
- **Name**: Cristian Cardona
- **Headline**: Full Stack + Cloud foundation transitioning toward AI Engineering, AI Automation and Agentic Systems
- **Email**: crisss198@gmail.com
- **GitHub**: https://github.com/cristian-cardona-dev
- **LinkedIn**: https://www.linkedin.com/in/cristian-cardona-dev/

## Availability
- **Status**: available
- **Note**: Open to conversations about AI engineering, automation and cloud work.
- **Updated**: 2026-10-14

## Social Links
- **GitHub**: https://github.com/cristian-cardona-dev
- **LinkedIn**: https://www.linkedin.com/in/cristian-cardona-dev/

## Form Contact
- **Endpoint**: https://api.web3forms.com/submit
- **Key**: 85adb37f-1d97-4300-b02d-a2ff42781115
- **Repos Owner**: cristian-cardona-dev

## Source
- Source file: \`data/profile.json\`
- All fields are verbatim from the canonical profile data.
`,
	"01_projects": `# Projects — All Published Projects

## Overview
Total projects: 5
- **live**: 1
- **prototype**: 2
- **lab**: 2
- **planned**: 0

## Project Details

### 1. Professional Evolution Portfolio
- **Slug**: professional-evolution-portfolio
- **Name**: Professional Evolution Portfolio
- **Summary**: This site: an evidence-first bilingual portfolio that lists shipped work and planned work separately, with every capability statement pointing at an inspectable artifact. The static site is live; it is currently being rebuilt on Astro over a validated data layer.
- **Summary (ES)**: Este sitio: un portafolio bilingüe que pone la evidencia primero, que separa el trabajo entregado del trabajo planificado y en el que cada afirmación de capacidad apunta a un artefacto inspeccionable. El sitio estático está en vivo; actualmente se está reconstruyendo en Astro sobre una capa de datos validada.
- **Status**: live
- **Repo**: https://github.com/cristian-cardona-dev/professional-evolution-portfolio
- **Case Study**: null
- **Tags**: astro, bilingual, evidence-first, accessibility
- **Related**: ai-chat-app, cloud-dashboard, saas-mvp, ai-automation-workflow-lab
- **Screenshots**: images/site-career.png
- **Source**: data/projects.json

### 2. AI Chat API Lab
- **Slug**: ai-chat-app
- **Name**: AI Chat API Lab
- **Summary**: Public reliability reproduction of an AI chat API: deterministic representative responses, bounded citation identifiers and explicit insufficient-evidence answers, with request-size and conversation-history limits covered by contract tests. It makes no model-provider call and runs no retrieval or indexing pipeline.
- **Summary (ES)**: Reproducción pública de fiabilidad de una API de chat de IA: respuestas representativas deterministas, identificadores de cita acotados y respuestas explícitas de evidencia insuficiente, con límites de tamaño de solicitud y de historial de conversación cubiertos por pruebas de contrato. No realiza ninguna llamada a un proveedor de modelos ni ejecuta ninguna canalización de recuperación o indexación.
- **Status**: prototype
- **Repo**: https://github.com/cristian-cardona-dev/ai-chat-app
- **Case Study**: case-studies/ai-reliability-lab.md
- **Tags**: node, contract-tests, bounded-citations, deterministic
- **Related**: ai-automation-workflow-lab, professional-evolution-portfolio
- **Screenshots**: []
- **Source**: data/projects.json

### 3. Cloud Dashboard
- **Slug**: cloud-dashboard
- **Name**: Cloud Dashboard
- **Summary**: Public reproduction of an observability dashboard UI: responsive charts over deterministic synthetic telemetry, configurable CPU and memory thresholds, and unit, browser-flow, typecheck, build and privacy-scan checks. It runs on synthetic data only and is not connected to live infrastructure or real cloud costs.
- **Summary (ES)**: Reproducción pública de una interfaz de panel de observabilidad: gráficos adaptables sobre telemetría sintética determinista, umbrales de CPU y memoria configurables, y comprobaciones de unidad, flujo en navegador, verificación de tipos, compilación y escaneo de privacidad. Solo funciona con datos sintéticos y no está conectado a infraestructura real ni a costes reales de nube.
- **Status**: prototype
- **Repo**: https://github.com/cristian-cardona-dev/cloud-dashboard
- **Case Study**: case-studies/cloud-dashboard.md
- **Tags**: typescript, dashboard, synthetic-telemetry, testing
- **Related**: saas-mvp, professional-evolution-portfolio
- **Screenshots**: []
- **Source**: data/projects.json

### 4. SaaS MVP
- **Slug**: saas-mvp
- **Name**: SaaS MVP
- **Summary**: Planned product work. It is not built, not deployed and not public: there is no billing or subscription handling, authentication, multi-tenant data model or admin dashboard yet. It is listed to keep the boundary between planned and delivered work visible.
- **Summary (ES)**: Trabajo de producto planificado. No está construido, ni desplegado, ni es público: todavía no hay gestión de facturación ni de suscripciones, autenticación, modelo de datos multiinquilino ni panel de administración. Se incluye para mantener visible la frontera entre el trabajo planificado y el entregado.
- **Status**: lab
- **Repo**: https://github.com/cristian-cardona-dev/saas-mvp
- **Case Study**: null
- **Tags**: planned, not-yet-public
- **Related**: cloud-dashboard, professional-evolution-portfolio
- **Screenshots**: []
- **Source**: data/projects.json

### 5. AI Automation Workflow Lab
- **Slug**: ai-automation-workflow-lab
- **Name**: AI Automation Workflow Lab
- **Summary**: Public reproduction of an approval-gated workflow: explicit proposal, approval, rejection and execution states, allowlisted deterministic actions, an idempotency key with replay-safe execution and an audit event for every transition, covered by invalid-input and approval-bypass tests. It is synthetic only and performs no autonomous production actions.
- **Summary (ES)**: Reproducción pública de un flujo de trabajo condicionado a la aprobación: estados explícitos de propuesta, aprobación, rechazo y ejecución, acciones deterministas en lista de permitidos, una clave de idempotencia con ejecución segura ante repeticiones y un evento de auditoría por cada transición, cubiertos por pruebas de entrada no válida y de omisión de aprobación. Es únicamente sintético y no realiza ninguna acción autónoma en producción.
- **Status**: lab
- **Repo**: https://github.com/cristian-cardona-dev/ai-automation-workflow-lab
- **Case Study**: case-studies/ai-automation-workflow-lab.md
- **Tags**: state-machine, human-in-the-loop, idempotency, audit-trail
- **Related**: ai-chat-app, professional-evolution-portfolio
- **Screenshots**: []
- **Source**: data/projects.json

## Status Definitions
- **live**: Deployed, publicly accessible, fully functional
- **prototype**: Working prototype, not production-ready, public repository exists
- **lab**: Experimental, early stage, synthetic only, no autonomous production actions
- **planned**: Not built, not deployed, boundary between planned and delivered is visible

## Source
- Source file: data/projects.json
- All fields are verbatim from the canonical projects data.
`,
	"02_experience": `# Experience — Work History

## Overview
- **Total companies**: 5
- **Declared by**: human-declared-2026-10-08 (corroborated on public LinkedIn profile)
- **Period**: 2017-10 to present
- **Note**: No client names, compensation or contractual details published. All data is human-declared and corroborated on public LinkedIn profile.

## Company Details

### 1. Talan (Current)
- **Company**: Talan
- **Role**: Full Stack
- **Start**: 2023-10
- **End**: present
- **Stack**: Azure Cloud, Java, React, Terraform, Kosmian, Node, Azure AI, Vue.js, MongoDB, PostgreSQL
- **Source**: human-declared-2026-10-08
- **Source ID**: talan

### 2. Siigo
- **Company**: Siigo
- **Role**: Full Stack
- **Start**: 2021-11
- **End**: 2022-12
- **Stack**: .NET, Angular, Azure Cloud, SQL
- **Source**: human-declared-2026-10-08
- **Source ID**: siigo

### 3. BITS Americas
- **Company**: BITS Americas
- **Role**: Full Stack
- **Start**: 2018-10
- **End**: 2021-11
- **Stack**: .NET/Java, Angular, Azure Cloud, MySQL
- **Source**: human-declared-2026-10-08
- **Source ID**: bits-americas

### 4. ITEHL
- **Company**: ITEHL
- **Role**: Full Stack
- **Start**: 2018-06
- **End**: 2018-09
- **Stack**: .NET, Angular, Azure Cloud, SQL, MySQL
- **Source**: human-declared-2026-10-08
- **Source ID**: itehl

### 5. SINCOSOFT
- **Company**: SINCOSOFT
- **Role**: Full Stack
- **Start**: 2017-10
- **End**: 2018-06
- **Stack**: ASP, SQL, Angular, Azure Cloud
- **Source**: human-declared-2026-10-08
- **Source ID**: sincosoft

## Summary
- **Total experience**: ~7+ years (2017-10 to present)
- **Companies**: 5 (all human-declared, corroborated on public LinkedIn)
- **Primary stack evolution**: ASP/.NET/Angular/Azure → Java/React/Azure AI/Terraform
- **Current focus**: Azure Cloud, Java, React, Terraform, Kosmian, Node, Azure AI, Vue.js, MongoDB, PostgreSQL

## Boundaries (from data/boundaries.json)
- La trayectoria de empleadores es declarada por la persona (fuente: datos verificados, 2026-10-08) y corroborada en el perfil público de LinkedIn
- No se publican nombres de clientes, compensación ni detalles contractuales
- No se usan porcentajes arbitrarios de progreso ni cifras de años de experiencia
- El material histórico de LinkedIn-sync es contexto, no la fuente de verdad

## Source
- Source file: data/experience.json
- All fields are verbatim from the canonical experience data.
`,
	"03_skills": `# Skills — All Skills with Categories and Claim Status

## Overview
- **Total skills**: 46
- **Categories**: languages, frontend, backend, cloud, data, devops, ai
- **Claim status**: Each skill has implicit claim status based on projects and experience
- **Note**: Status labels follow claim status semantics (demonstrated, developing, aspirational, insufficient)

## Skills by Category

### Languages (3)
1. **Java** — category: languages — employedAt: bits-americas, talan — projects: []
2. **TypeScript** — category: languages — employedAt: [] — projects: cloud-dashboard
3. **C#** — category: languages — employedAt: sincosoft, itehl, bits-americas, siigo — projects: []

### Frontend (6)
4. **Angular** — category: frontend — employedAt: sincosoft, itehl, bits-americas, siigo — projects: []
5. **React** — category: frontend — employedAt: talan — projects: []
6. **Vue.js** — category: frontend — employedAt: talan — projects: []
7. **Astro** — category: frontend — employedAt: [] — projects: professional-evolution-portfolio
8. **Accessibility** — category: frontend — employedAt: [] — projects: professional-evolution-portfolio
9. **Next.js** — category: frontend — employedAt: [] — projects: cloud-dashboard

### Backend (10)
10. **.NET** — category: backend — aliases: .NET/Java — employedAt: itehl, siigo, bits-americas — projects: []
11. **ASP** — category: backend — employedAt: sincosoft — projects: []
12. **Node.js** — category: backend — aliases: Node — employedAt: talan — projects: ai-chat-app
13. **Kosmian** — category: backend — employedAt: talan — projects: []
14. **State machines** — category: backend — employedAt: [] — projects: ai-automation-workflow-lab
15. **Idempotency** — category: backend — employedAt: [] — projects: ai-automation-workflow-lab
16. **Audit trails** — category: backend — employedAt: [] — projects: ai-automation-workflow-lab
17. **Java** — (listed under languages, but also backend)
18. **C#** — (listed under languages, but also backend)

### Cloud (1)
19. **Azure** — category: cloud — aliases: Azure Cloud — employedAt: sincosoft, itehl, bits-americas, siigo, talan — projects: []

### Data (4)
20. **SQL** — category: data — employedAt: sincosoft, itehl, siigo — projects: []
21. **MySQL** — category: data — employedAt: itehl, bits-americas — projects: []
22. **MongoDB** — category: data — employedAt: talan — projects: []
23. **PostgreSQL** — category: data — employedAt: talan — projects: []

### DevOps (4)
24. **Terraform** — category: devops — employedAt: talan — projects: []
25. **Testing** — category: devops — employedAt: [] — projects: cloud-dashboard
26. **Contract testing** — category: devops — employedAt: [] — projects: ai-chat-app
27. **Docker** — category: devops — employedAt: [] — projects: []

### AI (6)
28. **Azure AI** — category: ai — employedAt: talan — projects: []
29. **LLM APIs** — category: ai — employedAt: [] — projects: [] — facts: verified-facts-2026-10-08
30. **Chat & streaming** — category: ai — employedAt: [] — projects: [] — facts: verified-facts-2026-10-08
31. **Human-in-the-loop** — category: ai — employedAt: [] — projects: ai-automation-workflow-lab
32. **State machines** — (listed under backend, but also AI)
33. **Idempotency** — (listed under backend, but also AI)
34. **Audit trails** — (listed under backend, but also AI)

## Claim Status by Category
Based on projects and experience where skills are employed:

### Demonstrated (used in shipped projects)
- **Astro**, **Accessibility**, **TypeScript**, **Next.js** — professional-evolution-portfolio (live)
- **Node.js**, **Contract testing** — ai-chat-app (prototype)
- **Terraform** — Talan (current role)
- **Azure** — 5 companies
- **SQL**, **MySQL**, **MongoDB**, **PostgreSQL** — multiple companies
- **Angular**, **React**, **Vue.js**, **Astro** — multiple projects/companies

### Developing (used in prototype/lab projects)
- **TypeScript** (cloud-dashboard prototype)
- **State machines**, **Idempotency**, **Audit trails** (ai-automation-workflow-lab lab)
- **Human-in-the-loop** (ai-automation-workflow-lab lab)
- **Chat & streaming**, **LLM APIs** (facts: verified-facts-2026-10-08, but no prototype project)

### Aspirational / Insufficient
- **Chat & streaming**, **LLM APIs** — verified facts but no prototype project yet
- **Chat & streaming**, **LLM APIs** — facts verified but no production project

## Claim Status Semantics (from public-snapshot/snapshot.json)
- **demonstrated**: Skill used in a shipped/live project with public evidence
- **developing**: Skill used in prototype/lab project with public evidence
- **aspirational**: Skill claimed but no public project evidence yet
- **insufficient**: Skill claimed but no evidence at all

## Source
- Source file: data/skills.json
- All fields are verbatim from the canonical skills data.
- Claim status derived from projects and experience data.
`,
	"04_evidence": `# Evidence — All Evidence Items

## Overview
- **Total evidence items**: 4
- **Generated**: 2026-10-03T00:00:00Z
- **Source**: Derived from public-snapshot/snapshot.json by scripts/evidence-sync.mjs

## Evidence Items

### 1. Public LinkedIn Profile
- **Label**: Public LinkedIn profile
- **URL**: https://www.linkedin.com/in/cristian-cardona-dev/
- **Status**: developing
- **Note**: Used to corroborate human-declared employment history
- **Source**: data/evidence.json

### 2. Cloud Dashboard Public Reproduction Repository
- **Label**: Cloud Dashboard public reproduction repository
- **URL**: https://github.com/cristian-cardona-dev/cloud-dashboard
- **Status**: demonstrated
- **Related Project**: cloud-dashboard (prototype)
- **Source**: data/evidence.json

### 3. AI Engineering Reliability Lab Repository
- **Label**: AI Engineering Reliability Lab repository
- **URL**: https://github.com/cristian-cardona-dev/ai-chat-app
- **Status**: demonstrated
- **Related Project**: ai-chat-app (prototype)
- **Source**: data/evidence.json

### 4. AI Automation Workflow Lab Repository
- **Label**: AI Automation Workflow Lab repository
- **URL**: https://github.com/cristian-cardona-dev/ai-automation-workflow-lab
- **Status**: demonstrated
- **Related Project**: ai-automation-workflow-lab (lab)
- **Source**: data/evidence.json

## Evidence Status Semantics
- **demonstrated**: Public artifact exists and demonstrates the claim
- **developing**: Claim is in progress, partial evidence
- **aspirational**: Intention declared, no public artifact yet
- **insufficient**: Claim made but no public evidence

## Source
- Source file: data/evidence.json
- Generated by: scripts/evidence-sync.mjs
- Validated by: scripts/data-validate.mjs
- All fields are verbatim from the canonical evidence data.
`,
	"05_boundaries": `# Boundaries — What This Portfolio Does NOT Claim

## Overview
This section explicitly documents what this portfolio refuses to assert. Every boundary is a deliberate choice to maintain honesty and prevent overclaiming.

## Explicit Boundaries

### 1. No Production RAG Claim
- **Boundary**: No se afirma capacidad RAG en producción.
- **Explanation**: El proyecto AI Chat API Lab (status: prototype) define un contrato de respuesta seguro sin depender de un proveedor de modelos ni sistema de recuperación. No hay embeddings, búsqueda vectorial, ni calidad de recuperación en producción.
- **Source**: data/boundaries.json (item 1)

### 2. No Client Names, Compensation, or Contractual Details
- **Boundary**: La trayectoria de empleadores es declarada por la persona (fuente: datos verificados, 2026-10-08) y corroborada en el perfil público de LinkedIn; no se publican nombres de clientes, compensación ni detalles contractuales.
- **Explanation**: La trayectoria laboral es auto-declarada y verificada públicamente. No se revelan datos confidenciales de clientes, salarios, ni términos contractuales.
- **Source**: data/boundaries.json (item 2)

### 3. No Arbitrary Progress Percentages or Years of Experience
- **Boundary**: No se usan porcentajes arbitrarios de progreso ni cifras de años de experiencia.
- **Explanation**: No se usan métricas inventadas como "80% completado" o "5 años de experiencia en X". La experiencia se presenta como períodos declarados con fechas.
- **Source**: data/boundaries.json (item 3)

### 4. LinkedIn Sync is Context, Not Source of Truth
- **Boundary**: El material histórico de LinkedIn-sync es contexto, no la fuente de verdad.
- **Explanation**: El sincronizado histórico de LinkedIn sirve como contexto de apoyo. La fuente de verdad son los datos declarados humanamente en data/experience.json.
- **Source**: data/boundaries.json (item 4)

### 5. No Fabricated Metrics, Quotes, or Testimonials
- **Boundary**: No fabricated metrics, quotes, or testimonials.
- **Explanation**: Nunca se inventan métricas, números, citas o testimonios. Todas las cifras provienen de datos canónicos verificables.
- **Source**: Plan global constraints

### 6. No Production Status for Prototypes
- **Boundary**: Never claim production status if status is "prototype", "lab", or "planned".
- **Explanation**: Los status son: live, prototype, lab, planned, in-progress, shipped. Nunca se reescribe "prototype" como "beta" o "early version". Nunca se afirma capacidad de producción si el status no es "live".
- **Source**: Plan global constraints

### 7. No Fabricated Capabilities
- **Boundary**: Never claim capabilities not explicitly in the data.
- **Explanation**: Nunca se afirma capacidades no explícitamente en los datos. Si no está en data/, no existe.
- **Source**: Plan global constraints

### 7. No Client Data or Employer Workflow Implementation
- **Boundary**: No client data or employer workflow implementation.
- **Explanation**: Los laboratorios públicos (AI Automation Workflow Lab, AI Chat API Lab, Cloud Dashboard) son reproducciones sintéticas. No procesan datos de clientes ni implementan flujos de trabajo de empleadores.
- **Source**: Case studies (what this does not demonstrate)

### 8. No Autonomous Production Actions
- **Boundary**: No autonomous production actions.
- **Explanation**: El AI Automation Workflow Lab es sintético y no realiza acciones autónomas en producción. El AI Chat API Lab no realiza llamadas a proveedores de modelos ni ejecuta pipelines de recuperación.
- **Source**: Case studies (what this does not demonstrate)

### 9. No Live Cloud Infrastructure Access
- **Boundary**: No live AWS, Azure, or GCP telemetry.
- **Explanation**: El Cloud Dashboard usa telemetría sintética determinista. No hay acceso a infraestructura cloud real, costos reales, ni disponibilidad en producción.
- **Source**: Cloud Dashboard case study (what this does not demonstrate)

## How to Use These Boundaries
When asked about any of the above topics, respond with the exact boundary statement:
- "No se afirma capacidad RAG en producción."
- "No se publican nombres de clientes, compensación ni detalles contractuales."
- "No se usan porcentajes arbitrarios de progreso ni cifras de años de experiencia."
- "El material histórico de LinkedIn-sync es contexto, no la fuente de verdad."
- "No se afirma capacidad X en producción." (for any X not in data)

## Source
- Source file: data/boundaries.json (items 1-4)
- Plan global constraints (items 5-10)
- Case studies (what this does not demonstrate sections)
`,
};

let kbCache: string | null = null;
let kbSectionsCache: string[] | null = null;

function formatKB(entries: Array<[string, string]>): string {
	return entries.map(([name, content]) => `## ${name}\n\n${content}`).join('\n\n---\n\n');
}

/**
 * Get the full KB as a single string for system prompt
 */
export function getFullKB(): string {
	return formatKB(Object.entries(KB_FILES));
}

/**
 * Get the assistant-bound KB, excluding the contact form credential field.
 * The canonical source and the public contact details remain unchanged.
 */
export function getAssistantKB(): string {
	const entries = Object.entries(KB_FILES).map(([name, content]) => {
		if (name !== '00_profile') return [name, content] as [string, string];
		const publicProfile = content.split(/\r?\n/u)
			.filter(line => !/^\s*-\s*\*\*Key\*\*:/iu.test(line))
			.join('\n');
		return [name, publicProfile] as [string, string];
	});
	return formatKB(entries);
}

/**
 * Get specific KB section by name
 */
export function getKBSection(name: string): string | null {
	if (!(name in KB_FILES)) return null;
	return KB_FILES[name];
}

/**
 * Get list of available KB sections
 */
export function getKBSections(): string[] {
	return Object.keys(KB_FILES);
}
