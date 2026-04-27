export function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export function formatCurrency(value) {
  if (value === null || value === undefined || value === "") return "-";
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

export function agingClass(agingBucket) {
  if (agingBucket === "0-7") return "bg-green-50";
  if (agingBucket === "8-14") return "bg-yellow-50";
  if (agingBucket === "15-30") return "bg-orange-50";
  return "bg-red-50";
}
