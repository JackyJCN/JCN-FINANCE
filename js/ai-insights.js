/**
 * 规则化财务解读 + 大模型 API 增强
 */
const AIInsights = (() => {
  let lastMarkdown = '';
  let lastAnalysis = null;
  let aiTurns = [];
  let enhancedBaseMarkdown = '';

  function getSettings() {
    try {
      const s = JSON.parse(localStorage.getItem('aiSettings') || '{}');
      if (s.model && s.provider) {
        const normalized = normalizeAiModel(s.model, s.provider);
        if (normalized !== s.model) {
          s.model = normalized;
          localStorage.setItem('aiSettings', JSON.stringify(s));
        }
      }
      return s;
    } catch {
      return {};
    }
  }

  function hasApiKey() {
    const s = getSettings();
    return !!(s.apiKey && s.baseUrl);
  }

  function marginTag(margin) {
    const t = APP_CONFIG.thresholds;
    if (margin >= t.grossMarginGood) return { cls: 'green', label: '良好' };
    if (margin >= t.grossMarginWarning) return { cls: 'yellow', label: '一般' };
    return { cls: 'red', label: '偏低' };
  }

  function buildOverview(s, k) {
    const tag = marginTag(k.grossMargin);
    const revW = k.revenue >= 10000 ? `${(k.revenue / 10000).toFixed(1)} 万元` : SalesAnalytics.formatMoney(k.revenue);
    const gpW = k.grossProfit >= 10000 ? `${(k.grossProfit / 10000).toFixed(1)} 万元` : SalesAnalytics.formatMoney(k.grossProfit);

    let trend = '';
    if (k.mom?.revenue != null) {
      trend += `最近周期（${k.latestPeriod || ''}）收入环比 ${SalesAnalytics.formatGrowth(k.mom.revenue)}`;
      if (k.yoy?.revenue != null) trend += `，同比 ${SalesAnalytics.formatGrowth(k.yoy.revenue)}`;
      trend += '。';
    }

    return `## 一、经营总览

<span class="tag tag-${tag.cls}">毛利率${tag.label}</span>

在 ${s.dateRange ? `${s.dateRange.min} 至 ${s.dateRange.max}` : '当前筛选范围'} 内，共 **${s.rowCount}** 笔销售：

- **收入** ${revW}，**毛利** ${gpW}，加权 **毛利率 ${SalesAnalytics.formatPct(k.grossMargin)}**
- 动销 SKU **${k.skuCount}** 个，活跃客户 **${k.customerCount}** 家
- 单均毛利 ${SalesAnalytics.formatMoney(k.avgOrderProfit)}，客均收入 ${SalesAnalytics.formatMoney(k.avgCustomerRevenue)}

${trend || '（首周期或无对比期，暂无环比/同比）'}

**结论**：${tag.cls === 'green'
      ? '整体盈利能力较好，建议在保持毛利率前提下扩大高毛利 SKU 与客户覆盖。'
      : tag.cls === 'yellow'
        ? '盈利能力尚可，需关注低毛利订单与客户，防止规模增长侵蚀利润。'
        : '毛利率偏低，优先排查定价、返利到账及成本映射是否正确，并收缩负毛利业务。'}`;
  }

  function buildAnomalies(s) {
    const a = s.anomalies;
    const lines = ['## 二、异常检测', ''];

    if (a.negativeProfit.length) {
      lines.push(`### 负毛利交易（${a.negativeProfit.length > 10 ? 'Top 10' : a.negativeProfit.length} 笔）`);
      a.negativeProfit.forEach(r => {
        lines.push(`- ${r.salesDate} | ${r.customerCode} | ${r.productCode} | 收入 ${SalesAnalytics.formatMoney(r.revenue)} | 毛利 ${SalesAnalytics.formatMoney(r.grossProfit)}`);
      });
      lines.push('');
    } else {
      lines.push('- 未发现负毛利交易 ✓');
    }

    if (a.zeroCost.length) {
      lines.push(`### 成本为零（${a.zeroCost.length} 笔样本）`);
      lines.push('- 请核对成本列映射或是否存在赠品/样品出库');
      lines.push('');
    }

    if (a.lowMarginCustomers.length) {
      lines.push('### 低毛利大客户（低于均值 8pp 且收入 > 5,000）');
      a.lowMarginCustomers.forEach(c => {
        lines.push(`- ${c.label || c.name}（${c.name}）：毛利率 ${SalesAnalytics.formatPct(c.grossMargin)}，收入 ${SalesAnalytics.formatMoney(c.revenue)}`);
      });
      lines.push('');
    }

    if (a.lowMarginProducts.length) {
      lines.push('### 低毛利 SKU（低于均值 8pp 且收入 > 3,000）');
      a.lowMarginProducts.forEach(p => {
        lines.push(`- ${p.name}：毛利率 ${SalesAnalytics.formatPct(p.grossMargin)}，收入 ${SalesAnalytics.formatMoney(p.revenue)}`);
      });
      lines.push('');
    }

    const sp = s.spStats;
    if (sp.marginStdDev > 0.05) {
      lines.push(`### 业务员毛利率离散度`);
      lines.push(`- 业务员间毛利率标准差 **${SalesAnalytics.formatPct(sp.marginStdDev)}**，差异较大，建议统一报价政策或复盘异常低价单。`);
      lines.push('');
    }

    return lines.join('\n');
  }

  function buildStructure(s, k) {
    const lines = ['## 三、结构洞察', ''];
    const topCat = s.structure.byCategory[0];
    if (topCat) {
      lines.push(`- **最大客户类别**：${topCat.name}，毛利占比 ${SalesAnalytics.formatPct(topCat.profitShare)}，收入占比 ${SalesAnalytics.formatPct(topCat.revenueShare)}`);
    }

    const toolLine = s.structure.byProductLine.find(l => l.name === '切削刀具');
    const barLine = s.structure.byProductLine.find(l => l.name === '硬质合金棒材');
    if (toolLine && barLine) {
      lines.push(`- **刀具 vs 棒材**：刀具毛利 ${SalesAnalytics.formatMoney(toolLine.grossProfit)}（${SalesAnalytics.formatPct(toolLine.profitShare)}），棒材 ${SalesAnalytics.formatMoney(barLine.grossProfit)}（${SalesAnalytics.formatPct(barLine.profitShare)}）`);
      if (barLine.grossMargin < toolLine.grossMargin - 0.05) {
        lines.push(`- 棒材毛利率（${SalesAnalytics.formatPct(barLine.grossMargin)}）显著低于刀具（${SalesAnalytics.formatPct(toolLine.grossMargin)}），符合代理贸易常见结构，但需确保棒材以走量返利补利润。`);
      }
    }

    const topSeries = s.structure.bySeries.filter(x => !/其他/.test(x.name)).slice(0, 3);
    if (topSeries.length) {
      lines.push(`- **主力产品系列**：${topSeries.map(x => `${x.name}（${SalesAnalytics.formatPct(x.profitShare)}）`).join('、')}`);
    }

    if (s.topCustomerShare >= APP_CONFIG.thresholds.topCustomerRisk) {
      lines.push(`- <span class="tag tag-red">集中度风险</span> Top1 客户收入占比 ${SalesAnalytics.formatPct(s.topCustomerShare)}，超过 ${SalesAnalytics.formatPct(APP_CONFIG.thresholds.topCustomerRisk)} 警戒线`);
    }

    const hhi = s.hhi;
    const hhiLabel = hhi > 0.25 ? '高度集中' : hhi > 0.15 ? '中度集中' : '相对分散';
    lines.push(`- 客户集中度 HHI = **${hhi.toFixed(3)}**（${hhiLabel}）`);

    lines.push('', '### 客户四象限');
    lines.push(`- 明星 ${s.matrix.stars} 家 | 金牛 ${s.matrix.cows} 家 | 问题 ${s.matrix.questions} 家 | 瘦狗 ${s.matrix.dogs} 家`);
    lines.push('- **明星**：高收入高毛利，重点维护；**金牛**：高收入低毛利，争取提价或结构优化；**问题**：低规模高毛利，可培育；**瘦狗**：评估是否收缩资源。');

    return lines.join('\n');
  }

  function buildPareto(s) {
    const pc = s.pareto.profit?.customer || s.pareto.customer;
    const pp = s.pareto.profit?.product || s.pareto.product;
    const rc = s.pareto.revenue?.customer;
    const rp = s.pareto.revenue?.product;
    return `## 四、帕累托行动建议

### 客户（毛利）
- Top **${pc.cutoffIndex}** 家客户（占总数 ${SalesAnalytics.formatPct(pc.cutoffPct)}）贡献 **80%** 毛利
- 长尾 **${pc.tailCount}** 家仅贡献 ${SalesAnalytics.formatPct(pc.total ? pc.tailValue / pc.total : 0)} 毛利
- **建议**：集中销售与技术支持于 Top 20% 客户；对长尾客户评估最小订单量或转向经销商覆盖

### 商品（毛利）
- Top **${pp.cutoffIndex}** 个 SKU 贡献 80% 毛利（共 ${pp.totalCount} 个 SKU）
- **建议**：保障主力 SKU 库存与交期；对尾部 SKU 清理呆滞、合并报价

### 收入结构
- 客户 Top **${rc?.cutoffIndex ?? '—'}** 贡献 80% 收入；商品 Top **${rp?.cutoffIndex ?? '—'}** 贡献 80% 收入
- **建议**：对比收入与毛利帕累托，识别「高收入低毛利」客户/商品并优化报价结构`;
  }

  function buildIndustryContext(s) {
    const atSeries = s.structure.bySeries.find(x => /AT|金属陶瓷/.test(x.name));
    const mSeries = s.structure.bySeries.find(x => /铣刀|M/.test(x.name));
    const lines = ['## 五、行业语境（澳克泰代理）', ''];
    lines.push('企业主营澳克泰 ACHTECK 切削刀具与硬质合金棒材一级代理，利润来源为 **进销差价 + 规模返利**。');

    if (atSeries && atSeries.profitShare > 0.05) {
      lines.push(`- 高端 **${atSeries.name}** 系列毛利占比 ${SalesAnalytics.formatPct(atSeries.profitShare)}，难加工材料场景可继续深耕航空航天/模具客户。`);
    } else {
      lines.push('- 高端 AT 金属陶瓷系列占比较低，可在难加工材料客户群推广 AT210A 等型号以提升毛利。');
    }

    if (mSeries) {
      lines.push(`- **${mSeries.name}** 铣刀系列毛利 ${SalesAnalytics.formatMoney(mSeries.grossProfit)}，适合通用机加客户走量。`);
    }

    lines.push('- 关注 CCMT/CIMT 展会月（通常 4–5 月）促销节奏，避免展会后低价单拉低毛利率。');
    lines.push(`- 数据口径：${APP_CONFIG.dataConvention.note}`);

    return lines.join('\n');
  }

  function generateRuleReport(analysis) {
    const s = analysis.summary;
    const k = s.kpi;
    const parts = [
      `# ${APP_CONFIG.companyName} 销售经营分析报告`,
      ``,
      `> 生成时间 ${new Date().toLocaleString('zh-CN')}`,
      ``,
      buildOverview(s, k),
      ``,
      buildAnomalies(s),
      ``,
      buildStructure(s, k),
      ``,
      buildPareto(s),
      ``,
      buildIndustryContext(s)
    ];
    return parts.join('\n');
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  function inlineFormat(text) {
    let s = String(text);
    const tags = [];
    s = s.replace(/<span class="tag tag-(green|yellow|red)">(.+?)<\/span>/g, (_, cls, label) => {
      tags.push(`<span class="tag tag-${cls}">${label}</span>`);
      return `\x00TAG${tags.length - 1}\x00`;
    });
    s = escapeHtml(s)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`([^`]+)`/g, '<code class="md-code">$1</code>');
    tags.forEach((t, i) => { s = s.replace(`\x00TAG${i}\x00`, t); });
    return s;
  }

  function isTableRow(line) {
    return /^\s*\|.+\|\s*$/.test(line);
  }

  function isTableSeparator(line) {
    return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line.trim());
  }

  function parseTableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
  }

  function renderTable(tableLines) {
    const rows = tableLines.filter(l => !isTableSeparator(l)).map(parseTableCells);
    if (!rows.length) return '';
    const [head, ...body] = rows;
    const thead = `<thead><tr>${head.map(c => `<th>${inlineFormat(c)}</th>`).join('')}</tr></thead>`;
    const tbody = body.length
      ? `<tbody>${body.map(r => `<tr>${r.map(c => `<td>${inlineFormat(c)}</td>`).join('')}</tr>`).join('')}</tbody>`
      : '';
    return `<div class="md-table-wrap"><table class="md-table">${thead}${tbody}</table></div>`;
  }

  function markdownToHtml(md) {
    const lines = String(md || '').replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;

    while (i < lines.length) {
      while (i < lines.length && !lines[i].trim()) i++;
      if (i >= lines.length) break;

      const line = lines[i];

      if (isTableRow(line) || (i + 1 < lines.length && isTableRow(lines[i + 1]))) {
        const tableLines = [];
        while (i < lines.length && (isTableRow(lines[i]) || isTableSeparator(lines[i]))) {
          tableLines.push(lines[i]);
          i++;
        }
        out.push(renderTable(tableLines));
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        out.push('<hr class="md-hr">');
        i++;
        continue;
      }

      if (/^# /.test(line)) {
        out.push(`<h2>${inlineFormat(line.slice(2))}</h2>`);
        i++;
        continue;
      }
      if (/^## /.test(line)) {
        out.push(`<h4>${inlineFormat(line.slice(3))}</h4>`);
        i++;
        continue;
      }
      if (/^### /.test(line)) {
        out.push(`<h5>${inlineFormat(line.slice(4))}</h5>`);
        i++;
        continue;
      }
      if (/^> /.test(line)) {
        out.push(`<p class="hint md-quote">${inlineFormat(line.slice(2))}</p>`);
        i++;
        continue;
      }

      if (/^- /.test(line)) {
        const items = [];
        while (i < lines.length && /^- /.test(lines[i])) {
          items.push(`<li>${inlineFormat(lines[i].slice(2))}</li>`);
          i++;
        }
        out.push(`<ul>${items.join('')}</ul>`);
        continue;
      }

      if (/^\d+\.\s/.test(line)) {
        const items = [];
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          items.push(`<li>${inlineFormat(lines[i].replace(/^\d+\.\s/, ''))}</li>`);
          i++;
        }
        out.push(`<ol>${items.join('')}</ol>`);
        continue;
      }

      const para = [];
      while (i < lines.length && lines[i].trim() && !/^#{1,3}\s/.test(lines[i]) && !/^[->]/.test(lines[i]) &&
        !/^\d+\.\s/.test(lines[i]) && !isTableRow(lines[i]) && !/^---+$/.test(lines[i].trim())) {
        para.push(lines[i]);
        i++;
      }
      if (para.length) {
        out.push(`<p>${inlineFormat(para.join(' '))}</p>`);
      }
    }

    return out.join('\n');
  }

  /** 脱敏摘要 JSON，供 API 使用 */
  function buildApiSummary(analysis) {
    const s = analysis.summary;
    const k = s.kpi;
    return {
      company: APP_CONFIG.brand,
      period: s.dateRange,
      rowCount: s.rowCount,
      kpi: {
        revenue: Math.round(k.revenue),
        grossProfit: Math.round(k.grossProfit),
        grossMargin: +(k.grossMargin * 100).toFixed(1),
        skuCount: k.skuCount,
        customerCount: k.customerCount
      },
      mom: k.mom ? { revenueGrowth: k.mom.revenue, marginPP: k.mom.grossMarginPP } : null,
      yoy: k.yoy ? { revenueGrowth: k.yoy.revenue, marginPP: k.yoy.grossMarginPP } : null,
      structure: {
        categories: s.structure.byCategory.slice(0, 5).map(c => ({ name: c.name, profitShare: +(c.profitShare * 100).toFixed(1) })),
        productLines: s.structure.byProductLine.map(l => ({ name: l.name, margin: +(l.grossMargin * 100).toFixed(1), profitShare: +(l.profitShare * 100).toFixed(1) }))
      },
      pareto: {
        customersFor80Pct: (s.pareto.profit?.customer || s.pareto.customer).cutoffIndex,
        totalCustomers: (s.pareto.profit?.customer || s.pareto.customer).totalCount,
        skusFor80Pct: (s.pareto.profit?.product || s.pareto.product).cutoffIndex,
        revenueCustomersFor80Pct: s.pareto.revenue?.customer?.cutoffIndex,
        revenueSkusFor80Pct: s.pareto.revenue?.product?.cutoffIndex
      },
      risks: {
        topCustomerShare: +(s.topCustomerShare * 100).toFixed(1),
        hhi: +s.hhi.toFixed(3),
        negativeProfitCount: s.anomalies.negativeProfit.length,
        lowMarginCustomerCount: s.anomalies.lowMarginCustomers.length
      },
      matrix: { stars: s.matrix.stars, cows: s.matrix.cows, questions: s.matrix.questions, dogs: s.matrix.dogs }
    };
  }

  function buildApiPrompt(summary, ruleReport, userRequirements = '') {
    const req = String(userRequirements || '').trim();
    const reqBlock = req
      ? `【用户分析需求】\n${req}\n\n请优先围绕上述需求展开分析，并在以下结构中体现相关结论。\n\n`
      : '';

    return `你是一名有十年经验的工业刀具贸易企业财务分析师，分析对象为 **${APP_CONFIG.companyName}**（${APP_CONFIG.brand}）。

重要：报告标题、页眉及正文中的**企业主体名称**必须写「${APP_CONFIG.companyName}」，不得用「澳克泰」「ACHTECK」或「一级代理」替代公司名称；澳克泰仅为代理品牌背景。

以下是由系统汇总的经营数据摘要（JSON）及规则引擎生成的事实底稿（Markdown）。请基于这些数据撰写专业分析报告，不要编造不存在的数据。

${reqBlock}【数据摘要 JSON】
${JSON.stringify(summary, null, 2)}

【规则引擎事实底稿（节选）】
${ruleReport.slice(0, 3000)}

请按以下结构输出（Markdown）：
- 首行标题固定为：# ${APP_CONFIG.companyName} 经营分析报告
1. Executive Summary（3-5 句）${req ? '（需回应用户分析需求）' : ''}
2. 关键风险清单（条目化，按优先级）
3. 下月经营建议（按客户/SKU/业务员三个维度，各 2-3 条可执行建议）
4. 需要进一步核实的数据问题（若有）

语言：简体中文，专业、简洁，适合向总经理汇报。`;
  }

  function buildFollowUpPrompt(summary, previousAiContent, userRequirements, turnIndex) {
    return `你是一名有十年经验的工业刀具贸易企业财务分析师，分析对象为 **${APP_CONFIG.companyName}**（${APP_CONFIG.brand}）。用户已看过以下 AI 分析，现提出追问，请在此基础上**补充**新内容。

要求：
- 企业主体名称必须使用「${APP_CONFIG.companyName}」，不要用澳克泰/ACHTECK 作为公司名称
- **不要重复**此前已写过的结论与段落
- 直接回应用户追问，可引用数据摘要中的事实
- 不要编造不存在的数据
- 用 Markdown 输出，结构可自由组织

【此前 AI 分析汇总】
${previousAiContent.slice(-6000)}

【用户追问（第 ${turnIndex} 轮）】
${userRequirements}

【数据摘要 JSON】
${JSON.stringify(summary, null, 2)}`;
  }

  function resetEnhanced() {
    aiTurns = [];
    enhancedBaseMarkdown = '';
    const el = document.getElementById('aiEnhanced');
    if (el) {
      el.innerHTML = '';
      el.classList.add('hidden');
      delete el.dataset.keep;
    }
    const label = document.querySelector('.ai-prompt-label');
    if (label) label.textContent = '分析需求（可选）';
  }

  function appendEnhancedTurn(container, turn) {
    if (!container) return;
    const block = document.createElement('article');
    block.className = 'ai-turn';
    block.dataset.turn = String(turn.turnNum);
    const reqHtml = turn.requirement
      ? `<p class="ai-turn-req"><strong>分析需求：</strong>${escapeHtml(turn.requirement)}</p>`
      : '';
    block.innerHTML = `
      <h4 class="ai-section-title">${escapeHtml(turn.title)}</h4>
      ${reqHtml}
      <div class="ai-turn-body">${markdownToHtml(turn.content)}</div>`;
    container.appendChild(block);
    container.classList.remove('hidden');
    container.dataset.keep = '1';
    block.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function getUserPrompt() {
    return document.getElementById('aiUserPrompt')?.value?.trim() || '';
  }

  function saveUserPrompt(text) {
    const s = getSettings();
    s.analysisPrompt = text;
    localStorage.setItem('aiSettings', JSON.stringify(s));
  }

  function loadUserPrompt() {
    const el = document.getElementById('aiUserPrompt');
    if (!el) return;
    const saved = getSettings().analysisPrompt;
    if (saved) el.value = saved;
  }

  async function callLLM(prompt) {
    const s = getSettings();
    const baseUrl = (s.baseUrl || APP_CONFIG.aiDefaults.baseUrl).replace(/\/$/, '');
    const model = normalizeAiModel(s.model || APP_CONFIG.aiDefaults.model, s.provider);
    const apiKey = s.apiKey;

    if (!apiKey) throw new Error('请先在设置中配置 API Key');
    if (!model) throw new Error('请先在设置中选择 Model');

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `你是资深财务分析师，为 ${APP_CONFIG.companyName} 撰写工业刀具贸易经营分析报告；报告中的企业名称必须使用「${APP_CONFIG.companyName}」。` },
          { role: 'user', content: prompt }
        ],
        temperature: 0.4,
        max_tokens: 2000
      })
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(formatApiError(res.status, err, model, s.provider));
    }

    const data = await res.json();
    return data.choices?.[0]?.message?.content || '（无返回内容）';
  }

  function formatApiError(status, bodyText, model, provider) {
    let msg = bodyText;
    let code = '';
    try {
      const j = JSON.parse(bodyText);
      msg = j.error?.message || j.message || bodyText;
      code = j.error?.code || j.code || '';
    } catch { /* keep raw */ }

    if (status === 404 || code === 'model_not_found' || /does not exist|not have access/i.test(msg)) {
      const hint = provider === 'qwen'
        ? '通义模型 ID 须小写，例如 qwen-plus、qwen3.7-max。请在「设置」中重新选择。'
        : '请在「设置」中检查 Provider、Base URL 与 Model 是否匹配。';
      return `模型「${model}」不可用：${msg}\n${hint}`;
    }
    if (status === 401) return `API Key 无效或未授权，请检查「设置」中的密钥。\n${msg}`;
    return `API 错误 ${status}：${msg}`;
  }

  function updateEnhanceButton() {
    const btn = document.getElementById('btnAiEnhance');
    const clearBtn = document.getElementById('btnAiClear');
    const wrap = document.getElementById('aiPromptWrap');
    const label = document.querySelector('.ai-prompt-label');
    if (!btn) return;
    btn.classList.remove('hidden');
    wrap?.classList.remove('hidden');
    const hasTurns = aiTurns.length > 0;
    if (label) label.textContent = hasTurns ? '追问需求' : '分析需求（可选）';
    if (hasTurns) {
      clearBtn?.classList.remove('hidden');
      btn.textContent = hasApiKey() ? '继续追问' : '配置 API 后追问';
    } else {
      clearBtn?.classList.add('hidden');
      btn.textContent = hasApiKey() ? 'AI 增强分析' : '配置 API 后增强分析';
    }
  }

  function render(el, analysis) {
    if (!el) return;
    lastAnalysis = analysis;
    lastMarkdown = generateRuleReport(analysis);
    el.innerHTML = markdownToHtml(lastMarkdown);
    resetEnhanced();
    updateEnhanceButton();
  }

  async function enhance(elEnhanced, onStatus, { followUp = false } = {}) {
    if (!lastAnalysis) return;
    const settings = getSettings();
    if (!settings.apiKey) {
      document.getElementById('settingsDialog')?.showModal();
      throw new Error('请先配置 API Key');
    }

    const summary = buildApiSummary(lastAnalysis);
    const userRequirements = getUserPrompt();
    const isFollowUp = followUp && aiTurns.length > 0;

    if (isFollowUp && !userRequirements) {
      throw new Error('请输入本次追问的分析需求');
    }

    let content;
    let turn;

    if (isFollowUp) {
      const prevContent = aiTurns.map(t => t.content).join('\n\n---\n\n');
      const turnNum = aiTurns.length + 1;
      const prompt = buildFollowUpPrompt(summary, prevContent, userRequirements, turnNum);
      onStatus?.('正在追问分析…');
      content = await callLLM(prompt);
      turn = {
        turnNum,
        title: `追问 ${turnNum - 1}`,
        requirement: userRequirements,
        content
      };
    } else {
      const prompt = buildApiPrompt(summary, lastMarkdown, userRequirements);
      if (userRequirements) saveUserPrompt(userRequirements);
      onStatus?.('正在调用大模型…');
      content = await callLLM(prompt);
      enhancedBaseMarkdown = lastMarkdown;
      turn = {
        turnNum: 1,
        title: 'AI 增强分析',
        requirement: userRequirements,
        content
      };
    }

    aiTurns.push(turn);
    appendEnhancedTurn(elEnhanced, turn);

    const turnMd = `# ${turn.title}${turn.requirement ? `\n\n> 需求：${turn.requirement}` : ''}\n\n${content}`;
    lastMarkdown = `${enhancedBaseMarkdown || lastMarkdown}\n\n---\n\n${turnMd}`;

    const promptEl = document.getElementById('aiUserPrompt');
    if (promptEl && isFollowUp) promptEl.value = '';

    updateEnhanceButton();
    onStatus?.('完成');
    return content;
  }

  function getMarkdown() {
    return lastMarkdown;
  }

  function init() {
    loadUserPrompt();
    document.getElementById('aiUserPrompt')?.addEventListener('blur', (e) => {
      saveUserPrompt(e.target.value.trim());
    });

    document.getElementById('btnAiEnhance')?.addEventListener('click', async () => {
      const btn = document.getElementById('btnAiEnhance');
      const enhanced = document.getElementById('aiEnhanced');
      const followUp = aiTurns.length > 0;
      btn.disabled = true;
      btn.textContent = followUp ? '追问中…' : '分析中…';
      try {
        await enhance(enhanced, (msg) => { btn.textContent = msg; }, { followUp });
      } catch (err) {
        if (typeof App !== 'undefined') App.toast(err.message, 'error');
        else alert(err.message);
        updateEnhanceButton();
      } finally {
        btn.disabled = false;
        updateEnhanceButton();
      }
    });

    document.getElementById('btnAiClear')?.addEventListener('click', () => {
      if (!aiTurns.length) return;
      if (!confirm('确定清空所有 AI 增强分析与追问记录吗？')) return;
      lastMarkdown = enhancedBaseMarkdown || generateRuleReport(lastAnalysis);
      resetEnhanced();
      updateEnhanceButton();
      if (typeof App !== 'undefined') App.toast('已清空 AI 分析记录');
    });
  }

  return { render, enhance, generateRuleReport, buildApiSummary, getMarkdown, init, hasApiKey, updateEnhanceButton, resetEnhanced };
})();

document.addEventListener('DOMContentLoaded', () => AIInsights.init());
