/**
 * js/modules/gdp-growth-acct.js
 * Growth Accounting tab — live SingStat data with Perpetual Inventory Method.
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
    const y0     = years[0];
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

    const defs = [
      { key: '6580', name: '1965\u20131980', t0: 1966, t1: 1980 },
      { key: '8097', name: '1980\u20131997', t0: 1981, t1: 1997 },
      { key: '9710', name: '1997\u20132010', t0: 1998, t1: 2010 },
      { key: '1025', name: '2010\u20132025', t0: 2011, t1: 2025 },
    ];

    const result = {};
    defs.forEach(({ key, name, t0, t1 }) => {
      const obs = Object.entries(annual)
        .filter(([t]) => +t >= t0 && +t <= t1)
        .map(([, v]) => v);
      if (!obs.length) return;
      const n   = obs.length;
      const avg = arr => arr.reduce((s, x) => s + x, 0) / n * 100;
      result[key] = {
        name,
        gdp:     parseFloat(avg(obs.map(v => v.gy)).toFixed(3)),
        capital: parseFloat(avg(obs.map(v => v.gk)).toFixed(3)),
        labour:  parseFloat(avg(obs.map(v => v.gl)).toFixed(3)),
        tfp:     parseFloat(avg(obs.map(v => v.tfp)).toFixed(3)),
        n, live: true,
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

  /* ── Inject delta slider if missing ────────────────────── */
  function ensureDeltaSlider() {
    if (document.getElementById('delta-pim')) return;
    const alphaGroup = document.getElementById('alpha')?.closest('.ctrl-group');
    if (!alphaGroup) return;
    const div = document.createElement('div');
    div.className = 'ctrl-group';
    div.innerHTML = `
      <label class="ctrl-label">
        Depreciation Rate (\u03b4): <span id="delta-val">6%</span>
        <span style="font-size:.7rem;opacity:.5;margin-left:.3rem;">PIM capital stock</span>
      </label>
      <input type="range" class="ctrl-input" id="delta-pim"
             min="3" max="10" step="0.5" value="6"
             oninput="if(window.recomputeGrowthAcct) recomputeGrowthAcct(); else updateGrowthAcct();">`;
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

    const alphaValEl = document.getElementById('alpha-val');
    if (alphaValEl) alphaValEl.textContent = alpha.toFixed(2);
    const deltaValEl = document.getElementById('delta-val');
    if (deltaValEl) deltaValEl.textContent = (delta * 100).toFixed(1) + '%';

    const per = document.getElementById('growth-period')?.value;
    const d   = periods?.[per] ?? window.growthData?.[per];
    if (!d) return;

    const cap = alpha * d.capital;
    const lab = (1 - alpha) * d.labour;
    const tfp = d.gdp - cap - lab;

    const methodNote = d.live
      ? `<span style="font-size:.73rem;opacity:.55;margin-left:.4rem;">
           \u2713 SingStat \u00b7 PIM (\u03b4=${(delta*100).toFixed(1)}%) \u00b7 \u0394ln method \u00b7 ${d.n} obs
         </span>`
      : `<span style="font-size:.73rem;opacity:.4;margin-left:.4rem;">(static fallback)</span>`;

    const resultEl = document.getElementById('growth-result');
    if (resultEl) resultEl.innerHTML =
      `<strong>${d.name}</strong>${methodNote}<br>` +
      `g_Y: <span class="result-highlight">${d.gdp.toFixed(2)}%</span> &nbsp;|&nbsp; ` +
      `g_K <small>(PIM)</small>: ${d.capital.toFixed(2)}% &nbsp;|&nbsp; ` +
      `g_L: ${d.labour.toFixed(2)}%<br>` +
      `Capital (\u03b1\u00b7g_K): ${cap.toFixed(2)}pp &nbsp;|&nbsp; ` +
      `Labour ((1\u2212\u03b1)\u00b7g_L): ${lab.toFixed(2)}pp &nbsp;|&nbsp; ` +
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
          x: { title: { display: true, text: 'Percentage Points (pp)' }, grid: { color: 'rgba(0,0,0,0.06)' } },
          y: { grid: { display: false } },
        },
      },
    });
  }

  /* ── State ──────────────────────────────────────────────── */
  let _livePeriods      = null;
  let _rawCache         = null;
  let _listenersAdded   = false;
  let _initStarted      = false;

  /* ── Recompute: always renders, falls back to static if no live data ── */
  function recompute() {
    if (!_rawCache) {
      render(window.growthData);  // static fallback — sliders still update labels + chart
      return;
    }
    _livePeriods = buildPeriods(_rawCache, getAlpha(), getDelta());
    if (window.growthData) Object.assign(window.growthData, _livePeriods);
    render(_livePeriods);
  }

  /* ── Attach listeners once only ────────────────────────── */
  function attachListeners() {
    if (_listenersAdded) return;
    _listenersAdded = true;
    const alphaEl  = document.getElementById('alpha');
    const periodEl = document.getElementById('growth-period');
    const deltaEl  = document.getElementById('delta-pim');
    if (alphaEl)  alphaEl.addEventListener('input',  recompute);
    if (periodEl) periodEl.addEventListener('change', recompute);
    if (deltaEl)  deltaEl.addEventListener('input',  recompute);
  }

  /* ── Public init (idempotent) ───────────────────────────── */
  window.initGDPGrowthAcct = async function () {
    ensureDeltaSlider();
    attachListeners();

    // On re-visits just re-render with existing data
    if (_initStarted) {
      render(_livePeriods ?? window.growthData);
      return;
    }
    _initStarted = true;

    render(window.growthData); // show static immediately

    try {
      _rawCache    = await loadSeries();
      _livePeriods = buildPeriods(_rawCache, getAlpha(), getDelta());
      if (window.growthData) Object.assign(window.growthData, _livePeriods);
      render(_livePeriods);
      setStatus(
        '\u2713 SingStat \u00b7 PIM capital stock \u00b7 \u0394ln Solow residual \u00b7 M015721 \u00b7 M016161 \u00b7 M015761 \u00b7 DOS 10/02/2026'
      );
    } catch (err) {
      console.warn('[gdp-growth-acct] API error, falling back to static:', err.message);
      setStatus('\u26a0 Using static data \u2014 ' + err.message, true);
      if (_staticFallback) _staticFallback();
    }
  };

  /* ── Global exports ─────────────────────────────────────── */
  window.updateGrowthAcct    = function () { render(_livePeriods ?? window.growthData); };
  window.recomputeGrowthAcct = recompute;

})();
