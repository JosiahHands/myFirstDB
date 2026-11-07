/**
 * Turn every dataSource/*.csv and dataSource/*.xlsx into SQL load scripts:
 *   data/<name>.sql    one file per table (DROP + CREATE + INSERT in one transaction)
 *   data/allData.sql   every table in one transaction, ordered by source filename
 *
 * Nothing is specific to any one file:
 *   - a CSV becomes one table named after the file
 *   - a workbook becomes one table per sheet that has data; with a single such
 *     sheet the table is named after the file, otherwise <file>_<sheet>
 *   - the table is found inside the sheet: title rows above the header,
 *     footnotes below the data, and empty columns are skipped
 *   - column names come from the header row; each column's type is guessed
 *     from its values
 *
 * Usage (from anywhere, Node 23.6+ runs .ts directly):
 *   npm run build:sql        or        node scripts/data_to_sql.ts
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ExcelJS from "exceljs";

const root = join(import.meta.dirname, ".."); // project root
const src = join(root, "dataSource");
const out = join(root, "data");
const ALL_DATA = "allData";

/** A grid of cell text, as read from a CSV or one worksheet. */
type Sheet = {
  file: string; // output name: data/<file>.sql
  source: string; // where it came from, for the SQL comment
  grid: string[][];
};

/** Everything needed to write one table's SQL. */
type Table = {
  file: string; // output name: data/<file>.sql
  source: string; // e.g. car.csv, or book.xlsx sheet "Data"
  headerRow: number; // 1-based row the header was found on
  name: string; // quoted SQL table name
  ddl: string[]; // CREATE TABLE lines; each starts with its quoted column name
  rows: string[][]; // SQL literals, one array per row
};

// ---------------------------------------------------------------- CSV reading

/** Parse CSV text: "quoted, fields", "" escapes, and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let record: string[] = [];
  let field = "";
  let inQuotes = false;
  text = text.replace(/^﻿/, ""); // drop a byte-order mark, if any

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      record.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      record.push(field);
      records.push(record);
      record = [];
      field = "";
    } else {
      field += ch;
    }
  }
  if (field !== "" || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  // Drop blank lines.
  return records.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

// --------------------------------------------------------------- XLSX reading

/** "2024-03-31", or "2024-03-31 14:05:00" when the cell has a time of day. */
function formatDate(d: Date): string {
  const iso = d.toISOString(); // Excel dates come back as UTC wall-clock time
  return iso.endsWith("T00:00:00.000Z") ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

/** The text a cell shows, as plain text. */
function cellText(v: ExcelJS.CellValue): string {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return formatDate(v);
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "string" || typeof v === "boolean") return String(v);
  if ("richText" in v) {
    // Skip superscript runs: they are footnote markers, e.g. "Production¹".
    return v.richText
      .filter((run) => run.font?.vertAlign !== "superscript")
      .map((run) => run.text)
      .join("");
  }
  if ("formula" in v || "sharedFormula" in v) return cellText(v.result ?? null); // value Excel last calculated
  if ("hyperlink" in v) return v.text;
  return ""; // error values such as #N/A, #DIV/0!
}

async function readWorkbook(fileName: string): Promise<Sheet[]> {
  const base = fileName.replace(/\.xlsx$/i, "");
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(join(src, fileName));

  const sheets = wb.worksheets.map((ws) => {
    const grid: string[][] = [];
    for (let r = 1; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= ws.columnCount; c++) {
        const cell = row.getCell(c);
        // A merged range keeps its value in the top-left cell only.
        cells.push(cell.type === ExcelJS.ValueType.Merge ? "" : cellText(cell.value).trim());
      }
      grid.push(cells);
    }
    return { name: ws.name, grid };
  });

  const withData = sheets.filter((s) => s.grid.some((r) => r.some((c) => c !== "")));
  return withData.map((s) => ({
    file: withData.length === 1 ? base : `${base}_${s.name}`,
    source: withData.length === 1 ? fileName : `${fileName} sheet "${s.name}"`,
    grid: s.grid,
  }));
}

async function readSource(fileName: string): Promise<Sheet[]> {
  if (/\.xlsx$/i.test(fileName)) return readWorkbook(fileName);
  const grid = parseCsv(readFileSync(join(src, fileName), "utf8")).map((r) => r.map((c) => c.trim()));
  return [{ file: fileName.replace(/\.csv$/i, ""), source: fileName, grid }];
}

// ------------------------------------------------------ finding the table

const filledCount = (row: string[]): number => row.filter((c) => c !== "").length;

/**
 * Find the table inside a grid. The header is the first row filled at least
 * half as wide as the widest row (this skips title rows). Data runs from
 * there to the first blank row; single-cell rows at the bottom (footnotes)
 * and columns with nothing in them are dropped.
 */
function findTable(grid: string[][]): { headerRow: number; header: string[]; values: string[][] } | null {
  const widest = grid.reduce((max, r) => Math.max(max, filledCount(r)), 0);
  if (widest === 0) return null;

  const headerAt = grid.findIndex((r) => filledCount(r) >= Math.max(Math.min(2, widest), Math.ceil(widest / 2)));
  let start = headerAt + 1;
  while (start < grid.length && filledCount(grid[start]) === 0) start++; // spacer rows under the header
  let end = start;
  while (end < grid.length && filledCount(grid[end]) > 0) end++;
  const body = grid.slice(start, end);
  if (filledCount(grid[headerAt]) > 1) {
    while (body.length > 0 && filledCount(body[body.length - 1]) <= 1) body.pop();
  }

  const used = [grid[headerAt], ...body];
  const width = used.reduce((max, r) => Math.max(max, r.length), 0);
  const keep = [...Array(width).keys()].filter((c) => used.some((r) => (r[c] ?? "") !== ""));
  return {
    headerRow: headerAt + 1,
    header: keep.map((c) => grid[headerAt][c] ?? ""),
    values: body.map((r) => keep.map((c) => r[c] ?? "")),
  };
}

// ------------------------------------------------------------ type guessing

type ColType = "integer" | "bigint" | "numeric" | "date" | "timestamp" | "text";

const NULLS = new Set(["", "NA"]);
const INT = /^-?\d+$/;
const NUM = /^-?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const LEADING_ZERO = /^-?0\d/; // e.g. ZIP code "02134": keep as text so the 0 survives
const DAY = /^\d{4}-\d{2}-\d{2}$/; // 2024-03-31
const MONTH = /^\d{4}-\d{2}$/; // 2024-03, stored as 2024-03-01
const DATETIME = /^(\d{4}-\d{2}-\d{2}) \d{2}:\d{2}(:\d{2})?$/; // 2024-03-31 14:05:00

/** True for a real calendar date (rejects 2023-02-30). */
function isRealDate(day: string): boolean {
  const d = new Date(`${day}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(day);
}

const isDateLike =(v: string): boolean =>
  (DAY.test(v) && isRealDate(v)) ||
  (MONTH.test(v) && isRealDate(`${v}-01`)) ||
  (DATETIME.test(v) && isRealDate(v.slice(0, 10)));

/** Pick the narrowest type that fits every non-blank value in a column. */
function guessType(column: string[]): ColType {
  const present = column.filter((v) => !NULLS.has(v));
  if (present.length === 0) return "text";
  if (present.every(isDateLike)) return present.some((v) => DATETIME.test(v)) ? "timestamp" : "date";
  if (present.some((v) => LEADING_ZERO.test(v))) return "text";
  if (present.every((v) => INT.test(v))) {
    if (present.every((v) => Math.abs(Number(v)) <= 2_147_483_647)) return "integer";
    if (present.every((v) => v.replace("-", "").length <= 18)) return "bigint";
    return "numeric";
  }
  if (present.every((v) => NUM.test(v))) return "numeric";
  return "text";
}

// ------------------------------------------------------------- SQL pieces

/** Quote a value as a SQL string literal. */
function str(v: string): string {
  return `'${v.replaceAll("'", "''")}'`;
}

function toLiteral(v: string, type: ColType): string {
  if (NULLS.has(v)) return "NULL";
  if (type === "text" || type === "timestamp") return str(v);
  if (type === "date") return str(MONTH.test(v) ? `${v}-01` : v);
  return v;
}

/** "Price (USD/oz)" -> "price_usd_oz": lowercase, a-z 0-9 _, max 63 chars (Postgres limit). */
function toIdentifier(raw: string, fallback: string): string {
  let id = raw
    .normalize("NFKD") // "é" -> "e" + accent mark; the accent is dropped below
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (id === "") id = fallback;
  if (/^\d/.test(id)) id = `_${id}`;
  return id.slice(0, 63);
}

/** Make repeated names unique: price, price_2, price_3 ... */
function uniqueNames(names: string[]): string[] {
  const seen = new Set<string>();
  return names.map((base) => {
    let name = base;
    for (let k = 2; seen.has(name); k++) name = `${base.slice(0, 60)}_${k}`;
    seen.add(name);
    return name;
  });
}

// ----------------------------------------------------------- grid -> table

function buildTable(sheet: Sheet): Table | null {
  const found = findTable(sheet.grid);
  if (!found) return null;
  const { headerRow, header, values } = found;

  const names = uniqueNames(header.map((h, i) => toIdentifier(h, `column_${i + 1}`)));
  const types = header.map((_, i) => guessType(values.map((r) => r[i])));
  const rows = values.map((r) => r.map((v, i) => toLiteral(v, types[i])));

  // The first column becomes the primary key when it looks like one: a date
  // or whole number with no blanks and no repeats.
  const first = rows.map((r) => r[0]);
  const firstIsKey =
    ["date", "timestamp", "integer", "bigint"].includes(types[0]) &&
    rows.length > 0 &&
    !first.includes("NULL") &&
    new Set(first).size === first.length;

  const ddl = names.map((n, i) => {
    const noBlanks = rows.length > 0 && rows.every((r) => r[i] !== "NULL");
    const constraint = i === 0 && firstIsKey ? " PRIMARY KEY" : noBlanks ? " NOT NULL" : "";
    return `"${n}" ${types[i]}${constraint}`;
  });

  return {
    file: sheet.file,
    source: sheet.source,
    headerRow,
    name: `"${toIdentifier(sheet.file, "table")}"`,
    ddl,
    rows,
  };
}

/** DROP + CREATE + INSERT for one table (no transaction). */
function tableSql(t: Table): string {
  const where = t.headerRow > 1 ? `, header on row ${t.headerRow}` : "";
  const parts = [
    `-- From dataSource/${t.source} (${t.rows.length} rows${where})`,
    `DROP TABLE IF EXISTS ${t.name};`,
    `CREATE TABLE ${t.name} (\n  ${t.ddl.join(",\n  ")}\n);`,
  ];
  if (t.rows.length > 0) {
    const cols = t.ddl.map((c) => c.split(" ")[0]).join(", ");
    const body = t.rows.map((r) => `  (${r.join(", ")})`).join(",\n");
    parts.push(`INSERT INTO ${t.name} (${cols}) VALUES\n${body};`);
  }
  return parts.join("\n\n");
}

// ------------------------------------------------------------------- main

const HEADER =
  "-- Generated by scripts/data_to_sql.ts. Rerun it after changing a source file instead of editing this file.";

const sourceFiles = readdirSync(src)
  .filter((f) => /\.(csv|xlsx)$/i.test(f) && !f.startsWith("~$")) // ~$ = Excel's lock file while open
  .sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));

const tables: Table[] = [];
for (const f of sourceFiles) {
  for (const sheet of await readSource(f)) {
    const table = buildTable(sheet);
    if (table) tables.push(table);
    else console.warn(`skipped ${sheet.source}: no data`);
  }
}

// Guard against two sources colliding on one output.
const taken = new Map<string, string>();
for (const t of tables) {
  if (t.file.toLowerCase() === ALL_DATA.toLowerCase()) {
    throw new Error(`dataSource/${t.source} would overwrite data/${ALL_DATA}.sql; rename it`);
  }
  const other = taken.get(t.name);
  if (other) throw new Error(`${other} and ${t.source} both become table ${t.name}; rename one`);
  taken.set(t.name, t.source);
}

// One file per table.
for (const t of tables) {
  writeFileSync(join(out, `${t.file}.sql`), `${HEADER}\n\nBEGIN;\n\n${tableSql(t)}\n\nCOMMIT;\n`);
  console.log(`${t.file}.sql: ${t.rows.length} rows, ${t.ddl.length} columns`);
}

// Everything in one file, in source filename order.
writeFileSync(
  join(out, `${ALL_DATA}.sql`),
  `${HEADER}\n-- Tables, in source filename order: ${tables.map((t) => t.file).join(", ")}\n\n` +
    `BEGIN;\n\n${tables.map(tableSql).join("\n\n")}\n\nCOMMIT;\n`,
);
console.log(`${ALL_DATA}.sql: ${tables.length} tables`);
