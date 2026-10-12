# AI Automation Workflow Lab — reproducción pública

## Clasificación

Esta es una nueva reproducción pública de un flujo de trabajo acotado. No es un
flujo de trabajo de cliente, una integración con Personal OS, un sistema de
producción autónomo, un flujo de n8n ni un despliegue de OpenClaw.

## Qué se implementó

- Contrato de entrada sintética.
- Estados explícitos de propuesta, aprobación, rechazo y ejecución.
- Acciones deterministas en lista de permitidos.
- Clave de idempotencia y ejecución segura ante repeticiones.
- Evento de auditoría por cada transición de estado.
- Pruebas de entrada no válida y de omisión de aprobación.

## Qué demuestra esto

- Diseño de flujos de trabajo con el humano en el bucle.
- Transiciones de estado y límites de aprobación.
- Acciones deterministas y auditabilidad.
- Comportamiento seguro ante ejecución duplicada.

## Qué no demuestra esto

- Automatización de producción autónoma.
- Integración con servicios externos.
- Escrituras en sistemas privados.
- Datos de cliente o implementación de flujos de trabajo de un empleador.
- Operación de n8n, OpenClaw o un runtime de agentes.

## Evidencia

- Repositorio: <https://github.com/HunterProX/ai-automation-workflow-lab>
- Registro de evidencia del portafolio: `ev-ai-automation-workflow-repository`
- Afirmación del portafolio: `claim-ai-automation-workflow-reproduction`
