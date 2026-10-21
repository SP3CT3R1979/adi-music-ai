/* ADIX Music AI — cálculo de KPI, patrones y decisiones a partir de los registros de ventas. */
ADI.kpi = (() => {
  const u = ADI.u;
  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

  function categoria(tipo) {
    const t = u.norm(tipo);
    if (!t) return 'Sin tipo';
    if (/matrimonio|boda/.test(t)) return 'Matrimonio';
    if (/bautiz/.test(t)) return 'Bautizo';
    if (/cumplean/.test(t)) return 'Cumpleaños';
    if (/carnaval/.test(t)) return 'Carnavales';
    if (/virgen|senor|santa|\bsan\b|santo|cruz|corpus|patronal|qoyllur|velacuy|pedro/.test(t)) return 'Fiesta religiosa / patronal';
    if (/aniversario|privad|cierre|campana|promocion|fiesta local/.test(t)) return 'Evento privado / aniversario';
    return 'Otro';
  }

  // Costo de una venta: el real si existe; si no, el costo del paquete (estimado).
  function costoDe(r, paquetes) {
    if (r.costoReal != null) return { costo: r.costoReal, estimado: false };
    const p = paquetes.find((x) => x.nombre === r.producto);
    if (p && p.costo != null) return { costo: p.costo * (r.cantidad || 1), estimado: true };
    return { costo: null, estimado: true };
  }

  function agrupar(registros, campo, totalIngresos, totalEventos) {
    const g = u.groupBy(registros.filter((r) => r[campo]), (r) => r[campo]);
    return Object.entries(g).map(([nombre, items]) => {
      const ingresos = u.sum(items.map((i) => i.ingreso));
      return { nombre, eventos: items.length, ingresos, pctIngresos: totalIngresos ? ingresos / totalIngresos : 0, pctEventos: totalEventos ? items.length / totalEventos : 0 };
    }).sort((a, b) => b.ingresos - a.ingresos);
  }

  /**
   * Analiza los registros. opciones: {desde, hasta} en formato 'AAAA-MM' para filtrar el periodo.
   */
  function analizar(state, opciones = {}) {
    const todos = state.ventas?.registros || [];
    const paquetes = state.paquetes || [];
    const neg = state.negocio || {};
    if (!todos.length) return { vacio: true };

    // Corte de datos = última fecha registrada; el mes de corte puede estar incompleto.
    const fechaCorte = todos.reduce((m, r) => (r.fecha > m ? r.fecha : m), todos[0].fecha);
    const mesCorte = u.monthKey(fechaCorte);
    const diaCorte = +fechaCorte.slice(8, 10);
    const mesParcial = diaCorte < u.daysInMonth(mesCorte) ? mesCorte : null;

    const primerMes = u.monthKey(todos.reduce((m, r) => (r.fecha < m ? r.fecha : m), todos[0].fecha));
    const desde = opciones.desde && opciones.desde >= primerMes ? opciones.desde : primerMes;
    const hasta = opciones.hasta && opciones.hasta <= mesCorte ? opciones.hasta : mesCorte;
    const registros = todos.filter((r) => { const m = u.monthKey(r.fecha); return m >= desde && m <= hasta; });
    const meses = u.monthRange(desde, hasta);

    // ---------- Totales ----------
    let costos = 0, hayCosto = false, costoEstimado = false;
    registros.forEach((r) => { const c = costoDe(r, paquetes); if (c.costo != null) { costos += c.costo; hayCosto = true; } if (c.estimado) costoEstimado = true; });
    const ingresos = u.sum(registros.map((r) => r.ingreso));
    const eventos = registros.length;
    const margen = hayCosto ? ingresos - costos : null;
    const tot = { eventos, ingresos, costos: hayCosto ? costos : null, costoEstimado, margen, margenPct: hayCosto && ingresos ? margen / ingresos : null, ticket: eventos ? ingresos / eventos : null };

    // ---------- Por mes ----------
    const productos = [...new Set(registros.map((r) => r.producto).filter(Boolean))];
    const porMes = meses.map((mes) => {
      const items = registros.filter((r) => u.monthKey(r.fecha) === mes);
      let c = 0, hc = false;
      items.forEach((r) => { const x = costoDe(r, paquetes); if (x.costo != null) { c += x.costo; hc = true; } });
      const ing = u.sum(items.map((i) => i.ingreso));
      const porProducto = {};
      productos.forEach((p) => { const it = items.filter((i) => i.producto === p); porProducto[p] = { eventos: it.length, ingresos: u.sum(it.map((i) => i.ingreso)) }; });
      const cats = u.groupBy(items, (i) => categoria(i.tipo));
      const catTop = Object.entries(cats).sort((a, b) => b[1].length - a[1].length).slice(0, 2).map(([k]) => k);
      return { mes, eventos: items.length, ingresos: ing, costos: hc ? c : null, margen: hc ? ing - c : null, parcial: mes === mesParcial, porProducto, catTop };
    });
    const completos = porMes.filter((m) => !m.parcial);
    completos.forEach((m, i) => { const prev = completos[i - 1]; m.crecimiento = prev && prev.ingresos ? (m.ingresos - prev.ingresos) / prev.ingresos : null; });

    // ---------- Por producto, lugar, tipo ----------
    const porProducto = agrupar(registros, 'producto', ingresos, eventos).map((p) => {
      const ref = paquetes.find((x) => x.nombre === p.nombre);
      const unidades = u.sum(registros.filter((r) => r.producto === p.nombre).map((r) => r.cantidad || 1));
      const precioProm = unidades ? p.ingresos / unidades : null;
      const costoUnit = ref?.costo ?? null;
      return { ...p, precioProm, precioRef: ref?.precio ?? null, costoUnit, margenUnit: precioProm != null && costoUnit != null ? precioProm - costoUnit : null };
    });
    const porLugar = agrupar(registros, 'lugar', ingresos, eventos);
    const porTipo = agrupar(registros, 'tipo', ingresos, eventos);
    const porCategoria = agrupar(registros.filter((r) => r.tipo).map((r) => ({ ...r, cat: categoria(r.tipo) })), 'cat', ingresos, eventos);
    const porDiaSemana = DIAS.map((d, i) => ({ nombre: d, eventos: registros.filter((r) => new Date(r.fecha + 'T12:00:00').getDay() === i).length }));

    // ---------- Punto de equilibrio ----------
    const fijos = neg.gastosFijosMensuales || 0;
    const cuota = neg.cuotaBanco || 0;
    let equilibrio = null;
    if ((fijos || cuota) && tot.margen != null && eventos) {
      const margenProm = tot.margen / eventos;
      const carga = fijos + cuota;
      const cubren = completos.filter((m) => m.margen != null && m.margen >= carga);
      const noCubren = completos.filter((m) => m.margen != null && m.margen < carga);
      equilibrio = { fijos, cuota, carga, margenProm, eventosNecesarios: carga / margenProm, ingresosNecesarios: (carga / margenProm) * (tot.ticket || 0), cubren, noCubren };
    }

    // ---------- KPI ----------
    const periodoTxt = `${u.monthLabel(desde)} – ${u.monthLabel(hasta)}${mesParcial && hasta === mesParcial ? ` (hasta el ${diaCorte})` : ''}`;
    const kpis = [];
    const add = (k) => kpis.push({ periodo: periodoTxt, estado: 'info', estimado: false, ...k });

    add({ id: 'ingresos', nombre: 'Ingresos totales', formula: 'Σ ingresos de cada venta', valor: ingresos, resultado: u.fmtMoney(ingresos),
      interpretacion: `En el periodo se facturaron ${u.fmtMoney(ingresos)} en ${eventos} ventas.` });
    add({ id: 'eventos', nombre: 'Número de ventas (eventos)', formula: 'Cantidad de registros de venta', valor: eventos, resultado: u.fmtNum(eventos),
      interpretacion: `Se atendieron ${eventos} eventos en ${meses.length} mes(es).` });
    if (tot.ticket != null) add({ id: 'ticket', nombre: 'Ticket promedio', formula: 'Ingresos totales ÷ número de ventas', valor: tot.ticket, resultado: u.fmtMoney(tot.ticket),
      interpretacion: `Cada evento deja en promedio ${u.fmtMoney(tot.ticket)} de ingreso.` });
    if (completos.length) {
      const promIng = u.mean(completos.map((m) => m.ingresos)); const promEv = u.mean(completos.map((m) => m.eventos));
      add({ id: 'promMensual', nombre: 'Ingreso promedio mensual', formula: 'Ingresos de meses completos ÷ número de meses completos', valor: promIng, resultado: u.fmtMoney(promIng),
        interpretacion: `Un mes típico deja ${u.fmtMoney(promIng)} con unos ${u.fmtNum(promEv, 1)} eventos${mesParcial ? ' (se excluye el mes parcial)' : ''}.` });
    }
    const ult = completos[completos.length - 1];
    if (ult && ult.crecimiento != null) {
      const prev = completos[completos.length - 2];
      add({ id: 'crecimiento', nombre: 'Crecimiento del último mes completo', formula: '(Ingresos del mes − ingresos del mes anterior) ÷ ingresos del mes anterior', valor: ult.crecimiento, resultado: u.fmtDelta(ult.crecimiento),
        estado: ult.crecimiento >= 0 ? 'ok' : 'alerta',
        interpretacion: `${u.monthLabel(ult.mes)} (${u.fmtMoney(ult.ingresos)}) frente a ${u.monthLabel(prev.mes).toLowerCase()} (${u.fmtMoney(prev.ingresos)}).` });
    }
    const lr = u.linreg(completos.map((m) => m.ingresos));
    if (lr) {
      const clara = lr.r2 >= 0.3;
      add({ id: 'tendencia', nombre: 'Tendencia de ventas', formula: 'Pendiente de la recta de tendencia (regresión lineal) de los ingresos mensuales; R² mide qué tan clara es', valor: lr.slope,
        resultado: `${lr.slope >= 0 ? '+' : '−'}${u.fmtMoney(Math.abs(lr.slope))}/mes (R² ${u.fmtNum(lr.r2, 2)})`, estado: clara ? (lr.slope >= 0 ? 'ok' : 'alerta') : 'info',
        interpretacion: clara ? `Las ventas ${lr.slope >= 0 ? 'crecen' : 'bajan'} en promedio ${u.fmtMoney(Math.abs(lr.slope))} por mes.` : 'No hay una tendencia clara: las ventas suben y bajan según la temporada más que por una tendencia de fondo.' });
    }
    if (porProducto.length) {
      const p = porProducto[0];
      add({ id: 'productoTop', nombre: 'Producto que más vende', formula: 'Ingresos del producto ÷ ingresos totales', valor: p.pctIngresos, resultado: `${p.nombre}: ${u.fmtPct(p.pctIngresos)}`,
        interpretacion: `${p.nombre} genera ${u.fmtMoney(p.ingresos)} (${u.fmtPct(p.pctIngresos)} de los ingresos) con ${p.eventos} eventos.` });
      porProducto.filter((x) => x.precioRef).forEach((x) => {
        const dif = x.precioProm / x.precioRef - 1;
        add({ id: 'precio-' + x.nombre, nombre: `Precio cobrado vs referencial (${x.nombre})`, formula: 'Precio promedio cobrado ÷ precio referencial − 1', valor: dif, resultado: u.fmtDelta(dif),
          estado: dif < -0.02 ? 'alerta' : 'info',
          interpretacion: `En promedio se cobró ${u.fmtMoney(x.precioProm)} frente a ${u.fmtMoney(x.precioRef)} de referencia${dif < -0.02 ? ': se está dando descuento.' : '.'}` });
      });
    }
    if (porLugar.length) {
      const top3 = porLugar.slice(0, 3); const pct = u.sum(top3.map((l) => l.pctIngresos));
      add({ id: 'lugarTop', nombre: 'Lugares con más ingresos', formula: 'Ingresos de los 3 primeros lugares ÷ ingresos totales', valor: pct, resultado: `Top 3: ${u.fmtPct(pct)}`,
        interpretacion: `${top3.map((l) => `${l.nombre} (${u.fmtMoney(l.ingresos)})`).join(', ')} concentran ${u.fmtPct(pct)} de los ingresos.` });
    }
    if (porCategoria.length) {
      const c = [...porCategoria].sort((a, b) => b.eventos - a.eventos)[0];
      add({ id: 'tipoTop', nombre: 'Tipo de evento más frecuente', formula: 'Eventos del tipo ÷ total de eventos', valor: c.pctEventos, resultado: `${c.nombre}: ${u.fmtPct(c.pctEventos)}`,
        interpretacion: `${c.nombre} suma ${c.eventos} eventos y ${u.fmtMoney(c.ingresos)}.` });
    }
    if (tot.costos != null) {
      add({ id: 'costos', nombre: tot.costoEstimado ? 'Costos variables (estimados)' : 'Costos variables', formula: tot.costoEstimado ? 'Σ (costo estimado del paquete × ventas)' : 'Σ costos registrados', valor: tot.costos, resultado: u.fmtMoney(tot.costos), estimado: tot.costoEstimado,
        interpretacion: tot.costoEstimado ? 'Son costos estimados por paquete, no gastos reales registrados evento por evento.' : 'Costos registrados en el archivo.' });
      add({ id: 'margen', nombre: 'Margen de contribución', formula: '(Ingresos − costos variables) ÷ ingresos', valor: tot.margenPct, resultado: `${u.fmtMoney(tot.margen)} (${u.fmtPct(tot.margenPct)})`, estimado: tot.costoEstimado,
        estado: tot.margenPct >= 0.4 ? 'ok' : 'alerta',
        interpretacion: `De cada S/ 100 vendidos quedan unos S/ ${u.fmtNum(tot.margenPct * 100)} para pagar gastos fijos, la cuota del banco y dejar ganancia.` });
    }
    if (equilibrio) {
      const mesesN = completos.length;
      add({ id: 'equilibrio', nombre: 'Punto de equilibrio mensual', formula: '(Gastos fijos + cuota bancaria) ÷ margen promedio por evento', valor: equilibrio.eventosNecesarios,
        resultado: `${u.fmtNum(equilibrio.eventosNecesarios, 1)} eventos/mes`, estimado: tot.costoEstimado,
        interpretacion: `Para cubrir ${u.fmtMoney(equilibrio.carga)} al mes (fijos ${u.fmtMoney(fijos)} + cuota ${u.fmtMoney(cuota)}) se necesitan unos ${Math.ceil(equilibrio.eventosNecesarios)} eventos, es decir ~${u.fmtMoney(equilibrio.ingresosNecesarios)} de ventas.` });
      add({ id: 'mesesCubren', nombre: 'Meses que cubrieron fijos y cuota', formula: 'Meses completos con margen ≥ gastos fijos + cuota', valor: equilibrio.cubren.length / (mesesN || 1),
        resultado: `${equilibrio.cubren.length} de ${mesesN}`, estado: equilibrio.noCubren.length > equilibrio.cubren.length ? 'alerta' : (equilibrio.noCubren.length ? 'info' : 'ok'), estimado: tot.costoEstimado,
        interpretacion: equilibrio.noCubren.length ? `No alcanzaron: ${equilibrio.noCubren.map((m) => u.MESES[+m.mes.slice(5) - 1].toLowerCase()).join(', ')}. En esos meses la cuota se paga con lo ahorrado en meses buenos.` : 'Todos los meses completos cubrieron fijos y cuota.' });
    }
    if (completos.length >= 2) {
      const orden = [...completos].sort((a, b) => b.ingresos - a.ingresos);
      const hi = orden[0], lo = orden[orden.length - 1];
      add({ id: 'mesPico', nombre: 'Mes con más y con menos ventas', formula: 'Mes completo con mayores y menores ingresos', valor: hi.ingresos,
        resultado: `${u.MESES_C[+hi.mes.slice(5) - 1]} / ${u.MESES_C[+lo.mes.slice(5) - 1]}`,
        interpretacion: `Más alto: ${u.monthLabel(hi.mes).toLowerCase()} con ${u.fmtMoney(hi.ingresos)} (${hi.eventos} eventos). Más bajo: ${u.monthLabel(lo.mes).toLowerCase()} con ${u.fmtMoney(lo.ingresos)} (${lo.eventos} eventos).` });
    }
    const pres = state.presupuesto || {};
    if (pres.metaVentas && completos.length) {
      const cumpl = completos.filter((m) => m.ingresos >= pres.metaVentas).length;
      add({ id: 'meta', nombre: 'Cumplimiento de la meta mensual de ventas', formula: 'Meses con ingresos ≥ meta ÷ meses completos', valor: cumpl / completos.length,
        resultado: `${cumpl} de ${completos.length} meses`, estado: cumpl / completos.length >= 0.5 ? 'ok' : 'alerta',
        interpretacion: `La meta es ${u.fmtMoney(pres.metaVentas)} al mes; se alcanzó en ${cumpl} mes(es).` });
    }
    const cots = state.cotizaciones || [];
    const decididas = cots.filter((c) => c.estado === 'Aceptada' || c.estado === 'Rechazada');
    if (decididas.length) {
      const acc = decididas.filter((c) => c.estado === 'Aceptada').length;
      add({ id: 'conversionCot', nombre: 'Tasa de cierre de cotizaciones', formula: 'Cotizaciones aceptadas ÷ cotizaciones respondidas', valor: acc / decididas.length, resultado: u.fmtPct(acc / decididas.length),
        interpretacion: `${acc} de ${decididas.length} cotizaciones respondidas se convirtieron en contrato.` });
    }

    // ---------- Lo que no se puede calcular ----------
    const noDisponibles = [];
    if (!registros.some((r) => r.costoReal != null)) noDisponibles.push({ nombre: 'Margen real por evento', falta: 'el costo real de cada evento (personal, transporte, combustible, alquileres).' });
    if (!registros.some((r) => r.cliente)) noDisponibles.push({ nombre: 'Clientes recurrentes y fidelización', falta: 'el nombre o teléfono del cliente en cada venta.' });
    noDisponibles.push({ nombre: 'Retorno de la publicidad (ROAS) y costo por cliente (CAC)', falta: 'la inversión publicitaria por mes y por qué medio llegó cada cliente (TikTok, recomendación, Facebook…).' });
    if (!pres.metaVentas) noDisponibles.push({ nombre: 'Cumplimiento de metas', falta: 'metas de ventas mensuales (puedes definirlas en Finanzas).' });
    if (!decididas.length) noDisponibles.push({ nombre: 'Tasa de cierre de cotizaciones', falta: 'cotizaciones registradas con su resultado (módulo Cotizaciones).' });
    noDisponibles.push({ nombre: 'Cobranza pendiente', falta: 'el estado de pago de cada contrato (adelanto, saldo, pagado).' });
    if (neg.interesCuotaPct == null || neg.tasaImpuestoPct == null) noDisponibles.push({ nombre: 'Utilidad neta', falta: 'qué parte de la cuota bancaria es interés y la tasa de impuestos (Configuración).' });

    // ---------- Patrones ----------
    const patrones = [];
    if (completos.length >= 3) {
      const orden = [...completos].sort((a, b) => b.eventos - a.eventos);
      const tercio = Math.max(1, Math.round(completos.length / 3));
      const altos = orden.slice(0, tercio).map((m) => u.MESES[+m.mes.slice(5) - 1].toLowerCase());
      const bajos = orden.slice(-tercio).map((m) => u.MESES[+m.mes.slice(5) - 1].toLowerCase());
      patrones.push(`Meses con más eventos: ${altos.join(', ')}. Meses con menos: ${bajos.join(', ')}.`);
    }
    completos.forEach((m) => {
      if (m.crecimiento != null && Math.abs(m.crecimiento) >= 0.4) {
        patrones.push(`${u.monthLabel(m.mes)}: ${m.crecimiento > 0 ? 'subió' : 'bajó'} ${u.fmtPct(Math.abs(m.crecimiento), 0)} frente al mes anterior${m.catTop.length ? ` (predominan: ${m.catTop.join(', ').toLowerCase()})` : ''}.`);
      }
    });
    if (porProducto.length > 1) {
      const p = porProducto[0];
      patrones.push(`${p.nombre} concentra ${u.fmtPct(p.pctIngresos, 0)} de los ingresos y ${u.fmtPct(p.pctEventos, 0)} de los eventos.`);
    }
    const rel = porCategoria.find((c) => c.nombre === 'Fiesta religiosa / patronal');
    if (rel && rel.eventos >= 3) {
      const ms = registros.filter((r) => categoria(r.tipo) === rel.nombre).map((r) => +r.fecha.slice(5, 7));
      const mesesRel = [...new Set(ms)].sort((a, b) => a - b).map((m) => u.MESES_C[m - 1].toLowerCase());
      patrones.push(`Las fiestas religiosas y patronales suman ${rel.eventos} eventos (${u.fmtPct(rel.pctEventos, 0)}), en ${mesesRel.join(', ')}: son fechas fijas del calendario que se pueden anticipar.`);
    }
    const finde = porDiaSemana[0].eventos + porDiaSemana[6].eventos + porDiaSemana[5].eventos;
    if (eventos >= 10) patrones.push(`${u.fmtPct(finde / eventos, 0)} de los eventos cae de viernes a domingo.`);

    // ---------- Decisiones que se pueden evaluar ----------
    const decisiones = [];
    if (equilibrio && equilibrio.noCubren.length) {
      const deficit = u.sum(equilibrio.noCubren.map((m) => equilibrio.carga - m.margen));
      decisiones.push(`Reservar dinero en los meses buenos: en los meses que no cubrieron fijos y cuota faltaron en total ~${u.fmtMoney(deficit)}${tot.costoEstimado ? ' (estimado)' : ''}.`);
    }
    if (completos.length >= 3) {
      const orden = [...completos].sort((a, b) => a.eventos - b.eventos);
      decisiones.push(`Lanzar promociones o campañas antes de los meses flojos (como ${u.MESES[+orden[0].mes.slice(5) - 1].toLowerCase()} y ${u.MESES[+orden[1].mes.slice(5) - 1].toLowerCase()}) para llenar el calendario.`);
    }
    const pm = porProducto.filter((p) => p.margenUnit != null).sort((a, b) => b.margenUnit - a.margenUnit);
    if (pm.length >= 2) decisiones.push(`Cada ${pm[0].nombre} deja ~${u.fmtMoney(pm[0].margenUnit)} de margen y cada ${pm[pm.length - 1].nombre} ~${u.fmtMoney(pm[pm.length - 1].margenUnit)}: conviene evaluar si se puede ofrecer el paquete de mayor margen a más clientes.`);
    const desc = porProducto.filter((p) => p.precioRef && p.precioProm < p.precioRef * 0.98);
    if (desc.length) decisiones.push(`Revisar descuentos en ${desc.map((d) => d.nombre).join(', ')}: se cobra menos que el precio referencial.`);
    if (porLugar.length >= 3) decisiones.push(`Enfocar la publicidad en las zonas que más compran (${porLugar.slice(0, 3).map((l) => l.nombre).join(', ')}) o probar una zona nueva con presupuesto pequeño y medir resultados.`);

    const infoAdicional = [
      'Costo real de cada evento (para conocer el margen verdadero).',
      'Cómo llegó cada cliente (TikTok, recomendación, Facebook…) para medir qué publicidad funciona.',
      'Estado de pago de cada contrato (adelanto y saldo) para saber el efectivo real.',
      'Inversión mensual en publicidad.',
    ];

    return {
      vacio: false, fechaCorte, mesParcial, diaCorte, desde, hasta, meses, primerMes, mesCorte, periodoTxt,
      registros, totales: tot, porMes, completos, porProducto, porLugar, porTipo, porCategoria, porDiaSemana,
      equilibrio, tendencia: lr, kpis, noDisponibles, patrones, decisiones, infoAdicional,
    };
  }

  return { analizar, categoria, costoDe };
})();
