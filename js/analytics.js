/**
 * 销售数据聚合与分析引擎
 * 支持：KPI、同比环比、趋势、结构、帕累托、客户矩阵、HHI
 */
const SalesAnalytics = (() => {
  /* ── 格式化 ── */
  function formatMoney(v) {
    if (v == null || isNaN(v)) return '—';
    return Number(v).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function formatPct(v) {
    if (v == null || isNaN(v)) return '—';
    return `${(v * 100).toFixed(1)}%`;
  }
  function formatGrowth(v) {
    if (v == null || isNaN(v)) return '—';
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}%`;
  }
  function formatPP(v) {
    if (v == null || isNaN(v)) return '—';
    return `${v >= 0 ? '+' : ''}${(v * 100).toFixed(1)}pp`;
  }

  /* ── 筛选 ── */
  function filterRows(rows, filters = {}) {
    let result = [...rows];
    const range = expandMonthRange(filters.dateStart, filters.dateEnd);
    if (range.start) result = result.filter(r => r.salesDate >= range.start);
    if (range.end) result = result.filter(r => r.salesDate <= range.end);
    if (filters.salespeople?.length) result = result.filter(r => filters.salespeople.includes(r.salesperson));
    if (filters.categories?.length) result = result.filter(r => filters.categories.includes(r.customerCategory));
    if (filters.productLine && filters.productLine !== '全部') {
      result = result.filter(r => r.productLine === filters.productLine);
    }
    if (filters.customerSearch) {
      const q = filters.customerSearch.toLowerCase();
      if (filters.customerExact) {
        result = result.filter(r => r.customerCode === filters.customerExact);
      } else {
        result = result.filter(r =>
          r.customerCode.toLowerCase().includes(q) ||
          (r.customerName || '').toLowerCase().includes(q)
        );
      }
    }
    if (filters.productSearch) {
      const q = filters.productSearch.toLowerCase();
      if (filters.productExact) {
        result = result.filter(r => r.productCode === filters.productExact);
      } else {
        result = result.filter(r => r.productCode.toLowerCase().includes(q));
      }
    }
    return result;
  }

  function filtersWithoutDate(filters) {
    const { dateStart, dateEnd, ...rest } = filters;
    return rest;
  }

  /** 月份筛选 YYYY-MM → 当月首尾日期 YYYY-MM-DD */
  function expandMonthRange(monthStart, monthEnd) {
    let start = monthStart || '';
    let end = monthEnd || '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(start)) start = start.slice(0, 7);
    if (/^\d{4}-\d{2}-\d{2}$/.test(end)) end = end.slice(0, 7);
    if (start && start.length === 7) start = `${start}-01`;
    if (end && end.length === 7) {
      const [y, m] = end.split('-').map(Number);
      const lastDay = new Date(y, m, 0).getDate();
      end = `${end}-${String(lastDay).padStart(2, '0')}`;
    }
    return { start: start || null, end: end || null };
  }

  /* ── 基础聚合 ── */
  function sumMetrics(rows) {
    const revenue = rows.reduce((s, r) => s + (r.revenue || 0), 0);
    const cost = rows.reduce((s, r) => s + (r.cost || 0), 0);
    const grossProfit = rows.reduce((s, r) => s + (r.grossProfit || 0), 0);
    const grossMargin = revenue ? grossProfit / revenue : 0;
    const skuCount = new Set(rows.map(r => r.productCode)).size;
    const customerCount = new Set(rows.map(r => r.customerCode)).size;
    return {
      revenue, cost, grossProfit, grossMargin,
      count: rows.length,
      skuCount,
      customerCount,
      avgOrderProfit: rows.length ? grossProfit / rows.length : 0,
      avgCustomerRevenue: customerCount ? revenue / customerCount : 0
    };
  }

  function growthRate(current, previous) {
    if (previous == null || previous === 0) return null;
    return (current - previous) / Math.abs(previous);
  }

  function marginPP(current, previous) {
    if (previous == null || current == null) return null;
    return current - previous;
  }

  /* ── 时间周期 ── */
  function lastDayOfMonth(y, m) {
    return new Date(y, m, 0).getDate();
  }

  function periodKey(dateStr, granularity) {
    const [y, m] = dateStr.split('-').map(Number);
    if (granularity === 'year') return `${y}`;
    if (granularity === 'quarter') return `${y}-Q${Math.ceil(m / 3)}`;
    return `${y}-${String(m).padStart(2, '0')}`;
  }

  function periodRange(period, granularity) {
    if (granularity === 'year') {
      return { start: `${period}-01-01`, end: `${period}-12-31` };
    }
    if (granularity === 'quarter') {
      const [y, q] = period.split('-Q').map(Number);
      const sm = (q - 1) * 3 + 1;
      const em = sm + 2;
      return {
        start: `${y}-${String(sm).padStart(2, '0')}-01`,
        end: `${y}-${String(em).padStart(2, '0')}-${String(lastDayOfMonth(y, em)).padStart(2, '0')}`
      };
    }
    const [y, m] = period.split('-').map(Number);
    const ld = lastDayOfMonth(y, m);
    return {
      start: `${y}-${String(m).padStart(2, '0')}-01`,
      end: `${y}-${String(m).padStart(2, '0')}-${String(ld).padStart(2, '0')}`
    };
  }

  function shiftPeriod(period, granularity, delta) {
    if (granularity === 'year') return String(Number(period) + delta);
    if (granularity === 'quarter') {
      const [y, q] = period.split('-Q').map(Number);
      let nq = q + delta, ny = y;
      while (nq > 4) { nq -= 4; ny++; }
      while (nq < 1) { nq += 4; ny--; }
      return `${ny}-Q${nq}`;
    }
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function groupByPeriod(rows, granularity) {
    const map = new Map();
    rows.forEach(r => {
      const key = periodKey(r.salesDate, granularity);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    });
    return [...map.entries()]
      .sort((a, b) => sortPeriodKeys(a[0], b[0], granularity))
      .map(([period, items]) => ({ period, ...sumMetrics(items) }));
  }

  function sortPeriodKeys(a, b, granularity) {
    if (granularity === 'year') return Number(a) - Number(b);
    if (granularity === 'quarter') {
      const [ay, aq] = a.split('-Q').map(Number);
      const [by, bq] = b.split('-Q').map(Number);
      return ay !== by ? ay - by : aq - bq;
    }
    return a.localeCompare(b);
  }

  function rowsForPeriod(allRows, filters, period, granularity) {
    const range = periodRange(period, granularity);
    return filterRows(allRows, {
      ...filtersWithoutDate(filters),
      dateStart: range.start,
      dateEnd: range.end
    });
  }

  function formatPeriodLabel(range) {
    if (!range?.start || !range?.end) return null;
    const s = range.start.slice(0, 7);
    const e = range.end.slice(0, 7);
    return s === e ? s : `${s}~${e}`;
  }

  function countMonthsBetween(start, end) {
    const [sy, sm] = start.slice(0, 7).split('-').map(Number);
    const [ey, em] = end.slice(0, 7).split('-').map(Number);
    return (ey - sy) * 12 + (em - sm) + 1;
  }

  function shiftMonth(monthStr, delta) {
    const [y, m] = monthStr.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function shiftDateRangeByMonths(range, deltaMonths) {
    const startMonth = range.start.slice(0, 7);
    const endMonth = range.end.slice(0, 7);
    return expandMonthRange(
      shiftMonth(startMonth, -deltaMonths),
      shiftMonth(endMonth, -deltaMonths)
    );
  }

  function shiftDateRangeByYears(range, deltaYears) {
    const sy = Number(range.start.slice(0, 4)) + deltaYears;
    const ey = Number(range.end.slice(0, 4)) + deltaYears;
    return {
      start: `${sy}${range.start.slice(4)}`,
      end: `${ey}${range.end.slice(4)}`
    };
  }

  function metricsForPeriod(allRows, filters, period, granularity) {
    return sumMetrics(rowsForPeriod(allRows, filters, period, granularity));
  }

  function metricsForDateRange(allRows, filters, range) {
    return sumMetrics(filterRows(allRows, {
      ...filtersWithoutDate(filters),
      dateStart: range.start,
      dateEnd: range.end
    }));
  }

  /* ── KPI（含同比/环比） ── */
  function computeKPI(filtered, allRows, filters) {
    const current = sumMetrics(filtered);
    const range = expandMonthRange(filters.dateStart, filters.dateEnd);
    let mom = null;
    let yoy = null;
    let periodLabel = null;

    if (range.start && range.end) {
      periodLabel = formatPeriodLabel(range);
      const momRange = shiftDateRangeByMonths(range, 1);
      const yoyRange = shiftDateRangeByYears(range, -1);
      const momMetrics = metricsForDateRange(allRows, filters, momRange);
      const yoyMetrics = metricsForDateRange(allRows, filters, yoyRange);

      mom = momMetrics.count > 0 ? {
        revenue: growthRate(current.revenue, momMetrics.revenue),
        grossProfit: growthRate(current.grossProfit, momMetrics.grossProfit),
        grossMarginPP: marginPP(current.grossMargin, momMetrics.grossMargin),
        cost: growthRate(current.cost, momMetrics.cost),
        period: periodLabel,
        comparePeriod: formatPeriodLabel(momRange),
        compareMetrics: {
          revenue: momMetrics.revenue,
          cost: momMetrics.cost,
          grossProfit: momMetrics.grossProfit,
          grossMargin: momMetrics.grossMargin
        }
      } : null;

      yoy = yoyMetrics.count > 0 ? {
        revenue: growthRate(current.revenue, yoyMetrics.revenue),
        grossProfit: growthRate(current.grossProfit, yoyMetrics.grossProfit),
        grossMarginPP: marginPP(current.grossMargin, yoyMetrics.grossMargin),
        cost: growthRate(current.cost, yoyMetrics.cost),
        period: periodLabel,
        comparePeriod: formatPeriodLabel(yoyRange),
        compareMetrics: {
          revenue: yoyMetrics.revenue,
          cost: yoyMetrics.cost,
          grossProfit: yoyMetrics.grossProfit,
          grossMargin: yoyMetrics.grossMargin
        }
      } : null;
    }

    return {
      ...current,
      mom,
      yoy,
      costRatio: current.revenue ? current.cost / current.revenue : 0,
      periodLabel,
      latestPeriod: periodLabel
    };
  }

  /* ── 同比/环比明细表 ── */
  function computeComparison(filtered, allRows, filters) {
    const granularity = filters.granularity || 'month';
    const periods = groupByPeriod(filtered, granularity);
    const momDelta = granularity === 'year' ? -1 : granularity === 'quarter' ? -1 : -1;
    const yoyDelta = granularity === 'year' ? -1 : granularity === 'quarter' ? -4 : -12;

    return periods.map((p) => {
      const momPeriod = shiftPeriod(p.period, granularity, momDelta);
      const yoyPeriod = shiftPeriod(p.period, granularity, yoyDelta);

      const prevM = metricsForPeriod(allRows, filters, momPeriod, granularity);
      const yoyM = metricsForPeriod(allRows, filters, yoyPeriod, granularity);

      return {
        ...p,
        momRevenue: prevM.count > 0 ? growthRate(p.revenue, prevM.revenue) : null,
        momCost: prevM.count > 0 ? growthRate(p.cost, prevM.cost) : null,
        momGrossProfit: prevM.count > 0 ? growthRate(p.grossProfit, prevM.grossProfit) : null,
        momMarginPP: prevM.count > 0 ? marginPP(p.grossMargin, prevM.grossMargin) : null,
        momComparePeriod: prevM.count > 0 ? momPeriod : null,
        momCompareMetrics: prevM.count > 0 ? {
          revenue: prevM.revenue,
          cost: prevM.cost,
          grossProfit: prevM.grossProfit,
          grossMargin: prevM.grossMargin
        } : null,
        yoyRevenue: yoyM.count > 0 ? growthRate(p.revenue, yoyM.revenue) : null,
        yoyCost: yoyM.count > 0 ? growthRate(p.cost, yoyM.cost) : null,
        yoyGrossProfit: yoyM.count > 0 ? growthRate(p.grossProfit, yoyM.grossProfit) : null,
        yoyMarginPP: yoyM.count > 0 ? marginPP(p.grossMargin, yoyM.grossMargin) : null,
        yoyComparePeriod: yoyM.count > 0 ? yoyPeriod : null,
        yoyCompareMetrics: yoyM.count > 0 ? {
          revenue: yoyM.revenue,
          cost: yoyM.cost,
          grossProfit: yoyM.grossProfit,
          grossMargin: yoyM.grossMargin
        } : null
      };
    });
  }

  /* ── 趋势 ── */
  function computeTrend(filtered) {
    const monthly = groupByPeriod(filtered, 'month');

    const ma3 = monthly.map((p, i) => {
      const slice = monthly.slice(Math.max(0, i - 2), i + 1);
      const totalRev = slice.reduce((s, x) => s + x.revenue, 0);
      const totalGp = slice.reduce((s, x) => s + x.grossProfit, 0);
      return {
        period: p.period,
        maRevenue: totalRev / slice.length,
        maGrossProfit: totalGp / slice.length,
        maMargin: totalRev ? totalGp / totalRev : 0
      };
    });

    const bySp = new Map();
    filtered.forEach(r => {
      if (!bySp.has(r.salesperson)) bySp.set(r.salesperson, []);
      bySp.get(r.salesperson).push(r);
    });

    const spTrends = [...bySp.entries()]
      .map(([name, items]) => ({
        name,
        totalGP: sumMetrics(items).grossProfit,
        data: groupByPeriod(items, 'month').map(p => ({
          period: p.period,
          grossProfit: p.grossProfit,
          revenue: p.revenue
        }))
      }))
      .sort((a, b) => b.totalGP - a.totalGP)
      .slice(0, 5);

    return { monthly, ma3, spTrends };
  }

  /* ── 结构 ── */
  function groupByField(rows, field, labelField) {
    const map = new Map();
    rows.forEach(r => {
      const key = r[field] || '未知';
      if (!map.has(key)) map.set(key, { items: [], label: r[labelField] || key });
      map.get(key).items.push(r);
    });
    const totalGP = rows.reduce((s, r) => s + r.grossProfit, 0);
    const totalRev = rows.reduce((s, r) => s + r.revenue, 0);
    return [...map.entries()]
      .map(([name, { items, label }]) => ({
        name,
        label: labelField ? (items[0]?.[labelField] || label) : name,
        ...sumMetrics(items),
        revenueShare: totalRev ? items.reduce((s, r) => s + r.revenue, 0) / totalRev : 0,
        profitShare: totalGP ? items.reduce((s, r) => s + r.grossProfit, 0) / totalGP : 0
      }))
      .sort((a, b) => b.grossProfit - a.grossProfit);
  }

  function computeStructure(filtered) {
    return {
      byCategory: groupByField(filtered, 'customerCategory'),
      byProductLine: groupByField(filtered, 'productLine'),
      byProductCategory: groupByField(filtered, 'productCategory'),
      byProductName: groupByField(filtered, 'productName'),
      bySalesperson: groupByField(filtered, 'salesperson'),
      bySeries: groupByField(filtered, 'productSeries')
    };
  }

  function drilldownCategory(filtered, category, topN = 10) {
    const rows = filtered.filter(r => r.customerCategory === category);
    return groupByField(rows, 'customerCode', 'customerName').slice(0, topN);
  }

  /* ── 帕累托 ── */
  function computePareto(filtered, field, labelField, metric = 'grossProfit') {
    const groups = groupByField(filtered, field, labelField)
      .sort((a, b) => (b[metric] || 0) - (a[metric] || 0));
    const total = groups.reduce((s, g) => s + (g[metric] || 0), 0);
    let cumulative = 0;

    const items = groups.map(g => {
      const paretoValue = g[metric] || 0;
      cumulative += paretoValue;
      return {
        ...g,
        paretoValue,
        cumulativePareto: cumulative,
        cumulativePct: total ? cumulative / total : 0
      };
    });

    const cutoffIdx = items.findIndex(x => x.cumulativePct >= APP_CONFIG.thresholds.paretoRatio);
    const cutoffIndex = cutoffIdx >= 0 ? cutoffIdx + 1 : items.length;
    const tailValue = total - (items[cutoffIndex - 1]?.cumulativePareto || 0);

    return {
      items,
      metric,
      total,
      totalGP: total,
      totalCount: items.length,
      cutoffIndex,
      cutoffPct: items.length ? cutoffIndex / items.length : 0,
      tailCount: Math.max(0, items.length - cutoffIndex),
      tailValue: Math.max(0, tailValue),
      tailGP: Math.max(0, tailValue),
      top20: items.slice(0, 20)
    };
  }

  /* ── 客户矩阵 & HHI ── */
  function computeCustomerMatrix(filtered) {
    const customers = groupByField(filtered, 'customerCode', 'customerName');
    if (!customers.length) return [];
    const avgRev = customers.reduce((s, c) => s + c.revenue, 0) / customers.length;
    const avgMargin = customers.reduce((s, c) => s + c.grossMargin, 0) / customers.length;

    return customers.map(c => {
      let quadrant = '瘦狗';
      if (c.revenue >= avgRev && c.grossMargin >= avgMargin) quadrant = '明星';
      else if (c.revenue >= avgRev && c.grossMargin < avgMargin) quadrant = '金牛';
      else if (c.revenue < avgRev && c.grossMargin >= avgMargin) quadrant = '问题';
      return { ...c, quadrant, avgRev, avgMargin };
    });
  }

  function computeHHI(filtered) {
    const customers = groupByField(filtered, 'customerCode');
    const totalRev = customers.reduce((s, c) => s + c.revenue, 0);
    if (!totalRev) return 0;
    return customers.reduce((s, c) => s + Math.pow(c.revenue / totalRev, 2), 0);
  }

  function computeSalespersonStats(filtered) {
    const bySp = groupByField(filtered, 'salesperson');
    const avgMargin = bySp.length
      ? bySp.reduce((s, x) => s + x.grossMargin, 0) / bySp.length
      : 0;
    const margins = bySp.map(x => x.grossMargin);
    const mean = margins.length ? margins.reduce((a, b) => a + b, 0) / margins.length : 0;
    const variance = margins.length
      ? margins.reduce((s, m) => s + Math.pow(m - mean, 2), 0) / margins.length
      : 0;
    return {
      bySalesperson: bySp,
      avgMargin,
      marginStdDev: Math.sqrt(variance),
      perCapitaProfit: bySp.length
        ? bySp.reduce((s, x) => s + x.grossProfit, 0) / bySp.length
        : 0
    };
  }

  /* ── 异常检测 ── */
  function detectAnomalies(filtered, kpi) {
    const lowMarginCustomers = groupByField(filtered, 'customerCode', 'customerName')
      .filter(c => c.revenue > 5000 && c.grossMargin < kpi.grossMargin - 0.08)
      .slice(0, 5);

    const lowMarginProducts = groupByField(filtered, 'productCode', 'productName')
      .filter(p => p.revenue > 3000 && p.grossMargin < kpi.grossMargin - 0.08)
      .slice(0, 5);

    return {
      negativeProfit: filtered.filter(r => r.grossProfit < 0)
        .sort((a, b) => a.grossProfit - b.grossProfit)
        .slice(0, 10),
      zeroCost: filtered.filter(r => r.cost === 0 && r.revenue > 0).slice(0, 10),
      lowMarginCustomers,
      lowMarginProducts
    };
  }

  /* ── 汇总摘要（供 AI 使用） ── */
  function buildSummary(filtered, allRows, filters) {
    const kpi = computeKPI(filtered, allRows, filters);
    const structure = computeStructure(filtered);
    const paretoCustomer = computePareto(filtered, 'customerCode', 'customerName', 'grossProfit');
    const paretoProduct = computePareto(filtered, 'productCode', null, 'grossProfit');
    const revParetoCustomer = computePareto(filtered, 'customerCode', 'customerName', 'revenue');
    const revParetoProduct = computePareto(filtered, 'productCode', null, 'revenue');
    const matrix = computeCustomerMatrix(filtered);
    const spStats = computeSalespersonStats(filtered);

    const topCustomer = paretoCustomer.items[0];
    const topCustomerShare = topCustomer && kpi.revenue
      ? topCustomer.revenue / kpi.revenue
      : 0;

    return {
      kpi,
      structure,
      pareto: {
        profit: { customer: paretoCustomer, product: paretoProduct },
        revenue: { customer: revParetoCustomer, product: revParetoProduct },
        customer: paretoCustomer,
        product: paretoProduct
      },
      matrix: {
        all: matrix,
        stars: matrix.filter(c => c.quadrant === '明星').length,
        cows: matrix.filter(c => c.quadrant === '金牛').length,
        questions: matrix.filter(c => c.quadrant === '问题').length,
        dogs: matrix.filter(c => c.quadrant === '瘦狗').length
      },
      hhi: computeHHI(filtered),
      spStats,
      anomalies: detectAnomalies(filtered, kpi),
      topCustomerShare,
      rowCount: filtered.length,
      dateRange: filtered.length ? {
        min: filtered.reduce((m, r) => r.salesDate < m ? r.salesDate : m, filtered[0].salesDate),
        max: filtered.reduce((m, r) => r.salesDate > m ? r.salesDate : m, filtered[0].salesDate)
      } : null
    };
  }

  function getFilterOptions(rows) {
    return {
      salespeople: [...new Set(rows.map(r => r.salesperson))].sort(),
      categories: [...new Set(rows.map(r => r.customerCategory))].sort(),
      productLines: ['全部', ...new Set(rows.map(r => r.productLine))].sort()
    };
  }

  /* ── 主入口 ── */
  function analyze(rows, filters = {}) {
    const filtered = filterRows(rows, filters);
    const granularity = filters.granularity || 'month';
    const f = { ...filters, granularity };

    return {
      filtered,
      kpi: computeKPI(filtered, rows, f),
      comparison: computeComparison(filtered, rows, f),
      trend: computeTrend(filtered),
      structure: computeStructure(filtered),
      pareto: {
        profit: {
          customer: computePareto(filtered, 'customerCode', 'customerName', 'grossProfit'),
          product: computePareto(filtered, 'productCode', null, 'grossProfit')
        },
        revenue: {
          customer: computePareto(filtered, 'customerCode', 'customerName', 'revenue'),
          product: computePareto(filtered, 'productCode', null, 'revenue')
        }
      },
      summary: buildSummary(filtered, rows, f),
      options: getFilterOptions(rows)
    };
  }

  return {
    analyze,
    filterRows,
    sumMetrics,
    computeKPI,
    computeComparison,
    computeTrend,
    computeStructure,
    computePareto,
    computeCustomerMatrix,
    computeHHI,
    buildSummary,
    getFilterOptions,
    drilldownCategory,
    formatMoney,
    formatPct,
    formatGrowth,
    formatPP,
    groupByPeriod,
    periodKey
  };
})();
