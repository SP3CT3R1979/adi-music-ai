/* ADI MUSIC AI — proyecciones futuras con un método simple y explicable (promedio + estacionalidad + escenarios). */
ADI.proy = (() => {
  const u = ADI.u;
  const ESC = ['conservador', 'intermedio', 'optimista'];

  function proyectar(state, opciones = {}) {
    const horizonte = opciones.horizonte || 12;
    const a = ADI.kpi.analizar(state);
    if (a.vacio) return { insuficiente: true, motivo: 'Todavía no hay registros de ventas. Sube el Excel en "Ventas y KPI".' };
    const hist = a.completos;
    if (hist.length < 3) return { insuficiente: true, motivo: `Solo hay ${hist.length} mes(es) completo(s). Se necesitan al menos 3 meses completos para proyectar con algo de sentido.` };

    const neg = state.negocio;
    const evHist = hist.map((m) => m.eventos);
    const base = u.mean(evHist);
    // Variación típica entre meses; los escenarios usan la mitad, porque es poco probable que todos los meses salgan mal (o bien) a la vez.
    const cvMes = Math.min(0.4, Math.max(0.1, u.std(evHist) / base));
    const cv = cvMes / 2;
    const ticket = a.totales.ticket;
    const costoProm = a.totales.costos != null ? a.totales.costos / a.totales.eventos : null;
    const fijos = neg.gastosFijosMensuales || 0;
    const cuota = neg.cuotaBanco || 0;
    // Se parte del efectivo estimado al cierre de los datos (el mismo que muestra Finanzas).
    const lib = ADI.fin.libro(state);
    const saldoInicial = lib.vacio ? (neg.saldoCajaInicial || 0) : lib.totales.efectivoDisponible;
    const saldoFuente = 'efectivo estimado al cierre de los datos, según el módulo Finanzas';

    // Estacionalidad: cuánto se aparta cada mes del promedio. Con un solo año de datos se toma la mitad del efecto.
    const porMesCal = {};
    hist.forEach((m) => { const k = +m.mes.slice(5); (porMesCal[k] = porMesCal[k] || []).push(m.eventos); });
    const factor = (mesCal) => {
      const obs = porMesCal[mesCal];
      if (!obs) return { f: 1, peso: 0, obs: null };
      const peso = Math.min(0.8, 0.5 + 0.15 * (obs.length - 1));
      const f = 1 + peso * (u.mean(obs) / base - 1);
      return { f, peso, obs: u.mean(obs) };
    };

    const lr = u.linreg(evHist);
    const usarTendencia = !!opciones.aplicarTendencia && lr && lr.r2 >= 0.3;

    const inicio = u.addMonths(a.mesCorte, 1);
    let acum = { conservador: saldoInicial, intermedio: saldoInicial, optimista: saldoInicial };
    const meses = [];
    for (let i = 0; i < horizonte; i++) {
      const mes = u.addMonths(inicio, i);
      const fc = factor(+mes.slice(5));
      let ev = base * fc.f;
      if (usarTendencia) ev = Math.max(0, ev + lr.slope * (hist.length + i));
      const escenarios = {};
      const mult = { conservador: 1 - cv, intermedio: 1, optimista: 1 + cv };
      ESC.forEach((e) => {
        const eventos = ev * mult[e];
        const ingresos = eventos * ticket;
        const costos = costoProm != null ? eventos * costoProm : null;
        const margen = costos != null ? ingresos - costos : null;
        const utilidad = margen != null ? margen - fijos : null;
        const flujo = utilidad != null ? utilidad - cuota : null;
        if (flujo != null) acum[e] += flujo;
        escenarios[e] = { eventos, ingresos, costos, margen, utilidad, flujo, acumulado: flujo != null ? acum[e] : null };
      });
      meses.push({ mes, factor: fc.f, obsHist: fc.obs, escenarios });
    }

    const resumen = {};
    ESC.forEach((e) => {
      const xs = meses.map((m) => m.escenarios[e]);
      const negativos = meses.filter((m) => m.escenarios[e].flujo != null && m.escenarios[e].flujo < 0).map((m) => m.mes);
      const minAcum = Math.min(saldoInicial, ...xs.map((x) => x.acumulado ?? Infinity));
      resumen[e] = {
        eventos: u.sum(xs.map((x) => x.eventos)), ingresos: u.sum(xs.map((x) => x.ingresos)),
        margen: costoProm != null ? u.sum(xs.map((x) => x.margen)) : null,
        utilidad: costoProm != null ? u.sum(xs.map((x) => x.utilidad)) : null,
        flujo: costoProm != null ? u.sum(xs.map((x) => x.flujo)) : null,
        negativos, minAcum, colchon: Math.max(0, -minAcum), saldoFinal: xs[xs.length - 1].acumulado,
      };
    });

    // Cierre estimado del mes parcial.
    let cierreParcial = null;
    if (a.mesParcial) {
      const mp = a.porMes.find((m) => m.mes === a.mesParcial);
      const dias = u.daysInMonth(a.mesParcial);
      const restante = (dias - a.diaCorte) / dias;
      const esperado = base * factor(+a.mesParcial.slice(5)).f;
      cierreParcial = { mes: a.mesParcial, actuales: mp.eventos, ingresosActuales: mp.ingresos, estimadoCierre: mp.eventos + esperado * restante, dia: a.diaCorte };
    }

    const equilibrio = a.equilibrio ? a.equilibrio.eventosNecesarios : null;
    const supuestos = [
      `Base: promedio de ${u.fmtNum(base, 1)} eventos por mes en ${hist.length} meses completos (${u.monthLabel(hist[0].mes)} – ${u.monthLabel(hist[hist.length - 1].mes)}).`,
      'Estacionalidad: cada mes se ajusta según cómo le fue a ese mismo mes en el historial. Como solo hay un año de datos, se toma la mitad del efecto observado; los meses sin historial usan el promedio.',
      `Escenarios: los eventos varían en promedio ${u.fmtPct(cvMes, 0)} de un mes a otro. Como es poco probable que todos los meses salgan mal (o bien) a la vez, el conservador resta y el optimista suma la mitad: ${u.fmtPct(cv, 0)}.`,
      `Ingreso por evento: ticket promedio histórico de ${u.fmtMoney(ticket)}.`,
      costoProm != null ? `Costo variable por evento: ${u.fmtMoney(costoProm)} (promedio${a.totales.costoEstimado ? ', estimado con la tabla de paquetes' : ''}).` : 'No hay costos: solo se proyectan eventos e ingresos.',
      `Gastos fijos ${u.fmtMoney(fijos)} y cuota bancaria ${u.fmtMoney(cuota)} por mes.`,
      `Caja inicial: ${u.fmtMoney(saldoInicial)} (${saldoFuente}).`,
      usarTendencia ? `Se aplica la tendencia lineal (${lr.slope >= 0 ? '+' : ''}${u.fmtNum(lr.slope, 2)} eventos por mes).` : 'No se aplica tendencia de crecimiento (no hay una tendencia clara o no se activó).',
    ];
    const limitaciones = [
      'Solo hay un año de historia: la estacionalidad es una aproximación, no una regla comprobada.',
      'No incluye cambios de precios, nuevas campañas, competencia, clima ni eventos imprevistos.',
      a.totales.costoEstimado ? 'Los costos son estimados por paquete; el margen real puede ser distinto.' : null,
      'Supone que todo lo vendido se cobra y que todos los gastos se pagan en el mismo mes.',
      'Es una estimación para planificar, no un resultado garantizado.',
    ].filter(Boolean);

    const recomendaciones = [];
    const neg2 = resumen.conservador.negativos;
    if (neg2.length) recomendaciones.push(`En el escenario conservador, ${neg2.length} mes(es) no alcanzan para fijos y cuota (${neg2.map((m) => u.MESES_C[+m.slice(5) - 1].toLowerCase()).join(', ')}). Conviene tener un colchón de unos ${u.fmtMoney(resumen.conservador.colchon)} o reforzar ventas antes de esos meses.`);
    if (equilibrio) recomendaciones.push(`Meta mínima sugerida: ${Math.ceil(equilibrio)} eventos por mes (punto de equilibrio con fijos y cuota).`);
    const altos = [...meses].sort((x, y) => y.factor - x.factor).filter((m) => m.factor > 1.05).slice(0, 3);
    if (altos.length) recomendaciones.push(`Meses que se esperan más fuertes: ${altos.map((m) => u.monthLabel(m.mes).toLowerCase()).join(', ')}. Prepara equipos, personal y publicidad con ${neg.mesesAnticipacion || 1} mes(es) de anticipación.`);
    const bajos = [...meses].sort((x, y) => x.factor - y.factor).filter((m) => m.factor < 0.95).slice(0, 3);
    if (bajos.length) recomendaciones.push(`Meses que se esperan más flojos: ${bajos.map((m) => u.monthLabel(m.mes).toLowerCase()).join(', ')}. Son buenos candidatos para promociones o paquetes especiales.`);

    return { insuficiente: false, base, cv, ticket, costoProm, fijos, cuota, saldoInicial, saldoFuente, meses, resumen, cierreParcial, equilibrio, tendencia: lr, usarTendencia, supuestos, limitaciones, recomendaciones, horizonte };
  }

  return { proyectar, ESC };
})();
