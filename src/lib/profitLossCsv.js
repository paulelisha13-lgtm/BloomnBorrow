// Quotes every cell so commas/quotes in values cannot shift columns, and
// prefixes spreadsheet formula characters so a cell is never run as a formula.
const csvCell = value => {
  let text = String(value ?? "");
  if (/^[=+\-@]/.test(text) && Number.isNaN(Number(text))) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

const money = n => Number(n).toFixed(2);
const percent = n => (n === null || n === undefined ? "" : Number(n).toFixed(2));

export function buildProfitLossCsv(data) {
  const header = ["Month", "Income", "Expenses", "Net profit", "Profit margin %"];
  const rows = data.months.map(m => [m.month, money(m.income), money(m.expenses), money(m.net_profit), percent(m.margin)]);
  rows.push(["Total", money(data.totals.income), money(data.totals.expenses), money(data.totals.net_profit), percent(data.totals.margin)]);
  return [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
}
