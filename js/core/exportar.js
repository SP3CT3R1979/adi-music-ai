/* ADIX Music AI — exportación de resultados a Excel y a PDF (impresión de la pantalla actual). */
ADI.exportar = (() => {
  const u = ADI.u;
  const r2 = (x) => (x == null || !isFinite(x) ? null : Math.round(x * 100) / 100);
  const texto = (md) => String(md || '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1$2').replace(/^\s*[-•]\s+/gm, '• ');

  // Crea una hoja a partir de filas; formatos por columna: 'money' | 'pct' | 'num' | 'int'.
  function hoja(filas, formatos = {}, filaInicioDatos = 1) {
    const ws = XLSX.utils.aoa_to_sheet(filas);
    const Z = { money: '"S/" #,##0;[Red]-"S/" #,##0', money2: '"S/" #,##0.00', pct: '0.0%', num: '#,##0.0', int: '#,##0' };
    const rango = XLSX.utils.decode_range(ws['!ref'] || 'A1');
    for (let R = filaInicioDatos; R <= rango.e.r; R++) {
      for (const [c, f] of Object.entries(formatos)) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: +c })];
        if (cell && cell.t === 'n') cell.z = Z[f];
      }
    }
    // Ancho de columnas según el contenido.
    const anchos = [];
    filas.forEach((f) => (f || []).forEach((v, i) => { anchos[i] = Math.max(anchos[i] || 8, Math.min(70, String(v ?? '').length + 2)); }));
    ws['!cols'] = anchos.map((w) => ({ wch: w }));
    return ws;
  }

  function excel() {
    if (!window.XLSX) { u.toast('No se cargó el generador de Excel.', 'error'); return; }
    const s = ADI.store.get();
    const v = ADI.kpi.analizar(s);
    const g = ADI.ga4.analizar(s.ga4);
    const p = ADI.proy.proyectar(s, { horizonte: 12 });
    const L = ADI.fin.libro(s);
    const pub = v.vacio ? null : ADI.pub.analizar(s);
    if (v.vacio && g.vacio) { u.toast('Todavía no hay datos para exportar. Sube el Excel o el informe GA4.', 'error', 5000); return; }

    const wb = XLSX.utils.book_new();
    const add = (nombre, ws) => XLSX.utils.book_append_sheet(wb, ws, nombre.slice(0, 31));
    const ahora = new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

    // 1. Resumen
    const res = [[`${s.negocio.nombre || 'ADIX Music Sonidos'} — Resultados exportados (ADIX Music AI)`], ['Exportado', ahora], []];
    if (!v.vacio) {
      res.push(['Fuente de ventas', s.ventas.fuente?.archivo || '—'], ['Periodo', v.periodoTxt], []);
      res.push(['Indicador', 'Valor', 'Nota']);
      res.push(['Ingresos', r2(v.totales.ingresos), ''], ['Eventos (ventas)', v.totales.eventos, ''], ['Ticket promedio', r2(v.totales.ticket), 'Ingresos ÷ eventos']);
      if (v.totales.costos != null) res.push(['Costos variables', r2(v.totales.costos), v.totales.costoEstimado ? 'Estimados por paquete' : ''], ['Margen de contribución', r2(v.totales.margen), u.fmtPct(v.totales.margenPct)]);
      if (v.equilibrio) res.push(['Punto de equilibrio (eventos/mes)', r2(v.equilibrio.eventosNecesarios), `Gastos fijos + cuota = ${u.fmtMoney(v.equilibrio.carga)}`]);
    }
    if (!L.vacio) res.push(['Utilidad estimada', r2(L.totales.utilidadEstimada), 'Antes de cuota, intereses e impuestos'], ['Cuotas al banco', r2(L.totales.cuotas), ''], ['Efectivo disponible estimado', r2(L.totales.efectivoDisponible), 'Supone que todo se cobró y pagó'], ['Utilidad neta', L.tieneNeta ? r2(L.totales.utilidadNeta) : 'No calculable', L.tieneNeta ? '' : 'Falta % de interés de la cuota y tasa de impuestos']);
    if (!g.vacio) res.push([], ['Informe GA4', s.ga4.fuente?.archivo || '—', g.esDemo ? 'DATOS DE DEMOSTRACIÓN (no son reales)' : '']);
    const wsRes = hoja(res);
    const dinero = ['Ingresos', 'Ticket promedio', 'Costos variables', 'Margen de contribución', 'Utilidad estimada', 'Cuotas al banco', 'Efectivo disponible estimado', 'Utilidad neta'];
    res.forEach((f, i) => { const c = wsRes[XLSX.utils.encode_cell({ r: i, c: 1 })]; if (c && c.t === 'n' && dinero.includes(f[0])) c.z = '"S/" #,##0;[Red]-"S/" #,##0'; });
    add('Resumen', wsRes);

    if (!v.vacio) {
      // 2. KPI
      add('KPI', hoja([['Indicador', 'Resultado', 'Fórmula', 'Periodo', 'Interpretación', '¿Estimado?'],
        ...v.kpis.map((k) => [k.nombre, k.resultado, k.formula, k.periodo, k.interpretacion, k.estimado ? 'Sí' : 'No'])]));
      // 3. Ventas por mes
      add('Ventas por mes', hoja([['Mes', 'Eventos', 'Ingresos', 'Costos variables', 'Margen', 'Crecimiento vs mes anterior', 'Observación'],
        ...v.porMes.map((m) => [u.monthLabel(m.mes), m.eventos, r2(m.ingresos), r2(m.costos), r2(m.margen), m.crecimiento != null ? r2(m.crecimiento) : null, m.parcial ? `Mes parcial (hasta el ${v.diaCorte})` : ''])],
      { 2: 'money', 3: 'money', 4: 'money', 5: 'pct' }));
      // 4. Paquetes, lugares y tipos
      add('Por paquete', hoja([['Paquete', 'Eventos', 'Ingresos', '% de ingresos', 'Precio promedio', 'Precio referencial', 'Costo estimado', 'Margen por evento'],
        ...v.porProducto.map((x) => [x.nombre, x.eventos, r2(x.ingresos), r2(x.pctIngresos), r2(x.precioProm), x.precioRef, x.costoUnit, r2(x.margenUnit)])],
      { 2: 'money', 3: 'pct', 4: 'money', 5: 'money', 6: 'money', 7: 'money' }));
      add('Por lugar', hoja([['Lugar', 'Eventos', 'Ingresos', '% de ingresos'], ...v.porLugar.map((x) => [x.nombre, x.eventos, r2(x.ingresos), r2(x.pctIngresos)])], { 2: 'money', 3: 'pct' }));
      add('Por tipo de evento', hoja([['Categoría', 'Eventos', 'Ingresos', '% de eventos'], ...v.porCategoria.map((x) => [x.nombre, x.eventos, r2(x.ingresos), r2(x.pctEventos)]),
        [], ['Tipo de evento (detalle)', 'Eventos', 'Ingresos'], ...v.porTipo.map((x) => [x.nombre, x.eventos, r2(x.ingresos)])], { 2: 'money', 3: 'pct' }));
      // 5. Hallazgos
      add('Patrones y decisiones', hoja([['Patrones detectados'], ...v.patrones.map((x) => [x]), [], ['Decisiones que se podrían evaluar'], ...v.decisiones.map((x) => [x]),
        [], ['KPI no disponibles', 'Dato que falta'], ...v.noDisponibles.map((x) => [x.nombre, x.falta]), [], ['Información adicional que ayudaría'], ...v.infoAdicional.map((x) => [x])]));
    }

    // 6. Proyección
    if (!p.insuficiente) {
      const E = ADI.proy.ESC;
      add('Proyección', hoja([
        ['Mes', ...E.flatMap((e) => [`Eventos (${e})`, `Ingresos (${e})`, `Flujo tras cuota (${e})`, `Efectivo acumulado (${e})`])],
        ...p.meses.map((m) => [u.monthLabel(m.mes), ...E.flatMap((e) => { const x = m.escenarios[e]; return [r2(x.eventos), r2(x.ingresos), r2(x.flujo), r2(x.acumulado)]; })]),
        [], ['Supuestos'], ...p.supuestos.map((x) => [x]), [], ['Limitaciones'], ...p.limitaciones.map((x) => [x]), [], ['Recomendaciones'], ...p.recomendaciones.map((x) => [x]),
      ], { 1: 'num', 2: 'money', 3: 'money', 4: 'money', 5: 'num', 6: 'money', 7: 'money', 8: 'money', 9: 'num', 10: 'money', 11: 'money', 12: 'money' }));
    }

    // 7. Finanzas
    if (!L.vacio) {
      add('Finanzas', hoja([
        ['Mes', 'Ingresos', 'Costos variables', 'Gastos', 'Utilidad estimada', ...(L.tieneNeta ? ['Utilidad neta'] : []), 'Cuota banco', 'Otros pagos', 'Flujo de caja', 'Efectivo acumulado'],
        ...L.filas.map((f) => [u.monthLabel(f.mes) + (f.parcial ? ' (parcial)' : ''), r2(f.ingresos), r2(f.costos), r2(f.gastos), r2(f.utilidadEstimada), ...(L.tieneNeta ? [r2(f.utilidadNeta)] : []), r2(f.cuota), r2(f.pagos), r2(f.flujo), r2(f.acumulado)]),
        ['Total', r2(L.totales.ingresos), r2(L.totales.costos), r2(L.totales.gastos), r2(L.totales.utilidadEstimada), ...(L.tieneNeta ? [r2(L.totales.utilidadNeta)] : []), r2(L.totales.cuotas), r2(L.totales.pagos), r2(L.totales.flujo), r2(L.totales.efectivoDisponible)],
      ], Object.fromEntries([...Array(10).keys()].slice(1).map((c) => [c, 'money']))));
      if ((s.movimientos || []).length) add('Movimientos', hoja([['Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'], ...s.movimientos.map((m) => [u.fmtDate(m.fecha), ADI.fin.TIPOS[m.tipo], m.categoria, m.descripcion, m.monto])], { 4: 'money2' }));
    }

    // 8. Publicidad
    if (pub) {
      add('Publicidad', hoja([['Pregunta', 'Respuesta'], ...pub.preguntas.map((x) => [x.q, texto(x.a)]),
        [], ['Mes de publicidad', 'Busca eventos de', 'Eventos esperados', 'Presupuesto sugerido', 'Eventos para recuperarlo', 'Acción', 'Caja ajustada'],
        ...pub.plan.map((x) => [u.monthLabel(x.mes), x.objetivo ? u.monthLabel(x.objetivo) : '', r2(x.eventosObjetivo), x.presupuesto, r2(x.recupera), x.accion, x.riesgo ? 'Sí' : 'No']),
        [], ['Supuestos'], ...pub.supuestos.map((x) => [x])]));
    }

    // 9. GA4
    if (!g.vacio) {
      const aviso = g.esDemo ? [['DATOS DE DEMOSTRACIÓN — no son datos reales del negocio'], []] : [];
      add('GA4', hoja([...aviso,
        ['Mes', 'Usuarios', 'Usuarios nuevos', 'Sesiones', 'Tasa de interacción', 'Eventos clave', 'Tasa de conversión', 'Inversión'],
        ...g.porMes.map((m) => [u.monthLabel(m.mes), m.usuarios, m.usuariosNuevos, m.sesiones, r2(m.tasaInteraccion), m.eventosClave, r2(m.tasaConversion), r2(m.inversion)]),
        [], ['Canal', 'Usuarios', 'Sesiones', 'Tasa de interacción', 'Eventos clave', 'Tasa de conversión'],
        ...g.porCanal.map((c) => [c.nombre, c.usuarios, c.sesiones, r2(c.tasaInteraccion), c.eventosClave, r2(c.tasaConversion)]),
        [], ['Campaña', 'Meses', 'Inversión', 'Usuarios', 'Eventos clave', 'Costo por evento clave'],
        ...g.porCampana.map((c) => [c.nombre, c.meses.join(', '), r2(c.inversion), c.usuarios, c.eventosClave, r2(c.cpa)]),
        [], ['Hallazgos'], ...ADI.ga4.hallazgos(g, v).map((h) => [texto(h.texto)]),
      ]));
    }

    // 10. Cotizaciones, registros, validación y consultas
    if ((s.cotizaciones || []).length) {
      add('Cotizaciones', hoja([['N°', 'Fecha', 'Cliente', 'Origen', 'Fecha del evento', 'Lugar', 'Tipo', 'Paquete', 'Total', 'Costo', 'Margen', 'Margen %', 'Estado'],
        ...s.cotizaciones.map((c) => { const t = ADI.pages.cotizaciones.calcular(c); return [c.numero, u.fmtDate(c.fecha), c.cliente, c.origen, c.fechaEvento ? u.fmtDate(c.fechaEvento) : '', c.lugar, c.tipo, c.paquete, r2(t.total), r2(t.costo), r2(t.margen), r2(t.margenPct), c.estado]; })],
      { 8: 'money', 9: 'money', 10: 'money', 11: 'pct' }));
    }
    if (!v.vacio) {
      add('Registros', hoja([['Fecha', 'Código', 'Lugar', 'Tipo de evento', 'Paquete', 'Cliente', 'Ingreso', 'Costo', '¿Costo estimado?'],
        ...ADI.kpi.analizar(s).registros.map((r) => { const c = ADI.kpi.costoDe(r, s.paquetes); return [u.fmtDate(r.fecha), r.codigo, r.lugar, r.tipo, r.producto, r.cliente, r.ingreso, c.costo, c.estimado ? 'Sí' : 'No']; })],
      { 6: 'money', 7: 'money' }));
      const val = s.ventas.validacion;
      if (val) add('Validación de datos', hoja([['Tipo', 'Detalle'], ...val.errores.map((x) => ['Error', x]), ...val.advertencias.map((x) => ['Advertencia', x]), ...val.info.map((x) => ['Observación', x])]));
    }
    if ((s.chat || []).length) add('Consultas al asistente', hoja([['Quién', 'Mensaje', 'Fecha'], ...s.chat.map((m) => [m.rol === 'user' ? 'Pregunta' : (m.modo === 'gemini' ? 'IA (Gemini)' : 'App (modo local)'), texto(m.texto), new Date(m.fecha).toLocaleString('es-PE')])]));

    const nombre = `ADIX-Music-resultados-${u.today()}.xlsx`;
    XLSX.writeFile(wb, nombre);
    ADI.store.log('Resultados exportados a Excel', nombre);
    u.toast(`Se descargó ${nombre}`, 'ok', 5000);
  }

  // Imprime la pantalla actual; desde el diálogo se puede "Guardar como PDF".
  function pdf() {
    const head = document.getElementById('print-head');
    head.innerHTML = `<img src="img/logo-adix-160.jpg" alt="" style="width:28px;height:28px;border-radius:50%;vertical-align:middle;margin-right:8px"><b>ADIX Music Sonidos</b> — ${u.esc(document.getElementById('page-title').textContent)} · ${new Date().toLocaleString('es-PE', { dateStyle: 'long', timeStyle: 'short' })}${ADI.store.get().ga4?.esDemo && location.hash.includes('ga4') ? ' · GA4: datos de demostración' : ''}`;
    document.querySelectorAll('#view details').forEach((d) => { d.open = true; });
    document.body.classList.add('print-page');
    const fin = () => { document.body.classList.remove('print-page'); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => window.print(), 50);
  }

  return { excel, pdf };
})();
