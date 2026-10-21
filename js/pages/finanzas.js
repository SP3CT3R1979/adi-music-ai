/* Pantalla: Finanzas y presupuesto. */
ADI.pages.finanzas = (() => {
  const u = ADI.u, ui = ADI.ui;

  function render(el) {
    const s = ADI.store.get();
    const L = ADI.fin.libro(s);
    if (L.vacio) {
      el.innerHTML = ui.card('', ui.vacio('Sin datos financieros todavía', 'Carga el Excel de ventas o registra movimientos para ver ingresos, utilidad y efectivo disponible.', '<a class="btn btn-primary" href="#/ventas">Ir a Ventas y KPI</a>'));
      return;
    }
    const T = L.totales, neg = s.negocio, pres = s.presupuesto;
    const p = ADI.proy.proyectar(s, { horizonte: 6 });
    const desv = ADI.fin.explicarDesviaciones(L);
    const ref = neg.saldoCajaReferencia;
    const cuadra = ref != null && Math.abs(ref - T.efectivoDisponible) < 1;
    const hayPres = Object.values(pres).some((x) => x);

    el.innerHTML = `<div class="stack">
      <div class="kpis">
        ${ui.kpi({ titulo: 'Ingresos', valor: u.fmtMoney(T.ingresos), sub: 'todo lo vendido', info: 'Ventas del Excel + otros ingresos registrados.' })}
        ${ui.kpi({ titulo: 'Utilidad estimada', valor: u.fmtMoney(T.utilidadEstimada), sub: 'antes de cuota, intereses e impuestos', estimado: L.costoEstimado, info: 'Ingresos − costos variables − gastos fijos − otros gastos.' })}
        ${ui.kpi({ titulo: 'Utilidad neta', valor: L.tieneNeta ? u.fmtMoney(T.utilidadNeta) : 'No calculable', sub: L.tieneNeta ? 'después de intereses e impuestos' : 'falta % de interés de la cuota y tasa de impuestos', info: 'Utilidad estimada − intereses de la deuda − impuestos. Configúralo en Configuración.' })}
        ${ui.kpi({ titulo: 'Cuotas al banco', valor: u.fmtMoney(T.cuotas), sub: `${u.fmtMoney(neg.cuotaBanco)} al mes`, info: 'La cuota incluye capital (devolver el préstamo) e intereses. Reduce el efectivo, pero solo los intereses son gasto.' })}
        ${ui.kpi({ titulo: 'Efectivo disponible estimado', valor: u.fmtMoney(T.efectivoDisponible), sub: 'después de todos los pagos', estado: T.efectivoDisponible < 0 ? 'alerta' : 'ok', estimado: L.costoEstimado, info: 'Saldo inicial + ingresos − costos − gastos − cuotas − otros pagos. Supone que todo se cobró y pagó.' })}
      </div>
      ${ui.banner('info', `<b>No son lo mismo:</b> los <b>ingresos</b> son lo vendido; la <b>utilidad estimada</b> es lo que queda tras costos y gastos; la <b>utilidad neta</b> descuenta además intereses e impuestos; y el <b>efectivo disponible</b> es el dinero que realmente queda tras pagar todo, incluida la parte de capital de la cuota.${ref != null ? ` ${cuadra ? '✔' : '⚠'} El Excel estima un saldo de ${u.fmtMoney(ref)} y la app calcula ${u.fmtMoney(T.efectivoDisponible)}${cuadra ? ': coinciden.' : ' (la diferencia viene de los movimientos o parámetros agregados en la app).'}` : ''}`)}

      ${ui.card('Utilidad, flujo y efectivo por mes', '<div class="chart lg"><canvas id="f-c1"></canvas></div>', { sub: 'Barras: utilidad estimada y flujo de caja del mes. Línea: efectivo acumulado.' })}
      ${ui.card('Detalle mensual', ui.tabla(
        [{ t: 'Mes' }, { t: 'Ingresos', num: true }, { t: 'Costos var.', num: true }, { t: 'Gastos', num: true }, { t: 'Utilidad est.', num: true }, ...(L.tieneNeta ? [{ t: 'Utilidad neta', num: true }] : []), { t: 'Cuota banco', num: true }, { t: 'Otros pagos', num: true }, { t: 'Flujo', num: true }, { t: 'Efectivo acum.', num: true }],
        [...L.filas.map((f) => ({ cls: f.parcial ? 'parcial' : (f.flujo < 0 ? 'neg' : ''), celdas: [u.monthLabel(f.mes) + (f.parcial ? '*' : ''), u.fmtMoney(f.ingresos), u.fmtMoney(f.costos), u.fmtMoney(f.gastos), u.fmtMoney(f.utilidadEstimada), ...(L.tieneNeta ? [u.fmtMoney(f.utilidadNeta)] : []), u.fmtMoney(f.cuota), u.fmtMoney(f.pagos), `<span class="${f.flujo < 0 ? 'negv' : 'pos'}">${u.fmtMoney(f.flujo)}</span>`, u.fmtMoney(f.acumulado)] })),
          { cls: 'total', celdas: ['Total', u.fmtMoney(T.ingresos), u.fmtMoney(T.costos), u.fmtMoney(T.gastos), u.fmtMoney(T.utilidadEstimada), ...(L.tieneNeta ? [u.fmtMoney(T.utilidadNeta)] : []), u.fmtMoney(T.cuotas), u.fmtMoney(T.pagos), u.fmtMoney(T.flujo), u.fmtMoney(T.efectivoDisponible)] }]),
        { sub: `${L.costoEstimado ? 'Costos variables estimados por paquete. ' : ''}* Mes incompleto: igual se cuentan el gasto fijo y la cuota completos.` })}

      <div class="grid g2">
        ${ui.card('Presupuesto y metas mensuales', `<form id="f-pres" class="form">
            <label>Meta de ventas (S/)<input type="number" min="0" step="100" name="metaVentas" value="${pres.metaVentas ?? ''}"></label>
            <label>Meta de eventos<input type="number" min="0" step="1" name="metaEventos" value="${pres.metaEventos ?? ''}"></label>
            <label>Presupuesto de gastos del negocio (S/)<input type="number" min="0" step="100" name="presupuestoGastos" title="Gastos fijos y otros gastos; no incluye los costos de cada evento" value="${pres.presupuestoGastos ?? ''}"></label>
            <label>Presupuesto de publicidad (S/)<input type="number" min="0" step="10" name="presupuestoPublicidad" value="${pres.presupuestoPublicidad ?? ''}"></label>
            <label>Meta de utilidad estimada (S/)<input type="number" min="0" step="100" name="metaGanancia" value="${pres.metaGanancia ?? ''}"></label>
            <div class="row full"><button class="btn btn-primary" type="submit">Guardar</button>${!p.insuficiente ? '<button class="btn" type="button" id="f-sug">Sugerir con la proyección</button>' : ''}</div>
          </form>`, { sub: 'Se comparan con lo real de cada mes.' })}
        ${ui.card('Real vs. presupuesto', hayPres ? `${desv.length ? `<ul class="list">${desv.map((d) => `<li>${u.esc(d)}</li>`).join('')}</ul>` : '<p>Todos los meses cumplen el presupuesto. 🎉</p>'}
            ${ui.tabla([{ t: 'Mes' }, { t: 'Ventas vs meta', num: true }, { t: 'Eventos', num: true }, { t: 'Utilidad vs meta', num: true }], L.filas.map((f) => {
              const d = Object.fromEntries(f.desv.map((x) => [x.concepto, x]));
              const c = (x, fmt) => (x ? `<span class="${x.bien ? 'pos' : 'negv'}">${fmt(x.real)} (${u.fmtDelta(x.pct)})</span>` : '—');
              return [u.monthLabel(f.mes, true) + (f.parcial ? '*' : ''), c(d.Ventas, u.fmtMoney), c(d.Eventos, (x) => u.fmtNum(x)), c(d['Utilidad estimada'], u.fmtMoney)];
            }))}` : '<p class="muted">Define metas a la izquierda para ver las desviaciones de cada mes explicadas.</p>')}
      </div>

      ${!p.insuficiente && p.resumen.conservador.flujo != null ? ui.card('Necesidades financieras (próximos 6 meses)', `<ul class="list">
          <li>Escenario conservador: flujo total ${u.fmtMoney(p.resumen.conservador.flujo)}; ${p.resumen.conservador.negativos.length ? `meses con flujo negativo: <b>${p.resumen.conservador.negativos.map((m) => u.monthLabel(m).toLowerCase()).join(', ')}</b>` : 'ningún mes con flujo negativo'}.</li>
          <li>Colchón recomendado para no quedarse sin efectivo: <b>${u.fmtMoney(p.resumen.conservador.colchon)}</b>.</li>
          <li>Escenario intermedio: efectivo estimado al final ${u.fmtMoney(p.resumen.intermedio.saldoFinal)}.</li>
          <li>Planifica gastos grandes (compra de equipos, reparaciones) para después de los meses fuertes.</li></ul>`) : ''}

      ${ui.card('Movimientos adicionales', `<p class="muted small">Registra aquí lo que no está en el Excel: publicidad, gastos extra, impuestos, retiros personales o compras de equipos. Los <b>pagos</b> reducen el efectivo pero no son gasto (por ejemplo, comprar un equipo es una inversión).</p>
        <form id="f-mov" class="form" style="margin-bottom:14px">
          <label>Fecha<input type="date" name="fecha" required value="${u.today()}"></label>
          <label>Tipo<select name="tipo" id="f-tipo">${Object.entries(ADI.fin.TIPOS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>
          <label>Categoría<select name="categoria" id="f-cat"></select></label>
          <label>Monto (S/)<input type="number" name="monto" min="0" step="0.01" required></label>
          <label class="full">Descripción<input name="descripcion" placeholder="Ej.: anuncio TikTok carnavales"></label>
          <div class="full"><button class="btn btn-primary" type="submit">Agregar movimiento</button></div>
        </form>
        ${ui.tabla(['Fecha', 'Tipo', 'Categoría', 'Descripción', { t: 'Monto', num: true }, ''], [...(s.movimientos || [])].sort((a, b) => b.fecha.localeCompare(a.fecha)).map((m) => [u.fmtDate(m.fecha), ADI.fin.TIPOS[m.tipo], u.esc(m.categoria), u.esc(m.descripcion), u.fmtMoney(m.monto, 2), `<button class="icon-btn" data-del="${m.id}" title="Eliminar">${ui.icon('trash', 'ico ico-xs')}</button>`]), { vacioTxt: 'Aún no hay movimientos adicionales.' })}`)}
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿Cuánto dinero me queda realmente?', '¿Por qué mi utilidad no es igual a mi efectivo?', '¿En qué meses me cuesta pagar la cuota del banco?', '¿Qué gastos debería controlar?']))}
    </div>`;

    // Gráfico
    ADI.charts.barras(el.querySelector('#f-c1'), {
      labels: L.filas.map((f) => u.monthLabel(f.mes, true) + (f.parcial ? '*' : '')), moneda: true,
      series: [
        { label: 'Utilidad estimada', data: L.filas.map((f) => f.utilidadEstimada), color: ADI.charts.C.negro },
        { label: 'Flujo de caja (tras cuota)', data: L.filas.map((f) => f.flujo), color: ADI.charts.C.rojo },
        { label: 'Efectivo acumulado', data: L.filas.map((f) => f.acumulado), tipo: 'line', color: ADI.charts.C.azul },
      ],
    });

    // Presupuesto
    el.querySelector('#f-pres').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      ADI.store.update((x) => { ['metaVentas', 'metaEventos', 'presupuestoGastos', 'presupuestoPublicidad', 'metaGanancia'].forEach((k) => { const v = fd.get(k); x.presupuesto[k] = v === '' ? null : +v; }); });
      ADI.store.log('Presupuesto actualizado');
      u.toast('Presupuesto guardado.', 'ok');
      render(el);
    };
    const sug = el.querySelector('#f-sug');
    if (sug) sug.onclick = () => {
      const f = el.querySelector('#f-pres');
      const inter = p.meses.map((m) => m.escenarios.intermedio);
      f.metaEventos.value = Math.ceil(Math.max(p.equilibrio || 0, u.mean(inter.map((x) => x.eventos))));
      f.metaVentas.value = Math.round(u.mean(inter.map((x) => x.ingresos)) / 100) * 100;
      f.presupuestoPublicidad.value = Math.round(u.mean(inter.map((x) => x.ingresos)) * (neg.pctPublicidad ?? 5) / 100 / 10) * 10;
      f.presupuestoGastos.value = Math.round((p.fijos + +f.presupuestoPublicidad.value) / 100) * 100;
      if (p.costoProm != null) f.metaGanancia.value = Math.round(u.mean(inter.map((x) => x.utilidad)) / 100) * 100;
      u.toast('Valores sugeridos con el escenario intermedio. Revisa y pulsa Guardar.', 'info', 5000);
    };

    // Movimientos
    const tipo = el.querySelector('#f-tipo'), cat = el.querySelector('#f-cat');
    const llenar = () => { cat.innerHTML = ADI.fin.CATEGORIAS[tipo.value].map((c) => `<option>${c}</option>`).join(''); };
    tipo.onchange = llenar; llenar();
    el.querySelector('#f-mov').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const mov = { id: u.uid(), fecha: fd.get('fecha'), tipo: fd.get('tipo'), categoria: fd.get('categoria'), descripcion: String(fd.get('descripcion') || '').trim(), monto: +fd.get('monto') };
      if (!mov.fecha || !(mov.monto > 0)) { u.toast('Completa la fecha y un monto mayor que cero.', 'error'); return; }
      ADI.store.update((x) => { x.movimientos.push(mov); });
      ADI.store.log('Movimiento registrado', `${ADI.fin.TIPOS[mov.tipo]} · ${mov.categoria} · ${u.fmtMoney(mov.monto, 2)}`);
      u.toast('Movimiento agregado.', 'ok');
      render(el);
    };
    el.querySelectorAll('[data-del]').forEach((b) => { b.onclick = () => { if (confirm('¿Eliminar este movimiento?')) { ADI.store.update((x) => { x.movimientos = x.movimientos.filter((m) => m.id !== b.dataset.del); }); render(el); } }; });
  }

  return { render };
})();
