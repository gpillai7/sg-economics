/**
 * js/modules/gdp-quarterly.js
 * Quarterly GDP tab for sg-economics platform.
 *
 * Requires (loaded before this script):
 *   - Chart.js
 *   - js/core/cache.js   (SGEcoCache)
 *   - js/core/singstat.js (SingStat)
 *
 * SingStat resource: M015631
 *   Series 2 = Real GDP YoY growth rate, quarterly (chained 2015 $)
 *   Keys formatted as "YYYY Qq" e.g. "2024 Q3"
 *
 * Add to index.html after existing scripts:
 *   <script src="js/modules/gdp-quarterly.js"></script>
 *
 * Add tab button to ch2 tab-bar:
 *   <button class="tab-btn" onclick="switchTab('ch2','quarterly',event)">Quarterly Pulse</button>
 *
 * Add tab panel inside mod-ch2, after ch2-fiscal panel:
 *   <div class="tab-panel" id="ch2-quarterly"></div>
 */

(function () {
  'use strict';

  /* ── Constants ───────────────────────────────────────────── */
  const RESOURCE_ID = 'M015631';
  const SERIES_NO   = 2;           // Real GDP YoY growth, chained 2015 $
  const PANEL_ID    = 'ch2-quarterly';
  const CHART_ID    = 'chart-gdp-quarterly';
  const CHART_ID_MOM = 'chart-gdp-qoq';

  /* ── Inject HTML into the panel on first load ────────────── */
  function buildPanel() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = '1';

    panel.innerHTML = `
      <div class="analysis-card">
        <div class="card-header">
          <span class="card-title">Singapore GDP — Quarterly Pulse</span>
          <span class="card-tag" id="q-last-updated">Loading…</span>
        </div>
        <div class="card-body">

          <!-- KPI strip -->
          <div id="q-kpi-strip" style="display:grid;grid-template-columns:repeat(4,1fr);gap:.75rem;margin-bottom:1.25rem;">
            <div class="kpi-card" id="kpi-latest"></div>
            <div class="kpi-card" id="kpi-prev"></div>
            <div class="kpi-card" id="kpi-yago"></div>
            <div class="kpi-card" id="kpi-avg4"></div>
          </div>

          <!-- Controls -->
          <div class="controls" style="margin-bottom:.75rem;">
            <div class="ctrl-group">
              <label class="ctrl-label">View</label>
              <select class="ctrl-select" id="q-view">
                <option value="yoy">Year-on-Year (%)</option>
                <option value="trend">4-Quarter Rolling Avg</option>
              </select>
            </div>
            <div class="ctrl-group">
              <label class="ctrl-label">Period</label>
              <select class="ctrl-select" id="q-period">
                <option value="10">Last 10 years</option>
                <option value="20">Last 20 years</option>
                <option value="all">All available</option>
              </select>
            </div>
          </div>

          <!-- YoY chart -->
          <div class="chart-container">
            <div class="chart-label" id="q-chart-label">Real GDP Growth Rate — Year-on-Year (%)</div>
            <canvas id="${CHART_ID}" height="260"></canvas>
          </div>

          <!-- Recession signal strip -->
          <div style="margin-top:.5rem;margin-bottom:1rem;">
            <div class="chart-label" style="margin-bottom:.4rem;">Quarter-by-quarter momentum signal</div>
            <div id="q-signal-strip" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
            <div style="display:flex;gap:1rem;margin-top:.4rem;font-size:.7rem;opacity:.6;">
              <span>🟢 Accelerating (&gt;3%)</span>
              <span>🟡 Moderate (0–3%)</span>
              <span>🔴 Contraction (&lt;0%)</span>
            </div>
          </div>

          <!-- Source -->
          <div class="chart-label" style="margin-top:.5rem;">
            Source: <a href="https://tablebuilder.singstat.gov.sg/table/TS/M015631"
            target="_blank" rel="noopener" style="color:inherit;">SingStat M015631</a>
            — GDP Year on Year Growth Rate, Quarterly (Chained 2015 $)
          </div>

          <!-- Business callout -->
          <div class="callout finding" style="margin-top:1rem;">
            <div class="callout-label">💼 Business Signal</div>
            <div id="q-business-signal">Loading latest quarter analysis…</div>
          </div>

        </div>
      </div>
    `;

    /* Inject KPI card styles if not present */
    if (!document.getElementById('q-styles')) {
      const s = document.createElement('style');
      s.id = 'q-styles';
      s.textContent = `
        .kpi-card {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(255,255,255,0.1);
          border-radius: 8px;
          padding: .75rem;
          text-align: center;
        }
        .kpi-val { font-size: 1.4rem; font-weight: 700; display: block; }
        .kpi-lbl { font-size: .68rem; opacity: .55; text-transform: uppercase;
                   letter-spacing: .04em; display: block; margin-top: .15rem; }
        .kpi-delta { font-size: .75rem; display: block; margin-top: .2rem; }
        .kpi-pos { color: #4ade80; }
        .kpi-neg { color: #f87171; }
        .kpi-neu { color: #94a3b8; }
        .signal-pill {
          font-size: .6rem; padding: .15rem .35rem; border-radius: 4px;
          cursor: default; white-space: nowrap;
        }
      `;
      document.head.appendChild(s);
    }

    /* Attach controls */
    document.getElementById('q-view').addEventListener('change', renderChart);
    document.getElementById('q-period').addEventListener('change', renderChart);
  }

  /* ── Data loading ────────────────────────────────────────── */
  let _data = null; // { quarters, values, map }

  async function loadData() {
    if (_data) return _data;

    const result = await SingStat.fetchSeries(RESOURCE_ID, SERIES_NO, { limit: 200 });
    const map    = SingStat.toMap(result.columns);

    // Keys are "YYYY Qq" — sort chronologically
    const quarters = Object.keys(map).sort((a, b) => {
      const [ay, aq] = a.split(' '); const [by, bq] = b.split(' ');
      return ay !== by ? ay - by : aq.localeCompare(bq);
    });

    _data = { quarters, values: quarters.map(q => map[q]), map, lastUpdated: result.lastUpdated };
    return _data;
  }

  /* ── Rolling average helper ──────────────────────────────── */
  function rollingAvg(arr, n) {
    return arr.map((_, i) => {
      if (i < n - 1) return null;
      const slice = arr.slice(i - n + 1, i + 1);
      return parseFloat((slice.reduce((s, v) => s + v, 0) / n).toFixed(2));
    });
  }

  /* ── KPI strip ───────────────────────────────────────────── */
  function renderKPIs(quarters, values) {
    const n   = values.length;
    const fmt = v => (v >= 0 ? '+' : '') + v.toFixed(1) + '%';
    const cls = v => v > 0 ? 'kpi-pos' : v < 0 ? 'kpi-neg' : 'kpi-neu';

    const latest = values[n-1], prev = values[n-2], yago = values[n-5];
    const avg4   = parseFloat((values.slice(-4).reduce((s,v)=>s+v,0)/4).toFixed(1));
    const dPrev  = latest - prev, dYago = n >= 5 ? latest - yago : null;

    function fill(id, val, lbl, delta, deltaLbl) {
      const el = document.getElementById(id);
      if (!el) return;
      el.innerHTML = `
        <span class="kpi-val ${cls(val)}">${fmt(val)}</span>
        <span class="kpi-lbl">${lbl}</span>
        ${delta != null ? `<span class="kpi-delta ${cls(delta)}">${fmt(delta)} ${deltaLbl}</span>` : ''}
      `;
    }

    fill('kpi-latest', latest,  quarters[n-1],          dPrev, 'vs prev qtr');
    fill('kpi-prev',   prev,    quarters[n-2],           dYago, 'vs yr ago');
    fill('kpi-yago',   yago||avg4, yago?quarters[n-5]:'4Q Avg', null, '');
    fill('kpi-avg4',   avg4,    '4-Quarter Avg',         null, '');

    // Business signal text
    const signalEl = document.getElementById('q-business-signal');
    if (signalEl) {
      const trend = dPrev >= 0 ? 'accelerating' : 'decelerating';
      const context = latest > 3 ? 'above the mature-growth benchmark (~3%), supporting expansion decisions.'
        : latest > 0 ? 'within the moderate growth range. Exercise selective expansion; monitor leading indicators.'
        : 'in contraction territory. Review cost structures and defer discretionary capex.';
      signalEl.textContent =
        `Latest quarter (${quarters[n-1]}): ${fmt(latest)} YoY — momentum is ${trend} `
        + `(${fmt(dPrev)} vs prior quarter). Growth is ${context}`;
    }
  }

  /* ── Signal strip ────────────────────────────────────────── */
  function renderSignalStrip(quarters, values) {
    const strip = document.getElementById('q-signal-strip');
    if (!strip) return;
    // Show last 5 years (20 quarters)
    const start = Math.max(0, quarters.length - 20);
    strip.innerHTML = quarters.slice(start).map((q, i) => {
      const v = values[start + i];
      const bg = v >= 3 ? 'rgba(74,222,128,.25)' : v >= 0 ? 'rgba(250,204,21,.2)' : 'rgba(248,113,113,.25)';
      const border = v >= 3 ? 'rgba(74,222,128,.6)' : v >= 0 ? 'rgba(250,204,21,.5)' : 'rgba(248,113,113,.6)';
      return `<span class="signal-pill" title="${q}: ${v >= 0 ? '+' : ''}${v}%"
        style="background:${bg};border:1px solid ${border};">${q.replace(' ', '<br>')}
        <b>${v >= 0 ? '+' : ''}${v}%</b></span>`;
    }).join('');
  }

  /* ── Chart rendering ─────────────────────────────────────── */
  let _chart = null;

  function renderChart() {
    if (!_data) return;
    const view   = document.getElementById('q-view')?.value   || 'yoy';
    const period = document.getElementById('q-period')?.value || '10';

    let { quarters, values } = _data;

    // Filter by period
    if (period !== 'all') {
      const n = parseInt(period) * 4;
      quarters = quarters.slice(-n);
      values   = values.slice(-n);
    }

    const isRolling = view === 'trend';
    const plotData  = isRolling ? rollingAvg(values, 4) : values;
    const label     = isRolling
      ? 'Real GDP Growth — 4-Quarter Rolling Average (%)'
      : 'Real GDP Growth Rate — Year-on-Year (%)';

    document.getElementById('q-chart-label').textContent = label;

    const colors = plotData.map(v =>
      v === null ? 'transparent'
      : v < 0    ? 'rgba(248,113,113,0.85)'
      : v >= 3   ? 'rgba(59,130,246,0.85)'
      :             'rgba(59,130,246,0.55)'
    );

    if (_chart) {
      _chart.data.labels                        = quarters;
      _chart.data.datasets[0].data             = plotData;
      _chart.data.datasets[0].backgroundColor  = isRolling ? 'rgba(168,85,247,0.15)' : colors;
      _chart.data.datasets[0].borderColor      = isRolling ? 'rgba(168,85,247,0.9)'  : colors;
      _chart.data.datasets[0].type             = isRolling ? 'line' : 'bar';
      _chart.data.datasets[0].fill             = isRolling;
      _chart.data.datasets[0].tension          = isRolling ? 0.35 : 0;
      _chart.data.datasets[0].pointRadius      = isRolling ? 2 : 0;
      _chart.options.scales.y.title.text       = label;
      _chart.update('active');
      return;
    }

    const ctx = document.getElementById(CHART_ID);
    if (!ctx) return;

    _chart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: quarters,
        datasets: [{
          label: label,
          data:  plotData,
          backgroundColor: colors,
          borderColor:     colors,
          borderWidth: 0,
          borderRadius: 2,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => {
                const v = ctx.raw;
                return v == null ? 'Insufficient data' : `${v >= 0 ? '+' : ''}${v}% YoY`;
              }
            }
          }
        },
        scales: {
          x: {
            ticks: {
              maxTicksLimit: 20,
              maxRotation: 45,
              font: { size: 9 }
            }
          },
          y: {
            title: { display: true, text: label },
            grid:  { color: 'rgba(255,255,255,0.06)' }
          }
        }
      }
    });
  }

  /* ── Entry point ─────────────────────────────────────────── */
  async function init() {
    buildPanel();

    const tagEl = document.getElementById('q-last-updated');

    try {
      const data = await loadData();
      if (tagEl) tagEl.textContent = `DOS updated ${data.lastUpdated}`;

      renderKPIs(data.quarters, data.values);
      renderSignalStrip(data.quarters, data.values);
      renderChart();

    } catch (err) {
      console.error('[gdp-quarterly]', err);
      if (tagEl) tagEl.textContent = 'Data unavailable';
      const panel = document.getElementById(PANEL_ID);
      if (panel) panel.innerHTML += `
        <div class="callout" style="margin-top:1rem;border-color:rgba(248,113,113,.4);">
          <div class="callout-label">⚠ API Error</div>
          Could not load quarterly data: ${err.message}
        </div>`;
    }
  }

  /* ── Expose named init for initTab hook in index.html ───── */
  // Called by initTab('ch2','quarterly') — no switchTab override needed
  window.initGDPQuarterly = function () {
    buildPanel();
    setTimeout(init, 50);
  };

})();
