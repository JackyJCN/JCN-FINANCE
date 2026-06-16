/**
 * Excel 解析、列映射、校验、IndexedDB 持久化
 */
const SalesParser = (() => {
  const META_STORE = 'importMeta';

  function openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(APP_CONFIG.dbName, APP_CONFIG.dbVersion);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(APP_CONFIG.dbStore)) {
          db.createObjectStore(APP_CONFIG.dbStore, { keyPath: 'id', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          db.createObjectStore(META_STORE, { keyPath: 'key' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function saveRecords(rows, meta = {}) {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([APP_CONFIG.dbStore, META_STORE], 'readwrite');
      tx.objectStore(APP_CONFIG.dbStore).clear();
      rows.forEach((row, i) => tx.objectStore(APP_CONFIG.dbStore).add({ ...row, id: i + 1 }));
      tx.objectStore(META_STORE).put({
        key: 'lastImport',
        fileName: meta.fileName || '',
        importedAt: new Date().toISOString(),
        rowCount: rows.length,
        mapping: meta.mapping || null,
        dataRevision: APP_CONFIG.dataRevision
      });
      tx.oncomplete = () => { db.close(); resolve(rows.length); };
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadRecords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(APP_CONFIG.dbStore, 'readonly');
      const req = tx.objectStore(APP_CONFIG.dbStore).getAll();
      req.onsuccess = () => {
        db.close();
        resolve(req.result.map(({ id, ...rest }) => rest));
      };
      req.onerror = () => reject(req.error);
    });
  }

  async function loadImportMeta() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(META_STORE, 'readonly');
      const req = tx.objectStore(META_STORE).get('lastImport');
      req.onsuccess = () => { db.close(); resolve(req.result || null); };
      req.onerror = () => reject(req.error);
    });
  }

  async function clearRecords() {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction([APP_CONFIG.dbStore, META_STORE], 'readwrite');
      tx.objectStore(APP_CONFIG.dbStore).clear();
      tx.objectStore(META_STORE).clear();
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    });
  }

  function pickSheet(wb) {
    const preferred = APP_CONFIG.excelSource?.preferredSheet;
    if (preferred && wb.Sheets[preferred]) {
      const trial = XLSX.utils.sheet_to_json(wb.Sheets[preferred], { defval: '', raw: false });
      if (trial.length) return preferred;
    }
    for (const name of wb.SheetNames) {
      const trial = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
      if (trial.length) return name;
    }
    return wb.SheetNames[0];
  }

  function readWorkbook(wb) {
    const sheetName = pickSheet(wb);
    const sheet = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });
    const headers = json.length ? Object.keys(json[0]) : [];
    return { rows: json, sheetName, headers, sheetNames: wb.SheetNames };
  }

  function importWithMapping(rawRows, headers, mapping, fileName) {
    const finalMapping = mapping || autoMapColumns(headers);
    const check = validateMapping(finalMapping);
    if (!check.ok) throw new Error(check.message);
    const { records, errors } = applyMapping(rawRows, finalMapping);
    if (!records.length) throw new Error(errors[0] || '没有有效数据行');
    return { records, errors, mapping: finalMapping, fileName: fileName || APP_CONFIG.excelSource?.fileName };
  }

  function importFromArrayBuffer(buffer, fileName, mapping) {
    const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
    const { rows, headers, sheetName } = readWorkbook(wb);
    if (!headers.length) throw new Error('Excel 无表头或为空');
    const result = importWithMapping(rows, headers, mapping, fileName);
    return { ...result, sheetName, rowCount: rows.length };
  }

  async function importFromUrl(url, fileName, mapping) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`无法读取 ${url}（${res.status}）`);
    const buffer = await res.arrayBuffer();
    return importFromArrayBuffer(buffer, fileName, mapping);
  }

  function readExcelFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array', cellDates: true });
          resolve(readWorkbook(wb));
        } catch (err) {
          reject(new Error(err.message || '无法解析 Excel 文件'));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsArrayBuffer(file);
    });
  }

  function normalizeHeader(h) {
    return String(h).trim().toLowerCase().replace(/\s+/g, '');
  }

  function autoMapColumns(headers) {
    const def = APP_CONFIG.excelSource?.defaultMapping;
    if (def && Object.values(def).every(col => headers.includes(col))) {
      return { ...def };
    }

    const mapping = {};
    const normalized = headers.map(h => ({ raw: h, norm: normalizeHeader(h) }));

    for (const [field, aliases] of Object.entries(APP_CONFIG.fieldAliases)) {
      let match = null;
      for (const a of aliases) {
        const an = normalizeHeader(a);
        match = normalized.find(h =>
          h.norm === an || h.norm.includes(an) || an.includes(h.norm)
        );
        if (match) break;
      }
      if (match) mapping[field] = match.raw;
    }
    return mapping;
  }

  function parseDate(value) {
    if (value == null || value === '') return null;
    if (value instanceof Date && !isNaN(value)) {
      return value.toISOString().slice(0, 10);
    }
    if (typeof value === 'number') {
      const parsed = XLSX.SSF?.parse_date_code?.(value);
      if (parsed) {
        const dt = new Date(parsed.y, parsed.m - 1, parsed.d);
        return dt.toISOString().slice(0, 10);
      }
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

  function parseNumber(value) {
    if (value === '' || value == null) return 0;
    if (typeof value === 'number' && !isNaN(value)) return value;
    const s = String(value).replace(/[,，\s￥¥$]/g, '').trim();
    const n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  }

  function parsePercent(value) {
    if (value == null || value === '') return null;
    if (typeof value === 'string' && value.includes('%')) {
      return parseNumber(value) / 100;
    }
    const n = parseNumber(value);
    if (n > 1 && n <= 100) return n / 100;
    if (n >= -1 && n <= 1) return n;
    return n / 100;
  }

  function getMappingFromForm(formEl) {
    const mapping = {};
    formEl.querySelectorAll('select[data-field]').forEach(sel => {
      if (sel.value) mapping[sel.dataset.field] = sel.value;
    });
    return mapping;
  }

  function validateMapping(mapping) {
    const missing = APP_CONFIG.requiredFields.filter(f => !mapping[f]);
    if (missing.length) {
      return {
        ok: false,
        message: '缺少必填映射：' + missing.map(f => APP_CONFIG.fieldLabels[f]).join('、')
      };
    }
    if (!mapping.grossProfit && !mapping.grossMargin) {
      // revenue & cost 已必填，可计算毛利
    }
    return { ok: true };
  }

  function applyMapping(rawRows, mapping) {
    const errors = [];
    const records = [];
    const maxErrors = 20;

    rawRows.forEach((raw, idx) => {
      const rowNum = idx + 2;
      const get = (field) => {
        const col = mapping[field];
        return col != null ? raw[col] : undefined;
      };

      const salesDate = parseDate(get('salesDate'));
      if (!salesDate) {
        if (errors.length < maxErrors) errors.push(`第 ${rowNum} 行：销售日期无效或为空`);
        return;
      }

      const revenue = parseNumber(get('revenue'));
      const cost = parseNumber(get('cost'));
      let quantity = 0;
      if (mapping.quantity) {
        quantity = parseNumber(get('quantity'));
      } else {
        const qtyCol = Object.keys(raw).find(k => normalizeHeader(k) === normalizeHeader('数量'));
        if (qtyCol) quantity = parseNumber(raw[qtyCol]);
      }
      let unitPrice = mapping.unitPrice ? parseNumber(get('unitPrice')) : null;
      let unitCost = mapping.unitCost ? parseNumber(get('unitCost')) : null;
      let grossProfit = mapping.grossProfit ? parseNumber(get('grossProfit')) : null;
      let grossMargin = mapping.grossMargin ? parsePercent(get('grossMargin')) : null;

      if (grossProfit == null && grossMargin != null) {
        grossProfit = revenue * grossMargin;
      } else if (grossProfit != null && grossMargin == null) {
        grossMargin = revenue ? grossProfit / revenue : 0;
      } else if (grossProfit == null && grossMargin == null) {
        grossProfit = revenue - cost;
        grossMargin = revenue ? grossProfit / revenue : 0;
      }

      const customerCode = String(get('customerCode') ?? '').trim();
      const productCode = String(get('productCode') ?? '').trim();
      const salesperson = String(get('salesperson') ?? '').trim();
      const customerCategory = String(get('customerCategory') ?? '').trim();

      if (!customerCode && errors.length < maxErrors) {
        errors.push(`第 ${rowNum} 行：客户编码为空`);
        return;
      }
      if (!productCode && errors.length < maxErrors) {
        errors.push(`第 ${rowNum} 行：商品编码为空`);
        return;
      }
      if (!salesperson && errors.length < maxErrors) {
        errors.push(`第 ${rowNum} 行：销售人员为空`);
        return;
      }
      if (!customerCategory && errors.length < maxErrors) {
        errors.push(`第 ${rowNum} 行：客户类别为空`);
        return;
      }

      if (grossMargin != null && (grossMargin < -1 || grossMargin > 1)) {
        grossMargin = revenue ? grossProfit / revenue : 0;
      }

      if (!quantity && revenue && unitPrice) quantity = revenue / unitPrice;
      if (unitPrice == null || unitPrice === 0) {
        unitPrice = quantity ? revenue / quantity : 0;
      }
      if (unitCost == null || unitCost === 0) {
        unitCost = quantity ? cost / quantity : 0;
      }

      const productLineRaw = get('productLine');
      const productCategory = String(productLineRaw ?? '').trim();
      records.push({
        salesDate,
        salesperson,
        customerCategory,
        customerCode,
        customerName: String(get('customerName') ?? '').trim() || customerCode,
        productCode,
        productName: String(get('productName') ?? '').trim() || productCode,
        productCategory,
        productLine: resolveProductLine(productCode, productCategory || productLineRaw),
        productSeries: resolveProductSeries(productCode),
        quantity,
        unitPrice: Math.round(unitPrice * 10000) / 10000,
        unitCost: Math.round(unitCost * 10000) / 10000,
        revenue,
        cost,
        grossProfit: Math.round(grossProfit * 100) / 100,
        grossMargin: revenue ? Math.round(grossProfit / revenue * 10000) / 10000 : 0
      });
    });

    if (errors.length >= maxErrors) {
      errors.push(`… 还有更多错误，请检查源文件后重新导入`);
    }

    return { records, errors };
  }

  function validateRecords(records) {
    const warnings = [];
    if (!records.length) {
      warnings.push({ type: 'error', text: '没有有效数据行，请检查列映射与源文件' });
      return warnings;
    }

    const { start, end } = APP_CONFIG.dataPeriod;
    const outOfRange = records.filter(r => r.salesDate < start || r.salesDate > end).length;
    if (outOfRange) {
      warnings.push({ type: 'warn', text: `${outOfRange} 笔交易日期超出分析窗口（${start} ~ ${end}）` });
    }

    const zeroCost = records.filter(r => r.cost === 0 && r.revenue > 0).length;
    if (zeroCost) warnings.push({ type: 'warn', text: `${zeroCost} 笔交易成本为 0 但有收入，请核对成本列映射` });

    const negProfit = records.filter(r => r.grossProfit < 0).length;
    if (negProfit) warnings.push({ type: 'info', text: `${negProfit} 笔交易毛利为负（可能存在促销或数据口径问题）` });

    const codes = new Set();
    const dupRows = records.filter(r => {
      const key = `${r.salesDate}|${r.customerCode}|${r.productCode}|${r.revenue}`;
      if (codes.has(key)) return true;
      codes.add(key);
      return false;
    }).length;
    if (dupRows > 5) warnings.push({ type: 'info', text: `检测到较多疑似重复行，建议确认是否重复导入` });

    return warnings;
  }

  function saveMappingToLocal(mapping, fileName) {
    localStorage.setItem('excelColumnMapping', JSON.stringify({ mapping, fileName, savedAt: Date.now() }));
  }

  function loadMappingFromLocal(headers) {
    try {
      const saved = JSON.parse(localStorage.getItem('excelColumnMapping') || 'null');
      if (!saved?.mapping) return null;
      const valid = Object.values(saved.mapping).every(col => headers.includes(col));
      return valid ? saved.mapping : null;
    } catch {
      return null;
    }
  }

  function recordsHaveQuantityField(rows) {
    return rows?.length > 0 && rows.some(r => typeof r.quantity === 'number' && !Number.isNaN(r.quantity));
  }

  return {
    readExcelFile,
    importFromArrayBuffer,
    importFromUrl,
    importWithMapping,
    autoMapColumns,
    applyMapping,
    validateRecords,
    validateMapping,
    getMappingFromForm,
    saveRecords,
    loadRecords,
    loadImportMeta,
    clearRecords,
    saveMappingToLocal,
    loadMappingFromLocal,
    recordsHaveQuantityField
  };
})();
