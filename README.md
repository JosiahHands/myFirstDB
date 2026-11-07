# Inflation vs. Metals

Compares official US inflation (CPI) with the prices of gold, silver and copper since 1913.
Raw public data goes into a Postgres database. A web page then charts each series as a multiplier of its 1913 price.

## Requirements

- Node.js 23.6 or newer (runs `.ts` files directly)
- PostgreSQL
- Python 3 (only for the local web server)

```sh
npm install
```

## Project layout

| Folder | What's in it |
|---|---|
| `dataSource/` | Raw downloads (`.csv` and `.xlsx`). Sources and licenses are in [dataSource/source.md](dataSource/source.md). |
| `scripts/` | `data_to_sql.ts`, which turns everything in `dataSource/` into SQL. |
| `data/` | Generated SQL: one `<name>.sql` per source, plus `allData.sql` with every table. |
| `resultData/` | The chart data: yearly multipliers (1913 = 1) for inflation, gold, silver and copper. |
| `web/` | The page: `index.html`, `style.css` and `script/script.ts`. Compiled `.js` files are written next to `index.html`. |

## 1. Build the SQL

```sh
npm run build:sql
```

Reads every `.csv` and `.xlsx` in `dataSource/` and writes `data/<name>.sql` plus `data/allData.sql`. Nothing is hard-coded per file:

- **Table name:** the filename, lowercased (`copperNew.csv` becomes `coppernew`).
- **Workbooks:** each sheet with data becomes its own table. A workbook with one sheet is named after the file.
- **Finding the table:** title rows above the header, footnotes below the data and empty columns are skipped.
- **Columns:** names come from the header row. Each column's type (`integer`, `numeric`, `date`, `timestamp`, `text`) is guessed from its values. Blank cells and `NA` become `NULL`.
- **Primary key:** the first column, if it's a unique date or whole number.

Each generated file drops and recreates its tables, so rerunning it replaces the data.

## 2. Load the database

```sh
dropdb --if-exists inflationProject
createdb inflationProject
psql -d inflationProject -f data/allData.sql
```

## 3. View the chart

```sh
npm run web
```

Then open http://localhost:8000. Browsers block JavaScript modules on pages opened straight from disk, so a local server is needed.

Other commands:

| Command | What it does |
|---|---|
| `npm run build` | Type-checks the scripts and compiles the page (`tsc -b`) |
| `npm run watch` | Same, rebuilding on every save |

The chart shows inflation, gold, silver, copper and **combined**: a basket that held equal dollar amounts of the three metals in 1913. It uses a log scale. You can hover or use the arrow keys to read each year, toggle lines from the legend, and open a full data table.

## How the TypeScript build is set up

`tsconfig.json` lists three projects, all built by `tsc -b`:

- `scripts/`: Node scripts, type-check only.
- `resultData/`: compiles to `web/<name>.js`.
- `web/script/`: compiles to `web/script.js`.

`script.ts` imports data by where it ends up after compiling (`import { result } from "./gold.js"`). A `rootDirs` setting lets TypeScript find the types in `resultData/`.

## Known data gaps

Gold has no 1960 value in the source data, so the gold and combined lines have a one-year gap there.
