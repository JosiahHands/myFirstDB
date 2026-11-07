# Sources

All data comes from public, openly licensed sources. Prices are in nominal US dollars (not adjusted for inflation).

## 1. US Inflation (CPI)

- **Link:** https://datahub.io/core/cpi-us/_r/-/data/cpiai.csv
- **Format:** CSV, monthly
- **Coverage:** January 1913 to present
- **What it is:** Consumer Price Index for All Urban Consumers (CPI-U), all items, US city average, 1982–84 = 100.
- **Original source:** U.S. Bureau of Labor Statistics (BLS)
- **License:** Open Data Commons Public Domain Dedication and License (PDDL) v1.0
- **Notes:** Official CPI data begins in 1913; no earlier years are included.

## 2. Gold

- **Link:** https://datahub.io/core/gold-prices/_r/-/data/annual.csv
- **Format:** CSV, annual
- **Coverage:** 1833 to present
- **What it is:** Annual average gold price, USD per troy ounce.
- **Original sources:** Timothy Green's Historical Gold Price Table (1833–1959); World Bank Commodity Price Data, "Pink Sheet" (1960–present)
- **License:** Open Data Commons PDDL
- **Notes:** Gold was fixed by law at $20.67/oz until 1933 and $35/oz until 1971, so early values are flat.

## 3. Silver

- **Link:** https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/media/files/ds140-silver-2021.xlsx
- **Description page:** https://www.usgs.gov/media/files/silver-historical-statistics-data-series-140
- **Format:** XLSX, annual
- **Coverage:** 1900 to about 2021 (2021 update)
- **What it is:** U.S. Geological Survey (USGS) Data Series 140, "Historical Statistics for Mineral and Material Commodities in the United States," silver workbook. Price is the unit value column.
- **Original source:** U.S. Geological Survey
- **License:** Public domain
- **Notes:** Prices are in USD per metric ton. Divide by 32,150.7 to convert to USD per troy ounce.

### Silver, recent years (combined with the USGS data above)

- **Link:** https://datahub.io/energy-and-commodities/precious-metals-prices/_r/-/data/silver.csv
- **Format:** CSV, monthly
- **Coverage:** 1968 to present
- **What it is:** Month-end silver price, USD per troy ounce (XAG/USD).
- **License:** Open Data Commons PDDL
- **Notes:** Used to extend the series past the end of the USGS data. Monthly values are averaged into annual figures to match the USGS file.

## 4. Copper

- **Link:** https://d9-wret.s3.us-west-2.amazonaws.com/assets/palladium/production/s3fs-public/media/files/ds140-copper-2020.xlsx
- **Description page:** https://www.usgs.gov/media/files/copper-historical-statistics-data-series-140
- **Format:** XLSX, annual
- **Coverage:** 1900 to about 2020 (2020 update)
- **What it is:** U.S. Geological Survey (USGS) Data Series 140, "Historical Statistics for Mineral and Material Commodities in the United States," copper workbook. Price is the unit value column.
- **Original source:** U.S. Geological Survey
- **License:** Public domain
- **Notes:** Prices are in USD per metric ton.

### Copper, recent years (combined with the USGS data above)

- **Link:** https://fred.stlouisfed.org/graph/fredgraph.csv?id=PCOPPUSDM
- **Series page:** https://fred.stlouisfed.org/series/PCOPPUSDM
- **Format:** CSV, monthly
- **Coverage:** Early 1990s to present
- **What it is:** Global price of copper (London Metal Exchange benchmark), USD per metric ton.
- **Original source:** International Monetary Fund (IMF), Primary Commodity Prices, via FRED (Federal Reserve Bank of St. Louis)
- **Notes:** Used to extend the series past the end of the USGS data. Monthly values are averaged into annual figures to match the USGS file. Same unit as the USGS file, so no conversion is needed.

## General Notes

- 2026 values may be partial or missing, because some sources had not yet published full-year data.