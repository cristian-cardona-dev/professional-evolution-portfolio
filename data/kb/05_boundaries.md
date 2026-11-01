# Boundaries — What This Portfolio Does NOT Claim

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

### 8. No Client Data or Employer Workflow Implementation
- **Boundary**: No client data or employer workflow implementation.
- **Explanation**: Los laboratorios públicos (AI Automation Workflow Lab, AI Chat API Lab, Cloud Dashboard) son reproducciones sintéticas. No procesan datos de clientes ni implementan flujos de trabajo de empleadores.
- **Source**: Case studies (what this does not demonstrate)

### 9. No Autonomous Production Actions
- **Boundary**: No autonomous production actions.
- **Explanation**: El AI Automation Workflow Lab es sintético y no realiza acciones autónomas en producción. El AI Chat API Lab no realiza llamadas a proveedores de modelos ni ejecuta pipelines de recuperación.
- **Source**: Case studies (what this does not demonstrate)

### 10. No Live Cloud Infrastructure Access
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