/* ADIX Music AI — resumen del negocio en un solo mensaje para enviar por WhatsApp. */
ADI.wsp = (() => {
  const u = ADI.u, ui = ADI.ui;
  const ENLACE_APP = 'https://sp3ct3r1979.github.io/adi-music-ai/';
  const mes = (k) => u.MESES[+k.slice(5) - 1].toLowerCase();
  const pct = (x) => u.fmtPct(x, 0);

  // Arma el mensaje con formato de WhatsApp (*negrita*, _cursiva_).
  function mensaje(state) {
    const v = ADI.kpi.analizar(state);
    if (v.vacio) return null;
    const L = ADI.fin.libro(state);
    const p = ADI.proy.proyectar(state, { horizonte: 3 });
    const g = ADI.ga4.analizar(state.ga4);
    const pub = ADI.pub.analizar(state);
    const t = v.totales;
    const out = [];
    const linea = (s) => out.push(s);

    linea(`*📊 ${state.negocio.nombre || 'ADIX Music Sonidos'} — Panorama del negocio*`);
    linea(`_Periodo: ${v.periodoTxt.toLowerCase()} · enviado el ${u.fmtDate(u.today())}_`);

    // Ventas
    const orden = [...v.completos].sort((a, b) => b.ingresos - a.ingresos);
    linea('');
    linea('*💰 VENTAS*');
    linea(`• *Ingresos:* ${u.fmtMoney(t.ingresos)} en ${t.eventos} eventos.`);
    linea(`• *Ticket promedio:* ${u.fmtMoney(t.ticket)} → lo que deja en promedio cada evento.`);
    if (orden.length >= 2) linea(`• *Mejor mes:* ${mes(orden[0].mes)} (${u.fmtMoney(orden[0].ingresos)}) · *más flojo:* ${mes(orden[orden.length - 1].mes)} (${u.fmtMoney(orden[orden.length - 1].ingresos)}).`);
    if (v.porProducto.length) linea(`• *Paquete estrella:* ${v.porProducto[0].nombre}, con el ${pct(v.porProducto[0].pctIngresos)} de los ingresos.`);
    if (v.porLugar.length >= 3) {
      const top = v.porLugar.slice(0, 3);
      linea(`• *Zonas que más compran:* ${top.map((l) => l.nombre).join(', ')} (${pct(u.sum(top.map((l) => l.pctIngresos)))} de los ingresos).`);
    }
    const tipo = [...v.porCategoria].sort((a, b) => b.eventos - a.eventos)[0];
    if (tipo) linea(`• *Tipo de evento más frecuente:* ${tipo.nombre.toLowerCase()} (${pct(tipo.pctEventos)} de los eventos).`);

    // Rentabilidad
    if (t.margen != null) {
      linea('');
      linea(`*📈 RENTABILIDAD*${t.costoEstimado ? ' _(costos estimados por paquete)_' : ''}`);
      linea(`• *Margen de contribución:* ${pct(t.margenPct)} → de cada S/ 100 vendidos quedan S/ ${u.fmtNum(t.margenPct * 100)} para pagar gastos fijos, la cuota del banco y dejar ganancia.`);
      if (v.equilibrio) {
        linea(`• *Punto de equilibrio:* ${u.fmtNum(v.equilibrio.eventosNecesarios, 1)} eventos al mes → lo mínimo para cubrir ${u.fmtMoney(v.equilibrio.carga)} de gastos fijos + cuota.`);
        if (v.equilibrio.noCubren.length) linea(`• *Meses que no alcanzaron:* ${v.equilibrio.noCubren.map((m) => mes(m.mes)).join(', ')} (${v.equilibrio.noCubren.length} de ${v.completos.length}).`);
      }
    }

    // Dinero
    if (!L.vacio) {
      linea('');
      linea('*🏦 DINERO*');
      linea(`• *Utilidad estimada:* ${u.fmtMoney(L.totales.utilidadEstimada)} → lo que queda tras costos y gastos, antes de la cuota.`);
      linea(`• *Cuotas pagadas al banco:* ${u.fmtMoney(L.totales.cuotas)}.`);
      linea(`• *Efectivo disponible estimado:* *${u.fmtMoney(L.totales.efectivoDisponible)}* → lo que realmente queda después de pagar todo.`);
      if (L.tieneNeta) linea(`• *Utilidad neta:* ${u.fmtMoney(L.totales.utilidadNeta)} (después de intereses e impuestos).`);
      if (L.totales.utilidadEstimada > 0 && L.totales.cuotas / L.totales.utilidadEstimada > 0.6) linea(`• La cuota del banco se lleva el ${pct(L.totales.cuotas / L.totales.utilidadEstimada)} de la utilidad: se vende bien, pero queda poco efectivo.`);
    }

    // Proyección
    if (!p.insuficiente) {
      linea('');
      linea('*🔮 PRÓXIMOS 3 MESES* _(estimación, escenario intermedio)_');
      p.meses.forEach((m) => { const x = m.escenarios.intermedio; linea(`• ${u.monthLabel(m.mes)}: ~${u.fmtNum(x.eventos, 1)} eventos · ${u.fmtMoney(x.ingresos)}${x.flujo != null ? ` · queda ${u.fmtMoney(x.flujo)} tras la cuota` : ''}`); });
      if (p.resumen.conservador.colchon > 0) linea(`• *Colchón recomendado:* ${u.fmtMoney(p.resumen.conservador.colchon)}, por si las ventas bajan (escenario conservador).`);
      linea('_Es una guía para planificar, no un resultado garantizado._');
    }

    // GA4
    if (!g.vacio) {
      linea('');
      linea(`*📱 REDES Y WEB (Google Analytics 4)*${g.esDemo ? ' _(datos de demostración)_' : ''}`);
      linea(`• *Usuarios:* ${u.fmtNum(g.total.usuarios)} personas visitaron la web o los enlaces.`);
      linea(`• *Contactos (eventos clave):* ${u.fmtNum(g.total.eventosClave)} → por ejemplo, clics en WhatsApp. Convierten el ${u.fmtPct(g.total.tasaConversion)} de las visitas.`);
      if (g.porCanal.length) linea(`• *Canal que más gente trae:* ${ADI.ga4.nombreCanal(g.porCanal[0].nombre)}.`);
      const conv = g.porCanal.filter((c) => c.sesiones >= 50 && c.tasaConversion != null).sort((a, b) => b.tasaConversion - a.tasaConversion)[0];
      if (conv) linea(`• *Canal que mejor convierte:* ${ADI.ga4.nombreCanal(conv.nombre)} → ${u.fmtPct(conv.tasaConversion)} de sus visitas terminan en contacto.`);
      if (g.total.inversion) linea(`• *Inversión en anuncios:* ${u.fmtMoney(g.total.inversion)}${g.total.cpa ? ` · ${u.fmtMoney(g.total.cpa, 2)} por contacto` : ''}.`);
    }

    // Publicidad
    if (pub.plan.length) {
      const fuertes = p.insuficiente ? [] : ADI.proy.proyectar(state, { horizonte: 12 }).meses.filter((m) => m.factor > 1.05).map((m) => m.mes);
      const ant = state.negocio.mesesAnticipacion ?? 1;
      linea('');
      linea('*📣 PUBLICIDAD*');
      if (fuertes.length) linea(`• *Cuándo anunciar:* ${fuertes.map((m) => `${mes(u.addMonths(m, -ant))} (para ${mes(m)})`).join(', ')}.`);
      const prox = pub.plan.find((x) => x.presupuesto);
      if (prox) linea(`• *Presupuesto sugerido para ${mes(prox.mes)}:* ${u.fmtMoney(prox.presupuesto)} → se recupera con ${u.fmtNum(prox.recupera, 1)} evento(s) adicional(es).`);
    }

    // Recomendaciones y faltantes
    if (v.decisiones.length) {
      linea('');
      linea('*✅ QUÉ HACER*');
      v.decisiones.slice(0, 4).forEach((d, i) => linea(`${i + 1}. ${d}`));
    }
    linea('');
    linea('*⚠️ PARA DECIDIR MEJOR FALTA REGISTRAR*');
    linea('• Costo real de cada evento · cómo llegó cada cliente · estado de pago (adelanto y saldo).');

    const cots = state.cotizaciones || [];
    if (cots.length) {
      const acept = cots.filter((c) => c.estado === 'Aceptada').length, pend = cots.filter((c) => c.estado === 'Pendiente').length;
      linea('');
      linea(`*🧾 COTIZACIONES:* ${cots.length} en total · ${acept} aceptadas · ${pend} pendientes.`);
    }

    linea('');
    linea(`_Generado con ADIX Music AI · ${ENLACE_APP}_`);
    return out.join('\n');
  }

  // Número en formato internacional (Perú por defecto: 9 dígitos que empiezan con 9 → 51 + número).
  function normalizarNumero(n) {
    let d = String(n || '').replace(/\D/g, '');
    if (d.length === 9 && d.startsWith('9')) d = '51' + d;
    return d;
  }

  function abrir() {
    const s = ADI.store.get();
    const texto = mensaje(s);
    if (!texto) { u.toast('Primero carga el Excel de ventas para armar el resumen.', 'error', 5000); return; }
    const m = ui.modal(`
      <h2>${ui.icon('chat')} Enviar resumen por WhatsApp</h2>
      <p class="muted small">Un solo mensaje con los informes principales y los KPI explicados. Puedes editarlo antes de enviarlo.</p>
      <div class="form" style="margin:10px 0">
        <label class="full">Número de WhatsApp (opcional: si lo dejas vacío, eliges el contacto en WhatsApp)
          <input id="wsp-num" inputmode="tel" placeholder="Ej.: 987654321 o 51987654321" value="${u.esc(s.config.whatsappNumero || '')}">
        </label>
      </div>
      <textarea id="wsp-txt" rows="16" style="font-family:inherit;font-size:13.5px;line-height:1.45">${u.esc(texto)}</textarea>
      <p class="muted small" id="wsp-cnt" style="margin-top:6px"></p>
      ${s.ga4?.esDemo ? ui.banner('warn', 'El mensaje incluye datos de GA4 <b>de demostración</b> y lo indica así.') : ''}
      <div class="row" style="margin-top:12px">
        <button class="btn" id="wsp-copiar">Copiar mensaje</button>
        <button class="btn" id="wsp-compartir" hidden>Compartir con el Excel adjunto</button>
        <span class="spacer"></span>
        <button class="btn btn-wsp" id="wsp-abrir">${ui.icon('send')} Abrir WhatsApp</button>
      </div>
      <p class="muted small" style="margin-top:10px">WhatsApp solo permite enviar texto desde un enlace. Para mandar también los archivos, usa los botones <b>Excel</b> o <b>PDF</b> y adjúntalos en el chat${navigator.share ? ', o en el celular pulsa "Compartir con el Excel adjunto"' : ''}.</p>`, { ancho: '760px' });

    const txt = m.querySelector('#wsp-txt'), num = m.querySelector('#wsp-num'), cnt = m.querySelector('#wsp-cnt');
    const contar = () => { cnt.textContent = `${txt.value.length.toLocaleString('es-PE')} caracteres`; };
    txt.addEventListener('input', contar); contar();

    m.querySelector('#wsp-abrir').onclick = () => {
      const n = normalizarNumero(num.value);
      if (num.value.trim() && n.length < 10) { u.toast('Revisa el número: incluye el código de país (51 para Perú).', 'error'); return; }
      ADI.store.update((x) => { x.config.whatsappNumero = num.value.trim(); });
      const url = `https://wa.me/${n}?text=${encodeURIComponent(txt.value)}`;
      window.open(url, '_blank', 'noopener');
      ADI.store.log('Resumen enviado a WhatsApp', n ? `al +${n}` : 'eligiendo contacto');
    };
    m.querySelector('#wsp-copiar').onclick = async () => {
      try { await navigator.clipboard.writeText(txt.value); u.toast('Mensaje copiado. Pégalo en WhatsApp.', 'ok'); }
      catch (_) { txt.select(); u.toast('Selecciona el texto y cópialo con Ctrl+C.', 'info'); }
    };

    // En celulares que lo permiten: compartir el texto junto con el Excel de resultados.
    const archivo = ADI.exportar.excelArchivo ? ADI.exportar.excelArchivo() : null;
    const btnComp = m.querySelector('#wsp-compartir');
    if (archivo && navigator.canShare && navigator.canShare({ files: [archivo] })) {
      btnComp.hidden = false;
      btnComp.onclick = async () => {
        try { await navigator.share({ title: 'Panorama del negocio', text: txt.value, files: [archivo] }); ADI.store.log('Resumen compartido con Excel adjunto'); }
        catch (e) { if (e.name !== 'AbortError') u.toast('No se pudo compartir: ' + e.message, 'error'); }
      };
    }
  }

  return { mensaje, abrir, normalizarNumero };
})();
