const fs = require("fs");
const path = require("path");
const { renderChartPng } = require("../src/excelChartPng");

const buf = renderChartPng(
  "pie",
  [
    ["Cover placed", 45],
    ["Pending", 20],
    ["Declined", 5],
  ],
  "Quotations by status"
);
const out = path.join(__dirname, "_font-test.png");
fs.writeFileSync(out, buf);
console.log("Wrote", out, buf.length, "bytes");
