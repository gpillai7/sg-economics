/**
 * js/modules/gdp-fiscal.js
 * Fiscal Multiplier & Revenue Buoyancy — live SingStat GDP + MOF revenue actuals
 *
 * DATA
 * ────
 * GDP baseline : M015731 s1 Nominal GDP at Current Market Prices (SingStat)
 * Tax revenue  : MOF Budget Annex / IRAS Annual Reports FY2013–FY2024 (SGD mn)
 * Buoyancies   : Median (dT/T)/(dY/Y) computed from 2014–2024 actual data
 *                CIT=0.66  PIT=0.78  GST=0.56  (vs nominal GDP, excl. outlier years)
 *
 * MODEL
 * ─────
 * GDP_shocked        = GDP_base × (1 + shock/100)
 * Stimulus_effect    = stimulus_SGDbn × 1000 × multiplier
 * GDP_recovered      = GDP_shocked + Stimulus_effect
 * For each tax type:
 *   Rev_baseline     = latest actual (SGD mn)
 *   Rev_shocked      = Rev_baseline × (1 + shock/100 × buoyancy)
 *   Rev_recovered    = Rev_baseline × (1 + (shock + saved_pp)/100 × buoyancy)
 *   Rev_impact       = Rev_shocked  − Rev_baseline   (negative = loss)
 *   Rev_saved        = Rev_recovered − Rev_shocked    (positive = recovered)
 *
 * INDEX.HTML CHANGES
 * ──────────────────
 * 1. Script tag after gdp-growth-acct.js:
 *      <script src="js/modules/gdp-fiscal.js"></script>
 * 2. initTab entry:
 *      'ch2-fiscal': function() { if(window.initFiscal) window.initFiscal(); },
 * 3. initModule ch2: add initFiscal call alongside existing calls
 */
(function () {
  'use strict';

  /* ── Load data bundle ───────────────────────────────────── */
  let _data = null;

  async function loadData() {
    if (_data) return _data;
    const cacheKey = 'fiscal_bundle_v1';
    const cached = SGEcoCache.get(cacheKey);
    if (cached) { _data = cached; return _data; }
    const bundle = await fetch('data/singstat-fiscal.json').then(r => r.json());
    _data = bundle;
    SGEcoCache.set(cacheKey, bundle);
    return _data;
  }

  /* ── Helpers ────────────────────────────────────────────── */
  function getLatestGDP(bundle) {
    const yr = Math.max(...Object.keys(bundle.gdp).map(Number));
    return { year: yr, value: bundle.gdp[yr] }; // SGD mn
  }

  function getLatestRevenue(bundle) {
    const yr = Math.max(...Object.keys(bundle.revenue).map(Number));
    return { year: yr, ...bundle.revenue[yr] };
  }

  function fmt(mn) {
    // Format SGD mn → "SGD X.Xbn" or "SGD Xmn"
    if (Math.abs(mn) >= 1000) return `SGD ${(mn/1000).toFixed(1)}bn`;
    return `SGD ${Math.round(mn)}mn`;
  }

  function fmtDelta(mn) {
    const sign = mn >= 0 ? '+' : '';
    return `${sign}${(mn/1000).toFixed(1)}bn`;
  }

  /* ── KPI cards ──────────────────────────────────────────── */
  function renderKPIs(gdpBase, gdpShocked, gdpRecovered, stimCost, netFiscal) {
    const box = document.getElementById('fiscal-kpis');
    if (!box) return;
    const cards = [
      { label: 'GDP Baseline',      value: `SGD ${(gdpBase/1000).toFixed(0)}bn`,       sub: 'Nominal 2024, SingStat' },
      { label: 'GDP After Shock',   value: `SGD ${(gdpShocked/1000).toFixed(0)}bn`,     sub: `${((gdpShocked-gdpBase)/gdpBase*100).toFixed(1)}% vs baseline`, warn: gdpShocked < gdpBase },
      { label: 'GDP w/ Stimulus',   value: `SGD ${(gdpRecovered/1000).toFixed(0)}bn`,   sub: `Recovered ${((gdpRecovered-gdpShocked)/1000).toFixed(1)}bn`, good: gdpRecovered > gdpShocked },
      { label: 'Net Fiscal Cost',   value: fmt(netFiscal),                               sub: 'Stimulus spend − tax recovered', warn: netFiscal > 0 },
    ];
    box.innerHTML = cards.map(c => `
      <div class="kpi-card">
        <div class="kpi-value ${c.warn?'kpi-warn':''} ${c.good?'kpi-good':''}">${c.value}</div>
        <div class="kpi-label">${c.label}</div>
        <div class="kpi-sub">${c.sub}</div>
      </div>`).join('');
  }

  /* ── Revenue impact chart ───────────────────────────────── */
  function renderRevenueChart(revBase, revShocked, revRecovered) {
    const taxes = ['CIT', 'PIT', 'GST'];
    const keys  = ['cit', 'pit', 'gst'];
    const impact    = keys.map(k => parseFloat(((revShocked[k]   - revBase[k])/1000).toFixed(2)));
    const recovered = keys.map(k => parseFloat(((revRecovered[k] - revShocked[k])/1000).toFixed(2)));

    mkChart('chart-fiscal', {
      type: 'bar',
      data: {
        labels: taxes,
        datasets: [
          {
            label: 'Revenue Impact (shock)',
            data: impact,
            backgroundColor: 'rgba(200,57,43,0.8)',
          },
          {
            label: 'Revenue Recovered (stimulus)',
            data: recovered,
            backgroundColor: 'rgba(26,82,118,0.8)',
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: SGD ${c.raw.toFixed(2)}bn` } },
        },
        scales: {
          x: { grid: { display: false } },
          y: {
            title: { display: true, text: 'SGD billion' },
            grid: { color: 'rgba(0,0,0,0.06)' },
          },
        },
      },
    });
  }

  /* ── Buoyancy curves chart ──────────────────────────────── */
  function renderBuoyancyChart(buoyancies, currentShock) {
    const scens = [-15,-12,-9,-6,-3,0,3,6,9,12,15];
    mkChart('chart-fiscal-buoy', {
      type: 'line',
      data: {
        labels: scens.map(s => `${s>0?'+':''}${s}%`),
        datasets: [
          { label:`CIT (β=${buoyancies.cit})`, data:scens.map(s=>s*buoyancies.cit), borderColor:'rgba(200,57,43,0.9)', fill:false, tension:0.3, pointRadius:3 },
          { label:`PIT (β=${buoyancies.pit})`, data:scens.map(s=>s*buoyancies.pit), borderColor:'rgba(26,82,118,0.9)', fill:false, tension:0.3, pointRadius:3 },
          { label:`GST (β=${buoyancies.gst})`, data:scens.map(s=>s*buoyancies.gst), borderColor:'rgba(46,139,87,0.9)',  fill:false, tension:0.3, pointRadius:3 },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'bottom' },
          tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw.toFixed(1)}% revenue change` } },
          annotation: {
            annotations: {
              shockLine: {
                type: 'line',
                xMin: currentShock,
                xMax: currentShock,
                borderColor: 'rgba(0,0,0,0.3)',
                borderWidth: 1,
                borderDash: [4,4],
              }
            }
          }
        },
        scales: {
          x: { title: { display: true, text: 'GDP Shock Scenario' } },
          y: { title: { display: true, text: '% Change in Tax Revenue' }, grid: { color: 'rgba(0,0,0,0.06)' } },
        },
      },
    });
  }

  /* ── Main render ────────────────────────────────────────── */
  function render(bundle) {
    const shock = parseFloat(document.getElementById('gdp-shock')?.value ?? '-5');
    const mult  = parseFloat(document.getElementById('mult')?.value ?? '0.7');
    const stim  = parseFloat(document.getElementById('stim')?.value ?? '20');

    // Update labels
    const sv = document.getElementById('gdp-shock-val'); if(sv) sv.textContent = (shock>0?'+':'')+shock.toFixed(1);
    const mv = document.getElementById('mult-val');      if(mv) mv.textContent = mult.toFixed(1);
    const tv = document.getElementById('stim-val');      if(tv) tv.textContent = stim;

    const { value: gdpBase } = getLatestGDP(bundle);           // SGD mn
    const { year: revYear, cit: citBase, pit: pitBase, gst: gstBase, total_or: orBase } = getLatestRevenue(bundle);
    const { cit: bCIT, pit: bPIT, gst: bGST } = bundle.buoyancies;

    // GDP model
    const gdpShocked    = gdpBase * (1 + shock/100);
    const stimMn        = stim * 1000;                          // SGD mn
    const stimEffect    = stimMn * mult;
    const gdpRecovered  = gdpShocked + stimEffect;
    const savedPP       = stimEffect / gdpBase * 100;           // pp of GDP saved

    // Revenue model
    const revBase      = { cit: citBase, pit: pitBase, gst: gstBase };
    const revShocked   = {
      cit: citBase * (1 + shock/100 * bCIT),
      pit: pitBase * (1 + shock/100 * bPIT),
      gst: gstBase * (1 + shock/100 * bGST),
    };
    const effectiveShock = shock + savedPP;
    const revRecovered = {
      cit: citBase * (1 + effectiveShock/100 * bCIT),
      pit: pitBase * (1 + effectiveShock/100 * bPIT),
      gst: gstBase * (1 + effectiveShock/100 * bGST),
    };

    const totalRevImpact    = Object.values(revShocked).reduce((s,v)=>s+v,0)   - (citBase+pitBase+gstBase);
    const totalRevRecovered = Object.values(revRecovered).reduce((s,v)=>s+v,0) - Object.values(revShocked).reduce((s,v)=>s+v,0);
    const netFiscalCost     = stimMn + totalRevImpact - totalRevRecovered;      // net cost to govt

    // Result text
    const rEl = document.getElementById('fiscal-result');
    if (rEl) rEl.innerHTML =
      `<strong>GDP Impact</strong><br>` +
      `Baseline: <span class="result-highlight">SGD ${(gdpBase/1000).toFixed(0)}bn</span> → ` +
      `Shocked: SGD ${(gdpShocked/1000).toFixed(0)}bn → ` +
      `Recovered: <span class="result-highlight">SGD ${(gdpRecovered/1000).toFixed(0)}bn</span> ` +
      `(stimulus saves ${savedPP.toFixed(1)}pp)<br><br>` +
      `<strong>Revenue Impact</strong> <span style="font-size:.72rem;opacity:.5;">(FY${revYear} baseline, empirical buoyancies)</span><br>` +
      `CIT: base ${fmt(citBase)} → shock ${fmtDelta(revShocked.cit-citBase)} → stim recovers ${fmtDelta(revRecovered.cit-revShocked.cit)}<br>` +
      `PIT: base ${fmt(pitBase)} → shock ${fmtDelta(revShocked.pit-pitBase)} → stim recovers ${fmtDelta(revRecovered.pit-revShocked.pit)}<br>` +
      `GST: base ${fmt(gstBase)} → shock ${fmtDelta(revShocked.gst-gstBase)} → stim recovers ${fmtDelta(revRecovered.gst-revShocked.gst)}<br><br>` +
      `<strong>Net fiscal cost: ${fmt(netFiscalCost)}</strong> ` +
      `<span style="font-size:.72rem;opacity:.5;">(stimulus spend − revenue recovered from GDP boost)</span>`;

    renderKPIs(gdpBase, gdpShocked, gdpRecovered, stimMn, netFiscalCost);
    renderRevenueChart(revBase, revShocked, revRecovered);
    renderBuoyancyChart(bundle.buoyancies, shock);
  }

  /* ── State & listeners ──────────────────────────────────── */
  let _bundle = null, _listenersAdded = false, _initStarted = false;

  function recompute() {
    if (_bundle) render(_bundle);
  }

  function attachListeners() {
    if (_listenersAdded) return;
    _listenersAdded = true;
    ['gdp-shock','mult','stim'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', recompute);
    });
  }

  /* ── Public init ────────────────────────────────────────── */
  window.initFiscal = async function () {
    attachListeners();
    if (_initStarted) { if (_bundle) render(_bundle); return; }
    _initStarted = true;

    try {
      _bundle = await loadData();
      render(_bundle);
    } catch (err) {
      console.warn('[gdp-fiscal] load error:', err.message);
      // Fall back to static render with hardcoded values
      _bundle = {
        gdp: { '2024': 765498 },
        revenue: { '2024': { cit:26800, pit:18100, gst:19500, total_or:110000 } },
        buoyancies: { cit:0.66, pit:0.78, gst:0.56 }
      };
      render(_bundle);
    }
  };

  window.updateFiscal = function () { recompute(); };

})();
