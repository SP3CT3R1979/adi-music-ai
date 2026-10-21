/* ADIX Music AI — control financiero: distingue ingresos, utilidad estimada, utilidad neta y efectivo disponible. */
ADI.fin = (() => {
  const u = ADI.u;

  const CATEGORIAS = {
    ingreso: ['Otros ingresos', 'Alquiler de equipos a terceros', 'Venta de equipo usado'],
    costo: ['Personal / músicos', 'Transporte / combustible', 'Alquiler de equipos', 'Otros costos de eventos'],
    gasto: ['Publicidad', 'Mantenimiento extra', 'Servicios (luz, internet, teléfono)', 'Compras menores', 'Otros gastos'],
    pago: ['Impuestos', 'Retiro personal', 'Pago extra de deuda', 'Compra de equipos (inversión)', 'Otros pagos'],
  };
  const TIPOS = { ingreso: 'Ingreso', costo: 'Costo de evento', gasto: 'Gasto del negocio', pago: 'Pago (no es gasto)' };

  function libro(state) {
    const neg = state.negocio;
    const ventas = ADI.kpi.analizar(state);
    const movs = state.movimientos || [];
    const mesesSet = new Set();
    if (!ventas.vacio) ventas.meses.forEach((m) => mesesSet.add(m));
    movs.forEach((m) => mesesSet.add(u.monthKey(m.fecha)));
    const meses = [...mesesSet].sort();
    if (!meses.length) return { vacio: true };
    const rango = u.monthRange(meses[0], meses[meses.length - 1]);

    const fijos = neg.gastosFijosMensuales || 0;
    const cuota = neg.cuotaBanco || 0;
    const tieneNeta = neg.interesCuotaPct != null && neg.tasaImpuestoPct != null;
    const pres = state.presupuesto || {};
    let acum = neg.saldoCajaInicial || 0;

    const filas = rango.map((mes) => {
      const v = ventas.vacio ? null : ventas.porMes.find((x) => x.mes === mes);
      const mm = movs.filter((x) => u.monthKey(x.fecha) === mes);
      const s = (tipo, cat) => u.sum(mm.filter((x) => x.tipo === tipo && (!cat || x.categoria === cat)).map((x) => x.monto));
      const ingresosVentas = v ? v.ingresos : 0;
      const otrosIngresos = s('ingreso');
      const costosVar = v && v.costos != null ? v.costos : 0;
      const otrosCostos = s('costo');
      const publicidad = s('gasto', 'Publicidad');
      const otrosGastos = s('gasto');
      const pagos = s('pago');
      const ingresos = ingresosVentas + otrosIngresos;
      const costos = costosVar + otrosCostos;
      const gastos = fijos + otrosGastos;
      const utilidadEstimada = ingresos - costos - gastos;
      const intereses = tieneNeta ? cuota * neg.interesCuotaPct / 100 : null;
      const impuestos = tieneNeta ? Math.max(0, utilidadEstimada - intereses) * neg.tasaImpuestoPct / 100 : null;
      const utilidadNeta = tieneNeta ? utilidadEstimada - intereses - impuestos : null;
      const flujo = ingresos - costos - gastos - cuota - pagos;
      acum += flujo;
      const desv = [];
      if (pres.metaVentas) desv.push({ concepto: 'Ventas', meta: pres.metaVentas, real: ingresos, mejorSiMayor: true });
      if (pres.metaEventos && v) desv.push({ concepto: 'Eventos', meta: pres.metaEventos, real: v.eventos, mejorSiMayor: true, unidad: 'eventos' });
      if (pres.presupuestoGastos) desv.push({ concepto: 'Gastos del negocio', meta: pres.presupuestoGastos, real: gastos, mejorSiMayor: false }); // sin costos de eventos, que suben con las ventas
      if (pres.presupuestoPublicidad) desv.push({ concepto: 'Publicidad', meta: pres.presupuestoPublicidad, real: publicidad, mejorSiMayor: false });
      if (pres.metaGanancia) desv.push({ concepto: 'Utilidad estimada', meta: pres.metaGanancia, real: utilidadEstimada, mejorSiMayor: true });
      desv.forEach((d) => { d.dif = d.real - d.meta; d.pct = d.meta ? d.dif / d.meta : null; d.bien = d.mejorSiMayor ? d.dif >= 0 : d.dif <= 0; });
      return {
        mes, parcial: v?.parcial || false, eventos: v?.eventos || 0, ingresosVentas, otrosIngresos, ingresos, costosVar, otrosCostos, costos,
        fijos, otrosGastos, publicidad, gastos, utilidadEstimada, intereses, impuestos, utilidadNeta, cuota, pagos, flujo, acumulado: acum, desv,
      };
    });

    const T = (k) => u.sum(filas.map((f) => f[k] || 0));
    const totales = {
      ingresos: T('ingresos'), costos: T('costos'), gastos: T('gastos'), utilidadEstimada: T('utilidadEstimada'),
      utilidadNeta: tieneNeta ? T('utilidadNeta') : null, cuotas: T('cuota'), pagos: T('pagos'), flujo: T('flujo'),
      efectivoDisponible: filas[filas.length - 1].acumulado, publicidad: T('publicidad'),
    };
    return { vacio: false, filas, totales, tieneNeta, costoEstimado: !ventas.vacio && ventas.totales.costoEstimado, saldoInicial: neg.saldoCajaInicial || 0, ventas };
  }

  // Explica en palabras simples la desviación más importante de cada mes.
  function explicarDesviaciones(lib) {
    const out = [];
    lib.filas.forEach((f) => {
      const peores = f.desv.filter((d) => !d.bien && d.pct != null).sort((a, b) => Math.abs(b.pct) - Math.abs(a.pct));
      if (!peores.length) return;
      const d = peores[0];
      const fmt = (x) => (d.unidad ? `${u.fmtNum(x)} ${d.unidad}` : u.fmtMoney(x));
      let txt = `${u.monthLabel(f.mes)}${f.parcial ? ' (parcial)' : ''} — ${d.concepto}: ${fmt(d.real)} vs. ${fmt(d.meta)} previstos (${u.fmtDelta(d.pct)}).`;
      if (d.concepto === 'Ventas' && f.eventos) txt += ` Hubo ${f.eventos} eventos.`;
      if (d.concepto === 'Utilidad estimada') txt += ' La utilidad depende de cuántos eventos se hicieron y de los gastos del mes.';
      out.push(txt);
    });
    return out;
  }

  return { libro, explicarDesviaciones, CATEGORIAS, TIPOS };
})();
