# 销售经营分析看板

上海伊创刀具有限公司 · 销售经营数据分析（Excel 导入 + KPI 图表 + AI 解读）

## 在线访问

https://jackyjcn.github.io/JCN-FINANCE/

首次使用请点击 **「导入 Excel」** 上传 `2025.6.1-2026.5.31.xlsx`。

## 本地运行

双击 **`启动看板.bat`**（无需安装 Python/Node），浏览器自动打开。

## 部署到 GitHub

双击 **`部署.bat`**，或：

```powershell
powershell -File scripts/deploy-github.ps1
```

首次若网站空白：仓库 **Settings → Pages → Source** 选 **GitHub Actions**。

## 项目结构

```
index.html          页面入口
css/  js/  lib/     样式、逻辑、第三方库
scripts/            构建 / 本地服务 / 部署
data/               Excel 数据（本地，不提交 git）
docs/               方案文档
.github/workflows/  GitHub Pages 自动部署
```

## 开发

- 修改 `js/`、`css/` 后本地用 `启动看板.bat` 预览
- push 到 `main` 分支后 GitHub Actions 自动构建并发布
