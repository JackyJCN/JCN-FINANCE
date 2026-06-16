/**
 * 按需加载 xlsx / echarts，加快 GitHub Pages 首屏
 */
const LazyLibs = (() => {
  const ver = APP_CONFIG.libVersion || '';
  const q = ver ? `?v=${ver}` : '';
  let xlsxPromise = null;
  let echartsPromise = null;

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-lazy-src="${src}"]`);
      if (existing) {
        if (existing.dataset.loaded === '1') resolve();
        else existing.addEventListener('load', () => resolve(), { once: true });
        return;
      }
      const el = document.createElement('script');
      el.src = src;
      el.dataset.lazySrc = src;
      el.onload = () => { el.dataset.loaded = '1'; resolve(); };
      el.onerror = () => reject(new Error(`脚本加载失败：${src}`));
      document.head.appendChild(el);
    });
  }

  function loadXlsx() {
    if (typeof XLSX !== 'undefined') return Promise.resolve();
    if (!xlsxPromise) {
      xlsxPromise = loadScript(`lib/xlsx.full.min.js${q}`).catch(err => {
        xlsxPromise = null;
        throw err;
      });
    }
    return xlsxPromise;
  }

  function loadEcharts() {
    if (typeof echarts !== 'undefined') return Promise.resolve();
    if (!echartsPromise) {
      echartsPromise = loadScript(`lib/echarts.min.js${q}`).catch(err => {
        echartsPromise = null;
        throw err;
      });
    }
    return echartsPromise;
  }

  return { loadXlsx, loadEcharts };
})();
