const fs = require("fs");
const path = require("path");
const ExcelJS = require("exceljs");
const { buildClaimsManagementWorkbookBuffer } = require("../src/claimsExportExcel");

async function sheetNamesFromBuffer(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  return wb.worksheets.map((s) => s.name);
}

async function main() {
  const rows = [
    {
      id: 1,
      claim_status: "Open",
      insurer: "AIG",
      claim_type: "Motor",
      reported_to_broker_date: "2025-01-01",
      vehicle_value: 100000,
      repair_estimate: 50000,
    },
  ];
  const buf = await buildClaimsManagementWorkbookBuffer({
    headers: ["ID", "Status"],
    dataRows: [[1, "Open"]],
    filterSummary: "test",
    dataRowCount: 1,
    sourceRows: rows,
  });
  const names = await sheetNamesFromBuffer(buf);
  console.log("Claims sheets:", names.join(", "));
  if (!names.includes("Dashboard")) {
    process.exitCode = 1;
  }
  if (names[0] !== "Dashboard") {
    console.error("Expected Dashboard as first tab, got:", names[0]);
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
