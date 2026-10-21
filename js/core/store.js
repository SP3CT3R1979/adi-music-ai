/* ADIX Music AI — almacenamiento local de los datos del negocio (se guardan solo en este navegador). */
ADI.store = (() => {
  const KEY = 'adi-music-ai-v1';

  const defaultState = () => ({
    version: 1,
    negocio: {
      nombre: 'ADIX Music Sonidos',
      gastosFijosMensuales: null,
      detalleFijos: '',
      cuotaBanco: null,
      saldoCajaInicial: null,       // efectivo con el que se empieza (opcional)
      saldoCajaReferencia: null,    // saldo estimado que viene en el Excel (si existe)
      interesCuotaPct: null,        // qué parte de la cuota es interés (para utilidad neta)
      tasaImpuestoPct: null,        // impuesto sobre la utilidad (para utilidad neta)
      mesesAnticipacion: 1,         // con cuánta anticipación se contratan los eventos
      pctPublicidad: 5,             // % de ingresos proyectados que se evalúa para publicidad
    },
    paquetes: [],                   // [{nombre, precio, costo}]
    ventas: null,                   // {fuente, registros:[...], validacion, mapeo}
    ga4: null,                      // {fuente, esDemo, filas:[...], validacion}
    movimientos: [],                // ingresos/costos/gastos/pagos adicionales registrados a mano
    presupuesto: { metaVentas: null, metaEventos: null, presupuestoGastos: null, presupuestoPublicidad: null, metaGanancia: null },
    cotizaciones: [],
    chat: [],
    historial: [],
    config: { proveedorIA: 'gemini', geminiKey: '', geminiModelo: 'auto', geminiModelos: [], modeloDetectado: '', claudeKey: '', claudeModelo: 'claude-opus-5-5', pinHash: '' },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return defaultState();
      const s = JSON.parse(raw);
      const d = defaultState();
      // Mezcla con los valores por defecto para tolerar versiones anteriores.
      if (s.negocio && s.negocio.nombre === 'ADI MUSIC') s.negocio.nombre = d.negocio.nombre; // nombre anterior al logo
      return {
        ...d, ...s,
        negocio: { ...d.negocio, ...(s.negocio || {}) },
        presupuesto: { ...d.presupuesto, ...(s.presupuesto || {}) },
        config: { ...d.config, ...(s.config || {}) },
      };
    } catch (e) {
      console.warn('No se pudo leer el almacenamiento local', e);
      return defaultState();
    }
  }

  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
      return true;
    } catch (e) {
      console.error(e);
      ADI.u.toast('No se pudo guardar en este navegador (¿modo privado o sin espacio?).', 'error');
      return false;
    }
  }

  const get = () => state;
  function update(fn) { fn(state); save(); document.dispatchEvent(new CustomEvent('adi:data')); }
  function replaceAll(newState) {
    const d = defaultState();
    state = { ...d, ...newState, negocio: { ...d.negocio, ...(newState.negocio || {}) }, config: { ...d.config, ...(newState.config || {}) } };
    save();
  }
  function reset(keepConfig = true) {
    const cfg = state.config;
    state = defaultState();
    if (keepConfig) state.config = cfg;
    save();
  }
  function log(accion, detalle = '') {
    state.historial.unshift({ fecha: new Date().toISOString(), accion, detalle });
    state.historial = state.historial.slice(0, 200);
    save();
  }

  return { get, update, save, replaceAll, reset, log, defaultState };
})();
