/* Pantalla: Ventas y KPI (importación del Excel, validación, KPI, gráficos, patrones). */
ADI.pages.ventas = (() => {
  const u = ADI.u, ui = ADI.ui;
  let filtro = {};
  let busqueda = '';

  // ---------- Importación ----------
  function selectorArchivo(accept, cb) {
    const inp = document.createElement('input');
    inp.type = 'file'; inp.accept = accept;
    inp.onchange = () => { if (inp.files[0]) cb(inp.files[0]); };
    inp.click();
  }

  function subirExcel() {
    selectorArchivo('.xlsx,.xls,.csv,.ods', async (file) => {
      try { abrirImportacion(await ADI.excel.leerArchivo(file)); } catch (e) { u.toast(e.message || 'No se pudo leer el archivo.', 'error', 6000); }
    });
  }

  // El Excel solo viene incluido en la copia local (no en la versión publicada en internet).
  const hayIncluido = () => !!window.ADI_DATOS_INCLUIDOS?.excelBase64;

  function usarIncluido() {
    const d = window.ADI_DATOS_INCLUIDOS;
    if (!d?.excelBase64) { u.toast('No se encontró el Excel incluido.', 'error'); return; }
    try { abrirImportacion(ADI.excel.leerBuffer(u.base64ToBuf(d.excelBase64), d.excelNombre)); } catch (e) { u.toast(e.message, 'error'); }
  }

  function abrirImportacion(libro) {
    const an = ADI.excel.analizarLibro(libro);
    let hojaIdx = an.hojaVentas ? an.hojaVentas.idx : 0;
    let { filaEncabezado, mapeo } = an.hojaVentas ? { filaEncabezado: an.hojaVentas.filaEncabezado, mapeo: { ...an.hojaVentas.mapeo } } : ADI.excel.encabezadoDeHoja(libro, 0);
    const modal = ui.modal('<div id="imp"></div>', { ancho: '920px' });
    const box = modal.querySelector('#imp');

    function pintar() {
      const headers = ADI.excel.headersDeFila(libro, hojaIdx, filaEncabezado);
      const res = mapeo.fecha != null && mapeo.ingreso != null ? ADI.excel.construirRegistros(libro, hojaIdx, filaEncabezado, mapeo, an.paquetes, an.notas) : null;
      const opt = (sel) => `<option value="">— no usar —</option>` + headers.map((h, i) => `<option value="${i}" ${+sel === i && sel != null ? 'selected' : ''}>${u.esc(h || `(columna ${i + 1})`)}</option>`).join('');
      const p = an.parametros;
      box.innerHTML = `
        <h2>Importar registros: ${u.esc(libro.nombre)}</h2>
        ${an.hojaVentas ? ui.banner('ok', `Se detectó la hoja <b>${u.esc(libro.hojas[hojaIdx].nombre)}</b> con ${an.hojaVentas.filasDatos} filas de ventas. Revisa que cada columna esté bien asignada.`) : ui.banner('warn', 'No se detectó automáticamente una hoja con fechas y montos. Elige la hoja y asigna las columnas.')}
        <div class="form" style="margin-top:14px">
          <label>Hoja<select id="imp-hoja">${libro.hojas.map((h, i) => `<option value="${i}" ${i === hojaIdx ? 'selected' : ''}>${u.esc(h.nombre)}</option>`).join('')}</select></label>
          <label>Fila de encabezados<input id="imp-fila" type="number" min="1" value="${filaEncabezado + 1}"></label>
        </div>
        <h4 style="margin:16px 0 8px">Columnas</h4>
        <div class="form">${ADI.excel.CAMPOS.map((c) => `<label>${c.label}${c.req ? ' *' : ''}<select data-campo="${c.id}">${opt(mapeo[c.id])}</select></label>`).join('')}</div>
        ${an.paquetes.length || p.gastosFijos != null || p.cuotaBanco != null ? `<h4 style="margin:16px 0 8px">También se encontró en el archivo</h4>
          <div class="grid g2">
            <div>${an.paquetes.length ? ui.tabla([{ t: 'Paquete' }, { t: 'Precio', num: true }, { t: 'Costo', num: true }], an.paquetes.map((x) => [u.esc(x.nombre), u.fmtMoney(x.precio), u.fmtMoney(x.costo)])) : '<p class="muted">Sin tabla de paquetes.</p>'}</div>
            <ul class="list small">
              ${p.gastosFijos != null ? `<li>Gastos fijos mensuales: <b>${u.fmtMoney(p.gastosFijos)}</b>${p.detalleFijos ? ` (${u.esc(p.detalleFijos)})` : ''}</li>` : ''}
              ${p.cuotaBanco != null ? `<li>Cuota mensual al banco: <b>${u.fmtMoney(p.cuotaBanco)}</b></li>` : ''}
              ${p.saldoReferencia != null ? `<li>Saldo estimado según el Excel: <b>${u.fmtMoney(p.saldoReferencia)}</b> (se usará para comprobar el cálculo)</li>` : ''}
            </ul>
          </div>` : ''}
        <h4 style="margin:16px 0 8px">Validación</h4>
        ${res ? `${ui.banner(res.validacion.errores.length ? 'warn' : 'ok', `${res.registros.length} registros válidos${res.validacion.errores.length ? ` · ${res.validacion.errores.length} filas con errores` : ''}.`)}${ui.validacion(res.validacion)}
          <h4 style="margin:16px 0 8px">Vista previa</h4>
          ${ui.tabla(['Fecha', 'Código', 'Lugar', 'Tipo', 'Paquete', { t: 'Ingreso', num: true }], res.registros.slice(0, 5).map((r) => [u.fmtDate(r.fecha), u.esc(r.codigo), u.esc(r.lugar), u.esc(r.tipo), u.esc(r.producto), u.fmtMoney(r.ingreso)]))}`
          : ui.banner('error', 'Asigna al menos las columnas <b>Fecha</b> e <b>Ingreso</b>.')}
        <div class="row" style="margin-top:18px"><span class="spacer"></span><button class="btn" data-close>Cancelar</button><button class="btn btn-primary" id="imp-ok" ${res && res.registros.length ? '' : 'disabled'}>${ui.icon('check')} Importar ${res ? res.registros.length : 0} registros</button></div>`;

      box.querySelector('#imp-hoja').onchange = (e) => { hojaIdx = +e.target.value; ({ filaEncabezado, mapeo } = ADI.excel.encabezadoDeHoja(libro, hojaIdx)); pintar(); };
      box.querySelector('#imp-fila').onchange = (e) => { filaEncabezado = Math.max(0, (+e.target.value || 1) - 1); mapeo = ADI.excel.autoMapeo(ADI.excel.headersDeFila(libro, hojaIdx, filaEncabezado)); pintar(); };
      box.querySelectorAll('[data-campo]').forEach((s) => { s.onchange = () => { const v = s.value; if (v === '') delete mapeo[s.dataset.campo]; else mapeo[s.dataset.campo] = +v; pintar(); }; });
      const ok = box.querySelector('#imp-ok');
      if (ok) ok.onclick = () => {
        ADI.store.update((s) => {
          s.ventas = { fuente: { archivo: libro.nombre, hoja: libro.hojas[hojaIdx].nombre, fecha: new Date().toISOString() }, registros: res.registros, validacion: res.validacion, mapeo };
          if (an.paquetes.length) s.paquetes = an.paquetes;
          if (p.gastosFijos != null) { s.negocio.gastosFijosMensuales = p.gastosFijos; if (p.detalleFijos) s.negocio.detalleFijos = p.detalleFijos; }
          if (p.cuotaBanco != null) s.negocio.cuotaBanco = p.cuotaBanco;
          if (p.saldoReferencia != null) s.negocio.saldoCajaReferencia = p.saldoReferencia;
        });
        ADI.store.log('Importación de ventas', `${res.registros.length} registros desde "${libro.nombre}" (hoja ${libro.hojas[hojaIdx].nombre})`);
        u.toast(`Se importaron ${res.registros.length} registros.`, 'ok');
        ui.cerrarModal();
        if (location.hash !== '#/ventas') location.hash = '#/ventas'; else ADI.app.render();
      };
    }
    pintar();
  }

  // ---------- Pantalla ----------
  function render(el) {
    const s = ADI.store.get();
    if (!s.ventas?.registros?.length) {
      el.innerHTML = ui.card('', ui.vacio('Sube los registros de ventas',
        'Carga un Excel (.xlsx, .xls) o CSV con fecha, monto y, si los tienes, producto o paquete, lugar y tipo de venta. La app detecta las columnas, valida los datos y calcula los KPI que sean posibles.',
        `<button class="btn btn-primary" id="v-subir">${ui.icon('upload')} Subir Excel o CSV</button>${hayIncluido() ? '<button class="btn" id="v-incluido">Usar el Excel del negocio incluido</button>' : ''}`));
      el.querySelector('#v-subir').onclick = subirExcel;
      if (hayIncluido()) el.querySelector('#v-incluido').onclick = usarIncluido;
      return;
    }
    const a = ADI.kpi.analizar(s, filtro);
    const todo = ADI.kpi.analizar(s);
    const v = s.ventas;
    const t = a.totales;
    const etiquetas = a.porMes.map((m) => u.monthLabel(m.mes, true) + (m.parcial ? '*' : ''));
    const productos = a.porProducto.map((p) => p.nombre);
    const kpiById = Object.fromEntries(a.kpis.map((k) => [k.id, k]));

    el.innerHTML = `<div class="stack">
      ${ui.card(`Fuente: ${u.esc(v.fuente.archivo)}`, `
        <div class="row">
          <span class="muted small">Hoja "${u.esc(v.fuente.hoja)}" · ${v.registros.length} registros · ${u.fmtDate(todo.registros[0].fecha)} al ${u.fmtDate(todo.fechaCorte)} · cargado ${new Date(v.fuente.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}</span>
          <span class="spacer"></span>
          ${ui.selectorPeriodo(todo.meses, a.desde, a.hasta, 'vp')}
        </div>
        ${ui.validacion(v.validacion)}`, {
        acciones: `<button class="btn btn-sm" id="v-subir">${ui.icon('upload', 'ico ico-xs')} Reemplazar archivo</button>`,
      })}

      <div class="kpis">
        ${ui.kpi({ titulo: 'Ingresos', valor: u.fmtMoney(t.ingresos), sub: a.periodoTxt })}
        ${ui.kpi({ titulo: 'Ventas (eventos)', valor: u.fmtNum(t.eventos), sub: `${a.meses.length} meses` })}
        ${ui.kpi({ titulo: 'Ticket promedio', valor: u.fmtMoney(t.ticket), sub: 'ingreso por evento', info: 'Ingresos totales ÷ número de ventas' })}
        ${t.margen != null ? ui.kpi({ titulo: 'Margen de contribución', valor: u.fmtPct(t.margenPct), sub: u.fmtMoney(t.margen), estimado: t.costoEstimado, info: '(Ingresos − costos variables) ÷ ingresos' }) : ''}
        ${kpiById.equilibrio ? ui.kpi({ titulo: 'Punto de equilibrio', valor: kpiById.equilibrio.resultado, sub: 'fijos + cuota bancaria', estimado: true, info: kpiById.equilibrio.formula }) : ''}
      </div>

      <div class="grid g-2-1">
        ${ui.card('Ingresos por mes y paquete', `<div class="chart lg"><canvas id="c-mes"></canvas></div>${a.mesParcial && a.hasta === a.mesParcial ? `<p class="muted small">* ${u.monthLabel(a.mesParcial)} tiene datos solo hasta el día ${a.diaCorte}.</p>` : ''}`, { sub: 'Barras: ingresos (S/). Línea: número de eventos.' })}
        ${ui.card('Participación por paquete', '<div class="chart lg"><canvas id="c-prod"></canvas></div>')}
      </div>
      <div class="grid g2">
        ${ui.card('Lugares con más ingresos', '<div class="chart"><canvas id="c-lugar"></canvas></div>', { sub: 'Top 10 localidades' })}
        ${ui.card('Tipos de evento', '<div class="chart"><canvas id="c-tipo"></canvas></div>', { sub: 'Agrupados por categoría' })}
      </div>

      ${ui.card('Indicadores (KPI)', `<div class="kpi-list">${a.kpis.map((k) => `
        <div class="kpi-d ${k.estado}">
          <h4>${u.esc(k.nombre)} ${k.estimado ? '<span class="tag tag-amber">estimado</span>' : ''}</h4>
          <div class="res">${u.esc(k.resultado)}</div>
          <div class="formula">Fórmula: ${u.esc(k.formula)}</div>
          <div>${u.esc(k.interpretacion)}</div>
          <div class="per">Periodo: ${u.esc(k.periodo)}</div>
        </div>`).join('')}</div>`, { sub: 'Solo se calculan los indicadores posibles con las columnas disponibles.' })}

      <div class="grid g2">
        ${ui.card('Patrones, aumentos y disminuciones', `<ul class="list">${a.patrones.map((p) => `<li>${u.esc(p)}</li>`).join('') || '<li class="muted">Se necesitan más meses para detectar patrones.</li>'}</ul>`)}
        ${ui.card('KPI que no se pueden calcular todavía', `<ul class="list">${a.noDisponibles.map((n) => `<li><b>${u.esc(n.nombre)}</b>: falta ${u.esc(n.falta)}</li>`).join('')}</ul>`)}
      </div>
      <div class="grid g2">
        ${ui.card('Decisiones que se podrían evaluar', `<ul class="list">${a.decisiones.map((d) => `<li>${u.esc(d)}</li>`).join('')}</ul>`, { sub: 'Son opciones para analizar, no órdenes: cada una debe medirse después.' })}
        ${ui.card('Información adicional que ayudaría', `<ul class="list">${a.infoAdicional.map((d) => `<li>${u.esc(d)}</li>`).join('')}</ul>`)}
      </div>
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿En qué meses vendo más y menos?', '¿Qué paquete me conviene promover?', '¿Qué significa el punto de equilibrio?', '¿Qué decisiones me recomiendas con estos KPI?']))}

      ${ui.card('Registros', `<div class="row" style="margin-bottom:10px"><input id="v-buscar" placeholder="Buscar por lugar, tipo, paquete o código…" value="${u.esc(busqueda)}" style="max-width:360px"><span class="muted small" id="v-cuenta"></span></div><div id="v-tabla"></div>`)}
    </div>`;

    el.querySelector('#v-subir').onclick = subirExcel;
    const cambio = () => { filtro = { desde: el.querySelector('#vp-desde').value, hasta: el.querySelector('#vp-hasta').value }; if (filtro.desde > filtro.hasta) filtro.hasta = filtro.desde; render(el); };
    el.querySelector('#vp-desde').onchange = cambio;
    el.querySelector('#vp-hasta').onchange = cambio;

    // Gráficos
    const C = ADI.charts;
    C.barras(el.querySelector('#c-mes'), {
      labels: etiquetas, moneda: true, apilado: true, ejeDerecho: { moneda: false },
      series: [...productos.map((p) => ({ label: p, data: a.porMes.map((m) => m.porProducto[p]?.ingresos || 0), moneda: true })),
        { label: 'Eventos', data: a.porMes.map((m) => m.eventos), tipo: 'line', ejeDerecho: true, color: ADI.charts.C.ambar, moneda: false }],
    });
    C.dona(el.querySelector('#c-prod'), { labels: productos, data: a.porProducto.map((p) => p.ingresos), moneda: true });
    const top = a.porLugar.slice(0, 10);
    C.barras(el.querySelector('#c-lugar'), { labels: top.map((l) => l.nombre.length > 26 ? l.nombre.slice(0, 25) + '…' : l.nombre), series: [{ label: 'Ingresos', data: top.map((l) => l.ingresos), color: ADI.charts.C.rojo }], moneda: true, horizontal: true });
    const cats = [...a.porCategoria].sort((x, y) => y.eventos - x.eventos);
    C.barras(el.querySelector('#c-tipo'), { labels: cats.map((c) => c.nombre), series: [{ label: 'Eventos', data: cats.map((c) => c.eventos), color: ADI.charts.C.negro }], horizontal: true });

    // Tabla con búsqueda
    const pintarTabla = () => {
      const q = u.norm(busqueda);
      const filas = a.registros.filter((r) => !q || u.norm(`${r.codigo} ${r.lugar} ${r.tipo} ${r.producto} ${r.cliente}`).includes(q));
      el.querySelector('#v-cuenta').textContent = `${filas.length} de ${a.registros.length}`;
      el.querySelector('#v-tabla').innerHTML = ui.tabla(['Fecha', 'Código', 'Lugar', 'Tipo de evento', 'Paquete', { t: 'Ingreso', num: true }, { t: 'Costo', num: true }],
        filas.slice(0, 150).map((r) => { const c = ADI.kpi.costoDe(r, s.paquetes); return [`<span class="nowrap">${u.fmtDate(r.fecha)}</span>`, `<span class="nowrap">${u.esc(r.codigo)}</span>`, u.esc(r.lugar), u.esc(r.tipo), u.esc(r.producto), u.fmtMoney(r.ingreso), c.costo != null ? u.fmtMoney(c.costo) + (c.estimado ? ' <span class="tag tag-amber">est.</span>' : '') : '—']; }));
    };
    const inp = el.querySelector('#v-buscar');
    inp.oninput = () => { busqueda = inp.value; pintarTabla(); };
    pintarTabla();
  }

  return { render, subirExcel, usarIncluido, hayIncluido };
})();
