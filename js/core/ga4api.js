/* ADIX Music AI — conexión directa con Google Analytics 4 (Google Analytics Data API) mediante una cuenta de servicio. */
ADI.ga4api = (() => {
  const u = ADI.u;
  const SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
  const API = 'https://analyticsdata.googleapis.com/v1beta';
  let token = null; // { valor, vence } en memoria; nunca se guarda

  const cfg = () => ADI.store.get().config;
  const configurado = () => !!(cfg().ga4PropertyId && cfg().ga4Credencial && cfg().ga4Credencial.private_key);

  // Valida el archivo JSON de la cuenta de servicio descargado de Google Cloud.
  function leerCredencial(texto) {
    let c;
    try { c = JSON.parse(texto); } catch (_) { throw new Error('El archivo no es un JSON válido.'); }
    if (c.type !== 'service_account' || !c.client_email || !c.private_key) throw new Error('El archivo no es la clave de una cuenta de servicio (falta client_email o private_key).');
    return { type: c.type, project_id: c.project_id || '', client_email: c.client_email, private_key: c.private_key, private_key_id: c.private_key_id || '', token_uri: c.token_uri || 'https://oauth2.googleapis.com/token' };
  }

  // ---------- Token de acceso: JWT firmado con la clave privada (RS256) ----------
  const b64url = (bytes) => u.bufToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const b64urlTexto = (s) => b64url(new TextEncoder().encode(s));

  async function firmarJWT(cred, ahora = Math.floor(Date.now() / 1000)) {
    if (!window.crypto || !crypto.subtle) throw new Error('Este navegador no permite firmar la credencial (abre la app con https o desde localhost).');
    const pem = cred.private_key.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    const clave = await crypto.subtle.importKey('pkcs8', u.base64ToBuf(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const cabecera = { alg: 'RS256', typ: 'JWT' };
    if (cred.private_key_id) cabecera.kid = cred.private_key_id;
    const cuerpo = { iss: cred.client_email, scope: SCOPE, aud: cred.token_uri, iat: ahora, exp: ahora + 3600 };
    const sinFirma = b64urlTexto(JSON.stringify(cabecera)) + '.' + b64urlTexto(JSON.stringify(cuerpo));
    const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', clave, new TextEncoder().encode(sinFirma));
    return sinFirma + '.' + b64url(firma);
  }

  async function obtenerToken() {
    if (token && token.vence > Date.now() + 60000) return token.valor;
    const cred = cfg().ga4Credencial;
    const jwt = await firmarJWT(cred);
    let r;
    try {
      r = await fetch(cred.token_uri, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + encodeURIComponent(jwt) });
    } catch (_) { throw new Error('No hay conexión con Google (revisa tu internet).'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !data.access_token) {
      const det = `${data.error || ''} ${data.error_description || ''}`.trim();
      if (/invalid_grant|invalid_client|unauthorized_client/i.test(det)) throw new Error('Google rechazó la clave de la cuenta de servicio (puede haber sido eliminada o el archivo no es el correcto). Detalle: ' + det);
      throw new Error('No se pudo obtener acceso de Google. ' + det);
    }
    token = { valor: data.access_token, vence: Date.now() + (data.expires_in || 3600) * 1000 };
    return token.valor;
  }

  function errorAPI(status, body) {
    const msg = String((body && body.error && body.error.message) || '').slice(0, 300);
    const correo = cfg().ga4Credencial?.client_email || 'la cuenta de servicio';
    if (/has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return 'Falta activar la "Google Analytics Data API" en el proyecto de Google Cloud (APIs y servicios → Biblioteca).';
    if (status === 403) return `La cuenta de servicio no tiene acceso a esa propiedad. En GA4 → Administrar → Administración de acceso a la propiedad, agrega ${correo} con el rol "Lector".`;
    if (status === 400 && /property/i.test(msg)) return 'El ID de propiedad no es válido. Debe ser solo el número (por ejemplo 412345678), no el ID de medición G-XXXX.';
    if (status === 404) return 'No se encontró esa propiedad de GA4. Revisa el ID de propiedad.';
    if (status === 429) return 'Se alcanzó el límite de consultas de Google Analytics por ahora. Intenta en unos minutos.';
    return `Error de Google Analytics (${status}): ${msg}`;
  }

  async function runReport(cuerpo) {
    const id = String(cfg().ga4PropertyId).replace(/\D/g, '');
    const t = await obtenerToken();
    let r;
    try {
      r = await fetch(`${API}/properties/${id}:runReport`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify(cuerpo) });
    } catch (_) { throw new Error('No hay conexión con Google Analytics (revisa tu internet).'); }
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(errorAPI(r.status, data));
    return data;
  }

  // Prueba rápida: pide los usuarios de los últimos 7 días.
  async function probar() {
    const d = await runReport({ dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }], metrics: [{ name: 'activeUsers' }] });
    const usuarios = d.rows && d.rows[0] ? +d.rows[0].metricValues[0].value : 0;
    return { usuarios, propiedad: String(cfg().ga4PropertyId) };
  }

  const METRICAS = ['activeUsers', 'newUsers', 'sessions', 'engagedSessions', 'keyEvents', 'userEngagementDuration', 'screenPageViews'];

  // Trae el informe por mes × canal × campaña y lo deja en el mismo formato que una exportación CSV de GA4.
  async function importar() {
    const s = ADI.store.get();
    const v = ADI.kpi.analizar(s);
    const desde = !v.vacio ? `${v.primerMes}-01` : '365daysAgo';
    const filas = [];
    let offset = 0;
    for (let pagina = 0; pagina < 10; pagina++) {
      const d = await runReport({
        dateRanges: [{ startDate: desde, endDate: 'today' }],
        dimensions: [{ name: 'yearMonth' }, { name: 'sessionDefaultChannelGroup' }, { name: 'sessionCampaignName' }],
        metrics: METRICAS.map((name) => ({ name })),
        limit: 10000, offset,
      });
      (d.rows || []).forEach((row) => {
        const dim = row.dimensionValues.map((x) => x.value);
        const m = Object.fromEntries(METRICAS.map((k, i) => [k, +row.metricValues[i].value || 0]));
        filas.push({
          mes: u.parseMonth(dim[0]), canal: dim[1] || '(sin canal)', fuente: '', campana: dim[2] || '',
          usuarios: m.activeUsers, usuariosNuevos: m.newUsers, sesiones: m.sessions, sesionesInteraccion: m.engagedSessions,
          tiempoMedio: m.sessions ? m.userEngagementDuration / m.sessions : null, vistas: m.screenPageViews,
          eventosClave: m.keyEvents, ingresos: 0, inversion: 0,
        });
      });
      offset += (d.rows || []).length;
      if (!d.rowCount || offset >= d.rowCount || !(d.rows || []).length) break;
    }
    if (!filas.length) throw new Error('La propiedad de GA4 no tiene datos en ese periodo. Revisa que la etiqueta de GA4 esté instalada en la web y que haya visitas.');
    const advertencias = [
      'La inversión publicitaria no viene de GA4: regístrala en Finanzas (gasto, categoría Publicidad) para calcular el costo por contacto.',
    ];
    if (!filas.some((f) => f.eventosClave > 0)) advertencias.push('No hay eventos clave en este periodo: configura en GA4 un evento clave (por ejemplo, clic en WhatsApp) para medir contactos.');
    const nombre = `Google Analytics 4 · propiedad ${cfg().ga4PropertyId}`;
    ADI.store.update((x) => { x.ga4 = { fuente: { archivo: nombre, tipo: 'API', fecha: new Date().toISOString(), nota: `Periodo: ${desde} a hoy` }, esDemo: false, filas, validacion: { errores: [], advertencias, total: filas.length } }; });
    ADI.store.log('GA4 conectado por API', `${filas.length} filas desde ${desde}`);
    return filas.length;
  }

  const olvidarToken = () => { token = null; };

  return { configurado, leerCredencial, firmarJWT, probar, importar, olvidarToken };
})();
