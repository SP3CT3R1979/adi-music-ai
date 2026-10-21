/* ADI MUSIC AI — asistente con inteligencia artificial (Google Gemini) y respuestas locales de respaldo. */
ADI.ia = (() => {
  const u = ADI.u;
  const API = 'https://generativelanguage.googleapis.com/v1beta';

  // ---------- Conexión con Gemini ----------
  function errorAmigable(status, body) {
    const msg = (body && body.error && body.error.message) || '';
    if (status === 400 && /api key/i.test(msg)) return 'La clave de Gemini no es válida. Revísala en Configuración.';
    if (status === 400) return 'Gemini rechazó la solicitud: ' + msg;
    if (status === 403) return 'La clave no tiene permiso para usar Gemini (revisa que la API esté habilitada en Google AI Studio).';
    if (status === 404) return 'El modelo de Gemini elegido ya no está disponible.';
    if (status === 429) return 'Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto e intenta de nuevo.';
    if (status >= 500) return 'Gemini no está disponible en este momento. Intenta en unos segundos.';
    return 'Error de Gemini (' + status + '): ' + msg;
  }

  async function pedir(url, opciones = {}, ms = 90000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opciones, signal: ctrl.signal });
      let body = null;
      try { body = await r.json(); } catch (_) { /* sin cuerpo JSON */ }
      if (!r.ok) { const e = new Error(errorAmigable(r.status, body)); e.status = r.status; throw e; }
      return body;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Gemini tardó demasiado en responder. Intenta de nuevo.');
      if (e instanceof TypeError) throw new Error('No hay conexión con Gemini (revisa tu internet).');
      throw e;
    } finally { clearTimeout(t); }
  }

  // Elige el mejor modelo "Flash" disponible para la clave (los nombres de modelos cambian seguido).
  function puntuarModelo(m) {
    const n = m.name.replace('models/', '');
    if (!/gemini/.test(n) || !(m.supportedGenerationMethods || []).includes('generateContent')) return -1;
    if (/(image|tts|audio|live|embedding|vision|robotics|computer|aqa|learnlm|native)/.test(n)) return -1;
    let s = 0;
    if (/flash-lite/.test(n)) s += 60; else if (/flash/.test(n)) s += 100; else if (/pro/.test(n)) s += 40;
    if (!/(preview|exp)/.test(n)) s += 20;
    const v = n.match(/gemini-(\d+(?:\.\d+)?)/);
    if (v) s += parseFloat(v[1]) * 10; else if (/latest/.test(n)) s += 15;
    return s;
  }

  async function listarModelos(key) {
    let token = '', todos = [];
    for (let i = 0; i < 4; i++) {
      const data = await pedir(`${API}/models?pageSize=200${token ? '&pageToken=' + token : ''}`, { headers: { 'x-goog-api-key': key } }, 20000);
      todos = todos.concat(data.models || []);
      token = data.nextPageToken; if (!token) break;
    }
    return todos.map((m) => ({ id: m.name.replace('models/', ''), nombre: m.displayName || m.name, score: puntuarModelo(m) }))
      .filter((m) => m.score >= 0).sort((a, b) => b.score - a.score);
  }

  async function probarConexion() {
    const cfg = ADI.store.get().config;
    if (!cfg.geminiKey) throw new Error('Primero pega tu clave de Gemini.');
    const modelos = await listarModelos(cfg.geminiKey);
    if (!modelos.length) throw new Error('La clave funciona, pero no hay modelos de texto disponibles.');
    ADI.store.update((s) => { s.config.modelosDisponibles = modelos.slice(0, 25).map((m) => m.id); s.config.modeloDetectado = modelos[0].id; });
    return modelos[0].id;
  }

  const disponible = () => !!ADI.store.get().config.geminiKey;
  const modeloActual = () => { const c = ADI.store.get().config; return c.geminiModelo && c.geminiModelo !== 'auto' ? c.geminiModelo : c.modeloDetectado; };

  async function generar({ system, contents, json = false, maxTokens = 2048, temperatura = 0.4 }) {
    const cfg = ADI.store.get().config;
    if (!cfg.geminiKey) throw new Error('No hay clave de Gemini configurada.');
    let modelo = modeloActual();
    if (!modelo) modelo = await probarConexion();
    const body = { contents, generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const llamar = (m) => pedir(`${API}/models/${encodeURIComponent(m)}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': cfg.geminiKey }, body: JSON.stringify(body),
    });
    let data;
    try { data = await llamar(modelo); } catch (e) {
      if (e.status !== 404) throw e;
      modelo = await probarConexion(); // el modelo guardado ya no existe: se busca otro
      data = await llamar(modelo);
    }
    const cand = data.candidates && data.candidates[0];
    if (!cand) throw new Error(data.promptFeedback?.blockReason ? 'Gemini bloqueó la pregunta (' + data.promptFeedback.blockReason + ').' : 'Gemini no devolvió respuesta.');
    const texto = (cand.content?.parts || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
    if (!texto) throw new Error(cand.finishReason === 'MAX_TOKENS' ? 'La respuesta fue demasiado larga; intenta una pregunta más concreta.' : 'Gemini devolvió una respuesta vacía.');
    return { texto, modelo };
  }

  // ---------- Contexto con los datos del negocio ----------
  const r0 = (x) => (x == null || !isFinite(x) ? null : Math.round(x));
  const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
  function contexto(state) {
    const v = ADI.kpi.analizar(state);
    const g = ADI.ga4.analizar(state.ga4);
    const p = ADI.proy.proyectar(state, { horizonte: 12 });
    const f = ADI.fin.libro(state);
    const pub = ADI.pub.analizar(state);
    const neg = state.negocio;
    const ctx = {
      negocio: {
        nombre: neg.nombre, rubro: 'Servicio de sonido y música para eventos (matrimonios, bautizos, fiestas patronales, carnavales) en Cusco, Perú',
        moneda: 'Soles peruanos (S/)', gastosFijosMensuales: neg.gastosFijosMensuales, detalleGastosFijos: neg.detalleFijos, cuotaBancariaMensual: neg.cuotaBanco,
        interesCuotaPct: neg.interesCuotaPct, tasaImpuestoPct: neg.tasaImpuestoPct,
      },
      paquetes: state.paquetes,
      fechaDeHoy: u.today(),
    };
    if (!v.vacio) {
      ctx.ventas = {
        archivo: state.ventas?.fuente?.archivo, periodo: v.periodoTxt, fechaCorteDatos: v.fechaCorte, mesParcial: v.mesParcial,
        totales: { eventos: v.totales.eventos, ingresos: r0(v.totales.ingresos), costosVariables: r0(v.totales.costos), costosSonEstimados: v.totales.costoEstimado, margen: r0(v.totales.margen), margenPct: r2(v.totales.margenPct), ticketPromedio: r0(v.totales.ticket) },
        porMes: v.porMes.map((m) => ({ mes: m.mes, eventos: m.eventos, ingresos: r0(m.ingresos), margen: r0(m.margen), parcial: m.parcial || undefined, tiposPrincipales: m.catTop })),
        porPaquete: v.porProducto.map((x) => ({ paquete: x.nombre, eventos: x.eventos, ingresos: r0(x.ingresos), precioPromedio: r0(x.precioProm), precioReferencial: x.precioRef, margenUnitario: r0(x.margenUnit) })),
        porLugarTop10: v.porLugar.slice(0, 10).map((x) => ({ lugar: x.nombre, eventos: x.eventos, ingresos: r0(x.ingresos) })),
        porTipoDeEvento: v.porCategoria.map((x) => ({ tipo: x.nombre, eventos: x.eventos, ingresos: r0(x.ingresos) })),
        puntoEquilibrio: v.equilibrio ? { eventosPorMes: r2(v.equilibrio.eventosNecesarios), cargaMensualFijosMasCuota: v.equilibrio.carga, mesesQueNoCubrieron: v.equilibrio.noCubren.map((m) => m.mes) } : null,
        kpis: v.kpis.map((k) => ({ nombre: k.nombre, resultado: k.resultado, formula: k.formula, interpretacion: k.interpretacion, estimado: k.estimado || undefined })),
        kpisNoDisponibles: v.noDisponibles, patrones: v.patrones,
        advertenciasDeCalidad: state.ventas?.validacion?.advertencias?.slice(0, 6),
      };
    } else ctx.ventas = 'No se ha cargado el Excel de ventas.';
    if (!f.vacio) {
      ctx.finanzas = {
        definiciones: 'utilidadEstimada = ingresos − costos variables − gastos fijos y otros gastos. utilidadNeta = utilidadEstimada − intereses − impuestos (solo si se configuraron). efectivo = ingresos − costos − gastos − cuota bancaria completa (capital + interés) − otros pagos.',
        totales: { ingresos: r0(f.totales.ingresos), utilidadEstimada: r0(f.totales.utilidadEstimada), utilidadNeta: r0(f.totales.utilidadNeta), cuotasBancarias: r0(f.totales.cuotas), efectivoDisponibleEstimado: r0(f.totales.efectivoDisponible), publicidadRegistrada: r0(f.totales.publicidad) },
        porMes: f.filas.map((x) => ({ mes: x.mes, ingresos: r0(x.ingresos), utilidadEstimada: r0(x.utilidadEstimada), flujoDeCaja: r0(x.flujo), efectivoAcumulado: r0(x.acumulado) })),
        presupuestoYMetas: state.presupuesto,
        movimientosManuales: (state.movimientos || []).length,
      };
    }
    if (!p.insuficiente) {
      ctx.proyeccion = {
        metodo: p.supuestos, limitaciones: p.limitaciones, recomendaciones: p.recomendaciones,
        cierreMesParcial: p.cierreParcial ? { mes: p.cierreParcial.mes, eventosHastaAhora: p.cierreParcial.actuales, eventosEstimadosAlCierre: r2(p.cierreParcial.estimadoCierre) } : null,
        meses: p.meses.map((m) => ({ mes: m.mes, conservador: { eventos: r2(m.escenarios.conservador.eventos), ingresos: r0(m.escenarios.conservador.ingresos), flujo: r0(m.escenarios.conservador.flujo) }, intermedio: { eventos: r2(m.escenarios.intermedio.eventos), ingresos: r0(m.escenarios.intermedio.ingresos), flujo: r0(m.escenarios.intermedio.flujo) }, optimista: { eventos: r2(m.escenarios.optimista.eventos), ingresos: r0(m.escenarios.optimista.ingresos), flujo: r0(m.escenarios.optimista.flujo) } })),
        resumen12Meses: Object.fromEntries(ADI.proy.ESC.map((e) => [e, { eventos: r0(p.resumen[e].eventos), ingresos: r0(p.resumen[e].ingresos), flujo: r0(p.resumen[e].flujo), mesesConFlujoNegativo: p.resumen[e].negativos, colchonNecesario: r0(p.resumen[e].colchon) }])),
      };
    } else ctx.proyeccion = p.motivo;
    if (!g.vacio) {
      ctx.ga4 = {
        esDemo: g.esDemo, aviso: g.esDemo ? 'DATOS DE DEMOSTRACIÓN: no son datos reales de ADI MUSIC.' : undefined, archivo: state.ga4?.fuente?.archivo,
        total: { usuarios: g.total.usuarios, usuariosNuevos: g.total.usuariosNuevos, sesiones: g.total.sesiones, tasaInteraccion: r2(g.total.tasaInteraccion), eventosClave: g.total.eventosClave, tasaConversion: r2(g.total.tasaConversion), inversion: r0(g.total.inversion), costoPorEventoClave: r2(g.total.cpa) },
        porMes: g.porMes.map((m) => ({ mes: m.mes, usuarios: m.usuarios, sesiones: m.sesiones, eventosClave: m.eventosClave, inversion: r0(m.inversion) })),
        porCanal: g.porCanal.map((c) => ({ canal: c.nombre, descripcion: ADI.ga4.nombreCanal(c.nombre), usuarios: c.usuarios, sesiones: c.sesiones, tasaInteraccion: r2(c.tasaInteraccion), eventosClave: c.eventosClave, tasaConversion: r2(c.tasaConversion) })),
        porCampana: g.porCampana.map((c) => ({ campana: c.nombre, meses: c.meses, inversion: r0(c.inversion), usuarios: c.usuarios, eventosClave: c.eventosClave, costoPorEventoClave: r2(c.cpa) })),
        glosario: ADI.ga4.GLOSARIO,
      };
    } else ctx.ga4 = 'No se ha importado ningún informe de GA4.';
    if (pub.plan.length) ctx.planPublicidad = { supuestos: pub.supuestos, meses: pub.plan.map((x) => ({ mes: x.mes, mesObjetivo: x.objetivo, presupuestoSugerido: x.presupuesto, eventosAdicionalesParaRecuperar: r2(x.recupera), accion: x.accion, riesgoDeCaja: x.riesgo })) };
    const cots = state.cotizaciones || [];
    if (cots.length) ctx.cotizaciones = { total: cots.length, porEstado: Object.fromEntries(Object.entries(u.groupBy(cots, (c) => c.estado)).map(([k, v]) => [k, v.length])) };
    return ctx;
  }

  const REGLAS = `Eres el asistente de análisis de ADI MUSIC AI, una aplicación que ayuda a Yilmar, quien dirige ADI MUSIC (servicio de sonido y música para eventos en Cusco, Perú), a entender los datos del negocio y tomar decisiones.

Reglas obligatorias:
1. Responde en español sencillo, para alguien que no conoce términos técnicos ni financieros. Si usas un término técnico (KPI, tasa de interacción, margen, ROAS, flujo de caja…), explícalo en una frase.
2. Usa SOLO la información del bloque DATOS. Muestra las cifras que sustentan cada conclusión, con su periodo (montos en S/).
3. Separa claramente con subtítulos en negrita: **Hechos** (lo que dicen los datos), **Interpretación** (qué podría significar) y **Recomendación** (acciones concretas y cómo medir si funcionaron). En preguntas muy simples (por ejemplo, qué significa un término) puedes responder directo.
4. Diferencia hechos de hipótesis. Si algo es una suposición, dilo.
5. Si faltan datos para responder, dilo y explica qué información se necesitaría. Nunca inventes cifras, fechas, campañas, clientes ni resultados.
6. No afirmes que una campaña causó un aumento de ventas si los datos solo muestran que coincidieron en el tiempo.
7. Las proyecciones son estimaciones, no resultados garantizados: menciona sus supuestos y limitaciones cuando las uses.
8. No trates como lo mismo ingresos, utilidad estimada, utilidad neta y efectivo disponible. La cuota bancaria incluye capital e intereses: reduce el efectivo, pero solo los intereses son gasto.
9. Si los datos de GA4 son de demostración (ga4.esDemo = true), adviértelo cada vez que los uses.
10. Cuando los costos son estimados por paquete, dilo.
11. Sé breve y claro: máximo unas 250 palabras salvo que pidan más detalle. Usa listas cortas y negritas; evita tablas grandes.
12. Habla solo del negocio y sus datos. Si preguntan otra cosa, redirige con amabilidad.`;

  async function preguntar(pregunta, historial = []) {
    const state = ADI.store.get();
    const system = REGLAS + '\n\nDATOS (JSON):\n' + JSON.stringify(contexto(state));
    const contents = historial.slice(-10).map((m) => ({ role: m.rol === 'user' ? 'user' : 'model', parts: [{ text: m.texto }] }));
    contents.push({ role: 'user', parts: [{ text: pregunta }] });
    return generar({ system, contents, maxTokens: 8192 });
  }

  async function extraerGA4dePDF(base64) {
    if (!disponible()) throw new Error('Para leer un PDF de GA4 se necesita la IA. Configura tu clave de Gemini o exporta el informe como CSV.');
    const prompt = 'Extrae las métricas de las tablas de este informe de Google Analytics 4. Devuelve SOLO JSON con esta forma: {"filas":[{"mes":"AAAA-MM o null","canal":"","fuente":"","campana":"","usuarios":0,"usuariosNuevos":0,"sesiones":0,"sesionesInteraccion":0,"vistas":0,"eventosClave":0,"ingresos":0,"inversion":0}],"notas":"periodo del informe y cualquier aclaración"}. Usa una fila por cada combinación de mes/canal/campaña que aparezca. Si un valor no aparece, pon 0. No sumes filas de totales y no inventes datos.';
    const { texto } = await generar({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }, { text: prompt }] }], json: true, maxTokens: 8192, temperatura: 0 });
    try { return JSON.parse(texto.replace(/^```(json)?/i, '').replace(/```$/, '').trim()); } catch (_) { throw new Error('La IA no devolvió datos legibles del PDF. Prueba con el CSV del informe.'); }
  }

  // ---------- Respuestas locales (sin IA), para cuando no hay clave o no hay internet ----------
  const GLOSARIO = {
    kpi: 'Un **KPI** (indicador clave) es un número que resume cómo va algo importante del negocio, por ejemplo el ticket promedio o el margen.',
    margen: 'El **margen de contribución** es lo que queda de cada venta después de pagar sus costos directos (personal, transporte, equipos). Con ese dinero se pagan los gastos fijos, la cuota del banco y se obtiene ganancia.',
    'punto de equilibrio': 'El **punto de equilibrio** es la cantidad mínima de ventas para no perder dinero: cubre costos, gastos fijos y (en esta app) la cuota del banco.',
    'utilidad neta': 'La **utilidad neta** es la ganancia final después de restar también los intereses de la deuda y los impuestos.',
    utilidad: 'La **utilidad estimada** es ingresos menos costos y gastos del negocio. No es lo mismo que el dinero en caja.',
    'flujo de caja': 'El **flujo de caja** es el dinero que realmente entra y sale en un mes. Incluye pagos que no son gasto, como la parte de capital de la cuota del banco.',
    efectivo: 'El **efectivo disponible** es el dinero que queda después de todos los cobros y pagos, incluida la cuota completa del banco.',
    ticket: 'El **ticket promedio** es cuánto se cobra en promedio por cada venta (ingresos ÷ número de eventos).',
    roas: 'El **ROAS** mide cuántos soles de venta trae cada sol invertido en publicidad. Para calcularlo hay que saber qué ventas vinieron de cada campaña.',
    cac: 'El **CAC** es cuánto cuesta conseguir un cliente nuevo (gasto en publicidad ÷ clientes nuevos).',
    cpa: ADI.ga4.GLOSARIO.cpa,
    rebote: 'La **tasa de rebote** es el porcentaje de visitas en las que la persona se fue sin interactuar. Es lo contrario de la tasa de interacción.',
    'tasa de interaccion': ADI.ga4.GLOSARIO.tasaInteraccion,
    interaccion: ADI.ga4.GLOSARIO.tasaInteraccion,
    sesion: ADI.ga4.GLOSARIO.sesiones,
    usuario: ADI.ga4.GLOSARIO.usuarios,
    'evento clave': ADI.ga4.GLOSARIO.eventosClave,
    conversion: ADI.ga4.GLOSARIO.tasaConversion,
    estacionalidad: 'La **estacionalidad** es cuando las ventas suben o bajan en las mismas épocas del año (por ejemplo carnavales o fiestas patronales).',
    tendencia: 'La **tendencia** indica si, quitando las subidas y bajadas de temporada, las ventas van creciendo o bajando con el tiempo.',
    escenario: 'Un **escenario** es una versión posible del futuro: conservador (si va peor de lo normal), intermedio (normal) y optimista (si va mejor).',
    correlacion: 'La **correlación** mide si dos cosas suben y bajan juntas (de −1 a 1). Que se muevan juntas no prueba que una cause la otra.',
    'ga4': '**Google Analytics 4 (GA4)** es la herramienta gratuita de Google que mide cuántas personas visitan la web o los enlaces del negocio, de dónde vienen y qué hacen.',
  };

  function respuestaLocal(pregunta) {
    const state = ADI.store.get();
    const q = u.norm(pregunta);
    const v = ADI.kpi.analizar(state);
    const g = ADI.ga4.analizar(state.ga4);
    const out = [];
    const sinVentas = 'Primero sube el Excel de ventas en **Ventas y KPI**.';
    const L = (arr) => arr.map((x) => '- ' + x);

    // 1) Definiciones de términos ("¿qué es…?", "¿qué significa…?")
    const termino = Object.keys(GLOSARIO).sort((a, b) => b.length - a.length).find((t) => q.includes(t));
    if (termino && /(que (es|son|significa|quiere decir)|significado|explica|definicion)/.test(q) && !/(resultado|este |estos |mis |mi )/.test(q)) {
      return GLOSARIO[termino];
    }

    // 2) Publicidad, campañas y meses a preparar
    if (/(publicidad|anunci|campana|invertir|inversion|preparar|anticipa)/.test(q)) {
      const pub = ADI.pub.analizar(state);
      const quiere = /(campana|funciono)/.test(q) ? /campa/i
        : /(preparar|anticipa)/.test(q) ? /preparar/i
          : /(cuanto|presupuesto|invertir)/.test(q) ? /presupuesto|gastando/i
            : /(mes|cuando)/.test(q) ? /conviene hacer|preparar/i : /gastando|conviene hacer/i;
      pub.preguntas.filter((x) => quiere.test(x.q)).forEach((x) => out.push(`**${x.q}**`, x.a));
      if (!out.length) pub.preguntas.filter((x) => /publicidad/i.test(x.q)).forEach((x) => out.push(`**${x.q}**`, x.a));
      return out.join('\n');
    }

    // 3) Proyecciones, metas y meses en riesgo
    if (/(proyecc|futuro|proxim|siguiente|pronostic|podria|vendere|voy a vender|faltar|faltaria|meta mensual|meta de venta|supuesto)/.test(q)) {
      const p = ADI.proy.proyectar(state, { horizonte: 6 });
      if (p.insuficiente) return p.motivo;
      out.push('**Hechos (proyección de los próximos 6 meses, escenario intermedio)**', ...L(p.meses.map((m) => `${u.monthLabel(m.mes)}: ~${u.fmtNum(m.escenarios.intermedio.eventos, 1)} eventos, ${u.fmtMoney(m.escenarios.intermedio.ingresos)}, flujo tras cuota ${u.fmtMoney(m.escenarios.intermedio.flujo)}`)));
      const neg = p.resumen.conservador.negativos;
      out.push('**Interpretación**', ...L([
        neg.length ? `Si las ventas van como en el escenario conservador, faltaría dinero en: ${neg.map((m) => u.monthLabel(m).toLowerCase()).join(', ')} (colchón sugerido ${u.fmtMoney(p.resumen.conservador.colchon)}).` : 'Incluso en el escenario conservador no faltaría efectivo.',
        p.equilibrio ? `La meta mínima es de ${Math.ceil(p.equilibrio)} eventos por mes (punto de equilibrio con gastos fijos y cuota).` : null,
      ].filter(Boolean)));
      out.push('**Supuestos**', ...L(p.supuestos.slice(0, 3)), '*Es una estimación para planificar, no un resultado garantizado.*');
      return out.join('\n');
    }

    // 4) Cotizaciones y descuentos
    if (/(cotiza|descuento|precio minimo|margen minimo|rebaj)/.test(q)) {
      if (!state.paquetes.length) return 'Primero carga los paquetes (Excel o Configuración).';
      out.push('**Hechos**', ...L(state.paquetes.filter((p) => p.costo != null).map((p) => `${p.nombre}: precio ${u.fmtMoney(p.precio)}, costo estimado ${u.fmtMoney(p.costo)} → margen ${u.fmtMoney(p.precio - p.costo)} (${u.fmtPct((p.precio - p.costo) / p.precio, 0)})`)));
      if (v.equilibrio) out.push(`- Cada mes se necesitan ~${u.fmtMoney(v.equilibrio.carga)} de margen para cubrir gastos fijos y cuota.`);
      out.push('**Interpretación**', '- Un descuento reduce directamente el margen: un 10 % menos en un SemiPro son unos S/ 365 menos para pagar la cuota.', '- En temporada baja, un evento con descuento puede convenir si de otro modo no habría evento ese día, siempre que el precio siga por encima del costo.');
      out.push('**Recomendación**', '- No aceptar cotizaciones con margen menor al 35 % (la app lo marca en rojo).', '- Probar descuentos pequeños solo en meses flojos y medir cuántas cotizaciones se aceptan con y sin descuento.');
      return out.join('\n');
    }

    // 5) Dinero, cuota, utilidad y gastos
    if (/(dinero|efectivo|caja|banco|cuota|utilidad|ganancia|gano|liquidez|deuda|gasto)/.test(q)) {
      const f = ADI.fin.libro(state);
      if (f.vacio) return sinVentas;
      out.push('**Hechos**', ...L([`Ingresos: ${u.fmtMoney(f.totales.ingresos)}`, `Utilidad estimada (antes de la cuota): ${u.fmtMoney(f.totales.utilidadEstimada)}${f.costoEstimado ? ' (con costos estimados)' : ''}`,
        `Cuotas al banco: ${u.fmtMoney(f.totales.cuotas)}`, `Efectivo disponible estimado: **${u.fmtMoney(f.totales.efectivoDisponible)}**`,
        f.tieneNeta ? `Utilidad neta: ${u.fmtMoney(f.totales.utilidadNeta)}` : 'Utilidad neta: no calculable (falta saber qué parte de la cuota es interés y la tasa de impuestos).',
        state.negocio.gastosFijosMensuales ? `Gastos fijos: ${u.fmtMoney(state.negocio.gastosFijosMensuales)} al mes${state.negocio.detalleFijos ? ` (${state.negocio.detalleFijos})` : ''}` : null,
        v.equilibrio && v.equilibrio.noCubren.length ? `Meses en que el margen no alcanzó para fijos + cuota: ${v.equilibrio.noCubren.map((m) => u.MESES[+m.mes.slice(5) - 1].toLowerCase()).join(', ')}` : null].filter(Boolean)));
      out.push('**Interpretación**', ...L(['La utilidad no es lo mismo que el efectivo: la cuota del banco incluye la devolución del préstamo (capital), que no es gasto pero sí sale de la caja.', 'La cuota se lleva casi toda la utilidad: el negocio vende bien, pero queda poco efectivo.']));
      out.push('**Recomendación**', ...L(['Guardar parte del dinero de los meses buenos para pagar la cuota en los meses bajos.', 'Revisar con el banco si conviene reprogramar la deuda a cuotas más bajas.', 'Medirlo: comparar cada mes el efectivo real con el estimado en Finanzas.']));
      return out.join('\n');
    }

    // 6) GA4: canales, redes, web
    if (/(canal|trafico|visitas|usuarios|tiktok|ga4|analytics|redes|web|resultado)/.test(q)) {
      if (g.vacio) return 'No hay un informe de GA4 importado. Ve a **Analítica GA4** para importarlo o usar los datos de demostración.';
      out.push('**Hechos**' + (g.esDemo ? ' *(datos de demostración)*' : ''), ...L(g.porCanal.map((c) => `${ADI.ga4.nombreCanal(c.nombre)}: ${u.fmtNum(c.usuarios)} usuarios, ${u.fmtNum(c.eventosClave)} contactos (${u.fmtPct(c.tasaConversion)} de las visitas)`)));
      out.push('**Interpretación**', ...L(ADI.ga4.hallazgos(g, v).filter((h) => h.tipo !== 'hecho').map((h) => h.texto)));
      out.push('**Recomendación**', ...L(['Reforzar el canal que mejor convierte (más contactos por visita) y revisar el mensaje del que trae visitas sin contactos.', 'Poner un botón visible de WhatsApp o cotización y medir los eventos clave mes a mes.']));
      return out.join('\n');
    }

    // 7) Meses de más y menos ventas
    if (/(mes|meses|temporada|epoca)/.test(q)) {
      if (v.vacio) return sinVentas;
      const o = [...v.completos].sort((a, b) => b.eventos - a.eventos);
      out.push('**Hechos**', ...L(o.slice(0, 3).map((m) => `${u.monthLabel(m.mes)}: ${m.eventos} eventos, ${u.fmtMoney(m.ingresos)} (de los más altos)`)), ...L(o.slice(-3).map((m) => `${u.monthLabel(m.mes)}: ${m.eventos} eventos, ${u.fmtMoney(m.ingresos)} (de los más bajos)`)));
      out.push('**Interpretación**', '- Las ventas siguen la temporada de fiestas: carnavales en febrero y fiestas patronales y matrimonios a mitad de año.');
      out.push('**Recomendación**', '- Preparar promociones antes de los meses bajos y medir cuántos contratos nuevos llegan en esas semanas.');
      return out.join('\n');
    }

    // 8) Paquetes / productos
    if (/(paquete|producto|basic|semipro|\bpro\b|promover)/.test(q)) {
      if (v.vacio) return sinVentas;
      out.push('**Hechos**', ...L(v.porProducto.map((p) => `${p.nombre}: ${p.eventos} eventos, ${u.fmtMoney(p.ingresos)} (${u.fmtPct(p.pctIngresos, 0)} de los ingresos)${p.margenUnit != null ? `, margen ~${u.fmtMoney(p.margenUnit)} por evento` : ''}`)));
      const pm = v.porProducto.filter((p) => p.margenUnit != null).sort((a, b) => b.margenUnit - a.margenUnit);
      out.push('**Interpretación**', `- ${v.porProducto[0].nombre} es el que más vende${pm.length ? `; ${pm[0].nombre} es el que más margen deja por evento` : ''}.`);
      out.push('**Recomendación**', '- Ofrecer el paquete de mayor margen como mejora ("upgrade") en las cotizaciones y medir cuántos clientes lo aceptan.');
      return out.join('\n');
    }

    // 9) Lugares
    if (/(lugar|localidad|zona|donde|distrito|provincia)/.test(q)) {
      if (v.vacio) return sinVentas;
      out.push('**Hechos**', ...L(v.porLugar.slice(0, 6).map((l) => `${l.nombre}: ${l.eventos} eventos, ${u.fmtMoney(l.ingresos)}`)));
      out.push('**Recomendación**', '- Concentrar la publicidad en las zonas que más compran o probar una zona nueva con poco presupuesto y medir los contactos que llegan de allí.');
      return out.join('\n');
    }

    // 10) Qué mejorar / decisiones
    if (/(mejorar|recomiend|que hago|deberia|consejo|decision|accion|kpi)/.test(q)) {
      if (v.vacio) return sinVentas;
      out.push('**Decisiones que se pueden evaluar según los datos**', ...L(v.decisiones));
      out.push('**Para decidir mejor falta**', ...L(v.infoAdicional));
      return out.join('\n');
    }

    if (/(ticket|promedio)/.test(q) && !v.vacio) return `El ticket promedio es **${u.fmtMoney(v.totales.ticket)}** por evento (${u.fmtMoney(v.totales.ingresos)} ÷ ${v.totales.eventos} eventos).`;

    // Resumen general
    if (!v.vacio) {
      const f = ADI.fin.libro(state);
      out.push('**Resumen del negocio**', ...L([
        `${v.totales.eventos} eventos y ${u.fmtMoney(v.totales.ingresos)} de ingresos en el periodo ${v.periodoTxt}; ticket promedio ${u.fmtMoney(v.totales.ticket)}.`,
        v.totales.margenPct != null ? `Margen de contribución ${u.fmtPct(v.totales.margenPct, 0)}${v.totales.costoEstimado ? ' (costos estimados)' : ''}.` : null,
        v.equilibrio ? `Punto de equilibrio: ${u.fmtNum(v.equilibrio.eventosNecesarios, 1)} eventos por mes; no se alcanzó en ${v.equilibrio.noCubren.length} de ${v.completos.length} meses.` : null,
        !f.vacio ? `Efectivo estimado después de pagar todo: ${u.fmtMoney(f.totales.efectivoDisponible)}.` : null,
        ...v.patrones.slice(0, 2),
      ].filter(Boolean)));
    }
    out.push('Puedo responder sobre: meses de más y menos ventas, paquetes, lugares, canales de GA4, campañas y publicidad, proyecciones, dinero disponible, cotizaciones y qué mejorar. También explico términos: escribe por ejemplo "¿qué significa margen?".');
    return out.join('\n');
  }

  return { disponible, probarConexion, listarModelos, generar, preguntar, extraerGA4dePDF, contexto, respuestaLocal, modeloActual };
})();
