/* ADIX Music AI — componentes visuales reutilizables. */
ADI.ui = (() => {
  const u = ADI.u;
  const svg = (d, cls = 'ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg>`;
  const ICONOS = {
    home: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    chart: '<path d="M4 20V10"/><path d="M10 20V4"/><path d="M16 20v-7"/><path d="M21 20H3"/>',
    table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
    trend: '<path d="M3 17l6-6 4 4 8-8"/><path d="M14 7h7v7"/>',
    megaphone: '<path d="M3 10v4a1 1 0 0 0 1 1h3l7 4V5L7 9H4a1 1 0 0 0-1 1z"/><path d="M18 8.5a5 5 0 0 1 0 7"/>',
    wallet: '<rect x="2.5" y="6" width="19" height="14" rx="2"/><path d="M2.5 10h19"/><path d="M16 15h2"/>',
    file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/><path d="M8.5 12h.01M12 12h.01M15.5 12h.01"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/>',
    upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/>',
    spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2 2.2.8-2.2.8L19 21l-.8-2.2-2.2-.8 2.2-.8z"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
    alert: '<path d="M12 3l10 18H2z"/><path d="M12 10v5M12 18h.01"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    check: '<circle cx="12" cy="12" r="9"/><path d="M8 12.5l2.5 2.5L16 9.5"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    music: '<path d="M9 18V5l11-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="17" cy="16" r="3"/>',
    print: '<path d="M6 9V3h12v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M6 14h12v7H6z"/>',
    trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/>',
    send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
    download: '<path d="M12 4v12"/><path d="M7 11l5 5 5-5"/><path d="M4 20h16"/>',
  };
  const icon = (n, cls) => svg(ICONOS[n] || '', cls);

  function kpi({ titulo, valor, sub = '', delta = null, deltaBueno = null, estado = '', info = '', estimado = false }) {
    let d = '';
    if (delta != null && isFinite(delta)) {
      const bueno = deltaBueno == null ? delta >= 0 : deltaBueno;
      d = `<span class="delta ${bueno ? 'up' : 'down'}">${u.fmtDelta(delta)}</span>`;
    }
    return `<div class="kpi ${estado ? 'kpi-' + estado : ''}">
      <div class="kpi-t">${u.esc(titulo)}${estimado ? ' <span class="tag tag-amber" title="Calculado con costos estimados">estimado</span>' : ''}${info ? ` <span class="tip" tabindex="0" title="${u.esc(info)}">${icon('info', 'ico ico-xs')}</span>` : ''}</div>
      <div class="kpi-v">${valor}</div>
      <div class="kpi-s">${d}${sub}</div>
    </div>`;
  }

  const card = (titulo, cuerpo, { acciones = '', clase = '', sub = '' } = {}) => `<section class="card ${clase}">
      ${titulo ? `<div class="card-h"><div><h3>${titulo}</h3>${sub ? `<p class="card-sub">${sub}</p>` : ''}</div>${acciones ? `<div class="card-a">${acciones}</div>` : ''}</div>` : ''}
      ${cuerpo}
    </section>`;

  const banner = (tipo, html) => `<div class="banner banner-${tipo}">${icon(tipo === 'ok' ? 'check' : tipo === 'info' ? 'info' : 'alert')}<div>${html}</div></div>`;

  const vacio = (titulo, texto, acciones = '') => `<div class="empty">${icon('music', 'ico ico-xl')}<h3>${titulo}</h3><p>${texto}</p><div class="empty-a">${acciones}</div></div>`;

  const preguntas = (lista) => `<div class="chips">${lista.map((q) => `<button class="chip" data-ask="${u.esc(q)}">${icon('spark', 'ico ico-xs')} ${u.esc(q)}</button>`).join('')}</div>`;

  function tabla(headers, filas, { clase = '', vacioTxt = 'Sin datos' } = {}) {
    if (!filas.length) return `<p class="muted">${vacioTxt}</p>`;
    return `<div class="table-wrap"><table class="tbl ${clase}"><thead><tr>${headers.map((h) => `<th${h.num ? ' class="num"' : ''}>${h.t ?? h}</th>`).join('')}</tr></thead>
      <tbody>${filas.map((f) => `<tr${f.cls ? ` class="${f.cls}"` : ''}>${(f.celdas || f).map((c, i) => `<td${headers[i]?.num ? ' class="num"' : ''}>${c ?? '—'}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  }

  function validacion(v) {
    if (!v) return '';
    const bloque = (tipo, titulo, items) => items?.length ? `<details class="val val-${tipo}" ${tipo === 'error' ? 'open' : ''}><summary>${titulo} (${items.length})</summary><ul>${items.map((x) => `<li>${u.esc(x)}</li>`).join('')}</ul></details>` : '';
    return bloque('error', 'Filas con errores (no se usaron)', v.errores) + bloque('warn', 'Advertencias de calidad de datos', v.advertencias) + bloque('info', 'Observaciones', v.info);
  }

  function modal(html, { ancho = '640px' } = {}) {
    cerrarModal();
    const m = document.createElement('div');
    m.className = 'modal-bg'; m.id = 'modal';
    m.innerHTML = `<div class="modal" role="dialog" aria-modal="true" style="max-width:${ancho}"><button class="icon-btn modal-x" data-close aria-label="Cerrar">${icon('x')}</button>${html}</div>`;
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-close]')) cerrarModal(); });
    document.body.appendChild(m);
    return m.querySelector('.modal');
  }
  const cerrarModal = () => document.getElementById('modal')?.remove();

  // Abre el asistente con una pregunta lista para enviarse.
  function preguntarIA(pregunta) {
    ADI.app.pendiente = pregunta;
    if (location.hash === '#/asistente') ADI.app.render(); else location.hash = '#/asistente';
  }

  function selectorPeriodo(meses, desde, hasta, id = 'per') {
    const opts = (sel) => meses.map((m) => `<option value="${m}" ${m === sel ? 'selected' : ''}>${u.monthLabel(m)}</option>`).join('');
    return `<div class="filtros"><label>Desde <select id="${id}-desde">${opts(desde)}</select></label><label>Hasta <select id="${id}-hasta">${opts(hasta)}</select></label></div>`;
  }

  return { icon, kpi, card, banner, vacio, preguntas, tabla, validacion, modal, cerrarModal, preguntarIA, selectorPeriodo };
})();
