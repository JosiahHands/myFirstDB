// Import data by its compiled location (a sibling of index.html), not ../../resultData.
import { result as copperRows } from "./copper.js";
import { result as goldRows } from "./gold.js";
import { result as inflationRows } from "./inflation.js";
import { result as silverRows } from "./silver.js";
const toMap = (rows) => new Map(rows.map((r) => [r.Year, Number(r.Multiplier)]));
const inflation = toMap(inflationRows);
const gold = toMap(goldRows);
const silver = toMap(silverRows);
const copper = toMap(copperRows);
const allYears = [inflationRows, goldRows, silverRows, copperRows].flat().map((r) => r.Year);
const firstYear = Math.min(...allYears);
const lastYear = Math.max(...allYears);
const years = Array.from({ length: lastYear - firstYear + 1 }, (_, i) => firstYear + i);
// Combined: a basket holding equal dollar amounts of gold, silver and copper in
// 1913, i.e. the average of the three multipliers. Skipped for any year where a
// metal has no value.
const combined = new Map();
for (const year of years) {
    const v = [gold, silver, copper].map((m) => m.get(year));
    if (v.every((x) => x !== undefined)) {
        combined.set(year, v.reduce((a, b) => a + b, 0) / v.length);
    }
}
const SERIES = [
    { id: "inflation", name: "Inflation (CPI)", short: "CPI", slot: 1, values: inflation },
    { id: "gold", name: "Gold", short: "Gold", slot: 2, values: gold },
    { id: "silver", name: "Silver", short: "Silver", slot: 3, values: silver },
    { id: "copper", name: "Copper", short: "Copper", slot: 4, values: copper },
    { id: "combined", name: "Combined metals", short: "Combined", slot: 5, values: combined },
];
// ----------------------------------------------------------------- state
const hidden = new Set();
let hoverYear = null;
/** Scales from the last render, used by the hover layer. */
let geo = null;
// ------------------------------------------------------------------- DOM
const chartEl = document.querySelector("#chart");
const plot = document.querySelector("#plot");
const tooltip = document.querySelector("#tooltip");
const legend = document.querySelector("#legend");
const table = document.querySelector("#table");
const NS = "http://www.w3.org/2000/svg";
function svg(tag, attrs, parent) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs))
        node.setAttribute(k, String(v));
    parent.appendChild(node);
    return node;
}
/** Multiplier for the tooltip: 1.23×, 12.3×, 123×. */
function fmt(v) {
    return `${v.toFixed(v < 10 ? 2 : v < 100 ? 1 : 0)}×`;
}
/** Shorter multiplier for line-end labels: 1.2×, 12×, 123×. */
function fmtShort(v) {
    return `${v.toFixed(v < 10 ? 1 : 0)}×`;
}
/** 1-2-5 ticks inside [lo, hi], e.g. 0.5, 1, 2, 5, 10, 20, 50, 100. */
function logTicks(lo, hi) {
    const ticks = [];
    for (let e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++) {
        for (const m of [1, 2, 5]) {
            const t = Number((m * 10 ** e).toPrecision(6));
            if (t >= lo && t <= hi)
                ticks.push(t);
        }
    }
    return ticks;
}
// ---------------------------------------------------------------- legend
function buildLegend() {
    for (const s of SERIES) {
        const button = document.createElement("button");
        button.type = "button";
        button.setAttribute("aria-pressed", "true");
        button.innerHTML = `<span class="key s${s.slot}"></span>`;
        button.append(s.name);
        button.addEventListener("click", () => {
            if (hidden.has(s.id))
                hidden.delete(s.id);
            else
                hidden.add(s.id);
            button.setAttribute("aria-pressed", String(!hidden.has(s.id)));
            render();
        });
        legend.append(button);
    }
}
// ----------------------------------------------------------------- chart
function render() {
    const { width, height } = chartEl.getBoundingClientRect();
    plot.replaceChildren();
    plot.setAttribute("viewBox", `0 0 ${width} ${height}`);
    const visible = SERIES.filter((s) => !hidden.has(s.id));
    if (visible.length === 0) {
        geo = null;
        updateHover();
        const msg = svg("text", { x: width / 2, y: height / 2, class: "empty", "text-anchor": "middle" }, plot);
        msg.textContent = "Pick a line above to show it.";
        return;
    }
    const narrow = width < 560;
    const left = 44;
    const top = 12;
    const right = narrow ? 88 : 104; // room for the line-end labels
    const bottom = 28;
    const innerW = width - left - right;
    const innerH = height - top - bottom;
    const values = visible.flatMap((s) => [...s.values.values()]);
    const lo = Math.min(...values) / 1.15;
    const hi = Math.max(...values) * 1.15;
    const x = (year) => left + ((year - firstYear) / (lastYear - firstYear)) * innerW;
    const y = (v) => top + (1 - (Math.log(v) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * innerH;
    // Grid and axes.
    const axes = svg("g", {}, plot);
    for (const t of logTicks(lo, hi)) {
        svg("line", { x1: left, x2: left + innerW, y1: y(t), y2: y(t), class: t === 1 ? "baseline" : "gridline" }, axes);
        const label = svg("text", { x: left - 8, y: y(t), class: "tick", "text-anchor": "end", "dominant-baseline": "middle" }, axes);
        label.textContent = `${t}×`;
    }
    const step = narrow ? 20 : 10;
    for (let year = Math.ceil(firstYear / step) * step; year <= lastYear; year += step) {
        const label = svg("text", { x: x(year), y: top + innerH + 20, class: "tick", "text-anchor": "middle" }, axes);
        label.textContent = String(year);
    }
    // Lines; a missing year breaks the line instead of bridging it.
    for (const s of visible) {
        let d = "";
        let penDown = false;
        for (const year of years) {
            const v = s.values.get(year);
            if (v === undefined) {
                penDown = false;
                continue;
            }
            d += `${penDown ? "L" : "M"}${x(year).toFixed(1)},${y(v).toFixed(1)}`;
            penDown = true;
        }
        svg("path", { d, class: `line s${s.slot}` }, plot);
    }
    drawEndLabels(visible, x, y, left + innerW, top, top + innerH);
    const hoverLayer = svg("g", {}, plot);
    geo = { x, y, left, top, innerW, innerH, width, visible, hoverLayer };
    updateHover();
}
/**
 * Name + latest value at the right end of each line. Labels that would overlap
 * are spread apart and joined to their line by a thin leader.
 */
function drawEndLabels(visible, x, y, plotRight, plotTop, plotBottom) {
    const GAP = 16;
    const ends = visible
        .map((s) => {
        const year = Math.max(...s.values.keys());
        const v = s.values.get(year);
        return { s, year, v, lineY: y(v), labelY: y(v) };
    })
        .sort((a, b) => a.lineY - b.lineY);
    for (let i = 1; i < ends.length; i++) {
        ends[i].labelY = Math.max(ends[i].labelY, ends[i - 1].labelY + GAP);
    }
    const overflow = ends[ends.length - 1].labelY - plotBottom;
    if (overflow > 0) {
        ends[ends.length - 1].labelY -= overflow;
        for (let i = ends.length - 2; i >= 0; i--) {
            ends[i].labelY = Math.min(ends[i].labelY, ends[i + 1].labelY - GAP);
        }
    }
    for (const e of ends)
        e.labelY = Math.max(e.labelY, plotTop);
    const keyX = plotRight + 10;
    const group = svg("g", {}, plot);
    for (const e of ends) {
        if (Math.abs(e.labelY - e.lineY) > 1) {
            svg("path", { d: `M${x(e.year) + 3},${e.lineY}L${keyX - 3},${e.labelY}`, class: "leader" }, group);
        }
        svg("line", { x1: keyX, x2: keyX + 8, y1: e.labelY, y2: e.labelY, class: `end-key s${e.s.slot}` }, group);
        const label = svg("text", { x: keyX + 14, y: e.labelY, class: "end-label", "dominant-baseline": "middle" }, group);
        label.textContent = `${e.s.short} ${fmtShort(e.v)}`;
    }
}
// ----------------------------------------------------------------- hover
function updateHover() {
    if (!geo || hoverYear === null) {
        geo?.hoverLayer.replaceChildren();
        tooltip.hidden = true;
        return;
    }
    const { x, y, top, innerH, width, visible, hoverLayer } = geo;
    const year = hoverYear;
    const cx = x(year);
    hoverLayer.replaceChildren();
    svg("line", { x1: cx, x2: cx, y1: top, y2: top + innerH, class: "crosshair" }, hoverLayer);
    for (const s of visible) {
        const v = s.values.get(year);
        if (v !== undefined)
            svg("circle", { cx, cy: y(v), r: 4, class: `dot s${s.slot}` }, hoverLayer);
    }
    const rows = visible
        .map((s) => ({ s, v: s.values.get(year) }))
        .sort((a, b) => (b.v ?? -1) - (a.v ?? -1));
    tooltip.innerHTML =
        `<div class="year">${year}</div>` +
            rows
                .map(({ s, v }) => `<div class="row"><span class="key s${s.slot}"></span><span>${s.name}</span>` +
                `<span class="value">${v === undefined ? "no data" : fmt(v)}</span></div>`)
                .join("");
    tooltip.hidden = false;
    // Sit beside the crosshair; flip to the left side near the right edge.
    const tipW = tooltip.offsetWidth;
    const leftPos = cx + 12 + tipW > width ? cx - 12 - tipW : cx + 12;
    tooltip.style.transform = `translate(${Math.max(0, leftPos)}px, ${top}px)`;
}
function yearAt(clientX) {
    if (!geo)
        return null;
    const px = clientX - chartEl.getBoundingClientRect().left;
    const t = (px - geo.left) / geo.innerW;
    if (t < -0.02 || t > 1.02)
        return null;
    const year = Math.round(firstYear + t * (lastYear - firstYear));
    return Math.min(lastYear, Math.max(firstYear, year));
}
chartEl.addEventListener("pointermove", (e) => {
    hoverYear = yearAt(e.clientX);
    updateHover();
});
chartEl.addEventListener("pointerleave", () => {
    hoverYear = null;
    updateHover();
});
chartEl.addEventListener("focus", () => {
    hoverYear ??= lastYear;
    updateHover();
});
chartEl.addEventListener("blur", () => {
    hoverYear = null;
    updateHover();
});
chartEl.addEventListener("keydown", (e) => {
    const jump = e.shiftKey ? 10 : 1;
    const current = hoverYear ?? lastYear;
    const next = {
        ArrowLeft: current - jump,
        ArrowRight: current + jump,
        Home: firstYear,
        End: lastYear,
        Escape: null,
    };
    if (!(e.key in next))
        return;
    e.preventDefault();
    const target = next[e.key];
    hoverYear = target === null ? null : Math.min(lastYear, Math.max(firstYear, target));
    updateHover();
});
// ----------------------------------------------------------------- table
function buildTable() {
    const head = `<thead><tr><th scope="col">Year</th>${SERIES.map((s) => `<th scope="col">${s.name}</th>`).join("")}</tr></thead>`;
    const body = years
        .map((year) => {
        const cells = SERIES.map((s) => {
            const v = s.values.get(year);
            return v === undefined ? `<td class="missing">—</td>` : `<td>${v.toFixed(2)}×</td>`;
        }).join("");
        return `<tr><th scope="row">${year}</th>${cells}</tr>`;
    })
        .join("");
    table.innerHTML = head + `<tbody>${body}</tbody>`;
}
// ------------------------------------------------------------------ init
buildLegend();
buildTable();
render(); // draw now, not on the first resize callback
new ResizeObserver(() => render()).observe(chartEl);
