/* =========================================================
   productivity.js  —  Ch4: Productivity & TFP
   Tabs: Labour Productivity | TFP & Growth Accounting | R&D & Innovation
   Data:
     - SingStat M015831 (VA/worker annual), M015861 (VA/hour quarterly),
       M015891 (per-capita GDP), M015741 (sectoral GDP contrib)
       → pre-fetched in data/singstat-productivity.json
     - singstat-growth.json (GDP levels + GFCF) for PIM capital stock
     - World Bank GB.XPD.RSDV.GD.ZS (R&D % GDP, live, browser-accessible)
     - World Bank SP.POP.SCIE.RD.P6 (researchers/million, live)
   ========================================================= */
(function () {
  'use strict';

  let _initStarted = false;
  let _prodData    = null;   // singstat-productivity.json
  let _growthData  = null;   // singstat-growth.json (reused)

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  const fmt1 = v => v == null ? '—' : Number(v).toFixed(1);
  const pct  = v => v == null ? '—' : `${Number(v) > 0 ? '+' : ''}${Number(v).toFixed(1)}%`;

  function destroyChart(id) {
    const c = Chart.getChart(id); if (c) c.destroy();
  }

  const ACCENT  = '#1a5276';
  const ACCENT2 = '#c0392b';
  const ACCENT3 = '#27ae60';
  const ACCENT4 = '#d68910';
  const GRID    = 'rgba(255,255,255,0.07)';
  const TEXT    = '#ccc';

  const CHART_DEFAULTS = {
    color: TEXT,
    plugins: { legend: { labels: { color: TEXT, boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TEXT, font: { size: 10 } } },
      y: { grid: { color: GRID }, ticks: { color: TEXT, font: { size: 10 } } },
    },
  };
  function baseOptions(extra) { return Object.assign({}, CHART_DEFAULTS, extra || {}); }

  /* ---------- data loading ---------- */
  async function loadProdData() {
    if (_prodData) return _prodData;
    const cacheKey = 'singstat_productivity';
    const cached = SGEcoCache?.get?.(cacheKey);
    if (cached) { _prodData = cached; return _prodData; }
    const r = await fetch('data/singstat-productivity.json');
    _prodData = await r.json();
    SGEcoCache?.set?.(cacheKey, _prodData);
    return _prodData;
  }

  async function loadGrowthData() {
    if (_growthData) return _growthData;
    const cacheKey = 'singstat_growth_bundle';
    const cached = SGEcoCache?.get?.(cacheKey);
    if (cached) { _growthData = cached; return _growthData; }
    const r = await fetch('data/singstat-growth.json');
    _growthData = await r.json();
    return _growthData;
  }

  async function fetchWorldBank(indicator, countries, dateRange) {
    const iso = countries.join(';');
    const url = `https://api.worldbank.org/v2/country/${iso}/indicator/${indicator}?format=json&per_page=300&date=${dateRange}`;
    const r = await fetch(url);
    const d = await r.json();
    const map = {};
    (d[1] || []).forEach(x => {
      if (x.value == null) return;
      const c = x.countryiso3code;
      if (!map[c]) map[c] = {};
      map[c][x.date] = x.value;
    });
    return map;
  }

  /* =========================================================
     TAB 1 — Labour Productivity
     ========================================================= */
  async function initLabourProductivity() {
    const panel = $('ch4-labour');
    if (!panel || panel.dataset.built) return;

    const d = await loadProdData();
    const vpw = d.vaPctWorkerAnnual;   // % change by sector, annual
    const vph = d.vaHourQuarterly;     // % change by sector, quarterly
    const pcp = d.perCapitaGDP;

    /* KPIs */
    const kpiMount = $('ch4-labour-kpi');
    const totalRow  = vpw['Total (Based On GDP At Current Market Prices)'] || {};
    const val2025   = parseFloat(totalRow['2025'] || 0);
    const val2024   = parseFloat(totalRow['2024'] || 0);
    const val2023   = parseFloat(totalRow['2023'] || 0);
    const pcGrowth  = pcp['Year On Year Growth Rate Of Per Capita GDP In Chained (2015) Dollars'] || {};
    const pc2025    = parseFloat(pcGrowth['2025'] || 0);
    const qRow      = vph['Total'] || {};
    const qKeys     = Object.keys(qRow).sort();
    const latestQ   = qKeys[qKeys.length - 1];
    const latestQVal = parseFloat(qRow[latestQ] || 0);

    if (kpiMount) {
      kpiMount.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:0">
          <div class="kpi-card">
            <div class="kpi-label">VA/Worker Growth (2025)</div>
            <div class="kpi-value ${val2025>=0?'kpi-good':'kpi-warn'}">${val2025 > 0 ? '+' : ''}${val2025.toFixed(1)}%</div>
            <div class="kpi-sub">All industries, current prices</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">VA/Worker Growth (2024)</div>
            <div class="kpi-value" style="color:var(--accent)">${val2024 > 0 ? '+' : ''}${val2024.toFixed(1)}%</div>
            <div class="kpi-sub">vs 2023: ${val2023 > 0 ? '+' : ''}${val2023.toFixed(1)}%</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Real GDP per Capita (2025)</div>
            <div class="kpi-value ${pc2025>=0?'kpi-good':'kpi-warn'}">${pc2025 > 0 ? '+' : ''}${pc2025.toFixed(1)}%</div>
            <div class="kpi-sub">Chained 2015 SGD, YoY</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">VA/Hour Worked (${latestQ})</div>
            <div class="kpi-value ${latestQVal>=0?'kpi-good':'kpi-warn'}">${latestQVal > 0 ? '+' : ''}${latestQVal.toFixed(1)}%</div>
            <div class="kpi-sub">All industries, quarterly YoY</div>
          </div>
        </div>`;
    }

    /* Chart 1: VA per worker % change — headline + key sectors, annual trend */
    const sectors = [
      { key: 'Total (Based On GDP At Current Market Prices)', label: 'Total Economy', color: ACCENT,  width: 2.5 },
      { key: 'Manufacturing',                                  label: 'Manufacturing', color: ACCENT2, width: 1.5 },
      { key: 'Information & Communications',                   label: 'Infocomm',      color: ACCENT3, width: 1.5 },
      { key: 'Finance & Insurance',                            label: 'Finance',        color: ACCENT4, width: 1.5 },
      { key: 'Construction',                                   label: 'Construction',   color: '#8e44ad', width: 1.5 },
    ];
    const annYears = ['2005','2007','2009','2011','2013','2015','2017','2019','2021','2022','2023','2024','2025'];

    destroyChart('ch4-lp-trend');
    const ctx1 = $('ch4-lp-trend');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'line',
        data: {
          labels: annYears,
          datasets: sectors.map(s => ({
            label: s.label,
            data: annYears.map(y => {
              const v = parseFloat(vpw[s.key]?.[y]);
              return isNaN(v) ? null : v;
            }),
            borderColor: s.color,
            backgroundColor: s.color + '18',
            borderWidth: s.width,
            pointRadius: 3,
            tension: 0.25,
            fill: s.key.includes('Total'),
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt1(c.raw)}%` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'YoY % change', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Chart 2: VA per hour worked quarterly — headline + manufacturing */
    const qKeys2  = Object.keys(vph['Total'] || {}).sort();
    const qLabels = qKeys2.slice(-20);
    const qSectors = [
      { key: 'Total',                    label: 'Total Economy', color: ACCENT,  width: 2.5 },
      { key: 'Manufacturing',            label: 'Manufacturing', color: ACCENT2, width: 1.5 },
      { key: 'Information & Communications', label: 'Infocomm', color: ACCENT3, width: 1.5 },
      { key: 'Finance & Insurance',      label: 'Finance',        color: ACCENT4, width: 1.5 },
    ];

    destroyChart('ch4-lp-quarterly');
    const ctx2 = $('ch4-lp-quarterly');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'line',
        data: {
          labels: qLabels,
          datasets: qSectors.map(s => ({
            label: s.label,
            data: qLabels.map(q => {
              const v = parseFloat(vph[s.key]?.[q]);
              return isNaN(v) ? null : v;
            }),
            borderColor: s.color,
            borderWidth: s.width,
            pointRadius: 2,
            tension: 0.25,
            fill: false,
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt1(c.raw)}%` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x,
              ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxRotation: 45 }
            },
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'YoY % change', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Chart 3: cross-sector bar — latest year VA/worker change */
    const crossSectors = [
      'Manufacturing', 'Construction', 'Wholesale & Retail Trade',
      'Transportation & Storage', 'Accommodation & Food Services',
      'Information & Communications', 'Finance & Insurance',
      'Professional Services', 'Administrative & Support Services',
      'Health & Social Services', 'Education',
    ];
    const latestYear = '2025';
    const barData = crossSectors.map(s => {
      const v = parseFloat(vpw[s]?.[latestYear]);
      return isNaN(v) ? 0 : v;
    });

    destroyChart('ch4-lp-sectors');
    const ctx3 = $('ch4-lp-sectors');
    if (ctx3) {
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: crossSectors.map(s => s.replace(' & ', '/').replace('Administrative & Support Services', 'Admin/Support')),
          datasets: [{
            label: `VA/Worker % change (${latestYear})`,
            data: barData,
            backgroundColor: barData.map(v => v >= 0 ? ACCENT + 'cc' : ACCENT2 + 'cc'),
            borderRadius: 3,
          }]
        },
        options: {
          ...baseOptions({ indexAxis: 'y' }),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            legend: { display: false },
            tooltip: { callbacks: { label: c => `${c.raw > 0 ? '+' : ''}${fmt1(c.raw)}%` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x,
              title: { display: true, text: 'YoY % change', color: TEXT, font: { size: 10 } }
            },
            y: CHART_DEFAULTS.scales.y,
          }
        }
      });
    }

    panel.dataset.built = '1';
  }

  /* =========================================================
     TAB 2 — TFP & Growth Accounting
     ========================================================= */
  const EMP_BENCH = {
    1965:850e3,1966:878e3,1967:908e3,1968:943e3,1969:976e3,
    1970:930e3,1971:958e3,1972:1007e3,1973:1055e3,1974:1087e3,
    1975:1055e3,1976:1079e3,1977:1108e3,1978:1148e3,1979:1168e3,
    1980:1159e3,1981:1198e3,1982:1229e3,
  };

  function buildCapitalStock(gfcfMap, delta) {
    const years = Object.keys(gfcfMap).map(Number).sort((a,b) => a-b);
    const y0 = years[0], y10 = y0 + 10;
    const gInit = (gfcfMap[y10] / gfcfMap[y0]) ** (1/10) - 1;
    const K = { [y0]: gfcfMap[y0] / (gInit + delta) };
    years.slice(1).forEach(t => { K[t] = (1-delta) * K[t-1] + gfcfMap[t]; });
    return K;
  }

  function computeTFPSeries(growthBundle, alpha, delta) {
    const gdpMap  = Object.fromEntries(Object.entries(growthBundle.gdp).map(([k,v])  => [+k, v]));
    const gfcfMap = Object.fromEntries(Object.entries(growthBundle.gfcf).map(([k,v]) => [+k, v]));
    const vapwMap = Object.fromEntries(Object.entries(growthBundle.vapw).map(([k,v]) => [+k, v]));
    const empMap  = { ...EMP_BENCH };
    Object.keys(vapwMap).forEach(y => {
      const yr = +y;
      if (gdpMap[yr] && vapwMap[yr]) empMap[yr] = (gdpMap[yr] * 1e6) / vapwMap[yr];
    });
    const K = buildCapitalStock(gfcfMap, delta);
    const annual = {};
    Object.keys(gdpMap).map(Number).sort((a,b) => a-b).forEach(t => {
      const p = t - 1;
      if (!(p in gdpMap) || !(p in K) || !(p in empMap) || !(t in K) || !(t in empMap)) return;
      const gy = Math.log(gdpMap[t]/gdpMap[p]);
      const gk = Math.log(K[t]/K[p]);
      const gl = Math.log(empMap[t]/empMap[p]);
      annual[t] = {
        gy:  gy  * 100,
        gk:  gk  * 100,
        gl:  gl  * 100,
        tfp: (gy - alpha*gk - (1-alpha)*gl) * 100,
        cap: alpha * gk * 100,
        lab: (1-alpha) * gl * 100,
      };
    });
    return annual;
  }

  let _tfpAlpha = 0.40;
  let _tfpDelta = 0.06;
  let _tfpSeries = null;
  let _tfpListeners = false;

  function renderTFPCharts(series) {
    const years = Object.keys(series).map(Number).filter(y => y >= 1975).sort((a,b) => a-b);

    /* Chart A: TFP time series line */
    destroyChart('ch4-tfp-series');
    const ctxA = $('ch4-tfp-series');
    if (ctxA) {
      new Chart(ctxA, {
        type: 'bar',
        data: {
          labels: years,
          datasets: [
            {
              type: 'bar', label: 'TFP contribution (pp)',
              data: years.map(y => parseFloat(series[y].tfp.toFixed(2))),
              backgroundColor: years.map(y => series[y].tfp >= 0 ? ACCENT3 + 'bb' : ACCENT2 + 'bb'),
              borderRadius: 2, order: 2,
            },
            {
              type: 'line', label: 'GDP Growth (%)',
              data: years.map(y => parseFloat(series[y].gy.toFixed(2))),
              borderColor: ACCENT, borderWidth: 2,
              pointRadius: 0, fill: false, tension: 0.25, order: 1,
            },
          ]
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt1(c.raw)}pp` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks, maxTicksLimit: 12 } },
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'Percentage points (pp)', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Chart B: stacked decomposition by era */
    const eras = [
      { label: '1966–1980', t0: 1966, t1: 1980 },
      { label: '1981–1997', t0: 1981, t1: 1997 },
      { label: '1998–2010', t0: 1998, t1: 2010 },
      { label: '2011–2025', t0: 2011, t1: 2025 },
    ];
    const avg = arr => arr.reduce((s,x) => s+x, 0) / arr.length;
    const eraData = eras.map(e => {
      const obs = years.filter(y => y >= e.t0 && y <= e.t1).map(y => series[y]);
      return {
        label: e.label,
        gy:  parseFloat(avg(obs.map(o => o.gy)).toFixed(2)),
        cap: parseFloat(avg(obs.map(o => o.cap)).toFixed(2)),
        lab: parseFloat(avg(obs.map(o => o.lab)).toFixed(2)),
        tfp: parseFloat(avg(obs.map(o => o.tfp)).toFixed(2)),
      };
    });

    destroyChart('ch4-tfp-decomp');
    const ctxB = $('ch4-tfp-decomp');
    if (ctxB) {
      new Chart(ctxB, {
        type: 'bar',
        data: {
          labels: eraData.map(e => e.label),
          datasets: [
            { label: 'TFP',     data: eraData.map(e => e.tfp), backgroundColor: ACCENT3 + 'cc', borderRadius: 2 },
            { label: 'Capital', data: eraData.map(e => e.cap), backgroundColor: ACCENT  + 'cc', borderRadius: 2 },
            { label: 'Labour',  data: eraData.map(e => e.lab), backgroundColor: ACCENT4 + 'cc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt1(c.raw)}pp` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y, stacked: true,
              title: { display: true, text: 'Avg annual pp contribution', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Update KPI result box */
    const recent = eraData[3];
    const tfpShare = ((recent.tfp / recent.gy) * 100).toFixed(0);
    const el = $('ch4-tfp-result');
    if (el) {
      el.innerHTML =
        `<strong>2011–2025 avg</strong> &nbsp;|&nbsp; ` +
        `GDP: <span class="result-highlight">${recent.gy.toFixed(2)}%</span> &nbsp;|&nbsp; ` +
        `Capital: ${recent.cap.toFixed(2)}pp &nbsp;|&nbsp; ` +
        `Labour: ${recent.lab.toFixed(2)}pp &nbsp;|&nbsp; ` +
        `<strong>TFP: ${recent.tfp.toFixed(2)}pp (${tfpShare}% of growth)</strong> ` +
        `<span style="font-size:.72rem;opacity:.5">&nbsp;α=${_tfpAlpha.toFixed(2)} δ=${(_tfpDelta*100).toFixed(1)}%</span>`;
    }
  }

  async function initTFP() {
    const panel = $('ch4-tfp');
    if (!panel || panel.dataset.built) return;

    /* Attach slider listeners */
    if (!_tfpListeners) {
      _tfpListeners = true;
      ['ch4-tfp-alpha','ch4-tfp-delta'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', () => {
          _tfpAlpha = parseFloat($('ch4-tfp-alpha')?.value ?? '0.40');
          _tfpDelta = parseFloat($('ch4-tfp-delta')?.value ?? '6') / 100;
          const av = $('ch4-tfp-alpha-val'); if (av) av.textContent = _tfpAlpha.toFixed(2);
          const dv = $('ch4-tfp-delta-val'); if (dv) dv.textContent = (_tfpDelta*100).toFixed(1) + '%';
          if (_tfpSeries) renderTFPCharts(_tfpSeries);
        });
      });
    }

    try {
      const g = await loadGrowthData();
      _tfpSeries = computeTFPSeries(g, _tfpAlpha, _tfpDelta);
      renderTFPCharts(_tfpSeries);
    } catch(e) {
      console.warn('[productivity] TFP data error:', e.message);
    }

    panel.dataset.built = '1';
  }

  /* =========================================================
     TAB 3 — R&D & Innovation
     ========================================================= */
  async function initRnD() {
    const panel = $('ch4-rnd');
    if (!panel || panel.dataset.built) return;

    /* Fetch World Bank R&D % GDP for SGP + peers */
    let rdMap = {};
    let resMap = {};
    try {
      [rdMap, resMap] = await Promise.all([
        fetchWorldBank('GB.XPD.RSDV.GD.ZS', ['SGP','KOR','DEU','USA','JPN'], '2000:2023'),
        fetchWorldBank('SP.POP.SCIE.RD.P6',  ['SGP','KOR','DEU','USA','JPN'], '2000:2022'),
      ]);
    } catch(e) {
      console.warn('[productivity] WB fetch error:', e.message);
    }

    /* KPIs */
    const kpiMount = $('ch4-rnd-kpi');
    const sgpRd = rdMap['SGP'] || {};
    const sgpRes = resMap['SGP'] || {};
    const latestRdYear  = Object.keys(sgpRd).sort().pop() || '2020';
    const latestResYear = Object.keys(sgpRes).sort().pop() || '2021';
    const rdLatest  = parseFloat(sgpRd[latestRdYear]  || 2.16).toFixed(2);
    const resLatest = Math.round(parseFloat(sgpRes[latestResYear] || 7917));
    const korRd = parseFloat(Object.values(rdMap['KOR'] || {}).pop() || 5.21).toFixed(1);

    if (kpiMount) {
      kpiMount.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:0">
          <div class="kpi-card">
            <div class="kpi-label">R&amp;D Intensity (${latestRdYear})</div>
            <div class="kpi-value" style="color:var(--accent)">${rdLatest}%</div>
            <div class="kpi-sub">% of GDP · World Bank</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Korea R&amp;D (benchmark)</div>
            <div class="kpi-value" style="color:var(--accent2)">${korRd}%</div>
            <div class="kpi-sub">% of GDP · highest in OECD</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Researchers/Million (${latestResYear})</div>
            <div class="kpi-value" style="color:var(--accent3)">${resLatest.toLocaleString()}</div>
            <div class="kpi-sub">Among top 10 globally</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Ho &amp; Wong TFP Elasticity</div>
            <div class="kpi-value" style="color:var(--accent4)">0.05–0.11</div>
            <div class="kpi-sub">Long-run, per 1% R&D stock ↑</div>
          </div>
        </div>`;
    }

    /* Chart 1: R&D % GDP — SGP vs peers time series */
    const rdYears = [];
    for (let y = 2000; y <= 2023; y++) rdYears.push(String(y));
    const rdPeers = [
      { iso: 'SGP', label: 'Singapore', color: ACCENT,  width: 2.5 },
      { iso: 'KOR', label: 'Korea',     color: ACCENT2, width: 1.5 },
      { iso: 'DEU', label: 'Germany',   color: ACCENT3, width: 1.5 },
      { iso: 'USA', label: 'USA',       color: ACCENT4, width: 1.5 },
      { iso: 'JPN', label: 'Japan',     color: '#8e44ad', width: 1.5 },
    ];

    destroyChart('ch4-rnd-trend');
    const ctx1 = $('ch4-rnd-trend');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'line',
        data: {
          labels: rdYears,
          datasets: rdPeers.map(p => ({
            label: p.label,
            data: rdYears.map(y => rdMap[p.iso]?.[y] ?? null),
            borderColor: p.color,
            backgroundColor: p.iso === 'SGP' ? ACCENT + '18' : 'transparent',
            borderWidth: p.width,
            pointRadius: 2,
            tension: 0.25,
            fill: p.iso === 'SGP',
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${fmt1(c.raw)}% of GDP` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: '% of GDP', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Chart 2: Researchers per million — SGP vs peers */
    const resPeers = [
      { iso: 'SGP', label: 'Singapore', color: ACCENT  },
      { iso: 'KOR', label: 'Korea',     color: ACCENT2 },
      { iso: 'DEU', label: 'Germany',   color: ACCENT3 },
      { iso: 'USA', label: 'USA',       color: ACCENT4 },
      { iso: 'JPN', label: 'Japan',     color: '#8e44ad' },
    ];
    const resYears = [];
    for (let y = 2005; y <= 2022; y++) resYears.push(String(y));

    destroyChart('ch4-rnd-researchers');
    const ctx2 = $('ch4-rnd-researchers');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'line',
        data: {
          labels: resYears,
          datasets: resPeers.map(p => ({
            label: p.label,
            data: resYears.map(y => resMap[p.iso]?.[y] ?? null),
            borderColor: p.color,
            borderWidth: p.iso === 'SGP' ? 2.5 : 1.5,
            pointRadius: 2,
            tension: 0.25,
            fill: false,
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw ? Math.round(c.raw).toLocaleString() : '—'}` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'Researchers per million population', color: TEXT, font: { size: 10 } }
            }
          }
        }
      });
    }

    /* Chart 3: R&D elasticity simulator — interactive */
    renderRndSimulator();

    panel.dataset.built = '1';
  }

  function renderRndSimulator() {
    const rdChg   = parseFloat($('ch4-rnd-chg')?.value   ?? 5);
    const srElast = parseFloat($('ch4-rnd-sr')?.value     ?? 0.020);
    const lrElast = parseFloat($('ch4-rnd-lr')?.value     ?? 0.08);
    const lags = [0,1,2,3,4,5,6,7,8,9,10];
    const decay = 0.6;
    // Distribute long-run impact geometrically across lags
    const total = lags.map(i => Math.pow(decay, i)).reduce((a,b) => a+b, 0);
    const impacts = lags.map((i, idx) => {
      const wt = Math.pow(decay, idx) / total;
      const lagImpact = (lrElast - srElast) * wt * rdChg;
      return parseFloat(((idx === 0 ? srElast : 0) * rdChg + lagImpact).toFixed(4));
    });
    const cumulative = [];
    impacts.reduce((acc, v) => { cumulative.push(parseFloat((acc + v).toFixed(4))); return acc + v; }, 0);

    const resultEl = $('ch4-rnd-result');
    if (resultEl) {
      resultEl.innerHTML =
        `+${rdChg}% R&D stock &rarr; ` +
        `<strong>Short-run TFP: +${(srElast * rdChg).toFixed(3)}pp</strong> &nbsp;|&nbsp; ` +
        `<strong>Long-run TFP: +${(lrElast * rdChg).toFixed(3)}pp</strong> (cumulative over 10 yrs)`;
    }

    const svEl = $('ch4-rnd-sr-val');  if (svEl) svEl.textContent = srElast.toFixed(3);
    const lvEl = $('ch4-rnd-lr-val');  if (lvEl) lvEl.textContent = lrElast.toFixed(2);
    const cvEl = $('ch4-rnd-chg-val'); if (cvEl) cvEl.textContent = rdChg;

    destroyChart('ch4-rnd-sim');
    const ctx = $('ch4-rnd-sim');
    if (!ctx) return;
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: lags.map(i => `Yr ${i}`),
        datasets: [
          { type: 'bar',  label: 'Annual TFP impact (pp)', data: impacts,    backgroundColor: ACCENT3 + 'bb', borderRadius: 2, order: 2 },
          { type: 'line', label: 'Cumulative TFP (pp)',    data: cumulative, borderColor: ACCENT2, borderWidth: 2, pointRadius: 3, fill: false, order: 1 },
        ]
      },
      options: {
        ...baseOptions(),
        plugins: {
          ...CHART_DEFAULTS.plugins,
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw.toFixed(3)}pp` } }
        },
        scales: {
          x: CHART_DEFAULTS.scales.x,
          y: { ...CHART_DEFAULTS.scales.y,
            title: { display: true, text: 'TFP impact (percentage points)', color: TEXT, font: { size: 10 } }
          }
        }
      }
    });
  }

  /* =========================================================
     Public API
     ========================================================= */
  window.initLabourProductivity = initLabourProductivity;
  window.initTFP_ch4            = initTFP;
  window.initRnD_ch4            = initRnD;
  window.renderRndSimulator     = renderRndSimulator;

  window.initProductivity = async function () {
    if (_initStarted) return;
    _initStarted = true;
    await initLabourProductivity();
  };

})();
