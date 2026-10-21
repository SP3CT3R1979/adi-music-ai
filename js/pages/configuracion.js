/* Pantalla: Configuración (IA, seguridad, parámetros del negocio, paquetes, respaldo e historial). */
ADI.pages.configuracion = (() => {
  const u = ADI.u, ui = ADI.ui;
  const num = (v) => (v === '' || v == null ? null : +v);

  function render(el) {
    const s = ADI.store.get();
    const c = s.config, n = s.negocio;
    el.innerHTML = `<div class="stack">
      <div class="grid g2">
        ${ui.card('Inteligencia artificial (Claude, de Anthropic)', `
          <ol class="list small" style="margin-bottom:12px">
            <li>Entra a <b>platform.claude.com</b> e inicia sesión.</li>
            <li>Ve a <b>API Keys → Create Key</b> y copia la clave (empieza con <code>sk-ant-</code>).</li>
            <li>La API es de pago por uso: la cuenta necesita créditos en <b>Billing</b>.</li>
            <li>Pega la clave aquí y pulsa <b>Guardar y probar conexión</b>.</li>
          </ol>
          <form id="cf-ia" class="form">
            <label class="full">Clave de API de Claude<input type="password" name="key" value="${u.esc(c.claudeKey)}" placeholder="sk-ant-…" autocomplete="off"></label>
            <label class="full">Modelo<select name="modelo">${ADI.ia.MODELOS.map((m) => `<option value="${m.id}" ${m.id === ADI.ia.modeloActual() ? 'selected' : ''}>${u.esc(m.nombre)}</option>`).join('')}</select></label>
            <div class="row full"><button class="btn btn-primary" type="submit">Guardar y probar conexión</button>${c.claudeKey ? '<button class="btn btn-danger" type="button" id="cf-ia-del">Quitar clave</button>' : ''}</div>
          </form>
          <p class="muted small" style="margin-top:10px">Al preguntar, la app envía a Claude un <b>resumen</b> de los datos (totales, KPI, meses), no el archivo completo. Cada pregunta cuesta unos centavos de dólar; las siguientes salen más baratas porque los datos quedan en caché unos minutos. Sin clave, el asistente funciona en modo local.</p>
          <p class="muted small">⚠ La clave queda guardada en este navegador y la app la usa directamente desde aquí (no hay servidor intermedio). Úsala solo en computadoras de confianza, ponle un límite de gasto en la consola y quítala al terminar si la computadora no es tuya.</p>
          <div id="cf-ia-res"></div>`)}
        ${ui.card('Seguridad', `
          <p class="muted small">Protege el acceso con un PIN. Se pedirá al abrir la aplicación en este navegador.</p>
          <form id="cf-pin" class="form">
            <label>${c.pinHash ? 'Nuevo PIN' : 'PIN (4 a 8 dígitos)'}<input type="password" name="pin" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="new-password" required></label>
            <label>Repetir PIN<input type="password" name="pin2" inputmode="numeric" pattern="[0-9]{4,8}" autocomplete="new-password" required></label>
            <div class="row full"><button class="btn btn-primary" type="submit">${c.pinHash ? 'Cambiar PIN' : 'Activar PIN'}</button>${c.pinHash ? '<button class="btn btn-danger" type="button" id="cf-pin-del">Quitar PIN</button>' : ''}</div>
          </form>
          <p class="muted small" style="margin-top:10px">Los datos se guardan en este navegador (almacenamiento local). Haz respaldos con frecuencia y no uses la app en computadoras públicas sin PIN.</p>`)}
      </div>

      ${ui.card('Parámetros del negocio', `<form id="cf-neg" class="form">
          <label>Nombre del negocio<input name="nombre" value="${u.esc(n.nombre)}"></label>
          <label>Gastos fijos mensuales (S/)<input type="number" min="0" step="10" name="gastosFijosMensuales" value="${n.gastosFijosMensuales ?? ''}"></label>
          <label class="full">Detalle de gastos fijos<input name="detalleFijos" value="${u.esc(n.detalleFijos)}"></label>
          <label>Cuota mensual al banco (S/)<input type="number" min="0" step="1" name="cuotaBanco" value="${n.cuotaBanco ?? ''}"></label>
          <label>Parte de la cuota que es interés (%)<input type="number" min="0" max="100" step="0.1" name="interesCuotaPct" value="${n.interesCuotaPct ?? ''}" placeholder="Ver cronograma del banco"></label>
          <label>Tasa de impuesto sobre la utilidad (%)<input type="number" min="0" max="100" step="0.1" name="tasaImpuestoPct" value="${n.tasaImpuestoPct ?? ''}" placeholder="Según régimen tributario"></label>
          <label>Efectivo al inicio del periodo (S/)<input type="number" step="10" name="saldoCajaInicial" value="${n.saldoCajaInicial ?? ''}" placeholder="0"></label>
          <div class="full"><button class="btn btn-primary" type="submit">Guardar parámetros</button></div>
        </form>
        <p class="muted small" style="margin-top:10px">El interés de la cuota y la tasa de impuestos permiten calcular la <b>utilidad neta</b>. Si no los conoces, déjalos vacíos: la app lo indicará en vez de inventarlos.</p>`)}

      ${ui.card('Paquetes y costos', `<div class="table-wrap"><table class="tbl" id="cf-paq"><thead><tr><th>Paquete</th><th class="num">Precio referencial (S/)</th><th class="num">Costo variable estimado (S/)</th><th class="num">Margen</th><th></th></tr></thead><tbody>
          ${s.paquetes.map((p, i) => `<tr data-i="${i}"><td><input data-f="nombre" value="${u.esc(p.nombre)}"></td><td class="num"><input data-f="precio" type="number" min="0" step="10" value="${p.precio ?? ''}"></td><td class="num"><input data-f="costo" type="number" min="0" step="10" value="${p.costo ?? ''}"></td><td class="num">${p.precio != null && p.costo != null ? u.fmtMoney(p.precio - p.costo) : '—'}</td><td><button class="icon-btn" data-quitar="${i}" title="Quitar">${ui.icon('trash', 'ico ico-xs')}</button></td></tr>`).join('')}
        </tbody></table></div><div class="row" style="margin-top:10px"><button class="btn btn-sm" id="cf-paq-add">+ Agregar paquete</button></div>`, { sub: 'Se usan para estimar costos, márgenes y cotizaciones.' })}

      <div class="grid g2">
        ${ui.card('Respaldo de datos', `<p class="muted small">Descarga una copia de todos los datos (ventas, GA4, finanzas, cotizaciones y conversación). No incluye la clave de Claude ni el PIN.</p>
          <div class="row"><button class="btn" id="cf-exp">${ui.icon('download')} Descargar respaldo</button><button class="btn" id="cf-imp">${ui.icon('upload')} Restaurar respaldo</button><button class="btn btn-danger" id="cf-reset">${ui.icon('trash')} Borrar todos los datos</button></div>`)}
        ${ui.card('Historial de análisis y consultas', ui.tabla(['Fecha', 'Acción', 'Detalle'], s.historial.slice(0, 40).map((h) => [new Date(h.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' }), u.esc(h.accion), `<span class="small">${u.esc(h.detalle)}</span>`]), { vacioTxt: 'Todavía no hay actividad registrada.' }))}
      </div>
    </div>`;

    // IA
    el.querySelector('#cf-ia').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const key = String(fd.get('key') || '').trim();
      ADI.store.update((x) => { x.config.claudeKey = key; x.config.claudeModelo = fd.get('modelo') || ADI.ia.MODELO_DEFECTO; });
      const res = el.querySelector('#cf-ia-res');
      if (!key) { res.innerHTML = ''; ADI.app.estadoDatos(); return; }
      res.innerHTML = '<p class="dots muted" style="margin-top:10px">Probando conexión con Claude</p>';
      try {
        const m = await ADI.ia.probarConexion();
        ADI.store.log('Claude conectado', m);
        render(el);
        el.querySelector('#cf-ia-res').innerHTML = ui.banner('ok', `Conexión correcta con Claude. Modelo: <b>${u.esc(m)}</b>. Ya puedes preguntar en el Asistente IA.`);
      } catch (err) {
        res.innerHTML = ui.banner('error', u.esc(err.message));
      }
      ADI.app.estadoDatos();
    };
    const iaDel = el.querySelector('#cf-ia-del');
    if (iaDel) iaDel.onclick = () => { ADI.store.update((x) => { x.config.claudeKey = ''; }); render(el); ADI.app.estadoDatos(); };

    // PIN
    el.querySelector('#cf-pin').onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const pin = String(fd.get('pin')), pin2 = String(fd.get('pin2'));
      if (!/^\d{4,8}$/.test(pin)) { u.toast('El PIN debe tener de 4 a 8 dígitos.', 'error'); return; }
      if (pin !== pin2) { u.toast('Los PIN no coinciden.', 'error'); return; }
      const h = await u.sha256('adi:' + pin);
      ADI.store.update((x) => { x.config.pinHash = h; });
      try { sessionStorage.setItem('adi-ok', '1'); } catch (_) { /* sin sessionStorage */ }
      ADI.store.log('PIN de acceso actualizado');
      u.toast('PIN guardado.', 'ok'); render(el); ADI.app.estadoDatos();
    };
    const pinDel = el.querySelector('#cf-pin-del');
    if (pinDel) pinDel.onclick = () => { if (confirm('¿Quitar el PIN de acceso?')) { ADI.store.update((x) => { x.config.pinHash = ''; }); render(el); ADI.app.estadoDatos(); } };

    // Parámetros
    el.querySelector('#cf-neg').onsubmit = (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      ADI.store.update((x) => {
        x.negocio.nombre = String(fd.get('nombre') || 'ADIX Music Sonidos').trim();
        x.negocio.detalleFijos = String(fd.get('detalleFijos') || '').trim();
        ['gastosFijosMensuales', 'cuotaBanco', 'interesCuotaPct', 'tasaImpuestoPct', 'saldoCajaInicial'].forEach((k) => { x.negocio[k] = num(fd.get(k)); });
      });
      ADI.store.log('Parámetros del negocio actualizados');
      u.toast('Parámetros guardados.', 'ok');
    };

    // Paquetes
    el.querySelectorAll('#cf-paq input').forEach((inp) => {
      inp.onchange = () => {
        const i = +inp.closest('tr').dataset.i, f = inp.dataset.f;
        ADI.store.update((x) => { x.paquetes[i][f] = f === 'nombre' ? inp.value.trim() : num(inp.value); });
        render(el);
      };
    });
    el.querySelectorAll('[data-quitar]').forEach((b) => { b.onclick = () => { ADI.store.update((x) => { x.paquetes.splice(+b.dataset.quitar, 1); }); render(el); }; });
    el.querySelector('#cf-paq-add').onclick = () => { ADI.store.update((x) => { x.paquetes.push({ nombre: 'Nuevo paquete', precio: null, costo: null }); }); render(el); };

    // Respaldo
    el.querySelector('#cf-exp').onclick = () => {
      const copia = JSON.parse(JSON.stringify(ADI.store.get()));
      copia.config = { ...copia.config, claudeKey: '', pinHash: '' };
      u.download(`respaldo-adi-music-ai-${u.today()}.json`, JSON.stringify(copia, null, 1));
      ADI.store.log('Respaldo descargado');
    };
    el.querySelector('#cf-imp').onclick = () => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
      inp.onchange = async () => {
        try {
          const data = JSON.parse(await u.readAsText(inp.files[0]));
          if (!data || typeof data !== 'object' || !('negocio' in data)) throw new Error('El archivo no es un respaldo de ADIX Music AI.');
          if (!confirm('Se reemplazarán los datos actuales por los del respaldo. ¿Continuar?')) return;
          const cfg = ADI.store.get().config;
          ADI.store.replaceAll({ ...data, config: { ...data.config, claudeKey: cfg.claudeKey, pinHash: cfg.pinHash } });
          ADI.store.log('Respaldo restaurado', inp.files[0].name);
          u.toast('Respaldo restaurado.', 'ok'); ADI.app.render();
        } catch (err) { u.toast(err.message || 'No se pudo leer el respaldo.', 'error'); }
      };
      inp.click();
    };
    el.querySelector('#cf-reset').onclick = () => {
      if (!confirm('Se borrarán ventas, GA4, finanzas, cotizaciones, conversación e historial de este navegador. La clave de Claude y el PIN se conservan. ¿Continuar?')) return;
      ADI.store.reset(true);
      u.toast('Datos borrados.', 'ok'); location.hash = '#/inicio'; ADI.app.render();
    };
  }

  return { render };
})();
