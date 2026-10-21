/* Pantalla: Asistente conversacional con IA. */
ADI.pages.asistente = (() => {
  const u = ADI.u, ui = ADI.ui;
  let ocupado = false;
  let parcial = ''; // texto que va llegando de Claude mientras responde

  const SUGERIDAS = [
    '¿Cómo está mi negocio en resumen?',
    '¿En qué meses vendo más y menos?',
    '¿Qué canal de GA4 atrae más usuarios?',
    '¿Qué debería mejorar?',
    '¿Cuánto dinero me queda realmente?',
    '¿En qué mes me conviene hacer publicidad?',
    '¿Qué significa margen de contribución?',
  ];

  function burbuja(m) {
    const meta = m.rol === 'user' ? u.esc(new Date(m.fecha).toLocaleTimeString('es-PE', { timeStyle: 'short' }))
      : `${m.modo === 'claude' ? `Claude · ${u.esc(m.modelo || '')}` : m.modo === 'gemini' ? `Gemini · ${u.esc(m.modelo || '')}` : 'Modo local (sin IA)'} · ${new Date(m.fecha).toLocaleTimeString('es-PE', { timeStyle: 'short' })}`;
    return `<div class="msg ${m.rol === 'user' ? 'user' : 'model'}">${m.rol === 'user' ? `<p>${u.esc(m.texto)}</p>` : u.md(m.texto)}<div class="meta">${meta}</div></div>`;
  }

  function pintarLog(el) {
    const s = ADI.store.get();
    const log = el.querySelector('#chat-log');
    log.innerHTML = s.chat.length ? s.chat.map(burbuja).join('') : `<div class="msg model"><p>¡Hola! Soy el asistente de <b>ADIX Music AI</b>. Puedo explicarte tus ventas, tus finanzas, las proyecciones y los resultados de GA4 con palabras sencillas, y ayudarte a evaluar decisiones.</p><p>Siempre te mostraré las cifras en las que me baso y te diré cuando falten datos.</p></div>`;
    if (ocupado) log.insertAdjacentHTML('beforeend', parcial ? `<div class="msg model" id="msg-stream">${u.md(parcial)}</div>` : '<div class="msg model pensando" id="msg-stream"><span class="dots">Analizando tus datos</span></div>');
    log.scrollTop = log.scrollHeight;
  }

  async function enviar(el, texto) {
    const q = (texto || '').trim();
    if (!q || ocupado) return;
    const previo = ADI.store.get().chat.slice();
    ADI.store.update((s) => { s.chat.push({ rol: 'user', texto: q, fecha: new Date().toISOString() }); });
    ocupado = true; pintarLog(el);
    let resp;
    if (ADI.ia.disponible()) {
      try {
        parcial = '';
        const r = await ADI.ia.preguntar(q, previo, (t) => {
          parcial = t;
          const box = el.querySelector('#msg-stream');
          if (box) { box.className = 'msg model'; box.innerHTML = u.md(t); const log = el.querySelector('#chat-log'); log.scrollTop = log.scrollHeight; }
        });
        resp = { rol: 'model', texto: r.texto, modo: 'claude', modelo: r.modelo };
      } catch (e) {
        resp = { rol: 'model', texto: `⚠ *No se pudo usar Claude: ${e.message}* Respuesta calculada por la app:\n\n${ADI.ia.respuestaLocal(q)}`, modo: 'local' };
      }
    } else {
      resp = { rol: 'model', texto: ADI.ia.respuestaLocal(q), modo: 'local' };
    }
    resp.fecha = new Date().toISOString();
    ADI.store.update((s) => { s.chat.push(resp); s.chat = s.chat.slice(-60); });
    ADI.store.log('Consulta al asistente', q);
    ocupado = false; parcial = '';
    if (document.body.contains(el)) pintarLog(el);
  }

  function render(el) {
    const s = ADI.store.get();
    const conIA = ADI.ia.disponible();
    const datos = [
      s.ventas?.registros?.length ? `ventas: ${s.ventas.registros.length} registros` : 'ventas: sin cargar',
      s.ga4?.filas?.length ? `GA4: ${s.ga4.esDemo ? 'datos de demostración' : 'informe real'}` : 'GA4: sin cargar',
      `finanzas y proyecciones${s.ventas?.registros?.length ? '' : ': sin datos'}`,
      s.cotizaciones.length ? `${s.cotizaciones.length} cotizaciones` : null,
    ].filter(Boolean).join(' · ');

    el.innerHTML = `<div class="chat">
      ${ui.banner(conIA ? 'ok' : 'info', conIA
        ? `<b>Asistente conectado a Claude</b> (${u.esc(ADI.ia.modeloActual())}). La IA recibe un resumen de: ${u.esc(datos)}.`
        : `<b>Modo local:</b> las respuestas las calcula la app sin IA. Para respuestas más completas, agrega tu clave de API de Claude en <a href="#/configuracion">Configuración</a>. Datos disponibles: ${u.esc(datos)}.`)}
      <div id="chat-log" class="chat-log" aria-live="polite" style="margin-top:12px"></div>
      ${ui.preguntas(SUGERIDAS)}
      <form class="chat-form" id="chat-form">
        <textarea id="chat-in" placeholder="Escribe tu pregunta… (Enter para enviar)" aria-label="Pregunta"></textarea>
        <button class="btn btn-primary" type="submit" aria-label="Enviar">${ui.icon('send')}</button>
        <button class="btn" type="button" id="chat-clear" title="Borrar conversación">${ui.icon('trash')}</button>
      </form>
    </div>`;
    pintarLog(el);
    const inp = el.querySelector('#chat-in');
    el.querySelector('#chat-form').onsubmit = (e) => { e.preventDefault(); const v = inp.value; inp.value = ''; enviar(el, v); };
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.querySelector('#chat-form').requestSubmit(); } });
    el.querySelector('#chat-clear').onclick = () => { if (confirm('¿Borrar la conversación?')) { ADI.store.update((x) => { x.chat = []; }); pintarLog(el); } };
    // Las sugerencias de esta pantalla se envían aquí mismo.
    el.querySelectorAll('[data-ask]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); e.preventDefault(); enviar(el, b.dataset.ask); }));
    if (ADI.app.pendiente) { const q = ADI.app.pendiente; ADI.app.pendiente = null; enviar(el, q); } else inp.focus();
  }

  return { render };
})();
