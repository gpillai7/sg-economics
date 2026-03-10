/* =========================================================
   trade.js  — Ch3: Trade & Investment
   Tabs: Trade Openness | Trading Partners | FDI Flows & Stock
   Data: oecd-tiva.json (static pre-fetch)
   Live: World Bank API called for trade openness peer comparison
   ========================================================= */
(function() {
  'use strict';

  let _initStarted = false;
  let _listenersAdded = false;
  let _tivaData = null;

  /* ---------- helpers ---------- */
  const $ = id => document.getElementById(id);
  const fmt1 = v => (v == null ? '—' : Number(v).toFixed(1));
  const fmtBn = v => (v == null ? '—' : (v >= 1000 ? (v/1000).toFixed(1)+'T' : v.toFixed(0)+'B'));

  function destroyChart(id) {
    const existing = Chart.getChart(id);
    if (existing) existing.destroy();
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
      y: { grid: { color: GRID }, ticks: { color: TEXT, font: { size: 10 } } }
    }
  };

  function baseOptions(extra) {
    return Object.assign({}, CHART_DEFAULTS, extra || {});
  }

  /* ---------- data loading ---------- */
  async function loadTivaData() {
    if (_tivaData) return _tivaData;
    const resp = await fetch('data/oecd-tiva.json');
    _tivaData = await resp.json();
    return _tivaData;
  }

  /* =========================================================
     TAB 1 — Trade Openness & Structure
     ========================================================= */
  async function initTradeOpenness() {
    const panel = $('ch3-trade-openness');
    if (!panel) return;
    if (panel.dataset.built) return;

    const d = await loadTivaData();
    const sgp = d.tradeOpenness.SGP;
    const years = Object.keys(sgp).filter(y => y >= '1980').map(Number).sort((a,b)=>a-b);
    const sgpVals = years.map(y => sgp[String(y)]);

    /* KPI strip */
    const latest = sgp['2024'];
    const exp2024  = d.exportsGDP.SGP['2024'];
    const imp2024  = d.importsGDP.SGP['2024'];
    const nxShare  = (exp2024 - imp2024).toFixed(1);
    const htExport = d.highTechExports.SGP['2024'];

    const kpiMount = $('ch3-openness-kpi');
    if (kpiMount) {
      kpiMount.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:0">
          <div class="kpi-card">
            <div class="kpi-label">Trade Openness (2024)</div>
            <div class="kpi-value" style="color:var(--accent)">${latest}%</div>
            <div class="kpi-sub">Exports + Imports as % GDP</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Exports % GDP (2024)</div>
            <div class="kpi-value">${exp2024}%</div>
            <div class="kpi-sub">Gross, includes re-exports</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Net Exports % GDP</div>
            <div class="kpi-value" style="color:${parseFloat(nxShare)>=0?'var(--accent3)':'var(--accent2)'}">${nxShare > 0 ? '+':''}${nxShare}%</div>
            <div class="kpi-sub">Exports minus Imports</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">High-Tech Exports (2024)</div>
            <div class="kpi-value" style="color:var(--accent4)">${htExport}%</div>
            <div class="kpi-sub">% of manufactured exports</div>
          </div>
        </div>`;
    }

    /* Chart 1 — SGP openness over time */
    destroyChart('ch3-openness-line');
    const ctx1 = $('ch3-openness-line');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'line',
        data: {
          labels: years,
          datasets: [{
            label: 'Singapore', data: sgpVals,
            borderColor: ACCENT, backgroundColor: 'rgba(26,82,118,0.12)',
            borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35
          }]
        },
        options: {
          ...baseOptions(),
          plugins: { ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}% of GDP` } } },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x, ticks: { ...CHART_DEFAULTS.scales.x.ticks,
              callback: (v,i) => years[i] % 10 === 0 ? years[i] : '' } },
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: '% of GDP', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    /* Chart 2 — Peer bar comparison (latest year) */
    const peers = [
      { code:'MYS', label:'Malaysia' },
      { code:'KOR', label:'S. Korea' },
      { code:'DEU', label:'Germany' },
      { code:'JPN', label:'Japan'   },
      { code:'USA', label:'USA'     }
    ];
    const peerColors = [ACCENT4, '#8e44ad', ACCENT3, '#2e86c1', ACCENT2];
    const peerVals = peers.map(p => d.tradeOpenness[p.code]?.['2024'] ?? d.tradeOpenness[p.code]?.['2023'] ?? null);

    destroyChart('ch3-openness-peers');
    const ctx2 = $('ch3-openness-peers');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: ['Singapore', ...peers.map(p => p.label)],
          datasets: [{
            label: '2024 Trade Openness (% GDP)',
            data: [latest, ...peerVals],
            backgroundColor: [ACCENT, ...peerColors],
            borderRadius: 3
          }]
        },
        options: {
          ...baseOptions({ indexAxis: 'y' }),
          plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x,
              title: { display: true, text: '% of GDP', color: TEXT, font: { size: 10 } } },
            y: { ...CHART_DEFAULTS.scales.y }
          }
        }
      });
    }

    /* Import-adjusted slider logic */
    function updateImportAdj() {
      const grossExp = parseFloat($('ch3-ia-exp')?.value || 700);
      const reexpPct = parseFloat($('ch3-ia-reexp')?.value || 50) / 100;
      const impCont  = parseFloat($('ch3-ia-impcont')?.value || 63) / 100;
      const gdpBn    = parseFloat($('ch3-ia-gdp')?.value || 680);

      if ($('ch3-ia-exp-val'))    $('ch3-ia-exp-val').textContent    = Math.round(grossExp);
      if ($('ch3-ia-reexp-val'))  $('ch3-ia-reexp-val').textContent  = Math.round(reexpPct*100);
      if ($('ch3-ia-impcont-val'))$('ch3-ia-impcont-val').textContent= Math.round(impCont*100);
      if ($('ch3-ia-gdp-val'))    $('ch3-ia-gdp-val').textContent    = Math.round(gdpBn);

      const domExp      = grossExp * (1 - reexpPct);
      const importedOut = domExp * impCont;
      const adjExp      = domExp - importedOut;
      const conventional = ((grossExp / (gdpBn + grossExp * 0.85)) * 100).toFixed(1);
      const importAdj   = ((adjExp / gdpBn) * 100).toFixed(1);

      const resEl = $('ch3-ia-result');
      if (resEl) resEl.innerHTML =
        `<strong>Conventional: ${conventional}%</strong> &nbsp;|&nbsp;
         <span style="color:var(--accent3)">Import-Adjusted: ${importAdj}%</span><br>
         <span style="font-size:0.8em;color:#aaa">
           Domestic exports: SGD ${Math.round(domExp)}B &nbsp;•&nbsp;
           Import content stripped: SGD ${Math.round(importedOut)}B &nbsp;•&nbsp;
           Gap (double-count): ${(conventional - importAdj).toFixed(1)} pp
         </span>`;

      destroyChart('ch3-ia-bar');
      const ctx3 = $('ch3-ia-bar');
      if (ctx3) {
        new Chart(ctx3, {
          type: 'bar',
          data: {
            labels: ['Conventional Method', 'Import-Adjusted'],
            datasets: [{
              data: [parseFloat(conventional), parseFloat(importAdj)],
              backgroundColor: [ACCENT2, ACCENT3],
              borderRadius: 4
            }]
          },
          options: {
            ...baseOptions(),
            plugins: { ...CHART_DEFAULTS.plugins, legend: { display: false } },
            scales: {
              x: CHART_DEFAULTS.scales.x,
              y: { ...CHART_DEFAULTS.scales.y,
                min: 0, max: 100,
                title: { display: true, text: '% of GDP', color: TEXT, font: { size: 10 } } }
            }
          }
        });
      }
    }

    if (!_listenersAdded) {
      ['ch3-ia-exp','ch3-ia-reexp','ch3-ia-impcont','ch3-ia-gdp'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('input', updateImportAdj);
      });
    }
    updateImportAdj();
    panel.dataset.built = '1';
  }

  /* =========================================================
     TAB 2 — Trading Partners & GVC Analysis
     ========================================================= */
  async function initTradingPartners() {
    const panel = $('ch3-partners');
    if (!panel) return;
    if (panel.dataset.built) return;

    const d = await loadTivaData();
    const mp  = d.merchExportsByPartner;
    const tv  = d.tiva;
    const years = ['2010','2012','2014','2016','2018','2020','2022','2024'];

    /* ---- CHART 1: VA components of gross exports 2010 vs 2018 (stacked bar) ---- */
    destroyChart('ch3-gvc-va-components');
    const ctx1 = $('ch3-gvc-va-components');
    if (ctx1) {
      const vc = tv.vaComponents;
      new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: ['2010', '2018'],
          datasets: [
            { label: 'Domestic VA → Consumer', data: vc.domesticVAtoConsumer,
              backgroundColor: '#1a5276cc', borderRadius: 2 },
            { label: 'Domestic VA → GVCs (Fwd)', data: vc.domesticVAtoGVC,
              backgroundColor: '#27ae60cc', borderRadius: 2 },
            { label: 'Dom. VA Re-imported', data: vc.domesticVAReimported,
              backgroundColor: '#d68910cc', borderRadius: 2 },
            { label: 'Foreign VA in Exports (Bwd)', data: vc.foreignVA,
              backgroundColor: '#c0392bcc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          indexAxis: 'y',
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}%` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x, stacked: true,
              title: { display: true, text: '% of total gross exports', color: TEXT, font: { size: 10 } },
              max: 100 },
            y: { ...CHART_DEFAULTS.scales.y, stacked: true }
          }
        }
      });
    }

    /* ---- CHART 2: GVC Participation — SGP vs regional benchmarks ---- */
    destroyChart('ch3-gvc-participation');
    const ctx2 = $('ch3-gvc-participation');
    if (ctx2) {
      const gp = tv.gvcParticipation;
      new Chart(ctx2, {
        type: 'bar',
        data: {
          labels: gp.regions,
          datasets: [
            { label: 'Forward (Dom. VA → 3rd countries)',
              data: gp.forward, backgroundColor: '#27ae60cc', borderRadius: 2 },
            { label: 'Backward (Foreign VA in exports)',
              data: gp.backward, backgroundColor: '#c0392bcc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label}: ${c.raw}%`,
                afterBody: items => {
                  const idx = items[0].dataIndex;
                  return [`Total GVC participation: ${gp.total[idx]}%`];
                }
              }
            }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y, stacked: true,
              title: { display: true, text: '% of total gross exports', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    /* ---- CHART 3: Direct / Indirect / Foreign VA by industry ---- */
    destroyChart('ch3-gvc-dif');
    const ctx3 = $('ch3-gvc-dif');
    if (ctx3) {
      const dif = tv.directIndirectForeignVA;
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: dif.industries,
          datasets: [
            { label: 'Direct Domestic VA',   data: dif.directDomesticVA,
              backgroundColor: '#1a5276cc', borderRadius: 2 },
            { label: 'Indirect Domestic VA', data: dif.indirectDomesticVA,
              backgroundColor: '#2980b9cc', borderRadius: 2 },
            { label: 'Foreign VA',            data: dif.foreignVA,
              backgroundColor: '#c0392bcc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          indexAxis: 'y',
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}%` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x, stacked: true, max: 100,
              title: { display: true, text: '% of industry gross exports', color: TEXT, font: { size: 10 } } },
            y: { ...CHART_DEFAULTS.scales.y, stacked: true }
          }
        }
      });
    }

    /* ---- CHART 4: Services VA in exports — total vs manufactures ---- */
    destroyChart('ch3-gvc-services');
    const ctx4 = $('ch3-gvc-services');
    if (ctx4) {
      const sv = tv.servicesVAInExports;
      new Chart(ctx4, {
        type: 'bar',
        data: {
          labels: ['Total Exports', 'Manufactures Exports'],
          datasets: [
            { label: 'Direct Domestic Services',
              data: [sv.totalExports.directDomesticServices, sv.mfgExports.directDomesticServices],
              backgroundColor: '#1a5276cc', borderRadius: 2 },
            { label: 'Indirect Domestic Services',
              data: [sv.totalExports.indirectDomesticServices, sv.mfgExports.indirectDomesticServices],
              backgroundColor: '#2980b9cc', borderRadius: 2 },
            { label: 'Foreign Services',
              data: [sv.totalExports.foreignServices, sv.mfgExports.foreignServices],
              backgroundColor: '#c0392bcc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw}%` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y, stacked: true,
              title: { display: true, text: '% of gross exports', color: TEXT, font: { size: 10 } },
              max: 80 }
          }
        }
      });
    }

    /* ---- CHART 5: DVA/FVA by export industry (top 3) ---- */
    destroyChart('ch3-gvc-industry-dva');
    const ctx5 = $('ch3-gvc-industry-dva');
    if (ctx5) {
      const ti = tv.topExportIndustries;
      new Chart(ctx5, {
        type: 'bar',
        data: {
          labels: ti.industries,
          datasets: [
            { label: 'Domestic VA',
              data: ti.dvaPctOfIndustry,
              backgroundColor: '#1a5276cc', borderRadius: 2 },
            { label: 'Foreign VA',
              data: ti.fvaPctOfIndustry,
              backgroundColor: '#c0392bcc', borderRadius: 2 },
          ]
        },
        options: {
          ...baseOptions(),
          indexAxis: 'y',
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: {
              callbacks: {
                label: c => `${c.dataset.label}: ${c.raw}%`,
                afterBody: items => {
                  const idx = items[0].dataIndex;
                  return [
                    `Dom. VA share of economy: ${ti.dvaPctOfEconomy[idx]}%`,
                    `For. VA share of economy: ${ti.fvaPctOfEconomy[idx]}%`
                  ];
                }
              }
            }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x, stacked: true, max: 100,
              title: { display: true, text: '% of industry gross exports', color: TEXT, font: { size: 10 } } },
            y: { ...CHART_DEFAULTS.scales.y, stacked: true }
          }
        }
      });
    }

    /* ---- CHART 6: Merchandise exports by region 2010-2024 ---- */
    destroyChart('ch3-gvc-region');
    const ctx6 = $('ch3-gvc-region');
    if (ctx6) {
      const regionKeys   = ['Asia','America','Europe','Oceania','Africa'];
      const regionColors = ['#1a5276','#2980b9','#27ae60','#d35400','#8e44ad'];
      new Chart(ctx6, {
        type: 'bar',
        data: {
          labels: years,
          datasets: regionKeys.map((rk, i) => ({
            label: rk,
            data: years.map(y => mp[rk]?.[y] ?? null),
            backgroundColor: regionColors[i] + 'cc',
            borderColor:     regionColors[i],
            borderWidth: 1,
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: SGD ${c.raw?.toFixed(0)}B` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y, stacked: true,
              title: { display: true, text: 'SGD Billion', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    panel.dataset.built = '1';
  }

/* =========================================================
     TAB 3 — FDI Flows & Stock
     ========================================================= */
  async function initFDI() {
    const panel = $('ch3-fdi-panel');
    if (!panel) return;
    if (panel.dataset.built) return;

    const d = await loadTivaData();
    const inflows = d.fdiInflows;
    const stock   = d.fdiStockSGD;

    /* KPI strip */
    const kpiMount = $('ch3-fdi-kpi');
    const totalStock2024 = stock.total['2024'];
    const inflowsPct2024 = inflows.SGP['2024'];
    const bySource = stock.bySource2024;
    const usaShare = (bySource['United States'] / totalStock2024 * 100).toFixed(1);

    if (kpiMount) {
      kpiMount.innerHTML = `
        <div class="kpi-grid" style="grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:0">
          <div class="kpi-card">
            <div class="kpi-label">Inward FDI Stock (2024)</div>
            <div class="kpi-value" style="color:var(--accent)">SGD ${(totalStock2024/1000).toFixed(1)}T</div>
            <div class="kpi-sub">≈ ${(totalStock2024/680*100).toFixed(0)}% of GDP</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">FDI Inflows (2024)</div>
            <div class="kpi-value">${inflowsPct2024}%</div>
            <div class="kpi-sub">% of GDP</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">USA Dominance</div>
            <div class="kpi-value" style="color:var(--accent2)">${usaShare}%</div>
            <div class="kpi-sub">Share of FDI stock</div>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">High-Tech Exports</div>
            <div class="kpi-value" style="color:var(--accent4)">59.4%</div>
            <div class="kpi-sub">% of manuf. exports (2024)</div>
          </div>
        </div>`;
    }

    /* Chart 1 — FDI Inflows % GDP: SGP vs peers */
    const inflowYears = ['2000','2005','2008','2010','2012','2014','2016','2018','2020','2021','2022','2023','2024'];
    const peers = [
      { code: 'MYS', label: 'Malaysia',  color: ACCENT4 },
      { code: 'DEU', label: 'Germany',   color: ACCENT3 },
      { code: 'USA', label: 'USA',       color: ACCENT2 },
    ];

    destroyChart('ch3-fdi-inflows');
    const ctx1 = $('ch3-fdi-inflows');
    if (ctx1) {
      new Chart(ctx1, {
        type: 'line',
        data: {
          labels: inflowYears,
          datasets: [
            {
              label: 'Singapore',
              data: inflowYears.map(y => inflows.SGP?.[y] ?? null),
              borderColor: ACCENT, backgroundColor: 'rgba(26,82,118,0.1)',
              borderWidth: 2.5, pointRadius: 3, fill: true, tension: 0.3
            },
            ...peers.map(p => ({
              label: p.label,
              data: inflowYears.map(y => inflows[p.code]?.[y] ?? null),
              borderColor: p.color,
              borderWidth: 1.5, pointRadius: 2, fill: false, tension: 0.3, borderDash: [4,3]
            }))
          ]
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
              title: { display: true, text: '% of GDP', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    /* Chart 2 — FDI Stock growth SGD bn */
    const stockYears = Object.keys(stock.total).filter(y => y >= '2000').sort();
    const stockVals  = stockYears.map(y => stock.total[y]);

    destroyChart('ch3-fdi-stock');
    const ctx2 = $('ch3-fdi-stock');
    if (ctx2) {
      new Chart(ctx2, {
        type: 'line',
        data: {
          labels: stockYears,
          datasets: [{
            label: 'FDI Inward Stock (SGD bn)',
            data: stockVals,
            borderColor: ACCENT2, backgroundColor: 'rgba(192,57,43,0.1)',
            borderWidth: 2, pointRadius: 0, fill: true, tension: 0.35
          }]
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `SGD ${c.raw?.toFixed(0)}B` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x,
              ticks: { ...CHART_DEFAULTS.scales.x.ticks,
                callback: (v,i) => stockYears[i] % 5 === 0 ? stockYears[i] : '' } },
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'SGD Billion', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    /* Chart 3 — Top source economies 2024 */
    const sourceEntries = Object.entries(bySource)
      .filter(([k]) => k !== 'Others')
      .sort((a,b) => b[1]-a[1])
      .slice(0, 10);
    const sourceColors = [
      '#2980b9','#d4ac0d','#27ae60','#8e44ad','#e74c3c',
      '#1abc9c','#d35400','#c0392b','#2471a3','#7d3c98'
    ];

    destroyChart('ch3-fdi-sources');
    const ctx3 = $('ch3-fdi-sources');
    if (ctx3) {
      new Chart(ctx3, {
        type: 'bar',
        data: {
          labels: sourceEntries.map(([k]) => k.replace('United States','USA').replace('United Kingdom','UK').replace('Republic Of Korea','S.Korea').replace('Mainland China','China')),
          datasets: [{
            label: 'FDI Inward Stock (SGD bn, 2024)',
            data: sourceEntries.map(([,v]) => v),
            backgroundColor: sourceColors,
            borderRadius: 3
          }]
        },
        options: {
          ...baseOptions({ indexAxis: 'y' }),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            legend: { display: false },
            tooltip: { callbacks: { label: c => `SGD ${c.raw?.toFixed(0)}B` } }
          },
          scales: {
            x: { ...CHART_DEFAULTS.scales.x,
              title: { display: true, text: 'SGD Billion', color: TEXT, font: { size: 10 } } },
            y: CHART_DEFAULTS.scales.y
          }
        }
      });
    }

    /* Chart 4 — Top source trends 2015–2024 */
    const trendSources = ['United States','Japan','United Kingdom','Netherlands','Mainland China'];
    const trendColors  = ['#2980b9','#d4ac0d','#27ae60','#1abc9c','#e74c3c'];
    const trendYears   = ['2015','2016','2017','2018','2019','2020','2021','2022','2023','2024'];

    destroyChart('ch3-fdi-trend');
    const ctx4 = $('ch3-fdi-trend');
    if (ctx4) {
      new Chart(ctx4, {
        type: 'line',
        data: {
          labels: trendYears,
          datasets: trendSources.map((s, i) => ({
            label: s.replace('United States','USA').replace('United Kingdom','UK').replace('Mainland China','China'),
            data: trendYears.map(y => stock.topSources[s]?.[y] ?? null),
            borderColor: trendColors[i],
            borderWidth: 2, pointRadius: 2, fill: false, tension: 0.3
          }))
        },
        options: {
          ...baseOptions(),
          plugins: {
            ...CHART_DEFAULTS.plugins,
            tooltip: { callbacks: { label: c => `${c.dataset.label}: SGD ${c.raw?.toFixed(0)}B` } }
          },
          scales: {
            x: CHART_DEFAULTS.scales.x,
            y: { ...CHART_DEFAULTS.scales.y,
              title: { display: true, text: 'SGD Billion', color: TEXT, font: { size: 10 } } }
          }
        }
      });
    }

    panel.dataset.built = '1';
  }

  /* =========================================================
     Public entry point — called by initTab lookup
     ========================================================= */
  window.initTradeOpenness   = initTradeOpenness;
  window.initTradingPartners = initTradingPartners;
  window.initFDI_ch3         = initFDI;

  window.initTrade = function() {
    if (_initStarted) return;
    _initStarted = true;
    initTradeOpenness().catch(console.error);
  };

})();
