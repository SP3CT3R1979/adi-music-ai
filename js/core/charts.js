/* ADI MUSIC AI — gráficos (Chart.js) con un estilo uniforme. */
ADI.charts = (() => {
  const u = ADI.u;
  const activos = [];
  const PALETA = ['#6D28D9', '#F59E0B', '#0EA5A4', '#E11D48', '#2563EB', '#84CC16', '#A855F7', '#F97316'];

  const css = (v, fb) => getComputedStyle(document.documentElement).getPropertyValue(v).trim() || fb;

  function base(tipoMoneda) {
    const texto = css('--muted', '#6b7280');
    const grid = css('--grid', '#ececf3');
    return {
      responsive: true, maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: texto, boxWidth: 12, usePointStyle: true, font: { size: 12 } } },
        tooltip: { callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt(c.parsed.y ?? c.parsed, c.dataset.moneda ?? tipoMoneda)}` } },
      },
      scales: {
        x: { ticks: { color: texto, font: { size: 11 } }, grid: { display: false } },
        y: { ticks: { color: texto, font: { size: 11 }, callback: (v) => fmt(v, tipoMoneda, true) }, grid: { color: grid }, beginAtZero: true },
      },
    };
  }
  function fmt(v, moneda, corto) {
    if (moneda === 'pct') return u.fmtPct(v, 0);
    if (moneda) return corto && Math.abs(v) >= 1000 ? 'S/ ' + u.fmtNum(v / 1000, 0) + ' mil' : u.fmtMoney(v);
    return u.fmtNum(v, Number.isInteger(v) ? 0 : 1);
  }

  function crear(canvas, config) {
    if (!canvas || !window.Chart) return null;
    const ch = new Chart(canvas.getContext('2d'), config);
    activos.push(ch);
    return ch;
  }
  function destruirTodos() { while (activos.length) { try { activos.pop().destroy(); } catch (_) { /* ya destruido */ } } }

  // Barras (opcionalmente apiladas) con líneas superpuestas.
  function barras(canvas, { labels, series, moneda = false, apilado = false, horizontal = false, ejeDerecho = null }) {
    const opts = base(moneda);
    if (apilado) { opts.scales.x.stacked = true; opts.scales.y.stacked = true; }
    if (horizontal) {
      opts.indexAxis = 'y';
      opts.scales = { x: { ...opts.scales.y, ticks: { ...opts.scales.y.ticks } }, y: { ticks: { color: css('--muted', '#6b7280'), font: { size: 11 } }, grid: { display: false } } };
      opts.interaction = { mode: 'nearest', axis: 'y', intersect: false };
      opts.plugins.tooltip.callbacks.label = (c) => `${c.dataset.label ? c.dataset.label + ': ' : ''}${fmt(c.parsed.x, c.dataset.moneda ?? moneda)}`;
    }
    if (ejeDerecho) opts.scales.y2 = { position: 'right', beginAtZero: true, grid: { display: false }, ticks: { color: css('--muted', '#6b7280'), callback: (v) => fmt(v, ejeDerecho.moneda, true) } };
    return crear(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: series.map((s, i) => ({
          label: s.label, data: s.data, type: s.tipo || 'bar', moneda: s.moneda,
          backgroundColor: s.color || PALETA[i % PALETA.length], borderColor: s.color || PALETA[i % PALETA.length],
          borderWidth: s.tipo === 'line' ? 2.5 : 0, borderRadius: s.tipo === 'line' ? 0 : 4, borderDash: s.punteado ? [6, 4] : undefined,
          pointRadius: s.tipo === 'line' ? (s.punteado ? 0 : 3) : undefined, tension: 0.25, yAxisID: s.ejeDerecho ? 'y2' : 'y', order: s.tipo === 'line' ? 0 : 1,
          stack: s.stack,
        })),
      },
      options: opts,
    });
  }

  function lineas(canvas, { labels, series, moneda = false, ejeDerecho = null }) {
    return barras(canvas, { labels, series: series.map((s) => ({ ...s, tipo: 'line' })), moneda, ejeDerecho });
  }

  function dona(canvas, { labels, data, moneda = false }) {
    const texto = css('--muted', '#6b7280');
    return crear(canvas, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: PALETA.slice(0, data.length), borderWidth: 2, borderColor: css('--card', '#fff') }] },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '62%',
        plugins: {
          legend: { position: 'bottom', labels: { color: texto, boxWidth: 12, usePointStyle: true } },
          tooltip: { callbacks: { label: (c) => { const t = c.dataset.data.reduce((a, b) => a + b, 0); return `${c.label}: ${fmt(c.parsed, moneda)} (${u.fmtPct(c.parsed / t, 0)})`; } } },
        },
      },
    });
  }

  return { barras, lineas, dona, destruirTodos, PALETA };
})();
