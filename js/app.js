/**
 * 应用入口
 */
const App = {
  allRows: [],
  pendingImport: null,
  importWarnings: [],

  init() {
    try {
      this.bindEvents();
      this.initTheme();
      this.initFilters();
      this.initMultiSelects();
      this.loadFromStorage();
    } catch (err) {
      console.error('应用初始化失败', err);
      this.showEmptyState();
      this.toast('页面初始化失败，请刷新后重试', 'error');
    }
  },

  withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise.catch(() => fallback),
      new Promise(resolve => setTimeout(() => resolve(fallback), ms))
    ]);
  },

  isPublicSite() {
    const h = location.hostname.toLowerCase();
    return h.endsWith('github.io') || h.endsWith('github.pages.dev');
  },

  canAutoLoadBundled() {
    if (this.isPublicSite()) return false;
    const h = location.hostname.toLowerCase();
    return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
  },

  ensureBootstrapped() {
    const loadingEls = document.querySelectorAll('#appLoading');
    const stillLoading = [...loadingEls].some(el => !el.classList.contains('hidden'));
    if (!stillLoading) return;
    this.showEmptyState();
  },

  initMultiSelects() {
    const refresh = () => this.refreshDashboard();
    this.filterSalesperson = FilterMultiSelect.create('filterSalesperson', '业务员', refresh);
    this.filterCategory = FilterMultiSelect.create('filterCategory', '客户类别', refresh);
    this.filterCustomer = FilterSearchSelect.create('filterCustomer', refresh);
    this.filterProduct = FilterSearchSelect.create('filterProduct', refresh);
  },

  bindEvents() {
    const fileInput = document.getElementById('fileInput');
    ['btnImport', 'btnImportEmpty'].forEach(id => {
      document.getElementById(id)?.addEventListener('click', () => fileInput.click());
    });
    fileInput?.addEventListener('change', (e) => this.handleFileSelect(e.target.files[0]));

    document.getElementById('btnTheme')?.addEventListener('click', () => this.toggleTheme());
    document.getElementById('btnSettings')?.addEventListener('click', () => this.openSettings());

    const mappingDialog = document.getElementById('mappingDialog');
    document.getElementById('btnMappingCancel')?.addEventListener('click', () => {
      mappingDialog.close();
      this.pendingImport = null;
    });
    mappingDialog?.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.confirmImport();
    });

    document.getElementById('settingsDialog')?.querySelector('form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveSettings();
    });
    document.getElementById('btnSettingsCancel')?.addEventListener('click', () => {
      document.getElementById('settingsDialog').close();
    });

    this.bindModelSelectEvents();
    this.bindDashboardEvents();
    this.setupDragDrop();
  },

  bindDashboardEvents() {
    ['filterDateStart', 'filterDateEnd', 'filterGranularity', 'filterCompareMode'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => this.refreshDashboard());
    });

    document.getElementById('btnResetFilter')?.addEventListener('click', () => this.clearAllData());

    document.getElementById('btnExportCsv')?.addEventListener('click', () => {
      const filters = this.getFilters();
      const analysis = SalesAnalytics.analyze(this.allRows, filters);
      DashboardCharts.exportCsv(analysis.filtered);
      this.toast('已导出按月汇总 CSV');
    });

    document.getElementById('btnCopyReport')?.addEventListener('click', () => {
      const md = AIInsights.getMarkdown?.() || document.getElementById('aiReport')?.innerText || '';
      navigator.clipboard.writeText(md).then(() => this.toast('报告已复制（Markdown）'));
    });
  },

  setupDragDrop() {
    const targets = [document.body, document.getElementById('emptyState')];
    targets.forEach(el => {
      if (!el) return;
      el.addEventListener('dragover', (e) => { e.preventDefault(); el.classList.add('drag-over'); });
      el.addEventListener('dragleave', () => el.classList.remove('drag-over'));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        el.classList.remove('drag-over');
        const file = e.dataTransfer?.files?.[0];
        if (file && /\.xlsx?$/i.test(file.name)) this.handleFileSelect(file);
      });
    });
  },

  initTheme() {
    const theme = localStorage.getItem('dashboardTheme') || 'light';
    document.documentElement.setAttribute('data-theme', theme);
    this.syncThemeToggle(theme);
  },

  syncThemeToggle(theme) {
    const btn = document.getElementById('btnTheme');
    const label = document.getElementById('themeToggleText');
    const isDark = theme === 'dark';
    btn?.setAttribute('aria-pressed', isDark ? 'true' : 'false');
    if (label) label.textContent = isDark ? '深色' : '浅色';
  },

  toggleTheme() {
    const next = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('dashboardTheme', next);
    this.syncThemeToggle(next);
    DashboardCharts.onThemeChange?.();
  },

  initFilters() {
    const start = document.getElementById('filterDateStart');
    const end = document.getElementById('filterDateEnd');
    if (start) start.value = APP_CONFIG.dataPeriod.start.slice(0, 7);
    if (end) end.value = APP_CONFIG.dataPeriod.end.slice(0, 7);
  },

  getAiProviderPresets() {
    return {
      openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
      deepseek: { baseUrl: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
      qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
      custom: { baseUrl: '', model: '' }
    };
  },

  populateModelSelect(provider, savedModel) {
    const select = document.getElementById('aiModel');
    const customWrap = document.getElementById('aiModelCustomWrap');
    const customInput = document.getElementById('aiModelCustom');
    const selectWrap = document.getElementById('aiModelSelectWrap');
    if (!select) return;

    const presets = APP_CONFIG.aiModelPresets?.[provider] || [];
    select.innerHTML = '';

    if (provider === 'custom') {
      selectWrap?.classList.add('hidden');
      customWrap?.classList.remove('hidden');
      if (customInput) customInput.value = savedModel || '';
      return;
    }

    selectWrap?.classList.remove('hidden');
    presets.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.value;
      opt.textContent = m.label;
      select.appendChild(opt);
    });
    const customOpt = document.createElement('option');
    customOpt.value = '__custom__';
    customOpt.textContent = '其他（手动输入…）';
    select.appendChild(customOpt);

    const known = presets.some(m => m.value === savedModel);
    if (savedModel && known) {
      select.value = savedModel;
      customWrap?.classList.add('hidden');
      if (customInput) customInput.value = '';
    } else if (savedModel) {
      select.value = '__custom__';
      customWrap?.classList.remove('hidden');
      if (customInput) customInput.value = savedModel;
    } else {
      select.value = presets[0]?.value || '__custom__';
      customWrap?.classList.toggle('hidden', select.value !== '__custom__');
    }
  },

  getSelectedAiModel() {
    const provider = document.getElementById('aiProvider')?.value;
    let model = '';
    if (provider === 'custom') {
      model = document.getElementById('aiModelCustom')?.value.trim() || '';
    } else {
      const select = document.getElementById('aiModel');
      if (select?.value === '__custom__') {
        model = document.getElementById('aiModelCustom')?.value.trim() || '';
      } else {
        model = select?.value.trim() || '';
      }
    }
    return normalizeAiModel(model, provider);
  },

  bindModelSelectEvents() {
    const select = document.getElementById('aiModel');
    const customWrap = document.getElementById('aiModelCustomWrap');
    select?.addEventListener('change', () => {
      const isCustom = select.value === '__custom__';
      customWrap?.classList.toggle('hidden', !isCustom);
      if (isCustom) document.getElementById('aiModelCustom')?.focus();
    });
  },

  openSettings() {
    const s = JSON.parse(localStorage.getItem('aiSettings') || '{}');
    const providerSel = document.getElementById('aiProvider');
    const presets = this.getAiProviderPresets();
    providerSel.value = s.provider || APP_CONFIG.aiDefaults.provider;

    document.getElementById('aiBaseUrl').value =
      s.baseUrl || presets[providerSel.value]?.baseUrl || APP_CONFIG.aiDefaults.baseUrl;
    this.populateModelSelect(providerSel.value, normalizeAiModel(
      s.model || presets[providerSel.value]?.model || APP_CONFIG.aiDefaults.model,
      providerSel.value
    ));
    document.getElementById('aiApiKey').value = s.apiKey || '';

    providerSel.onchange = () => {
      const p = presets[providerSel.value];
      if (providerSel.value !== 'custom' && p) {
        document.getElementById('aiBaseUrl').value = p.baseUrl;
      }
      this.populateModelSelect(providerSel.value, p?.model || '');
    };

    document.getElementById('settingsDialog').showModal();
  },

  saveSettings() {
    const prev = JSON.parse(localStorage.getItem('aiSettings') || '{}');
    const model = this.getSelectedAiModel();
    if (!model) {
      this.toast('请选择或填写 Model', 'error');
      return;
    }
    const settings = {
      provider: document.getElementById('aiProvider').value,
      baseUrl: document.getElementById('aiBaseUrl').value.trim(),
      model,
      apiKey: document.getElementById('aiApiKey').value.trim(),
      analysisPrompt: prev.analysisPrompt || document.getElementById('aiUserPrompt')?.value?.trim() || ''
    };
    localStorage.setItem('aiSettings', JSON.stringify(settings));
    document.getElementById('settingsDialog').close();
    AIInsights.updateEnhanceButton?.();
    if (typeof AIInsights !== 'undefined' && AIInsights.hasApiKey) {
      const btn = document.getElementById('btnAiEnhance');
      if (btn) btn.textContent = AIInsights.hasApiKey() ? 'AI 增强分析' : '配置 API 后增强分析';
    }
    this.toast('设置已保存');
  },

  shouldSkipAutoLoad() {
    return localStorage.getItem('dashboardSkipAutoLoad') === '1';
  },

  resetFilters() {
    document.getElementById('filterDateStart').value = APP_CONFIG.dataPeriod.start.slice(0, 7);
    document.getElementById('filterDateEnd').value = APP_CONFIG.dataPeriod.end.slice(0, 7);
    document.getElementById('filterGranularity').value = 'month';
    document.getElementById('filterCompareMode').value = 'mom';
    document.getElementById('filterParetoDim').value = 'customer';
    document.getElementById('metricRevenue').checked = true;
    document.getElementById('metricProfit').checked = true;
    document.getElementById('metricMargin').checked = true;

    const silent = true;
    this.filterSalesperson?.reset(silent);
    this.filterCategory?.reset(silent);
    this.filterCustomer?.reset(silent);
    this.filterProduct?.reset(silent);
    FilterMultiSelect.closeAll?.();
    DashboardCharts.resetViewState?.();
  },

  async clearAllData() {
    const hasData = this.allRows.length > 0 ||
      document.getElementById('dashboard')?.classList.contains('hidden') === false;
    if (!hasData) {
      this.toast('当前没有可清空的数据', 'error');
      return;
    }
    if (!confirm('确定清空已导入的销售数据？\n\n清空后将返回欢迎页，需要重新导入 Excel 才能继续分析。')) return;

    this.toast('正在清空…');

    try {
      await SalesParser.clearRecords();
    } catch (err) {
      console.warn('清空 IndexedDB 失败', err);
    }

    localStorage.setItem('dashboardSkipAutoLoad', '1');
    this.allRows = [];
    this.importWarnings = [];
    this.pendingImport = null;
    this.resetFilters();
    DashboardCharts.clearDashboard?.();

    const aiReport = document.getElementById('aiReport');
    if (aiReport) aiReport.innerHTML = '';
    AIInsights.resetEnhanced?.();

    this.filterSalesperson?.setOptions([]);
    this.filterCategory?.setOptions([]);
    this.filterCustomer?.setItems([]);
    this.filterProduct?.setItems([]);

    this.showEmptyState();
    this.toast('已清空销售数据，已返回欢迎页');
  },

  async loadFromStorage() {
    if (this.isPublicSite()) {
      await this.loadFromStoragePublic();
      return;
    }
    await this.loadFromStorageLocal();
  },

  async loadFromStoragePublic() {
    this.showEmptyState();
    if (this.shouldSkipAutoLoad()) return;
    try {
      const rows = await this.withTimeout(SalesParser.loadRecords(), 1500, []);
      if (!rows?.length) return;
      const meta = await this.withTimeout(SalesParser.loadImportMeta(), 800, null);
      const revisionOk = meta?.dataRevision === APP_CONFIG.dataRevision;
      const schemaOk = SalesParser.recordsHaveQuantityField(rows);
      if (rows.length && revisionOk && schemaOk) {
        await this.setData(rows, meta);
      }
    } catch (err) {
      console.warn('IndexedDB 加载失败', err);
    }
  },

  async loadFromStorageLocal() {
    const showLoader = this.canAutoLoadBundled() && !this.shouldSkipAutoLoad();
    if (showLoader) this.setLoading(true);
    else this.showEmptyState();

    try {
      const rows = await this.withTimeout(SalesParser.loadRecords(), 3000, null);
      if (rows === null) {
        console.warn('IndexedDB 读取超时');
        this.showEmptyState();
        return;
      }
      const meta = await this.withTimeout(SalesParser.loadImportMeta(), 1500, null);
      const revisionOk = meta?.dataRevision === APP_CONFIG.dataRevision;
      const schemaOk = SalesParser.recordsHaveQuantityField(rows);
      if (rows?.length && revisionOk && schemaOk) {
        await this.setData(rows, meta);
        return;
      }
      if (rows?.length) {
        await this.setData(rows, meta);
        if (this.canAutoLoadBundled()) {
          const upgraded = await this.tryUpgradeBundledData();
          if (!upgraded) {
            this.toast('当前为本地缓存；如需应用最新字段映射，请重新导入 Excel');
          }
        }
        return;
      }
    } catch (err) {
      console.warn('IndexedDB 加载失败', err);
    }
    await this.loadBundledData();
  },

  setLoading(on) {
    document.querySelectorAll('#appLoading').forEach(el => el.classList.toggle('hidden', !on));
  },

  showEmptyState() {
    this.setLoading(false);
    document.querySelectorAll('#emptyState').forEach(el => el.classList.remove('hidden'));
    document.querySelectorAll('#dashboard').forEach(el => el.classList.add('hidden'));
  },

  /** 数据版本变更时，后台从 bundled Excel 静默升级 */
  async tryUpgradeBundledData() {
    if (this.shouldSkipAutoLoad() || !this.canAutoLoadBundled()) return false;
    const url = APP_CONFIG.excelSource?.bundledUrl;
    if (!url || location.protocol === 'file:') return false;
    try {
      const mapping = APP_CONFIG.excelSource.defaultMapping;
      await LazyLibs.loadXlsx();
      const { records, fileName } = await SalesParser.importFromUrl(
        url,
        APP_CONFIG.excelSource.fileName,
        mapping
      );
      await SalesParser.saveRecords(records, { fileName, mapping });
      SalesParser.saveMappingToLocal(mapping, fileName);
      await this.setData(records, { fileName });
      this.toast(`数据已自动更新（${records.length} 笔）`);
      return true;
    } catch (err) {
      console.warn('自动升级 Excel 失败', err);
      return false;
    }
  },

  /** IndexedDB 无数据时，自动加载 data/ 目录下的 Excel（需通过本地服务器访问） */
  async loadBundledData() {
    try {
      if (this.shouldSkipAutoLoad() || !this.canAutoLoadBundled()) {
        this.showEmptyState();
        return;
      }
      const url = APP_CONFIG.excelSource?.bundledUrl;
      if (!url) {
        this.showEmptyState();
        return;
      }
      if (location.protocol === 'file:') {
        this.showEmptyState();
        this.toast('请双击「启动看板.bat」打开，不要直接双击 index.html', 'error');
        return;
      }
      const mapping = APP_CONFIG.excelSource.defaultMapping;
      await LazyLibs.loadXlsx();
      const { records, fileName } = await SalesParser.importFromUrl(
        url,
        APP_CONFIG.excelSource.fileName,
        mapping
      );
      await SalesParser.saveRecords(records, { fileName, mapping });
      SalesParser.saveMappingToLocal(mapping, fileName);
      await this.setData(records, { fileName });
      this.toast(`已自动加载 ${records.length} 笔销售数据`);
    } catch (err) {
      console.warn('自动加载 Excel 失败', err);
      this.showEmptyState();
      if (!this.isPublicSite()) {
        this.toast('未找到本地缓存，请导入 Excel 文件', 'error');
      }
    } finally {
      this.ensureBootstrapped();
    }
  },

  async handleFileSelect(file) {
    if (!file) return;
    if (!/\.xlsx?$/i.test(file.name)) {
      alert('请选择 .xlsx 或 .xls 文件');
      return;
    }
    this.setLoading(true);
    try {
      await LazyLibs.loadXlsx();
      const result = await SalesParser.readExcelFile(file);
      const { rows, headers, sheetName } = result;
      if (!headers.length) {
        alert('Excel 首 Sheet 无表头或为空，请检查文件');
        return;
      }
      let mapping = SalesParser.loadMappingFromLocal(headers) || SalesParser.autoMapColumns(headers);
      const def = APP_CONFIG.excelSource?.defaultMapping || {};
      mapping = { ...def, ...mapping };
      Object.keys(mapping).forEach(k => {
        if (mapping[k] && !headers.includes(mapping[k])) delete mapping[k];
      });
      this.pendingImport = { rawRows: rows, headers, mapping, fileName: file.name, sheetName };
      this.showMappingDialog(headers, mapping, rows.slice(0, 5));
    } catch (err) {
      alert('Excel 解析失败：' + err.message);
    } finally {
      this.setLoading(false);
    }
    document.getElementById('fileInput').value = '';
  },

  showMappingDialog(headers, mapping, preview) {
    const form = document.getElementById('mappingForm');
    form.innerHTML = '';
    const fields = [
      ...APP_CONFIG.requiredFields,
      'customerName', 'productName', 'productLine',
      'quantity', 'unitPrice', 'unitCost',
      'grossProfit', 'grossMargin'
    ];
    const esc = (s) => String(s).replace(/"/g, '&quot;');

    fields.forEach(field => {
      const label = document.createElement('label');
      const required = APP_CONFIG.requiredFields.includes(field);
      label.innerHTML = `<span>${APP_CONFIG.fieldLabels[field] || field}${required ? ' *' : ''}</span>`;
      const sel = document.createElement('select');
      sel.dataset.field = field;
      sel.innerHTML = '<option value="">— 不映射 —</option>' +
        headers.map(h => `<option value="${esc(h)}"${mapping[field] === h ? ' selected' : ''}>${h}</option>`).join('');
      label.appendChild(sel);
      form.appendChild(label);
    });

    const sheetInfo = this.pendingImport?.sheetName ? `<p class="hint">Sheet：${this.pendingImport.sheetName}，共 ${this.pendingImport.rawRows.length} 行</p>` : '';
    document.getElementById('mappingPreview').innerHTML = sheetInfo +
      '<table class="data-table"><thead><tr>' +
      headers.map(h => `<th>${h}</th>`).join('') +
      '</tr></thead><tbody>' +
      preview.map(r => '<tr>' + headers.map(h => `<td>${r[h] ?? ''}</td>`).join('') + '</tr>').join('') +
      '</tbody></table>';

    document.getElementById('mappingErrors').innerHTML = '';
    document.getElementById('mappingDialog').showModal();
  },

  async confirmImport() {
    const form = document.getElementById('mappingForm');
    const mapping = SalesParser.getMappingFromForm(form);
    const check = SalesParser.validateMapping(mapping);
    const errEl = document.getElementById('mappingErrors');

    if (!check.ok) {
      errEl.innerHTML = `<p class="errors">${check.message}</p>`;
      return;
    }

    const { records, errors } = SalesParser.applyMapping(this.pendingImport.rawRows, mapping);
    if (errors.length) {
      errEl.innerHTML = '<ul class="errors">' + errors.map(e => `<li>${e}</li>`).join('') + '</ul>';
      if (!records.length) return;
      errEl.innerHTML += `<p class="hint">已解析 ${records.length} 行有效数据，是否仍要导入？<button type="button" class="btn btn-primary" id="btnForceImport">仍要导入</button></p>`;
      document.getElementById('btnForceImport')?.addEventListener('click', () => this.finishImport(records, mapping));
      return;
    }

    await this.finishImport(records, mapping);
  },

  async finishImport(records, mapping) {
    const warnings = SalesParser.validateRecords(records);
    await SalesParser.saveRecords(records, {
      fileName: this.pendingImport.fileName,
      mapping
    });
    SalesParser.saveMappingToLocal(mapping, this.pendingImport.fileName);
    document.getElementById('mappingDialog').close();
    this.pendingImport = null;
    this.importWarnings = warnings;
    await this.setData(records);
    this.showImportSummary(records.length, warnings);
  },

  showImportSummary(count, warnings) {
    const msgs = [`成功导入 ${count} 笔销售记录`];
    warnings.forEach(w => msgs.push(w.text));
    this.toast(msgs.join('\n'), warnings.some(w => w.type === 'error') ? 'error' : 'success');
  },

  getFilters() {
    return {
      dateStart: document.getElementById('filterDateStart').value,
      dateEnd: document.getElementById('filterDateEnd').value,
      salespeople: this.filterSalesperson?.getActiveValues() || [],
      categories: this.filterCategory?.getActiveValues() || [],
      customerSearch: this.filterCustomer?.getSearchText() || '',
      productSearch: this.filterProduct?.getSearchText() || '',
      customerExact: document.getElementById('filterCustomerInput')?.dataset.value || '',
      productExact: document.getElementById('filterProductInput')?.dataset.value || '',
      compareMode: document.getElementById('filterCompareMode')?.value || 'mom',
      granularity: document.getElementById('filterGranularity')?.value || 'month'
    };
  },

  populateFilterOptions(rows) {
    const opts = SalesAnalytics.getFilterOptions?.(rows) || {
      salespeople: [...new Set(rows.map(r => r.salesperson))].sort(),
      categories: [...new Set(rows.map(r => r.customerCategory))].sort()
    };
    this.filterSalesperson?.setOptions(opts.salespeople);
    this.filterCategory?.setOptions(opts.categories);

    const custMap = new Map();
    rows.forEach(r => {
      if (!custMap.has(r.customerCode)) {
        custMap.set(r.customerCode, {
          value: r.customerCode,
          label: `${r.customerCode} ${r.customerName || ''}`.trim(),
          search: `${r.customerCode} ${r.customerName || ''}`.toLowerCase()
        });
      }
    });
    this.filterCustomer?.setItems([...custMap.values()].sort((a, b) => a.label.localeCompare(b.label)));

    const prodMap = new Map();
    rows.forEach(r => {
      if (!prodMap.has(r.productCode)) {
        prodMap.set(r.productCode, {
          value: r.productCode,
          label: r.productCode,
          search: String(r.productCode || '').toLowerCase()
        });
      }
    });
    this.filterProduct?.setItems([...prodMap.values()].sort((a, b) => a.label.localeCompare(b.label)));
  },

  async setData(rows, meta) {
    localStorage.removeItem('dashboardSkipAutoLoad');
    this.allRows = rows;
    document.querySelectorAll('#emptyState').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('#dashboard').forEach(el => el.classList.remove('hidden'));
    this.populateFilterOptions(rows);

    const sub = document.querySelector('.subtitle');
    if (sub) sub.textContent = APP_CONFIG.companyName;

    this.setLoading(true);
    try {
      await LazyLibs.loadEcharts();
      DashboardCharts.ensureInit?.();
      this.refreshDashboard();
    } finally {
      this.setLoading(false);
    }
  },

  refreshDashboard() {
    const filters = this.getFilters();
    const analysis = SalesAnalytics.analyze(this.allRows, filters);
    if (typeof DashboardCharts !== 'undefined') DashboardCharts.refresh(this.allRows, analysis, filters);
    if (typeof AIInsights !== 'undefined') AIInsights.render(document.getElementById('aiReport'), analysis);
  },

  toast(message, type = 'success') {
    let el = document.getElementById('toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'toast';
      document.body.appendChild(el);
    }
    el.className = `toast toast-${type} show`;
    el.textContent = message;
    el.style.whiteSpace = 'pre-line';
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => el.classList.remove('show'), 5000);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
