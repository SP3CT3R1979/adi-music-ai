/* ADI MUSIC AI — lectura y validación de archivos Excel/CSV con registros de ventas. */
ADI.excel = (() => {
  const u = ADI.u;

  // Campos que la app entiende y los nombres de columna con los que suelen aparecer.
  const CAMPOS = [
    { id: 'fecha', label: 'Fecha', req: true, sin: ['fecha', 'fecha del evento', 'fecha de evento', 'fecha de venta', 'fecha evento', 'date', 'dia'] },
    { id: 'ingreso', label: 'Ingreso / monto cobrado', req: true, sin: ['ingreso', 'ingresos', 'monto', 'monto cobrado', 'total', 'importe', 'venta', 'ventas', 'valor', 'precio cobrado', 'precio final', 'precio', 'revenue', 'amount'] },
    { id: 'producto', label: 'Producto / paquete', sin: ['paquete', 'producto', 'servicio', 'plan', 'articulo', 'item'] },
    { id: 'lugar', label: 'Lugar / localidad', sin: ['localidad', 'lugar', 'lugar de venta', 'ciudad', 'distrito', 'sede', 'ubicacion', 'zona', 'provincia', 'local'] },
    { id: 'tipo', label: 'Tipo de evento / categoría', sin: ['tipo de evento', 'tipo', 'evento', 'categoria', 'ocasion', 'motivo'] },
    { id: 'codigo', label: 'Código', sin: ['codigo', 'cod', 'id', 'nro', 'n°', 'numero', 'contrato', 'n'] },
    { id: 'cliente', label: 'Cliente', sin: ['cliente', 'nombre del cliente', 'razon social', 'nombre'] },
    { id: 'costo', label: 'Costo real', sin: ['costo', 'coste', 'costo real', 'costos', 'gasto', 'gastos', 'costo variable'] },
    { id: 'cantidad', label: 'Cantidad', sin: ['cantidad', 'unidades', 'cant', 'qty'] },
  ];

  function scoreHeader(header, sinonimos) {
    const h = u.norm(header).replace(/[:.]/g, '').trim();
    if (!h) return 0;
    let best = 0;
    for (const s of sinonimos) {
      if (h === s) best = Math.max(best, 3);
      else if (h.startsWith(s + ' ') || h.startsWith(s + '(')) best = Math.max(best, 2);
      else if (s.length > 3 && h.includes(s)) best = Math.max(best, 1);
    }
    return best;
  }

  // Asigna cada columna al campo con mejor coincidencia (sin repetir campos).
  function autoMapeo(headers, campos = CAMPOS) {
    const cands = [];
    headers.forEach((hd, col) => campos.forEach((c) => { const s = scoreHeader(hd, c.sin); if (s) cands.push({ col, campo: c.id, s }); }));
    cands.sort((a, b) => b.s - a.s);
    const mapeo = {}; const usadas = new Set();
    for (const c of cands) {
      if (mapeo[c.campo] != null || usadas.has(c.col)) continue;
      mapeo[c.campo] = c.col; usadas.add(c.col);
    }
    return mapeo;
  }

  // ---------- Lectura del archivo ----------
  async function leerArchivo(file) {
    const nombre = file.name || 'archivo';
    const ext = nombre.split('.').pop().toLowerCase();
    if (['csv', 'txt', 'tsv'].includes(ext)) {
      const text = await u.readAsText(file);
      return { nombre, hojas: [{ nombre: 'CSV', filas: u.parseCSV(text) }] };
    }
    if (!['xlsx', 'xls', 'xlsm', 'ods'].includes(ext)) throw new Error('Formato no admitido. Usa Excel (.xlsx, .xls) o CSV.');
    const buf = await u.readAsArrayBuffer(file);
    return leerBuffer(buf, nombre);
  }

  function leerBuffer(buf, nombre) {
    if (!window.XLSX) throw new Error('No se cargó el lector de Excel.');
    const wb = XLSX.read(buf, { type: 'array' });
    const hojas = wb.SheetNames.map((n) => ({
      nombre: n,
      filas: XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, raw: true, defval: null, blankrows: true }),
    }));
    return { nombre, hojas };
  }

  // ---------- Detección de estructura ----------
  function detectarEncabezado(filas, campos, requeridos) {
    let best = null;
    for (let r = 0; r < Math.min(filas.length, 25); r++) {
      const row = (filas[r] || []).map((c) => (c == null ? '' : String(c)));
      if (row.filter((c) => c.trim()).length < 2) continue;
      const mapeo = autoMapeo(row, campos);
      const ok = requeridos.every((id) => mapeo[id] != null);
      const score = Object.keys(mapeo).length + (ok ? 10 : 0);
      if (!best || score > best.score) best = { fila: r, headers: row, mapeo, score, ok };
    }
    return best;
  }

  function analizarLibro(libro) {
    // 1) Hoja con los registros de ventas (necesita fecha e ingreso).
    let hojaVentas = null;
    libro.hojas.forEach((h, idx) => {
      const enc = detectarEncabezado(h.filas, CAMPOS, ['fecha', 'ingreso']);
      if (!enc || !enc.ok) return;
      const filasDatos = h.filas.slice(enc.fila + 1).filter((r) => r && u.parseDate(r[enc.mapeo.fecha]) && u.parseNumber(r[enc.mapeo.ingreso]) != null).length;
      const score = enc.score + filasDatos / 10;
      if (!hojaVentas || score > hojaVentas.score) hojaVentas = { idx, nombre: h.nombre, filaEncabezado: enc.fila, headers: enc.headers, mapeo: enc.mapeo, score, filasDatos };
    });

    // 2) Tabla de paquetes/productos con precio y costo.
    const CAMPOS_PAQ = [
      { id: 'nombre', sin: ['paquete', 'producto', 'servicio', 'plan'] },
      { id: 'precio', sin: ['precio referencial', 'precio', 'tarifa', 'precio de venta'] },
      { id: 'costo', sin: ['costo variable estimado', 'costo variable', 'costo', 'coste', 'costo estimado'] },
    ];
    let paquetes = [];
    for (const h of libro.hojas) {
      const enc = detectarEncabezado(h.filas, CAMPOS_PAQ, ['nombre', 'precio', 'costo']);
      if (!enc || !enc.ok) continue;
      if (hojaVentas && h === libro.hojas[hojaVentas.idx]) continue;
      const lista = [];
      for (let r = enc.fila + 1; r < h.filas.length; r++) {
        const row = h.filas[r] || [];
        const nombre = row[enc.mapeo.nombre];
        if (nombre == null || String(nombre).trim() === '') break;
        const precio = u.parseNumber(row[enc.mapeo.precio]); const costo = u.parseNumber(row[enc.mapeo.costo]);
        if (precio == null) continue;
        lista.push({ nombre: String(nombre).trim(), precio, costo: costo ?? null });
      }
      if (lista.length) { paquetes = lista; break; }
    }

    // 3) Parámetros del negocio escritos como etiqueta + valor.
    const parametros = {}; const notas = [];
    const reglas = [
      { id: 'gastosFijos', re: /gastos? fijos? mensual/ },
      { id: 'cuotaBanco', re: /cuota mensual|cuota (del|al) banco|cuota bancaria mensual/ },
      { id: 'saldoReferencia', re: /saldo estimado/ },
    ];
    for (const h of libro.hojas) {
      h.filas.forEach((row) => (row || []).forEach((cell, c) => {
        if (typeof cell !== 'string') return;
        const n = u.norm(cell);
        for (const rg of reglas) {
          if (!rg.re.test(n)) continue;
          const faltaDetalle = rg.id === 'gastosFijos' && !parametros.detalleFijos;
          if (parametros[rg.id] != null && !faltaDetalle) continue;
          for (let k = c + 1; k < row.length; k++) {
            const v = u.parseNumber(row[k]);
            if (v != null && typeof row[k] !== 'string') {
              if (parametros[rg.id] == null) parametros[rg.id] = Math.abs(v);
              if (rg.id === 'gastosFijos') {
                const det = row.slice(k + 1).find((x) => typeof x === 'string' && x.trim());
                if (det) parametros.detalleFijos = det.trim();
              }
              break;
            }
          }
        }
        if (cell.length > 40 && /(recuerdo|validar|suponiendo|no incluye|^nota)/.test(n)) notas.push({ hoja: h.nombre, texto: cell.trim() });
      }));
    }
    return { hojaVentas, paquetes, parametros, notas };
  }

  // ---------- Construcción y validación de registros ----------
  function canonicoPaquete(valor, paquetes) {
    const n = u.norm(valor);
    const p = paquetes.find((x) => u.norm(x.nombre) === n);
    if (p) return p.nombre;
    return valor === n ? u.titleCase(valor) : String(valor).trim();
  }

  function construirRegistros(libro, hojaIdx, filaEncabezado, mapeo, paquetes = [], notas = []) {
    const hoja = libro.hojas[hojaIdx];
    const errores = [], advertencias = [], info = [];
    const brutos = [];
    const get = (row, campo) => (mapeo[campo] != null ? row[mapeo[campo]] : null);

    for (let r = filaEncabezado + 1; r < hoja.filas.length; r++) {
      const row = hoja.filas[r] || [];
      if (!row.some((c) => c != null && String(c).trim() !== '')) continue;
      const fRaw = get(row, 'fecha'), iRaw = get(row, 'ingreso');
      const primera = u.norm(row.find((c) => c != null && String(c).trim() !== ''));
      if (/^(total|subtotal|suma)/.test(primera)) continue; // filas de totales
      const fecha = u.parseDate(fRaw);
      const ingreso = u.parseNumber(iRaw);
      const filaExcel = r + 1;
      if (!fecha) { errores.push(`Fila ${filaExcel}: la fecha "${fRaw ?? ''}" no es válida; la fila no se usó.`); continue; }
      if (ingreso == null || ingreso < 0) { errores.push(`Fila ${filaExcel}: el monto "${iRaw ?? ''}" no es un número válido; la fila no se usó.`); continue; }
      const costo = u.parseNumber(get(row, 'costo'));
      const cant = u.parseNumber(get(row, 'cantidad'));
      brutos.push({
        fila: filaExcel,
        codigo: get(row, 'codigo') != null ? String(get(row, 'codigo')).trim() : '',
        fecha,
        lugarOriginal: get(row, 'lugar') != null ? String(get(row, 'lugar')).replace(/\s+/g, ' ').trim() : '',
        tipoOriginal: get(row, 'tipo') != null ? String(get(row, 'tipo')).replace(/\s+/g, ' ').trim() : '',
        producto: get(row, 'producto') != null && String(get(row, 'producto')).trim() ? canonicoPaquete(String(get(row, 'producto')).trim(), paquetes) : '',
        cliente: get(row, 'cliente') != null ? String(get(row, 'cliente')).trim() : '',
        ingreso,
        costoReal: costo != null && costo >= 0 ? costo : null,
        cantidad: cant != null && cant > 0 ? cant : 1,
      });
    }

    // Unifica nombres escritos de distinta forma (mayúsculas, espacios, tildes).
    const unificar = (campo) => {
      const grupos = u.groupBy(brutos.filter((b) => b[campo]), (b) => u.norm(b[campo]));
      const cambios = [];
      const canon = {};
      for (const [k, items] of Object.entries(grupos)) {
        const cuenta = {};
        items.forEach((b) => { cuenta[b[campo]] = (cuenta[b[campo]] || 0) + 1; });
        const variantes = Object.keys(cuenta);
        const conMayus = variantes.filter((v) => v.charAt(0) !== v.charAt(0).toLowerCase()).sort((a, b) => cuenta[b] - cuenta[a]);
        const elegido = conMayus[0] || u.titleCase(variantes[0]);
        canon[k] = elegido;
        variantes.filter((v) => v !== elegido).forEach((v) => cambios.push(`"${v}" → "${elegido}"`));
      }
      return { canon, cambios };
    };
    const L = unificar('lugarOriginal');
    const T = unificar('tipoOriginal');

    const registros = brutos.map((b) => ({
      id: u.uid(),
      codigo: b.codigo,
      fecha: b.fecha,
      lugar: b.lugarOriginal ? L.canon[u.norm(b.lugarOriginal)] : '',
      tipo: b.tipoOriginal ? T.canon[u.norm(b.tipoOriginal)] : '',
      producto: b.producto,
      cliente: b.cliente,
      ingreso: b.ingreso,
      costoReal: b.costoReal,
      cantidad: b.cantidad,
      origen: 'excel',
      fila: b.fila,
    })).sort((a, b) => a.fecha.localeCompare(b.fecha));

    if (L.cambios.length) advertencias.push(`Se unificaron ${L.cambios.length} nombre(s) de lugar escritos de forma distinta: ${L.cambios.join(', ')}.`);
    if (T.cambios.length) advertencias.push(`Se unificaron ${T.cambios.length} tipo(s) de evento escritos de forma distinta: ${T.cambios.join(', ')}.`);

    // Códigos duplicados o fuera del orden de las fechas.
    if (mapeo.codigo != null) {
      const vistos = {}; const dup = [];
      registros.forEach((r) => { if (r.codigo) { if (vistos[r.codigo]) dup.push(r.codigo); vistos[r.codigo] = 1; } });
      if (dup.length) advertencias.push(`Códigos repetidos: ${[...new Set(dup)].join(', ')}. Revisa si son el mismo contrato registrado dos veces.`);
      const num = (c) => { const m = String(c).match(/(\d+)\s*$/); return m ? +m[1] : null; };
      const fuera = [];
      let max = -Infinity;
      registros.forEach((r) => { const n = num(r.codigo); if (n == null) return; if (n < max) fuera.push(r.codigo); max = Math.max(max, n); });
      if (fuera.length) advertencias.push(`${fuera.length} código(s) no siguen el orden de las fechas (${fuera.join(', ')}). Puede indicar fechas estimadas o contratos registrados tarde: conviene verificarlas.`);
    }

    // Varios eventos el mismo día.
    const porDia = u.groupBy(registros, (r) => r.fecha);
    const dobles = Object.entries(porDia).filter(([, v]) => v.length > 1);
    if (dobles.length) info.push(`${dobles.length} día(s) con más de un evento: ${dobles.map(([d, v]) => `${u.fmtDate(d)} (${v.length})`).join(', ')}. Verifica que haya equipos y personal suficientes para atenderlos a la vez.`);

    // Precios distintos dentro de un mismo paquete.
    const porProd = u.groupBy(registros.filter((r) => r.producto), (r) => r.producto);
    for (const [p, items] of Object.entries(porProd)) {
      const precios = items.map((i) => i.ingreso / (i.cantidad || 1));
      const min = Math.min(...precios), max = Math.max(...precios);
      const ref = paquetes.find((x) => x.nombre === p);
      if (max > min) info.push(`El precio de ${p} varía entre ${u.fmtMoney(min)} y ${u.fmtMoney(max)}${ref ? ` (referencial ${u.fmtMoney(ref.precio)})` : ''}: se negocia por evento.`);
    }

    // Mes final incompleto.
    if (registros.length) {
      const ult = registros[registros.length - 1].fecha;
      const mk = u.monthKey(ult); const dia = +ult.slice(8, 10);
      if (dia < u.daysInMonth(mk)) info.push(`El último mes (${u.monthLabel(mk).toLowerCase()}) tiene datos solo hasta el día ${dia}: se marca como mes parcial y no se usa para medir tendencias.`);
    }

    // Columnas que faltan y qué limitan.
    if (mapeo.costo == null) info.push(paquetes.length ? 'No hay columna de costo real por venta: los costos se estiman con la tabla de costos por paquete.' : 'No hay costos: no se puede calcular el margen.');
    if (mapeo.cliente == null) info.push('No hay columna de cliente: no se pueden medir clientes recurrentes ni fidelización.');
    notas.forEach((n) => advertencias.push(`Nota del archivo (hoja "${n.hoja}"): ${n.texto}`));

    return { registros, validacion: { errores, advertencias, info, total: registros.length } };
  }

  // Encabezado sugerido para una hoja elegida a mano.
  function encabezadoDeHoja(libro, idx) {
    const enc = detectarEncabezado(libro.hojas[idx].filas, CAMPOS, ['fecha', 'ingreso']);
    if (enc) return { filaEncabezado: enc.fila, mapeo: enc.mapeo };
    return { filaEncabezado: 0, mapeo: {} };
  }
  const headersDeFila = (libro, idx, fila) => (libro.hojas[idx].filas[fila] || []).map((c) => (c == null ? '' : String(c).trim()));

  return { CAMPOS, leerArchivo, leerBuffer, analizarLibro, construirRegistros, autoMapeo, encabezadoDeHoja, headersDeFila };
})();
