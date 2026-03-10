/* =========================================================
   industrial.js  —  Ch5: Industrial Development
   Tabs: Cluster Composition | Productivity & Intensity | Structural Transformation

   Data (CORS-blocked, pre-fetched as static JSON):
     data/singstat-industrial.json
       M355171  EDB – Mfg Output by Cluster, SGD mn (2000–2025)
       M355181  EDB – Mfg Value Added by Cluster, SGD mn (2000–2025)
       M355151  EDB – Mfg Employment by Cluster, persons (2000–2025)
       M355201  EDB – Mfg VA per Worker by Cluster, SGD '000 (2000–2025)
       M355401  EDB – IIP by Cluster, index 2025=100 (1983–2025)
       M354851  SingStat – Mfg Output by SSIC Industry, SGD mn (1980–2024)
       M354871  SingStat – Workers by SSIC Industry, persons (1980–2024)
       M355341  EDB – Medium/High-Tech share of Mfg VA, % (2005–2022)
       M015951  SingStat – Real GDP by sector, chained 2015$, SGD mn (1960–2025)
   ========================================================= */
(function () {
  'use strict';

  let _initStarted    = false;
  let _data           = null;

  const $   = id => document.getElementById(id);
  function destroyChart(id) { const c = Chart.getChart(id); if (c) c.destroy(); }

  const COLORS = {
    'Electronics':                    '#2980b9',
    'Chemicals':                      '#27ae60',
    'Biomedical Manufacturing':       '#8e44ad',
    'Precision Engineering':          '#d68910',
    'Transport Engineering':          '#1abc9c',
    'General Manufacturing Industries': '#7f8c8d',
    'Total Manufacturing':            '#c0392b',
  };
  const GRID = 'rgba(255,255,255,0.07)', TEXT = '#ccc';
  const CD = {
    color: TEXT,
    plugins: { legend: { labels: { color: TEXT, boxWidth: 12, font: { size: 11 } } } },
    scales: {
      x: { grid: { color: GRID }, ticks: { color: TEXT, font: { size: 10 } } },
      y: { grid: { color: GRID }, ticks: { color: TEXT, font: { size: 10 } } },
    },
  };
  const MAIN_CLUSTERS = ['Electronics','Chemicals','Biomedical Manufacturing','Precision Engineering','Transport Engineering','General Manufacturing Industries'];

  async function loadData() {
    if (_data) return _data;
    const key = 'singstat_industrial';
    const cached = SGEcoCache?.get?.(key);
    if (cached) { _data = cached; return _data; }
    const r = await fetch('data/singstat-industrial.json');
    _data = await r.json();
    SGEcoCache?.set?.(key, _data);
    return _data;
  }

  async function initIndustrial() {
    if (_initStarted) return;
    _initStarted = true;
    try { const data = await loadData(); renderCluster(data); }
    catch (e) { console.error('industrial.js:', e); }
  }

  /* ---- TAB 1: Cluster Composition ---- */
  async function renderCluster(data) {
    const panel = $('ch5-cluster');
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = '1';
    if (!data) data = await loadData();
    const yrs = data.clusterOutput.years;

    const kpi = $('ch5-cluster-kpi');
    if (kpi) {
      const totOut = data.clusterOutput.data['Total Manufacturing'];
      const totVA  = data.clusterVA.data['Total Manufacturing'];
      const totEmp = data.clusterEmp.data['Total Manufacturing'];
      const n = totOut.length - 1, yr = yrs[n];
      const chgO = ((totOut[n]-totOut[n-1])/totOut[n-1]*100).toFixed(1);
      const chgV = ((totVA[n]-totVA[n-1])/totVA[n-1]*100).toFixed(1);
      const vaInt = (totVA[n]/totOut[n]*100).toFixed(1);
      kpi.innerHTML = `<div class="kpi-strip">
        <div class="kpi-item"><div class="kpi-value">$${(totOut[n]/1000).toFixed(0)}B</div>
          <div class="kpi-label">Total Output ${yr} <span class="kpi-delta ${chgO>=0?'pos':'neg'}">${chgO>=0?'+':''}${chgO}%</span></div></div>
        <div class="kpi-item"><div class="kpi-value">$${(totVA[n]/1000).toFixed(0)}B</div>
          <div class="kpi-label">Value Added ${yr} <span class="kpi-delta ${chgV>=0?'pos':'neg'}">${chgV>=0?'+':''}${chgV}%</span></div></div>
        <div class="kpi-item"><div class="kpi-value">${vaInt}%</div>
          <div class="kpi-label">VA Intensity (VA/Output)</div></div>
        <div class="kpi-item"><div class="kpi-value">${(totEmp[n]/1000).toFixed(0)}K</div>
          <div class="kpi-label">Total Workers ${yr}</div></div>
      </div>`;
    }

    destroyChart('ch5-cluster-area');
    const ctx1 = $('ch5-cluster-area');
    if (ctx1) {
      new Chart(ctx1, { type: 'bar',
        data: { labels: yrs, datasets: MAIN_CLUSTERS.map(cl => ({
          label: cl.replace(' Manufacturing','').replace(' Industries',''),
          data: data.clusterOutput.data[cl],
          backgroundColor: COLORS[cl]+'cc', borderColor: COLORS[cl], borderWidth: 0.5, stack: 'out',
        }))},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, tooltip: { callbacks: {
            label: c => `${c.dataset.label}: $${(c.raw/1000).toFixed(1)}B`,
            afterBody: its => [`Total: $${(data.clusterOutput.data['Total Manufacturing'][its[0].dataIndex]/1000).toFixed(1)}B`],
          }}},
          scales: {
            x: { ...CD.scales.x, stacked: true, ticks: { ...CD.scales.x.ticks, maxTicksLimit: 9 }},
            y: { ...CD.scales.y, stacked: true, title: { display: true, text: 'SGD million', color: TEXT, font: { size: 10 }}},
          },
        },
      });
    }

    destroyChart('ch5-cluster-share');
    const ctx2 = $('ch5-cluster-share');
    if (ctx2) {
      const vals = MAIN_CLUSTERS.map(cl => data.clusterOutput.data[cl][yrs.length-1]);
      const tot = vals.reduce((a,b)=>a+b,0);
      new Chart(ctx2, { type: 'doughnut',
        data: { labels: MAIN_CLUSTERS.map(c=>c.replace(' Manufacturing','').replace(' Industries','')),
          datasets: [{ data: vals,
            backgroundColor: MAIN_CLUSTERS.map(cl=>COLORS[cl]+'dd'),
            borderColor: MAIN_CLUSTERS.map(cl=>COLORS[cl]), borderWidth: 1.5 }]},
        options: { responsive: true, plugins: {
          legend: { position: 'right', labels: { color: TEXT, boxWidth: 10, font: { size: 10 }}},
          tooltip: { callbacks: { label: c => `${c.label}: ${(c.raw/tot*100).toFixed(1)}%`}},
        }},
      });
    }

    destroyChart('ch5-cluster-emp');
    const ctx3 = $('ch5-cluster-emp');
    if (ctx3) {
      new Chart(ctx3, { type: 'line',
        data: { labels: yrs, datasets: MAIN_CLUSTERS.map(cl => ({
          label: cl.replace(' Manufacturing','').replace(' Industries',''),
          data: data.clusterEmp.data[cl],
          borderColor: COLORS[cl], backgroundColor: COLORS[cl]+'18',
          borderWidth: 1.8, pointRadius: 0, tension: 0.3, fill: false,
        }))},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, tooltip: { callbacks: {
            label: c => `${c.dataset.label}: ${(c.raw/1000).toFixed(1)}K workers`,
          }}},
          scales: {
            x: { ...CD.scales.x, ticks: { ...CD.scales.x.ticks, maxTicksLimit: 9 }},
            y: { ...CD.scales.y, title: { display: true, text: 'Workers', color: TEXT, font: { size: 10 }}},
          },
        },
      });
    }
  }

  /* ---- TAB 2: Productivity & VA Intensity ---- */
  async function renderProductivity() {
    const panel = $('ch5-productivity');
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = '1';
    const data = await loadData();
    const yrs = data.clusterVApW.years;

    const kpi = $('ch5-prod-kpi');
    if (kpi) {
      const tot  = data.clusterVApW.data['Total Manufacturing'];
      const elec = data.clusterVApW.data['Electronics'];
      const bio  = data.clusterVApW.data['Biomedical Manufacturing'];
      const ht   = data.highTechShare;
      const chg  = ((tot[tot.length-1]-tot[0])/tot[0]*100).toFixed(0);
      kpi.innerHTML = `<div class="kpi-strip">
        <div class="kpi-item"><div class="kpi-value">$${tot[tot.length-1]?.toFixed(0)}K</div>
          <div class="kpi-label">Total Mfg VA/Worker 2025 <span class="kpi-delta pos">+${chg}% vs 2010</span></div></div>
        <div class="kpi-item"><div class="kpi-value">$${elec[elec.length-1]?.toFixed(0)}K</div>
          <div class="kpi-label">Electronics VA/Worker 2025</div></div>
        <div class="kpi-item"><div class="kpi-value">$${bio[bio.length-1]?.toFixed(0)}K</div>
          <div class="kpi-label">Biomedical VA/Worker 2025</div></div>
        <div class="kpi-item"><div class="kpi-value">${ht.values[ht.values.length-1]?.toFixed(1)}%</div>
          <div class="kpi-label">Med/High-Tech VA Share 2022</div></div>
      </div>`;
    }

    destroyChart('ch5-vapw-trend');
    const ctx1 = $('ch5-vapw-trend');
    if (ctx1) {
      new Chart(ctx1, { type: 'line',
        data: { labels: yrs, datasets: MAIN_CLUSTERS.map(cl => ({
          label: cl.replace(' Manufacturing','').replace(' Industries',''),
          data: data.clusterVApW.data[cl],
          borderColor: COLORS[cl], backgroundColor: COLORS[cl]+'18',
          borderWidth: 2, pointRadius: 0, tension: 0.3, fill: false,
        }))},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, tooltip: { callbacks: { label: c => `${c.dataset.label}: $${c.raw?.toFixed(0)}K`}}},
          scales: {
            x: { ...CD.scales.x, ticks: { ...CD.scales.x.ticks, maxTicksLimit: 8 }},
            y: { ...CD.scales.y, title: { display: true, text: 'SGD thousand / worker', color: TEXT, font: { size: 10 }}},
          },
        },
      });
    }

    destroyChart('ch5-iip');
    const ctx2 = $('ch5-iip');
    if (ctx2) {
      const iipYrs = data.iipCluster.years;
      const iipMap = {
        'Electronics': 'Electronics Cluster', 'Chemicals': 'Chemicals Cluster',
        'Biomedical Manufacturing': 'Biomedical Manufacturing Cluster',
        'Precision Engineering': 'Precision Engineering Cluster',
        'Transport Engineering': 'Transport Engineering Cluster',
      };
      new Chart(ctx2, { type: 'line',
        data: { labels: iipYrs, datasets: [
          { label: 'Total', data: data.iipCluster.data['Total'],
            borderColor: '#c0392b', borderWidth: 2.5, borderDash: [4,2],
            pointRadius: 0, fill: false, tension: 0.3 },
          ...Object.entries(iipMap).map(([cl,key]) => ({
            label: cl.replace(' Manufacturing',''),
            data: data.iipCluster.data[key],
            borderColor: COLORS[cl], backgroundColor: COLORS[cl]+'11',
            borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3,
          })),
        ]},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw?.toFixed(1)}`}}},
          scales: {
            x: { ...CD.scales.x, ticks: { ...CD.scales.x.ticks, maxTicksLimit: 8 }},
            y: { ...CD.scales.y, title: { display: true, text: 'Index (2025 = 100)', color: TEXT, font: { size: 10 }}},
          },
        },
      });
    }

    destroyChart('ch5-va-intensity');
    const ctx3 = $('ch5-va-intensity');
    if (ctx3) {
      const oIdx = data.clusterOutput.years.length - 1;
      const vIdx = data.clusterVA.years.length - 1;
      const sorted = MAIN_CLUSTERS
        .map(cl => ({ cl, val: parseFloat(((data.clusterVA.data[cl][vIdx] / data.clusterOutput.data[cl][oIdx]) * 100).toFixed(1)) }))
        .sort((a,b) => b.val - a.val);
      new Chart(ctx3, { type: 'bar',
        data: { labels: sorted.map(s=>s.cl.replace(' Manufacturing','').replace(' Industries','')),
          datasets: [{ label: 'VA Intensity 2025', data: sorted.map(s=>s.val),
            backgroundColor: sorted.map(s=>COLORS[s.cl]+'cc'),
            borderColor: sorted.map(s=>COLORS[s.cl]), borderWidth: 1.5, borderRadius: 3 }]},
        options: { ...CD, responsive: true, indexAxis: 'y',
          plugins: { ...CD.plugins, legend: { display: false },
            tooltip: { callbacks: { label: c => `VA/Output: ${c.raw}%`}}},
          scales: {
            x: { ...CD.scales.x, title: { display: true, text: '% of gross output', color: TEXT, font: { size: 10 }}, max: 55 },
            y: { ...CD.scales.y },
          },
        },
      });
    }
  }

  /* ---- TAB 3: Structural Transformation ---- */
  async function renderStructural() {
    const panel = $('ch5-structural');
    if (!panel || panel.dataset.built) return;
    panel.dataset.built = '1';
    const data = await loadData();

    destroyChart('ch5-mfg-gdp-share');
    const ctx1 = $('ch5-mfg-gdp-share');
    if (ctx1) {
      const yrs = data.gdpSector.years;
      const gdp  = data.gdpSector.data.GDP;
      const sh   = arr => arr.map((v,i)=>gdp[i]?parseFloat((v/gdp[i]*100).toFixed(2)):null);
      new Chart(ctx1, { type: 'line',
        data: { labels: yrs, datasets: [
          { label: 'Manufacturing', data: sh(data.gdpSector.data.Manufacturing),
            borderColor: '#2980b9', borderWidth: 2.2, pointRadius: 0, fill: false, tension: 0.3 },
          { label: 'Services', data: sh(data.gdpSector.data.Services),
            borderColor: '#27ae60', borderWidth: 2.2, pointRadius: 0, fill: false, tension: 0.3 },
          { label: 'Construction', data: sh(data.gdpSector.data.Construction),
            borderColor: '#d68910', borderWidth: 1.5, pointRadius: 0, fill: false, tension: 0.3 },
        ]},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, tooltip: { callbacks: { label: c => `${c.dataset.label}: ${c.raw?.toFixed(1)}%`}}},
          scales: {
            x: { ...CD.scales.x, ticks: { ...CD.scales.x.ticks, maxTicksLimit: 12 }},
            y: { ...CD.scales.y, title: { display: true, text: '% of real GDP (chained 2015$)', color: TEXT, font: { size: 10 }}, min: 0 },
          },
        },
      });
    }

    destroyChart('ch5-shiftshare');
    const ctx2 = $('ch5-shiftshare');
    if (ctx2) {
      const yrAll = data.workersByIndustry.years;
      const y0i = yrAll.indexOf('2010'), y1i = yrAll.indexOf('2024');
      const totalE0 = data.workersByIndustry.data['Total Manufacturing'][y0i];
      const totalE1 = data.workersByIndustry.data['Total Manufacturing'][y1i];
      const r_n = (totalE1 - totalE0) / totalE0;
      const ss = data.workersByIndustry.industries
        .filter(ind => ind !== 'Total Manufacturing')
        .map(ind => {
          const row = data.workersByIndustry.data[ind];
          const e0 = row[y0i], e1 = row[y1i];
          if (!e0 || !e1 || e0 < 1000) return null;
          const NE = e0 * r_n, r_i = (e1-e0)/e0, IM = e0*(r_i-r_n);
          return { label: ind.replace('& Chemical Products','& Chem.').replace('Reproduction Of Recorded Media','Media').replace('Pharmaceutical & Biological','Pharma').replace(' & ','/ ').replace('Manufacturing','Mfg').substring(0,30), NE: parseFloat(NE.toFixed(0)), IM: parseFloat(IM.toFixed(0)), abs: Math.abs(e1-e0), total: e1-e0 };
        })
        .filter(Boolean).sort((a,b)=>b.abs-a.abs).slice(0,9);

      new Chart(ctx2, { type: 'bar',
        data: { labels: ss.map(s=>s.label), datasets: [
          { label: 'National Growth Effect', data: ss.map(s=>s.NE), backgroundColor: '#1a5276aa', borderRadius: 2 },
          { label: 'Industry-Specific Effect', data: ss.map(s=>s.IM),
            backgroundColor: ss.map(s=>s.IM>=0?'#27ae60bb':'#c0392bbb'), borderRadius: 2 },
        ]},
        options: { ...CD, responsive: true, indexAxis: 'y',
          plugins: { ...CD.plugins, tooltip: { callbacks: {
            label: c => `${c.dataset.label}: ${c.raw>0?'+':''}${c.raw?.toFixed(0)} workers`,
            afterBody: its => [`Net Δ 2010→2024: ${ss[its[0].dataIndex].total>0?'+':''}${ss[its[0].dataIndex].total?.toLocaleString()} workers`],
          }}},
          scales: {
            x: { ...CD.scales.x, stacked: true, title: { display: true, text: 'Employment change (persons)', color: TEXT, font: { size: 10 }}},
            y: { ...CD.scales.y, stacked: true, ticks: { ...CD.scales.y.ticks, font: { size: 9.5 }}},
          },
        },
      });
    }

    destroyChart('ch5-hightech');
    const ctx3 = $('ch5-hightech');
    if (ctx3) {
      const ht = data.highTechShare;
      new Chart(ctx3, { type: 'line',
        data: { labels: ht.years, datasets: [{ label: 'Med/High-Tech Share', data: ht.values,
          borderColor: '#8e44ad', backgroundColor: '#8e44ad28',
          borderWidth: 2, pointRadius: 3, fill: true, tension: 0.3 }]},
        options: { ...CD, responsive: true,
          plugins: { ...CD.plugins, legend: { display: false },
            tooltip: { callbacks: { label: c => `High-tech share: ${c.raw?.toFixed(1)}%`}}},
          scales: {
            x: { ...CD.scales.x },
            y: { ...CD.scales.y, title: { display: true, text: '% of total Mfg VA', color: TEXT, font: { size: 10 }}, min: 60, max: 95 },
          },
        },
      });
    }
  }

  window.initIndustrial          = initIndustrial;
  window.initClusterComposition  = renderCluster;
  window.initClusterProductivity = renderProductivity;
  window.initStructuralTransform = renderStructural;
})();
