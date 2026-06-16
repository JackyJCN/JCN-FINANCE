/**
 * 销售经营分析看板 — 全局配置
 */
const APP_CONFIG = {
  appName: '销售经营分析看板',
  companyName: '上海伊创刀具有限公司',
  brand: '澳克泰 ACHTECK 一级代理',
  dataPeriod: { start: '2025-06-01', end: '2026-05-31' },
  dbName: 'SalesDashboardDB',
  dbStore: 'salesRecords',
  dbVersion: 2,
  /** 导入逻辑版本；变更后自动重新加载 bundled Excel */
  dataRevision: 5,

  dataConvention: {
    taxIncluded: false,
    note: '源文件列「销售收入」「销售成本」「销售毛利」为销货系统导出值；毛利率为行级百分比（如 19.95%）。'
  },

  /** 2025.6.1-2026.5.31.xlsx 实测列名（8746 行，Sheet1） */
  excelSource: {
    fileName: '2025.6.1-2026.5.31.xlsx',
    bundledUrl: 'data/2025.6.1-2026.5.31.xlsx',
    preferredSheet: 'Sheet1',
    rowCount: 8746,
    dateRange: { start: '2025-06-23', end: '2026-05-29' },
    defaultMapping: {
      salesDate: '销售日期',
      salesperson: '销售人员',
      customerCategory: '客户类别',
      customerCode: '客户编码',
      customerName: '客户名称',
      productCode: '商品编号',
      productName: '商品名称',
      productLine: '商品类别',
      quantity: '数量',
      unitPrice: '单价',
      unitCost: '单位成本',
      revenue: '销售收入',
      cost: '销售成本',
      grossProfit: '销售毛利',
      grossMargin: '毛利率'
    }
  },

  fieldAliases: {
    salesDate: ['销售日期', '出库日期', '日期', '单据日期', '制单时间'],
    salesperson: ['销售人员', '业务员', '销售员', '销售代表'],
    customerCategory: ['客户类别', '客户类型', '客户分类'],
    customerCode: ['客户编码', '客户编号', '客户代码'],
    customerName: ['客户名称', '客户'],
    productCode: ['商品编号', '存货编码', 'sku', '物料编码', '产品编号', '规格型号', '商品编码'],
    productName: ['商品名称', '存货名称', '产品名称'],
    productLine: ['商品类别', '产品线', '产品大类', '品类'],
    quantity: ['数量', '销售数量', '出库数量', 'qty'],
    unitPrice: ['单价', '销售单价', '折后单价'],
    unitCost: ['单位成本', '成本单价'],
    revenue: ['销售收入', '收入', '销售额', '销售金额', '不含税金额'],
    cost: ['销售成本', '成本', '采购成本'],
    grossProfit: ['销售毛利', '毛利', '毛利润'],
    grossMargin: ['毛利率']
  },

  requiredFields: ['salesDate', 'salesperson', 'customerCategory', 'customerCode', 'productCode', 'revenue', 'cost'],

  thresholds: {
    grossMarginWarning: 0.15,
    grossMarginGood: 0.25,
    topCustomerRisk: 0.30,
    paretoRatio: 0.80
  },

  productSeriesRules: [
    { prefix: 'M110', series: '铣刀 Pro', line: '切削刀具' },
    { prefix: 'M115', series: '铣刀 Pro', line: '切削刀具' },
    { prefix: 'M116', series: '铣刀 Pro', line: '切削刀具' },
    { prefix: 'APE', series: '玉米铣刀', line: '切削刀具' },
    { prefix: 'AC152', series: '车削钢件 AC', line: '切削刀具' },
    { prefix: 'AC252', series: '车削钢件 AC', line: '切削刀具' },
    { prefix: 'AC', series: '车削刀片 AC', line: '切削刀具' },
    { prefix: 'PA1', series: '钢件精加工 PA', line: '切削刀具' },
    { prefix: 'PA', series: '车削刀片 PA', line: '切削刀具' },
    { prefix: 'AT210', series: '金属陶瓷 AT', line: '切削刀具' },
    { prefix: 'AT', series: '涂层金属陶瓷 AT', line: '切削刀具' },
    { prefix: '棒', series: '硬质合金棒材', line: '硬质合金棒材' },
    { prefix: 'BAR', series: '硬质合金棒材', line: '硬质合金棒材' }
  ],

  fieldLabels: {
    salesDate: '销售日期', salesperson: '销售人员', customerCategory: '客户类别',
    customerCode: '客户编码', customerName: '客户名称', productCode: '商品编码',
    productName: '商品名称', productLine: '产品线', quantity: '数量',
    unitPrice: '单价', unitCost: '单位成本',
    revenue: '收入', cost: '成本',
    grossProfit: '毛利', grossMargin: '毛利率'
  },

  aiDefaults: { provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },

  /** 各 Provider 可选模型（可随时在 config 中增补） */
  aiModelPresets: {
    openai: [
      { value: 'gpt-4o-mini', label: 'gpt-4o-mini（推荐）' },
      { value: 'gpt-4o', label: 'gpt-4o' },
      { value: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
      { value: 'gpt-4.1', label: 'gpt-4.1' },
      { value: 'o3-mini', label: 'o3-mini' }
    ],
    deepseek: [
      { value: 'deepseek-chat', label: 'deepseek-chat（推荐）' },
      { value: 'deepseek-reasoner', label: 'deepseek-reasoner' }
    ],
    qwen: [
      { value: 'qwen-plus', label: 'qwen-plus（推荐·稳定）' },
      { value: 'qwen3.7-plus', label: 'qwen3.7-plus' },
      { value: 'qwen3.7-max', label: 'qwen3.7-max' },
      { value: 'qwen-max', label: 'qwen-max' },
      { value: 'qwen3-max', label: 'qwen3-max' },
      { value: 'qwen3.5-plus', label: 'qwen3.5-plus' },
      { value: 'qwen-flash', label: 'qwen-flash' },
      { value: 'qwen-turbo', label: 'qwen-turbo' },
      { value: 'qwen-long', label: 'qwen-long' }
    ],
    custom: []
  }
};

/** 通义等模型 ID 需小写；纠正常见大小写错误 */
function normalizeAiModel(model, provider) {
  const m = String(model || '').trim();
  if (!m) return m;
  if (provider === 'qwen') return m.toLowerCase();
  return m;
}

/** 商品类别 → 分析用产品线（适配销货系统 42 类） */
function mapProductCategoryToLine(category) {
  const v = String(category || '').trim();
  if (!v) return '其他';
  if (/棒|bar|硬质合金/i.test(v)) return '硬质合金棒材';
  if (/刀柄|筒夹|刀杆|刀盘|拉钉|角度头|镗刀基础|面铣刀柄|ER筒夹|侧固式|精镗头|T型刀/i.test(v)) return '刀柄/工具系统';
  if (/配件|螺丝|螺帽|扳手|量具|修磨|刀垫|刀套/i.test(v)) return '配件及其他';
  return '切削刀具';
}

function resolveProductLine(productCode, productLineRaw) {
  if (productLineRaw && String(productLineRaw).trim()) {
    return mapProductCategoryToLine(productLineRaw);
  }
  const code = String(productCode || '').toUpperCase();
  for (const rule of APP_CONFIG.productSeriesRules) {
    if (code.startsWith(rule.prefix.toUpperCase())) return rule.line;
  }
  return '其他';
}

function resolveProductSeries(productCode) {
  const code = String(productCode || '').toUpperCase();
  for (const rule of APP_CONFIG.productSeriesRules) {
    if (code.startsWith(rule.prefix.toUpperCase())) return rule.series;
  }
  return '其他系列';
}

function generateMockData() {
  const categories = ['终端机加厂', '二级经销商', '航空航天', '通用制造', '模具行业'];
  const salespeople = ['张伟', '李娜', '王强', '刘洋', '陈静'];
  const products = [
    { code: 'M110-LN10', name: 'M110 铣刀 Pro', line: '切削刀具' },
    { code: 'AC152P-CNMG', name: 'AC152P 车削刀片', line: '切削刀具' },
    { code: 'AT210A-APKT', name: 'AT210A 金属陶瓷', line: '切削刀具' },
    { code: 'PA1-GT15', name: 'PA1 精加工槽型', line: '切削刀具' },
    { code: 'APE90-LN13', name: 'APE90 玉米铣刀', line: '切削刀具' },
    { code: 'BAR-D10-330', name: '棒材 D10', line: '硬质合金棒材' }
  ];
  const customers = Array.from({ length: 40 }, (_, i) => ({
    code: `C${String(i + 1).padStart(4, '0')}`,
    name: `客户${i + 1}有限公司`,
    category: categories[i % categories.length]
  }));
  const rows = [];
  const start = new Date('2025-06-01');
  for (let m = 0; m < 12; m++) {
    const monthDate = new Date(start.getFullYear(), start.getMonth() + m, 1);
    const transactions = 80 + Math.floor(Math.random() * 40);
    for (let t = 0; t < transactions; t++) {
      const day = 1 + Math.floor(Math.random() * 28);
      const d = new Date(monthDate.getFullYear(), monthDate.getMonth(), day);
      const cust = customers[Math.floor(Math.random() * customers.length)];
      const prod = products[Math.floor(Math.random() * products.length)];
      const sp = salespeople[Math.floor(Math.random() * salespeople.length)];
      const revenue = Math.round((500 + Math.random() * 15000) * 100) / 100;
      const marginRate = prod.line === '硬质合金棒材' ? 0.08 + Math.random() * 0.12 : 0.15 + Math.random() * 0.20;
      const cost = Math.round(revenue * (1 - marginRate) * 100) / 100;
      const grossProfit = Math.round((revenue - cost) * 100) / 100;
      const quantity = Math.max(1, Math.floor(Math.random() * 200) + 1);
      rows.push({
        salesDate: d.toISOString().slice(0, 10), salesperson: sp,
        customerCategory: cust.category, customerCode: cust.code, customerName: cust.name,
        productCode: prod.code, productName: prod.name, productLine: prod.line,
        quantity,
        unitPrice: Math.round(revenue / quantity * 10000) / 10000,
        unitCost: Math.round(cost / quantity * 10000) / 10000,
        revenue, cost, grossProfit, grossMargin: revenue ? grossProfit / revenue : 0
      });
    }
  }
  return rows;
}
