/**
 * js/modules/gdp-growth-acct.js
 * Growth Accounting tab — live SingStat data with Perpetual Inventory Method.
 *
 * METHODOLOGY
 * ───────────
 * Production function:  Y = A · K^α · L^(1-α)
 * Log-linearise:        ln Y = ln A + α·ln K + (1-α)·ln L
 * Differentiate:        g_Y(t) = g_A(t) + α·g_K(t) + (1-α)·g_L(t)
 * Solow residual:       TFP(t) = Δln Y(t) − α·Δln K(t) − (1-α)·Δln L(t)
 * Period average:       (1/n) · Σ TFP(t)  over all annual obs in period
 *
 * CAPITAL STOCK (Perpetual Inventory Method)
 * ──────────────────────────────────────────
 * K(t) = (1 − δ) · K(t−1) + I(t)       where I = GFCF (chained 2015$)
 * Seed: K(1960) = I(1960) / (g_I_init + δ)
 *       g_I_init = CAGR of GFCF 1960–1970
 * User controls δ via slider (3–10%), default 6%
 *
 * DATA SOURCES (SingStat, DOS updated 10/02/2026)
 * ─────────────────────────────────────────────────
 * M015721 s1   — Real GDP, Chained 2015$, Annual (1960–2025)
 * M016161 s1.1 — GFCF, Chained 2015$, Annual (1960–2025)
 * M015761 s1   — VA per Worker, Chained 2015$ (1983–2025)
 * Employment   — GDP / VA_per_worker (1983–2025)
 *                MOM historical benchmarks (1965–1982)
 *
 * INDEX.HTML CHANGES
 * ──────────────────
 * 1. Script tag (after gdp-annual.js):
 *      <script src="js/modules/gdp-growth-acct.js"></script>
 *
 * 2. initTab (~line 1961):
 *      'ch2-growth': function() { if(window.initGDPGrowthAcct) window.initGDPGrowthAcct(); },
 *
 * 3. initModule ch2 (~line 1920):
 *      ch2: () => {
 *        window.initGDPAnnual     ? window.initGDPAnnual()     : updateGDPChart();
 *        window.initGDPGrowthAcct ? window.initGDPGrowthAcct() : updateGrowthAcct();
 *        updateFiscal();
 *      },
 *
 * 4. Dropdown option (~line 734):
 *      <option value="1025">2010–2025 (Mature)</option>
 *
 * 5. Add δ slider after the α slider in ch2-growth tab HTML:
 *      <div class="ctrl-group">
 *        <label class="ctrl-label">Depreciation Rate (δ): <span id="delta-val">6%</span></label>
 *        <input type="range" class="ctrl-input" id="delta-pim"
 *               min="3" max="10" step="0.5" value="6">
 *      </div>
 */

(function () {
  'use strict';

  const _staticFallback = window.updateGrowthAcct;

  /* ── MOM employment benchmarks 1965–1982 ────────────────── */
  const EMP_BENCH = {
    1965:850e3, 1966:878e3, 1967:908e3, 1968:943e3, 1969:976e3,
    1970:930e3, 1971:958e3, 1972:1007e3,1973:1055e3,1974:1087e3,
    1975:1055e3,1976:1079e3,1977:1108e3,1978:1148e3,1979:1168e3,
    1980:1159e3,1981:1198e3,1982:1229e3,
  };

  /* ── Fetch SingStat row-based table ─────────────────────── */
  async function fetchRowBased(resourceId, seriesNo) {
    const cacheKey = `singstat_row_${resourceId}_${seriesNo}`;
    const cached = SGEcoCache.get(cacheKey);
    if (cached) return cached;

    const res  = await fetch(
      `https://tablebuilder.singstat.gov.sg/api/table/tabledata/${resourceId}`,
      { headers: { 'Content-Type': 'application/json' } }
    );
    const data = (await res.json())?.Data ?? {};
    const row  = (data.row ?? []).find(r => r.seriesNo === seriesNo);
    if (!row) throw new Error(`Series ${seriesNo} not found in ${resourceId}`);

    const map = {};
    (row.columns ?? []).forEach(c => {
      const y = parseInt(c.key, 10);
      const v = parseFloat(c.value);
      if (!isNaN(y) && !isNaN(v)) map[y] = v;
    });
    SGEcoCache.set(cacheKey, map);
    return map;
  }

  /* ── Load raw series (cached after first call) ──────────── */
  let _rawSeries = null;

  async function loadSeries() {
    if (_rawSeries) return _rawSeries;

    const [gdpMap, gfcfMap, vapwMap] = await Promise.all([
      fetchRowBased('M015721', '1'),
      fetchRowBased('M016161', '1.1'),
      fetchRowBased('M015761', '1'),
    ]);

    /* Employment: derived or benchmarked */
    const empMap = { ...EMP_BENCH };
    Object.keys(vapwMap).forEach(y => {
      const yr = +y;
      if (gdpMap[yr] && vapwMap[yr]) empMap[yr] = (gdpMap[yr] * 1e6) / vapwMap[yr];
    });

    _rawSeries = { gdpMap, gfcfMap, empMap };
    return _rawSeries;
  }

  /* ── Perpetual Inventory Method ─────────────────────────── */
  function buildCapitalStock(gfcfMap, delta) {
    const years  = Object.keys(gfcfMap).map(Number).sort((a, b) => a - b);
    const y0     = years[0]; // 1960

    /* Seed: K_0 = I_0 / (g_I_init + δ)
       g_I_init = CAGR of GFCF over first 10 years                     */
    const y10    = y0 + 10;
    const gIinit = (gfcfMap[y10] / gfcfMap[y0]) ** (1 / 10) - 1;
    const K      = { [y0]: gfcfMap[y0] / (gIinit + delta) };

    years.slice(1).forEach(t => {
      K[t] = (1 - delta) * K[t - 1] + gfcfMap[t];
    });
    return K;
  }

  /* ── Build period averages via log-differences ──────────── */
  function buildPeriods({ gdpMap, gfcfMap, empMap }, alpha, delta) {
    const K = buildCapitalStock(gfcfMap, delta);

    /* Year-by-year Solow residuals */
    const annual = {};
    Object.keys(gdpMap).map(Number).sort((a, b) => a - b).forEach(t => {
      const p = t - 1;
      if (!(p in gdpMap) || !(p in K) || !(p in empMap)) return;
      if (!(t in K)      || !(t in empMap))               return;
      const gy  = Math.log(gdpMap[t] / gdpMap[p]);
      const gk  = Math.log(K[t]      / K[p]);
      const gl  = Math.log(empMap[t] / empMap[p]);
      annual[t] = { gy, gk, gl, tfp: gy - alpha * gk - (1 - alpha) * gl };
    });

    /* Period definitions */
    const defs = [
      { key: '6580', name: '1965–1980', t0: 1966, t1: 1980 },
      { key: '8097', name: '1980–1997', t0: 1981, t1: 1997 },
      { key: '9710', name: '1997–2010', t0: 1998, t1: 2010 },
      { key: '1025', name: '2010–2025', t0: 2011, t1: 2025 },
    ];

    const result = {};
    defs.forEach(({ key, name, t0, t1 }) => {
      const obs = Object.entries(annual)
        .filter(([t]) => +t >= t0 && +t <= t1)
        .map(([, v]) => v);
      if (!obs.length) return;

      const n    = obs.length;
      const avg  = arr => arr.reduce((s, x) => s + x, 0) / n * 100;

      result[key] = {
        name,
        gdp:     parseFloat(avg(obs.map(v => v.gy)).toFixed(3)),
        capital: parseFloat(avg(obs.map(v => v.gk)).toFixed(3)),
        labour:  parseFloat(avg(obs.map(v => v.gl)).toFixed(3)),
        tfp:     parseFloat(avg(obs.map(v => v.tfp)).toFixed(3)),
        n,
        live: true,
      };
    });
    return result;
  }

  /* ── Read slider values ─────────────────────────────────── */
  function getAlpha() {
    return parseFloat(document.getElementById('alpha')?.value ?? '0.4');
  }
  function getDelta() {
    return parseFloat(document.getElementById('delta-pim')?.value ?? '6') / 100;
  }

  /* ── Inject δ slider if not already in DOM ──────────────── */
  function ensureDeltaSlider() {
    if (document.getElementById('delta-pim')) return;

    const alphaGroup = document.getElementById('alpha')?.closest('.ctrl-group');
    if (!alphaGroup) return;

    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <label class="ctrl-label">
        Depreciation Rate (δ): <span id="delta-val">6%</span>
        <span style="font-size:.7rem;opacity:.5;margin-left:.3rem;">PIM capital stock</span>
      </label>
      <input type="range" class="ctrl-input" id="delta-pim"
             min="3" max="10" step="0.5" value="6">`;
    alphaGroup.insertAdjacentElement('afterend', div);
  }

  /* ── Status badge ────────────────────────────────────────── */
  function setStatus(msg, isError) {
    let el = document.getElementById('growth-acct-status');
    if (!el) {
      el = document.createElement('div');
      el.id = 'growth-acct-status';
      el.style.cssText = 'font-size:.72rem;padding:.25rem .6rem;border-radius:5px;'
        + 'display:inline-block;margin-bottom:.5rem;transition:opacity .5s;';
      const box = document.getElementById('growth-result');
      if (box?.parentNode) box.parentNode.insertBefore(el, box);
    }
    el.textContent = msg;
    el.style.background = isError ? 'rgba(239,68,68,.12)'          : 'rgba(59,130,246,.1)';
    el.style.color       = isError ? '#fca5a5'                      : '#93c5fd';
    el.style.border      = isError ? '1px solid rgba(239,68,68,.3)' : '1px solid rgba(59,130,246,.25)';
    el.style.opacity     = '1';
    if (!isError) setTimeout(() => { el.style.opacity = '0'; }, 6000);
  }

  /* ── Render chart + result box ──────────────────────────── */
  function render(periods) {
    const alpha = getAlpha();
    const delta = getDelta();

    document.getElementById('alpha-val').textContent = alpha.toFixed(2);
    const deltaEl = document.getElementById('delta-val');
    if (deltaEl) deltaEl.textContent = (delta * 100).toFixed(1) + '%';

    const per = document.getElementById('growth-period').value;
    const d   = periods?.[per] ?? window.growthData?.[per];
    if (!d) return;

    /* Re-derive contributions at current α (TFP is pre-computed at same α,
       but cap/lab split changes with slider so recompute all three)        */
    const cap = alpha * d.capital;
    const lab = (1 - alpha) * d.labour;
    const tfp = d.gdp - cap - lab;

    const methodNote = d.live
      ? `<span style="font-size:.73rem;opacity:.55;margin-left:.4rem;">
           ✓ SingStat · PIM (δ=${(delta*100).toFixed(1)}%) · Δln method · ${d.n} obs
         </span>`
      : `<span style="font-size:.73rem;opacity:.4;margin-left:.4rem;">(static fallback)</span>`;

    document.getElementById('growth-result').innerHTML =
      `<strong>${d.name}</strong>${methodNote}<br>` +
      `g_Y: <span class="result-highlight">${d.gdp.toFixed(2)}%</span> &nbsp;|&nbsp; ` +
      `g_K <small>(PIM)</small>: ${d.capital.toFixed(2)}% &nbsp;|&nbsp; ` +
      `g_L: ${d.labour.toFixed(2)}%<br>` +
      `Capital (α·g_K): ${cap.toFixed(2)}pp &nbsp;|&nbsp; ` +
      `Labour ((1−α)·g_L): ${lab.toFixed(2)}pp &nbsp;|&nbsp; ` +
      `<strong>TFP: ${tfp.toFixed(2)}pp (${(tfp / d.gdp * 100).toFixed(0)}% of growth)</strong>`;

    mkChart('chart-growth-acct', {
      type: 'bar',
      data: {
        labels: ['TFP', 'Capital', 'Labour'],
        datasets: [{
          label: 'Contribution (pp)',
          data:  [tfp.toFixed(3), cap.toFixed(3), lab.toFixed(3)],
          backgroundColor: [
            'rgba(200,57,43,0.85)',
            'rgba(26,82,118,0.85)',
            'rgba(212,160,23,0.85)',
          ],
          borderWidth: 0,
        }],
      },
      options: {
        responsive: true,
        indexAxis: 'y',
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: c => `${parseFloat(c.raw).toFixed(2)}pp` } },
        },
        scales: {
          x: {
            title: { display: true, text: 'Percentage Points (pp)' },
            grid:  { color: 'rgba(0,0,0,0.06)' },
          },
          y: { grid: { display: false } },
        },
      },
    });
  }

  /* ── State ──────────────────────────────────────────────── */
  let _livePeriods = null;
  let _rawCache    = null;

  /* ── Recompute periods at current α and δ ───────────────── */
  function recompute() {
    if (!_rawCache) return;
    _livePeriods = buildPeriods(_rawCache, getAlpha(), getDelta());
    if (window.growthData) Object.assign(window.growthData, _livePeriods);
    render(_livePeriods);
  }

  /* ── Attach all listeners ───────────────────────────────── */
  function attachListeners() {
    const alphaEl  = document.getElementById('alpha');
    const periodEl = document.getElementById('growth-period');
    const deltaEl  = document.getElementById('delta-pim');

    if (alphaEl)  { alphaEl.removeAttribute('oninput');   alphaEl.addEventListener('input',  recompute); }
    if (periodEl) { periodEl.removeAttribute('onchange'); periodEl.addEventListener('change', recompute); }
    if (deltaEl)  { deltaEl.addEventListener('input', recompute); }
  }

  /* ── Public init ────────────────────────────────────────── */
  window.initGDPGrowthAcct = async function () {
    ensureDeltaSlider();
    attachListeners();
    render(null); // immediate static render while fetch runs

    try {
      _rawCache    = await loadSeries();
      _livePeriods = buildPeriods(_rawCache, getAlpha(), getDelta());

      if (window.growthData) Object.assign(window.growthData, _livePeriods);

      /* Update dropdown */
      const sel = document.getElementById('growth-period');
      if (sel) {
        Array.from(sel.options).forEach(opt => {
          if (opt.value === '1023') { opt.value = '1025'; opt.text = '2010–2025 (Mature)'; }
        });
        if (sel.value === '1023') sel.value = '1025';
      }

      render(_livePeriods);
      setStatus(
        '✓ SingStat · PIM capital stock · Δln Solow residual · M015721 · M016161 · M015761 · DOS 10/02/2026'
      );

    } catch (err) {
      console.warn('[gdp-growth-acct] API error, falling back to static:', err.message);
      setStatus('⚠ Using static data — ' + err.message, true);
      if (_staticFallback) _staticFallback();
    }
  };

  /* ── Global overwrite ───────────────────────────────────── */
  window.updateGrowthAcct = function () { render(_livePeriods); };

})();
