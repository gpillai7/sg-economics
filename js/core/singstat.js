/**
 * js/core/singstat.js
 * Shared SingStat Table Builder API client.
 * Requires SGEcoCache (cache.js) to be loaded first.
 */
const SingStat = (function () {
  const BASE = 'https://tablebuilder.singstat.gov.sg/api/table/tabledata';

  async function fetchSeries(resourceId, seriesNo, opts = {}) {
    const cacheKey = `singstat_${resourceId}_${seriesNo}`;
    const cached = SGEcoCache.get(cacheKey);
    if (cached) return cached;

    const params = new URLSearchParams({
      seriesNoORrowNo: String(seriesNo),
      limit: opts.limit || 200,
      sortBy: opts.sortBy || 'key asc',
      ...(opts.timeFilter ? { timeFilter: opts.timeFilter } : {})
    });

    const resp = await fetch(`${BASE}/${resourceId}?${params}`);
    if (!resp.ok) throw new Error(`SingStat HTTP ${resp.status} (${resourceId})`);

    const json = await resp.json();
    if (json.StatusCode !== 200 || !json.Data?.row?.[0]) {
      throw new Error(`SingStat API error (${resourceId}): ${json.Message}`);
    }

    const result = {
      columns:     json.Data.row[0].columns,      // [{key, value}, ...]
      seriesName:  json.Data.row[0].rowText,
      lastUpdated: json.Data.dataLastUpdated,
      resourceId,
      seriesNo,
    };

    SGEcoCache.set(cacheKey, result);
    return result;
  }

  // Parse columns into a plain year→value or "YYYY Qq"→value map
  function toMap(columns) {
    const map = {};
    columns.forEach(({ key, value }) => {
      if (value !== '' && value !== 'na' && value != null) {
        map[key] = parseFloat(value);
      }
    });
    return map;
  }

  return { fetchSeries, toMap };
})();
