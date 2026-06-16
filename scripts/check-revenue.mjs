import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const XLSX = require('../lib/xlsx.full.min.js');

async function loadWorkbook(file) {
  if (file.startsWith('http')) {
    const res = await fetch(file);
    const buf = Buffer.from(await res.arrayBuffer());
    return XLSX.read(buf, { type: 'buffer' });
  }
  return XLSX.readFile(file);
}

const file = process.argv[2] || 'http://127.0.0.1:8765/data/2025.6.1-2026.5.31.xlsx';
const wb = await loadWorkbook(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });

const mapping = {
  salesDate: '销售日期',
  salesperson: '销售人员',
  customerCategory: '客户类别',
  customerCode: '客户编码',
  productCode: '商品编号',
  revenue: '销售收入',
  cost: '销售成本',
  grossProfit: '销售毛利',
  grossMargin: '毛利率'
};

function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date && !isNaN(value)) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') {
    const parsed = XLSX.SSF?.parse_date_code?.(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`;
  }
  const s = String(value).trim();
  let m = s.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const dt = new Date(s);
  if (!isNaN(dt.getTime())) return dt.toISOString().slice(0, 10);
  return null;
}

function parseNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = parseFloat(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function parsePercent(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'string' && v.includes('%')) return parseNumber(v) / 100;
  const n = parseNumber(v);
  if (n > 1 && n <= 100) return n / 100;
  if (n >= -1 && n <= 1) return n;
  return n / 100;
}

const range = { start: '2026-01-01', end: '2026-05-31' };
let excelSum = 0;
let excelCount = 0;
let excelAllInRange = 0;

rows.forEach((raw) => {
  const salesDate = parseDate(raw[mapping.salesDate]);
  if (!salesDate || salesDate < range.start || salesDate > range.end) return;
  excelAllInRange++;
  excelSum += parseNumber(raw[mapping.revenue]);
  excelCount++;
});

let importSum = 0;
let importCount = 0;
let skipped = [];

rows.forEach((raw, idx) => {
  const rowNum = idx + 2;
  const salesDate = parseDate(raw[mapping.salesDate]);
  if (!salesDate) {
    skipped.push({ rowNum, reason: 'invalid date', revenue: parseNumber(raw[mapping.revenue]) });
    return;
  }
  if (salesDate < range.start || salesDate > range.end) return;

  const revenue = parseNumber(raw[mapping.revenue]);
  const cost = parseNumber(raw[mapping.cost]);
  let grossProfit = parseNumber(raw[mapping.grossProfit]);
  let grossMargin = parsePercent(raw[mapping.grossMargin]);
  if (grossMargin == null) grossMargin = revenue ? grossProfit / revenue : 0;

  const customerCode = String(raw[mapping.customerCode] ?? '').trim();
  const productCode = String(raw[mapping.productCode] ?? '').trim();
  const salesperson = String(raw[mapping.salesperson] ?? '').trim();
  const customerCategory = String(raw[mapping.customerCategory] ?? '').trim();

  if (!customerCode || !productCode || !salesperson || !customerCategory) {
    skipped.push({ rowNum, reason: 'missing required', revenue, salesDate });
    return;
  }
  if (grossMargin != null && (grossMargin < -1 || grossMargin > 1)) {
    grossMargin = revenue ? grossProfit / revenue : 0;
  }

  importSum += revenue;
  importCount++;
});

console.log('Range:', range.start, '~', range.end);
console.log('Excel all rows in range (no filter):', excelSum.toFixed(2), 'count:', excelCount);
console.log('After import validation:', importSum.toFixed(2), 'count:', importCount);
console.log('Dashboard shows:', '13385149.94', 'diff vs import:', (13385149.94 - importSum).toFixed(2));
console.log('User table:', '13402039.94', 'diff vs excel:', (13402039.94 - excelSum).toFixed(2));
console.log('Skipped rows in range:', skipped.length);
if (skipped.length) {
  const skippedRev = skipped.reduce((s, r) => s + (r.revenue || 0), 0);
  console.log('Skipped revenue total:', skippedRev.toFixed(2));
  console.log('Sample skipped:', skipped.slice(0, 10));
}
