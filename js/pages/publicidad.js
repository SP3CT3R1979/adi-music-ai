/* Pantalla: Publicidad y decisiones comerciales. */
ADI.pages.publicidad = (() => {
  const u = ADI.u, ui = ADI.ui;
  const TAG = { hecho: ['tag-violet', 'Datos'], recomendacion: ['tag-green', 'Recomendación'], limitacion: ['tag-amber', 'Faltan datos'] };

  function render(el) {
    const s = ADI.store.get();
    if (!s.ventas?.registros?.length) {
      el.innerHTML = ui.card('', ui.vacio('Primero carga las ventas', 'Para recomendar cuándo y cuánto invertir en publicidad, la app necesita el historial de ventas.', '<a class="btn btn-primary" href="#/ventas">Ir a Ventas y KPI</a>'));
      return;
    }
    const r = ADI.pub.analizar(s);
    const neg = s.negocio;
    el.innerHTML = `<div class="stack">
      ${r.ga4.vacio ? ui.banner('info', 'No hay informe de GA4: las respuestas sobre campañas quedarán limitadas. Puedes importarlo en <a href="#/ga4">Analítica GA4</a>.') : r.ga4.esDemo ? ui.banner('warn', 'Las cifras de campañas e inversión provienen de <b>datos GA4 de demostración</b>.') : ''}
      ${ui.card('Supuestos del plan', `<div class="filtros">
          <label>Anticipación de contratación <select id="pb-ant">${[0, 1, 2].map((x) => `<option value="${x}" ${x === (neg.mesesAnticipacion ?? 1) ? 'selected' : ''}>${x} mes(es)</option>`).join('')}</select></label>
          <label>Presupuesto como % de ventas esperadas <select id="pb-pct">${[3, 5, 8, 10].map((x) => `<option value="${x}" ${x === (neg.pctPublicidad ?? 5) ? 'selected' : ''}>${x} %</option>`).join('')}</select></label>
        </div><ul class="list small" style="margin-top:10px">${r.supuestos.map((x) => `<li>${u.esc(x)}</li>`).join('')}</ul>`)}

      <div class="grid g2">
        ${r.preguntas.map((p) => { const [cls, txt] = TAG[p.tipo] || TAG.hecho; return ui.card(u.esc(p.q), `<span class="tag ${cls}">${txt}</span><div class="md" style="margin-top:8px">${u.md(p.a)}</div>`); }).join('')}
      </div>

      ${r.plan.length ? ui.card('Plan de publicidad sugerido (próximos 6 meses)', ui.tabla(
        [{ t: 'Mes de publicidad' }, { t: 'Busca eventos de' }, { t: 'Eventos esperados', num: true }, { t: 'Presupuesto sugerido', num: true }, { t: 'Se recupera con', num: true }, { t: 'Acción' }],
        r.plan.map((x) => ({ cls: x.riesgo ? 'neg' : '', celdas: [u.monthLabel(x.mes), x.objetivo ? u.monthLabel(x.objetivo) : '—', x.eventosObjetivo != null ? u.fmtNum(x.eventosObjetivo, 1) : '—', x.presupuesto != null ? u.fmtMoney(x.presupuesto) : '—', x.recupera != null ? `${u.fmtNum(x.recupera, 1)} evento(s)` : '—', u.esc(x.accion) + (x.riesgo ? ' <span class="tag tag-red">caja ajustada</span>' : '')] }))),
        { sub: 'Filas en rojo: aun en el escenario intermedio, ese mes el efectivo queda ajustado si se invierte el monto sugerido; conviene empezar con menos y medir.' }) : ''}
      ${ui.card('¿Cómo saber si la publicidad funcionó?', `<ol class="list">
        <li>Antes de lanzar una campaña, anota el número de contactos y contratos de las 4 semanas previas.</li>
        <li>Usa un enlace o código distinto por campaña (por ejemplo, un mensaje de WhatsApp con "Vengo de TikTok").</li>
        <li>Pregunta y registra en cada cotización cómo llegó el cliente.</li>
        <li>Compara contratos nuevos y costo por contrato durante la campaña. Si un mes subió pero también era temporada alta, no basta para afirmar que fue la campaña.</li></ol>`)}
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿En qué mes me conviene hacer más publicidad?', '¿Cuánto debería invertir en publicidad el próximo mes?', '¿Qué campaña funcionó mejor?', '¿Qué meses debo preparar con anticipación?']))}
    </div>`;
    el.querySelector('#pb-ant').onchange = (e) => { ADI.store.update((x) => { x.negocio.mesesAnticipacion = +e.target.value; }); render(el); };
    el.querySelector('#pb-pct').onchange = (e) => { ADI.store.update((x) => { x.negocio.pctPublicidad = +e.target.value; }); render(el); };
  }

  return { render };
})();
