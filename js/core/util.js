/* ADI MUSIC AI — utilidades generales (formato, fechas, números, estadística, DOM). */
window.ADI = window.ADI || {};

ADI.u = (() => {
  const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
  const MESES_C = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

  // ---------- Texto y HTML ----------
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // Minúsculas sin tildes ni espacios extra: para comparar textos.
  const norm = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

  const PALABRAS_MENORES = new Set(['de', 'del', 'la', 'las', 'los', 'el', 'y', 'e', 'en']);
  const titleCase = (s) => String(s ?? '').trim().replace(/\s+/g, ' ').toLowerCase()
    .split(' ').map((w, i) => (i > 0 && PALABRAS_MENORES.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // ---------- Números ----------
  const fmtNum = (n, dec = 0) => (n == null || !isFinite(n)) ? '—' : Number(n).toLocaleString('es-PE', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fmtMoney = (n, dec = 0) => (n == null || !isFinite(n)) ? '—' : (n < 0 ? '−S/ ' : 'S/ ') + fmtNum(Math.abs(n), dec);
  const fmtPct = (x, dec = 1) => (x == null || !isFinite(x)) ? '—' : fmtNum(x * 100, dec) + ' %';
  const fmtDelta = (x, dec = 1) => (x == null || !isFinite(x)) ? '—' : (x > 0 ? '+' : x < 0 ? '−' : '') + fmtNum(Math.abs(x) * 100, dec) + ' %';

  // Interpreta números escritos de distintas formas: 1234 | 1,234 | 1.234,5 | 45,3 % | S/ 3,500
  function parseNumber(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim();
    if (!s) return null;
    const pct = s.includes('%');
    s = s.replace(/s\/\.?|pen|usd|\$|%|\s/gi, '');
    if (/^\(.*\)$/.test(s)) s = '-' + s.slice(1, -1);
    const hasDot = s.includes('.'), hasComma = s.includes(',');
    if (hasDot && hasComma) {
      if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
      else s = s.replace(/,/g, '');
    } else if (hasComma) {
      const parts = s.split(',');
      // "1,234" o "12,345,678" = miles; "45,3" = decimal
      if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) s = s.replace(/,/g, '');
      else s = s.replace(',', '.');
    } else if (hasDot) {
      const parts = s.split('.');
      if (parts.length > 2) s = s.replace(/\./g, '');
    }
    const n = Number(s);
    if (!isFinite(n)) return null;
    return pct ? n / 100 : n;
  }

  // ---------- Fechas (siempre como texto 'AAAA-MM-DD' para evitar problemas de zona horaria) ----------
  const pad = (n) => String(n).padStart(2, '0');
  const ymd = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
  const validDate = (y, m, d) => {
    if (!(y > 1900 && y < 2200 && m >= 1 && m <= 12 && d >= 1)) return false;
    return d <= new Date(Date.UTC(y, m, 0)).getUTCDate();
  };

  function excelSerialToYmd(serial) {
    if (typeof serial !== 'number' || serial < 20000 || serial > 80000) return null;
    const ms = Math.round((serial - 25569) * 86400000);
    const d = new Date(ms);
    return ymd(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
  }

  function parseDate(v) {
    if (v == null || v === '') return null;
    if (v instanceof Date && !isNaN(v)) return ymd(v.getFullYear(), v.getMonth() + 1, v.getDate());
    if (typeof v === 'number') {
      if (v >= 19000101 && v <= 21001231 && Number.isInteger(v)) return parseDate(String(v));
      return excelSerialToYmd(v);
    }
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/))) return validDate(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : null;
    if ((m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/))) {
      let y = +m[3]; if (y < 100) y += 2000;
      return validDate(y, +m[2], +m[1]) ? ymd(y, +m[2], +m[1]) : null; // formato peruano: día/mes/año
    }
    if ((m = s.match(/^(\d{4})(\d{2})(\d{2})$/))) return validDate(+m[1], +m[2], +m[3]) ? ymd(+m[1], +m[2], +m[3]) : null;
    if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToYmd(Number(s));
    return null;
  }

  // Mes en formato 'AAAA-MM' a partir de 202601, '2026-01', 'Enero 2026', etc.
  function parseMonth(v) {
    if (v == null || v === '') return null;
    const s = String(v).trim();
    let m;
    if ((m = s.match(/^(\d{4})(\d{2})$/))) return `${m[1]}-${m[2]}`;
    if ((m = s.match(/^(\d{4})[-/](\d{1,2})$/))) return `${m[1]}-${pad(+m[2])}`;
    const d = parseDate(v);
    if (d) return d.slice(0, 7);
    const n = norm(s);
    const idx = MESES.findIndex((x) => n.startsWith(norm(x)) || n.startsWith(norm(x).slice(0, 3)));
    const y = (s.match(/(\d{4})/) || [])[1];
    if (idx >= 0 && y) return `${y}-${pad(idx + 1)}`;
    return null;
  }

  const monthKey = (dateStr) => dateStr.slice(0, 7);
  const monthLabel = (key, corto = false) => {
    const [y, m] = key.split('-').map(Number);
    return (corto ? MESES_C[m - 1] : MESES[m - 1]) + ' ' + y;
  };
  const monthName = (m) => MESES[m - 1];
  const daysInMonth = (key) => { const [y, m] = key.split('-').map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
  const addMonths = (key, n) => {
    const [y, m] = key.split('-').map(Number);
    const t = y * 12 + (m - 1) + n;
    return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
  };
  const monthRange = (from, to) => { const out = []; let k = from; while (k <= to) { out.push(k); k = addMonths(k, 1); } return out; };
  const fmtDate = (s) => { if (!s) return '—'; const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
  const today = () => { const d = new Date(); return ymd(d.getFullYear(), d.getMonth() + 1, d.getDate()); };
  const nowStamp = () => new Date().toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' });

  // ---------- Estadística simple ----------
  const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
  const mean = (a) => a.length ? sum(a) / a.length : null;
  const std = (a) => { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(sum(a.map((x) => (x - m) ** 2)) / (a.length - 1)); };
  function linreg(ys) {
    const n = ys.length; if (n < 3) return null;
    const xs = ys.map((_, i) => i);
    const mx = mean(xs), my = mean(ys);
    let sxy = 0, sxx = 0, syy = 0;
    for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
    const slope = sxx ? sxy / sxx : 0;
    const r2 = (sxx && syy) ? (sxy * sxy) / (sxx * syy) : 0;
    return { slope, intercept: my - slope * mx, r2 };
  }
  function pearson(a, b) {
    const n = Math.min(a.length, b.length); if (n < 3) return null;
    const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
    let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { sab += (a[i] - ma) * (b[i] - mb); saa += (a[i] - ma) ** 2; sbb += (b[i] - mb) ** 2; }
    return (saa && sbb) ? sab / Math.sqrt(saa * sbb) : null;
  }
  const groupBy = (arr, fn) => arr.reduce((acc, x) => { const k = fn(x); (acc[k] = acc[k] || []).push(x); return acc; }, {});

  // ---------- Archivos ----------
  const readAsArrayBuffer = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsArrayBuffer(file); });
  const readAsText = (file) => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^﻿/, '')); r.onerror = () => rej(r.error); r.readAsText(file, 'utf-8'); });
  const readAsBase64 = (file) => readAsArrayBuffer(file).then(bufToBase64);
  function bufToBase64(buf) {
    const bytes = new Uint8Array(buf); let bin = '';
    for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }
  function base64ToBuf(b64) {
    const bin = atob(b64); const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }
  function download(filename, text, mime = 'application/json') {
    const blob = new Blob([text], { type: mime });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // Lector CSV sencillo (respeta comillas). Detecta si el separador es coma, punto y coma o tabulación.
  function parseCSV(text) {
    const firstData = text.split(/\r?\n/).find((l) => l.trim() && !l.trim().startsWith('#')) || '';
    const counts = { ',': (firstData.match(/,/g) || []).length, ';': (firstData.match(/;/g) || []).length, '\t': (firstData.match(/\t/g) || []).length };
    const sep = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(cur); rows.push(row); row = []; cur = '';
      } else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows;
  }

  // ---------- SHA-256 (para el PIN de acceso; funciona también al abrir el archivo sin servidor) ----------
  async function sha256(text) {
    if (window.crypto && crypto.subtle) {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return sha256Fallback(text);
  }
  function sha256Fallback(ascii) {
    const rr = (v, a) => (v >>> a) | (v << (32 - a));
    const words = []; const K = []; const H = [];
    let isPrime = {}, candidate = 2;
    while (H.length < 8 || K.length < 64) {
      if (!isPrime[candidate]) {
        for (let i = candidate * candidate; i < 313; i += candidate) isPrime[i] = 1;
        if (H.length < 8) H.push((Math.pow(candidate, 0.5) * 0x100000000) | 0);
        K.push((Math.pow(candidate, 1 / 3) * 0x100000000) | 0);
      }
      candidate++;
    }
    const bytes = new TextEncoder().encode(ascii);
    const bitLen = bytes.length * 8;
    const arr = [...bytes, 0x80];
    while (arr.length % 64 !== 56) arr.push(0);
    for (let i = 7; i >= 0; i--) arr.push(i > 3 ? 0 : (bitLen >>> (i * 8)) & 0xff);
    for (let i = 0; i < arr.length; i += 4) words.push((arr[i] << 24) | (arr[i + 1] << 16) | (arr[i + 2] << 8) | arr[i + 3]);
    let hash = H.slice();
    for (let j = 0; j < words.length; j += 16) {
      const w = words.slice(j, j + 16); const old = hash.slice();
      for (let i = 0; i < 64; i++) {
        if (i >= 16) {
          const w15 = w[i - 15], w2 = w[i - 2];
          w[i] = (w[i - 16] + (rr(w15, 7) ^ rr(w15, 18) ^ (w15 >>> 3)) + w[i - 7] + (rr(w2, 17) ^ rr(w2, 19) ^ (w2 >>> 10))) | 0;
        }
        const [a, b, c, d, e, f, g, h] = hash;
        const t1 = h + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i];
        const t2 = (rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
        hash = [(t1 + t2) | 0, a, b, c, (d + t1) | 0, e, f, g];
      }
      hash = hash.map((x, i) => (x + old[i]) | 0);
    }
    return hash.map((x) => (x >>> 0).toString(16).padStart(8, '0')).join('');
  }

  // ---------- Markdown mínimo para las respuestas de la IA ----------
  function md(text) {
    const lines = esc(text || '').split(/\r?\n/);
    const out = []; let list = null; let table = null;
    const inline = (s) => s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|[^*])\*(?!\s)(.+?)\*/g, '$1<em>$2</em>').replace(/`(.+?)`/g, '<code>$1</code>');
    const closeList = () => { if (list) { out.push(`</${list}>`); list = null; } };
    const closeTable = () => {
      if (table) {
        const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
        out.push('<div class="table-wrap"><table class="tbl">' + rows.map((r, i) => {
          const cells = r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => inline(c.trim()));
          const tag = i === 0 ? 'th' : 'td';
          return '<tr>' + cells.map((c) => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        }).join('') + '</table></div>');
        table = null;
      }
    };
    for (const raw of lines) {
      const l = raw.trimEnd();
      if (/^\s*\|.*\|\s*$/.test(l)) { closeList(); (table = table || []).push(l); continue; }
      closeTable();
      let m;
      if ((m = l.match(/^\s*#{1,4}\s+(.*)/))) { closeList(); out.push(`<h4>${inline(m[1])}</h4>`); }
      else if ((m = l.match(/^\s*[-*•]\s+(.*)/))) { if (list !== 'ul') { closeList(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = l.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { closeList(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (!l.trim()) { closeList(); }
      else { closeList(); out.push(`<p>${inline(l)}</p>`); }
    }
    closeList(); closeTable();
    return out.join('');
  }

  // ---------- Avisos en pantalla ----------
  function toast(msg, tipo = 'info', ms = 3800) {
    let box = document.getElementById('toasts');
    if (!box) { box = document.createElement('div'); box.id = 'toasts'; document.body.appendChild(box); }
    const el = document.createElement('div');
    el.className = 'toast toast-' + tipo;
    el.setAttribute('role', 'status');
    el.textContent = msg;
    box.appendChild(el);
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, ms);
  }

  return {
    MESES, MESES_C, esc, norm, titleCase, uid, fmtNum, fmtMoney, fmtPct, fmtDelta, parseNumber,
    parseDate, parseMonth, monthKey, monthLabel, monthName, daysInMonth, addMonths, monthRange, fmtDate, today, nowStamp,
    sum, mean, std, linreg, pearson, groupBy,
    readAsArrayBuffer, readAsText, readAsBase64, bufToBase64, base64ToBuf, download, parseCSV,
    sha256, md, toast,
  };
})();
