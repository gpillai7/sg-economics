/**
 * js/modules/gdp-annual.js
 * Live SingStat data patch for the GDP Trends tab (ch2-gdp).
 *
 * Requires: Chart.js, js/core/cache.js, js/core/singstat.js
 * Load order in index.html (after existing scripts):
 *   <script src="js/core/cache.js"></script>
 *   <script src="js/core/singstat.js"></script>
 *   <script src="js/modules/gdp-annual.js"></script>    ← add this
 *   <script src="js/modules/gdp-quarterly.js"></script>
 *
 * What it does:
 *   - Overwrites window.updateGDPChart() with a live version
 *   - Fetches M015741 s1 (growth %) and M015731 s1 (nominal SGD)
 *   - Derives Real GDP Index (1965=100) by chaining growth rates
 *   - Derives GDP per Capita (USD) via approximate FX + population
 *   - Shares SGEcoCache with gdp-quarterly.js — zero duplicate fetches
 *   - Falls back silently to original static function if API fails
 *   - Registers initGDPAnnual for the initTab hook
 *
 * index.html change — add to initTab lookup (around line 1961):
 *   'ch2-gdp': function() { if(window.initGDPAnnual) window.initGDPAnnual(); },
 *
 * Also add to initModule ch2 entry (around line 1920):
 *   ch2: () => { initGDPAnnual ? initGDPAnnual() : updateGDPChart(); updateGrowthAcct(); updateFiscal(); },
 */

(function () {
  'use strict';

  /* ── Keep reference to original static function as fallback ─ */
  const _staticUpdateGDPChart = window.updateGDPChart;

  /* ── Approximate SGD→USD annual average rate ─────────────── */
  function sgdToUsd(y) {
    if (y < 1975) return 0.35; if (y < 1985) return 0.46;
    if (y < 1990) return 0.50; if (y < 1995) return 0.63;
    if (y < 1998) return 0.71; if (y < 2002) return 0.57;
    if (y < 2007) return 0.60; if (y < 2012) return 0.73;
    if (y < 2020) return 0.73; return 0.75;
  }

  /* ── Approximate mid-year population (thousands) ─────────── */
  function popK(y) {
    const pts = {
      1960:1646,1965:1887,1970:2074,1975:2263,1980:2414,
      1985:2736,1990:3047,1995:3524,2000:4028,2005:4266,
      2010:5077,2015:5535,2020:5686,2021:5454,2022:5637,
      2023:5918,2024:6040,2025:6100
    };
    const ys = Object.keys(pts).map(Number).sort((a,b)=>a-b);
    if (y <= ys[0]) return pts[ys[0]];
    if (y >= ys[ys.length-1]) return pts[ys[ys.length-1]];
    for (let i=1;i<ys.length;i++) {
      if (y<=ys[i]) {
        const t=(y-ys[i-1])/(ys[i]-ys[i-1]);
        return pts[ys[i-1]]+t*(pts[ys[i]]-pts[ys[i-1]]);
      }
    }
    return 5000;
  }

  /* ── Load & process annual GDP data ──────────────────────── */
  let _annualData = null;

  async function loadAnnualData() {
    if (_annualData) return _annualData;

    const [growthRes, nominalRes] = await Promise.all([
      SingStat.fetchSeries('M015741', '1', { limit: 100 }), // growth rate %
      SingStat.fetchSeries('M015731', '1', { limit: 100 }), // nominal GDP SGD M
    ]);

    const growthMap  = SingStat.toMap(growthRes.columns);
    const nominalMap = SingStat.toMap(nominalRes.columns);

    const years = Object.keys(growthMap)
      .map(Number).sort((a,b)=>a-b)
      .filter(y => y >= 1961);

    /* Real GDP Index — chain from 1965=100 */
    const indexMap = {};
    const BASE = 1965;
    indexMap[BASE] = 100;
    const bi = years.indexOf(BASE);
    for (let i=bi+1;i<years.length;i++) {
      indexMap[years[i]] = indexMap[years[i-1]] * (1 + growthMap[years[i]]/100);
    }
    for (let i=bi-1;i>=0;i--) {
      indexMap[years[i]] = indexMap[years[i+1]] / (1 + growthMap[years[i+1]]/100);
    }

    /* GDP per Capita USD */
    const perCapitaMap = {};
    years.forEach(y => {
      if (nominalMap[y]) {
        perCapitaMap[y] = Math.round(
          (nominalMap[y] * 1e6 * sgdToUsd(y)) / (popK(y) * 1e3)
        );
      }
    });

    _annualData = {
      years, growthMap, nominalMap, indexMap, perCapitaMap,
      lastUpdated: growthRes.lastUpdated,
    };
    return _annualData;
  }

  /* ── Status badge ─────────────────────────────────────────── */
  function setStatus(msg, isError) {
    let el = document.getElementById('gdp-annual-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gdp-annual-status';
      el.style.cssText = 'font-size:.72rem;padding:.25rem .6rem;border-radius:5px;'
        + 'display:inline-block;margin-bottom:.5rem;transition:opacity .5s;';
      const canvas = document.getElementById('chart-gdp');
      if (canvas && canvas.parentNode) canvas.parentNode.insertBefore(el, canvas);
    }
    el.textContent = msg;
    el.style.background = isError ? 'rgba(239,68,68,.12)' : 'rgba(59,130,246,.1)';
    el.style.color       = isError ? '#fca5a5'             : '#93c5fd';
    el.style.border      = isError ? '1px solid rgba(239,68,68,.3)' : '1px solid rgba(59,130,246,.25)';
    el.style.opacity     = '1';
    if (!isError) setTimeout(() => { el.style.opacity='0'; }, 5000);
  }

  /* ── Phase highlight colours ──────────────────────────────── */
  function phaseColors(years, values, phase, isBar) {
    return years.map((y, i) => {
      const inPhase =
        phase === 'all'     ? true :
        phase === 'catchup' ? (y >= 1965 && y <= 1997) :
        phase === 'crisis'  ? (y >= 1997 && y <= 2010) :
        phase === 'mature'  ? (y >= 2010) : true;

      if (!inPhase) return 'rgba(255,255,255,0.10)';
      if (isBar && values[i] < 0) return 'rgba(239,100,100,0.85)';
      return isBar ? 'rgba(59,130,246,0.82)' : 'rgba(26,82,118,0.9)';
    });
  }

  /* ── Core chart render ────────────────────────────────────── */
  function renderAnnualChart(data) {
    const metric = document.getElementById('gdp-metric')?.value || 'real_gdp';
    const phase  = document.getElementById('gdp-phase')?.value  || 'all';

    const { years, growthMap, indexMap, perCapitaMap } = data;
    const isBar = metric === 'real_gdp';

    let values, label;
    if (metric === 'real_gdp') {
      values = years.map(y => growthMap[y] ?? null);
      label  = 'Real GDP Growth Rate (%)';
    } else if (metric === 'gdp_per_capita') {
      values = years.map(y => perCapitaMap[y] ?? null);
      label  = 'GDP per Capita (USD)';
    } else {
      values = years.map(y => indexMap[y] ? parseFloat(indexMap[y].toFixed(1)) : null);
      label  = 'Real GDP Index (1965 = 100)';
    }

    const colors = phaseColors(years, values, phase, isBar);

    /* Use mkChart (existing helper in index.html) */
    mkChart('chart-gdp', {
      type: isBar ? 'bar' : 'line',
      data: {
        labels: years,
        datasets: [{
          label,
          data: values,
          backgroundColor: isBar ? colors : 'rgba(26,82,118,0.1)',
          borderColor:     isBar ? colors : 'rgba(26,82,118,0.9)',
          borderWidth: isBar ? 0 : 2,
          fill:        !isBar,
          tension:     isBar ? 0 : 0.3,
          pointRadius: isBar ? 0 : 1.5,
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: c => {
                if (c.raw == null) return 'No data';
                if (metric === 'real_gdp')      return `${c.raw >= 0 ? '+' : ''}${c.raw.toFixed(1)}% YoY`;
                if (metric === 'gdp_per_capita') return `USD ${c.raw.toLocaleString()}`;
                return `Index: ${c.raw.toFixed(1)}`;
              }
            }
          }
        },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: 15, font: { size: 9 } } },
          y: {
            title: { display: true, text: label },
            grid:  { color: 'rgba(0,0,0,0.06)' },
          }
        }
      }
    });
  }

  /* ── Live updateGDPChart — replaces the static version ────── */
  async function updateGDPChartLive() {
    try {
      const data = await loadAnnualData();
      renderAnnualChart(data);
      setStatus(
        `✓ SingStat live: ${data.years[0]}–${data.years[data.years.length-1]}`
        + ` (${data.years.length} yrs · DOS updated ${data.lastUpdated})`
      );
    } catch (err) {
      console.warn('[gdp-annual] API failed, using static data:', err.message);
      setStatus('⚠ Using cached static data — ' + err.message, true);
      if (_staticUpdateGDPChart) _staticUpdateGDPChart();
    }
  }

  /* ── Wire up dropdown listeners ───────────────────────────── */
  function attachListeners() {
    const metricEl = document.getElementById('gdp-metric');
    const phaseEl  = document.getElementById('gdp-phase');
    // Remove existing onchange attributes (they call the old static function)
    if (metricEl) { metricEl.removeAttribute('onchange'); metricEl.addEventListener('change', updateGDPChartLive); }
    if (phaseEl)  { phaseEl.removeAttribute('onchange');  phaseEl.addEventListener('change', updateGDPChartLive); }
  }

  /* ── Public init — called by initTab and initModule ────────── */
  window.initGDPAnnual = function () {
    attachListeners();
    updateGDPChartLive();
  };

  /* ── Also overwrite the global so initModule ch2 works ─────── */
  window.updateGDPChart = updateGDPChartLive;

})();
