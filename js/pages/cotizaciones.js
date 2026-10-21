/* Pantalla: Cotizaciones (cantidades, costos, precios y márgenes estimados). */
ADI.pages.cotizaciones = (() => {
  const u = ADI.u, ui = ADI.ui;
  const ORIGENES = ['TikTok', 'Facebook / Instagram', 'WhatsApp', 'Recomendación', 'Cliente anterior', 'Página web', 'Otro'];
  const EXTRAS = [
    { concepto: 'Movilización / transporte', cantidad: 1, costo: 150, precio: 250 },
    { concepto: 'Hora adicional', cantidad: 1, costo: 80, precio: 200 },
    { concepto: 'Iluminación adicional', cantidad: 1, costo: 120, precio: 300 },
  ];
  let borrador = null;

  function nuevo(s) {
    const p = s.paquetes[0];
    return { id: u.uid(), numero: '', fecha: u.today(), cliente: '', telefono: '', origen: '', fechaEvento: '', lugar: '', tipo: '', paquete: p?.nombre || '',
      items: p ? [{ concepto: `Paquete ${p.nombre}`, cantidad: 1, costo: p.costo ?? 0, precio: p.precio }] : [{ concepto: 'Servicio', cantidad: 1, costo: 0, precio: 0 }],
      descuentoPct: 0, estado: 'Pendiente', notas: '' };
  }

  function calcular(c) {
    const subtotal = u.sum(c.items.map((i) => (+i.cantidad || 0) * (+i.precio || 0)));
    const descuento = subtotal * (+c.descuentoPct || 0) / 100;
    const total = subtotal - descuento;
    const costo = u.sum(c.items.map((i) => (+i.cantidad || 0) * (+i.costo || 0)));
    const margen = total - costo;
    return { subtotal, descuento, total, costo, margen, margenPct: total ? margen / total : null };
  }

  function alertas(c, s, t) {
    const out = [];
    const pq = s.paquetes.find((p) => p.nombre === c.paquete);
    if (t.margenPct != null && t.margenPct < 0.35) out.push(['error', `Margen bajo: ${u.fmtPct(t.margenPct)}. Los paquetes suelen dejar 45–55 %.`]);
    if (pq && t.total < pq.precio && c.items.length === 1) out.push(['warn', `El total (${u.fmtMoney(t.total)}) está por debajo del precio referencial de ${pq.nombre} (${u.fmtMoney(pq.precio)}).`]);
    if (c.fechaEvento) {
      const ese = (s.ventas?.registros || []).filter((r) => r.fecha === c.fechaEvento);
      const otras = s.cotizaciones.filter((x) => x.id !== c.id && x.estado === 'Aceptada' && x.fechaEvento === c.fechaEvento && !x.convertida);
      const n = ese.length + otras.length;
      if (n) out.push(['warn', `Ya hay ${n} evento(s) ese día${ese.length ? ` (${ese.map((r) => r.lugar).join(', ')})` : ''}. Verifica que tengas equipo y personal disponibles.`]);
    }
    if (t.margen > 0 && !out.length) out.push(['ok', `Margen estimado saludable: ${u.fmtMoney(t.margen)} (${u.fmtPct(t.margenPct)}).`]);
    return out;
  }

  function siguienteNumero(s) {
    const y = new Date().getFullYear();
    const n = s.cotizaciones.filter((c) => c.numero.startsWith(`COT-${y}`)).length + 1;
    return `COT-${y}-${String(n).padStart(3, '0')}`;
  }

  function documento(c, s) {
    const t = calcular(c);
    return `<div class="cot-doc">
      <h2>${u.esc(s.negocio.nombre || 'ADI MUSIC')} — Cotización ${u.esc(c.numero)}</h2>
      <p class="muted">Fecha: ${u.fmtDate(c.fecha)} · Válida por 15 días</p>
      <p><b>Cliente:</b> ${u.esc(c.cliente || '—')}${c.telefono ? ` · ${u.esc(c.telefono)}` : ''}<br><b>Evento:</b> ${u.esc(c.tipo || '—')} · ${u.esc(c.lugar || '—')} · ${c.fechaEvento ? u.fmtDate(c.fechaEvento) : 'fecha por definir'}</p>
      <table><thead><tr><th>Concepto</th><th class="num">Cant.</th><th class="num">Precio unit.</th><th class="num">Importe</th></tr></thead>
      <tbody>${c.items.map((i) => `<tr><td>${u.esc(i.concepto)}</td><td class="num">${u.fmtNum(+i.cantidad)}</td><td class="num">${u.fmtMoney(+i.precio, 2)}</td><td class="num">${u.fmtMoney(i.cantidad * i.precio, 2)}</td></tr>`).join('')}
      ${t.descuento ? `<tr><td colspan="3">Descuento (${u.fmtNum(+c.descuentoPct, 1)} %)</td><td class="num">−${u.fmtMoney(t.descuento, 2)}</td></tr>` : ''}
      <tr><td colspan="3"><b>Total</b></td><td class="num"><b>${u.fmtMoney(t.total, 2)}</b></td></tr></tbody></table>
      ${c.notas ? `<p>${u.esc(c.notas)}</p>` : ''}
      <p class="muted small">Montos referenciales sujetos a confirmación de disponibilidad. Para reservar la fecha se requiere un adelanto.</p>
    </div>`;
  }

  function imprimir(c, s) {
    const div = document.createElement('div');
    div.className = 'cot-print';
    div.innerHTML = documento(c, s);
    document.body.appendChild(div);
    document.body.classList.add('print-cot');
    const fin = () => { document.body.classList.remove('print-cot'); div.remove(); window.removeEventListener('afterprint', fin); };
    window.addEventListener('afterprint', fin);
    setTimeout(() => window.print(), 50);
  }

  function editor(el, s) {
    const c = borrador;
    const t = calcular(c);
    const lugares = [...new Set((s.ventas?.registros || []).map((r) => r.lugar).filter(Boolean))].sort();
    const tipos = [...new Set((s.ventas?.registros || []).map((r) => r.tipo).filter(Boolean))].sort();
    return ui.card(c.numero ? `Editar ${u.esc(c.numero)}` : 'Nueva cotización', `
      <form id="cz-form" class="form">
        <label>Cliente<input name="cliente" value="${u.esc(c.cliente)}" placeholder="Nombre"></label>
        <label>Teléfono (opcional)<input name="telefono" value="${u.esc(c.telefono)}"></label>
        <label>¿Cómo llegó el cliente?<select name="origen"><option value="">—</option>${ORIGENES.map((o) => `<option ${o === c.origen ? 'selected' : ''}>${o}</option>`).join('')}</select></label>
        <label>Fecha del evento<input type="date" name="fechaEvento" value="${c.fechaEvento}"></label>
        <label>Lugar<input name="lugar" list="cz-lugares" value="${u.esc(c.lugar)}"><datalist id="cz-lugares">${lugares.map((l) => `<option value="${u.esc(l)}">`).join('')}</datalist></label>
        <label>Tipo de evento<input name="tipo" list="cz-tipos" value="${u.esc(c.tipo)}"><datalist id="cz-tipos">${tipos.map((l) => `<option value="${u.esc(l)}">`).join('')}</datalist></label>
        <label>Paquete<select name="paquete">${s.paquetes.map((p) => `<option ${p.nombre === c.paquete ? 'selected' : ''}>${u.esc(p.nombre)}</option>`).join('')}<option value="" ${!c.paquete ? 'selected' : ''}>Personalizado</option></select></label>
        <label>Descuento (%)<input type="number" name="descuentoPct" min="0" max="100" step="0.5" value="${c.descuentoPct}"></label>
      </form>
      <h4 style="margin:16px 0 8px">Detalle</h4>
      <div class="table-wrap"><table class="tbl" id="cz-items"><thead><tr><th>Concepto</th><th class="num">Cantidad</th><th class="num">Costo unit. (S/)</th><th class="num">Precio unit. (S/)</th><th class="num">Importe</th><th class="num">Margen</th><th></th></tr></thead><tbody>
        ${c.items.map((i, k) => `<tr data-k="${k}">
          <td><input data-f="concepto" value="${u.esc(i.concepto)}"></td>
          <td class="num"><input data-f="cantidad" type="number" min="0" step="1" value="${i.cantidad}" style="width:80px"></td>
          <td class="num"><input data-f="costo" type="number" min="0" step="10" value="${i.costo}" style="width:110px"></td>
          <td class="num"><input data-f="precio" type="number" min="0" step="10" value="${i.precio}" style="width:110px"></td>
          <td class="num">${u.fmtMoney(i.cantidad * i.precio)}</td>
          <td class="num">${u.fmtMoney(i.cantidad * (i.precio - i.costo))}</td>
          <td><button class="icon-btn" data-quitar="${k}" title="Quitar">${ui.icon('trash', 'ico ico-xs')}</button></td></tr>`).join('')}
      </tbody></table></div>
      <div class="row" style="margin-top:8px">${EXTRAS.map((x, k) => `<button class="btn btn-sm" data-extra="${k}">+ ${x.concepto}</button>`).join('')}<button class="btn btn-sm" data-extra="-1">+ Otro concepto</button></div>
      <div class="kpis" style="margin-top:14px">
        ${ui.kpi({ titulo: 'Precio total', valor: u.fmtMoney(t.total), sub: t.descuento ? `descuento ${u.fmtMoney(t.descuento)}` : 'sin descuento' })}
        ${ui.kpi({ titulo: 'Costo estimado', valor: u.fmtMoney(t.costo) })}
        ${ui.kpi({ titulo: 'Margen estimado', valor: u.fmtMoney(t.margen), sub: u.fmtPct(t.margenPct), estado: t.margenPct != null && t.margenPct < 0.35 ? 'alerta' : 'ok' })}
      </div>
      <div class="stack" style="margin-top:12px">${alertas(c, s, t).map(([tp, m]) => ui.banner(tp, u.esc(m))).join('')}</div>
      <label style="margin-top:12px">Notas para el cliente<textarea id="cz-notas" rows="2">${u.esc(c.notas)}</textarea></label>
      <div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" id="cz-cancel">Cancelar</button><button class="btn btn-primary" id="cz-save">${ui.icon('check')} Guardar cotización</button></div>`);
  }

  function render(el) {
    const s = ADI.store.get();
    if (!s.paquetes.length && !borrador) {
      el.innerHTML = ui.card('', ui.vacio('Primero carga los paquetes', 'Las cotizaciones usan los precios y costos de los paquetes del Excel (o los que definas en Configuración).', '<a class="btn btn-primary" href="#/ventas">Cargar Excel</a> <a class="btn" href="#/configuracion">Definir paquetes</a>'));
      return;
    }
    const lista = [...s.cotizaciones].sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero.localeCompare(a.numero));
    const resp = s.cotizaciones.filter((c) => c.estado !== 'Pendiente');
    const acept = s.cotizaciones.filter((c) => c.estado === 'Aceptada');
    el.innerHTML = `<div class="stack">
      ${borrador ? editor(el, s) : ''}
      <div class="kpis">
        ${ui.kpi({ titulo: 'Cotizaciones', valor: u.fmtNum(s.cotizaciones.length), sub: `${s.cotizaciones.filter((c) => c.estado === 'Pendiente').length} pendientes` })}
        ${ui.kpi({ titulo: 'Tasa de cierre', valor: resp.length ? u.fmtPct(acept.length / resp.length) : '—', sub: 'aceptadas ÷ respondidas', info: 'De las cotizaciones que ya tienen respuesta, cuántas se convirtieron en contrato.' })}
        ${ui.kpi({ titulo: 'Monto aceptado', valor: u.fmtMoney(u.sum(acept.map((c) => calcular(c).total))) })}
        ${ui.kpi({ titulo: 'Margen promedio cotizado', valor: s.cotizaciones.length ? u.fmtPct(u.mean(s.cotizaciones.map((c) => calcular(c).margenPct || 0))) : '—' })}
      </div>
      ${ui.card('Cotizaciones', ui.tabla(['N°', 'Cliente', 'Evento', 'Origen', { t: 'Total', num: true }, { t: 'Margen', num: true }, 'Estado', ''],
        lista.map((c) => { const t = calcular(c); return [u.esc(c.numero), u.esc(c.cliente || '—'), `${u.esc(c.paquete || 'Personalizado')} · ${c.fechaEvento ? u.fmtDate(c.fechaEvento) : 'sin fecha'}<div class="muted small">${u.esc([c.tipo, c.lugar].filter(Boolean).join(' · '))}</div>`, u.esc(c.origen || '—'), u.fmtMoney(t.total), u.fmtPct(t.margenPct),
          `<select data-estado="${c.id}" style="width:auto">${['Pendiente', 'Aceptada', 'Rechazada'].map((e) => `<option ${e === c.estado ? 'selected' : ''}>${e}</option>`).join('')}</select>${c.convertida ? ' <span class="tag tag-green">en ventas</span>' : ''}`,
          `<div class="row" style="flex-wrap:nowrap"><button class="icon-btn" data-ver="${c.id}" title="Ver / imprimir">${ui.icon('print', 'ico ico-xs')}</button><button class="icon-btn" data-edit="${c.id}" title="Editar">${ui.icon('file', 'ico ico-xs')}</button>${c.estado === 'Aceptada' && !c.convertida && c.fechaEvento ? (c.fechaEvento <= u.today() ? `<button class="btn btn-sm" data-conv="${c.id}">Pasar a ventas</button>` : '<span class="tag tag-gray" title="Se podrá registrar como venta cuando se realice el evento">por realizar</span>') : ''}<button class="icon-btn" data-borrar="${c.id}" title="Eliminar">${ui.icon('trash', 'ico ico-xs')}</button></div>`]; }),
        { vacioTxt: 'Aún no hay cotizaciones. Crea la primera con el botón "Nueva cotización".' }), {
        acciones: borrador ? '' : `<button class="btn btn-primary" id="cz-nueva">+ Nueva cotización</button>`,
        sub: 'Registrar el origen de cada cliente permite medir qué publicidad trae contratos.',
      })}
      ${ui.card('Pregúntale a la IA', ui.preguntas(['¿Qué margen mínimo debería aceptar en una cotización?', '¿Conviene hacer descuentos en temporada baja?']))}
    </div>`;

    const btnNueva = el.querySelector('#cz-nueva');
    if (btnNueva) btnNueva.onclick = () => { borrador = nuevo(s); render(el); };

    if (borrador) {
      const f = el.querySelector('#cz-form');
      const leerForm = () => { const fd = new FormData(f); ['cliente', 'telefono', 'origen', 'fechaEvento', 'lugar', 'tipo', 'descuentoPct'].forEach((k) => { borrador[k] = k === 'descuentoPct' ? +fd.get(k) || 0 : String(fd.get(k) || '').trim(); }); borrador.notas = el.querySelector('#cz-notas').value; };
      f.addEventListener('change', (e) => {
        leerForm();
        if (e.target.name === 'paquete') {
          const nuevoP = e.target.value;
          const pq = s.paquetes.find((p) => p.nombre === nuevoP);
          borrador.paquete = nuevoP;
          const linea = borrador.items.findIndex((i) => /^paquete /i.test(i.concepto));
          if (pq) { const it = { concepto: `Paquete ${pq.nombre}`, cantidad: 1, costo: pq.costo ?? 0, precio: pq.precio }; if (linea >= 0) borrador.items[linea] = it; else borrador.items.unshift(it); }
        }
        render(el);
      });
      el.querySelectorAll('#cz-items input').forEach((inp) => {
        inp.addEventListener('change', () => { leerForm(); const k = +inp.closest('tr').dataset.k; const fld = inp.dataset.f; borrador.items[k][fld] = fld === 'concepto' ? inp.value : +inp.value || 0; render(el); });
      });
      el.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => { leerForm(); borrador.items.splice(+b.dataset.quitar, 1); render(el); }; });
      el.querySelectorAll('[data-extra]').forEach((b) => { b.onclick = () => { leerForm(); const k = +b.dataset.extra; borrador.items.push(k >= 0 ? { ...EXTRAS[k] } : { concepto: 'Otro concepto', cantidad: 1, costo: 0, precio: 0 }); render(el); }; });
      el.querySelector('#cz-cancel').onclick = () => { borrador = null; render(el); };
      el.querySelector('#cz-save').onclick = () => {
        leerForm();
        if (!borrador.items.length) { u.toast('Agrega al menos un concepto.', 'error'); return; }
        ADI.store.update((x) => {
          if (!borrador.numero) borrador.numero = siguienteNumero(x);
          const i = x.cotizaciones.findIndex((c) => c.id === borrador.id);
          if (i >= 0) x.cotizaciones[i] = borrador; else x.cotizaciones.push(borrador);
        });
        ADI.store.log('Cotización guardada', `${borrador.numero} · ${u.fmtMoney(calcular(borrador).total)}`);
        u.toast(`Cotización ${borrador.numero} guardada.`, 'ok');
        borrador = null; render(el);
      };
    }

    el.querySelectorAll('[data-estado]').forEach((sel) => { sel.onchange = () => { ADI.store.update((x) => { const c = x.cotizaciones.find((y) => y.id === sel.dataset.estado); if (c) c.estado = sel.value; }); render(el); }; });
    el.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => { borrador = JSON.parse(JSON.stringify(s.cotizaciones.find((c) => c.id === b.dataset.edit))); render(el); window.scrollTo(0, 0); }; });
    el.querySelectorAll('[data-borrar]').forEach((b) => { b.onclick = () => { if (confirm('¿Eliminar esta cotización?')) { ADI.store.update((x) => { x.cotizaciones = x.cotizaciones.filter((c) => c.id !== b.dataset.borrar); }); render(el); } }; });
    el.querySelectorAll('[data-ver]').forEach((b) => {
      b.onclick = () => {
        const c = s.cotizaciones.find((x) => x.id === b.dataset.ver);
        const m = ui.modal(`${documento(c, s)}<div class="row" style="margin-top:14px"><span class="spacer"></span><button class="btn" data-close>Cerrar</button><button class="btn btn-primary" id="cz-print">${ui.icon('print')} Imprimir / guardar PDF</button></div>`, { ancho: '720px' });
        m.querySelector('#cz-print').onclick = () => imprimir(c, s);
      };
    });
    el.querySelectorAll('[data-conv]').forEach((b) => {
      b.onclick = () => {
        const c = s.cotizaciones.find((x) => x.id === b.dataset.conv);
        const t = calcular(c);
        ADI.store.update((x) => {
          if (!x.ventas) x.ventas = { fuente: { archivo: 'Cotizaciones aceptadas', hoja: '—', fecha: new Date().toISOString() }, registros: [], validacion: null, mapeo: {} };
          x.ventas.registros.push({ id: u.uid(), codigo: c.numero, fecha: c.fechaEvento, lugar: c.lugar, tipo: c.tipo, producto: c.paquete, cliente: c.cliente, ingreso: t.total, costoReal: null, cantidad: 1, origen: 'cotización' });
          x.ventas.registros.sort((a, b2) => a.fecha.localeCompare(b2.fecha));
          const cc = x.cotizaciones.find((y) => y.id === c.id); cc.convertida = true;
        });
        ADI.store.log('Cotización pasada a ventas', `${c.numero} · ${u.fmtMoney(t.total)}`);
        u.toast(`${c.numero} se agregó a los registros de ventas.`, 'ok');
        render(el);
      };
    });
  }

  return { render, calcular };
})();
