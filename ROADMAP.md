# sg-economics Platform Roadmap

## Raw file URLs (for Claude)
- ROADMAP: https://raw.githubusercontent.com/gpillai7/sg-economics/main/ROADMAP.md
- cache.js: https://raw.githubusercontent.com/gpillai7/sg-economics/main/js/core/cache.js
- singstat.js: https://raw.githubusercontent.com/gpillai7/sg-economics/main/js/core/singstat.js
- index.html: https://raw.githubusercontent.com/gpillai7/sg-economics/main/index.html

## Architecture
- All JS modules in js/modules/, each <200 lines
- Shared data layer in js/core/ (cache + API clients)
- Static fallbacks in data/fallbacks/ as .json (committed, refreshed by GitHub Action)
- index.html loads modules lazily via <script> tags on navigation

## Status

### GDP Module
- [x] Annual GDP chart — SingStat live (gdp-singstat-patch.js — to be refactored into js/modules/gdp-annual.js)
- [ ] Quarterly GDP tab — next up (SingStat M015631)
- [ ] Sectoral contribution stacked bar (SingStat M015741 series 2–20)
- [ ] Sector heatmap (quarterly x sector)

### Infrastructure
- [x] js/core/ folder created
- [ ] js/core/cache.js — shared TTL cache + sessionStorage
- [ ] js/core/singstat.js — shared SingStat fetch wrapper
- [ ] data/fallbacks/ — static JSON fallbacks

### Planned Modules
- [ ] Labour market dashboard
- [ ] Inflation & cost pressures
- [ ] Economic calendar
- [ ] Property & real estate

## SingStat Resources
| Resource ID | Description | Series |
|---|---|---|
| M015741 | Real GDP growth rate by industry, Annual | 1=total, 2–20=sectors |
| M015731 | Nominal GDP at current prices, Annual | 1=total |
| M015631 | GDP YoY growth rate, Quarterly | 2=real |
| M213911 | Value-added by industry, Quarterly | various |

## Session Notes
- GDP per capita derived: (Nominal SGD × USD/SGD rate) / population
- SingStat API base: https://tablebuilder.singstat.gov.sg/api/table/tabledata
- Rate limit: 100 calls/min — cache aggressively (6hr TTL + sessionStorage)
