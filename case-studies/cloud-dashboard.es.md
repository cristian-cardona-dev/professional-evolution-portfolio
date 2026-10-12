# Cloud Dashboard — reproducción pública

## Clasificación

Este es un **nuevo proyecto público / reproducción pública**. No es código de
cliente, infraestructura de un empleador en producción ni una reconstrucción de
un sistema privado.

## Problema

Crear una interfaz pequeña de estilo observabilidad que pueda inspeccionarse
localmente y que haga visibles los límites operativos en lugar de dar a entender
que hay acceso a la nube en vivo.

## Qué se implementó

- Interfaz de panel adaptable construida con Next.js, React y TypeScript.
- Datos sintéticos deterministas de CPU, memoria, volumen de solicitudes,
  disponibilidad, servicio y alertas.
- Controles locales de umbral de CPU y memoria.
- Estados de carga y error accesibles.
- Pruebas unitarias, pruebas de flujo en navegador, verificación de tipos, lint,
  compilación de producción y un escaneo de privacidad centrado.
- Explicación opcional de IA en el servidor, desactivada por defecto, que usa
  solo las métricas sintéticas integradas.

## Qué demuestra esto

- Una implementación pública y reproducible de una interfaz orientada a la nube.
- Composición de componentes full-stack y manejo de datos con tipos.
- Comportamiento de UI comprobable y estados de fallo explícitos.
- Una frontera conservadora en torno al comportamiento opcional de IA.

## Qué no demuestra esto

- Telemetría en vivo de AWS, Azure o GCP.
- Operación de Kubernetes, Prometheus, Terraform o Helm.
- Costes reales de nube, disponibilidad en producción o infraestructura de
  clientes.
- Autenticación, autorización, limitación de tasa o controles de abuso en
  producción.
- Trabajo histórico realizado para Talan, Siigo u otro empleador.

## Evidencia

- Repositorio: <https://github.com/HunterProX/cloud-dashboard>
- Registro de instantánea del portafolio: `ev-cloud-dashboard-repository`
- Afirmación del portafolio: `claim-cloud-dashboard-planned` (el ID se conserva
  por continuidad de la instantánea; su texto actual describe la reproducción
  pública).

## Siguiente frontera

La siguiente mejora útil no es un panel más grande. Es un escenario operativo
revisado y reproducible, con un caso de fallo documentado y una evaluación de
cualquier explicación opcional de IA. No se implica ninguna integración en vivo.
