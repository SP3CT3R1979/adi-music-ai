/* Pantalla: Analítica GA4 (importación de informes, métricas, comparación de periodos, hallazgos). */
ADI.pages.ga4 = (() => {
  const u = ADI.u, ui = ADI.ui;
  let comp = {};

  function importar() {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = '.csv,.xlsx,.xls,.pdf';
    inp.onchange = async () => {
      const file = inp.files[0]; if (!file) return;
      const cargando = ui.modal(`<h2>Importando informe</h2><p class="dots">Leyendo ${u.esc(file.name)}</p>`);
      try {
        const res = await ADI.ga4.importarArchivo(file);
        guardar(res);
      } catch (e) {
        cargando.innerHTML = `<h2>No se pudo importar</h2>${ui.banner('error', u.esc(e.message))}<p class="muted small" style="margin-top:10px">Consejo: en GA4 abre el informe, pulsa "Compartir este informe" → "Descargar archivo" → "Descargar CSV".</p><div class="row"><span class="spacer"></span><button class="btn" data-close>Cerrar</button></div>`;
      }
    };
    inp.click();
  }

  function guardar(res) {
    ADI.store.update((s) => { s.ga4 = { fuente: { archivo: res.archivo, tipo: res.tipo, fecha: new Date().toISOString(), nota: res.nota || '' }, esDemo: !!res.esDemo, filas: res.filas, validacion: res.validacion }; });
    ADI.store.log('Importación GA4', `${res.filas.length} filas desde "${res.archivo}"${res.esDemo ? ' (demostración)' : ''}`);
    ui.cerrarModal();
    u.toast(`Informe GA4 importado: ${res.filas.length} filas${res.esDemo ? ' (demostración)' : ''}.`, 'ok');
    comp = {};
    ADI.app.render();
  }

  function render(el) {
    const s = ADI.store.get();
    if (!s.ga4?.filas?.length) {
      el.innerHTML = `<div class="stack">${ui.card('', ui.vacio('Importa un informe de Google Analytics 4',
        'Sube el informe exportado desde GA4 en CSV, Excel o PDF (el PDF lo lee la IA). Mientras no tengas un informe real puedes usar datos de demostración, que siempre se mostrarán marcados como tales.',
        `<button class="btn btn-primary" id="g-imp">${ui.icon('upload')} Importar informe</button><button class="btn" id="g-demo">Usar datos de demostración</button>`))}
        ${ui.card('¿Cómo exportar el informe desde GA4?', `<ol class="list">
          <li>Entra a <b>analytics.google.com</b> y abre la propiedad de ADI MUSIC.</li>
          <li>Ve a <b>Informes → Adquisición → Adquisición de tráfico</b> (o crea una Exploración con las dimensiones <i>Año y mes</i>, <i>Grupo de canales</i> y <i>Campaña</i>).</li>
          <li>Elige el rango de fechas y pulsa <b>Compartir este informe → Descargar archivo → CSV</b>.</li>
          <li>Importa ese archivo aquí. Más adelante se puede conectar la API de GA4 para que se actualice solo.</li></ol>`)}
      </div>`;
      el.querySelector('#g-imp').onclick = importar;
      el.querySelector('#g-demo').onclick = () => { try { guardar(ADI.ga4.cargarDemo()); } catch (e) { u.toast(e.message, 'error'); } };
      return;
    }
    const an = ADI.ga4.analizar(s.ga4);
    const ventas = ADI.kpi.analizar(s);
    const meses = an.meses;
    const tieneMeses = meses.length > 0;
    if (tieneMeses) {
      if (!comp.actual || !meses.includes(comp.actual)) comp.actual = meses[meses.length - 1];
      if (!comp.base || !meses.includes(comp.base)) comp.base = meses[Math.max(0, meses.indexOf(comp.actual) - 1)];
    }
    const A = tieneMeses ? ADI.ga4.periodo(an, comp.actual, comp.actual) : an.total;
    const B = tieneMeses ? ADI.ga4.periodo(an, comp.base, comp.base) : null;
    const dl = (k) => (B && B[k] ? A[k] / B[k] - 1 : null);
    const G = ADI.ga4.GLOSARIO;
    const hall = ADI.ga4.hallazgos(an, ventas);
    const optsMes = (sel) => meses.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${u.monthLabel(m)}</option>`).join('');
    const ultimoParcial = ventas.mesParcial && meses[meses.length - 1] === ventas.mesParcial;

    el.innerHTML = `<div class="stack">
      ${s.ga4.esDemo ? ui.banner('warn', '<b>Datos de demostración.</b> Estas cifras simulan un informe de GA4 para mostrar cómo funciona el módulo; <b>no son datos reales de ADI MUSIC</b>. Importa el informe real cuando esté disponible.') : ''}
      ${ui.card(`Informe: ${u.esc(s.ga4.fuente.archivo)}`, `
        <div class="row"><span class="muted small">${s.ga4.fuente.tipo} · ${s.ga4.filas.length} filas · ${tieneMeses ? `${u.monthLabel(meses[0])} – ${u.monthLabel(meses[meses.length - 1])}` : 'sin desglose por mes'}</span><span class="spacer"></span>
        ${tieneMeses ? `<div class="filtros"><label>Mes <select id="g-a">${optsMes(comp.actual)}</select></label><label>comparar con <select id="g-b">${optsMes(comp.base)}</select></label></div>` : ''}</div>
        ${ui.validacion(s.ga4.validacion)}
        ${ultimoParcial && comp.actual === ventas.mesParcial ? '<p class="muted small" style="margin-top:8px">El último mes puede estar incompleto: compáralo con cuidado.</p>' : ''}`, {
        acciones: `<button class="btn btn-sm" id="g-imp">${ui.icon('upload', 'ico ico-xs')} Importar otro informe</button><button class="btn btn-sm btn-danger" id="g-borrar">${ui.icon('trash', 'ico ico-xs')} Quitar</button>`,
      })}
      <div class="kpis">
        ${ui.kpi({ titulo: 'Usuarios', valor: u.fmtNum(A.usuarios), delta: dl('usuarios'), sub: B ? `vs ${u.fmtNum(B.usuarios)}` : '', info: G.usuarios })}
        ${ui.kpi({ titulo: 'Usuarios nuevos', valor: u.fmtNum(A.usuariosNuevos), delta: dl('usuariosNuevos'), sub: A.pctNuevos != null ? `${u.fmtPct(A.pctNuevos, 0)} del total` : '', info: G.usuariosNuevos })}
        ${ui.kpi({ titulo: 'Sesiones (visitas)', valor: u.fmtNum(A.sesiones), delta: dl('sesiones'), info: G.sesiones })}
        ${ui.kpi({ titulo: 'Tasa de interacción', valor: u.fmtPct(A.tasaInteraccion), delta: dl('tasaInteraccion'), info: G.tasaInteraccion })}
        ${ui.kpi({ titulo: 'Eventos clave (contactos)', valor: u.fmtNum(A.eventosClave), delta: dl('eventosClave'), sub: A.tasaConversion != null ? `${u.fmtPct(A.tasaConversion)} de las visitas` : '', info: G.eventosClave })}
        ${A.inversion ? ui.kpi({ titulo: 'Inversión publicitaria', valor: u.fmtMoney(A.inversion), delta: dl('inversion'), deltaBueno: true, info: G.inversion }) : ui.kpi({ titulo: 'Inversión publicitaria', valor: 'S/ 0', sub: 'sin campañas pagadas este mes', info: G.inversion })}
        ${A.cpa != null ? ui.kpi({ titulo: 'Costo por contacto', valor: u.fmtMoney(A.cpa, 2), delta: dl('cpa'), deltaBueno: B && B.cpa ? A.cpa <= B.cpa : null, info: G.cpa }) : ''}
      </div>
      ${tieneMeses ? `<div class="grid g2">
        ${ui.card('Usuarios y contactos por mes', '<div class="chart"><canvas id="g-c1"></canvas></div>', { sub: 'Línea morada: usuarios. Línea naranja: eventos clave (eje derecho).' })}
        ${ui.card('Contactos de GA4 vs eventos vendidos', '<div class="chart"><canvas id="g-c3"></canvas></div>', { sub: 'Coincidencia en el tiempo: no prueba causa y efecto.' })}
      </div>` : ''}
      <div class="grid g2">
        ${ui.card('Canales: ¿de dónde llegan?', '<div class="chart"><canvas id="g-c2"></canvas></div>')}
        ${ui.card('Hallazgos explicados', `<ul class="insights">${hall.map((h) => `<li><span class="tag ${h.tipo === 'hecho' ? 'tag-violet' : h.tipo === 'interpretacion' ? 'tag-green' : h.tipo === 'aviso' ? 'tag-amber' : 'tag-gray'}">${h.tipo === 'hecho' ? 'Hecho' : h.tipo === 'interpretacion' ? 'Interpretación' : h.tipo === 'aviso' ? 'Aviso' : 'Hipótesis'}</span><div>${u.md(h.texto).replace(/^<p>|<\/p>$/g, '')}</div></li>`).join('')}</ul>`)}
      </div>
      ${ui.card('Detalle por canal', ui.tabla([{ t: 'Canal' }, { t: 'Usuarios', num: true }, { t: 'Sesiones', num: true }, { t: 'Interacción', num: true }, { t: 'Contactos', num: true }, { t: 'Conversión', num: true }],
        an.porCanal.map((c) => [`<b>${u.esc(c.nombre)}</b><div class="muted small">${u.esc(ADI.ga4.nombreCanal(c.nombre))}</div>`, u.fmtNum(c.usuarios), u.fmtNum(c.sesiones), u.fmtPct(c.tasaInteraccion), u.fmtNum(c.eventosClave), u.fmtPct(c.tasaConversion)])))}
      ${an.porCampana.length ? ui.card('Campañas', ui.tabla([{ t: 'Campaña' }, { t: 'Meses' }, { t: 'Inversión', num: true }, { t: 'Usuarios', num: true }, { t: 'Contactos', num: true }, { t: 'Costo por contacto', num: true }],
        an.porCampana.map((c) => [u.esc(c.nombre), c.meses.map((m) => u.monthLabel(m, true)).join(', '), u.fmtMoney(c.inversion), u.fmtNum(c.usuarios), u.fmtNum(c.eventosClave), c.cpa != null ? u.fmtMoney(c.cpa, 2) : '—'])), { sub: 'Ordenadas de menor a mayor costo por contacto. Un contacto no es todavía un contrato.' }) : ''}
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿Qué significa este resultado de GA4?', '¿Qué canal atrae más usuarios?', '¿Qué debería mejorar en mis redes y mi web?', '¿Qué campaña funcionó mejor?', '¿Qué es la tasa de interacción?']))}
    </div>`;

    el.querySelector('#g-imp').onclick = importar;
    el.querySelector('#g-borrar').onclick = () => { if (confirm('¿Quitar el informe GA4 cargado?')) { ADI.store.update((x) => { x.ga4 = null; }); ADI.store.log('GA4 eliminado'); ADI.app.render(); } };
    if (tieneMeses) {
      el.querySelector('#g-a').onchange = (e) => { comp.actual = e.target.value; render(el); };
      el.querySelector('#g-b').onchange = (e) => { comp.base = e.target.value; render(el); };
      const lab = meses.map((m) => u.monthLabel(m, true));
      ADI.charts.lineas(el.querySelector('#g-c1'), { labels: lab, ejeDerecho: { moneda: false },
        series: [{ label: 'Usuarios', data: an.porMes.map((m) => m.usuarios), color: '#6D28D9' }, { label: 'Eventos clave', data: an.porMes.map((m) => m.eventosClave), color: '#F59E0B', ejeDerecho: true }] });
      ADI.charts.barras(el.querySelector('#g-c3'), { labels: lab, ejeDerecho: { moneda: false },
        series: [{ label: 'Eventos vendidos (Excel)', data: meses.map((m) => ventas.vacio ? 0 : (ventas.porMes.find((v) => v.mes === m)?.eventos || 0)), color: '#0EA5A4' },
          { label: 'Contactos GA4', data: an.porMes.map((m) => m.eventosClave), tipo: 'line', color: '#F59E0B', ejeDerecho: true }] });
    }
    ADI.charts.barras(el.querySelector('#g-c2'), { labels: an.porCanal.map((c) => c.nombre), ejeDerecho: { moneda: false },
      series: [{ label: 'Usuarios', data: an.porCanal.map((c) => c.usuarios), color: '#6D28D9' }, { label: 'Contactos', data: an.porCanal.map((c) => c.eventosClave), color: '#F59E0B', ejeDerecho: true }] });
  }

  return { render };
})();
