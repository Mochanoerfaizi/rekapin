import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const isConfigured =
  Boolean(supabaseUrl && supabaseKey) &&
  !supabaseUrl.includes("your-project") &&
  !supabaseKey.includes("your-supabase");
const supabase = isConfigured ? createClient(supabaseUrl, supabaseKey) : null;

const authScreen = document.querySelector("#authScreen");
const authContent = document.querySelector("#authContent");
const configHelp = document.querySelector("#configHelp");
const authForm = document.querySelector("#authForm");
const authFeedback = document.querySelector("#authFeedback");
const appShell = document.querySelector("#appShell");
const transactionModal = document.querySelector("#transactionModal");
const transactionForm = document.querySelector("#transactionForm");
const transactionRows = document.querySelector("#transactionRows");
const searchInput = document.querySelector("#transactionSearch");
const toast = document.querySelector("#toast");
const sidebar = document.querySelector("#sidebar");

let authMode = "signin";
let transactionType = "expense";
let currentUser = null;
let accounts = [];
let categories = [];
let transactions = [];
let budgets = [];
let toastTimeout;
let currentPage = "dashboard";
let greetingTitle = "Selamat pagi";

const formatRupiah = (amount) =>
  new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount) || 0);

function getLocalDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function showToast(message, isError = false) {
  toast.textContent = message;
  toast.classList.toggle("toast-error", isError);
  toast.classList.add("show");
  window.clearTimeout(toastTimeout);
  toastTimeout = window.setTimeout(() => toast.classList.remove("show"), 3500);
}

function showAuthFeedback(message, isError = false) {
  authFeedback.textContent = message;
  authFeedback.classList.toggle("error", isError);
}

function getAuthErrorMessage(error) {
  const message = error?.message || "Terjadi kesalahan yang tidak diketahui.";
  if (message.toLowerCase().includes("database error saving new user")) {
    return "Pendaftaran belum tersimpan karena tabel database belum siap. Jalankan supabase/schema.sql di Supabase SQL Editor, lalu coba daftar lagi.";
  }
  if (message.toLowerCase().includes("invalid login credentials")) {
    return "Email atau kata sandi tidak cocok. Jika baru mendaftar, pastikan schema database sudah dijalankan dan konfirmasi email selesai.";
  }
  return message;
}

function showSignedOutScreen() {
  currentUser = null;
  appShell.hidden = true;
  authScreen.hidden = false;
  if (isConfigured) {
    configHelp.hidden = true;
    authContent.hidden = false;
  }
}

function setAuthMode(mode) {
  authMode = mode;
  const isSignup = mode === "signup";
  document.querySelector("#authKicker").textContent = isSignup
    ? "BUAT AKUN REKAP.IN"
    : "MULAI KELOLA KEUANGAN";
  document.querySelector("#authTitle").textContent = isSignup
    ? "Buat akunmu"
    : "Masuk ke akunmu";
  document.querySelector("#authDescription").textContent = isSignup
    ? "Buat akun pribadi untuk mulai mencatat keuanganmu."
    : "Catatan keuanganmu tersimpan aman di akun pribadi.";
  document.querySelector("#signupNameField").hidden = !isSignup;
  authForm.elements.name.required = isSignup;
  authForm.elements.password.autocomplete = isSignup
    ? "new-password"
    : "current-password";
  document.querySelector("#authSubmit").textContent = isSignup
    ? "Buat akun"
    : "Masuk";
  document.querySelector("#authToggleText").textContent = isSignup
    ? "Sudah punya akun?"
    : "Belum punya akun?";
  document.querySelector("#authToggle").textContent = isSignup
    ? "Masuk"
    : "Daftar";
  showAuthFeedback("");
}

function setBudgetProgress(progress, percentage) {
  progress.style.width = `${Math.min(100, percentage)}%`;
  progress.classList.toggle("progress-yellow", percentage >= 70 && percentage <= 90);
  progress.classList.toggle("progress-red", percentage > 90);
}

function renderChart() {
  const chart = document.querySelector("#chartBars");
  chart.replaceChildren();

  const days = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return getLocalDateValue(date);
  });
  const totalsByDate = new Map(days.map((date) => [date, { income: 0, expense: 0 }]));

  transactions.forEach((transaction) => {
    const totals = totalsByDate.get(transaction.date);
    if (totals) totals[transaction.type] += Number(transaction.amount);
  });

  const maxTotal = Math.max(
    1,
    ...[...totalsByDate.values()].map(({ income, expense }) =>
      Math.max(income, expense),
    ),
  );
  const dayNames = new Intl.DateTimeFormat("id-ID", { weekday: "short" });

  days.forEach((date) => {
    const totals = totalsByDate.get(date);
    const day = document.createElement("div");
    day.className = "chart-day";
    const pair = document.createElement("div");
    pair.className = "bar-pair";
    ["income", "expense"].forEach((type) => {
      const bar = document.createElement("i");
      bar.className = `bar ${type}`;
      bar.style.height = `${(totals[type] / maxTotal) * 95}%`;
      pair.append(bar);
    });
    const label = document.createElement("span");
    label.textContent = dayNames.format(new Date(`${date}T12:00:00`));
    day.append(pair, label);
    chart.append(day);
  });

  const compactCurrency = new Intl.NumberFormat("id-ID", {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  document.querySelectorAll(".chart-y-labels span").forEach((label, index) => {
    const value = maxTotal * ((3 - index) / 3);
    label.textContent = value
      ? `Rp ${compactCurrency.format(value)}`
      : "Rp 0";
  });
}

function renderAccountOptions() {
  const walletSelect = document.querySelector("#walletInput");
  walletSelect.replaceChildren();
  accounts.forEach((account) => {
    const option = document.createElement("option");
    option.value = account.id;
    option.textContent = account.name;
    walletSelect.append(option);
  });
}

function renderCategoryOptions() {
  const categorySelect = document.querySelector("#categoryInput");
  categorySelect.replaceChildren();
  categories
    .filter((category) => category.type === "expense")
    .forEach((category) => {
      const option = document.createElement("option");
      option.value = category.id;
      option.textContent = category.name;
      categorySelect.append(option);
    });
}

function createTransactionRow(transaction) {
  const row = document.createElement("tr");
  const isIncome = transaction.type === "income";
  const categoryName = transaction.category?.name || "Kategori";
  const accountName = transaction.account?.name || "Dompet";
  const note = transaction.notes || categoryName;
  row.dataset.search =
    `${note} ${categoryName} ${accountName}`.toLocaleLowerCase("id-ID");

  const transactionCell = document.createElement("td");
  const nameWrap = document.createElement("div");
  nameWrap.className = "transaction-name";
  const icon = document.createElement("span");
  icon.className = `transaction-icon ${isIncome ? "salary-icon" : "shopping-icon"}`;
  icon.textContent = isIncome ? "↙" : transaction.category?.icon || "✦";
  const nameCopy = document.createElement("span");
  const name = document.createElement("strong");
  name.textContent = note;
  const description = document.createElement("small");
  description.textContent = isIncome ? "Pemasukan bulanan" : categoryName;
  nameCopy.append(name, description);
  nameWrap.append(icon, nameCopy);
  transactionCell.append(nameWrap);

  const categoryCell = document.createElement("td");
  const categoryPill = document.createElement("span");
  categoryPill.className = `category-pill${isIncome ? " income-pill" : ""}`;
  categoryPill.textContent = categoryName;
  categoryCell.append(categoryPill);

  const dateCell = document.createElement("td");
  dateCell.className = "date-cell";
  dateCell.textContent = new Intl.DateTimeFormat("id-ID", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(`${transaction.date}T12:00:00`));

  const accountCell = document.createElement("td");
  const wallet = document.createElement("span");
  wallet.className = "wallet-cell";
  const walletDot = document.createElement("i");
  const accountType = accounts.find((account) => account.id === transaction.account_id)?.type;
  walletDot.className = `wallet-dot ${
    accountType === "cash"
      ? "wallet-orange"
      : accountType === "e-wallet"
        ? "wallet-green"
        : "wallet-purple"
  }`;
  wallet.append(walletDot, document.createTextNode(accountName));
  accountCell.append(wallet);

  const amountCell = document.createElement("td");
  amountCell.className = `amount-cell ${isIncome ? "income-amount" : "expense-amount"}`;
  amountCell.textContent = `${isIncome ? "+" : "−"} ${formatRupiah(transaction.amount)}`;
  row.append(transactionCell, categoryCell, dateCell, accountCell, amountCell);
  return row;
}

function renderTransactions() {
  transactionRows.replaceChildren(...transactions.map(createTransactionRow));
  applySearch();
}

function renderBudgets() {
  const list = document.querySelector("#categoryBudgetList");
  list.replaceChildren();
  const today = getLocalDateValue();
  const activeBudgets = budgets.filter(
    (budget) => budget.start_date <= today && budget.end_date >= today,
  );
  let spentTotal = 0;
  let targetTotal = 0;

  activeBudgets.forEach((budget) => {
    const spent = transactions
      .filter(
        (transaction) =>
          transaction.type === "expense" &&
          transaction.category_id === budget.category_id &&
          transaction.date >= budget.start_date &&
          transaction.date <= budget.end_date,
      )
      .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
    const target = Number(budget.target_amount);
    const percentage = target ? Math.round((spent / target) * 100) : 0;
    spentTotal += spent;
    targetTotal += target;

    const item = document.createElement("div");
    item.className = "category-budget";
    const icon = document.createElement("span");
    icon.className = "category-emoji food-bg";
    icon.textContent = budget.category?.icon || "✦";
    const content = document.createElement("div");
    content.className = "category-budget-content";
    const top = document.createElement("div");
    top.className = "category-budget-top";
    const name = document.createElement("strong");
    name.textContent = budget.category?.name || "Anggaran";
    const amounts = document.createElement("span");
    amounts.append(document.createTextNode(`${formatRupiah(spent)} `));
    const targetLabel = document.createElement("small");
    targetLabel.textContent = `/ ${formatRupiah(target)}`;
    amounts.append(targetLabel);
    top.append(name, amounts);
    const track = document.createElement("div");
    track.className = "progress-track";
    const progress = document.createElement("span");
    setBudgetProgress(progress, percentage);
    track.append(progress);
    content.append(top, track);
    item.append(icon, content);
    list.append(item);
  });

  const spent = transactions
    .filter((transaction) => {
      const budget = activeBudgets.find(
        (item) => item.category_id === transaction.category_id,
      );
      return (
        transaction.type === "expense" &&
        budget &&
        transaction.date >= budget.start_date &&
        transaction.date <= budget.end_date
      );
    })
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const percentage = targetTotal ? Math.round((spent / targetTotal) * 100) : 0;
  document.querySelector("#budgetSpent").textContent = formatRupiah(spent);
  document.querySelector("#budgetTarget").textContent = formatRupiah(targetTotal);
  document.querySelector("#budgetPercent").textContent = `${percentage}%`;
  document.querySelector("#budgetRemaining").textContent = formatRupiah(
    Math.max(0, targetTotal - spent),
  );
  setBudgetProgress(document.querySelector(".overall-progress > span"), percentage);
  document.querySelector("#budgetEmpty").hidden = activeBudgets.length > 0;
}

function renderWallets() {
  const list = document.querySelector("#walletList");
  list.replaceChildren();
  accounts.forEach((account) => {
    const item = document.createElement("div");
    item.className = "wallet-card";
    const dot = document.createElement("i");
    dot.className = `wallet-dot ${
      account.type === "cash"
        ? "wallet-orange"
        : account.type === "e-wallet"
          ? "wallet-green"
          : "wallet-purple"
    }`;
    item.append(dot, document.createTextNode(account.name));
    list.append(item);
  });
  document.querySelector("#walletEmpty").hidden = accounts.length > 0;
}

function updateDashboardData() {
  const today = getLocalDateValue();
  const month = today.slice(0, 7);
  const balance = accounts.reduce(
    (total, account) => total + Number(account.balance),
    0,
  );
  const monthTransactions = transactions.filter((transaction) =>
    transaction.date.startsWith(month),
  );
  const income = monthTransactions
    .filter((transaction) => transaction.type === "income")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);
  const expense = monthTransactions
    .filter((transaction) => transaction.type === "expense")
    .reduce((total, transaction) => total + Number(transaction.amount), 0);

  document.querySelector("#totalBalance").textContent = formatRupiah(balance);
  document.querySelector("#totalIncome").textContent = formatRupiah(income);
  document.querySelector("#totalExpense").textContent = formatRupiah(expense);
  document.querySelector("#transactionCount").textContent = transactions.length;
  document.querySelector("#totalRecordCount").textContent = transactions.length;
  renderBudgets();
  renderWallets();
  renderChart();
}

async function loadDashboard() {
  const [profileResult, accountsResult, categoriesResult, transactionsResult, budgetsResult] =
    await Promise.all([
      supabase.from("profiles").select("name,email,currency").eq("id", currentUser.id).single(),
      supabase.from("accounts").select("id,name,type,balance").order("created_at"),
      supabase.from("categories").select("id,name,type,icon").order("name"),
      supabase
        .from("transactions")
        .select(
          "id,user_id,account_id,category_id,amount,type,notes,date,created_at,category:categories(name,icon),account:accounts(name)",
        )
        .order("date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase
        .from("budgets")
        .select(
          "id,category_id,target_amount,period,start_date,end_date,category:categories(name,icon)",
        )
        .order("start_date"),
    ]);
  const results = [
    profileResult,
    accountsResult,
    categoriesResult,
    transactionsResult,
    budgetsResult,
  ];
  const failed = results.find((result) => result.error);
  if (failed) throw failed.error;

  accounts = accountsResult.data;
  categories = categoriesResult.data;
  transactions = transactionsResult.data;
  budgets = budgetsResult.data;

  const profile = profileResult.data;
  const name = profile.name || currentUser.user_metadata?.name || currentUser.email;
  greetingTitle = `Selamat pagi, ${name}`;
  document.querySelector("#sidebarUserName").textContent = name;
  document.querySelector("#sidebarUserEmail").textContent = currentUser.email;
  document.querySelector("#topUserName").textContent = name;
  renderAccountOptions();
  renderCategoryOptions();
  renderTransactions();
  updateDashboardData();
  showPage(currentPage);
}

async function showUserDashboard(user) {
  currentUser = user;
  if (!user) {
    showSignedOutScreen();
    return;
  }
  authScreen.hidden = true;
  appShell.hidden = false;
  try {
    await loadDashboard();
  } catch (error) {
    currentUser = null;
    appShell.hidden = true;
    authScreen.hidden = false;
    authContent.hidden = false;
    configHelp.hidden = true;
    showAuthFeedback(
      `Gagal memuat database: ${error.message}. Pastikan schema Supabase sudah dijalankan.`,
      true,
    );
  }
}

function openTransactionModal() {
  transactionForm.reset();
  transactionForm.elements.date.value = getLocalDateValue();
  setTransactionType("expense");
  transactionModal.hidden = false;
  document.body.style.overflow = "hidden";
  document.querySelector("#amountInput").focus();
}

function closeTransactionModal() {
  transactionModal.hidden = true;
  document.body.style.overflow = "";
}

function setTransactionType(type) {
  transactionType = type;
  const isIncome = type === "income";
  document.querySelectorAll(".type-option").forEach((option) => {
    option.classList.toggle("selected", option.dataset.type === type);
  });
  document.querySelector("#modalTitle").textContent = isIncome
    ? "Catat pemasukan bulanan"
    : "Catat pengeluaran";
  document.querySelector("#amountLabel").textContent = isIncome
    ? "Uang bulanan"
    : "Nominal";
  document.querySelector("#incomeDescription").hidden = !isIncome;
  document.querySelector("#expenseFields").hidden = isIncome;
  document.querySelector("#categoryInput").disabled = isIncome;
  document.querySelector("#categoryInput").required = !isIncome;
  document.querySelector("#walletInput").required = !isIncome;
  transactionForm.elements.date.required = !isIncome;
  document.querySelector("#saveTransaction").textContent = isIncome
    ? "Simpan pemasukan"
    : "Simpan transaksi";
}

async function saveTransaction(event) {
  event.preventDefault();
  if (!transactionForm.reportValidity()) return;

  const data = new FormData(transactionForm);
  const isIncome = transactionType === "income";
  const category = isIncome
    ? categories.find((item) => item.type === "income")
    : categories.find((item) => item.id === data.get("category"));
  const account = isIncome
    ? accounts.find((item) => item.name === "Cash") || accounts[0]
    : accounts.find((item) => item.id === data.get("wallet"));
  if (!category || !account) {
    showToast("Kategori atau dompet belum tersedia. Muat ulang data akun.", true);
    return;
  }

  const amount = Number(data.get("amount"));
  const payload = {
    user_id: currentUser.id,
    account_id: account.id,
    category_id: category.id,
    amount,
    type: transactionType,
    notes: isIncome ? "Pemasukan bulanan" : data.get("notes")?.trim() || "",
    date: isIncome ? getLocalDateValue() : data.get("date"),
  };
  const saveButton = document.querySelector("#saveTransaction");
  saveButton.disabled = true;
  try {
    const { error } = await supabase.from("transactions").insert(payload);
    if (error) throw error;
  } catch (error) {
    showToast(`Transaksi gagal disimpan: ${error.message}`, true);
    saveButton.disabled = false;
    return;
  }

  try {
    await loadDashboard();
  } catch (error) {
    showToast(`Transaksi tersimpan, tetapi data gagal dimuat ulang: ${error.message}`, true);
    saveButton.disabled = false;
    return;
  }

  transactionForm.reset();
  transactionForm.elements.date.value = getLocalDateValue();
  setTransactionType("expense");
  closeTransactionModal();
  showToast("Transaksi berhasil disimpan.");
  saveButton.disabled = false;
}

function applySearch() {
  const query = searchInput.value.trim().toLocaleLowerCase("id-ID");
  let visibleCount = 0;
  [...transactionRows.children].forEach((row) => {
    const matches = !query || row.dataset.search.includes(query);
    row.hidden = !matches;
    if (matches) visibleCount += 1;
  });
  document.querySelector("#resultCount").textContent = visibleCount;
  const emptyState = document.querySelector("#emptySearch");
  emptyState.hidden = visibleCount > 0;
  emptyState.textContent =
    transactions.length === 0
      ? "Belum ada transaksi. Tambahkan transaksi pertama untuk mulai mencatat."
      : "Tidak ada transaksi yang cocok dengan pencarianmu.";
}

function exportTransactions() {
  const visibleRows = [...transactionRows.children].filter((row) => !row.hidden);
  const csvRows = [
    ["Tanggal", "Jenis", "Kategori", "Sumber Dana", "Nominal", "Catatan"],
    ...visibleRows.map((row) => {
      const cells = row.querySelectorAll("td");
      const isIncome = cells[4].classList.contains("income-amount");
      return [
        cells[2].textContent.trim(),
        isIncome ? "Pemasukan" : "Pengeluaran",
        cells[1].textContent.trim(),
        cells[3].textContent.trim(),
        cells[4].textContent.replace(/[^\d]/g, ""),
        cells[0].querySelector("strong").textContent.trim(),
      ];
    }),
  ];
  const csv = csvRows
    .map((row) =>
      row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
    )
    .join("\r\n");
  const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "laporan-transaksi-rekap-in.csv";
  link.click();
  URL.revokeObjectURL(url);
  showToast("Laporan transaksi berhasil diunduh.");
}

document.querySelector("#authToggle").addEventListener("click", () => {
  setAuthMode(authMode === "signin" ? "signup" : "signin");
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!authForm.reportValidity()) return;
  const submit = document.querySelector("#authSubmit");
  const data = new FormData(authForm);
  const email = String(data.get("email")).trim();
  const password = String(data.get("password"));
  submit.disabled = true;
  showAuthFeedback("");

  try {
    if (authMode === "signup") {
      const { data: result, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { name: String(data.get("name")).trim() } },
      });
      if (error) throw error;
      if (result.session) {
        authForm.reset();
        await showUserDashboard(result.user);
      } else {
        showAuthFeedback(
          "Akun berhasil dibuat. Periksa email untuk konfirmasi, lalu masuk.",
        );
        setAuthMode("signin");
      }
    } else {
      const { data: result, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) throw error;
      authForm.reset();
      await showUserDashboard(result.user);
    }
  } catch (error) {
    showAuthFeedback(getAuthErrorMessage(error), true);
  } finally {
    submit.disabled = false;
  }
});

document.querySelector("#addTransaction").addEventListener("click", openTransactionModal);
document.querySelector("#closeModal").addEventListener("click", closeTransactionModal);
document.querySelector("#cancelModal").addEventListener("click", closeTransactionModal);
transactionModal.addEventListener("click", (event) => {
  if (event.target === transactionModal) closeTransactionModal();
});
transactionForm.addEventListener("submit", saveTransaction);
document.querySelectorAll(".type-option").forEach((button) => {
  button.addEventListener("click", () => setTransactionType(button.dataset.type));
});
searchInput.addEventListener("input", applySearch);
document.querySelector("#focusSearch").addEventListener("click", () => searchInput.focus());
document.querySelector("#exportButton").addEventListener("click", exportTransactions);
document.querySelector("#mobileMenu").addEventListener("click", () => {
  sidebar.classList.toggle("mobile-open");
});
document.querySelectorAll("#topLogout, #sidebarLogout").forEach((button) => {
  button.addEventListener("click", async () => {
    const { error } = await supabase.auth.signOut();
    if (error) showToast(`Gagal keluar: ${error.message}`, true);
    else await showUserDashboard(null);
  });
});

const PAGE_LABELS = {
  dashboard: ["Dashboard", "Selamat datang", "Ini ringkasan keuanganmu hari ini."],
  transaksi: ["Transaksi", "Semua transaksi, tercatat rapi", "Lihat ke mana uangmu pergi dan dari mana ia datang."],
  anggaran: ["Anggaran", "Anggaran keuanganmu", "Pantau batas pengeluaran dan tujuan finansialmu."],
  dompet: ["Dompet", "Semua dompet dalam satu tempat", "Daftar sumber dana yang kamu catat transaksinya."],
  pengaturan: ["Pengaturan", "Atur pengalamanmu", "Preferensi akun dan mata uang."],
  bantuan: ["Pusat bantuan", "Kami siap membantu", "Temukan jawaban seputar rekap.in."],
};

function showPage(page) {
  currentPage = PAGE_LABELS[page] ? page : "dashboard";
  const [breadcrumb, title, subtitle] = PAGE_LABELS[currentPage];
  document.querySelector("#breadcrumbCurrent").textContent = breadcrumb;
  document.querySelector("#pageTitle").textContent =
    currentPage === "dashboard" ? greetingTitle : title;
  document.querySelector("#pageSubtitle").textContent = subtitle;

  document.querySelectorAll("[data-pages]").forEach((section) => {
    section.hidden = !section.dataset.pages.split(" ").includes(currentPage);
  });

  const overviewGrid = document.querySelector("#overviewGrid");
  if (overviewGrid) {
    overviewGrid.classList.toggle("anggaran-focus", currentPage === "anggaran");
  }

  document.querySelectorAll(".nav-link[data-page]").forEach((navLink) => {
    navLink.classList.toggle("active", navLink.dataset.page === currentPage);
  });
}

document.querySelectorAll("[data-page]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showPage(link.dataset.page);
    sidebar.classList.remove("mobile-open");
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
});

document.querySelector("#filterButton").addEventListener("click", () => {
  showToast("Filter transaksi akan segera tersedia.");
});
document.querySelector("#chartRange").addEventListener("click", () => {
  showToast("Grafik menampilkan 7 hari terakhir.");
});
document.querySelectorAll(".upgrade-button, .more-button").forEach((button) => {
  button.addEventListener("click", () => showToast("Fitur ini akan segera tersedia."));
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !transactionModal.hidden) {
    closeTransactionModal();
  }
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
    event.preventDefault();
    searchInput.focus();
  }
});

const today = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
}).format(new Date());
document.querySelector("#todayLabel").textContent = today.toLocaleUpperCase("id-ID");
transactionForm.elements.date.value = getLocalDateValue();

async function initializeApp() {
  if (!isConfigured) {
    authScreen.hidden = false;
    configHelp.hidden = false;
    authContent.hidden = true;
    return;
  }

  configHelp.hidden = true;
  authContent.hidden = false;
  setAuthMode("signin");
  try {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();
    if (error) throw error;
    await showUserDashboard(session?.user || null);
    supabase.auth.onAuthStateChange((event, sessionChange) => {
      if (event === "SIGNED_OUT") {
        void showUserDashboard(null);
      } else if (event === "SIGNED_IN" && sessionChange?.user?.id !== currentUser?.id) {
        void showUserDashboard(sessionChange.user);
      }
    });
  } catch (error) {
    showSignedOutScreen();
    showAuthFeedback(`Gagal menghubungkan ke Supabase: ${error.message}`, true);
  }
}

initializeApp();
