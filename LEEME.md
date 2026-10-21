# ADI MUSIC AI — Aplicación inteligente para la gestión empresarial

Aplicación web con inteligencia artificial que ayuda a Yilmar a entender los datos de ADI MUSIC, controlar sus finanzas, proyectar ventas y decidir sobre publicidad.

## Cómo abrirla

**Versión publicada:** https://sp3ct3r1979.github.io/adi-music-ai/

1. Abre el enlace en Chrome o Edge (computadora o celular).
2. En **Inicio** o **Ventas y KPI** pulsa **"Subir Excel"** y elige el archivo de ADI MUSIC. Por privacidad, el Excel del negocio **no está publicado** en este sitio: se carga desde la computadora y se queda solo en ese navegador.
3. En **Analítica GA4** importa el informe de Google Analytics 4 o usa los **datos de demostración**.

## Exportar resultados

- **Excel** (botón arriba a la derecha): descarga un archivo con todos los resultados en hojas separadas: Resumen, KPI, Ventas por mes, Por paquete, Por lugar, Por tipo de evento, Patrones y decisiones, Proyección, Finanzas, Publicidad, GA4, Cotizaciones, Registros validados, Validación de datos y Consultas al asistente.
- **PDF** (botón arriba a la derecha): imprime la pantalla que estás viendo, con sus gráficos. En el diálogo de impresión elige **"Guardar como PDF"**.
- Cada **cotización** se puede imprimir o guardar en PDF desde Cotizaciones.
- **Respaldo** (Configuración): guarda todos los datos en un archivo para pasarlos a otra computadora.

## Activar la IA (Google Gemini, gratis)

1. Entra a **https://aistudio.google.com/apikey** con una cuenta de Google.
2. Pulsa **Create API key** y copia la clave.
3. En la app ve a **Configuración**, pega la clave y pulsa **Guardar y probar conexión**.

La app elige sola el mejor modelo "Flash" disponible para esa clave. Sin clave, el asistente funciona en **modo local**: responde con cálculos de la app, sin IA.

## Módulos

| Módulo | Qué hace |
|---|---|
| **Inicio** | Resumen del negocio: KPI principales, si cada mes alcanza para gastos fijos y cuota, alertas y próximos 3 meses. |
| **Analítica GA4** (función principal) | Importa informes de GA4 en CSV, Excel o PDF (el PDF lo lee la IA). Muestra usuarios, canales, campañas y contactos (eventos clave), compara meses, da hallazgos explicados y relaciona campañas con ventas sin confundir coincidencia con causa. |
| **Ventas y KPI** | Sube o carga el Excel. Detecta y valida las columnas y calcula solo los KPI posibles, cada uno con fórmula, resultado, periodo e interpretación. Incluye gráficos, patrones, decisiones a evaluar y lo que falta medir. |
| **Proyecciones** | Escenarios conservador, intermedio y optimista a 3, 6 o 12 meses, con estacionalidad, supuestos explícitos y limitaciones. |
| **Publicidad y decisiones** | Responde en qué meses se vende más, cuánto se gasta en publicidad, qué campañas funcionan, cuándo anunciar y qué presupuesto evaluar. |
| **Finanzas** | Separa ingresos, utilidad estimada, utilidad neta y efectivo disponible. Incluye presupuesto y metas con desviaciones explicadas, movimientos adicionales y necesidades de caja. |
| **Cotizaciones** | Arma cotizaciones con costos, precios y márgenes. Alerta si el margen es bajo o la fecha está ocupada, registra cómo llegó el cliente, imprime en PDF y pasa la cotización a ventas. |
| **Asistente IA** | Chat que responde con las cifras reales, separa hechos, interpretación y recomendación, y no inventa datos. |
| **Configuración** | Clave de Gemini, PIN de acceso, parámetros del negocio (gastos fijos, cuota, interés, impuestos), paquetes, respaldo de datos e historial. |

## Datos

- **Excel de ADI MUSIC**: no se publica en este sitio por privacidad; se sube desde la app.
- **GA4 de demostración**: `datos/ga4_demo_adi_music.csv`. **No son datos reales**: simulan una exportación de GA4 y la app los marca siempre como "demo". Cuando exista el informe real, se importa desde Analítica GA4.
- Los datos se guardan **solo en el navegador** donde se usa la app. Para pasarlos a otra computadora, usa **Configuración → Descargar respaldo / Restaurar respaldo**.
- Al preguntar a la IA, se envía a Gemini un **resumen** de los datos (totales, KPI y meses), no el archivo completo.

## Tecnologías elegidas y por qué

| Necesidad | Elegido | Alternativas consideradas | Motivo |
|---|---|---|---|
| Interfaz | HTML + CSS + JavaScript, sin compilación | React/Next.js, Google Stitch, Glide/AppSheet | Funciona con doble clic en cualquier computadora, sin instalar nada. Es fácil de modificar y no tiene costo. |
| Leer Excel/CSV | SheetJS (incluido en la carpeta) | Subir a Google Sheets | Procesa `.xlsx`, `.xls` y `.csv` en el propio navegador; los datos no salen de la computadora. |
| Gráficos | Chart.js (incluido) | Power BI, Looker Studio | Son gráficos interactivos dentro de la misma app, sin cuentas ni licencias. |
| Inteligencia artificial | Google Gemini API | OpenAI, Claude | Tiene nivel gratuito, lee PDF y el equipo lo prefiere. |
| Almacenamiento | Navegador (localStorage) + respaldo JSON | Supabase, Firebase | Es suficiente para un solo usuario y sin costo. Para varios usuarios o acceso desde el celular, el siguiente paso sería Supabase. |
| GA4 | Importar CSV, Excel o PDF | API de GA4 (Google Analytics Data API) | No exige conexión inicial. La API se puede integrar después con una cuenta de servicio y un pequeño servidor. |

## Próximos pasos posibles

- Conectar la **API de GA4** para que los datos se actualicen solos.
- **Enlazar el Excel** en OneDrive o Google Sheets en lugar de subirlo.
- Pasar los datos a **Supabase** para tener acceso con usuario y contraseña desde varios dispositivos.
- Registrar en cada contrato el **costo real**, el **origen del cliente** y el **estado de pago**, para calcular el margen real, el ROAS y la cobranza.

## Limitaciones

- Los costos variables son **estimados por paquete**: no hay gastos reales por evento.
- Las fechas del Excel fueron **reconstruidas de memoria**: la app avisa de los códigos fuera de orden.
- Las proyecciones usan **un solo año** de historia: son una guía para planificar, no una garantía.
- El PIN protege el acceso a la pantalla, pero los datos quedan en el navegador. Usa la app en una computadora de confianza.
