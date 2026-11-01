# Projects — All Published Projects

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