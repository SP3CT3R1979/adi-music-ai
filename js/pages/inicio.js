/* Pantalla: Inicio — resumen del negocio. */
ADI.pages.inicio = (() => {
  const u = ADI.u, ui = ADI.ui;

  // Encabezado con el logo y los servicios de la marca.
  const hero = (texto) => `<section class="hero">
      <img src="img/logo-adix.jpg" alt="Logo de ADIX Music Sonidos">
      <div>
        <h2>ADIX Music Sonidos</h2>
        <div class="lema">Hacemos que tu evento suene increíble</div>
        <p>${texto}</p>
        <div class="servicios"><span>Sonido</span><span>Iluminación</span><span>Pantallas LED</span><span>Escenarios</span></div>
      </div>
    </section>`;

  function bienvenida(el, s) {
    const paso = (n, titulo, texto, hecho, botones) => `<div class="card"><div class="row"><span class="tag ${hecho ? 'tag-green' : 'tag-violet'}">${hecho ? '✔ Listo' : 'Paso ' + n}</span></div><h3 style="margin:10px 0 6px">${titulo}</h3><p class="muted">${texto}</p><div class="row">${botones}</div></div>`;
    el.innerHTML = `<div class="stack">
      ${hero('Bienvenido al panel de gestión inteligente: convierte los datos del negocio en información fácil de entender — ventas, KPI, proyecciones, finanzas, publicidad y un asistente con inteligencia artificial.')}
      <div class="grid g3">
        ${paso(1, 'Carga tus ventas', 'Sube el Excel con los contratos y gastos. La app valida los datos y calcula los indicadores.', !!s.ventas?.registros?.length, `<button class="btn btn-primary" id="w-subir">${ui.icon('upload')} Subir Excel</button>${ADI.pages.ventas.hayIncluido() ? '<button class="btn" id="w-incl">Usar el incluido</button>' : ''}`)}
        ${paso(2, 'Importa Google Analytics 4', 'Sube el informe de GA4 (CSV, Excel o PDF) o usa datos de demostración mientras no tengas uno real.', !!s.ga4?.filas?.length, '<a class="btn" href="#/ga4">Ir a Analítica GA4</a>')}
        ${paso(3, 'Activa la IA (opcional)', 'Pega tu clave de API de Claude para que el asistente responda con inteligencia artificial. Sin clave funciona en modo local.', !!s.config.claudeKey, '<a class="btn" href="#/configuracion">Configurar Claude</a>')}
      </div>
    </div>`;
    el.querySelector('#w-subir').onclick = ADI.pages.ventas.subirExcel;
    if (ADI.pages.ventas.hayIncluido()) el.querySelector('#w-incl').onclick = ADI.pages.ventas.usarIncluido;
  }

  function render(el) {
    const s = ADI.store.get();
    if (!s.ventas?.registros?.length) { bienvenida(el, s); return; }
    const a = ADI.kpi.analizar(s);
    const L = ADI.fin.libro(s);
    const g = ADI.ga4.analizar(s.ga4);
    const p = ADI.proy.proyectar(s, { horizonte: 3 });
    const t = a.totales;

    // Lo más importante, en pocas frases.
    const claves = [];
    claves.push(`Entre ${a.periodoTxt.toLowerCase()} se atendieron **${t.eventos} eventos** y se vendieron **${u.fmtMoney(t.ingresos)}**; cada evento deja en promedio ${u.fmtMoney(t.ticket)}.`);
    if (a.equilibrio) claves.push(`Para cubrir gastos fijos y la cuota del banco (${u.fmtMoney(a.equilibrio.carga)} al mes) se necesitan unos **${Math.ceil(a.equilibrio.eventosNecesarios)} eventos por mes**. ${a.equilibrio.noCubren.length ? `No se alcanzó en ${a.equilibrio.noCubren.length} de ${a.completos.length} meses completos.` : 'Se alcanzó en todos los meses completos.'}`);
    if (!L.vacio) claves.push(`Después de pagar todo, el **efectivo estimado** es de **${u.fmtMoney(L.totales.efectivoDisponible)}**: la cuota bancaria (${u.fmtMoney(L.totales.cuotas)}) se lleva la mayor parte de la utilidad.`);
    if (a.patrones[0]) claves.push(a.patrones[0]);
    const hg = ADI.ga4.hallazgos(g, a).find((h) => h.tipo === 'hecho');
    if (hg) claves.push(hg.texto + (g.esDemo ? ' *(GA4 de demostración)*' : ''));

    const alertas = [];
    if (!p.insuficiente && p.resumen.conservador.negativos.length) alertas.push(['warn', `Próximos 3 meses: en el escenario conservador faltaría dinero en ${p.resumen.conservador.negativos.map((m) => u.monthLabel(m).toLowerCase()).join(', ')}. Colchón sugerido: ${u.fmtMoney(p.resumen.conservador.colchon)}.`]);
    const nAdv = (s.ventas.validacion?.advertencias?.length || 0) + (s.ventas.validacion?.errores?.length || 0);
    if (nAdv) alertas.push(['info', `El Excel tiene ${nAdv} observación(es) de calidad de datos (nombres escritos distinto, fechas por verificar…). <a href="#/ventas">Revisar</a>`]);
    if (s.ga4?.esDemo) alertas.push(['warn', 'La analítica GA4 usa <b>datos de demostración</b>. Importa el informe real cuando esté disponible.']);
    if (!s.ga4) alertas.push(['info', 'Aún no hay informe de GA4. <a href="#/ga4">Importarlo o usar la demostración</a>.']);
    if (!s.config.claudeKey) alertas.push(['info', 'El asistente funciona en modo local. <a href="#/configuracion">Agrega tu clave de Claude</a> para respuestas con IA.']);

    el.innerHTML = `<div class="stack">
      ${hero(`Panel de gestión inteligente · datos de ${u.esc(a.periodoTxt.toLowerCase())}`)}
      <div class="kpis">
        ${ui.kpi({ titulo: 'Ingresos', valor: u.fmtMoney(t.ingresos), sub: a.periodoTxt })}
        ${ui.kpi({ titulo: 'Eventos', valor: u.fmtNum(t.eventos), sub: `${u.fmtNum(t.eventos / (a.completos.length + (a.mesParcial ? a.diaCorte / u.daysInMonth(a.mesParcial) : 0)), 1)} por mes` })}
        ${ui.kpi({ titulo: 'Ticket promedio', valor: u.fmtMoney(t.ticket), sub: 'por evento' })}
        ${t.margen != null ? ui.kpi({ titulo: 'Margen de contribución', valor: u.fmtPct(t.margenPct), sub: u.fmtMoney(t.margen), estimado: t.costoEstimado }) : ''}
        ${!L.vacio ? ui.kpi({ titulo: 'Efectivo disponible', valor: u.fmtMoney(L.totales.efectivoDisponible), sub: 'tras gastos y cuotas', estado: L.totales.efectivoDisponible < 0 ? 'alerta' : '', estimado: L.costoEstimado }) : ''}
      </div>
      <div class="grid g-2-1">
        ${ui.card('¿Cada mes alcanza para los pagos fijos?', '<div class="chart lg"><canvas id="i-c1"></canvas></div>', { sub: 'Barras: margen de contribución del mes. Línea: gastos fijos + cuota bancaria.' })}
        ${ui.card('Lo más importante', `<ul class="insights">${claves.map((c) => `<li><div>${u.md(c).replace(/^<p>|<\/p>$/g, '')}</div></li>`).join('')}</ul>`)}
      </div>
      ${alertas.length ? `<div class="stack">${alertas.map(([tp, m]) => ui.banner(tp, m)).join('')}</div>` : ''}
      <div class="grid g2">
        ${!p.insuficiente ? ui.card('Próximos 3 meses (estimado)', ui.tabla([{ t: 'Mes' }, { t: 'Eventos', num: true }, { t: 'Ventas', num: true }, { t: 'Flujo tras cuota', num: true }],
          p.meses.map((m) => { const x = m.escenarios.intermedio; return { cls: x.flujo < 0 ? 'neg' : '', celdas: [u.monthLabel(m.mes), u.fmtNum(x.eventos, 1), u.fmtMoney(x.ingresos), u.fmtMoney(x.flujo)] }; })) + '<p class="muted small" style="margin-top:8px">Escenario intermedio. Detalle y supuestos en <a href="#/proyecciones">Proyecciones</a>.</p>') : ''}
        ${ui.card('Pregúntale a la IA', ui.preguntas(['¿Cómo está mi negocio en resumen?', '¿Qué debería mejorar?', '¿Cuánto dinero me queda realmente?', '¿En qué mes me conviene hacer publicidad?']))}
      </div>
    </div>`;

    const meses = a.porMes;
    ADI.charts.barras(el.querySelector('#i-c1'), {
      labels: meses.map((m) => u.monthLabel(m.mes, true) + (m.parcial ? '*' : '')), moneda: true, apilado: true,
      series: [
        // Dos series apiladas para que la leyenda distinga los meses que cubren los pagos de los que no.
        { label: 'Cubre los pagos', data: meses.map((m) => (!a.equilibrio || (m.margen ?? 0) >= a.equilibrio.carga ? (m.margen ?? m.ingresos) : null)), color: ADI.charts.C.rojo, stack: 'm' },
        ...(a.equilibrio ? [
          { label: 'No alcanza', data: meses.map((m) => ((m.margen ?? 0) < a.equilibrio.carga ? m.margen : null)), color: ADI.charts.C.ambar, stack: 'm' },
          { label: 'Fijos + cuota', data: meses.map(() => a.equilibrio.carga), tipo: 'line', color: ADI.charts.C.negro, punteado: true, stack: 'linea' },
        ] : []),
      ],
    });
  }

  return { render };
})();
