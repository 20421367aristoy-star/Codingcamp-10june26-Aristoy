/* =====================================================
   BudgetViz — Expense & Budget Visualizer
   script.js — Single JavaScript file
   ===================================================== */

'use strict';

/* =====================================================
   CONSTANTS & CONFIGURATION
   ===================================================== */

/** LocalStorage keys */
const LS_KEYS = {
  TRANSACTIONS: 'budgetviz_transactions',
  CATEGORIES:   'budgetviz_categories',
  THEME:        'budgetviz_theme',
};

/** Default categories that cannot be deleted */
const DEFAULT_CATEGORIES = ['Food', 'Transport', 'Fun', 'Health', 'Shopping', 'Education', 'Bills', 'Other'];

/** Category emoji map for transaction icons */
const CATEGORY_EMOJI = {
  Food:       '🍔',
  Transport:  '🚗',
  Fun:        '🎮',
  Health:     '💊',
  Shopping:   '🛍️',
  Education:  '📚',
  Bills:      '🧾',
  Other:      '📌',
};

/** SVG trash icon for delete button */
const TRASH_ICON = `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
  <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

/** Chart.js color palette (extends dynamically for custom categories) */
const CHART_COLORS = [
  '#667eea', '#f6ad55', '#fc8181', '#68d391',
  '#76e4f7', '#b794f4', '#f687b3', '#90cdf4',
  '#faf089', '#c6f6d5', '#fed7d7', '#e9d8fd',
];

/* =====================================================
   STATE
   ===================================================== */

/** @type {Array<{id:string, name:string, amount:number, category:string, date:string}>} */
let transactions = [];

/** @type {string[]} Custom categories added by the user */
let customCategories = [];

/** @type {Chart|null} Chart.js instance */
let chartInstance = null;

/* =====================================================
   DOM REFERENCES
   ===================================================== */
const DOM = {
  // Sidebar / theme toggles (desktop + mobile)
  themeToggle:        document.getElementById('themeToggle'),
  themeIcon:          document.getElementById('themeIcon'),
  themeLabel:         document.getElementById('themeLabel'),
  themeToggleMobile:  document.getElementById('themeToggleMobile'),
  themeIconMobile:    document.getElementById('themeIconMobile'),

  // Mobile menu
  menuBtn:            document.getElementById('menuBtn'),
  sidebar:            document.getElementById('sidebar'),
  sidebarBackdrop:    document.getElementById('sidebarBackdrop'),

  // Summary
  totalSpending:      document.getElementById('totalSpending'),
  totalTransactions:  document.getElementById('totalTransactions'),

  // Form
  transactionForm:    document.getElementById('transactionForm'),
  itemName:           document.getElementById('itemName'),
  amount:             document.getElementById('amount'),
  category:           document.getElementById('category'),
  nameError:          document.getElementById('nameError'),
  amountError:        document.getElementById('amountError'),
  categoryError:      document.getElementById('categoryError'),

  // Custom Category
  toggleCustomCategory:   document.getElementById('toggleCustomCategory'),
  customCategoryPanel:    document.getElementById('customCategoryPanel'),
  newCategoryInput:       document.getElementById('newCategoryInput'),
  addCategoryBtn:         document.getElementById('addCategoryBtn'),
  categoryAddError:       document.getElementById('categoryAddError'),
  customCategoryList:     document.getElementById('customCategoryList'),

  // Chart
  expenseChart:       document.getElementById('expenseChart'),
  chartWrapper:       document.getElementById('chartWrapper'),
  chartEmpty:         document.getElementById('chartEmpty'),

  // Transactions
  searchInput:        document.getElementById('searchInput'),
  sortSelect:         document.getElementById('sortSelect'),
  transactionList:    document.getElementById('transactionList'),
  emptyState:         document.getElementById('emptyState'),
};

/* =====================================================
   LOCAL STORAGE — PERSISTENCE
   ===================================================== */

/**
 * Load transactions from localStorage.
 * Falls back to empty array if nothing stored or JSON is invalid.
 */
function loadTransactions() {
  try {
    const raw = localStorage.getItem(LS_KEYS.TRANSACTIONS);
    transactions = raw ? JSON.parse(raw) : [];
  } catch {
    transactions = [];
  }
}

/**
 * Save current transactions array to localStorage.
 */
function saveTransactions() {
  localStorage.setItem(LS_KEYS.TRANSACTIONS, JSON.stringify(transactions));
}

/**
 * Load custom categories from localStorage.
 */
function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(LS_KEYS.CATEGORIES);
    customCategories = raw ? JSON.parse(raw) : [];
  } catch {
    customCategories = [];
  }
}

/**
 * Save current custom categories to localStorage.
 */
function saveCustomCategories() {
  localStorage.setItem(LS_KEYS.CATEGORIES, JSON.stringify(customCategories));
}

/* =====================================================
   THEME — DARK / LIGHT MODE
   ===================================================== */

/**
 * Load saved theme preference and apply it.
 */
function loadTheme() {
  const saved = localStorage.getItem(LS_KEYS.THEME) || 'light';
  applyTheme(saved);
}

/**
 * Toggle between light and dark themes.
 */
function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  localStorage.setItem(LS_KEYS.THEME, next);
}

/**
 * Apply a theme to the document and update the toggle button.
 * @param {'light'|'dark'} theme
 */
function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);

  const isDark = theme === 'dark';
  const icon   = isDark ? '☀️' : '🌙';
  const label  = isDark ? 'Light Mode' : 'Dark Mode';

  if (DOM.themeIcon)        DOM.themeIcon.textContent  = icon;
  if (DOM.themeLabel)       DOM.themeLabel.textContent = label;
  if (DOM.themeIconMobile)  DOM.themeIconMobile.textContent = icon;

  // Re-render chart with correct colors
  if (chartInstance) {
    chartInstance.destroy();
    chartInstance = null;
    updateChart();
  }
}

/* =====================================================
   CATEGORY MANAGEMENT
   ===================================================== */

/**
 * All categories = defaults + user-added custom ones.
 * @returns {string[]}
 */
function getAllCategories() {
  return [...DEFAULT_CATEGORIES, ...customCategories];
}

/**
 * Populate the category <select> with all current categories.
 */
function renderCategorySelect() {
  const current = DOM.category.value;
  DOM.category.innerHTML = getAllCategories()
    .map(cat => `<option value="${escapeHtml(cat)}"${cat === current ? ' selected' : ''}>${escapeHtml(cat)}</option>`)
    .join('');
}

/**
 * Render custom category chips in the management panel.
 */
function renderCustomCategoryChips() {
  if (customCategories.length === 0) {
    DOM.customCategoryList.innerHTML = '<p class="cat-empty-hint">No custom categories yet.</p>';
    return;
  }

  DOM.customCategoryList.innerHTML = customCategories
    .map(cat => `
      <span class="cat-chip">
        ${escapeHtml(cat)}
        <button
          class="cat-chip__del"
          data-cat="${escapeHtml(cat)}"
          aria-label="Delete ${escapeHtml(cat)} category"
          title="Delete"
        >×</button>
      </span>
    `)
    .join('');
}

/**
 * Add a new custom category.
 */
function addCustomCategory() {
  const name = DOM.newCategoryInput.value.trim();

  // Validate
  if (!name) {
    showFieldError(DOM.categoryAddError, 'Category name is required.');
    return;
  }
  if (getAllCategories().some(c => c.toLowerCase() === name.toLowerCase())) {
    showFieldError(DOM.categoryAddError, 'Category already exists.');
    return;
  }

  clearFieldError(DOM.categoryAddError);
  customCategories.push(name);
  saveCustomCategories();
  DOM.newCategoryInput.value = '';
  renderCategorySelect();
  renderCustomCategoryChips();
  showToast(`Category "${name}" added!`, 'success');
}

/**
 * Delete a custom category by name.
 * @param {string} name
 */
function deleteCustomCategory(name) {
  customCategories = customCategories.filter(c => c !== name);
  saveCustomCategories();
  renderCategorySelect();
  renderCustomCategoryChips();
  showToast(`Category "${name}" removed.`, 'danger');
}

/* =====================================================
   FORM — ADD TRANSACTION
   ===================================================== */

/**
 * Handle form submission — validate, create transaction, save & render.
 * @param {SubmitEvent} e
 */
function handleFormSubmit(e) {
  e.preventDefault();

  const name     = DOM.itemName.value.trim();
  const amount   = parseFloat(DOM.amount.value);
  const category = DOM.category.value;

  let valid = true;

  // Validate name
  if (!name) {
    showFieldError(DOM.nameError, 'Item name is required.');
    DOM.itemName.classList.add('form__input--error');
    valid = false;
  } else {
    clearFieldError(DOM.nameError);
    DOM.itemName.classList.remove('form__input--error');
  }

  // Validate amount
  if (!DOM.amount.value || isNaN(amount) || amount <= 0) {
    showFieldError(DOM.amountError, 'Enter a valid amount greater than 0.');
    DOM.amount.classList.add('form__input--error');
    valid = false;
  } else {
    clearFieldError(DOM.amountError);
    DOM.amount.classList.remove('form__input--error');
  }

  // Validate category
  if (!category) {
    showFieldError(DOM.categoryError, 'Please select a category.');
    DOM.category.classList.add('form__input--error');
    valid = false;
  } else {
    clearFieldError(DOM.categoryError);
    DOM.category.classList.remove('form__input--error');
  }

  if (!valid) return;

  addTransaction(name, amount, category);
  DOM.transactionForm.reset();
}

/**
 * Create and save a new transaction.
 * @param {string} name
 * @param {number} amount
 * @param {string} category
 */
function addTransaction(name, amount, category) {
  const transaction = {
    id:       String(Date.now()) + Math.random().toString(36).slice(2, 7),
    name,
    amount,
    category,
    date:     new Date().toISOString(),
  };

  transactions.unshift(transaction); // newest first
  saveTransactions();
  updateAll();
  showToast(`"${name}" added successfully!`, 'success');
}

/**
 * Delete a transaction by id.
 * @param {string} id
 */
function deleteTransaction(id) {
  const tx = transactions.find(t => t.id === id);
  transactions = transactions.filter(t => t.id !== id);
  saveTransactions();
  updateAll();
  if (tx) showToast(`"${tx.name}" deleted.`, 'danger');
}

/* =====================================================
   SEARCH & SORT
   ===================================================== */

/**
 * Filter transactions by the current search query.
 * @param {Array} list
 * @returns {Array}
 */
function searchTransactions(list) {
  const query = DOM.searchInput.value.trim().toLowerCase();
  if (!query) return list;
  return list.filter(t =>
    t.name.toLowerCase().includes(query) ||
    t.category.toLowerCase().includes(query)
  );
}

/**
 * Sort transactions by the current sort selection.
 * @param {Array} list
 * @returns {Array}
 */
function sortTransactions(list) {
  const value = DOM.sortSelect.value;
  const sorted = [...list];

  switch (value) {
    case 'date-desc':
      return sorted.sort((a, b) => new Date(b.date) - new Date(a.date));
    case 'date-asc':
      return sorted.sort((a, b) => new Date(a.date) - new Date(b.date));
    case 'amount-asc':
      return sorted.sort((a, b) => a.amount - b.amount);
    case 'amount-desc':
      return sorted.sort((a, b) => b.amount - a.amount);
    case 'category-az':
      return sorted.sort((a, b) => a.category.localeCompare(b.category));
    case 'category-za':
      return sorted.sort((a, b) => b.category.localeCompare(a.category));
    default:
      return sorted;
  }
}

/* =====================================================
   RENDER FUNCTIONS
   ===================================================== */

/**
 * Render the transaction list based on current search/sort state.
 */
function renderTransactions() {
  const filtered = sortTransactions(searchTransactions(transactions));

  if (filtered.length === 0) {
    DOM.transactionList.innerHTML = '';
    DOM.emptyState.hidden = false;
    return;
  }

  DOM.emptyState.hidden = true;
  DOM.transactionList.innerHTML = filtered
    .map(tx => buildTransactionCard(tx))
    .join('');
}

/**
 * Build HTML string for a single transaction card.
 * @param {{id:string, name:string, amount:number, category:string, date:string}} tx
 * @returns {string}
 */
function buildTransactionCard(tx) {
  const emoji   = CATEGORY_EMOJI[tx.category] || '💰';
  const dateStr = formatDate(tx.date);
  const amount  = formatCurrency(tx.amount);

  return `
    <div class="tx-item" data-id="${tx.id}" data-category="${escapeHtml(tx.category)}">
      <div class="tx-item__bubble">${emoji}</div>
      <div class="tx-item__body">
        <p class="tx-item__name" title="${escapeHtml(tx.name)}">${escapeHtml(tx.name)}</p>
        <div class="tx-item__meta">
          <span class="tx-item__tag">${escapeHtml(tx.category)}</span>
          <span class="tx-item__date">${dateStr}</span>
        </div>
      </div>
      <div class="tx-item__right">
        <span class="tx-item__amount">-${amount}</span>
        <button
          class="btn--delete"
          data-delete="${tx.id}"
          aria-label="Delete transaction ${escapeHtml(tx.name)}"
          title="Delete"
        >${TRASH_ICON}</button>
      </div>
    </div>
  `;
}

/**
 * Update the summary cards (Total Spending & Count).
 */
function updateSummary() {
  const total = transactions.reduce((sum, t) => sum + t.amount, 0);
  DOM.totalSpending.textContent     = formatCurrency(total);
  DOM.totalTransactions.textContent = transactions.length;
}

/**
 * Update the Chart.js pie chart with current category totals.
 */
function updateChart() {
  // Aggregate by category
  const categoryMap = {};
  transactions.forEach(tx => {
    categoryMap[tx.category] = (categoryMap[tx.category] || 0) + tx.amount;
  });

  const labels = Object.keys(categoryMap);
  const data   = Object.values(categoryMap);

  // No data — show empty state
  if (labels.length === 0) {
    DOM.chartWrapper.hidden = true;
    DOM.chartEmpty.hidden   = false;
    if (chartInstance) {
      chartInstance.destroy();
      chartInstance = null;
    }
    return;
  }

  DOM.chartWrapper.hidden = false;
  DOM.chartEmpty.hidden   = true;

  const isDark     = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor  = isDark ? '#a5a3bb' : '#4e4b66';
  const borderCol  = isDark ? '#1d2035' : '#ffffff';

  // Refined chart color palette
  const CHART_PALETTE = [
    '#6c63ff','#3ecfcf','#f97316','#ec4899',
    '#22c55e','#3b82f6','#f59e0b','#8b5cf6',
    '#06b6d4','#ef4444','#84cc16','#a855f7',
  ];

  const colors = labels.map((_, i) => CHART_PALETTE[i % CHART_PALETTE.length]);

  if (chartInstance) {
    chartInstance.data.labels             = labels;
    chartInstance.data.datasets[0].data   = data;
    chartInstance.data.datasets[0].backgroundColor = colors;
    chartInstance.data.datasets[0].borderColor      = borderCol;
    chartInstance.options.plugins.legend.labels.color = textColor;
    chartInstance.update('active');
    return;
  }

  // Create new chart
  chartInstance = new Chart(DOM.expenseChart, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor:  colors,
        borderColor:      borderCol,
        borderWidth:      3,
        hoverOffset:      10,
        borderRadius:     4,
      }],
    },
    options: {
      responsive:          true,
      maintainAspectRatio: true,
      cutout:              '62%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color:           textColor,
            font:            { size: 11.5, family: 'Inter, system-ui, sans-serif', weight: '500' },
            padding:         14,
            usePointStyle:   true,
            pointStyleWidth: 8,
            boxHeight:       8,
          },
        },
        tooltip: {
          backgroundColor: isDark ? '#1d2035' : '#ffffff',
          titleColor:      isDark ? '#f0eeff' : '#14142b',
          bodyColor:       isDark ? '#a5a3bb' : '#4e4b66',
          borderColor:     isDark ? '#252840' : '#e8eaf2',
          borderWidth:     1,
          padding:         12,
          cornerRadius:    10,
          callbacks: {
            label: (ctx) => {
              const val   = ctx.parsed;
              const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
              const pct   = ((val / total) * 100).toFixed(1);
              return `  ${ctx.label}:  ${formatCurrency(val)}  (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

/* =====================================================
   MAIN UPDATE ORCHESTRATOR
   ===================================================== */

/**
 * Run all render/update functions after any data change.
 */
function updateAll() {
  renderTransactions();
  updateSummary();
  updateChart();
}

/* =====================================================
   UTILITY FUNCTIONS
   ===================================================== */

/**
 * Format a number as Indonesian Rupiah (Rp 100.000).
 * @param {number} amount
 * @returns {string}
 */
function formatCurrency(amount) {
  return 'Rp ' + Math.round(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

/**
 * Format an ISO date string to a human-readable format.
 * @param {string} isoString
 * @returns {string}
 */
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString('id-ID', {
    day:   '2-digit',
    month: 'short',
    year:  'numeric',
  });
}

/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Show a field-level validation error message.
 * @param {HTMLElement} el
 * @param {string} msg
 */
function showFieldError(el, msg) {
  el.textContent = msg;
}

/**
 * Clear a field-level validation error message.
 * @param {HTMLElement} el
 */
function clearFieldError(el) {
  el.textContent = '';
}

/* =====================================================
   TOAST NOTIFICATIONS
   ===================================================== */

/**
 * Show a floating toast notification.
 * @param {string} message
 * @param {'success'|'danger'} type
 */
function showToast(message, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const icon  = type === 'success' ? '✅' : '🗑️';
  const label = type === 'success' ? 'Done' : 'Removed';

  const toast = document.createElement('div');
  toast.className = `toast toast--${type}`;
  toast.style.position = 'relative';
  toast.style.overflow = 'hidden';
  toast.innerHTML = `
    <div class="toast__icon">${icon}</div>
    <div class="toast__body">
      <strong>${label}</strong>
      <span>${escapeHtml(message)}</span>
    </div>
    <div class="toast__progress"></div>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('toast--leaving');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  }, 3000);
}

/* =====================================================
   EVENT LISTENERS
   ===================================================== */

/** Desktop theme toggle */
DOM.themeToggle.addEventListener('click', toggleTheme);

/** Mobile theme toggle */
if (DOM.themeToggleMobile) {
  DOM.themeToggleMobile.addEventListener('click', toggleTheme);
}

/** Mobile sidebar open/close */
if (DOM.menuBtn && DOM.sidebar && DOM.sidebarBackdrop) {
  DOM.menuBtn.addEventListener('click', () => {
    const isOpen = DOM.sidebar.classList.toggle('open');
    DOM.menuBtn.setAttribute('aria-expanded', String(isOpen));
    DOM.sidebarBackdrop.classList.toggle('visible', isOpen);
  });

  DOM.sidebarBackdrop.addEventListener('click', () => {
    DOM.sidebar.classList.remove('open');
    DOM.menuBtn.setAttribute('aria-expanded', 'false');
    DOM.sidebarBackdrop.classList.remove('visible');
  });
}

/** Form submit */
DOM.transactionForm.addEventListener('submit', handleFormSubmit);

/** Clear errors on input */
DOM.itemName.addEventListener('input', () => {
  clearFieldError(DOM.nameError);
  DOM.itemName.classList.remove('form__input--error');
});
DOM.amount.addEventListener('input', () => {
  clearFieldError(DOM.amountError);
  DOM.amount.classList.remove('form__input--error');
});
DOM.category.addEventListener('change', () => {
  clearFieldError(DOM.categoryError);
  DOM.category.classList.remove('form__input--error');
});

/** Delete transaction (event delegation on list) */
DOM.transactionList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-delete]');
  if (btn) deleteTransaction(btn.dataset.delete);
});

/** Search input — real-time filter */
DOM.searchInput.addEventListener('input', renderTransactions);

/** Sort select — instant re-sort */
DOM.sortSelect.addEventListener('change', renderTransactions);

/** Custom category panel toggle */
DOM.toggleCustomCategory.addEventListener('click', () => {
  const isHidden = DOM.customCategoryPanel.hidden;
  DOM.customCategoryPanel.hidden = !isHidden;
  DOM.toggleCustomCategory.setAttribute('aria-expanded', String(isHidden));
});

/** Add custom category button */
DOM.addCategoryBtn.addEventListener('click', addCustomCategory);

/** Add custom category on Enter key */
DOM.newCategoryInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addCustomCategory();
  }
});

/** Clear category add error on input */
DOM.newCategoryInput.addEventListener('input', () => {
  clearFieldError(DOM.categoryAddError);
});

/** Delete custom category (event delegation) */
DOM.customCategoryList.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-cat]');
  if (btn) deleteCustomCategory(btn.dataset.cat);
});

/* =====================================================
   INITIALISATION
   ===================================================== */

/**
 * Bootstrap the application on page load.
 */
function init() {
  loadTheme();
  loadTransactions();
  loadCustomCategories();
  renderCategorySelect();
  renderCustomCategoryChips();
  updateAll();
}

// Run on DOM ready
document.addEventListener('DOMContentLoaded', init);
