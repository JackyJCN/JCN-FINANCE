/**
 * ECharts 图表封装 + 明细表
 */
const DashboardCharts = (() => {
  let charts = { main: null, secondary: null };
  let state = {
    activeTab: 'compare',
    analysis: null,
    rows: [],
    filters: {},
    detailSort: { field: 'salesDate', dir: 'desc' },
    detailPage: 1,
    pageSize: 20
  };

  const COLORS = ['#2563eb', '#16a34a', '#ca8a04', '#dc2626', '#7c3aed', '#0891b2', '#ea580c'];

  function isDark() {
    return document.documentElement.getAttribute('data-theme') === 'dark';
  }

  function themeColors() {
    const dark = isDark();
    return {
      text: dark ? '#8b95a5' : '#7a8494',
      axis: dark ? 'rgba(255,255,255,0.12)' : '#babecc',
      split: dark ? 'rgba(255,255,255,0.06)' : 'rgba(163,177,198,0.35)',
      bg: 'transparent'
    };
  }

  function formatWanLabel(value) {
    if (value == null || isNaN(value)) return '';
    return `${(value / 10000).toFixed(2)}万`;
  }

  function formatPctLabel(value, digits = 1) {
    if (value == null || isNaN(value)) return '';
    return `${(value * 100).toFixed(digits)}%`;
  }

  function barSeriesLabel(accentColor) {
    const dark = isDark();
    return {
      show: true,
      position: 'top',
      distance: 6,
      fontSize: 11,
      fontWeight: 600,
      color: dark ? '#d8dee9' : '#3d4852',
      backgroundColor: dark ? 'rgba(26, 32, 40, 0.92)' : 'rgba(224, 229, 236, 0.95)',
      borderColor: accentColor,
      borderWidth: 1,
      borderRadius: 4,
      padding: [2, 5],
      formatter: (p) => formatWanLabel(p.value)
    };
  }

  function lineSeriesLabel(accentColor) {
    const dark = isDark();
    return {
      show: true,
      position: 'top',
      distance: 8,
      fontSize: 11,
      fontWeight: 600,
      color: dark ? '#fef3c7' : '#92400e',
      backgroundColor: dark ? 'rgba(120, 53, 15, 0.85)' : 'rgba(255, 251, 235, 0.95)',
      borderColor: accentColor,
      borderWidth: 1,
      borderRadius: 4,
      padding: [2, 5],
      formatter: (p) => formatPctLabel(p.value)
    };
  }

  function baseOption() {
    const c = themeColors();
    return {
      backgroundColor: c.bg,
      textStyle: { color: c.text, fontFamily: 'Segoe UI, PingFang SC, Microsoft YaHei, sans-serif' },
      grid: { left: 56, right: 56, top: 48, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: isDark() ? '#1a2028' : '#e0e5ec',
        borderColor: isDark() ? 'rgba(255,255,255,0.08)' : '#babecc',
        borderWidth: 1,
        extraCssText: isDark()
          ? 'box-shadow: 8px 8px 16px rgba(0,0,0,0.45), -4px -4px 12px rgba(255,255,255,0.04); border-radius: 12px;'
          : 'box-shadow: 6px 6px 12px #a3b1c6, -4px -4px 10px #ffffff; border-radius: 12px;',
        textStyle: { color: isDark() ? '#d8dee9' : '#3d4852' }
      },
      legend: { textStyle: { color: c.text }, top: 4 }
    };
  }

  function getChart(el) {
    if (!el) return null;
    let inst = echarts.getInstanceByDom(el);
    if (!inst) inst = echarts.init(el);
    return inst;
  }

  function resizeCharts() {
    requestAnimationFrame(() => {
      charts.main?.resize();
      charts.secondary?.resize();
    });
  }

  function disposeCharts() {
    ['chartMain', 'chartSecondary'].forEach(id => {
      const el = document.getElementById(id);
      const inst = el && echarts.getInstanceByDom(el);
      if (inst) inst.dispose();
    });
    charts = { main: null, secondary: null };
  }

  function init() {
    window.addEventListener('resize', () => {
      charts.main?.resize();
      charts.secondary?.resize();
    });

    document.querySelectorAll('.tab-bar .tab').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-bar .tab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.activeTab = btn.dataset.tab;
        updateTabControls();
        renderActiveTab();
      });
    });

    document.getElementById('filterGranularity')?.addEventListener('change', () => {
      if (typeof App !== 'undefined') App.refreshDashboard();
    });
    document.getElementById('filterCompareMode')?.addEventListener('change', () => renderActiveTab());
    document.getElementById('filterParetoDim')?.addEventListener('change', () => renderActiveTab());
    ['metricRevenue', 'metricProfit', 'metricMargin'].forEach(id => {
      document.getElementById(id)?.addEventListener('change', () => renderActiveTab());
    });

    updateTabControls();
  }

  function updateTabControls() {
    const gran = document.getElementById('granularityWrap');
    const compareMode = document.getElementById('compareModeWrap');
    const compareMetrics = document.getElementById('compareMetricsWrap');
    const pareto = document.getElementById('paretoDimWrap');
    const table = document.getElementById('compareTableWrap');
    if (gran) gran.classList.toggle('hidden', state.activeTab !== 'compare');
    if (compareMode) compareMode.classList.toggle('hidden', state.activeTab !== 'compare');
    if (compareMetrics) compareMetrics.classList.toggle('hidden', state.activeTab !== 'compare');
    if (pareto) pareto.classList.toggle('hidden', state.activeTab !== 'pareto');
    if (table) table.style.display = ['compare', 'pareto'].includes(state.activeTab) ? '' : 'none';
    document.getElementById('chartSecondary').style.display =
      ['trend', 'structure', 'pareto'].includes(state.activeTab) ? '' : 'none';
    if (state.activeTab !== 'pareto') {
      resetChartBoxHeight('chartMain');
      resetChartBoxHeight('chartSecondary');
      resizeCharts();
    }
  }

  function resetChartBoxHeight(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.style.height = '';
    el.style.minHeight = '';
  }

  function paretoChartHeight(itemCount) {
    return Math.max(420, Math.min(900, 300 + itemCount * 14));
  }

  function getCompareMode() {
    return document.getElementById('filterCompareMode')?.value || state.filters?.compareMode || 'mom';
  }

  function formatCompareTooltip(cmp, cmpLabel) {
    if (!cmp?.compareMetrics || !cmp.comparePeriod) return '';
    const m = cmp.compareMetrics;
    const fmt = SalesAnalytics;
    return [
      `${cmpLabel}对比期 ${cmp.comparePeriod}`,
      `收入 ${fmt.formatMoney(m.revenue)}`,
      `成本 ${fmt.formatMoney(m.cost)}`,
      `毛利 ${fmt.formatMoney(m.grossProfit)}`,
      `毛利率 ${fmt.formatPct(m.grossMargin)}`
    ].join('\n');
  }

  function refreshKPI(k, filters) {
    const fmt = SalesAnalytics;
    const mode = filters?.compareMode || getCompareMode();
    const cmp = mode === 'yoy' ? k.yoy : k.mom;
    const cmpLabel = mode === 'yoy' ? '同比' : '环比';
    const periodLabel = k.periodLabel || k.latestPeriod;
    const compareTip = formatCompareTooltip(cmp, cmpLabel);

    document.getElementById('kpiRevenue').textContent = fmt.formatMoney(k.revenue);
    document.getElementById('kpiCost').textContent = fmt.formatMoney(k.cost);
    document.getElementById('kpiProfit').textContent = fmt.formatMoney(k.grossProfit);
    document.getElementById('kpiMargin').textContent = fmt.formatPct(k.grossMargin);

    const cmpSub = (field, isMargin) => {
      if (!cmp) {
        return '—' + (periodLabel ? '<span class="muted">（无对比数据）</span>' : '');
      }
      const num = isMargin ? cmp.grossMarginPP : cmp[field];
      const v = isMargin ? fmt.formatPP(cmp.grossMarginPP) : fmt.formatGrowth(cmp[field]);
      const periodHint = cmp.comparePeriod ? ` vs ${cmp.comparePeriod}` : '';
      return `<span class="muted">(${periodLabel}${periodHint})</span> ${cmpLabel} <span class="${num >= 0 ? 'up' : 'down'}">${v}</span>`;
    };

    document.getElementById('kpiCostSub').innerHTML = cmpSub('cost', false);

    document.getElementById('kpiRevenueSub').innerHTML = cmpSub('revenue', false);
    document.getElementById('kpiProfitSub').innerHTML = cmpSub('grossProfit', false);
    document.getElementById('kpiMarginSub').innerHTML = cmpSub('revenue', true);

    ['kpiRevenue', 'kpiCost', 'kpiProfit', 'kpiMargin'].forEach(id => {
      const card = document.getElementById(id)?.closest('.kpi-card');
      if (card) {
        if (compareTip) card.setAttribute('title', compareTip);
        else card.removeAttribute('title');
      }
    });
  }

  function shiftPeriodLabel(period, granularity, forYoy) {
    if (forYoy) {
      if (granularity === 'year') return String(Number(period) - 1);
      if (granularity === 'quarter') {
        const [y, q] = period.split('-Q').map(Number);
        return `${y - 1}-Q${q}`;
      }
      const [y, m] = period.split('-').map(Number);
      const d = new Date(y, m - 13, 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    }
    if (granularity === 'year') return String(Number(period) - 1);
    if (granularity === 'quarter') {
      const [y, q] = period.split('-Q').map(Number);
      let nq = q - 1, ny = y;
      if (nq < 1) { nq = 4; ny--; }
      return `${ny}-Q${nq}`;
    }
    const [y, m] = period.split('-').map(Number);
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  function getCompareMetrics() {
    return {
      revenue: document.getElementById('metricRevenue')?.checked !== false,
      profit: document.getElementById('metricProfit')?.checked !== false,
      margin: document.getElementById('metricMargin')?.checked !== false
    };
  }

  /* ── 同比环比 ── */
  function renderCompare(analysis) {
    const data = analysis.comparison;
    const mode = getCompareMode();
    const isMom = mode === 'mom';
    const cmpLabel = isMom ? '环比' : '同比';
    const metrics = getCompareMetrics();
    const el = document.getElementById('chartMain');
    charts.main = getChart(el);
    const periods = data.map(d => d.period);
    const c = themeColors();

    const series = [];
    const showAmount = metrics.revenue || metrics.profit;
    let marginAxisIndex = 0;

    if (metrics.revenue) {
      series.push({
        name: '收入', type: 'bar',
        data: data.map(d => d.revenue),
        itemStyle: { color: COLORS[0] },
        label: barSeriesLabel(COLORS[0])
      });
    }
    if (metrics.profit) {
      series.push({
        name: '毛利', type: 'bar',
        data: data.map(d => d.grossProfit),
        itemStyle: { color: COLORS[1] },
        label: barSeriesLabel(COLORS[1])
      });
    }
    if (metrics.margin) {
      marginAxisIndex = showAmount ? 1 : 0;
      series.push({
        name: '毛利率', type: 'line', yAxisIndex: marginAxisIndex,
        data: data.map(d => d.grossMargin),
        itemStyle: { color: COLORS[2] },
        lineStyle: { color: COLORS[2] },
        smooth: true,
        label: lineSeriesLabel(COLORS[2])
      });
    }

    const yAxis = [];
    if (showAmount) {
      yAxis.push({ type: 'value', name: '金额', axisLabel: { formatter: v => (v / 10000).toFixed(0) + '万' }, splitLine: { lineStyle: { color: c.split } } });
    }
    if (metrics.margin) {
      yAxis.push({
        type: 'value', name: '毛利率',
        axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' },
        min: 0, max: 0.6, splitLine: { show: false }
      });
    }

    charts.main.setOption({
      ...baseOption(),
      grid: { left: 56, right: 56, top: 56, bottom: 40, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          const idx = params[0]?.dataIndex;
          const row = data[idx];
          if (!row) return '';
          const fmt = SalesAnalytics;
          const cp = isMom ? row.momComparePeriod : row.yoyComparePeriod;
          const cr = isMom ? row.momRevenue : row.yoyRevenue;
          const cc = isMom ? row.momCost : row.yoyCost;
          const cgp = isMom ? row.momGrossProfit : row.yoyGrossProfit;
          const marginDelta = isMom ? row.momMarginPP : row.yoyMarginPP;
          const compareM = isMom ? row.momCompareMetrics : row.yoyCompareMetrics;
          let html = `<strong>${row.period}</strong><br/>
            收入：${fmt.formatMoney(row.revenue)}<br/>
            成本：${fmt.formatMoney(row.cost)}<br/>
            毛利：${fmt.formatMoney(row.grossProfit)}<br/>
            毛利率：${fmt.formatPct(row.grossMargin)}`;
          if (cp && compareM) {
            html += `<br/><span style="opacity:.85">对比期 ${cp}</span><br/>
              对比收入：${fmt.formatMoney(compareM.revenue)}<br/>
              对比成本：${fmt.formatMoney(compareM.cost)}<br/>
              对比毛利：${fmt.formatMoney(compareM.grossProfit)}<br/>
              对比毛利率：${fmt.formatPct(compareM.grossMargin)}<br/>
              ${cmpLabel}收入：${fmt.formatGrowth(cr)}<br/>
              ${cmpLabel}成本：${fmt.formatGrowth(cc)}<br/>
              ${cmpLabel}毛利：${fmt.formatGrowth(cgp)}<br/>
              ${cmpLabel}毛利率：${fmt.formatPP(marginDelta)}`;
          }
          return html;
        }
      },
      xAxis: { type: 'category', data: periods, axisLine: { lineStyle: { color: c.axis } } },
      yAxis,
      series
    }, true);

    renderCompareTable(data, mode);
    document.getElementById('chartSecondary').style.display = 'none';
    charts.secondary?.clear();
    resizeCharts();
  }

  function renderCompareTable(data, mode) {
    const fmt = SalesAnalytics;
    const isMom = (mode || getCompareMode()) === 'mom';
    const label = isMom ? '环比' : '同比';
    const wrap = document.getElementById('compareTableWrap');
    if (!wrap) return;
    wrap.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>周期</th><th class="num">收入</th><th class="num">成本</th><th class="num">毛利</th><th class="num">毛利率</th>
        <th class="num">对比期</th>
        <th class="num">${label}收入</th><th class="num">${label}成本</th><th class="num">${label}毛利</th><th class="num">${label}毛利率</th>
      </tr></thead>
      <tbody>${data.map(d => {
        const cp = isMom ? d.momComparePeriod : d.yoyComparePeriod;
        return `<tr>
        <td>${d.period}</td>
        <td class="num">${fmt.formatMoney(d.revenue)}</td>
        <td class="num">${fmt.formatMoney(d.cost)}</td>
        <td class="num">${fmt.formatMoney(d.grossProfit)}</td>
        <td class="num">${fmt.formatPct(d.grossMargin)}</td>
        <td>${cp || '—'}</td>
        <td class="num">${fmt.formatGrowth(isMom ? d.momRevenue : d.yoyRevenue)}</td>
        <td class="num">${fmt.formatGrowth(isMom ? d.momCost : d.yoyCost)}</td>
        <td class="num">${fmt.formatGrowth(isMom ? d.momGrossProfit : d.yoyGrossProfit)}</td>
        <td class="num">${fmt.formatPP(isMom ? d.momMarginPP : d.yoyMarginPP)}</td>
      </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  /* ── 趋势 ── */
  function renderTrend(analysis) {
    const { monthly, ma3, spTrends } = analysis.trend;
    const el = document.getElementById('chartMain');
    const el2 = document.getElementById('chartSecondary');
    charts.main = getChart(el);
    charts.secondary = getChart(el2);
    const periods = monthly.map(d => d.period);
    const c = themeColors();
    const maMap = Object.fromEntries(ma3.map(m => [m.period, m]));

    charts.main.setOption({
      ...baseOption(),
      title: {
        text: '月度经营趋势',
        left: 'center',
        top: 4,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      legend: { textStyle: { color: c.text }, top: 32, left: 'center' },
      grid: { left: 72, right: 56, top: 72, bottom: 48, containLabel: true },
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          const idx = params[0]?.dataIndex;
          const row = monthly[idx];
          if (!row) return '';
          const fmt = SalesAnalytics;
          let html = `<strong>${row.period}</strong><br/>`;
          params.forEach(p => {
            if (p.value == null || p.value === '') return;
            if (p.seriesName === '毛利率') {
              html += `${p.marker}${p.seriesName}：${fmt.formatPct(p.value)}<br/>`;
            } else {
              html += `${p.marker}${p.seriesName}：${fmt.formatMoney(p.value)}<br/>`;
            }
          });
          return html;
        }
      },
      xAxis: { type: 'category', data: periods, axisLine: { lineStyle: { color: c.axis } } },
      yAxis: [
        {
          type: 'value', name: '收入', axisLabel: { formatter: v => (v / 10000).toFixed(0) + '万' },
          splitLine: { lineStyle: { color: c.split } }
        },
        {
          type: 'value', name: '毛利', position: 'left', offset: 64,
          axisLabel: { formatter: v => (v / 10000).toFixed(0) + '万' },
          splitLine: { show: false }
        },
        {
          type: 'value', name: '毛利率', position: 'right',
          axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' },
          min: 0, max: 0.6, splitLine: { show: false }
        }
      ],
      series: [
        { name: '收入', type: 'line', yAxisIndex: 0, data: monthly.map(d => d.revenue), smooth: true, itemStyle: { color: COLORS[0] } },
        { name: '毛利', type: 'line', yAxisIndex: 1, data: monthly.map(d => d.grossProfit), smooth: true, itemStyle: { color: COLORS[1] } },
        { name: '毛利率', type: 'line', yAxisIndex: 2, data: monthly.map(d => d.grossMargin), smooth: true, itemStyle: { color: COLORS[2] } },
        {
          name: '近3月收入均线', type: 'line', yAxisIndex: 0, lineStyle: { type: 'dashed' },
          data: periods.map(p => maMap[p]?.maRevenue),
          itemStyle: { color: COLORS[0] }, opacity: 0.5
        }
      ]
    }, true);

    charts.secondary.setOption({
      ...baseOption(),
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          const fmt = SalesAnalytics;
          const period = params[0]?.axisValue;
          let html = period ? `<strong>${period}</strong><br/>` : '';
          params.forEach(p => {
            if (p.value == null) return;
            html += `${p.marker}${p.seriesName}：${fmt.formatMoney(p.value)}<br/>`;
          });
          return html;
        }
      },
      title: {
        text: '业务员毛利趋势',
        left: 'center',
        top: 4,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 }
      },
      legend: { textStyle: { color: c.text }, top: 32, left: 'center' },
      grid: { left: 56, right: 24, top: 72, bottom: 40, containLabel: true },
      xAxis: { type: 'category', data: periods, axisLine: { lineStyle: { color: c.axis } } },
      yAxis: {
        type: 'value',
        name: '毛利',
        axisLabel: { formatter: v => (v / 10000).toFixed(0) + '万' },
        splitLine: { lineStyle: { color: c.split } }
      },
      series: spTrends.map((sp, i) => {
        const map = Object.fromEntries(sp.data.map(d => [d.period, d.grossProfit]));
        return { name: sp.name, type: 'line', smooth: true, data: periods.map(p => map[p] ?? null), itemStyle: { color: COLORS[i % COLORS.length] } };
      })
    }, true);
    resizeCharts();
  }

  function truncateLabel(text, maxLen = 12) {
    const s = String(text || '');
    return s.length > maxLen ? `${s.slice(0, maxLen)}…` : s;
  }

  /** 子母饼图数据：主饼 Top N + 其他区域，子饼展开其余明细 */
  function buildPieOfPie(items, topMain = 4, maxSub = 7) {
    const sorted = [...items]
      .map(d => ({
        name: (d.name || d.label || '未命名').trim() || '未命名',
        value: Math.max(0, d.grossProfit)
      }))
      .filter(d => d.value > 0)
      .sort((a, b) => b.value - a.value);

    if (!sorted.length) return { main: [], sub: [], hasSub: false, otherIndex: -1, startAngle: 90 };

    const mainColors = ['#00695c', '#00897b', '#009688', '#26a69a'];
    const otherColor = isDark() ? '#475569' : '#d4f0ec';
    const subColors = ['#00a896', '#02b3a0', '#2dbfa8', '#4ecbb5', '#6fd7c2', '#90e3cf', '#b1efdc', '#c9f5ea'];

    const mainTop = sorted.slice(0, topMain);
    const rest = sorted.slice(topMain);
    const otherVal = rest.reduce((s, d) => s + d.value, 0);

    const main = mainTop.map((d, i) => ({
      name: truncateLabel(d.name, 8),
      fullName: d.name,
      value: d.value,
      itemStyle: { color: mainColors[i % mainColors.length] }
    }));
    let otherIndex = -1;
    if (otherVal > 0) {
      otherIndex = main.length;
      main.push({
        name: '其他区域',
        fullName: `其余 ${rest.length} 项`,
        value: otherVal,
        itemStyle: { color: otherColor }
      });
    }

    const subItems = rest.slice(0, maxSub);
    const subOther = rest.slice(maxSub).reduce((s, d) => s + d.value, 0);
    const sub = subItems.map((d, i) => ({
      name: truncateLabel(d.name, 7),
      fullName: d.name,
      value: d.value,
      itemStyle: { color: subColors[i % subColors.length] }
    }));
    if (subOther > 0) {
      sub.push({
        name: '其余',
        fullName: `其余 ${rest.length - maxSub} 项`,
        value: subOther,
        itemStyle: { color: isDark() ? '#64748b' : '#e8f8f5' }
      });
    }

    return {
      main,
      sub,
      hasSub: sub.length > 0,
      otherIndex,
      startAngle: calcStartAngleForOtherRight(main, otherIndex)
    };
  }

  /** 旋转主饼，使「其他区域」扇区中心落在右侧（3 点钟方向） */
  function calcStartAngleForOtherRight(data, otherIndex) {
    const total = data.reduce((s, d) => s + d.value, 0);
    if (total <= 0 || otherIndex < 0) return 90;
    let sumBefore = 0;
    for (let i = 0; i < otherIndex; i++) sumBefore += data[i].value;
    const midArc = ((sumBefore + data[otherIndex].value / 2) / total) * 360;
    return midArc;
  }

  function formatPieMoney(value) {
    if (value == null || isNaN(value)) return '0';
    const abs = Math.abs(value);
    if (abs >= 100000000) return `${(value / 100000000).toFixed(2)}亿`;
    if (abs >= 10000) return `${(value / 10000).toFixed(2)}万`;
    return `${value.toFixed(0)}`;
  }

  function refPieOutsideLabel({ fontSize = 11, pctDigits = 1, totalBase = null } = {}) {
    const textColor = isDark() ? '#e2e8f0' : '#1e293b';
    return {
      show: true,
      position: 'outside',
      alignTo: 'none',
      bleedMargin: 10,
      distanceToLabelLine: 5,
      fontSize,
      fontWeight: 600,
      color: textColor,
      lineHeight: Math.round(fontSize * 1.35),
      formatter(p) {
        const name = p.data?.fullName || p.name;
        const base = totalBase != null ? totalBase : (p.data?.totalBase ?? null);
        let pct;
        if (base && base > 0) {
          pct = (p.value / base * 100).toFixed(pctDigits);
        } else {
          pct = p.percent != null ? p.percent.toFixed(pctDigits) : (0).toFixed(pctDigits);
        }
        return `${name}\n${formatPieMoney(p.value)}\n${pct}%`;
      }
    };
  }

  function refPieLabelLine() {
    return {
      show: true,
      length: 18,
      length2: 14,
      smooth: false,
      lineStyle: { color: isDark() ? '#64748b' : '#475569', width: 1 }
    };
  }

  function getPieSectorShape(chart, seriesIndex, dataIndex) {
    const series = chart.getModel().getSeriesByIndex(seriesIndex);
    if (!series) return null;
    const el = series.getData().getItemGraphicEl(dataIndex);
    if (el?.shape) return el.shape;
    return series.getData().getItemLayout(dataIndex) || null;
  }

  function sectorEdgePoint(shape, edge) {
    const angle = edge === 'start' ? shape.startAngle : shape.endAngle;
    const cw = shape.clockwise !== false;
    const a = cw ? -angle : angle;
    return [shape.cx + Math.cos(a) * shape.r, shape.cy + Math.sin(a) * shape.r];
  }

  /** 引导线：扇区上角→子饼顶、下角→子饼底，按 Y 坐标配对避免交叉 */
  function buildPieOfPieConnectors(chart, otherDataIndex) {
    const mainShape = getPieSectorShape(chart, 0, otherDataIndex);
    const subShape = getPieSectorShape(chart, 1, 0);
    if (!mainShape || !subShape) return [];

    const pA = sectorEdgePoint(mainShape, 'start');
    const pB = sectorEdgePoint(mainShape, 'end');
    const [pTop, pBottom] = pA[1] <= pB[1] ? [pA, pB] : [pB, pA];

    const { cx: sx, cy: sy, r: sr } = subShape;
    const subTop = [sx, sy - sr];
    const subBottom = [sx, sy + sr];
    const stroke = isDark() ? '#64748b' : '#374151';

    return [
      {
        type: 'line',
        z: 10,
        shape: { x1: pTop[0], y1: pTop[1], x2: subTop[0], y2: subTop[1] },
        style: { stroke, lineWidth: 1.5 }
      },
      {
        type: 'line',
        z: 10,
        shape: { x1: pBottom[0], y1: pBottom[1], x2: subBottom[0], y2: subBottom[1] },
        style: { stroke, lineWidth: 1.5 }
      }
    ];
  }

  function bindPieOfPieConnectors(chart, otherDataIndex) {
    const update = () => {
      requestAnimationFrame(() => {
        const g = buildPieOfPieConnectors(chart, otherDataIndex);
        chart.setOption({ graphic: g }, { replaceMerge: ['graphic'] });
      });
    };
    if (chart._pieConnectorUpdate) chart.off('finished', chart._pieConnectorUpdate);
    chart._pieConnectorUpdate = update;
    chart.on('finished', update);
    update();
  }

  function insidePieLabel(fmt, fontSize = 11) {
    return {
      position: 'inside',
      color: '#fff',
      fontSize,
      fontWeight: 600,
      lineHeight: fontSize + 4,
      formatter(p) {
        const pct = p.percent != null ? p.percent.toFixed(1) : '0.0';
        return `${p.name}\n${fmt.formatMoney(p.value)}\n${pct}%`;
      }
    };
  }

  function pieInsideLabel(fmt, { fontSize = 10, withValue = false } = {}) {
    return refPieOutsideLabel({ fontSize, pctDigits: withValue ? 1 : 0 });
  }

  /* ── 结构 ── */
  function renderStructure(analysis) {
    const st = analysis.structure;
    const el = document.getElementById('chartMain');
    const el2 = document.getElementById('chartSecondary');
    charts.main = getChart(el);
    charts.secondary = getChart(el2);
    const c = themeColors();
    const fmt = SalesAnalytics;

    const cats = st.byCategory;
    const revenuePalette = ['#2563eb', '#38bdf8', '#6366f1', '#818cf8'];
    const profitPalette = ['#059669', '#34d399', '#d97706', '#fbbf24'];
    const revenueColor = (name) => {
      const i = cats.findIndex(d => d.name === name);
      return revenuePalette[(i >= 0 ? i : 0) % revenuePalette.length];
    };
    const profitColor = (name) => {
      const i = cats.findIndex(d => d.name === name);
      return profitPalette[(i >= 0 ? i : 0) % profitPalette.length];
    };
    const categoryPieLabel = refPieOutsideLabel({ fontSize: 13, pctDigits: 1 });
    const catPieLeft = '25%';
    const catPieRight = '75%';
    const catPieY = '56%';

    charts.main.setOption({
      ...baseOption(),
      title: [
        {
          text: '客户类别',
          textStyle: { color: isDark() ? '#e2e8f0' : '#1e293b', fontSize: 18, fontWeight: 700 },
          left: 'center',
          top: 8
        },
        {
          text: '收入',
          left: catPieLeft,
          top: 38,
          textAlign: 'center',
          padding: [5, 18],
          backgroundColor: isDark() ? 'rgba(37,99,235,0.35)' : 'rgba(37,99,235,0.12)',
          borderColor: '#2563eb',
          borderWidth: 1,
          borderRadius: 4,
          textStyle: { color: isDark() ? '#93c5fd' : '#1d4ed8', fontSize: 14, fontWeight: 'bold' }
        },
        {
          text: '毛利',
          left: catPieRight,
          top: 38,
          textAlign: 'center',
          padding: [5, 18],
          backgroundColor: isDark() ? 'rgba(5,150,105,0.35)' : 'rgba(5,150,105,0.12)',
          borderColor: '#059669',
          borderWidth: 1,
          borderRadius: 4,
          textStyle: { color: isDark() ? '#6ee7b7' : '#047857', fontSize: 14, fontWeight: 'bold' }
        }
      ],
      legend: { show: false },
      tooltip: {
        trigger: 'item',
        formatter(p) {
          const pct = p.percent != null ? p.percent.toFixed(1) : '0.0';
          return `<strong>${p.seriesName}</strong> · ${p.name}<br/>${fmt.formatMoney(p.value)}（${pct}%）`;
        }
      },
      series: [
        {
          name: '收入',
          type: 'pie',
          radius: ['0%', '50%'],
          center: [catPieLeft, catPieY],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: categoryPieLabel,
          labelLine: refPieLabelLine(),
          labelLayout: { hideOverlap: false },
          minShowLabelAngle: 0,
          data: cats.map(d => ({
            name: d.name,
            value: d.revenue,
            itemStyle: { color: revenueColor(d.name) }
          }))
        },
        {
          name: '毛利',
          type: 'pie',
          radius: ['0%', '50%'],
          center: [catPieRight, catPieY],
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: categoryPieLabel,
          labelLine: refPieLabelLine(),
          labelLayout: { hideOverlap: false },
          minShowLabelAngle: 0,
          data: cats.map(d => ({
            name: d.name,
            value: Math.max(0, d.grossProfit),
            itemStyle: { color: profitColor(d.name) }
          }))
        }
      ]
    }, true);
    charts.main.off('click');

    const productItems = st.byProductName || [];
    const pop = buildPieOfPie(productItems, 4, 7);
    const grandTotal = pop.main.reduce((s, d) => s + d.value, 0);

    charts.secondary.off('finished');
    charts.secondary.setOption({
      ...baseOption(),
      backgroundColor: isDark() ? 'transparent' : '#f4f8fa',
      title: {
        text: '商品名称毛利贡献',
        textStyle: { color: isDark() ? '#e2e8f0' : '#1e293b', fontSize: 18, fontWeight: 700 },
        left: 'center',
        top: 10
      },
      tooltip: {
        trigger: 'item',
        formatter(p) {
          const name = p.data?.fullName || p.name;
          const pct = grandTotal ? (p.value / grandTotal * 100).toFixed(1) : '0.0';
          return `${name}<br/>毛利：${SalesAnalytics.formatMoney(p.value)}（占总体 ${pct}%）`;
        }
      },
      legend: { show: false },
      series: [
        {
          name: '商品汇总',
          type: 'pie',
          radius: pop.hasSub ? ['0%', '38%'] : ['0%', '42%'],
          center: pop.hasSub ? ['27%', '57%'] : ['50%', '57%'],
          startAngle: pop.startAngle,
          clockwise: true,
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: refPieOutsideLabel({ fontSize: 14, pctDigits: 1, totalBase: grandTotal }),
          labelLine: refPieLabelLine(),
          labelLayout: { hideOverlap: false },
          minShowLabelAngle: 0,
          data: pop.main
        },
        ...(pop.hasSub ? [{
          name: '其他明细',
          type: 'pie',
          radius: ['0%', '27%'],
          center: ['68%', '57%'],
          startAngle: 90,
          clockwise: true,
          avoidLabelOverlap: true,
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: refPieOutsideLabel({ fontSize: 13, pctDigits: 0, totalBase: grandTotal }),
          labelLine: refPieLabelLine(),
          labelLayout: { hideOverlap: false },
          minShowLabelAngle: 0,
          data: pop.sub
        }] : [])
      ],
      graphic: []
    }, true);

    if (pop.hasSub && pop.otherIndex >= 0) {
      bindPieOfPieConnectors(charts.secondary, pop.otherIndex);
    }
    resizeCharts();
  }

  function paretoItemLabel(item, useCode) {
    return useCode ? (item.name || item.label) : (item.label || item.name);
  }

  function setParetoChartOption(chart, pareto, { title, barColor, lineColor, markColor, c, useCodeLabel }) {
    const topCount = Math.max(1, pareto.cutoffIndex || 1);
    const items = pareto.items.slice(0, topCount);
    const labels = items.map(d => paretoItemLabel(d, useCodeLabel));
    const metricName = pareto.metric === 'revenue' ? '收入' : '毛利';
    const fmt = SalesAnalytics;
    const titleText = `${title}（Top ${topCount} · ${metricName} 80%）`;
    const dense = topCount > 20;
    const bottomPad = dense ? 96 : Math.max(72, 56 + Math.min(topCount, 12));

    chart.setOption({
      ...baseOption(),
      title: title ? {
        text: titleText,
        textStyle: { color: c.text, fontSize: 14, fontWeight: 600 },
        left: 'center',
        top: 4
      } : undefined,
      grid: title ? { left: 48, right: 48, top: 52, bottom: bottomPad, containLabel: true } : undefined,
      ...(dense ? {
        dataZoom: [
          { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
          { type: 'slider', xAxisIndex: 0, height: 18, bottom: 8, filterMode: 'none' }
        ]
      } : {}),
      tooltip: {
        trigger: 'axis',
        formatter(params) {
          const i = params[0]?.dataIndex;
          const item = items[i];
          if (!item) return '';
          return `<strong>${paretoItemLabel(item, useCodeLabel)}</strong><br/>
            ${metricName}：${fmt.formatMoney(item.paretoValue)}<br/>
            累计占比：${fmt.formatPct(item.cumulativePct)}`;
        }
      },
      legend: { data: [metricName, '累计占比'], top: title ? 32 : 0, left: 'center' },
      xAxis: {
        type: 'category',
        data: labels,
        axisLabel: { rotate: dense ? 45 : 35, interval: 0, fontSize: dense ? 9 : 10 },
        axisLine: { lineStyle: { color: c.axis } }
      },
      yAxis: [
        { type: 'value', name: metricName, splitLine: { lineStyle: { color: c.split } } },
        { type: 'value', name: '累计%', max: 1, axisLabel: { formatter: v => (v * 100).toFixed(0) + '%' }, splitLine: { show: false } }
      ],
      series: [
        { name: metricName, type: 'bar', data: items.map(d => d.paretoValue), itemStyle: { color: barColor } },
        {
          name: '累计占比', type: 'line', yAxisIndex: 1, data: items.map(d => d.cumulativePct), smooth: true,
          itemStyle: { color: lineColor },
          markLine: {
            silent: true,
            data: [{ yAxis: APP_CONFIG.thresholds.paretoRatio, name: '80%线' }],
            lineStyle: { color: markColor, type: 'dashed' }
          }
        }
      ]
    }, true);
  }

  /* ── 帕累托 ── */
  function renderPareto(analysis) {
    const dim = document.getElementById('filterParetoDim')?.value || 'customer';
    const key = dim === 'product' ? 'product' : 'customer';
    const profitPareto = analysis.pareto.profit[key];
    const revenuePareto = analysis.pareto.revenue[key];
    const dimLabel = { customer: '客户', product: '商品编号' }[key];
    const useCodeLabel = key === 'product';
    const el = document.getElementById('chartMain');
    const el2 = document.getElementById('chartSecondary');
    charts.main = getChart(el);
    charts.secondary = getChart(el2);
    const c = themeColors();

    setParetoChartOption(charts.main, profitPareto, {
      title: `${dimLabel}毛利帕累托`,
      barColor: COLORS[0],
      lineColor: COLORS[2],
      markColor: COLORS[3],
      c,
      useCodeLabel
    });
    setParetoChartOption(charts.secondary, revenuePareto, {
      title: `${dimLabel}收入帕累托`,
      barColor: '#2563eb',
      lineColor: '#0891b2',
      markColor: '#dc2626',
      c,
      useCodeLabel
    });

    const profitH = paretoChartHeight(profitPareto.cutoffIndex);
    const revenueH = paretoChartHeight(revenuePareto.cutoffIndex);
    el.style.height = `${profitH}px`;
    el.style.minHeight = `${profitH}px`;
    el2.style.height = `${revenueH}px`;
    el2.style.minHeight = `${revenueH}px`;
    charts.main.resize();
    charts.secondary.resize();
    renderParetoTable(profitPareto, revenuePareto, dimLabel, useCodeLabel);
  }

  function renderParetoTable(profitPareto, revenuePareto, dimLabel, useCodeLabel) {
    const wrap = document.getElementById('compareTableWrap');
    if (!wrap) return;
    const fmt = SalesAnalytics;
    const profitItems = profitPareto.items.slice(0, profitPareto.cutoffIndex);
    const revenueItems = revenuePareto.items.slice(0, revenuePareto.cutoffIndex);

    const buildRows = (items, metricName) => items.map((d, i) => `
      <tr>
        <td class="num">${i + 1}</td>
        <td class="cell-wrap">${paretoItemLabel(d, useCodeLabel)}</td>
        <td class="num">${fmt.formatMoney(d.paretoValue)}</td>
        <td class="num">${fmt.formatPct(d.cumulativePct)}</td>
      </tr>`).join('');

    const buildTable = (title, items, metricName) => `
      <h4 class="pareto-table-title">${title}（${items.length} 项）</h4>
      <table class="data-table pareto-table">
        <thead><tr><th class="num">排名</th><th>${dimLabel}</th><th class="num">${metricName}</th><th class="num">累计占比</th></tr></thead>
        <tbody>${buildRows(items, metricName)}</tbody>
      </table>`;

    wrap.innerHTML =
      buildTable(`${dimLabel} · 贡献 80% 毛利`, profitItems, '毛利') +
      buildTable(`${dimLabel} · 贡献 80% 收入`, revenueItems, '收入');
  }

  function renderActiveTab() {
    if (!state.analysis) return;
    updateTabControls();
    switch (state.activeTab) {
      case 'compare': renderCompare(state.analysis); break;
      case 'trend': renderTrend(state.analysis); break;
      case 'structure': renderStructure(state.analysis); break;
      case 'pareto': renderPareto(state.analysis); break;
    }
  }

  /* ── 明细表（按月 + 维度汇总） ── */
  function aggregateDetailByMonth(rows) {
    const map = new Map();
    rows.forEach(r => {
      const month = r.salesDate.slice(0, 7);
      const key = [
        month,
        r.salesperson || '',
        r.customerCategory || '',
        r.customerName || r.customerCode || '',
        r.productCode || ''
      ].join('\0');
      if (!map.has(key)) {
        map.set(key, {
          salesDate: month,
          salesperson: r.salesperson || '',
          customerCategory: r.customerCategory || '',
          customerName: r.customerName || r.customerCode || '',
          productCode: r.productCode || '',
          quantity: 0,
          revenue: 0,
          cost: 0,
          grossProfit: 0
        });
      }
      const agg = map.get(key);
      agg.quantity += r.quantity || 0;
      agg.revenue += r.revenue || 0;
      agg.cost += r.cost || 0;
      agg.grossProfit += r.grossProfit || 0;
    });
    return [...map.values()]
      .map(m => ({
        ...m,
        grossMargin: m.revenue ? m.grossProfit / m.revenue : 0,
        avgUnitPrice: m.quantity ? m.revenue / m.quantity : 0,
        avgUnitCost: m.quantity ? m.cost / m.quantity : 0
      }))
      .sort((a, b) => {
        const byMonth = b.salesDate.localeCompare(a.salesDate);
        if (byMonth !== 0) return byMonth;
        return b.revenue - a.revenue;
      });
  }

  function renderDetailSortHeader(c) {
    const active = state.detailSort.field === c.key;
    const dir = state.detailSort.dir;
    const thClass = [
      'sortable',
      c.num || c.pct ? 'num' : '',
      active ? (dir === 'asc' ? 'sort-asc' : 'sort-desc') : ''
    ].filter(Boolean).join(' ');
    return `<th class="${thClass}" data-sort="${c.key}">
      <span class="th-inner">
        <span class="th-label">${c.label}</span>
        <span class="sort-arrows" aria-hidden="true"><span class="sort-up">▲</span><span class="sort-down">▼</span></span>
      </span>
    </th>`;
  }

  function renderDetailTable(rows) {
    const monthlyRows = aggregateDetailByMonth(rows);
    const { field, dir } = state.detailSort;
    const sorted = [...monthlyRows].sort((a, b) => {
      let va = a[field], vb = b[field];
      if (typeof va === 'number') return dir === 'asc' ? va - vb : vb - va;
      va = String(va); vb = String(vb);
      return dir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    });

    const total = sorted.length;
    const pages = Math.max(1, Math.ceil(total / state.pageSize));
    if (state.detailPage > pages) state.detailPage = pages;
    const start = (state.detailPage - 1) * state.pageSize;
    const pageRows = sorted.slice(start, start + state.pageSize);
    const fmt = SalesAnalytics;

    const cols = [
      { key: 'salesDate', label: '月份' },
      { key: 'salesperson', label: '业务员' },
      { key: 'customerCategory', label: '客户类别' },
      { key: 'customerName', label: '客户名称' },
      { key: 'productCode', label: '商品编码' },
      { key: 'quantity', label: '数量', num: true, int: true },
      { key: 'avgUnitPrice', label: '平均单价', num: true },
      { key: 'avgUnitCost', label: '平均单位成本', num: true },
      { key: 'revenue', label: '收入', num: true },
      { key: 'cost', label: '成本', num: true },
      { key: 'grossProfit', label: '毛利', num: true },
      { key: 'grossMargin', label: '毛利率', pct: true }
    ];

    const wrap = document.getElementById('detailTableWrap');
    wrap.innerHTML = `<table class="data-table detail-table"><thead><tr>
      ${cols.map(c => renderDetailSortHeader(c)).join('')}
    </tr></thead><tbody>
      ${pageRows.map(r => `<tr>
        ${cols.map(c => {
          let v = r[c.key];
          if (c.int) v = v.toLocaleString('zh-CN');
          else if (c.num) v = fmt.formatMoney(v);
          else if (c.pct) v = fmt.formatPct(v);
          const cls = c.num || c.pct ? 'num' : (c.key === 'customerName' || c.key === 'productCode' ? 'cell-wrap' : '');
          return `<td class="${cls}">${v ?? ''}</td>`;
        }).join('')}
      </tr>`).join('')}
    </tbody></table>`;

    wrap.querySelectorAll('th[data-sort]').forEach(th => {
      th.addEventListener('click', () => {
        const f = th.dataset.sort;
        if (state.detailSort.field === f) state.detailSort.dir = state.detailSort.dir === 'asc' ? 'desc' : 'asc';
        else { state.detailSort.field = f; state.detailSort.dir = 'desc'; }
        renderDetailTable(rows);
      });
    });

    const pag = document.getElementById('detailPagination');
    pag.innerHTML = `
      <button class="btn btn-ghost" ${state.detailPage <= 1 ? 'disabled' : ''} id="btnFirstPage">首页</button>
      <button class="btn btn-ghost" ${state.detailPage <= 1 ? 'disabled' : ''} id="btnPrevPage">上一页</button>
      <span>第 ${state.detailPage} / ${pages} 页，共 ${total} 条</span>
      <button class="btn btn-ghost" ${state.detailPage >= pages ? 'disabled' : ''} id="btnNextPage">下一页</button>
      <button class="btn btn-ghost" ${state.detailPage >= pages ? 'disabled' : ''} id="btnLastPage">末页</button>`;
    document.getElementById('btnFirstPage')?.addEventListener('click', () => { state.detailPage = 1; renderDetailTable(rows); });
    document.getElementById('btnPrevPage')?.addEventListener('click', () => { state.detailPage--; renderDetailTable(rows); });
    document.getElementById('btnNextPage')?.addEventListener('click', () => { state.detailPage++; renderDetailTable(rows); });
    document.getElementById('btnLastPage')?.addEventListener('click', () => { state.detailPage = pages; renderDetailTable(rows); });
  }

  function exportCsv(rows) {
    const monthlyRows = aggregateDetailByMonth(rows);
    const cols = [
      'salesDate', 'salesperson', 'customerCategory', 'customerName', 'productCode',
      'quantity', 'avgUnitPrice', 'avgUnitCost', 'revenue', 'cost', 'grossProfit', 'grossMargin'
    ];
    const headers = ['月份', '业务员', '客户类别', '客户名称', '商品编码', '数量', '平均单价', '平均单位成本', '收入', '成本', '毛利', '毛利率'];
    const lines = [headers.join(',')];
    monthlyRows.forEach(r => {
      lines.push(cols.map(c => {
        let v = r[c];
        if (c === 'grossMargin') v = (v * 100).toFixed(2) + '%';
        if (typeof v === 'string' && v.includes(',')) v = `"${v}"`;
        return v;
      }).join(','));
    });
    const blob = new Blob(['\ufeff' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `销售月汇总_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function refresh(rows, analysis, filters) {
    state.rows = rows;
    state.analysis = analysis;
    state.filters = filters;
    refreshKPI(analysis.kpi, filters);
    renderActiveTab();
    state.detailPage = 1;
    renderDetailTable(analysis.filtered);
  }

  function resetViewState() {
    state.detailPage = 1;
    state.detailSort = { field: 'salesDate', dir: 'desc' };
    state.activeTab = 'compare';
    document.querySelectorAll('.tab-bar .tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === 'compare');
    });
    updateTabControls();
  }

  function clearDashboard() {
    disposeCharts();
    state.analysis = null;
    state.rows = [];
    state.filters = {};
    resetViewState();

    ['kpiRevenue', 'kpiCost', 'kpiProfit', 'kpiMargin'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '—';
    });
    ['kpiRevenueSub', 'kpiCostSub', 'kpiProfitSub', 'kpiMarginSub'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });

    const table = document.getElementById('detailTable');
    if (table) {
      const tbody = table.querySelector('tbody');
      if (tbody) tbody.innerHTML = '';
    }
    const pageInfo = document.getElementById('detailPageInfo');
    if (pageInfo) pageInfo.textContent = '';
  }

  function onThemeChange() {
    disposeCharts();
    if (state.analysis) renderActiveTab();
  }

  return { init, refresh, exportCsv, onThemeChange, resetViewState, clearDashboard, getState: () => state };
})();

document.addEventListener('DOMContentLoaded', () => DashboardCharts.init());
