/* ADIX Music AI — asistente con inteligencia artificial (Google Gemini o Claude de Anthropic) y respuestas locales de respaldo. */
ADI.ia = (() => {
  const u = ADI.u;
  const PROVEEDORES = { gemini: 'Google Gemini (gratis)', claude: 'Claude de Anthropic (de pago)' };
  const MODELOS = [
    { id: 'claude-opus-5-5', nombre: 'Claude Opus 5.5 — el más capaz (recomendado)' },
    { id: 'claude-sonnet-5-5', nombre: 'Claude Sonnet 5.5 — más económico' },
    { id: 'claude-haiku-5-5', nombre: 'Claude Haiku 5.5 — el más económico y rápido' },
  ];
  const MODELO_DEFECTO = 'claude-opus-5-5';

  const cfg = () => ADI.store.get().config;
  const proveedor = () => (cfg().proveedorIA === 'claude' ? 'claude' : 'gemini');
  const nombreProveedor = () => (proveedor() === 'claude' ? 'Claude' : 'Gemini');
  const disponible = () => (proveedor() === 'claude' ? !!cfg().claudeKey : !!cfg().geminiKey);
  const modeloActual = () => {
    const c = cfg();
    if (proveedor() === 'claude') return c.claudeModelo || MODELO_DEFECTO;
    return c.geminiModelo && c.geminiModelo !== 'auto' ? c.geminiModelo : (c.modeloDetectado || 'automático');
  };

  // =====================================================================
  // Google Gemini (API gratuita de Google AI Studio)
  // =====================================================================
  const GEMINI = 'https://generativelanguage.googleapis.com/v1beta';

  function errorGemini(status, body) {
    const msg = String((body && body.error && body.error.message) || '').slice(0, 300);
    if (status === 400 && /api key/i.test(msg)) return 'La clave de Gemini no es válida. Revísala en Configuración.';
    if (status === 400 && /location is not supported/i.test(msg)) return 'Google no ofrece la API gratuita de Gemini en tu ubicación.';
    if (status === 400) return 'Gemini rechazó la solicitud: ' + msg;
    if (status === 403) return 'La clave no tiene permiso para usar Gemini. Detalle de Google: ' + msg;
    if (status === 404) return 'Ese modelo de Gemini no está disponible.';
    if (status === 429) return /limit: 0/i.test(msg) ? 'Ese modelo de Gemini no tiene uso gratuito en tu cuenta.' : 'Se alcanzó el límite gratuito de Gemini por ahora. Espera un minuto e intenta de nuevo.';
    if (status >= 500) return 'Gemini no está disponible en este momento. Intenta en unos segundos.';
    return `Error de Gemini (${status}): ${msg}`;
  }

  async function pedir(url, opciones = {}, ms = 90000) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), ms);
    try {
      const r = await fetch(url, { ...opciones, signal: ctrl.signal });
      let body = null;
      try { body = await r.json(); } catch (_) { /* sin cuerpo JSON */ }
      if (!r.ok) { const e = new Error(errorGemini(r.status, body)); e.status = r.status; throw e; }
      return body;
    } catch (e) {
      if (e.name === 'AbortError') throw new Error('Gemini tardó demasiado en responder. Intenta de nuevo.');
      if (e instanceof TypeError) throw new Error('No hay conexión con Gemini (revisa tu internet).');
      throw e;
    } finally { clearTimeout(t); }
  }

  // Orden de preferencia: los alias "latest" de Flash (incluidos en el plan gratuito), luego Flash estable más nuevo,
  // luego Flash-Lite; las versiones preliminares y Pro (que suelen no tener uso gratuito) quedan al final.
  function puntuarModelo(m) {
    const n = m.name.replace('models/', '');
    if (!/gemini/.test(n) || !(m.supportedGenerationMethods || []).includes('generateContent')) return -1;
    if (/(image|tts|audio|live|embedding|vision|robotics|computer|aqa|learnlm|native|thinking-exp)/.test(n)) return -1;
    if (n === 'gemini-flash-latest') return 1000;
    if (n === 'gemini-flash-lite-latest') return 450; // después de los Flash estables, antes de los Flash-Lite con versión
    const v = parseFloat((n.match(/gemini-(\d+(?:\.\d+)?)/) || [])[1] || '0');
    let s = v * 10;
    if (/flash-lite/.test(n)) s += 300; else if (/flash/.test(n)) s += 500; else if (/pro/.test(n)) s += 50;
    if (/(preview|exp)/.test(n)) s -= 250;
    return s;
  }

  async function listarModelosGemini(key) {
    let token = '', todos = [];
    for (let i = 0; i < 4; i++) {
      const data = await pedir(`${GEMINI}/models?pageSize=200${token ? '&pageToken=' + token : ''}`, { headers: { 'x-goog-api-key': key } }, 20000);
      todos = todos.concat(data.models || []);
      token = data.nextPageToken; if (!token) break;
    }
    return todos.map((m) => ({ id: m.name.replace('models/', ''), score: puntuarModelo(m) })).filter((m) => m.score >= 0).sort((a, b) => b.score - a.score).map((m) => m.id);
  }

  async function candidatosGemini() {
    const c = cfg();
    if (c.geminiModelo && c.geminiModelo !== 'auto') return [c.geminiModelo];
    let ids = c.geminiModelos && c.geminiModelos.length ? c.geminiModelos : null;
    if (!ids) {
      ids = await listarModelosGemini(c.geminiKey);
      ADI.store.update((s) => { s.config.geminiModelos = ids.slice(0, 20); });
    }
    if (c.modeloDetectado && ids.includes(c.modeloDetectado)) ids = [c.modeloDetectado, ...ids.filter((x) => x !== c.modeloDetectado)];
    return ids.slice(0, 8);
  }

  // Prueba los modelos en orden y se queda con el primero que responda (si uno no tiene cuota gratuita, pasa al siguiente).
  async function generarGemini({ system, contents, json = false, maxTokens = 16384, temperatura = 0.4 }) {
    const key = cfg().geminiKey;
    if (!key) throw new Error('No hay clave de Gemini configurada.');
    const body = { contents, generationConfig: { temperature: temperatura, maxOutputTokens: maxTokens } };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    if (json) body.generationConfig.responseMimeType = 'application/json';
    const cands = await candidatosGemini();
    if (!cands.length) throw new Error('La clave funciona, pero no hay modelos de texto de Gemini disponibles.');
    let ultimo = null;
    for (const modelo of cands) {
      try {
        const data = await pedir(`${GEMINI}/models/${encodeURIComponent(modelo)}:generateContent`, {
          method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key }, body: JSON.stringify(body),
        });
        if (data.promptFeedback?.blockReason) throw new Error('Gemini bloqueó la pregunta (' + data.promptFeedback.blockReason + ').');
        const cand = data.candidates && data.candidates[0];
        const texto = ((cand && cand.content && cand.content.parts) || []).filter((p) => !p.thought && p.text).map((p) => p.text).join('').trim();
        if (!texto) { ultimo = new Error(cand && cand.finishReason === 'MAX_TOKENS' ? 'La respuesta fue demasiado larga; intenta una pregunta más concreta.' : 'Gemini devolvió una respuesta vacía.'); continue; }
        if (cfg().modeloDetectado !== modelo) ADI.store.update((s) => { s.config.modeloDetectado = modelo; });
        return { texto, modelo };
      } catch (e) {
        ultimo = e;
        if (![404, 429, 500, 503].includes(e.status)) throw e; // clave inválida, sin internet, etc.: no tiene sentido probar otro modelo
      }
    }
    throw ultimo || new Error('No se pudo usar ningún modelo de Gemini.');
  }

  async function probarGemini() {
    ADI.store.update((s) => { s.config.geminiModelos = []; }); // vuelve a consultar la lista de modelos
    const r = await generarGemini({ contents: [{ role: 'user', parts: [{ text: 'Responde solo con la palabra OK.' }] }], maxTokens: 2048, temperatura: 0 });
    return r.modelo;
  }

  // =====================================================================
  // Claude de Anthropic (API de pago, con el SDK oficial)
  // =====================================================================
  function cliente() {
    const key = cfg().claudeKey;
    if (!key) throw new Error('No hay clave de API de Claude configurada.');
    if (!window.Anthropic) throw new Error('No se cargó el SDK de Anthropic.');
    // La app no tiene servidor propio: la llamada sale directamente del navegador con la clave del usuario.
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 120000 });
  }

  function errorClaude(e) {
    const A = window.Anthropic;
    if (!A || !(e instanceof A.AnthropicError)) return e.message || String(e);
    if (e instanceof A.AuthenticationError) return 'La clave de API de Claude no es válida. Revísala en Configuración.';
    if (e instanceof A.PermissionDeniedError) return 'La clave no tiene permiso para usar este modelo de Claude.';
    if (e instanceof A.NotFoundError) return 'El modelo elegido no está disponible para tu cuenta. Prueba con otro en Configuración.';
    if (e instanceof A.RateLimitError) return 'Se alcanzó el límite de uso de Claude por ahora. Espera un minuto e intenta de nuevo.';
    if (e instanceof A.BadRequestError) {
      if (/credit balance/i.test(e.message)) return 'Tu cuenta de la API de Claude no tiene saldo. Recarga créditos en platform.claude.com (Billing).';
      return 'Claude rechazó la solicitud: ' + e.message;
    }
    if (e instanceof A.InternalServerError) return 'Claude está ocupado en este momento. Intenta de nuevo en unos segundos.';
    if (e instanceof A.APIConnectionError) return 'No hay conexión con Claude (revisa tu internet).';
    if (e instanceof A.APIError) {
      if (e.status === 402 || e.type === 'billing_error') return 'Tu cuenta de la API de Claude no tiene saldo. Recarga créditos en platform.claude.com (Billing).';
      return `Error de Claude (${e.status ?? 'sin código'}): ${e.message}`;
    }
    return e.message || String(e);
  }

  // En Opus 5.5 y Sonnet 5.5 se activa el respaldo automático del servidor: si el modelo rechaza una pregunta
  // por seguridad, la API la reintenta con otro modelo adecuado.
  function parametros(modelo, extra) {
    const p = { model: modelo, max_tokens: 64000, output_config: { effort: 'medium' }, ...extra };
    if (/opus|sonnet/.test(modelo)) { p.betas = ['server-side-fallback-2026-07-01']; p.fallbacks = 'default'; }
    return p;
  }
  const sinRespaldo = (p) => { const q = { ...p }; delete q.betas; delete q.fallbacks; return q; };

  async function probarClaude() {
    try {
      const m = await cliente().models.retrieve(cfg().claudeModelo || MODELO_DEFECTO); // no genera texto ni consume tokens
      return m.display_name || m.id;
    } catch (e) { throw new Error(errorClaude(e)); }
  }

  // Envía la conversación a Claude en streaming; onTexto recibe el texto acumulado mientras llega.
  async function generarClaude(params, onTexto) {
    const c = cliente();
    const ejecutar = async (p) => {
      const stream = c.beta.messages.stream(p);
      let texto = '';
      for await (const ev of stream) {
        if (ev.type === 'content_block_delta' && ev.delta.type === 'text_delta') {
          texto += ev.delta.text;
          if (onTexto) onTexto(texto);
        }
      }
      return stream.finalMessage();
    };
    let msg;
    try {
      msg = await ejecutar(params);
    } catch (e) {
      // Si la solicitud es rechazada (por ejemplo, la cuenta no admite el respaldo automático), se repite sin él.
      if (params.fallbacks && window.Anthropic && e instanceof Anthropic.BadRequestError && !/credit balance/i.test(e.message)) {
        try { msg = await ejecutar(sinRespaldo(params)); } catch (e2) { throw new Error(errorClaude(e2)); }
      } else throw new Error(errorClaude(e));
    }
    if (msg.stop_reason === 'refusal') throw new Error('Claude no puede responder esa pregunta. Prueba formulándola de otra manera.');
    const texto = msg.content.filter((b) => b.type === 'text').map((b) => b.text).join('').trim();
    if (!texto) throw new Error(msg.stop_reason === 'max_tokens' ? 'La respuesta fue demasiado larga; intenta una pregunta más concreta.' : 'Claude devolvió una respuesta vacía.');
    return { texto, modelo: msg.model };
  }

  const probarConexion = () => (proveedor() === 'claude' ? probarClaude() : probarGemini());

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
        nombre: neg.nombre, rubro: 'Alquiler de sonido, iluminación, pantallas LED y escenarios para eventos (matrimonios, bautizos, fiestas patronales, carnavales) en Cusco, Perú. Lema: "Hacemos que tu evento suene increíble"',
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
        esDemo: g.esDemo, aviso: g.esDemo ? 'DATOS DE DEMOSTRACIÓN: no son datos reales de ADIX Music.' : undefined, archivo: state.ga4?.fuente?.archivo,
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

  const REGLAS = `Eres el asistente de análisis de ADIX Music AI, una aplicación que ayuda a Yilmar, quien dirige ADIX Music Sonidos (también llamada ADI MUSIC: alquiler de sonido, iluminación, pantallas LED y escenarios para eventos en Cusco, Perú), a entender los datos del negocio y tomar decisiones.

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

  async function preguntar(pregunta, historial = [], onTexto) {
    const state = ADI.store.get();
    const datos = REGLAS + '\n\nDATOS (JSON):\n' + JSON.stringify(contexto(state));
    const previos = historial.slice(-10);
    if (proveedor() === 'gemini') {
      const contents = previos.map((m) => ({ role: m.rol === 'user' ? 'user' : 'model', parts: [{ text: m.texto }] }));
      while (contents.length && contents[0].role !== 'user') contents.shift();
      contents.push({ role: 'user', parts: [{ text: pregunta }] });
      const r = await generarGemini({ system: datos, contents });
      if (onTexto) onTexto(r.texto);
      return r;
    }
    // Claude: reglas + datos en el system prompt, marcado para caché (las preguntas siguientes cuestan menos).
    const system = [{ type: 'text', text: datos, cache_control: { type: 'ephemeral' } }];
    const messages = previos.map((m) => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto }));
    while (messages.length && messages[0].role !== 'user') messages.shift(); // la conversación debe empezar con el usuario
    messages.push({ role: 'user', content: pregunta });
    return generarClaude(parametros(cfg().claudeModelo || MODELO_DEFECTO, { system, messages }), onTexto);
  }

  async function extraerGA4dePDF(base64) {
    if (!disponible()) throw new Error('Para leer un PDF de GA4 se necesita la IA. Configura tu clave en Configuración o exporta el informe como CSV.');
    const prompt = 'Extrae las métricas de las tablas de este informe de Google Analytics 4. Devuelve SOLO JSON con esta forma: {"filas":[{"mes":"AAAA-MM o null","canal":"","fuente":"","campana":"","usuarios":0,"usuariosNuevos":0,"sesiones":0,"sesionesInteraccion":0,"vistas":0,"eventosClave":0,"ingresos":0,"inversion":0}],"notas":"periodo del informe y cualquier aclaración"}. Usa una fila por cada combinación de mes/canal/campaña que aparezca. Si un valor no aparece, pon 0. No sumes filas de totales y no inventes datos.';
    let texto;
    if (proveedor() === 'gemini') {
      ({ texto } = await generarGemini({ contents: [{ role: 'user', parts: [{ inlineData: { mimeType: 'application/pdf', data: base64 } }, { text: prompt }] }], json: true, temperatura: 0 }));
    } else {
      ({ texto } = await generarClaude(parametros(cfg().claudeModelo || MODELO_DEFECTO, {
        messages: [{ role: 'user', content: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }, { type: 'text', text: prompt }] }],
      })));
    }
    const json = texto.slice(texto.indexOf('{'), texto.lastIndexOf('}') + 1);
    try { return JSON.parse(json); } catch (_) { throw new Error('La IA no devolvió datos legibles del PDF. Prueba con el CSV del informe.'); }
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

  return { disponible, probarConexion, preguntar, extraerGA4dePDF, contexto, respuestaLocal, modeloActual, proveedor, nombreProveedor, PROVEEDORES, MODELOS, MODELO_DEFECTO };
})();
