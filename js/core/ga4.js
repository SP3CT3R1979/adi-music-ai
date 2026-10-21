/* ADIX Music AI — importación y análisis de informes de Google Analytics 4 (CSV, Excel o PDF). */
ADI.ga4 = (() => {
  const u = ADI.u;

  const CANALES = {
    'organic social': 'Redes sociales orgánicas (TikTok, Facebook…)',
    'paid social': 'Publicidad pagada en redes (TikTok Ads, Meta Ads)',
    'organic search': 'Búsqueda en Google (orgánica)',
    'paid search': 'Búsqueda pagada (Google Ads)',
    direct: 'Directo (escriben la dirección o enlace guardado)',
    referral: 'Referencias (enlaces desde otras páginas o WhatsApp)',
    'organic video': 'Video orgánico (YouTube…)',
    email: 'Correo electrónico',
    unassigned: 'Sin asignar',
  };
  const nombreCanal = (c) => CANALES[u.norm(c)] || c;

  const COLS = [
    { id: 'mes', sin: ['ano y mes', 'mes', 'year month', 'month', 'fecha', 'date', 'dia', 'semana'] },
    { id: 'canal', sin: ['grupo de canales predeterminado de la sesion', 'grupo de canales predeterminado', 'grupo de canales predeterminado del primer usuario', 'grupo de canales', 'canal', 'session default channel group', 'default channel group', 'first user default channel group', 'channel'] },
    { id: 'fuente', sin: ['fuente / medio de la sesion', 'fuente/medio de la sesion', 'fuente / medio', 'fuente de la sesion', 'session source / medium', 'source / medium', 'fuente', 'source'] },
    { id: 'campana', sin: ['campana de la sesion', 'campana', 'session campaign', 'campaign', 'nombre de la campana'] },
    { id: 'usuarios', sin: ['usuarios activos', 'usuarios', 'total de usuarios', 'active users', 'users', 'total users'] },
    { id: 'usuariosNuevos', sin: ['usuarios nuevos', 'new users'] },
    { id: 'sesiones', sin: ['sesiones', 'sessions'] },
    { id: 'sesionesInteraccion', sin: ['sesiones con interaccion', 'engaged sessions'] },
    { id: 'tiempoMedio', sin: ['tiempo medio de interaccion por sesion', 'tiempo medio de interaccion', 'average engagement time per session', 'average engagement time'] },
    { id: 'vistas', sin: ['vistas', 'views', 'numero de vistas'] },
    { id: 'eventosClave', sin: ['eventos clave', 'conversiones', 'key events', 'conversions'] },
    { id: 'ingresos', sin: ['ingresos totales', 'total revenue', 'ingresos'] },
    { id: 'inversion', sin: ['coste de anuncios', 'costo de anuncios', 'coste de publicidad', 'costo de publicidad', 'ads cost', 'cost', 'coste', 'inversion', 'inversion publicitaria'] },
  ];
  const METRICAS = ['usuarios', 'usuariosNuevos', 'sesiones', 'sesionesInteraccion', 'vistas', 'eventosClave', 'ingresos', 'inversion'];

  function mapear(headers) {
    const mapeo = {};
    const usadas = new Set();
    const cands = [];
    headers.forEach((h, col) => {
      const n = u.norm(h).replace(/[:]/g, '');
      COLS.forEach((c) => c.sin.forEach((s) => {
        let sc = 0;
        if (n === s) sc = 3; else if (n.startsWith(s)) sc = 2; else if (s.length > 4 && n.includes(s)) sc = 1;
        if (sc) cands.push({ col, id: c.id, sc: sc + s.length / 100 });
      }));
    });
    cands.sort((a, b) => b.sc - a.sc);
    cands.forEach((c) => { if (mapeo[c.id] == null && !usadas.has(c.col)) { mapeo[c.id] = c.col; usadas.add(c.col); } });
    return mapeo;
  }

  // Convierte filas (arreglos) de un CSV/Excel de GA4 en registros normalizados.
  function desdeFilas(filas, nombreArchivo) {
    const limpias = filas.filter((r) => r && r.some((c) => c != null && String(c).trim() !== ''));
    const comentarios = limpias.filter((r) => String(r[0] ?? '').trim().startsWith('#')).map((r) => r.join(' ').replace(/^#\s*/, ''));
    const datos = limpias.filter((r) => !String(r[0] ?? '').trim().startsWith('#'));
    let enc = null;
    for (let i = 0; i < Math.min(datos.length, 15); i++) {
      const mp = mapear(datos[i].map((c) => String(c ?? '')));
      const nMet = METRICAS.filter((m) => mp[m] != null).length;
      if (nMet >= 1 && (!enc || nMet > enc.nMet)) enc = { i, mp, nMet };
    }
    if (!enc) throw new Error('No se encontraron columnas de GA4 (usuarios, sesiones, eventos clave…). Exporta el informe desde GA4 como CSV.');
    const { mp } = enc;
    const filasOut = []; const errores = [];
    let anioRef = null;
    const ini = comentarios.join(' ').match(/(?:inicio|start date)[^0-9]*(\d{8})/i);
    if (ini) anioRef = ini[1].slice(0, 4);
    for (let r = enc.i + 1; r < datos.length; r++) {
      const row = datos[r];
      const first = u.norm(row[0]);
      if (/^(total|totales|grand total)/.test(first)) continue;
      const out = { mes: null, canal: '', fuente: '', campana: '' };
      if (mp.mes != null) {
        let v = row[mp.mes];
        if (/^\d{1,2}$/.test(String(v ?? '').trim()) && anioRef) v = `${anioRef}${String(v).trim().padStart(2, '0')}`;
        out.mes = u.parseMonth(v);
      }
      ['canal', 'fuente', 'campana'].forEach((k) => { if (mp[k] != null) out[k] = String(row[mp[k]] ?? '').trim(); });
      let hay = false;
      METRICAS.forEach((m) => { if (mp[m] != null) { const v = u.parseNumber(row[mp[m]]); out[m] = v ?? 0; if (v != null) hay = true; } });
      if (mp.tiempoMedio != null) out.tiempoMedio = u.parseNumber(row[mp.tiempoMedio]);
      if (!hay) { errores.push(`Fila ${r + 1}: sin valores numéricos, se omitió.`); continue; }
      if (!out.canal && out.fuente) out.canal = out.fuente;
      filasOut.push(out);
    }
    const advertencias = [];
    if (mp.mes == null) advertencias.push('El informe no tiene desglose por mes o fecha: no se pueden ver tendencias en el tiempo.');
    if (mp.canal == null && mp.fuente == null) advertencias.push('El informe no tiene canal ni fuente: no se puede saber de dónde llegan los usuarios.');
    if (mp.eventosClave == null) advertencias.push('El informe no tiene eventos clave (conversiones): no se puede medir cuántos contactos genera la web.');
    if (mp.inversion == null) advertencias.push('El informe no tiene inversión publicitaria: no se puede calcular el costo por resultado.');
    const esDemo = comentarios.some((c) => /demostraci|demo/i.test(u.norm(c)));
    return { filas: filasOut, columnas: Object.keys(mp), validacion: { errores, advertencias, total: filasOut.length }, esDemo, nota: comentarios.join(' | ').slice(0, 400), archivo: nombreArchivo };
  }

  async function importarArchivo(file) {
    const ext = (file.name.split('.').pop() || '').toLowerCase();
    if (ext === 'pdf') return importarPDF(file);
    let filas;
    if (['csv', 'txt', 'tsv'].includes(ext)) filas = u.parseCSV(await u.readAsText(file));
    else if (['xlsx', 'xls'].includes(ext)) {
      const libro = ADI.excel.leerBuffer(await u.readAsArrayBuffer(file), file.name);
      filas = libro.hojas[0].filas.map((r) => r.map((c) => (c == null ? '' : c)));
    } else throw new Error('Formato no admitido. Usa CSV, Excel o PDF exportado de GA4.');
    return { ...desdeFilas(filas, file.name), tipo: ext.toUpperCase() };
  }

  // PDF: se envía a Gemini para extraer las tablas en un formato estructurado.
  async function importarPDF(file) {
    const b64 = await u.readAsBase64(file);
    const json = await ADI.ia.extraerGA4dePDF(b64);
    const filas = (json.filas || []).map((f) => ({
      mes: u.parseMonth(f.mes) || null, canal: f.canal || '', fuente: f.fuente || '', campana: f.campana || '',
      usuarios: +f.usuarios || 0, usuariosNuevos: +f.usuariosNuevos || 0, sesiones: +f.sesiones || 0, sesionesInteraccion: +f.sesionesInteraccion || 0,
      vistas: +f.vistas || 0, eventosClave: +f.eventosClave || 0, ingresos: +f.ingresos || 0, inversion: +f.inversion || 0,
    }));
    if (!filas.length) throw new Error('La IA no encontró tablas de métricas en el PDF. Prueba exportando el informe como CSV.');
    return { filas, validacion: { errores: [], advertencias: ['Datos extraídos del PDF por la IA: verifica que las cifras coincidan con el informe original.', ...(json.notas ? [json.notas] : [])], total: filas.length }, esDemo: false, archivo: file.name, tipo: 'PDF', columnas: [] };
  }

  function cargarDemo() {
    const csv = window.ADI_DATOS_INCLUIDOS?.ga4DemoCsv;
    if (!csv) throw new Error('No se encontraron los datos de demostración.');
    return { ...desdeFilas(u.parseCSV(csv), 'ga4_demo_adi_music.csv'), esDemo: true, tipo: 'CSV' };
  }

  // ---------- Análisis ----------
  const vacio = () => ({ usuarios: 0, usuariosNuevos: 0, sesiones: 0, sesionesInteraccion: 0, vistas: 0, eventosClave: 0, ingresos: 0, inversion: 0, tiempoPond: 0, eventosClavePagados: 0 });
  function acumular(acc, f) {
    METRICAS.forEach((m) => { acc[m] += f[m] || 0; });
    if (f.tiempoMedio != null && f.sesiones) acc.tiempoPond += f.tiempoMedio * f.sesiones;
    if (f.inversion > 0) acc.eventosClavePagados += f.eventosClave || 0; // contactos que vienen de filas con inversión
    if (f.eventosClavePagados) acc.eventosClavePagados += f.eventosClavePagados;
    return acc;
  }
  function derivar(t) {
    return {
      ...t,
      tasaInteraccion: t.sesiones ? t.sesionesInteraccion / t.sesiones : null,
      tasaConversion: t.sesiones ? t.eventosClave / t.sesiones : null,
      pctNuevos: t.usuarios ? t.usuariosNuevos / t.usuarios : null,
      cpa: t.eventosClavePagados && t.inversion ? t.inversion / t.eventosClavePagados : null,
      tiempoMedio: t.sesiones && t.tiempoPond ? t.tiempoPond / t.sesiones : null,
    };
  }
  const total = (filas) => derivar(filas.reduce(acumular, vacio()));

  function agrupar(filas, campo) {
    const g = u.groupBy(filas.filter((f) => f[campo]), (f) => f[campo]);
    return Object.entries(g).map(([k, v]) => ({ nombre: k, ...total(v), meses: [...new Set(v.map((x) => x.mes).filter(Boolean))].sort() }));
  }

  function analizar(ga4) {
    if (!ga4 || !ga4.filas?.length) return { vacio: true };
    const filas = ga4.filas;
    const meses = [...new Set(filas.map((f) => f.mes).filter(Boolean))].sort();
    const porMes = meses.map((m) => ({ mes: m, ...total(filas.filter((f) => f.mes === m)) }));
    const porCanal = agrupar(filas, 'canal').sort((a, b) => b.usuarios - a.usuarios);
    const porCampana = agrupar(filas.filter((f) => f.campana && !/^\(/.test(f.campana)), 'campana').sort((a, b) => (a.cpa ?? 1e9) - (b.cpa ?? 1e9));
    const tot = total(filas);
    return { vacio: false, meses, porMes, porCanal, porCampana, total: tot, esDemo: !!ga4.esDemo };
  }

  function periodo(an, desde, hasta) {
    const filas = an.porMes.filter((m) => m.mes >= desde && m.mes <= hasta);
    const t = filas.reduce((acc, m) => { METRICAS.forEach((k) => { acc[k] += m[k] || 0; }); acc.tiempoPond += (m.tiempoMedio || 0) * (m.sesiones || 0); acc.eventosClavePagados += m.eventosClavePagados || 0; return acc; }, vacio());
    return derivar(t);
  }

  // Hallazgos explicados en palabras simples.
  function hallazgos(an, ventas) {
    if (an.vacio) return [];
    const out = [];
    const canales = an.porCanal.filter((c) => c.usuarios > 0);
    if (canales.length) {
      const top = canales[0];
      out.push({ tipo: 'hecho', texto: `El canal que más usuarios atrae es **${nombreCanal(top.nombre)}**: ${u.fmtNum(top.usuarios)} usuarios (${u.fmtPct(top.usuarios / an.total.usuarios, 0)} del total).` });
      const conv = canales.filter((c) => c.sesiones >= 50 && c.tasaConversion != null).sort((a, b) => b.tasaConversion - a.tasaConversion);
      if (conv.length >= 2) {
        const best = conv[0], worst = conv[conv.length - 1];
        out.push({ tipo: 'hecho', texto: `El canal que mejor convierte visitas en contactos es **${nombreCanal(best.nombre)}** (${u.fmtPct(best.tasaConversion)} de las sesiones terminan en evento clave); el que menos, ${nombreCanal(worst.nombre)} (${u.fmtPct(worst.tasaConversion)}).` });
        if (worst.usuarios >= top.usuarios * 0.5) out.push({ tipo: 'interpretacion', texto: `${nombreCanal(worst.nombre)} trae mucha gente pero pocos contactos: puede que el mensaje atraiga curiosos y no clientes, o que falte un botón claro de WhatsApp o cotización.` });
      }
    }
    if (an.porMes.length >= 4) {
      const ult3 = an.porMes.slice(-3), prev3 = an.porMes.slice(-6, -3);
      if (prev3.length === 3) {
        const a = u.sum(ult3.map((m) => m.usuarios)), b = u.sum(prev3.map((m) => m.usuarios));
        if (b) out.push({ tipo: 'hecho', texto: `En los últimos 3 meses los usuarios ${a >= b ? 'subieron' : 'bajaron'} ${u.fmtPct(Math.abs(a / b - 1), 0)} frente a los 3 meses anteriores.` });
      }
      const pico = [...an.porMes].sort((x, y) => y.usuarios - x.usuarios)[0];
      out.push({ tipo: 'hecho', texto: `El mes con más usuarios fue ${u.monthLabel(pico.mes).toLowerCase()} (${u.fmtNum(pico.usuarios)}).` });
    }
    const camps = an.porCampana.filter((c) => c.inversion > 0);
    if (camps.length) {
      const best = camps[0];
      out.push({ tipo: 'hecho', texto: `Campaña con menor costo por contacto: **${best.nombre}** (${u.fmtMoney(best.cpa, 2)} por evento clave, ${u.fmtMoney(best.inversion)} invertidos).` });
      const inv = u.sum(camps.map((c) => c.inversion));
      out.push({ tipo: 'hecho', texto: `Inversión publicitaria registrada: ${u.fmtMoney(inv)} en ${camps.length} campaña(s).` });
    }
    if (ventas && !ventas.vacio && an.porMes.length >= 3) {
      const comunes = an.porMes.filter((m) => ventas.porMes.some((v) => v.mes === m.mes && !v.parcial));
      if (comunes.length >= 4) {
        const r = u.pearson(comunes.map((m) => m.eventosClave), comunes.map((m) => ventas.porMes.find((v) => v.mes === m.mes).eventos));
        if (r != null) out.push({ tipo: 'hipotesis', texto: `Relación entre contactos de GA4 y eventos vendidos en el mismo mes: correlación ${u.fmtNum(r, 2)} (${Math.abs(r) >= 0.6 ? 'se mueven juntos' : Math.abs(r) >= 0.3 ? 'relación débil' : 'casi no se relacionan'}). Es solo una coincidencia en el tiempo: no prueba que la web o la publicidad causen las ventas.` });
      }
    }
    if (an.esDemo) out.push({ tipo: 'aviso', texto: 'Estos hallazgos salen de **datos de demostración**, no de datos reales de ADIX Music.' });
    return out;
  }

  const GLOSARIO = {
    usuarios: 'Personas distintas que visitaron la web o el enlace en el periodo.',
    usuariosNuevos: 'Personas que entraron por primera vez.',
    sesiones: 'Visitas. Una persona puede hacer varias visitas.',
    tasaInteraccion: 'Porcentaje de visitas en las que la persona realmente miró algo (se quedó más de 10 segundos, vio 2 páginas o hizo una acción).',
    eventosClave: 'Acciones valiosas que configuraste como objetivo, por ejemplo hacer clic en WhatsApp o enviar una cotización. Antes se llamaban "conversiones".',
    tasaConversion: 'De cada 100 visitas, cuántas terminan en un evento clave (contacto).',
    cpa: 'Costo por evento clave: cuánto se pagó en publicidad por cada contacto conseguido.',
    tiempoMedio: 'Tiempo promedio que la persona pasa mirando el contenido en cada visita.',
    inversion: 'Dinero gastado en anuncios (TikTok Ads, Meta Ads…).',
  };

  return { importarArchivo, cargarDemo, desdeFilas, analizar, periodo, hallazgos, nombreCanal, GLOSARIO, METRICAS };
})();
