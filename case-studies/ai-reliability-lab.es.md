# AI Engineering Reliability Lab — reproducción pública

## Clasificación

Este es un **nuevo proyecto público / reproducción pública**. No es un asistente
de producción, un sistema de cliente, una base de código de un empleador ni una
prueba de RAG en producción.

## Problema

Definir un contrato de respuesta seguro para un asistente de IA público antes de
introducir un proveedor de modelos, un sistema de recuperación, herramientas o
conversaciones persistentes.

## Qué se implementó

- Respuestas representativas deterministas sobre un conjunto de conocimiento en
  lista de permitidos.
- Identificadores de cita restringidos a registros aprobados del conjunto.
- Respuestas explícitas de `insufficient_evidence` para preguntas no admitidas.
- Límite de tamaño de solicitud y rechazo del historial de conversación.
- Endpoint de salud sin estado que expone la frontera del proveedor activo.
- Pruebas integradas de Node para respuestas admitidas, preguntas desconocidas,
  límites y el contrato de respuesta.

## Qué demuestra esto

- Diseño acotado de una API de IA sin depender de un proveedor de modelos.
- Comportamiento fail-closed cuando la evidencia es insuficiente.
- Un contrato de respuesta pequeño que más adelante puede situarse detrás de un
  adaptador neutro respecto al proveedor.
- Límites de privacidad y de citas comprobables.

## Qué no demuestra esto

- RAG de producción, embeddings, búsqueda vectorial o calidad de recuperación.
- Operación de OpenAI u otro proveedor de modelos.
- Streaming, agentes, herramientas, autenticación, limitación de tasa o
  protección frente al abuso público.
- Datos de cliente o de empleador.

## Evidencia

- Repositorio: <https://github.com/HunterProX/ai-chat-app>
- Registro de instantánea del portafolio: `ev-ai-reliability-lab-repository`
- Afirmación del portafolio: `claim-ai-chat-prototype-exists`

## Siguiente frontera

La siguiente evolución segura es un adaptador mock/proveedor con un conjunto de
evaluación fijo. Un proveedor real permanece desactivado hasta que la privacidad,
el coste, el tiempo de espera y los controles de abuso se revisen por separado.
