/* ADI MUSIC AI — apoyo para decisiones comerciales y de publicidad. */
ADI.pub = (() => {
  const u = ADI.u;
  const mesTxt = (k) => u.MESES[+k.slice(5) - 1].toLowerCase();

  function analizar(state) {
    const v = ADI.kpi.analizar(state);
    const g = ADI.ga4.analizar(state.ga4);
    const p = ADI.proy.proyectar(state, { horizonte: 12 });
    const lib = ADI.fin.libro(state);
    const neg = state.negocio;
    const ant = Math.max(0, neg.mesesAnticipacion ?? 1);
    const pct = (neg.pctPublicidad ?? 5) / 100;
    const preguntas = [];
    const demo = !g.vacio && g.esDemo ? ' *(datos GA4 de demostración)*' : '';

    // 1. Meses
    if (!v.vacio && v.completos.length >= 3) {
      const o = [...v.completos].sort((a, b) => b.eventos - a.eventos);
      const altos = o.slice(0, 3), bajos = o.slice(-3).reverse();
      preguntas.push({ q: '¿En qué meses se vende más y menos?', tipo: 'hecho',
        a: `**Más:** ${altos.map((m) => `${mesTxt(m.mes)} (${m.eventos} eventos, ${u.fmtMoney(m.ingresos)})`).join(', ')}.\n**Menos:** ${bajos.map((m) => `${mesTxt(m.mes)} (${m.eventos} eventos, ${u.fmtMoney(m.ingresos)})`).join(', ')}.` });
    }
    // 2. Productos y lugares
    if (!v.vacio && v.porProducto.length) {
      preguntas.push({ q: '¿Qué productos o lugares generan más ingresos?', tipo: 'hecho',
        a: `**Paquetes:** ${v.porProducto.map((x) => `${x.nombre} ${u.fmtMoney(x.ingresos)} (${u.fmtPct(x.pctIngresos, 0)})`).join(' · ')}.\n**Lugares:** ${v.porLugar.slice(0, 5).map((x) => `${x.nombre} ${u.fmtMoney(x.ingresos)}`).join(' · ')}.` });
    }
    // 3. Evolución
    if (!v.vacio && v.completos.length >= 6) {
      const c = v.completos; const a3 = u.sum(c.slice(-3).map((m) => m.ingresos)), b3 = u.sum(c.slice(-6, -3).map((m) => m.ingresos));
      const t = v.tendencia;
      preguntas.push({ q: '¿Cómo evolucionan las ventas?', tipo: 'hecho',
        a: `Últimos 3 meses completos: ${u.fmtMoney(a3)} frente a ${u.fmtMoney(b3)} de los 3 anteriores (${u.fmtDelta(b3 ? a3 / b3 - 1 : null)}). ${t && t.r2 >= 0.3 ? `Hay una tendencia ${t.slope >= 0 ? 'creciente' : 'decreciente'}.` : 'No hay una tendencia clara de fondo: el negocio se mueve por temporadas (carnavales, fiestas patronales, matrimonios).'}` });
    }
    // 4. Gasto en publicidad
    const invGA4 = g.vacio ? 0 : g.total.inversion;
    const invFin = lib.vacio ? 0 : lib.totales.publicidad;
    preguntas.push({ q: '¿Cuánto se está gastando en publicidad?', tipo: invGA4 || invFin ? 'hecho' : 'limitacion',
      a: invGA4 || invFin
        ? `${invGA4 ? `Según el informe de GA4: **${u.fmtMoney(invGA4)}**${demo}.` : ''} ${invFin ? `Registrado en Finanzas: **${u.fmtMoney(invFin)}**.` : ''}${v.vacio ? '' : ` Eso equivale a ${u.fmtPct((invGA4 || invFin) / v.totales.ingresos)} de las ventas del periodo.`}`
        : 'No hay datos de inversión publicitaria. Regístrala en **Finanzas** (tipo "Gasto", categoría "Publicidad") o importa un informe de GA4 que incluya el costo de anuncios.' });
    // 5. Campañas
    if (!g.vacio && g.porCampana.length) {
      const rows = g.porCampana.map((c) => `- **${c.nombre}**: ${u.fmtMoney(c.inversion)} invertidos, ${u.fmtNum(c.usuarios)} usuarios, ${u.fmtNum(c.eventosClave)} contactos${c.cpa ? `, ${u.fmtMoney(c.cpa, 2)} por contacto` : ''}`).join('\n');
      preguntas.push({ q: '¿Qué campañas muestran mejores resultados?', tipo: 'hecho', a: `Ordenadas de menor a mayor costo por contacto${demo}:\n${rows}\nOjo: un contacto no es lo mismo que un contrato. Para saber cuántas ventas trae cada campaña hay que anotar cómo llegó cada cliente.` });
    } else {
      preguntas.push({ q: '¿Qué campañas muestran mejores resultados?', tipo: 'limitacion', a: 'No hay datos de campañas. Importa un informe de GA4 con la dimensión "Campaña".' });
    }

    // 6–8. Plan con proyección
    const plan = [];
    let supuestos = [];
    if (!p.insuficiente) {
      const margenEv = p.costoProm != null ? p.ticket - p.costoProm : null;
      for (let i = 0; i < Math.min(6, p.meses.length); i++) {
        const m = p.meses[i];
        const objetivo = p.meses[i + ant] || null; // mes cuyos eventos se buscan con la publicidad de este mes
        const presupuesto = objetivo ? Math.round(pct * objetivo.escenarios.intermedio.ingresos / 10) * 10 : null;
        const fuerte = objetivo && objetivo.factor > 1.05, flojo = objetivo && objetivo.factor < 0.95;
        const flujoMes = m.escenarios.intermedio.flujo;
        let accion = 'Mantener presencia (publicaciones orgánicas)';
        if (fuerte) accion = `Anticipar temporada alta de ${mesTxt(objetivo.mes)}`;
        else if (flojo) accion = `Promoción para levantar ${mesTxt(objetivo.mes)}`;
        plan.push({
          mes: m.mes, objetivo: objetivo?.mes || null, eventosObjetivo: objetivo?.escenarios.intermedio.eventos ?? null,
          presupuesto, recupera: presupuesto && margenEv ? presupuesto / margenEv : null, accion,
          riesgo: flujoMes != null && flujoMes - (presupuesto || 0) < 0,
        });
      }
      const fuertes = p.meses.filter((m) => m.factor > 1.05).map((m) => m.mes);
      const prep = fuertes.map((m) => ({ fuerte: m, preparar: u.addMonths(m, -ant) }));
      preguntas.push({ q: '¿En qué mes conviene hacer más publicidad?', tipo: 'recomendacion',
        a: fuertes.length
          ? `Los eventos se contratan con anticipación (supuesto: ${ant} mes). Para la temporada alta conviene anunciar en: ${prep.map((x) => `**${mesTxt(x.preparar)}** (para ${mesTxt(x.fuerte)})`).join(', ')}.\nEn los meses flojos, la publicidad sirve para promociones (por ejemplo paquetes Basic para bautizos y cumpleaños).\n*Es una hipótesis basada en la temporada del historial; hay que medir el resultado de cada campaña.*`
          : 'Con los datos actuales no se ven meses claramente más fuertes que otros.' });
      if (margenEv) {
        const prox = plan.filter((x) => x.presupuesto).slice(0, 3);
        preguntas.push({ q: '¿Qué presupuesto publicitario se podría evaluar?', tipo: 'recomendacion',
          a: `Regla usada: **${u.fmtPct(pct, 0)} de las ventas esperadas** del mes que se quiere llenar.\n${prox.map((x) => `- ${u.monthLabel(x.mes)}: ${u.fmtMoney(x.presupuesto)} → se recupera con ${u.fmtNum(x.recupera, 1)} evento(s) adicional(es)${x.riesgo ? ' ⚠ ese mes el efectivo ya queda ajustado: empezar con menos y medir' : ''}`).join('\n')}\nCada evento adicional deja ~${u.fmtMoney(margenEv)} de margen${p.costoProm != null && v.totales.costoEstimado ? ' (estimado)' : ''}, así que una campaña se paga sola si trae al menos un contrato más.` });
      }
      preguntas.push({ q: '¿Qué meses conviene preparar con anticipación?', tipo: 'recomendacion',
        a: fuertes.length
          ? `${fuertes.map((m) => `**${u.monthLabel(m).toLowerCase()}**`).join(', ')}: revisar equipos, personal y transporte, y lanzar la publicidad en ${prep.map((x) => mesTxt(x.preparar)).filter((x, i, a) => a.indexOf(x) === i).join(', ')}. En el historial hubo días con dos eventos a la vez en temporada alta.`
          : 'No se detectan meses de temporada alta con los datos actuales.' });
      supuestos = [
        `La publicidad de un mes busca eventos de ${ant} mes(es) después, porque los eventos se contratan con anticipación.`,
        `Presupuesto sugerido = ${u.fmtPct(pct, 0)} de los ingresos esperados (escenario intermedio) del mes objetivo.`,
        'Las ventas esperadas salen del módulo Proyecciones.',
        'Que una campaña coincida con más ventas no prueba que las haya causado; para comprobarlo hay que registrar cómo llegó cada cliente.',
      ];
    } else {
      preguntas.push({ q: '¿En qué mes conviene hacer más publicidad?', tipo: 'limitacion', a: p.motivo });
    }
    return { preguntas, plan, supuestos, ventas: v, ga4: g, proy: p };
  }

  return { analizar };
})();
