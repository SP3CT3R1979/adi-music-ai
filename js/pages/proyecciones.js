/* Pantalla: Proyecciones futuras (escenarios, supuestos, limitaciones y uso para decidir). */
ADI.pages.proyecciones = (() => {
  const u = ADI.u, ui = ADI.ui;
  let opc = { horizonte: 12, aplicarTendencia: false, escenario: 'intermedio' };
  const NOM = { conservador: 'Conservador', intermedio: 'Intermedio', optimista: 'Optimista' };

  function render(el) {
    const s = ADI.store.get();
    const p = ADI.proy.proyectar(s, opc);
    if (p.insuficiente) {
      el.innerHTML = ui.card('', ui.vacio('Aún no se puede proyectar', u.esc(p.motivo), '<a class="btn btn-primary" href="#/ventas">Ir a Ventas y KPI</a>'));
      return;
    }
    const a = ADI.kpi.analizar(s);
    const e = opc.escenario;
    const R = p.resumen;
    const labFut = p.meses.map((m) => u.monthLabel(m.mes, true));

    el.innerHTML = `<div class="stack">
      ${ui.banner('info', 'Las proyecciones son <b>estimaciones para planificar</b>, calculadas con el historial disponible. No son resultados garantizados. Revisa los supuestos y las limitaciones al final de la página.')}
      ${ui.card('Parámetros', `<div class="filtros">
          <label>Horizonte <select id="p-h">${[3, 6, 12].map((h) => `<option value="${h}" ${h === opc.horizonte ? 'selected' : ''}>${h} meses</option>`).join('')}</select></label>
          <label>Escenario para la tabla <select id="p-e">${ADI.proy.ESC.map((x) => `<option value="${x}" ${x === e ? 'selected' : ''}>${NOM[x]}</option>`).join('')}</select></label>
          <label><input type="checkbox" id="p-t" ${opc.aplicarTendencia ? 'checked' : ''} style="width:auto"> Aplicar tendencia ${p.tendencia && p.tendencia.r2 < 0.3 ? '<span class="muted small">(no hay tendencia clara: R² ' + u.fmtNum(p.tendencia.r2, 2) + ')</span>' : ''}</label>
        </div>
        ${p.cierreParcial ? `<p class="muted small" style="margin:10px 0 0">${u.monthLabel(p.cierreParcial.mes)}: van ${p.cierreParcial.actuales} eventos hasta el día ${p.cierreParcial.dia}; al ritmo esperado cerraría con ~${u.fmtNum(p.cierreParcial.estimadoCierre, 1)} eventos.</p>` : ''}`)}

      <div class="kpis">
        ${ADI.proy.ESC.map((x) => ui.kpi({ titulo: `${NOM[x]}: ventas ${opc.horizonte} meses`, valor: u.fmtMoney(R[x].ingresos), sub: `~${u.fmtNum(R[x].eventos, 0)} eventos`, estado: x === e ? 'ok' : '' })).join('')}
        ${R[e].flujo != null ? ui.kpi({ titulo: `Efectivo al final (${NOM[e].toLowerCase()})`, valor: u.fmtMoney(R[e].saldoFinal), sub: `parte de ${u.fmtMoney(p.saldoInicial)}`, estado: R[e].saldoFinal < 0 ? 'alerta' : 'ok', estimado: true, info: 'Efectivo inicial + flujo de cada mes (ventas − costos − gastos fijos − cuota bancaria)' }) : ''}
        ${R.conservador.flujo != null ? ui.kpi({ titulo: 'Colchón recomendado', valor: u.fmtMoney(R.conservador.colchon), sub: 'para el escenario conservador', estado: R.conservador.colchon > 0 ? 'alerta' : 'ok', info: 'Dinero extra que haría falta para no quedarse sin efectivo si las ventas van como en el escenario conservador' }) : ''}
      </div>

      ${ui.card('Ventas: historial y proyección', '<div class="chart lg"><canvas id="p-c1"></canvas></div>', { sub: 'Barras: ingresos reales (* mes incompleto). Líneas: escenarios proyectados.' })}
      ${R[e].flujo != null ? ui.card('Efectivo acumulado proyectado', '<div class="chart"><canvas id="p-c2"></canvas></div>', { sub: 'Si la línea baja de cero, en ese mes no alcanzaría el dinero para pagar todo (incluida la cuota del banco).' }) : ''}

      ${ui.card(`Detalle mensual — escenario ${NOM[e].toLowerCase()}`, ui.tabla(
        [{ t: 'Mes' }, { t: 'Eventos', num: true }, { t: 'Ingresos', num: true }, { t: 'Costos var.', num: true }, { t: 'Gastos fijos', num: true }, { t: 'Utilidad est.', num: true }, { t: 'Cuota banco', num: true }, { t: 'Flujo', num: true }, { t: 'Efectivo acum.', num: true }],
        p.meses.map((m) => { const x = m.escenarios[e]; return { cls: x.flujo != null && x.flujo < 0 ? 'neg' : '', celdas: [u.monthLabel(m.mes), u.fmtNum(x.eventos, 1), u.fmtMoney(x.ingresos), u.fmtMoney(x.costos), u.fmtMoney(p.fijos), u.fmtMoney(x.utilidad), u.fmtMoney(p.cuota), `<span class="${x.flujo < 0 ? 'negv' : 'pos'}">${u.fmtMoney(x.flujo)}</span>`, u.fmtMoney(x.acumulado)] }; })))}

      <div class="grid g2">
        ${ui.card('¿Cómo usar esta proyección para decidir?', `<ul class="list">${p.recomendaciones.map((r) => `<li>${u.esc(r)}</li>`).join('')}
          <li><b>Presupuestos:</b> usa el escenario conservador para comprometer gastos y el intermedio como meta.</li>
          <li><b>Equipos y personal ("inventario"):</b> en los meses fuertes prevé disponibilidad para más de un evento por día.</li>
          <li><b>Publicidad:</b> ve a <a href="#/publicidad">Publicidad y decisiones</a> para el presupuesto sugerido por mes.</li></ul>`)}
        ${ui.card('Cómo se calculó', `<ul class="list small">${p.supuestos.map((x) => `<li>${u.esc(x)}</li>`).join('')}</ul>
          <h4 style="margin:12px 0 6px">Limitaciones</h4><ul class="list small">${p.limitaciones.map((x) => `<li>${u.esc(x)}</li>`).join('')}</ul>`)}
      </div>
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿Cuánto podría vender en los próximos meses?', '¿En qué meses podría faltarme dinero?', '¿Qué supuestos tiene esta proyección?', '¿Qué meta mensual de ventas me pongo?']))}
    </div>`;

    el.querySelector('#p-h').onchange = (ev) => { opc.horizonte = +ev.target.value; render(el); };
    el.querySelector('#p-e').onchange = (ev) => { opc.escenario = ev.target.value; render(el); };
    el.querySelector('#p-t').onchange = (ev) => { opc.aplicarTendencia = ev.target.checked; render(el); };

    // Historial completo (el mes parcial se marca con *) y proyección a continuación.
    const hist = a.porMes;
    const labels = [...hist.map((m) => u.monthLabel(m.mes, true) + (m.parcial ? '*' : '')), ...labFut];
    const nH = hist.length;
    const fut = (esc) => [...Array(nH).fill(null), ...p.meses.map((m) => m.escenarios[esc].ingresos)];
    ADI.charts.barras(el.querySelector('#p-c1'), {
      labels, moneda: true,
      series: [
        { label: 'Real', data: [...hist.map((m) => m.ingresos), ...p.meses.map(() => null)], color: '#6D28D9' },
        { label: 'Optimista', data: fut('optimista'), tipo: 'line', color: '#059669', punteado: true },
        { label: 'Intermedio', data: fut('intermedio'), tipo: 'line', color: '#F59E0B' },
        { label: 'Conservador', data: fut('conservador'), tipo: 'line', color: '#DC2626', punteado: true },
      ],
    });
    if (R[e].flujo != null) {
      ADI.charts.lineas(el.querySelector('#p-c2'), {
        labels: labFut, moneda: true,
        series: ADI.proy.ESC.map((x, i) => ({ label: NOM[x], data: p.meses.map((m) => m.escenarios[x].acumulado), color: ['#DC2626', '#F59E0B', '#059669'][i], punteado: x !== 'intermedio' }))
          .concat([{ label: 'Cero', data: p.meses.map(() => 0), color: '#9ca3af', punteado: true }]),
      });
    }
  }

  return { render };
})();
