/**
 * 下拉多选筛选器（支持单选/多选，未选或全选=不过滤）
 */
const FilterMultiSelect = (() => {
  const instances = new Map();

  function create(id, label, onChange) {
    const wrap = document.getElementById(id + 'Wrap');
    if (!wrap) return null;

    const trigger = wrap.querySelector('.ms-trigger');
    const panel = wrap.querySelector('.ms-dropdown');
    const list = wrap.querySelector('.ms-list');

    const state = { values: [], onChange };

    function renderList() {
      list.innerHTML = state.values.map(v => `
        <label class="ms-item">
          <input type="checkbox" value="${escapeAttr(v)}">
          <span class="ms-item-text">${escapeHtml(v)}</span>
          <button type="button" class="ms-only" title="仅选此项">仅选</button>
        </label>
      `).join('');

      list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.addEventListener('change', () => { updateTrigger(); onChange?.(); });
      });
      list.querySelectorAll('.ms-only').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          selectOnly(btn.closest('.ms-item').querySelector('input').value);
        });
      });
    }

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
    }
    function escapeAttr(s) {
      return escapeHtml(s);
    }

    function getChecked() {
      return [...list.querySelectorAll('input:checked')].map(cb => cb.value);
    }

    function getActiveValues() {
      const checked = getChecked();
      if (!checked.length || checked.length === state.values.length) return [];
      return checked;
    }

    function updateTrigger() {
      const checked = getChecked();
      if (!checked.length || checked.length === state.values.length) {
        trigger.textContent = '全部';
        trigger.classList.remove('ms-trigger-active');
      } else if (checked.length === 1) {
        trigger.textContent = checked[0];
        trigger.classList.add('ms-trigger-active');
      } else {
        trigger.textContent = `已选 ${checked.length} 项`;
        trigger.classList.add('ms-trigger-active');
      }
    }

    function setOptions(values) {
      state.values = [...values];
      renderList();
      updateTrigger();
    }

    function selectAll(silent) {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = true; });
      updateTrigger();
      panel.classList.add('hidden');
      if (!silent) onChange?.();
    }

    function clearAll(silent) {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => { cb.checked = false; });
      updateTrigger();
      panel.classList.add('hidden');
      if (!silent) onChange?.();
    }

    function selectOnly(value) {
      list.querySelectorAll('input[type=checkbox]').forEach(cb => {
        cb.checked = cb.value === value;
      });
      updateTrigger();
      onChange?.();
      panel.classList.add('hidden');
    }

    function reset(silent) {
      if (state.values.length) selectAll(silent);
      else clearAll(silent);
    }

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      document.querySelectorAll('.ms-dropdown').forEach(p => {
        if (p !== panel) p.classList.add('hidden');
      });
      panel.classList.toggle('hidden');
    });

    wrap.querySelector('[data-act=all]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      selectAll();
    });
    wrap.querySelector('[data-act=clear]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      clearAll();
    });

    panel.addEventListener('click', (e) => e.stopPropagation());

    const api = { setOptions, getActiveValues, reset, selectOnly, updateTrigger };
    instances.set(id, api);
    return api;
  }

  function closeAll() {
    document.querySelectorAll('.ms-dropdown').forEach(p => p.classList.add('hidden'));
  }

  document.addEventListener('click', closeAll);

  function get(id) {
    return instances.get(id);
  }

  return { create, get, closeAll };
})();

/**
 * 模糊搜索下拉（客户/商品）
 */
const FilterSearchSelect = (() => {
  const instances = new Map();

  function create(id, onChange) {
    const wrap = document.getElementById(id + 'Wrap');
    if (!wrap) return null;
    const input = wrap.querySelector('.ss-input');
    const dropdown = wrap.querySelector('.ss-dropdown');
    const state = { items: [], onChange, highlight: -1 };

    function escapeHtml(s) {
      return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    }

    function filterItems(q) {
      const query = q.trim().toLowerCase();
      if (!query) return state.items.slice(0, 50);
      return state.items.filter(it =>
        it.search.includes(query) || it.value.toLowerCase().includes(query)
      ).slice(0, 50);
    }

    function renderDropdown(list, query) {
      if (!state.items.length) {
        dropdown.innerHTML = '<div class="ss-empty">请先导入或加载销售数据</div>';
        dropdown.classList.remove('hidden');
        return;
      }
      if (!list.length) {
        dropdown.innerHTML = `<div class="ss-empty">${query ? '无匹配项' : '输入编码/名称搜索'}</div>`;
        dropdown.classList.remove('hidden');
        return;
      }
      dropdown.innerHTML = list.map((it, i) =>
        `<button type="button" class="ss-option${i === state.highlight ? ' active' : ''}" data-value="${escapeHtml(it.value)}" data-label="${escapeHtml(it.label)}">${escapeHtml(it.label)}</button>`
      ).join('');
      dropdown.classList.remove('hidden');
      dropdown.querySelectorAll('.ss-option').forEach(btn => {
        btn.addEventListener('mousedown', (e) => {
          e.preventDefault();
          selectItem(btn.dataset.value, btn.dataset.label);
        });
      });
    }

    function selectItem(value, label) {
      input.value = label || value;
      input.dataset.value = value;
      dropdown.classList.add('hidden');
      state.highlight = -1;
      onChange?.();
    }

    function getValue() {
      return (input.dataset.value || input.value).trim();
    }

    function getSearchText() {
      return input.value.trim();
    }

    function setItems(items) {
      state.items = items;
    }

    function reset(silent) {
      input.value = '';
      delete input.dataset.value;
      state.highlight = -1;
      dropdown.classList.add('hidden');
      if (!silent) onChange?.();
    }

    function closeDropdown() {
      state.highlight = -1;
      dropdown.classList.add('hidden');
    }

    input.addEventListener('input', () => {
      delete input.dataset.value;
      const q = input.value.trim();
      if (!q) {
        closeDropdown();
        onChange?.();
        return;
      }
      renderDropdown(filterItems(q), q);
      onChange?.();
    });

    input.addEventListener('focus', () => {
      const q = input.value.trim();
      if (!q) {
        closeDropdown();
        return;
      }
      renderDropdown(filterItems(q), q);
    });

    input.addEventListener('keydown', (e) => {
      const opts = dropdown.querySelectorAll('.ss-option');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        state.highlight = Math.min(state.highlight + 1, opts.length - 1);
        renderDropdown(filterItems(input.value), input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        state.highlight = Math.max(state.highlight - 1, 0);
        renderDropdown(filterItems(input.value), input.value);
      } else if (e.key === 'Enter' && state.highlight >= 0 && opts[state.highlight]) {
        e.preventDefault();
        selectItem(opts[state.highlight].dataset.value, opts[state.highlight].dataset.label);
      } else if (e.key === 'Escape') {
        closeDropdown();
      }
    });

    dropdown.addEventListener('mousedown', (e) => e.preventDefault());

    document.addEventListener('click', (e) => {
      if (!wrap.contains(e.target)) closeDropdown();
    });

    const api = { setItems, getValue, getSearchText, reset, selectItem, closeDropdown };
    instances.set(id, api);
    return api;
  }

  function get(id) { return instances.get(id); }

  return { create, get };
})();
