/* ADIX Music AI — estructura de la aplicación: menú, navegación, estado y acceso con PIN. */
ADI.pages = ADI.pages || {};

ADI.app = (() => {
  const u = ADI.u, ui = ADI.ui;
  const RUTAS = [
    { id: 'inicio', titulo: 'Inicio', icono: 'home' },
    { id: 'ga4', titulo: 'Analítica GA4', icono: 'chart' },
    { id: 'ventas', titulo: 'Ventas y KPI', icono: 'table' },
    { id: 'proyecciones', titulo: 'Proyecciones', icono: 'trend' },
    { id: 'publicidad', titulo: 'Publicidad y decisiones', icono: 'megaphone' },
    { id: 'finanzas', titulo: 'Finanzas', icono: 'wallet' },
    { id: 'cotizaciones', titulo: 'Cotizaciones', icono: 'file' },
    { id: 'asistente', titulo: 'Asistente IA', icono: 'spark' },
    { id: 'configuracion', titulo: 'Configuración', icono: 'gear' },
  ];

  function construirMenu() {
    const nav = document.getElementById('nav');
    nav.innerHTML = RUTAS.map((r) => `<a href="#/${r.id}" data-ruta="${r.id}">${ui.icon(r.icono)}<span>${r.titulo}</span></a>`).join('');
    document.getElementById('menu-btn').innerHTML = ui.icon('menu');
    document.getElementById('menu-btn').addEventListener('click', () => document.body.classList.toggle('nav-open'));
    document.getElementById('nav-bg').addEventListener('click', () => document.body.classList.remove('nav-open'));
    document.getElementById('btn-excel').innerHTML = `${ui.icon('download', 'ico ico-xs')}<span>Excel</span>`;
    document.getElementById('btn-excel').addEventListener('click', () => ADI.exportar.excel());
    document.getElementById('btn-pdf').innerHTML = `${ui.icon('print', 'ico ico-xs')}<span>PDF</span>`;
    document.getElementById('btn-pdf').addEventListener('click', () => ADI.exportar.pdf());
    document.getElementById('lock-btn').innerHTML = ui.icon('lock');
    document.getElementById('lock-btn').addEventListener('click', bloquear);
  }

  function estadoDatos() {
    const s = ADI.store.get();
    const chip = (cls, txt, href) => `<a class="status ${cls}" href="#/${href}">${txt}</a>`;
    const n = s.ventas?.registros?.length || 0;
    const ex = n ? chip('ok', `Excel: ${n} ventas`, 'ventas') : chip('off', 'Sin Excel', 'ventas');
    const ga = s.ga4?.filas?.length ? chip(s.ga4.esDemo ? 'demo' : 'ok', s.ga4.esDemo ? 'GA4: demo' : 'GA4: cargado', 'ga4') : chip('off', 'Sin GA4', 'ga4');
    const ia = ADI.ia.disponible() ? chip('ok', `IA: ${ADI.ia.nombreProveedor()}`, 'configuracion') : chip('off', 'IA: modo local', 'configuracion');
    document.getElementById('status').innerHTML = ex + ga + ia;
    document.getElementById('lock-btn').hidden = !s.config.pinHash;
  }

  function rutaActual() {
    const id = (location.hash.match(/^#\/([\w-]+)/) || [])[1] || 'inicio';
    return RUTAS.find((r) => r.id === id) || RUTAS[0];
  }

  function render() {
    const r = rutaActual();
    ADI.charts.destruirTodos();
    ui.cerrarModal();
    document.body.classList.remove('nav-open');
    document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('active', a.dataset.ruta === r.id));
    document.getElementById('page-title').textContent = r.titulo;
    document.title = `${r.titulo} · ADIX Music AI`;
    estadoDatos();
    const view = document.getElementById('view');
    view.innerHTML = '';
    view.scrollTop = 0; window.scrollTo(0, 0);
    try {
      const page = ADI.pages[r.id];
      if (!page) throw new Error('Página no encontrada');
      page.render(view);
    } catch (e) {
      console.error(e);
      view.innerHTML = ui.card('Ocurrió un problema', `<p>No se pudo mostrar esta sección: ${u.esc(e.message)}</p><p class="muted">Tus datos siguen guardados. Prueba recargar la página o revisar el archivo importado.</p>`);
    }
  }

  // ---------- Acceso con PIN ----------
  const desbloqueado = () => { try { return sessionStorage.getItem('adi-ok') === '1'; } catch (_) { return false; } };
  function bloquear() { try { sessionStorage.removeItem('adi-ok'); } catch (_) { /* sin sessionStorage */ } mostrarLock(); }
  function mostrarLock() {
    const lock = document.getElementById('lock');
    lock.hidden = false;
    lock.innerHTML = `<form class="lock-box" id="lock-form">
        <img class="lock-logo" src="img/logo-adix.jpg" alt="Logo de ADIX Music Sonidos">
        <h2>ADIX Music AI</h2>
        <p>Ingresa tu PIN para ver la información del negocio.</p>
        <input id="lock-pin" type="password" inputmode="numeric" autocomplete="current-password" placeholder="PIN" aria-label="PIN" required>
        <button class="btn btn-primary" type="submit">Entrar</button>
        <p class="lock-err" id="lock-err" role="alert"></p>
      </form>`;
    document.getElementById('lock-pin').focus();
    document.getElementById('lock-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const pin = document.getElementById('lock-pin').value.trim();
      const h = await u.sha256('adi:' + pin);
      if (h === ADI.store.get().config.pinHash) {
        try { sessionStorage.setItem('adi-ok', '1'); } catch (_) { /* sin sessionStorage */ }
        lock.hidden = true; lock.innerHTML = '';
        render();
      } else {
        document.getElementById('lock-err').textContent = 'PIN incorrecto.';
        document.getElementById('lock-pin').select();
      }
    });
  }

  function iniciar() {
    construirMenu();
    document.addEventListener('click', (e) => {
      const a = e.target.closest('[data-ask]');
      if (a) { e.preventDefault(); ui.preguntarIA(a.dataset.ask); }
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') ui.cerrarModal(); });
    window.addEventListener('hashchange', render);
    window.addEventListener('error', (e) => { console.error(e.error || e.message); });
    window.addEventListener('unhandledrejection', (e) => { console.error(e.reason); u.toast(e.reason?.message || 'Ocurrió un error inesperado.', 'error'); });
    if (ADI.store.get().config.pinHash && !desbloqueado()) mostrarLock();
    else render();
  }

  document.addEventListener('DOMContentLoaded', iniciar);
  return { render, estadoDatos, RUTAS, pendiente: null };
})();
