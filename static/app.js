/*
Path: chef-ledger-operational/static/app.js
Chef Ledger operational MVP frontend — Render + Stripe Subscription v63
*/
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const state = {
  user: null,
  team: null,
  subscription: null,
  subscriptionTiers: [],
  selectedSubscriptionTier: localStorage.getItem('chefLedgerSelectedTier') || 'starter',
  vendors: [],
  products: [],
  recipes: [],
  dishes: [],
  users: [],
  prepSheets: [],
  orders: [],
  shifts: [],
  suggestions: [],
  countData: { rows: [], locations: [], location_records: [], suggested: [], vendors: {} },
  countLocation: '',
  countSubpage: 'areas',
  countOrders: {},
  countHaves: {},
  currency: localStorage.getItem('chefLedgerCurrency') || 'USD',
  locations: [],
  inventoryTab: 'onhand',
  prepBuildData: null,
  employeePrepData: null,
  prepMode: 'closeout',
  readyForServiceEnabled: localStorage.getItem('chefLedgerReadyForServiceEnabled') === 'yes',
  notifications: [],
  timeOff: { profiles: [], requests: [] },
  weekSchedule: null,
  profileSchedule: null,
  capabilities: {},
  stations: [],
  stationCountForm: { products: [] },
  accessGrants: [],
  messagePermissions: [],
  teamSubpage: 'access',
  activeView: 'dashboard',
  activeScheduleDay: '',
  pendingFocus: '',
  selectedBlueprintSlot: null,
  selectedShiftId: null,
  offerGroupCount: 1,
  filesPos: { files: [], plates: [], profiles: [], storage: {} },
  filesPictures: { folders: [], pictures: [], social_links: [], storage: {}, limits: {} },
  filesInventories: { snapshots: [], prep_week: [], limits: {}, storage: {} },
  filesDeliveries: { vendors: [], orders: [], records: [], by_vendor: {}, limits: {} },
  filesMenu: { rows: [], by_shift: {}, csv: '', limits: {}, storage: {} },
  filesQr: { recipes: [], codes: [], limits: {} },
  forecaster: { profiles: [], events: [], limits: {}, storage: {} },
  selectedPosPlates: new Set(),
  lastPosProjection: null,
  lastPosSpecial: null,
  pendingPictureFiles: [],
};

const CURRENCY_OPTIONS = {
  USD: { label: 'USD $', symbol: '$', rate: 1, decimals: 2 },
  CAD: { label: 'CAD $', symbol: 'CA$', rate: 1.37, decimals: 2 },
  MXN: { label: 'MXN $', symbol: 'MX$', rate: 18.5, decimals: 2 },
  EUR: { label: 'EUR €', symbol: '€', rate: 0.92, decimals: 2 },
  GBP: { label: 'GBP £', symbol: '£', rate: 0.78, decimals: 2 },
  CHF: { label: 'CHF', symbol: 'CHF ', rate: 0.89, decimals: 2 },
  DKK: { label: 'DKK kr', symbol: 'kr ', rate: 6.85, decimals: 2 },
  SEK: { label: 'SEK kr', symbol: 'kr ', rate: 10.5, decimals: 2 },
  NOK: { label: 'NOK kr', symbol: 'kr ', rate: 10.7, decimals: 2 },
  JPY: { label: 'JPY ¥', symbol: '¥', rate: 157, decimals: 0 },
  KRW: { label: 'KRW ₩', symbol: '₩', rate: 1375, decimals: 0 },
  CNY: { label: 'CNY ¥', symbol: 'CN¥', rate: 7.25, decimals: 2 },
  HKD: { label: 'HKD $', symbol: 'HK$', rate: 7.8, decimals: 2 },
  SGD: { label: 'SGD $', symbol: 'S$', rate: 1.35, decimals: 2 },
  THB: { label: 'THB ฿', symbol: '฿', rate: 36.5, decimals: 2 },
  VND: { label: 'VND ₫', symbol: '₫', rate: 25400, decimals: 0 },
  INR: { label: 'INR ₹', symbol: '₹', rate: 83.5, decimals: 2 },
  AED: { label: 'AED د.إ', symbol: 'AED ', rate: 3.67, decimals: 2 },
  TRY: { label: 'TRY ₺', symbol: '₺', rate: 32.5, decimals: 2 },
  MAD: { label: 'MAD', symbol: 'MAD ', rate: 10.0, decimals: 2 },
  AUD: { label: 'AUD $', symbol: 'A$', rate: 1.5, decimals: 2 },
  NZD: { label: 'NZD $', symbol: 'NZ$', rate: 1.63, decimals: 2 },
  BRL: { label: 'BRL R$', symbol: 'R$', rate: 5.25, decimals: 2 },
  ARS: { label: 'ARS $', symbol: 'AR$', rate: 900, decimals: 0 },
  PEN: { label: 'PEN S/', symbol: 'S/ ', rate: 3.75, decimals: 2 },
  CLP: { label: 'CLP $', symbol: 'CLP$', rate: 920, decimals: 0 },
  COP: { label: 'COP $', symbol: 'COP$', rate: 3900, decimals: 0 },
  ZAR: { label: 'ZAR R', symbol: 'R', rate: 18.2, decimals: 2 }
};
function money(n) {
  const cfg = CURRENCY_OPTIONS[state.currency] || CURRENCY_OPTIONS.USD;
  const converted = Number(n || 0) * Number(cfg.rate || 1);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: state.currency || 'USD',
      minimumFractionDigits: cfg.decimals,
      maximumFractionDigits: cfg.decimals
    }).format(converted);
  } catch (_) {
    return `${cfg.symbol}${converted.toFixed(cfg.decimals)}`;
  }
}
const qty = (n) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 3 });
const escapeHtml = (str) => String(str ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
const ROLE_LEVEL = { employee: 1, team_leader: 2, manager: 3, chef: 4, owner: 5 };
function isLeader() { return Boolean(state.capabilities?.is_leader || ROLE_LEVEL[state.user?.role] >= ROLE_LEVEL.team_leader); }
function canUse(tool) { return Boolean(state.capabilities?.[tool] || isLeader()); }
function canViewManagerSchedule() { return Boolean(isLeader() || state.capabilities?.scheduler || state.capabilities?.scheduler_read || state.capabilities?.scheduler_write || state.capabilities?.station); }
function canWriteSchedule() { return Boolean(isLeader() || state.capabilities?.scheduler_write); }
function todayInput() { return new Date().toISOString().slice(0, 10); }

function productLabel(p) { return `${p.name}${p.category ? ' · ' + p.category : ''}${p.unit ? ' (' + p.unit + ')' : ''}`; }
function recipeLabel(r) { return `${r.name}${r.station ? ' · ' + r.station : ''}`; }

function stationName(station) {
  if (typeof station === 'string') return station;
  if (station && typeof station === 'object') return station.name || station.station || '';
  return '';
}
function stationNames() {
  const fromRecords = (state.stationRecords || []).map(stationName).filter(Boolean);
  const fromList = (state.stations || []).map(stationName).filter(Boolean);
  return unique([...fromRecords, ...fromList]).sort((a, b) => a.localeCompare(b));
}
function findProductBySearch(value) {
  const v = String(value || '').trim().toLowerCase();
  return state.products.find(p => String(p.id) === v) || state.products.find(p => productLabel(p).toLowerCase() === v) || state.products.find(p => String(p.name || '').toLowerCase() === v) || null;
}
function findRecipeBySearch(value) {
  const v = String(value || '').trim().toLowerCase();
  return state.recipes.find(r => String(r.id) === v) || state.recipes.find(r => recipeLabel(r).toLowerCase() === v) || state.recipes.find(r => String(r.name || '').toLowerCase() === v) || null;
}
function confirmUseSettings(message = 'Submitting will save this BUILD tool to the restaurant database and update connected pages.') {
  const modal = $('#confirmModal');
  const msg = $('#confirmModalText');
  if (!modal || !msg) return Promise.resolve(window.confirm('Use These Settings?'));
  msg.textContent = message;
  modal.hidden = false;
  return new Promise(resolve => {
    const yes = $('#confirmYesBtn');
    const no = $('#confirmNoBtn');
    const cleanup = (answer) => {
      modal.hidden = true;
      yes.removeEventListener('click', yesFn);
      no.removeEventListener('click', noFn);
      resolve(answer);
    };
    const yesFn = () => cleanup(true);
    const noFn = () => cleanup(false);
    yes.addEventListener('click', yesFn);
    no.addEventListener('click', noFn);
  });
}
async function confirmBuildSubmit(event, label) {
  const action = event?.submitter?.dataset?.buildAction || 'submit';
  if (action !== 'submit') return true;
  return await confirmUseSettings(`Use these ${label} settings? Yes saves to the database and automatically updates every connected page that pulls from this BUILD tool.`);
}
function collectRecipeSteps() {
  const enabled = $('#recipeStepsToggle')?.checked;
  if (!enabled) return '';
  const steps = $$('#recipeStepRows .step-row').map((row, i) => ({
    order: i + 1,
    level: Number($('[name="level"]', row)?.value || 0),
    text: $('[name="step_text"]', row)?.value || ''
  })).filter(s => s.text.trim());
  return JSON.stringify(steps);
}
function addRecipeStepRow(level = 0, text = '') {
  const row = document.createElement('div');
  row.className = 'step-row';
  row.innerHTML = `<label>STEP <input name="step_text" placeholder="Combine x, y, z" value="${escapeHtml(text)}"></label><label>Indent / sub-step <select name="level"><option value="0">Main step</option><option value="1">Sub-step</option><option value="2">Nested sub-step</option></select></label><button type="button" class="ghost remove-step">Remove</button>`;
  $('[name="level"]', row).value = String(level);
  $('#recipeStepRows')?.appendChild(row);
}


function mountBuildTools() {
  $$('[data-build-mount]').forEach(el => {
    const mount = document.getElementById(el.dataset.buildMount);
    if (mount && el.parentElement !== mount) mount.appendChild(el);
  });
}


const DEFAULT_SUBPAGES = { build: 'landing', inventory: 'onhand', count: 'areas', files: 'landing', recipes: 'cards', prep: 'prepsheet', orders: 'deadline', scheduler: 'planner', team: 'access' };

const VIEW_SUBPAGE_COPY = {
  build: {
    landing: ['BUILD landing', 'Choose a BUILD tool to create the restaurant database. Setup here powers the operating pages used during service.', 'Use the dropdown or BUILD buttons to open a builder. Submit saves and propagates to connected pages.', 'Every operating menu: Inventory, Recipes, Prep, Orders, Scheduler, and Team.', 'Setup once, reuse everywhere, and stop copying the same information across paper, spreadsheets, and texts.'],
    vendors: ['Vendor Builder', 'Create vendors before items so order sheets know who supplies what and when deliveries arrive.', 'Enter order days, delivery days, cutoff time, lead time, and contact info.', 'Inventory items, order day reminders, vendor order pages, deliveries.', 'Vendor grouping reduces missed orders and keeps purchasing organized.'],
    locations: ['Location Builder', 'Create the rooms, shelves, coolers, and stock areas used by COUNT.', 'Enter location name, subclass, and IN ORDER N COUNT so physical-count tabs follow the restaurant walking path.', 'Inventory Item Builder, COUNT, Vendor Sheets, and stock-area reports.', 'A consistent count route reduces missed shelves and makes inventory faster for new staff.'],
    inventory: ['Inventory Item Builder', 'Create raw stock records and supplier pack math.', 'Enter item name, amount per quantity, quantity in storage, par, reorder point, vendor, pack label, and shelf life.', 'Recipes, plates, prep deductions, manual inventory, orders, and par risk.', 'Accurate item setup prevents food-cost errors and bad order quantities.'],
    manual_inventory: ['Manual Inventory', 'Correct the database with a physical count when the real number is known.', 'Select an item, enter the actual storage quantity, and save the reason.', 'Inventory, order risk, prep estimator, until-next-delivery forecast.', 'Hard counts prevent ordering from stale or guessed numbers.'],
    stations: ['Station Builder', 'Build restaurant-specific station names.', 'Add the stations your restaurant uses, then assign them to recipes, plates, employees, and prep templates.', 'Prep, station closeout, scheduler, recipes, plates, and employee qualifications.', 'Station setup keeps work organized and prevents missed prep by location.'],
    recipes: ['Recipe Builder', 'Build batch cards from inventory items, steps, and container rules.', 'Search inventory items, add amounts, optional steps/sub-steps, storage container, and station container.', 'Recipe cards, prep templates, plates, food cost, and inventory deductions.', 'Recipe math turns portion control into cost control.'],
    plates: ['Menu Item / Plate Builder', 'Build sellable menu items from recipes and direct inventory items.', 'Pick recipes/items, enter plate portions, add station/menu price/picture, then submit.', 'POS usage, plate cost, prep templates, plate pictures, and order forecasting.', 'Plate setup shows true food cost and theoretical ingredient usage.'],
    prep: ['Prep-Sheet Builder', 'Create recurring station prep checklists from plates.', 'Choose station, generate from plates, save the template employees use on PREP.', 'Employee prep uploads, chef prep review, prep estimator, order risk.', 'Standardized station checklists reduce missed prep and handwritten confusion.'],
    employees: ['Employee Builder Overview', 'Employee Builder is the BUILD category for team profiles and employee rules.', 'Use the employee subpages to set message eligibility, days-off banks, and scheduling profile rules.', 'Teams, Scheduler, Access, Notifications, Time Off, and shift offers.', 'One employee profile powers permissions, scheduling, notifications, and time-off instead of scattered notes.'],
    employee_message: ['Employee → Message Builder', 'Assign which employee profiles receive which task/message categories.', 'Select an employee and check the message/task groups they are eligible to receive.', 'Posts, incidents, suggestions, ordering notes, manual inventory, maintenance, prep, vote routing.', 'Issues reach the right person without giving everyone broad manager access.'],
    employee_days_off: ['Employee → Days-Off Profile', 'Build each employee’s time-off bank and reset rule.', 'Set allowed days, remaining days, reset date, and rollover rule before live requests are approved.', 'Request Time Off, Scheduler unavailable blocks, notifications, employee member pages.', 'Stops manual time-off math and prevents scheduling approved days off.'],
    employee_schedule: ['Employee → Scheduling Profile', 'Build the ongoing schedule profile for each employee.', 'Set color, qualified stations, eligible shifts, weekly can-work rules, and weekly cannot-work rules.', 'Scheduler grey-slot assignment, shift offers, conflict warnings, hours/overtime.', 'Prevents assigning employees to stations or shifts they are not eligible to work.'],
    schedule: ['Schedule BUILD', 'Create the weekly coverage blueprint.', 'Choose day, shift, station, time, and employees needed. Grey slots appear in Scheduler.', 'Scheduler planner, employee offers, print/save/send schedule.', 'The chef fills required coverage instead of starting from a blank page.']
  },
  inventory: {
    onhand: ['ON HAND', 'Live usable inventory across storage and in-use station stock.', 'Use this to see what the restaurant currently has available.', 'Manual Inventory, deliveries, prep, station closeout, and orders.', 'Shows shortages early and helps stop emergency runs.'],
    storage: ['STORAGE', 'What is physically in-house but not currently stocked into stations.', 'Use during walk-in, dry storage, freezer, or stockroom checks.', 'Manual Inventory, deliveries, station restock, prep.', 'Prevents buying product already sitting in the building.'],
    prep: ['PREP ESTIMATOR', 'Forecasts how prep sheets will consume inventory.', 'Review after station prep sheets are uploaded and before order decisions.', 'Prep templates, employee prep uploads, recipes, plates, and inventory.', 'Shows what prep will burn before the next order arrives.'],
    forecaster: ['FORECASTER', 'Loads saved POS CSV projection/special profiles and converts selected plate counts into prep/order impact.', 'Upload a saved profile, adjust expected plates for a planned special, select a date range, then ADD TO PREP.', 'FILES → POS CSV, Projection profiles, prep sheets, inventory, vendor/order sheets.', 'This is where historical sold plates become tomorrow’s prep and ordering plan.'],
    delivery: ['UNTIL NEXT DELIVERY', 'Projects inventory left after prep and expected usage before the next delivery.', 'Use before placing vendor orders or when checking order risk.', 'POS imports, vendor delivery days, prep, recipes, inventory.', 'Helps avoid 86ing after tomorrow’s prep drains stock.'],
    par: ['PAR / BELOW PAR', 'Products at or below par after known usage.', 'Use as a fast reorder-risk view.', 'Inventory, prep, manual counts, deliveries, POS forecast.', 'Keeps par levels visible without manual spreadsheet sorting.'],
    watchlist: ['WATCHLIST / ORDER RISK', 'Items trending toward shortage or vendor order risk.', 'Refresh this before order day or after prep sheets are submitted.', 'Orders, Vendor BUILD, Prep, POS, Inventory.', 'Turns “maybe order this” into a data-backed risk list.']
  },
  recipes: {
    cards: ['RECIPE CARDS', 'Read-only recipe cards built from Recipe BUILD.', 'Open cards for ingredients, steps, containers, cost, and yield.', 'Inventory, prep templates, employee read-only views, plates.', 'Keeps the team using the same recipe and portion rules.'],
    pictures: ['PLATE PICTURES', 'Finished plate reference pictures uploaded from Plate BUILD.', 'Use this for plating consistency and training.', 'Plate BUILD, recipe cards, employee station references.', 'Reduces remakes and inconsistent plating.'],
    plates: ['PLATES / MENU ITEMS', 'Sellable plate records that combine recipes and items.', 'Review plate cost, station, portions, and POS mapping.', 'Recipes, inventory, POS import, prep, cost optimizer.', 'Shows the true cost of a menu item.'],
    optimizer: ['ADJUST PLATE / RECIPE COST', 'Cost-control tools for plate and recipe targets.', 'Select a recipe/plate and compare cost against targets.', 'Recipe cards, plates, inventory price data.', 'Helps chefs protect margin without guessing.']
  },
  prep: {
    prepsheet: ['PREPSHEET', 'One station workflow for fill/closeout and prep check, with optional ready-for-service review.', 'Use FILL / CLOSEOUT / PREP CHECK as the main station screen. The chef can enable READY FOR SERVICE when the restaurant wants a second check.', 'BUILD PREP, Recipes, Plates, Inventory, Orders, Station closeout, Master Prep Sheet, and notifications.', 'Centralizes station counts, prep requests, and readiness so product usage and order risk update without retyping.']
  },
  orders: {
    deadline: ['NEXT DEADLINE', 'Vendor order deadlines ranked from soonest to latest.', 'Review each vendor cutoff, delivery date, order risk, and items that need attention.', 'Vendor BUILD, COUNT, Inventory, Prep, POS forecast, and order sheets.', 'Prioritizes the orders that must be placed first and reduces emergency buys.'],
    order_sheet: ['ORDER SHEET', 'Vendor-specific order sheets created from COUNT.', 'Choose a vendor, review items below par or 86 risk, then print or download.', 'COUNT PAR TO ORDER, Vendor BUILD, Inventory Builder, Delivery receiving.', 'Turns physical counts into vendor-ready order sheets without rewriting lists by hand.'],
    needed: ['NEEDED', 'Order recommendations from par, prep, POS, and delivery timing.', 'Review suggested items before creating vendor orders.', 'Inventory, Vendor BUILD, Prep, POS import, deliveries.', 'Makes ordering proactive instead of reactive.'],
    vendor: ['VENDOR', 'Vendor-specific needed items.', 'Choose vendor to see items tied to that supplier and suggested order amounts.', 'Vendor BUILD, Inventory Item Builder, Orders, Deliveries.', 'Reduces ordering mistakes by grouping items by supplier.'],
    deliveries: ['DELIVERIES', 'Saved vendor orders and receiving workflow.', 'Receive order quantities so inventory updates automatically.', 'Orders, Inventory, Vendor Profiles.', 'Receiving updates stock immediately and reduces duplicate entry.'],
    pos: ['POS IMPORT', 'Upload sales CSV so expected plate usage can drive forecasts.', 'Import date, service, plate, and quantity sold.', 'Plates, recipes, prep estimator, order risk, usage analytics.', 'Turns POS sales into ingredient planning.']
  },
  files: {
    landing: ['FILES landing', 'The document hub for POS imports, pictures, saved inventories, prep sheets, vendor sheets, menus, and schedules.', 'Choose a FILES subpage, review the populated record, then print, download, save, or prepare it for email.', 'Inventory, COUNT, Prep, Orders, Scheduler, POS, Recipes, Plates, Vendors, and Team.', 'It localizes paperwork that is usually split across three computers, clipboards, texts, and bulletin boards.'],
    pos: ['POS CSV', 'Store nightly/YTD POS CSV files and scan plate sales into projections.', 'Upload or paste POS CSVs, select plates, run projections by day/week/month/season, analyze specials, and save profiles.', 'Plates, recipes, prep estimator, count, order risk, PREP Forecaster, and manager analytics.', 'It turns historical sold plates into prep and purchasing math before the restaurant 86s product.'],
    pictures: ['Pictures', 'Upload restaurant picture folders for recipe cards, plates, stations, and locations.', 'Create a folder, add photo(s), make the folder, then use top-tier Create Post prompts for social content.', 'Recipe Cards, Plates, Stations, Locations, user profile social links, and training standards.', 'It keeps visual standards organized and gives restaurants premium social-post prompts without rewriting from scratch.'],
    deliveries: ['DELIVERIES', 'Saved vendor order and delivery files organized by vendor/date.', 'Open DELIVERIES to see what was on order sheets; use VENDOR ORDERS to filter delivery dates by supplier.', 'Orders, vendor builder, receiving, inventory, and files storage.', 'It preserves what was ordered and delivered without saving unlimited paperwork.'],
    qr: ['QR CODE MAKER', 'Top-tier recipe QR code workspace.', 'Generate a unique code for each recipe so printed recipe books can link back to the portable recipebook page.', 'Recipes, recipe cards, employee training, and printed books.', 'It keeps recipes readable and available even when printed cards get lost, ripped, or spilled on.'],
    inventories: ['Saved Inventories', 'Inventory snapshots and CSV exports show what was counted and when.', 'Use after receiving, manual counts, or prep updates to save a stock record.', 'Inventory Sheet, COUNT, Manual Inventory, Deliveries, and Orders.', 'It creates a trail for stock changes so waste and shortages are easier to explain.'],
    prep: ['PREP SHEETs', 'Yesterday, Today, and Tomorrow prep sheets are grouped station by station with notes and risk colors.', 'Open the day tab, review station prep, then print, download, or prepare an email copy.', 'FILL / CLOSEOUT / PREP CHECK, Master Prep List, Manager PREPLIST, Inventory, and Orders.', 'It catches overlooked backup product, over-prep, 86 risk, and handoff notes before the next service.'],
    vendors: ['VENDOR files', 'Vendor order sheets are generated from COUNT and grouped by supplier.', 'Choose a vendor, review needed items, print/download, or prepare an email-ready copy.', 'COUNT, Vendor Builder, Orders Next Deadline, Inventory Builder, and Delivery receiving.', 'Vendor files stop late-night missed orders and prevent rewriting the same list by hand.'],
    menu: ['MENU files', 'Menu files are generated from Plates and grouped by station.', 'Review station plates, POS names, menu prices, and recipe links before printing or exporting.', 'Plate Builder, Recipe Cards, POS Import, Prep Builder, and Cost Optimizer.', 'Menu files connect what is sold to what must be prepped and counted.'],
    schedules: ['SCHEDULE files', 'Saved schedules make staffing accountability searchable.', 'Review previous/current month schedules, print them, or use them to identify who worked a station when an issue occurred.', 'Manager Scheduler, Employee Profiles, Shift Offers, Prep, Count, and incidents.', 'It replaces bulletin-board guesswork with a record of who worked where and when.']
  },
  scheduler: {
    planner: ['Day-by-day scheduler', 'Use saved grey blueprint slots to assign or offer shifts.', 'Click a day, pick a needed slot, select a valid employee, save or offer.', 'Schedule BUILD, Employee Profile BUILD, notifications, output tools.', 'Prevents scheduling people in places or times they cannot work.'],
    employee_build: ['Employee schedule BUILD', 'Employee-facing saved availability profile.', 'Employees submit days, shifts, stations, can-work and cannot-work rules.', 'Chef scheduler, shift offers, conflict warnings.', 'Keeps availability out of text messages and inside the scheduler.'],
    builder: ['Chef schedule builder', 'Chef-side assignment and offer controls inside the scheduler UI.', 'Select needed slots, save shifts, offer shifts, approve responses.', 'Employee profiles, stations, schedule blueprint, notifications.', 'Speeds schedule building while keeping conflicts visible.'],
    hours: ['Hours & overtime', 'Weekly scheduled hours and overtime risk.', 'Review totals before sending schedule.', 'Assigned shifts and employee profiles.', 'Helps control labor cost before schedule is published.']
  }
};

function setSubpage(view, subpage) {
  if (!state.subpages) state.subpages = {};
  if (subpage) state.subpages[view] = subpage;
  updateSubpageUI(view);
}

function updateReadyForServiceVisibility() {
  const enabled = Boolean(state.readyForServiceEnabled);
  $$('[data-ready-tab]').forEach(btn => { btn.hidden = !enabled; });
  $$('.ready-service-panel').forEach(panel => { if (!enabled) panel.hidden = true; });
  const toggle = $('#readyForServiceToggle');
  if (toggle) toggle.checked = enabled;
  if (!enabled && state.prepMode === 'ready') state.prepMode = 'closeout';
}

function setPrepMode(mode = 'closeout') {
  if (mode === 'list' || mode === 'legacy-list') mode = 'closeout';
  if (mode === 'ready' && !state.readyForServiceEnabled) mode = 'closeout';
  state.prepMode = mode || 'closeout';
  updateReadyForServiceVisibility();
  const prepEl = document.getElementById('prep');
  if (!prepEl) return;
  prepEl.querySelectorAll('[data-prep-mode]').forEach(btn => btn.classList.toggle('active', btn.dataset.prepMode === state.prepMode));
  prepEl.querySelectorAll('[data-prep-mode-panel]').forEach(panel => {
    const panelMode = panel.dataset.prepModePanel;
    if (panelMode === 'legacy-list') {
      panel.hidden = true;
      return;
    }
    if (panelMode === 'ready' && !state.readyForServiceEnabled) {
      panel.hidden = true;
      return;
    }
    panel.hidden = panelMode !== state.prepMode;
  });
}

function copyForSubpage(view, subpage) {
  return (VIEW_SUBPAGE_COPY[view] && VIEW_SUBPAGE_COPY[view][subpage]) || null;
}
function updateSubpageUI(view = state.activeView) {
  const subpage = (state.subpages && state.subpages[view]) || DEFAULT_SUBPAGES[view] || 'landing';
  const viewEl = document.getElementById(view);
  if (!viewEl) return;
  // visual subpage buttons
  viewEl.querySelectorAll('[data-subpage-bar] button').forEach(btn => btn.classList.toggle('active', btn.dataset.subpageSelect === subpage));
  document.querySelectorAll(`select[data-menu-select="${view}"]`).forEach(sel => { if ([...sel.options].some(o => o.value === subpage)) sel.value = subpage; });
  // hide/show assigned subpage blocks
  const blocks = viewEl.querySelectorAll('.subpage-block[data-subpage]');
  if (blocks.length) {
    blocks.forEach(block => {
      const subs = (block.dataset.subpage || '').split(/\s+/).filter(Boolean);
      block.hidden = subs.length && !subs.includes(subpage);
    });
  }
  if (view === 'prep') {
    setPrepMode(state.prepMode || 'closeout');
  }
  // inventory tab follows selected subpage
  if (view === 'inventory') {
    const tab = subpage === 'watchlist' ? 'watchlist' : subpage;
    state.inventoryTab = tab === 'onhand' ? 'onhand' : tab;
    if (typeof renderInventorySheetTabs === 'function' && state.products) renderInventorySheetTabs();
    if (typeof renderInventoryWatchlist === 'function' && state.products) renderInventoryWatchlist();
  }
  if (view === 'count') {
    state.countSubpage = subpage || 'areas';
    if (typeof renderCountPage === 'function') renderCountPage();
  }
  const info = viewEl.querySelector('#subpageInfoCard');
  const copy = copyForSubpage(view, subpage);
  if (info && copy) {
    info.innerHTML = `<p class="eyebrow">${escapeHtml(view.toUpperCase())} subpage</p><h2>${escapeHtml(copy[0])}</h2><p class="muted">${escapeHtml(copy[1])}</p><div class="grid three tight-info"><div><h3>How to use</h3><p>${escapeHtml(copy[2])}</p></div><div><h3>What it ties into</h3><p>${escapeHtml(copy[3])}</p></div><div><h3>How it saves money/time</h3><p>${escapeHtml(copy[4])}</p></div></div>`;
  }
}
function subpageFromFocus(view, focusId) {
  const map = {
    build: { buildVendorToolPage:'vendors', buildInventoryToolPage:'inventory', buildManualInventoryToolPage:'manual_inventory', buildStationToolPage:'stations', buildRecipeToolPage:'recipes', buildPlateToolPage:'plates', buildPrepToolPage:'prep', buildEmployeeCard:'employees', buildEmployeeMessageBuilderPage:'employee_message', buildEmployeeDaysOffPage:'employee_days_off', buildEmployeeScheduleProfilePage:'employee_schedule', buildChefSchedulerCard:'schedule' },
    inventory: { inventorySheetTabsCard: state.inventoryTab || 'onhand', inventoryWatchlistCard:'watchlist' },
    count: { countStockAreaCard:'areas', countSuggestedParCard:'suggested', countVendorSheetsCard:'vendors', countPriceOptimizerCard:'optimizer' },
    files: { filesLandingCard:'landing', filesPosCard:'pos', filesPicturesCard:'pictures', filesInventoriesCard:'inventories', filesPrepCard:'prep', filesVendorCard:'vendors', filesMenuCard:'menu', filesScheduleCard:'schedules', posImportForm:'pos' },
    recipes: { recipeList:'cards', platePictureGallery:'pictures', dishList:'plates', optimizerRecipe:'optimizer' },
    prep: { prepUnifiedWorkflowCard:'prepsheet', employeePrepUploadCard:'prepsheet', whileStockingCard:'prepsheet', chefPrepReviewCard:'prepsheet', prepAggregate:'prepsheet' },
    orders: { ordersNextDeadlineCard:'deadline', ordersVendorSheetCard:'order_sheet', suggestionsTable:'needed', vendorNeededCard:'vendor', ordersList:'deliveries', posImportForm:'pos' },
    scheduler: { weeklyScheduleBoard:'planner', schedulerSlotControls:'builder', hoursList:'hours', shiftList:'approvals' }
  };
  return map[view]?.[focusId] || '';
}

function applyRoleVisibility() {
  const leader = isLeader();
  const managerSchedule = canViewManagerSchedule();
  const scheduleWrite = canWriteSchedule();
  document.body.classList.toggle('employee-limited', !leader);
  document.body.classList.toggle('leader-mode', leader);
  document.body.classList.toggle('schedule-readonly-mode', managerSchedule && !scheduleWrite);
  $$('.leader-only').forEach(el => el.hidden = !leader);
  $$('.leader-only-inline').forEach(el => el.hidden = !leader);
  $$('.manager-only').forEach(el => el.hidden = !managerSchedule);
  $$('.manager-only-inline').forEach(el => el.hidden = !managerSchedule);
  $$('.schedule-write-only').forEach(el => el.hidden = !scheduleWrite);
  $$('.scheduler-readonly-note').forEach(el => el.hidden = scheduleWrite || !managerSchedule);
  const inventoryAccess = canUse('inventory');
  $$('[data-view="inventory"]').forEach(el => el.hidden = !inventoryAccess);
  $$('[data-view="count"]').forEach(el => el.hidden = !inventoryAccess);
  $$('[data-view="recipes"]').forEach(el => el.hidden = !(leader || canUse('recipes')));
  $$('[data-view="orders"]').forEach(el => el.hidden = !(leader || canUse('ordering') || canUse('orders')));
  $$('[data-view="files"]').forEach(el => el.hidden = !(leader || inventoryAccess || canUse('prep') || canUse('orders') || canUse('ordering')));
  $$('.menu-group[data-view="inventory"]').forEach(el => el.hidden = !inventoryAccess);
  $$('.menu-group[data-view="count"]').forEach(el => el.hidden = !inventoryAccess);
  $$('.menu-group[data-view="files"]').forEach(el => el.hidden = !(leader || inventoryAccess || canUse('prep') || canUse('orders') || canUse('ordering')));
  const exportInventoryBtn = $('#exportInventoryBtn');
  if (exportInventoryBtn) exportInventoryBtn.hidden = !inventoryAccess;
  const exportRecipesBtn = $('#exportRecipesBtn');
  if (exportRecipesBtn) exportRecipesBtn.hidden = !leader;
  const roleLine = $('#employeePortalNotice');
  if (roleLine) roleLine.hidden = leader;
  updateReadyForServiceVisibility();
}

function allowedView(view) {
  if (view === 'inventory') return canUse('inventory');
  if (view === 'count') return canUse('inventory');
  if (view === 'recipes') return isLeader() || canUse('recipes');
  if (view === 'orders') return isLeader() || canUse('ordering') || canUse('orders');
  if (view === 'files') return isLeader() || canUse('inventory') || canUse('prep') || canUse('orders') || canUse('ordering');
  if (view === 'scheduler') return canViewManagerSchedule();
  return true;
}


function toast(message) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => el.hidden = true, 3600);
}

async function api(path, options = {}) {
  const headers = options.headers || {};
  if (options.body && !(options.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(path, { credentials: 'same-origin', ...options, headers });
  const contentType = res.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await res.json() : await res.text();
  if (!res.ok) {
    const message = typeof data === 'string' ? data : (data.error || 'Request failed');
    if (res.status === 401) showAuth();
    if (res.status === 402 && data?.subscription_required) showSubscriptionLock(data);
    const err = new Error(message);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}


function tierByKey(key) {
  return (state.subscriptionTiers || []).find(t => t.key === key) || (state.subscriptionTiers || [])[0] || null;
}

function tierPriceLabel(tier) {
  return tier ? `$${Number(tier.price || 0).toFixed(0)}/mo` : '$0/mo';
}

function tierStorageLabel(tier) {
  const mb = Number(tier?.limits?.storage_mb || 0);
  if (mb >= 1024) return `${(mb / 1024).toLocaleString(undefined, { maximumFractionDigits: 1 })} GB FILES cap`;
  return `${mb.toLocaleString(undefined, { maximumFractionDigits: 0 })} MB FILES cap`;
}
function stripeClientReference(tierKey) {
  const teamId = state.user?.team_id || state.team?.id || '';
  const userId = state.user?.id || '';
  return `chefledger|team=${teamId}|user=${userId}|tier=${tierKey}`;
}

function stripeBuyButtonHtml(tier) {
  const buttonId = tier?.stripe_buy_button_id || '';
  const publishableKey = tier?.stripe_publishable_key || '';
  if (!buttonId || !publishableKey || !state.user?.id) return '';
  return `<div class="stripe-buy-button-wrap" data-stripe-tier="${escapeHtml(tier.key)}">
    <stripe-buy-button
      buy-button-id="${escapeHtml(buttonId)}"
      publishable-key="${escapeHtml(publishableKey)}"
      client-reference-id="${escapeHtml(stripeClientReference(tier.key))}">
    </stripe-buy-button>
  </div>`;
}


function tierCardHtml(tier, context = 'landing') {
  if (!tier) return '';
  const active = state.selectedSubscriptionTier === tier.key ? ' selected' : '';
  const features = (tier.features || []).slice(0, 5).map(f => `<li>${escapeHtml(f)}</li>`).join('');
  const buttonText = context === 'lock' ? 'Prepare this tier' : 'Select tier';
  const buyButton = context === 'lock' ? stripeBuyButtonHtml(tier) : '';
  const checkoutNote = context === 'lock'
    ? `<p class="muted tiny-note">After clicking the Stripe button and completing checkout, return here and use Refresh Status. Stripe webhooks unlock the account automatically.</p>`
    : '';
  return `<article class="tier-card${active}" data-tier-card="${escapeHtml(tier.key)}">
    <div class="tier-card-top">
      <div><h3>${escapeHtml(tier.name)}</h3><p class="muted small-note">${escapeHtml(tier.tagline || '')}</p></div>
      <strong class="tier-price">${tierPriceLabel(tier)}</strong>
    </div>
    <p class="tier-best">${escapeHtml(tier.best_for || '')}</p>
    <ul>${features}</ul>
    <div class="tier-card-foot"><span>${escapeHtml(tierStorageLabel(tier))}</span><button class="${context === 'lock' ? 'primary' : 'ghost'}" data-select-subscription-tier="${escapeHtml(tier.key)}" data-context="${escapeHtml(context)}" type="button">${buttonText}</button></div>
    ${buyButton}
    ${checkoutNote}
  </article>`;
}

function renderTierCards() {
  const tiers = state.subscriptionTiers || [];
  const landing = $('#authTierCards');
  if (landing) landing.innerHTML = tiers.map(t => tierCardHtml(t, 'landing')).join('') || '<div class="empty">Pricing tiers could not be loaded.</div>';
  const lock = $('#subscriptionTierCards');
  if (lock) lock.innerHTML = tiers.map(t => tierCardHtml(t, 'lock')).join('') || '<div class="empty">Pricing tiers could not be loaded.</div>';
  const selected = tierByKey(state.selectedSubscriptionTier);
  const hidden = $('#registerSubscriptionTier');
  if (hidden && selected) hidden.value = selected.key;
  const box = $('#selectedTierBox');
  if (box && selected) box.textContent = `Selected tier: ${selected.name} · ${tierPriceLabel(selected)}`;
}

async function loadSubscriptionTiers() {
  try {
    const data = await api('/api/subscription/tiers');
    state.subscriptionTiers = data.tiers || [];
    if (!tierByKey(state.selectedSubscriptionTier) && state.subscriptionTiers[0]) state.selectedSubscriptionTier = state.subscriptionTiers[0].key;
    renderTierCards();
  } catch (err) {
    console.warn('Could not load subscription tiers', err);
  }
}

function selectSubscriptionTier(tierKey, context = 'landing') {
  state.selectedSubscriptionTier = tierKey || 'starter';
  localStorage.setItem('chefLedgerSelectedTier', state.selectedSubscriptionTier);
  renderTierCards();
  if (context === 'landing') {
    $$('[data-tabs="authTabs"] button').forEach(b => b.classList.toggle('active', b.dataset.tab === 'register'));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === 'register'));
    $('#registerForm')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function showSubscriptionLock(payload = {}) {
  state.subscription = payload.subscription || state.subscription || null;
  if (payload.tiers) state.subscriptionTiers = payload.tiers;
  const currentTier = state.subscription?.tier || state.selectedSubscriptionTier || 'starter';
  state.selectedSubscriptionTier = currentTier;
  localStorage.setItem('chefLedgerSelectedTier', currentTier);
  $('#authScreen').hidden = true;
  $('#appShell').hidden = true;
  $('#subscriptionLockScreen').hidden = false;
  renderTierCards();
  const localBox = $('#localActivationBox');
  if (localBox) localBox.hidden = !(state.subscription?.local_preview_activation_available ?? true);
}

async function chooseLockedSubscriptionTier(tierKey) {
  state.selectedSubscriptionTier = tierKey || state.selectedSubscriptionTier || 'starter';
  localStorage.setItem('chefLedgerSelectedTier', state.selectedSubscriptionTier);
  renderTierCards();
  const result = await api('/api/subscription/select', { method: 'POST', body: JSON.stringify({ tier: state.selectedSubscriptionTier }) });
  state.subscription = result.subscription;
  const checkout = result.checkout_url || state.subscription?.checkout_url;
  if (checkout && /^https?:\/\//i.test(checkout)) {
    window.open(checkout, '_blank', 'noopener');
    toast('Opening secure checkout. The app unlocks after subscription activation.');
  } else {
    toast('Tier selected. Configure Stripe paylinks for production checkout, or use local preview activation for testing.');
  }
  showSubscriptionLock({ subscription: state.subscription, tiers: state.subscriptionTiers });
}

async function activateLocalSubscription() {
  const result = await api('/api/subscription/activate_local', { method: 'POST', body: JSON.stringify({ tier: state.selectedSubscriptionTier }) });
  state.subscription = result.subscription;
  toast('Local preview subscription activated');
  await loadSession();
}

function showAuth() {
  state.user = null;
  state.subscription = null;
  $('#authScreen').hidden = false;
  $('#subscriptionLockScreen').hidden = true;
  $('#appShell').hidden = true;
}

function showApp() {
  $('#authScreen').hidden = true;
  $('#subscriptionLockScreen').hidden = true;
  $('#appShell').hidden = false;
  $('#teamName').textContent = state.team?.name || 'Your Restaurant';
  $('#userName').textContent = `${state.user.name} · ${state.user.role}`;
  $('#roleLine').textContent = `${state.team?.name || 'Chef Ledger'} · ${state.user.role}${state.user.station ? ' · ' + state.user.station : ''}`;
  $('#notificationCount').textContent = state.unread_notifications || 0;
  const currencySelect = $('#currencySelect');
  if (currencySelect) currencySelect.value = state.currency || 'USD';
  applyRoleVisibility();
}

async function loadSession() {
  const data = await api('/api/session');
  if (data.tiers) state.subscriptionTiers = data.tiers;
  if (!data.user) { renderTierCards(); return showAuth(); }
  state.user = data.user;
  state.team = data.team;
  state.subscription = data.subscription || null;
  state.unread_notifications = data.unread_notifications;
  state.capabilities = data.capabilities || {};
  if (state.subscription && !state.subscription.active) {
    showSubscriptionLock({ subscription: state.subscription, tiers: data.tiers || state.subscriptionTiers });
    return;
  }
  showApp();
  await preloadCore();
  await switchView(state.activeView || 'dashboard');
  startNotificationPolling();
}

async function preloadCore() {
  const [vendors, products, recipes, dishes, users, stations, locations] = await Promise.all([
    api('/api/vendors').catch(() => ({ vendors: [] })),
    api('/api/products').catch(() => ({ products: [] })),
    api('/api/recipes').catch(() => ({ recipes: [] })),
    api('/api/dishes').catch(() => ({ dishes: [] })),
    api('/api/users').catch(() => ({ users: [] })),
    api('/api/stations').catch(() => ({ stations: [], station_records: [] })),
    api('/api/locations').catch(() => ({ locations: [] })),
  ]);
  state.vendors = vendors.vendors || [];
  state.products = products.products || [];
  state.recipes = recipes.recipes || [];
  state.dishes = dishes.dishes || [];
  state.users = users.users || [];
  state.stations = stations.stations || [];
  state.stationRecords = stations.station_records || [];
  state.locations = locations.locations || [];
  populateSelects();
}

function populateSelects() {
  const vendorOptions = ['<option value="">Unassigned</option>', ...state.vendors.map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`)].join('');
  const vendorSelect = $('#productVendorSelect');
  if (vendorSelect) vendorSelect.innerHTML = vendorOptions;
  const productOptions = state.products.map(p => `<option value="${p.id}" data-unit="${escapeHtml(p.unit)}">${escapeHtml(p.name)} (${escapeHtml(p.unit)})</option>`).join('');
  const manualProductSelect = $('#manualInventoryProductSelect');
  if (manualProductSelect) manualProductSelect.innerHTML = '<option value="">Choose item…</option>' + productOptions;
  const recipeOptions = state.recipes.map(r => `<option value="${r.id}">${escapeHtml(r.name)}</option>`).join('');
  const productSearchOptions = state.products.map(p => `<option value="${escapeHtml(productLabel(p))}" data-id="${p.id}"></option>`).join('');
  const recipeSearchOptions = state.recipes.map(r => `<option value="${escapeHtml(recipeLabel(r))}" data-id="${r.id}"></option>`).join('');
  const stationOptions = stationNames().map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('');
  const stationDatalistOptions = stationNames().map(st => `<option value="${escapeHtml(st)}"></option>`).join('');
  const locationOptions = (state.locations || []).map(loc => `<option value="${escapeHtml(loc.name || loc)}">${escapeHtml(loc.name || loc)}${loc.subclass ? ' · ' + escapeHtml(loc.subclass) : ''}</option>`).join('');
  const locationDatalistOptions = (state.locations || []).map(loc => `<option value="${escapeHtml(loc.name || loc)}"></option>`).join('');
  const productDataList = $('#productSearchOptions');
  if (productDataList) productDataList.innerHTML = productSearchOptions;
  const recipeDataList = $('#recipeSearchOptions');
  if (recipeDataList) recipeDataList.innerHTML = recipeSearchOptions;
  const stationDataList = $('#stationOptions');
  if (stationDataList) stationDataList.innerHTML = stationDatalistOptions;
  const locationSelect = $('#productLocationSelect');
  if (locationSelect) locationSelect.innerHTML = '<option value="">Choose location…</option>' + locationOptions;
  const locationDataList = $('#stockLocationOptions');
  if (locationDataList) locationDataList.innerHTML = locationDatalistOptions;
  ['#blueprintStationSelect'].forEach(id => { const el = $(id); if (el) el.innerHTML = stationOptions || '<option value="">Add stations in BUILD</option>'; });
  const userOptions = ['<option value="">Unassigned</option>', ...state.users.map(u => `<option value="${u.id}">${escapeHtml(u.name)} · ${escapeHtml(u.role)}</option>`)].join('');
  $$('#recipeItemRows select.product-select').forEach(sel => sel.innerHTML = productOptions);
  $$('#dishComponentRows select.dish-recipe-select').forEach(sel => sel.innerHTML = recipeOptions);
  $$('#dishComponentRows select.dish-product-select').forEach(sel => sel.innerHTML = productOptions);
  ['#optimizerRecipe', '#prepRecipeSelect'].forEach(id => { const el = $(id); if (el) el.innerHTML = recipeOptions; });
  ['#availabilityUserSelect', '#managerCanWorkUserSelect', '#timeOffProfileUserSelect', '#timeOffRequestUserSelect', '#teamProfileUserSelect', '#profileCanWorkUserSelect', '#profileCannotWorkSelect', '#profileCannotWorkUserSelect', '#accessGrantUserSelect', '#messagePermissionUserSelect', '#postTargetUserSelect', '#memberHomeUserSelect'].forEach(id => { const el = $(id); if (el) el.innerHTML = userOptions; });
  const profileSelect = $('#timeOffProfileUserSelect');
  if (profileSelect && !profileSelect.value && state.user) profileSelect.value = state.user.id;
  const requestSelect = $('#timeOffRequestUserSelect');
  if (requestSelect && !requestSelect.value && state.user) requestSelect.value = state.user.id;
  const teamProfileSelect = $('#teamProfileUserSelect');
  if (teamProfileSelect && !teamProfileSelect.value && state.user) teamProfileSelect.value = state.user.id;
  const memberHomeSelect = $('#memberHomeUserSelect');
  if (memberHomeSelect && !memberHomeSelect.value && state.user) memberHomeSelect.value = state.user.id;
  const messagePermSelect = $('#messagePermissionUserSelect');
  if (messagePermSelect && !messagePermSelect.value && state.user) messagePermSelect.value = state.user.id;
  const profileCanWorkSelect = $('#profileCanWorkUserSelect');
  if (profileCanWorkSelect && !profileCanWorkSelect.value && teamProfileSelect?.value) profileCanWorkSelect.value = teamProfileSelect.value;
  const profileCannotWorkSelect = $('#profileCannotWorkUserSelect');
  if (profileCannotWorkSelect && !profileCannotWorkSelect.value && teamProfileSelect?.value) profileCannotWorkSelect.value = teamProfileSelect.value;
  populateEmployeeScheduleProfileOptions();
}

function blueprintShiftLabels() {
  const labels = [
    ...(state.weekSchedule?.blueprints || []).map(bp => bp.shift_label),
    ...(state.weekSchedule?.blueprint_slots || []).map(bp => bp.shift_label),
    'Breakfast', 'Brunch', 'Lunch', 'Dinner', 'Prep', 'Close', 'Late Night'
  ];
  return unique(labels).sort((a, b) => String(a).localeCompare(String(b)));
}

function setMultiSelectValues(select, csv) {
  if (!select) return;
  const wanted = new Set(String(csv || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean));
  Array.from(select.options).forEach(opt => { opt.selected = wanted.has(String(opt.value).toLowerCase()); });
}

function selectedMultiValues(select) {
  return select ? Array.from(select.selectedOptions).map(o => o.value).filter(Boolean) : [];
}

function populateEmployeeScheduleProfileOptions() {
  const stationSelect = $('#scheduleProfileStationSelect');
  const shiftSelect = $('#scheduleProfileShiftSelect');
  const selectedUser = userById(selectedTeamProfileUserId()) || state.user || {};
  if (stationSelect) {
    stationSelect.innerHTML = stationNames().map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('') || '<option value="">Add stations in BUILD → Station Builder first</option>';
    setMultiSelectValues(stationSelect, selectedUser.qualified_stations || selectedUser.station || '');
  }
  if (shiftSelect) {
    shiftSelect.innerHTML = blueprintShiftLabels().map(sh => `<option value="${escapeHtml(sh)}">${escapeHtml(sh)}</option>`).join('') || '<option value="Any shift">Any shift</option>';
    setMultiSelectValues(shiftSelect, selectedUser.eligible_shifts || '');
  }
}

async function switchView(view, focusId = '') {
  if (!allowedView(view)) {
    toast('That tool is blocked on this profile unless a team leader grants access.');
    view = 'team';
  }
  const requestedFocus = focusId || state.pendingFocus || '';
  const derivedSubpage = subpageFromFocus(view, requestedFocus);
  if (!state.subpages) state.subpages = {};
  if (derivedSubpage) state.subpages[view] = derivedSubpage;
  if (!state.subpages[view] && DEFAULT_SUBPAGES[view]) state.subpages[view] = DEFAULT_SUBPAGES[view];
  state.activeView = view;
  applyRoleVisibility();
  $$('.view').forEach(v => v.classList.toggle('active', v.id === view));
  $$('#mainNav button').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('#pageTitle').textContent = ({
    dashboard: 'Dashboard', build: 'BUILD', inventory: 'Inventory', count: 'COUNT', files: 'FILES', recipes: 'Recipes & Plates', prep: 'Prep Sheets', orders: 'Orders & Vendors', scheduler: 'Manager', team: 'Team & Notes'
  })[view] || 'Dashboard';
  if (view === 'dashboard') await loadDashboard();
  if (view === 'build') await loadBuild();
  if (view === 'inventory') {
    if (state.pendingInventoryTab) { state.inventoryTab = state.pendingInventoryTab; state.pendingInventoryTab = ''; }
    await loadInventory();
  }
  if (view === 'count') await loadCount();
  if (view === 'recipes') await loadRecipes();
  if (view === 'prep') await loadPrep();
  if (view === 'orders') await loadOrders();
  if (view === 'files') await loadFiles();
  if (view === 'scheduler') await loadScheduler();
  if (view === 'team') await loadTeam();
  updateSubpageUI(view);
  if (view === 'team') setTeamSubpage(state.teamSubpage || DEFAULT_SUBPAGES.team);
  const target = focusId || state.pendingFocus;
  state.pendingFocus = '';
  if (target) focusElement(target);
}


async function loadFiles() {
  const [pos, pictures, inventories, deliveries, menu, qr, count] = await Promise.all([
    api('/api/files/pos_workspace').catch(err => ({ error: err.message, files: [], plates: [], profiles: [], storage: {} })),
    api('/api/files/pictures').catch(err => ({ error: err.message, folders: [], pictures: [], social_links: [], storage: {}, limits: {} })),
    api('/api/files/inventories').catch(err => ({ error: err.message, snapshots: [], prep_week: [], limits: {}, storage: {} })),
    api('/api/files/deliveries').catch(err => ({ error: err.message, vendors: [], orders: [], records: [], by_vendor: {}, limits: {} })),
    api('/api/files/menu_workspace').catch(err => ({ error: err.message, rows: [], by_shift: {}, csv: '', limits: {}, storage: {} })),
    api('/api/files/qr_codes').catch(err => ({ error: err.message, recipes: [], codes: [], limits: {} })),
    api('/api/count/stock?days=7').catch(() => state.countData || { rows: [], suggested: [], vendors: {} }),
  ]);
  state.filesPos = pos;
  state.filesPictures = pictures;
  state.filesInventories = inventories;
  state.filesDeliveries = deliveries;
  state.filesMenu = menu;
  state.filesQr = qr;
  state.countData = count.rows ? count : state.countData;
  renderFilesPosWorkspace();
  renderFilesPicturesWorkspace();
  renderFilesVendorTools();
  renderFilesInventoriesWorkspace();
  renderFilesDeliveriesWorkspace();
  renderFilesMenu();
  renderFilesQrWorkspace();
}

function humanBytes(bytes) {
  const n = Number(bytes || 0);
  if (n >= 1024 * 1024 * 1024) return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

function renderStorageMeter(targetId, storage) {
  const el = document.getElementById(targetId);
  if (!el) return;
  const pct = Math.min(100, Number(storage?.used_pct || 0));
  const settings = storage?.settings || {};
  el.innerHTML = `<div class="row wrap"><strong>FILES storage</strong><span>${humanBytes(storage?.used_bytes)} used of ${humanBytes(storage?.limit_bytes)}</span><span class="muted">Provider cost basis: ${money(settings.provider_cost_per_gb_month || 0)}/GB/mo · estimated cap cost ${money(settings.monthly_storage_cost || 0)}/mo</span></div><div class="meter"><span style="width:${pct}%"></span></div><p class="muted">${escapeHtml(settings.subscription_storage_note || 'Storage cap is controlled by the website owner and can be priced into subscription tiers.')}</p>`;
}

function selectedPosPlateNames() {
  return Array.from(state.selectedPosPlates || new Set()).filter(Boolean);
}

function renderFilesPosWorkspace() {
  const data = state.filesPos || { files: [], plates: [], profiles: [], storage: {} };
  renderStorageMeter('filesStorageMeterPos', data.storage || {});
  const selector = $('#posPlateSelector');
  if (selector) {
    selector.innerHTML = listOrEmpty((data.plates || []).map(p => {
      const checked = state.selectedPosPlates?.has(p.plate_name) ? 'checked' : '';
      return `<label class="plate-check"><input type="checkbox" class="pos-plate-check" value="${escapeHtml(p.plate_name)}" ${checked}><span><strong>${escapeHtml(p.plate_name)}</strong><small>${qty(p.qty_total)} sold · ${p.sale_rows} row(s) · ${p.special_rows || 0} special row(s) · ${p.matched_recipe_id ? 'matched recipe' : (p.matched_dish_id ? 'matched plate' : 'unmatched plate name')}</small></span></label>`;
    }), 'No plates scanned yet. Upload a POS CSV to populate SHOW PLATES.');
  }
  const filesList = $('#posCsvFilesList');
  if (filesList) filesList.innerHTML = listOrEmpty((data.files || []).map(f => `<div class="list-item"><div class="row"><strong>${escapeHtml(f.filename)}</strong><span>${fmtDateTime(f.uploaded_at)}</span></div><span class="muted">Rows ${f.row_count} · matched/imported ${f.imported_count} · missing plate names ${f.missing_count} · ${escapeHtml(f.notes || f.source_kind || '')}</span></div>`), 'No POS CSV files uploaded yet.');
  const profiles = $('#posProjectionProfiles');
  if (profiles) profiles.innerHTML = listOrEmpty((data.profiles || []).map(p => `<div class="list-item"><div class="row"><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.profile_type)}</span></div><span class="muted">Saved ${fmtDateTime(p.updated_at)} · ready for PREP → FORECASTER upload.</span></div>`), 'No projection profiles saved yet.');
}

async function uploadSelectedPosCsvFiles() {
  const input = $('#posCsvFileInput');
  const files = Array.from(input?.files || []);
  if (!files.length) return toast('Choose one or more POS CSV files first.');
  const payloadFiles = [];
  for (const file of files) {
    const csv = await file.text();
    payloadFiles.push({ filename: file.name, csv, size_bytes: file.size });
  }
  const res = await api('/api/files/pos/upload_csv', { method: 'POST', body: JSON.stringify({ files: payloadFiles, notes: $('#posCsvUploadNote')?.value || '', source_kind: 'nightly_or_ytd_upload' }) });
  state.filesPos = res.workspace || state.filesPos;
  state.selectedPosPlates = new Set((state.filesPos.plates || []).map(p => p.plate_name));
  renderFilesPosWorkspace();
  toast(`Scanned ${payloadFiles.length} CSV file(s); imported ${res.imported || 0} matched sales rows.`);
  await loadOrders().catch(() => {});
}

async function runPosProjection() {
  const plates = selectedPosPlateNames();
  if (!plates.length) return toast('Select at least one plate first.');
  const projection_type = $('#posProjectionType')?.value || 'week';
  const res = await api('/api/files/pos/project', { method: 'POST', body: JSON.stringify({ plates, projection_type }) });
  state.lastPosProjection = res;
  const el = $('#posProjectionResult');
  if (el) el.innerHTML = `<table><thead><tr><th>Plate</th><th>History qty</th><th>Daily avg</th><th>Projected ${escapeHtml(projection_type)}</th><th>History window</th></tr></thead><tbody>${(res.plates || []).map(p => `<tr><td><strong>${escapeHtml(p.plate_name)}</strong></td><td>${qty(p.history_qty)}</td><td>${qty(p.daily_avg)}</td><td>${qty(p.projected_qty)}</td><td>${escapeHtml(p.first_sale || '')} → ${escapeHtml(p.last_sale || '')}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">No projection rows found.</div></td></tr>'}</tbody></table>`;
}

async function runPosSpecialStats() {
  const plates = selectedPosPlateNames();
  if (!plates.length) return toast('Select at least one plate first.');
  const days = $$('#posSpecialDays input:checked').map(x => x.value);
  const specific_days_only = Boolean($('#posSpecialSpecificDays')?.checked);
  const res = await api('/api/files/pos/ran_special', { method: 'POST', body: JSON.stringify({ plates, days, specific_days_only }) });
  state.lastPosSpecial = res;
  const rows = [];
  (res.plates || []).forEach(p => (p.stats || []).forEach(stat => rows.push({ plate: p.plate_name, usedSpecial: p.used_special_flag, ...stat })));
  const el = $('#posSpecialResult');
  if (el) el.innerHTML = `<table><thead><tr><th>Plate</th><th>Day offered on</th><th>Price sold at</th><th>Plates sold</th><th>Rows</th><th>Dates</th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${escapeHtml(r.plate)}</strong>${r.usedSpecial ? '<br><small>special flag found</small>' : '<br><small>all matching rows used</small>'}</td><td>${escapeHtml(r.day_offered_on)}</td><td>${money(r.price_sold_at || 0)}</td><td>${qty(r.plates_sold)}</td><td>${r.sale_rows}</td><td>${escapeHtml((r.dates || []).join(', '))}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No special history found for the selected plates/days.</div></td></tr>'}</tbody></table>`;
}

async function savePosProfile(kind = 'projection') {
  const payload = kind === 'special' ? state.lastPosSpecial : state.lastPosProjection;
  if (!payload) return toast(kind === 'special' ? 'Run special stats before saving.' : 'Run a projection before saving.');
  const name = $('#posProjectionProfileName')?.value || `${kind === 'special' ? 'Special' : 'Projection'} ${todayInput()}`;
  const res = await api('/api/files/pos/save_profile', { method: 'POST', body: JSON.stringify({ name, profile_type: kind, payload }) });
  state.filesPos = res.workspace || state.filesPos;
  renderFilesPosWorkspace();
  toast('Profile saved to the Projection folder.');
}

function renderFilesPicturesWorkspace() {
  const data = state.filesPictures || { folders: [], pictures: [], social_links: [], storage: {} };
  renderStorageMeter('filesStorageMeterPictures', data.storage || {});
  const folders = $('#pictureFolderList');
  if (folders) folders.innerHTML = listOrEmpty((data.folders || []).map(f => `<div class="list-item"><div class="row"><strong>${escapeHtml(f.name)}</strong><span>${escapeHtml(f.purpose || 'general')}</span></div><span class="muted">Created ${fmtDateTime(f.created_at)}</span></div>`), 'No picture folders yet.');
  const grid = $('#filesPictureGrid');
  if (grid) grid.innerHTML = listOrEmpty((data.pictures || []).map(p => `<article class="recipe-card plate-card picture-file-card"><img class="plate-photo" src="${escapeHtml(p.public_url)}" alt="${escapeHtml(p.original_name)}"><h3>${escapeHtml(p.linked_name || p.original_name)}</h3><p class="muted">${escapeHtml(p.folder_name || '')} · ${escapeHtml(p.usage_target || '')} · ${humanBytes(p.size_bytes)}</p></article>`), 'No uploaded pictures yet. Use the Folder builder above.');
  const socialSelect = $('#socialPictureSelect');
  if (socialSelect) socialSelect.innerHTML = '<option value="">Choose uploaded picture…</option>' + (data.pictures || []).map(p => `<option value="${p.id}">${escapeHtml(p.linked_name || p.original_name)}</option>`).join('');
  const links = Object.fromEntries((data.social_links || []).map(l => [String(l.platform || '').toLowerCase(), l.url]));
  if ($('#socialInstagram')) $('#socialInstagram').value = links.instagram || '';
  if ($('#socialFacebook')) $('#socialFacebook').value = links.facebook || '';
  if ($('#socialTiktok')) $('#socialTiktok').value = links.tiktok || '';
}

async function makePictureFolderAndUpload() {
  const name = $('#pictureFolderName')?.value?.trim();
  if (!name) return toast('Enter a folder name first.');
  if (!state.pendingPictureFiles?.length) return toast('Click + and choose photo(s) before MAKE FOLDER.');
  const folderRes = await api('/api/files/pictures/folders', { method: 'POST', body: JSON.stringify({ name, purpose: $('#pictureFolderPurpose')?.value || 'general' }) });
  const files = [];
  for (const file of state.pendingPictureFiles) {
    const data_url = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); });
    files.push({ name: file.name, content_type: file.type || 'image/jpeg', size_bytes: file.size, data_url });
  }
  await api('/api/files/pictures/upload', { method: 'POST', body: JSON.stringify({ folder_id: folderRes.id, usage_target: $('#pictureFolderPurpose')?.value || 'general', linked_name: $('#pictureLinkedName')?.value || '', files }) });
  state.pendingPictureFiles = [];
  if ($('#pictureUploadInput')) $('#pictureUploadInput').value = '';
  if ($('#pictureUploadHint')) $('#pictureUploadHint').textContent = 'Upload complete. Click + to add another folder.';
  toast(`Uploaded ${files.length} picture(s) to ${name}.`);
  const refreshed = await api('/api/files/pictures');
  state.filesPictures = refreshed;
  renderFilesPicturesWorkspace();
}

async function saveSocialLinks() {
  await api('/api/files/pictures/social_links', { method: 'POST', body: JSON.stringify({ links: { instagram: $('#socialInstagram')?.value || '', facebook: $('#socialFacebook')?.value || '', tiktok: $('#socialTiktok')?.value || '' } }) });
  toast('Social links saved to this user profile.');
  state.filesPictures = await api('/api/files/pictures');
  renderFilesPicturesWorkspace();
}

async function generateSocialPrompt() {
  const res = await api('/api/files/pictures/generate_prompt', { method: 'POST', body: JSON.stringify({ picture_id: $('#socialPictureSelect')?.value || '', plate_name: $('#socialPlateName')?.value || '', occasion: $('#socialOccasion')?.value || '', tone: $('#socialTone')?.value || '' }) });
  const out = $('#socialPromptOutput');
  if (out) { out.value = res.prompt || ''; out.focus(); out.select(); }
  toast('Prompt generated. Copy/paste it into the AI model with the selected picture.');
}

function renderFilesVendorTools() {
  renderFilesInventorySnapshot();
  loadFilesPrepSheets(state.filesPrepDay || 'today').catch(() => {});
  renderFilesVendorSheet();
  renderFilesMenu();
  renderFilesSchedules();
}

function renderFilesInventorySnapshot() {
  const el = $('#filesInventorySnapshot');
  if (!el) return;
  const rows = (state.products || []).slice().sort((a,b) => String(a.category || '').localeCompare(String(b.category || '')) || String(a.name || '').localeCompare(String(b.name || '')));
  el.innerHTML = `<table><thead><tr><th>Item</th><th>Category</th><th>On hand</th><th>Par</th><th>Vendor</th><th>Location</th></tr></thead><tbody>${rows.map(p => `<tr><td><strong>${escapeHtml(p.name)}</strong></td><td>${escapeHtml(p.category || '')}</td><td>${qty(p.current_qty)} ${escapeHtml(p.unit || '')}</td><td>${qty(p.par_level)} ${escapeHtml(p.unit || '')}</td><td>${escapeHtml(p.vendor_name || '')}</td><td>${escapeHtml(p.stock_location || p.stocked_where || p.station || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No inventory items saved yet.</div></td></tr>'}</tbody></table>`;
}

async function loadFilesPrepSheets(day = 'today') {
  state.filesPrepDay = day;
  const data = await api('/api/prep_sheets').catch(() => ({ prep_sheets: [] }));
  const today = new Date(todayInput() + 'T00:00:00');
  const offset = day === 'yesterday' ? -1 : day === 'tomorrow' ? 1 : 0;
  today.setDate(today.getDate() + offset);
  const wanted = today.toISOString().slice(0, 10);
  const sheets = (data.prep_sheets || []).filter(s => !s.prep_date || s.prep_date === wanted);
  const tabs = $('#filesPrepDayTabs');
  if (tabs) tabs.querySelectorAll('button').forEach(btn => btn.classList.toggle('active', btn.dataset.filesPrepDay === day));
  const el = $('#filesPrepList');
  if (el) el.innerHTML = listOrEmpty(sheets.map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.status || '')}</span></div><span class="muted">${escapeHtml(s.prep_date || '')} · ${escapeHtml(s.service_period || '')}</span><div class="row"><button class="ghost print-prep" data-id="${s.id}">Print</button></div></div>`), `No ${day} prep sheets found.`);
}

function renderFilesVendorSheet() {
  const select = $('#filesVendorSelect');
  if (select && !select.dataset.ready) {
    select.innerHTML = '<option value="">All vendors</option>' + (state.vendors || []).map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
    select.dataset.ready = '1';
  }
  const body = $('#filesVendorBody');
  if (!body) return;
  const vendorId = state.filesVendor || select?.value || '';
  const rows = (state.countData?.rows || state.products || []).filter(p => !vendorId || String(p.vendor_id || '') === String(vendorId));
  body.innerHTML = `<table><thead><tr><th>Vendor</th><th>Item</th><th>Have</th><th>Par</th><th>Suggested</th><th>Risk</th></tr></thead><tbody>${rows.map(r => `<tr><td>${escapeHtml(r.vendor_name || '')}</td><td><strong>${escapeHtml(r.name || r.product_name || '')}</strong></td><td>${qty(r.have ?? r.current_qty)} ${escapeHtml(r.have_unit || r.unit || '')}</td><td>${qty(r.par ?? r.par_level)} ${escapeHtml(r.have_unit || r.unit || '')}</td><td>${qty(r.suggested_order || 0)} ${escapeHtml(r.supplier_unit || r.package_unit || '')}</td><td>${escapeHtml(r.risk || '')}</td></tr>`).join('') || '<tr><td colspan="6"><div class="empty">No vendor-sheet rows found.</div></td></tr>'}</tbody></table>`;
}

function tierBadge(limits) {
  const tier = (limits?.tier || 'top').toUpperCase();
  return `<span class="tier-badge">${escapeHtml(tier)} tier</span>`;
}

function renderFilesInventoriesWorkspace() {
  const data = state.filesInventories || { snapshots: [], prep_week: [], limits: {} };
  const limits = data.limits || {};
  const cap = $('#inventoryRetentionInfo');
  if (cap) cap.innerHTML = `${tierBadge(limits)} Inventory snapshots: ${limits.inventory_snapshots || 0} · COUNT snapshots: ${limits.count_snapshots || 0}. Oldest files roll off automatically.`;
  const prep = $('#filesInventoryPrepWeek');
  if (prep) prep.innerHTML = listOrEmpty((data.prep_week || []).map(d => `<div class="list-item"><div class="row"><strong>${escapeHtml(d.label)} · ${escapeHtml(d.date)}</strong><span>${(d.sheets || []).length} sheet(s)</span></div>${(d.sheets || []).slice(0,5).map(s => `<span class="muted">${escapeHtml(s.title)} · ${escapeHtml(s.service_period || '')}</span>`).join('')}</div>`), 'No rolling prep sheets found for this week.');
  const counts = $('#filesInventoryCountSnapshots');
  if (counts) counts.innerHTML = listOrEmpty((data.snapshots || []).filter(s => s.snapshot_type === 'count').map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${fmtDateTime(s.created_at)}</span></div><span class="muted">COUNT snapshot · rolling tier storage</span></div>`), 'No saved COUNT snapshots yet.');
  const inv = $('#filesInventorySavedSnapshots');
  if (inv) inv.innerHTML = listOrEmpty((data.snapshots || []).filter(s => s.snapshot_type !== 'count').map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${fmtDateTime(s.created_at)}</span></div><span class="muted">Saved inventory file · rolling tier storage</span></div>`), 'No saved inventory snapshots yet.');
}

async function saveFilesInventorySnapshot(kind = 'inventory') {
  const res = await api('/api/files/inventories/save_snapshot', { method: 'POST', body: JSON.stringify({ snapshot_type: kind }) });
  state.filesInventories = res.workspace || state.filesInventories;
  renderFilesInventoriesWorkspace();
  toast(kind === 'count' ? 'COUNT snapshot saved. Oldest snapshots roll off by tier.' : 'Inventory snapshot saved. Oldest snapshots roll off by tier.');
}

function renderFilesDeliveriesWorkspace() {
  const data = state.filesDeliveries || { vendors: [], orders: [], records: [], by_vendor: {}, limits: {} };
  const limits = data.limits || {};
  const info = $('#deliveriesRetentionInfo');
  if (info) info.innerHTML = `${tierBadge(limits)} Delivery records/order pages saved: ${limits.delivery_records || 0}. Oldest files roll off automatically.`;
  const sel = $('#deliveriesVendorSelect');
  if (sel) {
    const current = sel.value;
    sel.innerHTML = '<option value="">All vendors</option>' + (data.vendors || []).map(v => `<option value="${v.id}">${escapeHtml(v.name)}</option>`).join('');
    if (current) sel.value = current;
  }
  const vendorId = sel?.value || '';
  const orders = (data.orders || []).filter(o => !vendorId || String(o.vendor_id || '') === String(vendorId));
  const list = $('#deliveryOrderDatesList');
  if (list) list.innerHTML = listOrEmpty(orders.map(o => `<div class="list-item"><div class="row"><strong>${escapeHtml(o.vendor_name || 'Vendor order')}</strong><span>${fmtDateTime(o.received_at || o.created_at)}</span></div><span class="muted">Status ${escapeHtml(o.status || '')} · order #${o.id}</span><button class="ghost" type="button" data-save-delivery-record="${o.id}">Save delivery file</button></div>`), 'No vendor order dates found yet. Create order sheets from Orders or COUNT.');
  const rec = $('#savedDeliveryRecordsList');
  if (rec) rec.innerHTML = listOrEmpty((data.records || []).map(r => `<div class="list-item"><div class="row"><strong>${escapeHtml(r.title)}</strong><span>${escapeHtml(r.delivery_date || '')}</span></div><span class="muted">${escapeHtml(r.vendor_name || 'All vendors')} · saved ${fmtDateTime(r.created_at)}</span></div>`), 'No saved delivery files yet.');
}

async function saveDeliveryRecord(orderId = '') {
  const res = await api('/api/files/deliveries/save_record', { method: 'POST', body: JSON.stringify({ order_id: orderId || 0 }) });
  state.filesDeliveries = res.workspace || state.filesDeliveries;
  renderFilesDeliveriesWorkspace();
  toast('Delivery/vendor order file saved. Oldest records roll off by tier.');
}

function renderFilesMenu() {
  const data = state.filesMenu || { rows: [], by_shift: {}, csv: '', limits: {} };
  const el = $('#filesMenuList');
  if (!el) return;
  const limits = data.limits || {};
  const level = limits.menu_level || 'full';
  const intro = `<div class="small-note">${tierBadge(limits)} Menu access: ${escapeHtml(level)}. Lowest tier exports plate CSV; plus tier groups by shift; pro adds pictures/ingredients; top tier has full recipe-card and prompt access.</div>`;
  const rows = data.rows || [];
  if (level === 'csv') {
    el.innerHTML = intro + `<pre class="csv-preview">${escapeHtml((data.csv || '').split('\n').slice(0, 25).join('\n'))}</pre>`;
    return;
  }
  const groups = data.by_shift || {};
  el.innerHTML = intro + Object.keys(groups).sort().map(shift => `<section class="menu-shift-group"><h3>${escapeHtml(shift)}</h3>${(groups[shift] || []).map(r => `<div class="list-item"><div class="row"><strong>${escapeHtml(r.name)}</strong><span>${money(r.menu_price || 0)}</span></div><span class="muted">${escapeHtml(r.station || '')}${(r.ingredients || []).length ? ' · ' + escapeHtml((r.ingredients || []).slice(0,8).join(', ')) : ''}</span>${(r.pictures || []).length ? `<div class="mini-photo-row">${r.pictures.map(p => `<img src="${escapeHtml(p.public_url)}" alt="${escapeHtml(p.original_name)}">`).join('')}</div>` : ''}</div>`).join('')}</section>`).join('') || '<div class="empty">No menu plates saved yet.</div>';
}

function downloadFilesMenuCsv() {
  downloadTextFile(`chef-ledger-menu-${todayInput()}.csv`, state.filesMenu?.csv || 'shift,plate,station,menu_price,ingredients\n');
}

function renderFilesQrWorkspace() {
  const data = state.filesQr || { recipes: [], codes: [], limits: {} };
  const limits = data.limits || {};
  const box = $('#qrTierInfo');
  if (box) box.innerHTML = `${tierBadge(limits)} ${limits.qr ? 'QR CODE MAKER is unlocked.' : 'QR CODE MAKER is locked to top-tier subscriptions.'}`;
  const select = $('#qrRecipeSelect');
  if (select) select.innerHTML = '<option value="">Choose recipe…</option>' + (data.recipes || []).map(r => `<option value="${r.id}">${escapeHtml(r.name)} · ${escapeHtml(r.station || '')}</option>`).join('');
  const list = $('#qrCodeList');
  if (list) list.innerHTML = listOrEmpty((data.codes || []).map(c => `<div class="list-item qr-code-record"><div class="row"><strong>${escapeHtml(c.recipe_name || c.label)}</strong><a href="${escapeHtml(c.url)}" target="_blank" rel="noreferrer">Open portable recipe</a></div><div class="qr-svg">${c.svg || ''}</div><span class="muted">Print this on recipe cards/books. Token ${escapeHtml(c.token || '')}</span></div>`), limits.qr ? 'No recipe QR codes made yet.' : 'Upgrade to top tier to generate recipe QR codes.');
}

async function createRecipeQrCode() {
  const recipe_id = $('#qrRecipeSelect')?.value || '';
  if (!recipe_id) return toast('Choose a recipe first.');
  const res = await api('/api/files/qr_codes/create', { method: 'POST', body: JSON.stringify({ recipe_id }) });
  state.filesQr = res.workspace || state.filesQr;
  renderFilesQrWorkspace();
  toast('Recipe QR code created.');
}

function renderFilesSchedules() {
  const el = $('#filesScheduleList');
  if (!el) return;
  const shifts = state.weekSchedule?.shifts || state.shifts || [];
  el.innerHTML = listOrEmpty(shifts.map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title || 'Shift')}</strong><span>${escapeHtml(s.assigned_name || 'Open')}</span></div><span class="muted">${escapeHtml(s.station || '')} · ${fmtDateTime(s.start_at)} → ${fmtDateTime(s.end_at || '')}</span></div>`), 'No schedule rows loaded yet. Open Manager Scheduler once to populate this list.');
}

async function loadForecaster() {
  state.forecaster = await api('/api/prep/forecaster').catch(err => ({ error: err.message, profiles: [], events: [], limits: {}, storage: {} }));
  renderForecasterWorkspace();
}

function parseProfilePayload(row) {
  try { return JSON.parse(row?.payload_json || '{}'); } catch { return {}; }
}

function renderForecasterWorkspace() {
  const data = state.forecaster || { profiles: [], events: [] };
  const select = $('#forecasterProfileSelect');
  if (select) {
    const current = select.value;
    select.innerHTML = '<option value="">Select saved projection/special profile…</option>' + (data.profiles || []).map(p => `<option value="${p.id}">${escapeHtml(p.name)} · ${escapeHtml(p.profile_type)}</option>`).join('');
    if (current) select.value = current;
  }
  renderForecasterSelectedProfile();
  const events = $('#forecasterEventList');
  if (events) events.innerHTML = listOrEmpty((data.events || []).map(e => `<div class="list-item"><div class="row"><strong>${escapeHtml(e.title)}</strong><span>${escapeHtml(e.status || '')}</span></div><span class="muted">${escapeHtml(e.start_date)} → ${escapeHtml(e.end_date)} · prep sheet #${e.prep_sheet_id || ''}</span>${e.status === 'active' ? `<button class="ghost warn" type="button" data-undo-forecast="${e.id}">UNDO / Cancel Special</button>` : ''}</div>`), 'No Forecaster events have been added to prep yet.');
}

function renderForecasterSelectedProfile() {
  const id = $('#forecasterProfileSelect')?.value || '';
  const profile = (state.forecaster?.profiles || []).find(p => String(p.id) === String(id));
  const box = $('#forecasterProfilePreview');
  const adjust = $('#forecasterAdjustments');
  if (!box || !adjust) return;
  if (!profile) {
    box.innerHTML = '<div class="empty">Upload/select a saved FILES → POS CSV projection profile.</div>';
    adjust.innerHTML = '';
    return;
  }
  const payload = parseProfilePayload(profile);
  const plates = payload.plates || [];
  box.innerHTML = `<strong>${escapeHtml(profile.name)}</strong><p class="muted">${escapeHtml(profile.profile_type)} · ${plates.length} plate(s) · saved ${fmtDateTime(profile.updated_at)}</p>`;
  adjust.innerHTML = plates.map(p => `<label>${escapeHtml(p.plate_name || p.plate || 'Plate')}<input data-forecast-plate="${escapeHtml(p.plate_name || p.plate || '')}" type="number" step="0.001" value="${Number(p.projected_qty || p.plates_sold || p.history_qty || 0).toFixed(3)}"></label>`).join('') || '<div class="empty">Profile has no plate rows. Run and save a projection first.</div>';
}

async function applyForecasterProfile() {
  const profile_id = $('#forecasterProfileSelect')?.value || '';
  if (!profile_id) return toast('Select a saved projection profile first.');
  const start_date = $('#forecasterStartDate')?.value || todayInput();
  const end_date = $('#forecasterEndDate')?.value || start_date;
  const adjustments = {};
  $$('[data-forecast-plate]').forEach(input => { adjustments[input.dataset.forecastPlate] = Number(input.value || 0); });
  const res = await api('/api/prep/forecaster/apply', { method: 'POST', body: JSON.stringify({ profile_id, start_date, end_date, adjustments }) });
  state.forecaster = res.workspace || state.forecaster;
  renderForecasterWorkspace();
  toast(`Added to prep: ${res.task_count || 0} task(s), ${res.impact_count || 0} inventory impact row(s).`);
  await Promise.all([loadInventory().catch(()=>{}), loadOrders().catch(()=>{})]);
}

async function undoForecasterEvent(eventId) {
  if (!confirm('Want to Cancel Special ?')) return;
  const res = await api('/api/prep/forecaster/undo', { method: 'POST', body: JSON.stringify({ event_id: eventId }) });
  state.forecaster = res.workspace || state.forecaster;
  renderForecasterWorkspace();
  toast('Special/forecast canceled and removed from prep/order impact.');
  await Promise.all([loadInventory().catch(()=>{}), loadOrders().catch(()=>{})]);
}

async function loadBuild() {
  await preloadCore();
  const stationData = await api('/api/stations').catch(() => ({ stations: [], station_records: [] }));
  state.stations = stationData.stations || [];
  state.stationRecords = stationData.station_records || [];
  populateSelects();
  populatePrepBuildStationSelect();
  renderStationBuilderTool();
  renderStationBuildList();
  renderLocationBuildList();
  await loadScheduleBlueprintSummary();
  applyRoleVisibility();
}

async function loadScheduleBlueprintSummary() {
  const blueprintEl = $('#blueprintList');
  if (!blueprintEl) return;
  const weekInput = $('#scheduleWeekStart');
  const weekStart = weekInput?.value || mondayOf(new Date()).toISOString().slice(0, 10);
  const data = await api(`/api/scheduler/week?start=${encodeURIComponent(weekStart)}`).catch(() => ({ blueprints: [] }));
  state.weekSchedule = { ...(state.weekSchedule || {}), ...data };
  const blueprints = data.blueprints || [];
  const shifts = unique(blueprints.map(bp => bp.shift_label || 'Shift')).sort();
  const stations = unique(blueprints.map(bp => bp.station || 'Station')).sort();
  const days = unique(blueprints.map(bp => dayNames[Number(bp.day_of_week || 0)] || 'Day')).sort();
  blueprintEl.innerHTML = blueprints.length ? `<div class="blueprint-summary-card"><div class="row"><strong>${blueprints.length} needed-shift templates saved</strong><span>${stations.length} stations · ${shifts.length} shift types</span></div><p class="muted">The detailed template list is hidden from the customer demo. Use this Blueprint Maker to add or adjust a station/shift timeframe; the Manager Schedule Maker uses the saved templates as grey needed-shift boxes.</p><div class="chip-row"><span>${escapeHtml(days.join(', '))}</span><span>${escapeHtml(shifts.join(', '))}</span><span>${escapeHtml(stations.slice(0, 8).join(', '))}${stations.length > 8 ? '…' : ''}</span></div></div>` : '<div class="empty">No scheduler blueprint saved yet. Use Schedule BUILD to create the normal weekly station coverage.</div>';
  populateEmployeeScheduleProfileOptions();
}

function stationBuilderRowTemplate(value = '') {
  return `<div class="station-build-row">
    <label>NAME <input class="station-builder-name" placeholder="Expo, Garnish, Sauté, Salad, Dessert, Fry, Grill" value="${escapeHtml(value)}"/></label>
    <button class="ghost remove-station-builder-row" type="button">Remove</button>
  </div>`;
}

function renderStationBuilderTool() {
  const mount = $('#buildStationToolMount');
  if (!mount) return;
  const examples = ['Expo', 'Garnish', 'Sauté', 'Salad', 'Dessert', 'Fry', 'Grill', 'Pantry', 'Raw Bar', 'Bakery'];
  mount.innerHTML = `<form class="form-card inner-form station-builder-card" id="stationBulkForm">
    <h3>Station setup</h3>
    <p class="muted">Enter the station names this restaurant actually uses. Click <strong>+ Add Next Station</strong> to keep building the list, then click <strong>Save Progress</strong>. Saved stations populate station dropdowns site-wide: Prep, Recipe Builder, Plate Builder, Scheduler, Employee Profile BUILD, station closeout, and manager tools.</p>
    <div class="station-example-row">${examples.map(ex => `<button class="ghost station-example-chip" type="button" data-station-example="${escapeHtml(ex)}">${escapeHtml(ex)}</button>`).join('')}</div>
    <div class="station-builder-rows" id="stationBuilderRows">${stationBuilderRowTemplate()}</div>
    <div class="row wrap">
      <button class="secondary" id="addStationBuilderRowBtn" type="button">+ Add Next Station</button>
      <button class="primary" type="submit">Save Progress</button>
    </div>
  </form>
  <div class="list compact-list" id="stationBuildList"></div>`;

  const rows = $('#stationBuilderRows', mount);
  $('#addStationBuilderRowBtn', mount)?.addEventListener('click', () => {
    rows.insertAdjacentHTML('beforeend', stationBuilderRowTemplate());
    rows.lastElementChild?.querySelector('input')?.focus();
  });
  $$('.station-example-chip', mount).forEach(btn => btn.addEventListener('click', () => {
    const firstBlank = $$('.station-builder-name', mount).find(input => !input.value.trim());
    if (firstBlank) {
      firstBlank.value = btn.dataset.stationExample || btn.textContent.trim();
      firstBlank.focus();
    } else {
      rows.insertAdjacentHTML('beforeend', stationBuilderRowTemplate(btn.dataset.stationExample || btn.textContent.trim()));
      rows.lastElementChild?.querySelector('input')?.focus();
    }
  }));
  rows.addEventListener('click', (e) => {
    const remove = e.target.closest('.remove-station-builder-row');
    if (!remove) return;
    const allRows = $$('.station-build-row', mount);
    if (allRows.length <= 1) {
      const firstInput = allRows[0]?.querySelector('input');
      if (firstInput) firstInput.value = '';
      return;
    }
    remove.closest('.station-build-row')?.remove();
  });
  $('#stationBulkForm', mount)?.addEventListener('submit', saveStationBuilderProgress);
}

async function saveStationBuilderProgress(e) {
  e.preventDefault();
  if (!(await confirmBuildSubmit(e, 'Station Builder'))) return;
  const names = unique($$('.station-builder-name', e.target).map(input => input.value.trim()).filter(Boolean));
  if (!names.length) return toast('Add at least one station name before saving progress.');
  let saved = 0;
  for (const name of names) {
    await api('/api/stations', {
      method: 'POST',
      body: JSON.stringify({
        name,
        station_type: 'station',
        notes: 'Created in BUILD → Station Builder. This station is available across Prep, Recipes, Plates, Scheduler, Employee Profile BUILD, and station closeout.'
      })
    });
    saved += 1;
  }
  toast(`Saved ${saved} station${saved === 1 ? '' : 's'} and updated station dropdowns site-wide.`);
  await preloadCore();
  await loadBuild();
  await loadScheduler().catch(() => {});
  await loadPrep().catch(() => {});
}

function renderStationBuildList() {
  const el = $('#stationBuildList');
  if (!el) return;
  const records = state.stationRecords || (state.stations || []).map(name => ({ name }));
  el.innerHTML = listOrEmpty(records.map(st => `<div class="list-item"><div class="row"><strong>${escapeHtml(st.name)}</strong><span>${escapeHtml(st.station_type || 'station')}</span></div><span class="muted">${escapeHtml(st.notes || 'Available in Inventory, Recipes, Menu Items, Prep, Station Closeout, and Scheduler.')}</span></div>`), 'No stations saved yet. Add names above, then click Save Progress.');
}

function renderLocationBuildList() {
  const el = $('#locationBuilderList');
  if (!el) return;
  const records = (state.locations || []).slice().sort((a,b) => Number(a.sort_order || 999) - Number(b.sort_order || 999) || String(a.name || '').localeCompare(String(b.name || '')));
  el.innerHTML = listOrEmpty(records.map(loc => `<div class="list-item"><div class="row"><strong>${Number(loc.sort_order || 999)}. ${escapeHtml(loc.name || '')}</strong><span>${escapeHtml(loc.subclass || 'stock area')}</span></div><span class="muted">${escapeHtml(loc.notes || 'COUNT tab from Location Builder.')}</span></div>`), 'No COUNT locations saved yet. Add rooms, shelves, coolers, or storage areas above.');
}

function scrollActiveViewTop(view = state.activeView) {
  setTimeout(() => {
    const el = document.getElementById(view) || document.querySelector('.view.active');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    else window.scrollTo({ top: 0, behavior: 'smooth' });
  }, 60);
}

function focusElement(id) {
  setTimeout(() => {
    const el = document.getElementById(id) || document.querySelector(`[name="${CSS.escape(id)}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.classList.add('focus-pulse');
    setTimeout(() => el.classList.remove('focus-pulse'), 1600);
  }, 80);
}

async function loadDashboard() {
  await preloadCore();
  const data = await api('/api/dashboard');
  const taskCount = data.tasks?.length || 0;
  const riskCount = data.low_stock?.length || 0;
  const orderRisk = data.suggestions?.reduce((sum, s) => sum + Number(s.suggested_order_qty || 0) * Number(s.cost_per_unit || 0), 0) || 0;
  $('#dashboardCards').innerHTML = [
    kpi('Open prep tasks', taskCount, 'unfinished tasks tied to inventory usage'),
    kpi('Inventory risks', riskCount, 'items projected below par/reorder'),
    kpi('Order estimate', money(orderRisk), 'based on prep + forecast'),
    kpi('Open shifts', data.open_shifts?.length || 0, 'available for sign-up'),
  ].join('');
  $('#neededNowList').innerHTML = listOrEmpty((data.tasks || []).map(t => `
    <div class="list-item"><div class="row"><strong>${escapeHtml(t.title)}</strong><span class="status-pill">P${t.priority}</span></div><span class="muted">${escapeHtml(t.station || 'No station')} · ${qty(t.qty)} ${escapeHtml(t.unit)} · due ${escapeHtml(t.due_at || 'not set')}</span></div>`));
  $('#riskList').innerHTML = listOrEmpty((data.low_stock || []).map(s => riskItem(s)));
  $('#openShiftList').innerHTML = listOrEmpty((data.open_shifts || []).map(s => `<div class="list-item"><strong>${escapeHtml(s.title)}</strong><span class="muted">${escapeHtml(s.station)} · ${fmtDateTime(s.start_at)} → ${fmtDateTime(s.end_at)}</span></div>`));
  $('#expiringList').innerHTML = listOrEmpty((data.expiring_batches || []).map(b => `<div class="list-item"><strong>${escapeHtml(b.notes || 'Prepared batch')}</strong><span class="muted">${escapeHtml(b.station)} · expires ${fmtDateTime(b.expires_at)}</span></div>`));
}

function kpi(label, value, sub) {
  return `<article class="card kpi"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong><span>${escapeHtml(sub)}</span></article>`;
}

function listOrEmpty(items, text = 'Nothing to show yet.') {
  return items.length ? items.join('') : `<div class="empty">${escapeHtml(text)}</div>`;
}

function listLimited(items, text = 'Nothing to show yet.', limit = 3, moreText = 'more saved in the profile/build database and hidden from this demo view.') {
  if (!items.length) return `<div class="empty">${escapeHtml(text)}</div>`;
  const shown = items.slice(0, limit).join('');
  const remaining = items.length - limit;
  const more = remaining > 0 ? `<div class="list-summary">Showing ${Math.min(items.length, limit)} examples. ${remaining} ${escapeHtml(moreText)}</div>` : '';
  return shown + more;
}

function riskItem(s) {
  return `<div class="list-item">
    <div class="row"><strong>${escapeHtml(s.product_name)}</strong><span class="risk-${escapeHtml(s.risk)}">${escapeHtml(String(s.risk || 'watchlist').replaceAll('_', ' '))}</span></div>
    <span class="muted">On hand ${qty(s.current_qty)} ${escapeHtml(s.unit || s.base_unit || '')} · prep uses ${qty(s.pending_prep_usage)} · forecast uses ${qty(s.forecast_usage)} · projected ${qty(s.projected_qty)} · order ${qty(s.suggested_order_qty)} ${escapeHtml(s.supplier_unit || '')}</span>
  </div>`;
}

function renderInventoryWatchlist() {
  const orderEl = $('#inventoryOrderRiskList');
  const parEl = $('#inventoryParRiskList');
  const suggestions = (state.suggestions || []).filter(s => String(s.risk || 'watchlist') !== 'ok');
  const rows = (state.inventorySheet?.rows || []).filter(r => String(r.risk || '') !== 'ok');
  if (orderEl) orderEl.innerHTML = listOrEmpty(suggestions.map(s => riskItem(s)), 'No order-risk items right now.');
  if (parEl) parEl.innerHTML = listOrEmpty(rows.map(r => `<div class="list-item">
    <div class="row"><strong>${escapeHtml(r.name)}</strong><span class="risk-${escapeHtml(r.risk || 'watchlist')}">${escapeHtml(String(r.risk || 'watchlist').replaceAll('_', ' '))}</span></div>
    <span class="muted">Station ${escapeHtml(r.station || 'unassigned')} · storage ${qty(r.storage_qty)} ${escapeHtml(r.unit)} · in-use ${qty(r.in_use_qty)} · prep est. ${qty(r.prep_estimated_qty)} · after prep ${qty(r.total_after_prep_qty)} · par ${qty(r.par_level)}</span>
  </div>`), 'No items at or below par after prep.');
}

function fmtDateTime(value) {
  if (!value) return 'not set';
  try { return new Date(value).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  catch { return value; }
}

async function loadInventory() {
  const [data, sheet, suggestions] = await Promise.all([api('/api/products'), api('/api/inventory/sheet_summary').catch(() => ({ rows: [], summary: {} })), api('/api/orders/suggest?days=3').catch(() => ({ suggestions: [] }))]);
  state.products = data.products || [];
  state.inventorySheet = sheet;
  state.suggestions = suggestions.suggestions || state.suggestions || [];
  populateSelects();
  $('#inventoryTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Vendor</th><th>On hand</th><th>Par</th><th>Reorder</th><th>Cost/unit</th><th>Station</th><th>Stock count</th></tr></thead><tbody>
    ${state.products.map(p => `<tr>
      <td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.category || '')}</span></td>
      <td>${escapeHtml(p.vendor_name || 'Unassigned')}</td>
      <td class="${Number(p.current_qty) < Number(p.reorder_point) ? 'danger' : Number(p.current_qty) < Number(p.par_level) ? 'warn' : 'good'}">${qty(p.current_qty)} ${escapeHtml(p.unit)}</td>
      <td>${qty(p.par_level)}</td><td>${qty(p.reorder_point)}</td><td>${money(p.cost_per_unit)}</td><td>${escapeHtml(p.station || '')}</td>
      <td><div class="inline-row"><input type="number" step="0.001" value="${Number(p.current_qty || 0)}" data-count-input="${p.id}"><button class="ghost count-btn" data-id="${p.id}">Save</button></div></td>
    </tr>`).join('')}
  </tbody></table></div>`;
  renderInventorySheetTabs();
  renderInventoryWatchlist();
}

function renderInventorySheetTabs() {
  const sheet = state.inventorySheet || { rows: [], summary: {} };
  const rows = sheet.rows || [];
  const tab = state.inventoryTab || 'onhand';
  $$('#inventorySheetTabs [data-inventory-tab]').forEach(btn => btn.classList.toggle('active', btn.dataset.inventoryTab === tab));
  const s = sheet.summary || {};
  const summary = $('#inventorySheetSummary');
  if (summary) summary.innerHTML = [
    kpi('Inventory items', String(s.products || rows.length || 0), 'saved stock records'),
    kpi('Open prep impact', String(s.open_prep_items || 0), 'items affected by uncompleted prep'),
    kpi('At or below PAR', String(s.below_par || 0), 'shown on PAR tab'),
    kpi('Critical', String(s.critical || 0), 'projected at or below zero'),
  ].join('');
  const table = $('#inventorySheetTable');
  if (!table) return;
  let filtered = rows;
  let columns = '';
  if (tab === 'onhand') {
    columns = '<th>Item</th><th>Station</th><th>Storage</th><th>In-use</th><th>Total on hand</th><th>Par</th>';
  } else if (tab === 'inuse') {
    filtered = rows.filter(r => Number(r.in_use_qty || 0) > 0);
    columns = '<th>Item</th><th>Station</th><th>In-use</th><th>Source</th><th>Storage left</th>';
  } else if (tab === 'storage') {
    columns = '<th>Item</th><th>Storage qty</th><th>Vendor</th><th>Station</th><th>Par</th>';
  } else if (tab === 'prep') {
    filtered = rows.filter(r => Number(r.prep_estimated_qty || 0) > 0);
    columns = '<th>Item</th><th>Station</th><th>Estimated prep use</th><th>Open prep source</th><th>Storage before prep</th>';
  } else if (tab === 'total') {
    columns = '<th>Item</th><th>Station</th><th>Storage</th><th>In-use</th><th>Prep est.</th><th>Total after prep</th><th>Status</th>';
  } else if (tab === 'delivery') {
    const deliveryRows = state.suggestions || [];
    columns = '<th>Vendor</th><th>Item</th><th>Current storage</th><th>Prep use</th><th>POS forecast</th><th>Projected before delivery</th><th>Suggested order</th>';
    const deliveryBody = deliveryRows.map(s => `<tr><td>${escapeHtml(s.vendor_name || 'Unassigned')}</td><td><strong>${escapeHtml(s.product_name)}</strong><br><span class="muted">Delivery ${escapeHtml(s.delivery_date || '')}</span></td><td>${qty(s.current_qty)} ${escapeHtml(s.base_unit || s.unit)}</td><td>${qty(s.pending_prep_usage)} ${escapeHtml(s.base_unit || s.unit)}</td><td>${qty(s.forecast_usage)} ${escapeHtml(s.base_unit || s.unit)}</td><td class="risk-${escapeHtml(s.risk || 'watchlist')}">${qty(s.projected_qty)} ${escapeHtml(s.base_unit || s.unit)}</td><td><strong>${qty(s.suggested_order_qty)} ${escapeHtml(s.supplier_unit || '')}</strong></td></tr>`).join('');
    table.innerHTML = `<table><thead><tr>${columns}</tr></thead><tbody>${deliveryBody || `<tr><td colspan="7"><div class="empty">No delivery-risk items right now.</div></td></tr>`}</tbody></table>`;
    return;
  } else if (tab === 'watchlist') {
    const riskRows = state.suggestions || [];
    columns = '<th>Vendor</th><th>Item</th><th>Current</th><th>Prep use</th><th>Forecast use</th><th>Projected</th><th>Suggested order</th><th>Status</th>';
    const body = riskRows.map(s => `<tr><td>${escapeHtml(s.vendor_name || 'Unassigned')}</td><td><strong>${escapeHtml(s.product_name)}</strong><br><span class="muted">${escapeHtml(s.category || '')}</span></td><td>${qty(s.current_qty)} ${escapeHtml(s.base_unit || s.unit || '')}</td><td>${qty(s.pending_prep_usage)} ${escapeHtml(s.base_unit || s.unit || '')}</td><td>${qty(s.forecast_usage)} ${escapeHtml(s.base_unit || s.unit || '')}</td><td class="risk-${escapeHtml(s.risk || 'watchlist')}">${qty(s.projected_qty)} ${escapeHtml(s.base_unit || s.unit || '')}</td><td><strong>${qty(s.suggested_order_qty)} ${escapeHtml(s.supplier_unit || '')}</strong></td><td>${escapeHtml(String(s.risk || 'watchlist').replaceAll('_', ' '))}</td></tr>`).join('');
    table.innerHTML = `<table><thead><tr>${columns}</tr></thead><tbody>${body || `<tr><td colspan="8"><div class="empty">No watchlist or order-risk items right now.</div></td></tr>`}</tbody></table>`;
    renderInventoryWatchlist();
    return;
  } else {
    filtered = rows.filter(r => String(r.risk || '') !== 'ok');
    columns = '<th>Item</th><th>Station</th><th>Total after prep</th><th>Par</th><th>Reorder</th><th>Status</th>';
  }
  const body = filtered.map(r => {
    const status = String(r.risk || 'ok').replaceAll('_', ' ');
    const totalOnHand = Number(r.storage_qty || 0) + Number(r.in_use_qty || 0);
    if (tab === 'inuse') return `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')}</span></td><td>${escapeHtml(r.station || '')}</td><td>${qty(r.in_use_qty)} ${escapeHtml(r.unit)}</td><td>${escapeHtml((r.in_use_sources || []).slice(0,3).join('; '))}</td><td>${qty(r.storage_qty)} ${escapeHtml(r.unit)}</td></tr>`;
    if (tab === 'storage') return `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')}</span></td><td>${qty(r.storage_qty)} ${escapeHtml(r.unit)}</td><td>${escapeHtml(r.vendor_name || '')}</td><td>${escapeHtml(r.station || '')}</td><td>${qty(r.par_level)} ${escapeHtml(r.unit)}</td></tr>`;
    if (tab === 'prep') return `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')}</span></td><td>${escapeHtml(r.station || '')}</td><td>${qty(r.prep_estimated_qty)} ${escapeHtml(r.unit)}</td><td>${escapeHtml((r.prep_sources || []).slice(0,3).join('; '))}</td><td>${qty(r.storage_qty)} ${escapeHtml(r.unit)}</td></tr>`;
    if (tab === 'total') return `<tr><td><strong>${escapeHtml(r.name)}</strong></td><td>${escapeHtml(r.station || '')}</td><td>${qty(r.storage_qty)}</td><td>${qty(r.in_use_qty)}</td><td>${qty(r.prep_estimated_qty)}</td><td class="${r.risk === 'ok' ? 'good' : 'warn'}">${qty(r.total_after_prep_qty)} ${escapeHtml(r.unit)}</td><td>${escapeHtml(status)}</td></tr>`;
    if (tab === 'par') return `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')}</span></td><td>${escapeHtml(r.station || '')}</td><td class="${r.risk === 'critical' ? 'danger' : 'warn'}">${qty(r.total_after_prep_qty)} ${escapeHtml(r.unit)}</td><td>${qty(r.par_level)} ${escapeHtml(r.unit)}</td><td>${qty(r.reorder_point)} ${escapeHtml(r.unit)}</td><td>${escapeHtml(status)}</td></tr>`;
    return `<tr><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')}</span></td><td>${escapeHtml(r.station || '')}</td><td>${qty(r.storage_qty)} ${escapeHtml(r.unit)}</td><td>${qty(r.in_use_qty)} ${escapeHtml(r.unit)}</td><td>${qty(totalOnHand)} ${escapeHtml(r.unit)}</td><td>${qty(r.par_level)} ${escapeHtml(r.unit)}</td></tr>`;
  }).join('');
  table.innerHTML = `<table><thead><tr>${columns}</tr></thead><tbody>${body || `<tr><td colspan="7"><div class="empty">No rows for this tab yet.</div></td></tr>`}</tbody></table>`;
}


function countRiskRank(r) {
  const risk = String(r.risk_level || 'ok');
  return risk === 'critical' ? 0 : risk === 'danger' ? 1 : risk === 'watch' ? 2 : 3;
}

async function loadCount() {
  const days = $('#countForecastDays')?.value || '7';
  const data = await api(`/api/count/stock?days=${encodeURIComponent(days)}`);
  state.countData = data;
  state.countOrders = state.countOrders || {};
  // Demo usability default: pre-fill ORDER / PAR TO ORDER from Chef Ledger suggestions
  // so Vendor Sheets and delivery-risk cards are visible immediately. Users can still
  // edit every quantity with the stepper or keyboard before saving/exporting orders.
  (data.suggested || []).forEach(row => {
    const productId = String(row.product_id);
    if (state.countOrders[productId] === undefined || state.countOrders[productId] === null || state.countOrders[productId] === '') {
      state.countOrders[productId] = countOrderValue(productId, row.suggested_order || 0);
    }
  });
  if (!state.countLocation && data.locations?.length) state.countLocation = data.locations[0];
  renderCountPage();
}

function countOrderValue(productId, fallback = 0) {
  const stored = state.countOrders?.[productId];
  if (stored !== undefined && stored !== null && stored !== '') return Math.max(0, Math.round(Number(stored || 0)));
  if (fallback === '' || fallback === undefined || fallback === null) return 0;
  return Math.max(0, Math.round(Number(fallback || 0)));
}

function countOrderStep(row) {
  const minOrder = Number(row?.min_order_size || 1);
  return Math.max(1, Math.round(minOrder || 1));
}

function countOrderUnit(row) {
  const raw = String(row?.supplier_unit || row?.package_unit || 'order unit').trim();
  if (!raw) return 'order unit';
  // COUNT should display the supplier-order label only: case, #10 can, jug, bunch, box, etc.
  // Do not show combined labels such as 25lb/case in the HAVE/ORDER unit column.
  if (raw.includes('/')) return raw.split('/').pop().trim() || raw;
  return raw;
}

function countUnitsPerOrder(row) {
  return Math.max(1e-9, Number(row?.units_per_order || row?.package_qty || 1) || 1);
}

function baseToOrderUnits(row, value) {
  return Number(value || 0) / countUnitsPerOrder(row);
}

function orderToBaseUnits(row, value) {
  return Number(value || 0) * countUnitsPerOrder(row);
}

function countOrderInputHtml(row, extraClass = '') {
  const productId = row.product_id;
  const value = state.countOrders?.[productId] ?? '';
  const step = countOrderStep(row);
  const min = step > 1 ? step : 0;
  return `<div class="order-stepper ${escapeHtml(extraClass)}"><input class="count-mini-input" data-count-order="${productId}" type="number" min="${min}" step="${step}" placeholder="0" value="${escapeHtml(String(value))}"><span class="readonly-pill order-unit-label">${escapeHtml(countOrderUnit(row))}</span></div>`;
}

function syncCountOrderInputs(productId, sourceInput = null) {
  $$(`[data-count-order="${productId}"]`).forEach(input => {
    if (input !== sourceInput) input.value = state.countOrders?.[productId] ?? '';
  });
}

function updateCountOrderTotals(productId) {
  const rowData = (state.countData?.rows || []).find(r => String(r.product_id) === String(productId)) || (state.countData?.suggested || []).find(r => String(r.product_id) === String(productId));
  if (!rowData) return;
  const order = countOrderValue(productId, 0);
  const total = order * Number(rowData.package_price || 0);
  $$(`[data-count-order-total="${productId}"]`).forEach(cell => { cell.textContent = money(total); });
}

function countHaveValue(productId, fallback = 0, row = null) {
  const rowData = row || (state.countData?.rows || []).find(r => String(r.product_id) === String(productId));
  const input = $(`[data-count-have="${productId}"]`);
  const stored = state.countHaves?.[productId];
  if (input && input.value !== '') return Number(input.value || 0);
  if (stored !== undefined && stored !== '') return Number(stored || 0);
  return rowData ? baseToOrderUnits(rowData, fallback) : Number(fallback || 0);
}

function countRowStatus(row, haveOrderUnits, order) {
  const expectedNext = baseToOrderUnits(row, row.estimated_use_until_next_delivery || 0);
  const expectedAfterNext = baseToOrderUnits(row, row.estimated_use_until_delivery_after_next || 0);
  const par = baseToOrderUnits(row, row.par || 0);
  const reorder = baseToOrderUnits(row, row.reorder_point || 0);
  const afterOrder = Number(haveOrderUnits || 0) - expectedNext + Number(order || 0);
  const afterDeliveryAfterNext = Number(haveOrderUnits || 0) - expectedAfterNext + Number(order || 0);
  let text = 'ok';
  let cls = 'good';
  if (afterOrder <= 0) { text = 'FLASH: 86 risk before next delivery'; cls = 'danger flash-warning'; }
  else if (afterOrder <= reorder) { text = 'FLASH: below reorder before next delivery'; cls = 'danger flash-warning'; }
  else if (afterOrder <= par) { text = 'warning: at/below par after order arrives'; cls = 'warn'; }
  else if (afterDeliveryAfterNext <= par) { text = 'watch: may be below par by delivery after next'; cls = 'warn'; }
  return { afterOrder, afterDeliveryAfterNext, text, cls };
}

function updateCountRowCalculations(productId) {
  const rowData = (state.countData?.rows || []).find(r => String(r.product_id) === String(productId));
  if (!rowData) return;
  const have = countHaveValue(productId, rowData.have || 0, rowData);
  const order = countOrderValue(productId, rowData.suggested_order || 0);
  const calc = countRowStatus(rowData, have, order);
  const afterCell = $(`[data-count-after="${productId}"]`);
  const statusCell = $(`[data-count-status="${productId}"]`);
  const unit = countOrderUnit(rowData);
  if (afterCell) {
    afterCell.textContent = `${qty(calc.afterOrder)} ${unit}`;
    afterCell.className = calc.cls;
  }
  if (statusCell) {
    statusCell.textContent = calc.text;
    statusCell.className = calc.cls;
  }
  renderCountVendorDeadlines();
}

function renderCountPage() {
  const data = state.countData || { rows: [], locations: [], suggested: [], vendors: {} };
  const locTabs = $('#countLocationTabs');
  if (locTabs) {
    locTabs.innerHTML = (data.locations || []).map(loc => `<button class="${loc === state.countLocation ? 'active' : ''}" data-count-location="${escapeHtml(loc)}" type="button">${escapeHtml(loc)}</button>`).join('') || '<span class="muted">No locations yet. Add LOCATION in BUILD → Inventory Item Builder.</span>';
  }
  renderCountStockArea();
  renderCountSuggested();
  renderCountVendorSheets();
  renderCountVendorDeadlines();
  renderCountOptimizerResult();
  updateCountAllParCostTotal();
  if (state.activeView === 'files') renderFilesVendorTools();
}

function renderCountStockArea() {
  const table = $('#countStockAreaTable');
  if (!table) return;
  const data = state.countData || { rows: [] };
  const rows = (data.rows || []).filter(r => !state.countLocation || r.location === state.countLocation);
  table.innerHTML = `<table><thead><tr><th>Item</th><th>HAVE</th><th>UNIT</th><th>Estimated use between now and delivery after next</th><th>PAR</th><th>ORDER</th><th>Will have after order arrives</th><th>Status</th></tr></thead><tbody>${rows.map(r => {
    const order = countOrderValue(r.product_id, r.suggested_order || 0);
    const have = countHaveValue(r.product_id, r.have || 0, r);
    const calc = countRowStatus(r, have, order);
    const unit = countOrderUnit(r);
    return `<tr data-count-row="${r.product_id}"><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.category || '')} · ${escapeHtml(r.vendor_name || '')}</span></td><td><input class="count-mini-input" data-count-have="${r.product_id}" type="number" step="1" min="0" value="${Number(state.countHaves?.[r.product_id] ?? baseToOrderUnits(r, r.have ?? 0)).toFixed(3).replace(/\.000$/, '')}"></td><td><span class="readonly-pill">${escapeHtml(unit)}</span></td><td>${qty(baseToOrderUnits(r, r.estimated_use_until_delivery_after_next))} ${escapeHtml(unit)}<br><span class="muted">Next delivery: ${qty(baseToOrderUnits(r, r.estimated_use_until_next_delivery))} ${escapeHtml(unit)}</span></td><td>${qty(baseToOrderUnits(r, r.par))} ${escapeHtml(unit)}</td><td>${countOrderInputHtml(r, 'compact')}</td><td data-count-after="${r.product_id}" class="${calc.cls}">${qty(calc.afterOrder)} ${escapeHtml(unit)}</td><td data-count-status="${r.product_id}" class="${calc.cls}">${escapeHtml(calc.text)}</td></tr>`;
  }).join('') || '<tr><td colspan="8"><div class="empty">No inventory items in this location yet.</div></td></tr>'}</tbody></table>`;
}

function renderCountSuggested() {
  const table = $('#countSuggestedTable');
  if (!table) return;
  const rows = (state.countData?.suggested || []).slice().sort((a,b) => countRiskRank(a)-countRiskRank(b) || Number(b.estimated_use_until_next_delivery||0)-Number(a.estimated_use_until_next_delivery||0));
  table.innerHTML = `<table><thead><tr><th>Rank</th><th>Vendor</th><th>Item</th><th>Risk</th><th>Estimated use</th><th>PAR</th><th>Suggested</th><th>PAR TO ORDER</th><th>Estimated total under SUGGESTED PAR TO ORDER</th></tr></thead><tbody>${rows.map((r, i) => {
    const order = countOrderValue(r.product_id, 0);
    const price = Number(r.package_price || 0);
    const total = Number(order || 0) * price;
    return `<tr><td>${i + 1}</td><td>${escapeHtml(r.vendor_name || '')}</td><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.location || '')}</span></td><td class="risk-${escapeHtml(r.risk_level || 'ok')}">${escapeHtml(r.risk || '')}</td><td>${qty(r.estimated_use_until_next_delivery)} ${escapeHtml(r.have_unit || '')}</td><td>${qty(r.par)} ${escapeHtml(r.have_unit || '')}</td><td>${qty(r.suggested_order)} ${escapeHtml(countOrderUnit(r))}</td><td>${countOrderInputHtml(r)}</td><td data-count-order-total="${r.product_id}">${money(total)}</td></tr>`;
  }).join('') || '<tr><td colspan="9"><div class="empty">No below-PAR suggestions right now.</div></td></tr>'}</tbody></table>`;
}

function buildCountVendorGroups() {
  const rows = (state.countData?.rows || []).filter(r => {
    const order = countOrderValue(r.product_id, state.countOrders?.[r.product_id] ?? 0);
    return Number(order || 0) > 0;
  });
  const groups = {};
  rows.forEach(r => {
    const vendor = r.vendor_name || 'Unassigned Vendor';
    groups[vendor] = groups[vendor] || [];
    groups[vendor].push(r);
  });
  return groups;
}


const DAY_NAMES = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
function parseDayList(value) {
  const text = String(value || '').toLowerCase();
  if (!text.trim()) return [];
  const aliases = { sun:0, sunday:0, mon:1, monday:1, tue:2, tues:2, tuesday:2, wed:3, weds:3, wednesday:3, thu:4, thur:4, thurs:4, thursday:4, fri:5, friday:5, sat:6, saturday:6 };
  const found = [];
  Object.entries(aliases).forEach(([word, idx]) => {
    if (new RegExp(`\\b${word}\\b`).test(text) && !found.includes(idx)) found.push(idx);
  });
  return found;
}
function dateAddDays(date, days) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}
function shortDateLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function vendorDeliveryDatesInWindow(rows) {
  const days = Number($('#countForecastDays')?.value || state.countData?.forecast_days || 7);
  const now = new Date();
  const vendorDays = parseDayList(rows.map(r => r.delivery_days).join(' '));
  const dates = [];
  for (let offset = 1; offset <= Math.max(1, days); offset += 1) {
    const d = dateAddDays(now, offset);
    if (!vendorDays.length || vendorDays.includes(d.getDay())) dates.push(d);
  }
  return dates;
}
function vendorDeadlineRisk(rows) {
  const critical = rows.some(r => String(r.risk_level || '').includes('critical') || Number(r.projected_after_next_delivery || 0) <= 0);
  const between = rows.some(r => Number(r.projected_after_delivery_after_that || 999999) <= 0);
  const danger = rows.some(r => String(r.risk_level || '').includes('danger') || Number(r.projected_after_next_delivery || 999999) <= Number(r.reorder_point || 0));
  if (critical) return { cls: 'vendor-emergency flash-warning', label: 'FLASHING RED: emergency order risk before delivery' };
  if (between) return { cls: 'vendor-cycle-risk', label: 'FLASHING RED / ORANGE / YELLOW: may 86 between this delivery and the next' };
  if (danger) return { cls: 'vendor-warning flash-orange', label: 'FLASHING ORANGE: below reorder / par risk before delivery' };
  return { cls: 'vendor-ok', label: 'OK in selected window' };
}

function parseCutoffTime(value) {
  const raw = String(value || '').trim();
  if (!raw) return { h: 17, m: 0, label: '5:00 PM' };
  const lower = raw.toLowerCase();
  const match = lower.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (!match) return { h: 17, m: 0, label: raw };
  let h = Number(match[1] || 17);
  const m = Number(match[2] || 0);
  const ap = match[3];
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  const label = new Date(2026, 0, 1, h, m).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return { h, m, label };
}
function nextVendorOrderDeadline(rows) {
  const now = new Date();
  const orderDays = parseDayList(rows.map(r => r.order_days).join(' '));
  const cutoff = parseCutoffTime(rows.find(r => r.cutoff_time)?.cutoff_time || '');
  for (let offset = 0; offset <= 14; offset += 1) {
    const d = dateAddDays(now, offset);
    d.setHours(cutoff.h, cutoff.m, 0, 0);
    if ((orderDays.length === 0 || orderDays.includes(d.getDay())) && d.getTime() >= now.getTime()) return d;
  }
  const fallback = dateAddDays(now, 1);
  fallback.setHours(cutoff.h, cutoff.m, 0, 0);
  return fallback;
}
function nextVendorDeliveryAfter(rows, afterDate) {
  const deliveryDays = parseDayList(rows.map(r => r.delivery_days).join(' '));
  const lead = Math.max(0, Number(rows.find(r => r.lead_days !== undefined)?.lead_days || 1));
  for (let offset = Math.max(1, lead); offset <= 21; offset += 1) {
    const d = dateAddDays(afterDate, offset);
    if (!deliveryDays.length || deliveryDays.includes(d.getDay())) return d;
  }
  return dateAddDays(afterDate, Math.max(1, lead));
}
function vendorDeadlineMeta(rows) {
  const deadline = nextVendorOrderDeadline(rows);
  const delivery = nextVendorDeliveryAfter(rows, deadline);
  const nextDelivery = nextVendorDeliveryAfter(rows, delivery);
  return { deadline, delivery, nextDelivery, cutoff: parseCutoffTime(rows.find(r => r.cutoff_time)?.cutoff_time || '') };
}
function vendorGroupTotal(rows) {
  return rows.reduce((sum, r) => sum + countOrderValue(r.product_id, 0) * Number(r.package_price || 0), 0);
}
function vendorRowRiskClass(r) {
  const risk = String(r.risk_level || r.risk || '').toLowerCase();
  const afterNext = Number(r.projected_after_next_delivery ?? r.projected_qty ?? 999999);
  const afterFollowing = Number(r.projected_after_delivery_after_that ?? r.projected_after_next_delivery ?? 999999);
  const par = Number(r.par || r.par_level || 0);
  const reorder = Number(r.reorder_point || 0);
  if (risk.includes('critical') || afterNext <= 0) return { cls: 'risk-red flash-warning', label: '86 / order now' };
  if (afterNext <= reorder || risk.includes('danger')) return { cls: 'risk-orange flash-orange', label: 'below reorder before delivery' };
  if (afterFollowing <= 0) return { cls: 'risk-rainbow vendor-cycle-risk', label: 'near 86 before next delivery' };
  if (afterFollowing <= par || risk.includes('watch')) return { cls: 'risk-yellow flash-yellow', label: 'below par by following delivery' };
  return { cls: 'risk-ok', label: 'ok' };
}
function sortedVendorGroups() {
  const groups = buildCountVendorGroups();
  return Object.keys(groups).map(vendor => ({ vendor, rows: groups[vendor], meta: vendorDeadlineMeta(groups[vendor]), risk: vendorDeadlineRisk(groups[vendor]) }))
    .sort((a,b) => a.meta.deadline - b.meta.deadline || a.vendor.localeCompare(b.vendor));
}
function vendorItemsTable(rows, compact = false) {
  return `<table class="vendor-risk-table"><thead><tr><th>Item</th><th>Order qty</th><th>Unit</th><th>Unit price</th><th>Total</th><th>Risk</th></tr></thead><tbody>${rows.map(r => {
    const order = countOrderValue(r.product_id, 0);
    const risk = vendorRowRiskClass(r);
    return `<tr class="${risk.cls}"><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.location || '')}</span></td><td>${qty(order)}</td><td>${escapeHtml(countOrderUnit(r))}</td><td>${money(r.package_price)}</td><td>${money(order * Number(r.package_price || 0))}</td><td>${escapeHtml(risk.label)}</td></tr>`;
  }).join('')}</tbody>${compact ? '' : `<tfoot><tr><td colspan="4"><strong>Total</strong></td><td colspan="2"><strong>${money(rows.reduce((sum, r) => sum + countOrderValue(r.product_id, 0) * Number(r.package_price || 0), 0))}</strong></td></tr></tfoot>`}</table>`;
}
function renderCountVendorDeadlines() {
  const grid = $('#countVendorDeadlineGrid');
  if (!grid) return;
  const vendorGroups = sortedVendorGroups();
  const days = Number($('#countForecastDays')?.value || state.countData?.forecast_days || 7);
  if (!vendorGroups.length) {
    grid.innerHTML = `<div class="empty action-empty"><p>Enter ORDER / PAR TO ORDER quantities to see vendor delivery deadline cards.</p><button class="primary" type="button" data-count-nav="areas">Open COUNT → ALL STOCK AREA(s)</button><button class="ghost" type="button" data-count-nav="suggested">Open COUNT → SUGGESTED PAR TO ORDER</button></div>`;
    return;
  }
  grid.innerHTML = vendorGroups.map(({ vendor, rows, meta, risk }) => {
    const total = vendorGroupTotal(rows);
    return `<article class="vendor-deadline-card ${risk.cls}" data-vendor-card="${escapeHtml(vendor)}"><div class="vendor-card-head"><h4>${escapeHtml(vendor)}</h4><span class="deadline-badge">NEXT ORDER DEADLINE: ${shortDateLabel(meta.deadline)} · ${fmtClockFromDate(meta.deadline)}</span><span class="delivery-badge">DELIVERY DATE: ${shortDateLabel(meta.delivery)}</span></div><p class="muted">Forecast: ${days} day${days === 1 ? '' : 's'} · next delivery after that: ${shortDateLabel(meta.nextDelivery)}</p><p class="risk-label">${escapeHtml(risk.label)}</p><div class="vendor-needed-mini"><strong>Items needed:</strong><ul>${rows.slice(0, 6).map(r => `<li>${escapeHtml(r.name)} — ${qty(countOrderValue(r.product_id, 0))} ${escapeHtml(countOrderUnit(r))}</li>`).join('')}${rows.length > 6 ? `<li>+ ${rows.length - 6} more item(s)</li>` : ''}</ul></div><div class="vendor-create-row"><strong class="vendor-total">${money(total)}</strong><div class="create-dropdown"><button class="primary" type="button" data-create-menu-toggle="${escapeHtml(vendor)}">CREATE ▾</button><div class="create-menu"><button type="button" data-order-create="count" data-vendor="${escapeHtml(vendor)}">CREATE / COUNT</button><button type="button" data-order-create="sheet" data-vendor="${escapeHtml(vendor)}">CREATE / ORDER SHEET</button></div></div></div></article>`;
  }).join('');
}


function renderCountVendorSheets() {
  const box = $('#countVendorSheets');
  if (!box) return;
  const vendorGroups = sortedVendorGroups();
  box.innerHTML = vendorGroups.map(({ vendor, rows, meta, risk }) => {
    const total = vendorGroupTotal(rows);
    return `<article class="vendor-sheet ${risk.cls}"><div class="vendor-card-head"><h3>${escapeHtml(vendor)}</h3><span class="deadline-badge">NEXT ORDER DEADLINE: ${shortDateLabel(meta.deadline)} · ${fmtClockFromDate(meta.deadline)}</span><span class="delivery-badge">DELIVERY DATE: ${shortDateLabel(meta.delivery)}</span></div>${vendorItemsTable(rows)}<div class="vendor-create-row"><strong>${money(total)}</strong><div class="create-dropdown"><button class="primary" type="button" data-create-menu-toggle="${escapeHtml(vendor)}">CREATE ▾</button><div class="create-menu"><button type="button" data-order-create="count" data-vendor="${escapeHtml(vendor)}">CREATE / COUNT</button><button type="button" data-order-create="sheet" data-vendor="${escapeHtml(vendor)}">CREATE / ORDER SHEET</button></div></div></div></article>`;
  }).join('') || `<div class="empty action-empty"><p>Enter PAR TO ORDER / ORDER quantities in COUNT to build vendor sheets.</p><button class="primary" type="button" data-count-nav="suggested">Open COUNT → SUGGESTED PAR TO ORDER</button><button class="ghost" type="button" data-count-nav="areas">Open COUNT → ALL STOCK AREA(s)</button></div>`;
  renderCountVendorDeadlines();
}


function copySuggestedParToOrder() {
  state.countOrders = state.countOrders || {};
  (state.countData?.suggested || []).forEach(r => { state.countOrders[r.product_id] = Number(r.suggested_order || 0); });
  renderCountPage();
  toast('Suggested quantities copied into PAR TO ORDER / ORDER fields. Review before placing orders.');
}

async function saveCountArea() {
  const items = $$('[data-count-have]').map(input => {
    const row = (state.countData?.rows || []).find(r => String(r.product_id) === String(input.dataset.countHave));
    const haveBase = row ? orderToBaseUnits(row, input.value) : Number(input.value || 0);
    return { product_id: input.dataset.countHave, have: haveBase, reason: `COUNT stock-area count · ${state.countLocation || 'all areas'} · entered in ${row ? countOrderUnit(row) : 'order units'}` };
  });
  await api('/api/count/manual', { method: 'POST', body: JSON.stringify({ items }) });
  toast('COUNT values saved. Inventory, order risk, and vendor sheets refreshed.');
  await preloadCore();
  await loadCount();
}

function fillOrderFromCount() {
  renderCountVendorSheets();
  state.subpages.count = 'vendors';
  updateSubpageUI('count');
  focusElement('countVendorSheetsCard');
  toast('Vendor sheets filled from COUNT order quantities.');
}

function downloadCountVendorCsv() {
  const groups = buildCountVendorGroups();
  const lines = ['Vendor,Item,Order Qty,Supplier Unit,Unit Price,Total,Risk'];
  Object.keys(groups).sort().forEach(vendor => {
    groups[vendor].forEach(r => {
      const order = countOrderValue(r.product_id, 0);
      lines.push([vendor, r.name, order, r.supplier_unit || '', r.package_price || 0, (order * Number(r.package_price || 0)).toFixed(2), r.risk || ''].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
    });
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chef-ledger-count-vendor-orders-${todayInput()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function countSuggestedAllParTotal() {
  return (state.countData?.suggested || []).reduce((sum, r) => {
    const qtyToOrder = countOrderValue(r.product_id, r.suggested_order || 0);
    return sum + qtyToOrder * Number(r.package_price || 0);
  }, 0);
}

function updateCountAllParCostTotal() {
  const el = $('#countAllParCostTotal');
  if (el) el.textContent = money(countSuggestedAllParTotal());
}

function rerenderMoneyDisplays() {
  if (state.activeView) switchView(state.activeView).catch(err => toast(err.message));
  else renderCountPage();
}

function renderCountOptimizerResult() {
  const out = $('#countOptimizerResult');
  updateCountAllParCostTotal();
  if (!out) return;
  if (!out.dataset.rendered) out.innerHTML = '<div class="empty">Enter a budget and run the estimator. Results are suggestions only.</div>';
}

function runCountPriceOptimizer() {
  const budget = Number($('#countBudgetInput')?.value || 0);
  if (!budget) return toast('Enter a budget first');
  const mode = $('#countBudgetMode')?.value || 'balanced';
  const rows = (state.countData?.suggested || []).slice().sort((a,b) => countRiskRank(a)-countRiskRank(b) || Number(b.estimated_use_until_next_delivery||0)-Number(a.estimated_use_until_next_delivery||0));
  let running = 0;
  const adjusted = rows.map(r => {
    const desired = countOrderValue(r.product_id, r.suggested_order || 0);
    const price = Number(r.package_price || 0);
    let adjustedQty = desired;
    const priority = countRiskRank(r);
    if (running + desired * price > budget) {
      if (priority <= 1) adjustedQty = Math.max(0, Math.floor((budget - running) / Math.max(price, 0.01)));
      else if (mode === 'conservative') adjustedQty = Math.max(0, Math.floor((budget - running) / Math.max(price, 0.01)));
      else adjustedQty = 0;
    }
    const total = Math.max(0, adjustedQty) * price;
    running += total;
    return { ...r, desired, adjustedQty: Math.max(0, adjustedQty), adjustedTotal: total };
  });
  const out = $('#countOptimizerResult');
  out.dataset.rendered = '1';
  out.innerHTML = `<p class="fine-print">Estimator only: not responsible if sales, prep, waste, vendor price, delivery, or recipe behavior differs from expected results.</p><table><thead><tr><th>Rank</th><th>Item</th><th>Risk</th><th>Requested</th><th>Adjusted PAR</th><th>Unit price</th><th>Total</th></tr></thead><tbody>${adjusted.map((r, i) => `<tr><td>${i+1}</td><td><strong>${escapeHtml(r.name)}</strong><br><span class="muted">${escapeHtml(r.vendor_name || '')}</span></td><td>${escapeHtml(r.risk || '')}</td><td>${qty(r.desired)} ${escapeHtml(r.supplier_unit || '')}</td><td class="${r.adjustedQty < r.desired ? 'warn' : 'good'}">${qty(r.adjustedQty)} ${escapeHtml(r.supplier_unit || '')}</td><td>${money(r.package_price)}</td><td>${money(r.adjustedTotal)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="6"><strong>Estimated optimized total</strong></td><td><strong>${money(running)}</strong></td></tr></tfoot></table>`;
}

async function loadRecipes() {
  const [data, dishData] = await Promise.all([api('/api/recipes'), api('/api/dishes').catch(() => ({ dishes: [] }))]);
  state.recipes = data.recipes || [];
  state.dishes = dishData.dishes || [];
  populateSelects();
  $('#recipeList').innerHTML = listOrEmpty(state.recipes.map(r => recipeCard(r)), 'No recipes yet. Add your first recipe card.');
  if (!$('#recipeItemRows').children.length) addRecipeItemRow();
  if ($('#dishList')) $('#dishList').innerHTML = listOrEmpty(state.dishes.map(d => dishCard(d)), 'No plates yet. Build a dish/menu item from recipes and inventory items.');
  const picGrid = $('#platePictureGrid');
  if (picGrid) picGrid.innerHTML = listOrEmpty(state.dishes.filter(d => d.photo_url).map(d => `<article class="recipe-card plate-card"><img class="plate-photo" src="${escapeHtml(d.photo_url)}" alt="${escapeHtml(d.name)}"><h3>${escapeHtml(d.name)}</h3><p class="muted">${escapeHtml(d.station || 'No station')} · ${money(d.menu_price)}</p></article>`), 'No finished plate pictures yet. Add a picture URL in BUILD → Menu Item / Plate Builder.');
  if ($('#dishComponentRows') && !$('#dishComponentRows').children.length) addDishComponentRow();
}

function recipeCard(r) {
  const cost = r.cost || {};
  let steps = [];
  try { steps = r.recipe_steps ? JSON.parse(r.recipe_steps) : []; } catch { steps = []; }
  const container = [r.storage_container ? `Store in ${r.storage_container}` : '', r.station_container ? `Station: ${r.station_container}` : '', r.container_size_qty ? `${qty(r.container_size_qty)} ${escapeHtml(r.container_size_unit || '')}` : ''].filter(Boolean).join(' · ');
  return `<article class="recipe-card">
    <h3>${escapeHtml(r.name)}</h3>
    <p class="muted">${escapeHtml(r.station || 'No station')} · yield ${qty(r.yield_qty)} ${escapeHtml(r.portion_unit || 'plates')}${container ? '<br>' + container : ''}</p>
    <div class="price">
      <div class="mini-stat"><small>Recipe cost</small><strong>${money(cost.total_cost)}</strong></div>
      <div class="mini-stat"><small>Per plate</small><strong>${money(cost.cost_per_plate)}</strong></div>
      <div class="mini-stat"><small>Food cost</small><strong>${cost.food_cost_pct ?? '—'}%</strong></div>
    </div>
    <details open><summary>Ingredients</summary><ul>${(cost.items || []).map(i => `<li>${qty(i.qty)} ${escapeHtml(i.unit)} ${escapeHtml(i.product_name)} — ${money(i.line_cost)}</li>`).join('')}</ul></details>
    ${steps.length ? `<details><summary>Steps</summary><ol class="recipe-steps-view">${steps.map(st => `<li class="step-indent-${Number(st.level || 0)}">${escapeHtml(st.text)}</li>`).join('')}</ol></details>` : ''}
  </article>`;
}

function addRecipeItemRow() {
  const row = document.createElement('div');
  row.className = 'recipe-item-row';
  row.innerHTML = `
    <input type="hidden" name="product_id">
    <label>Inventory item search <input name="product_search" list="productSearchOptions" placeholder="Type beans, arugula, asparagus..."></label>
    <label>Amount used <input name="qty" type="number" step="0.001" placeholder="1"></label>
    <label>Unit used <input name="unit" placeholder="cup, tsp, lb, spear"></label>
    <button type="button" class="ghost remove-row">Remove</button>
    <label style="grid-column:1/-1">Prep note <input name="prep_note" placeholder="1/4 cup per plate, trim, yield note"></label>`;
  const search = $('[name="product_search"]', row);
  search.addEventListener('change', () => {
    const product = findProductBySearch(search.value);
    if (product) {
      $('[name="product_id"]', row).value = product.id;
      const unit = $('[name="unit"]', row);
      if (!unit.value) unit.value = product.unit || '';
    }
  });
  $('#recipeItemRows').appendChild(row);
}

function addDishComponentRow() {
  const row = document.createElement('div');
  row.className = 'dish-component-row recipe-item-row';
  row.innerHTML = `
    <label>Type <select name="component_type"><option value="recipe">Recipe / batch</option><option value="product">Inventory item</option></select></label>
    <input type="hidden" name="recipe_id"><input type="hidden" name="product_id">
    <label class="dish-recipe-wrap">Recipe search <input name="recipe_search" list="recipeSearchOptions" placeholder="Type recipe name"></label>
    <label class="dish-product-wrap" hidden>Item search <input name="product_search" list="productSearchOptions" placeholder="Type inventory item"></label>
    <label>Portion qty <input name="qty" type="number" step="0.001" placeholder="1"></label>
    <label>Unit <input name="unit" placeholder="plate, cup, oz, each"></label>
    <button type="button" class="ghost remove-row">Remove</button>
    <label style="grid-column:1/-1">Portion note <input name="portion_note" placeholder="2 oz dressing, 1/4 cup salsa, 5 asparagus spears"></label>`;
  const typeSel = row.querySelector('[name="component_type"]');
  typeSel.addEventListener('change', () => updateDishRowType(row));
  const recipeSearch = $('[name="recipe_search"]', row);
  const productSearch = $('[name="product_search"]', row);
  recipeSearch.addEventListener('change', () => {
    const recipe = findRecipeBySearch(recipeSearch.value);
    if (recipe) $('[name="recipe_id"]', row).value = recipe.id;
  });
  productSearch.addEventListener('change', () => {
    const product = findProductBySearch(productSearch.value);
    if (product) {
      $('[name="product_id"]', row).value = product.id;
      const unit = $('[name="unit"]', row);
      if (!unit.value) unit.value = product.unit || '';
    }
  });
  $('#dishComponentRows').appendChild(row);
  updateDishRowType(row);
}

function updateDishRowType(row) {
  const type = row.querySelector('[name="component_type"]').value;
  row.querySelector('.dish-recipe-wrap').hidden = type !== 'recipe';
  row.querySelector('.dish-product-wrap').hidden = type !== 'product';
}

function dishCard(d) {
  const cost = d.cost || {};
  return `<article class="recipe-card plate-card"><h3>${escapeHtml(d.name)}</h3>${d.photo_url ? `<img class="plate-photo" src="${escapeHtml(d.photo_url)}" alt="${escapeHtml(d.name)} finished plate">` : '<div class="plate-photo placeholder">No finished plate picture</div>'}<p class="muted">${escapeHtml(d.station || 'No station')} · menu ${money(d.menu_price)}</p><div class="price"><div class="mini-stat"><small>Plate cost</small><strong>${money(cost.total_cost)}</strong></div><div class="mini-stat"><small>Food cost</small><strong>${cost.food_cost_pct ?? '—'}%</strong></div><div class="mini-stat"><small>Components</small><strong>${(cost.components || []).length}</strong></div></div><details><summary>Plate components</summary><ul>${(cost.components || []).map(c => `<li>${escapeHtml(c.label)} — ${qty(c.qty)} ${escapeHtml(c.unit)} · ${money(c.line_cost)}</li>`).join('')}</ul></details></article>`;
}

async function loadPrep() {
  await preloadCore();
  const sheets = await api('/api/prep_sheets');
  state.prepSheets = sheets.prep_sheets || [];
  if ($('#prepSheetSelect')) $('#prepSheetSelect').innerHTML = state.prepSheets.map(s => `<option value="${s.id}">${escapeHtml(s.title)} · ${escapeHtml(s.prep_date)} · ${escapeHtml(s.service_period)}</option>`).join('');
  populatePrepBuildStationSelect();
  await renderPrepSelected();
  setPrepMode(state.prepMode || 'closeout');
  await loadStationCountTools().catch(err => toast(err.message));
  await loadForecaster().catch(() => {});
}

function populatePrepBuildStationSelect() {
  const own = state.user?.station || '';
  const stations = unique([own, ...stationNames()].filter(Boolean));
  ['prepBuildStation', 'employeePrepStation'].forEach(id => {
    const select = $('#' + id);
    if (!select) return;
    const current = select.value;
    select.innerHTML = stations.map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('') || '<option value="">No stations saved yet — add stations in BUILD → Station Builder first</option>';
    if (current && stations.includes(current)) select.value = current;
    else if (own && stations.includes(own)) select.value = own;
    else if (stations.length) select.value = stations[0];
  });
  const preview = $('#prepBuildPreview');
  if (preview && !stations.length) preview.innerHTML = '<span class="warn">No stations are saved yet. Open BUILD → Station Builder, add station names, then return to BUILD PREP.</span>';
  const dateEl = $('#employeePrepDate');
  if (dateEl && !dateEl.value) dateEl.value = todayInput();
}

async function generateStationPrepChecklist() {
  const station = $('#prepBuildStation')?.value || state.user?.station || '';
  if (!station) return toast('Choose a station first');
  const data = await api(`/api/prep/station_build?station=${encodeURIComponent(station)}`);
  state.prepBuildData = data;
  renderPrepTemplateModal(data);
}

function prepTemplateRow(kind, item) {
  const defaultQty = Number(item.default_qty || item.yield_qty || 1);
  const defaultUnit = item.unit || item.portion_unit || 'each';
  const source = (item.source_plates || []).length ? `From plate(s): ${(item.source_plates || []).join(', ')}` : 'Direct station item';
  const costText = kind === 'recipe' && item.cost ? ` · batch ${money(item.cost.total_cost)}` : (kind === 'product' ? ` · stock ${qty(item.current_qty)} ${escapeHtml(item.unit || defaultUnit)}` : '');
  const minQty = Number(item.min_station_qty || 0);
  const minUnit = item.min_station_unit || item.station_container || item.container_size_unit || defaultUnit;
  return `<div class="prep-check-row" data-prep-kind="${kind}" data-prep-id="${item.id}" data-source-plates="${escapeHtml(JSON.stringify(item.source_plates || []))}">
    <label class="check-title"><input type="checkbox" name="selected" checked> <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category || item.station || '')}${costText}<br>${escapeHtml(source)}</small></span></label>
    <div class="inline-row prep-qty-row"><label>Default prep amount <input name="qty" type="number" step="0.001" value="${defaultQty}"></label><label>Prep unit <input name="unit" value="${escapeHtml(defaultUnit)}"></label></div>
    <div class="inline-row prep-qty-row"><label>Minimum to keep on station <input name="min_station_qty" type="number" step="0.001" value="${minQty}"></label><label>Station unit / container <input name="min_station_unit" value="${escapeHtml(minUnit)}" placeholder="1/6 pan, bottle, steaks, canister"></label></div>
  </div>`;
}

function renderPrepTemplateModal(data) {
  const rows = [
    ...(data.recipes || []).map(r => prepTemplateRow('recipe', r)),
    ...(data.products || []).map(p => prepTemplateRow('product', p)),
  ];
  $('#prepTemplateSubtitle').textContent = `${data.station || 'Station'} · ${(data.plates || []).length} plate(s) · ${rows.length} recipe/item option(s)`;
  $('#prepTemplateRows').innerHTML = rows.join('') || '<div class="empty">No plates, recipes, or items found for this station. Assign Plates to this station in BUILD → Menu Item / Plate Tool first.</div>';
  $('#prepBuildPreview').innerHTML = `<strong>${escapeHtml(data.station || '')}</strong>: generated from ${(data.plates || []).length} plate(s), ${(data.recipes || []).length} recipe(s), ${(data.products || []).length} item(s).`;
  $('#prepTemplateModal').hidden = false;
}

async function savePrepTemplate() {
  const station = $('#prepBuildStation')?.value || state.prepBuildData?.station || '';
  const selections = $$('#prepTemplateRows [data-prep-kind]').map(row => {
    if (!row.querySelector('[name="selected"]')?.checked) return null;
    let sourcePlates = [];
    try { sourcePlates = JSON.parse(row.dataset.sourcePlates || '[]'); } catch { sourcePlates = []; }
    return { kind: row.dataset.prepKind, id: row.dataset.prepId, qty: row.querySelector('[name="qty"]')?.value || 1, unit: row.querySelector('[name="unit"]')?.value || 'each', min_station_qty: row.querySelector('[name="min_station_qty"]')?.value || 0, min_station_unit: row.querySelector('[name="min_station_unit"]')?.value || row.querySelector('[name="unit"]')?.value || 'each', source_plates: sourcePlates };
  }).filter(Boolean);
  if (!station) return toast('Choose a station first');
  if (!selections.length) return toast('Select at least one template row');
  const result = await api('/api/prep/station_template', { method: 'POST', body: JSON.stringify({ station, selections }) });
  $('#prepTemplateModal').hidden = true;
  toast(`Saved ${result.saved} BUILD PREP item(s) for ${station}. MASTER PREPSHEET and inventory/order impact were refreshed.`);
  await preloadCore().catch(() => {});
  await loadEmployeePrepTemplate().catch(() => {});
  await renderInventorySheetTabs?.();
  await renderChefPrepReview?.();
}

function employeePrepRow(item) {
  const defaultQty = Number(item.default_qty || 1);
  const defaultUnit = item.unit || 'each';
  const source = (item.source_plates || []).length ? `Plate(s): ${(item.source_plates || []).join(', ')}` : '';
  return `<div class="prep-check-row employee-prep-row" data-prep-kind="${item.kind}" data-prep-id="${item.id}">
    <label class="check-title"><input type="checkbox" name="selected"> <span><strong>${escapeHtml(item.name)}</strong><small>${escapeHtml(item.category || item.station || '')}${source ? '<br>' + escapeHtml(source) : ''}</small></span></label>
    <div class="inline-row prep-qty-row"><label>Amount needed <input name="qty" type="number" step="0.001" value="${defaultQty}"></label><label>Unit <input name="unit" value="${escapeHtml(defaultUnit)}"></label></div>
    <div class="urgency-checks"><label><input type="checkbox" name="is_86"> 86</label><label><input type="checkbox" name="need_before_start"> NEED BEFORE START OF SHIFT</label><label><input type="checkbox" name="watch_list"> WATCH-LIST</label><label><input type="checkbox" name="expiring_soon"> EXPIRING SOON</label></div>
  </div>`;
}

async function loadEmployeePrepTemplate() {
  const station = $('#employeePrepStation')?.value || state.user?.station || $('#prepBuildStation')?.value || '';
  if (!station) return toast('Choose a station first');
  const data = await api(`/api/prep/station_template?station=${encodeURIComponent(station)}`);
  state.employeePrepData = data;
  $('#employeePrepChecklist').innerHTML = (data.items || []).map(employeePrepRow).join('') || '<div class="empty">No BUILD PREP template saved for this station yet. Chef should open BUILD PREP, choose this station, generate from Plates, and save the template.</div>';
  toast(`Loaded ${data.items?.length || 0} prep checklist item(s) for ${station}.`);
}

async function submitPrepChecklist() {
  const station = $('#employeePrepStation')?.value || state.employeePrepData?.station || state.user?.station || '';
  const prep_date = $('#employeePrepDate')?.value || todayInput();
  const service_period = $('#employeePrepService')?.value || 'dinner';
  const selections = $$('#employeePrepChecklist [data-prep-kind]').map(row => {
    if (!row.querySelector('[name="selected"]')?.checked) return null;
    return { kind: row.dataset.prepKind, id: row.dataset.prepId, qty: row.querySelector('[name="qty"]')?.value || 1, unit: row.querySelector('[name="unit"]')?.value || 'each', flags: { is_86: row.querySelector('[name="is_86"]')?.checked || false, need_before_start: row.querySelector('[name="need_before_start"]')?.checked || false, watch_list: row.querySelector('[name="watch_list"]')?.checked || false, expiring_soon: row.querySelector('[name="expiring_soon"]')?.checked || false } };
  }).filter(Boolean);
  if (!selections.length) return toast('Check at least one station item or recipe');
  const result = await api('/api/prep/station_build_submit', { method: 'POST', body: JSON.stringify({ station, prep_date, service_period, selections }) });
  toast(`Uploaded ${result.created.length} prep-needed item(s) to the chef profile.`);
  await preloadCore();
  await loadPrep();
  if (state.activeView === 'inventory') await loadInventory();
}

function groupedPrepReview(tasks) {
  const groups = {};
  (tasks || []).forEach(t => { const key = t.station || 'Unassigned station'; (groups[key] ||= []).push(t); });
  return Object.entries(groups).map(([station, rows]) => `<article class="station-review-card"><h3>${escapeHtml(station)}</h3>${listOrEmpty(rows.map(t => prepTaskItem(t, true)), 'No uploaded prep items')}</article>`).join('') || '<div class="empty">No employee prep uploads for this date yet.</div>';
}

async function renderChefPrepReview(date) {
  if (!$('#chefPrepByStation')) return;
  const agg = await api(`/api/prep/aggregate?date=${encodeURIComponent(date || todayInput())}`);
  $('#chefPrepByStation').innerHTML = groupedPrepReview(agg.tasks || []);
}

async function loadManagerPreplist() {
  if (!$('#managerPreplistPanel') || !isLeader()) return;
  const data = await api('/api/manager/preplist').catch(err => ({ error: err.message, tasks: [], by_station: {} }));
  const stationFilter = $('#managerPreplistStationFilter')?.value || '';
  const shiftFilter = $('#managerPreplistShiftFilter')?.value || '';
  const sortBy = $('#managerPreplistSort')?.value || 'need_by';
  let tasks = data.tasks || [];
  if (stationFilter) tasks = tasks.filter(t => String(t.station || '') === stationFilter);
  if (shiftFilter) tasks = tasks.filter(t => String(t.service_period || '').toLowerCase() === shiftFilter.toLowerCase());
  if (sortBy === 'rank') tasks.sort((a,b) => Number(a.priority || 4) - Number(b.priority || 4) || Number(a.suggested_rank || 5) - Number(b.suggested_rank || 5));
  else if (sortBy === 'station') tasks.sort((a,b) => String(a.station || '').localeCompare(String(b.station || '')) || Number(a.priority || 4) - Number(b.priority || 4));
  else tasks.sort((a,b) => String(a.need_by_label || '').localeCompare(String(b.need_by_label || '')) || Number(a.suggested_rank || 5) - Number(b.suggested_rank || 5));
  const stations = unique((data.tasks || []).map(t => t.station || 'Unassigned')).sort();
  const shifts = unique((data.tasks || []).map(t => t.service_period || 'next shift')).sort();
  const sf = $('#managerPreplistStationFilter');
  if (sf && !sf.dataset.loaded) { sf.innerHTML = '<option value="">All stations</option>' + stations.map(st => `<option>${escapeHtml(st)}</option>`).join(''); sf.dataset.loaded = '1'; }
  const shf = $('#managerPreplistShiftFilter');
  if (shf && !shf.dataset.loaded) { shf.innerHTML = '<option value="">All shifts</option>' + shifts.map(st => `<option>${escapeHtml(st)}</option>`).join(''); shf.dataset.loaded = '1'; }
  $('#managerPreplistItems').innerHTML = listOrEmpty(tasks.map(t => managerPrepTaskItem(t)), 'No open prep items. Checked PREP? items from FILL / CLOSEOUT / PREP CHECK will appear here.');
}

function managerPrepTaskItem(t) {
  const candidates = t.station_schedule_candidates || [];
  const candidateOptions = '<option value="">Unassigned</option>' + candidates.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  const urgent = Number(t.priority || 4) <= 2 ? 'warn' : '';
  return `<div class="list-item manager-prep-task ${urgent}">
    <div class="row"><strong>${escapeHtml(t.title)}</strong><span>P${escapeHtml(t.priority || '')} · suggested ${escapeHtml(t.suggested_rank || '')}</span></div>
    <span class="muted">${escapeHtml(t.station || 'Unassigned')} · need by ${escapeHtml(t.need_by_label || 'next shift')} · ${qty(t.qty)} ${escapeHtml(t.unit || '')}</span>
    <div class="inline-row"><button class="ghost edit-task-priority" data-id="${t.id}" data-priority="${t.suggested_rank || 2}">Suggested RANK</button><label>ASSIGN / SEND TO <select data-prep-assign="${t.id}">${candidateOptions}</select></label><button class="primary assign-prep-task" data-id="${t.id}">Assign</button></div>
  </div>`;
}

async function claimPrepTask(id) {
  await api(`/api/prep_tasks/${id}/claim`, { method: 'POST', body: JSON.stringify({}) });
  toast('Prep item claimed. Manager prep list and your employee prep tasks were updated.');
  await renderPrepSelected();
  await loadManagerPreplist().catch(() => {});
}

async function assignPrepTaskFromSelect(id) {
  const select = document.querySelector(`[data-prep-assign="${CSS.escape(String(id))}"]`);
  const assigned_to = select?.value || '';
  await api(`/api/prep_tasks/${id}`, { method: 'PUT', body: JSON.stringify({ assigned_to, status: assigned_to ? 'assigned' : 'todo' }) });
  toast(assigned_to ? 'Prep item assigned to scheduled employee.' : 'Prep item unassigned.');
  await loadManagerPreplist();
  await renderPrepSelected();
}

function downloadPrepReview() {
  const text = $('#chefPrepByStation')?.innerText || 'No prep review loaded';
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `chef-ledger-prep-review-${todayInput()}.txt`;
  document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(a.href);
}
function printPrepReview() {
  const content = $('#chefPrepByStation')?.innerHTML || '<p>No prep review loaded.</p>';
  const win = window.open('', '_blank');
  if (!win) return toast('Popup blocked. Allow popups to print the prep review.');
  win.document.write(`<!doctype html><html><head><title>Chef Ledger Prep Review</title><link rel="stylesheet" href="/styles.css"></head><body class="print-body"><main class="print-page"><h1>Chef Ledger Prep Review</h1>${content}</main><script>window.onload=()=>window.print();<\/script></body></html>`);
  win.document.close();
}

async function sendPrepToNextShift() {
  const date = $('#employeePrepDate')?.value || todayInput();
  const res = await api('/api/prep/send_next_shift', { method: 'POST', body: JSON.stringify({ date }) });
  toast(`Prep list sent to next shift employees (${res.notified || 0} notification${Number(res.notified || 0) === 1 ? '' : 's'}).`);
}

async function renderPrepSelected(dateOverride = '') {
  const date = dateOverride || $('#employeePrepDate')?.value || todayInput();
  const agg = await api(`/api/prep/aggregate?date=${encodeURIComponent(date)}`);
  const aggregate = $('#prepAggregate');
  if (aggregate) {
    aggregate.innerHTML = `<div class="grid two"><div><h3>NEEDED NOW</h3>${listOrEmpty((agg.needed_now || []).map(t => prepTaskItem(t)))}</div><div><h3>Prep notes</h3><div class="empty">Inventory watchlist and order-risk items now live under Inventory → WATCHLIST / ORDER RISK so employees using PREP only see prep tasks.</div></div></div>`;
  }
  const claimList = $('#claimPrepList');
  if (claimList) {
    const claimable = (agg.tasks || []).filter(t => t.status !== 'done' && (!t.assigned_to || String(t.assigned_to) === String(state.user?.id || '')));
    claimList.innerHTML = listOrEmpty(claimable.map(t => prepTaskItem(t, true)), 'No claimable prep items right now. Checked PREP? items from station closeout will show here.');
  }
  await renderChefPrepReview(date);
}

function prepTaskItem(t, withActions = false) {
  const status = t.status === 'done' ? 'good' : Number(t.priority) <= 2 ? 'warn' : '';
  return `<div class="list-item">
    <div class="row"><strong>${escapeHtml(t.title)}</strong><span class="${status}">${escapeHtml(t.status || 'todo')}</span></div>
    <span class="muted">${escapeHtml(t.station || 'No station')} · ${qty(t.qty)} ${escapeHtml(t.unit)} · assigned ${escapeHtml(t.assigned_name || 'unassigned')} · priority ${t.priority}</span>
    ${withActions && t.status !== 'done' ? `<div class="row"><button class="primary complete-task" data-id="${t.id}">Complete + deduct inventory</button><button class="ghost edit-task-priority" data-id="${t.id}" data-priority="1">Rank needed now</button><button class="ghost claim-prep-task" data-id="${t.id}">CLAIM</button></div>` : ''}
  </div>`;
}


async function loadStationCountTools() {
  const stationData = await api('/api/stations').catch(() => ({ stations: [], station_records: [] }));
  state.stations = stationData.stations || [];
  state.stationRecords = stationData.station_records || state.stationRecords || [];
  const stationSelect = $('#stationCountStation');
  if (stationSelect) {
    const ownStation = state.user?.station || '';
    const stations = unique([ownStation, ...stationNames()].filter(Boolean));
    const current = stationSelect.value;
    stationSelect.innerHTML = stations.map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('') || '<option value="">No stations saved yet — add stations in BUILD → Station Builder first</option>';
    if (current && stations.includes(current)) stationSelect.value = current;
    else if (ownStation && stations.includes(ownStation)) stationSelect.value = ownStation;
    else if (stations.length) stationSelect.value = stations[0];
  }
  const dateEl = $('#stationCountDate');
  if (dateEl && !dateEl.value) dateEl.value = todayInput();
  await loadStationCountForm();
  await loadStationCountHistory();
}

async function loadStationCountForm() {
  const station = $('#stationCountStation')?.value || state.user?.station || '';
  const countDate = $('#stationCountDate')?.value || todayInput();
  const service = $('#stationCountService')?.value || '';
  if (!station) {
    $('#stationCountRows').innerHTML = '<div class="empty">Choose a station first.</div>';
    return;
  }
  const data = await api(`/api/station_count_form?station=${encodeURIComponent(station)}&date=${encodeURIComponent(countDate)}&service_period=${encodeURIComponent(service)}`);
  state.stationCountForm = data;
  const products = data.products || [];
  $('#stationCountRows').innerHTML = products.length ? `
    <div class="small-note">Employee view: enter what is left before restock, what is ready after restock, and check PREP? if the item must be made. The read-only minimum/unit comes from BUILD PREP. Notes are for real station handoff details like “spoiled and threw out 1/6 pan,” “spilled half bottle in cooler,” or “stocked what was left in cooler; 86 in walk-in but enough for lunch.”</div>
    <table>
      <thead>
        <tr>
          <th>Station item</th>
          <th>Min. to keep on station</th>
          <th>Min. unit</th>
          <th>End-shift station left<br><span class="muted">pre-stocked / before restock</span></th>
          <th>Ready amount for next shift<br><span class="muted">post-restock</span></th>
          <th>PREP?</th>
          <th>Notes</th>
        </tr>
      </thead>
      <tbody>
        ${products.map(p => `<tr data-station-count-row="${p.id}" data-min-qty="${Number(p.min_station_qty || 0)}" data-min-unit="${escapeHtml(p.min_station_unit || p.unit || 'each')}">
          <td><strong>${escapeHtml(p.name)}</strong><br><span class="muted">${escapeHtml(p.category || '')} · ${escapeHtml(p.unit)}</span></td>
          <td class="readonly-cell">${Number(p.min_station_qty || 0) ? qty(p.min_station_qty) : '—'}</td>
          <td class="readonly-cell">${escapeHtml(p.min_station_unit || p.unit || 'each')}</td>
          <td><input type="number" step="0.001" name="pre_stocked_qty" placeholder="0"></td>
          <td><input type="number" step="0.001" name="post_stocked_qty" placeholder="0"></td>
          <td><label class="check-cell"><input type="checkbox" name="prep_needed"> Prep?</label></td>
          <td><input name="notes" placeholder="Spoiled, 86, restocked, spilled, cooler note"></td>
        </tr>`).join('')}
      </tbody>
    </table>` : '<div class="empty">No products are assigned to this station yet. A team leader can set product station names in Inventory.</div>';
}

async function submitStationCount(e) {
  e.preventDefault();
  const station = $('#stationCountStation')?.value || state.user?.station || '';
  const count_date = $('#stationCountDate')?.value || todayInput();
  const service_period = $('#stationCountService')?.value || '';
  const counts = $$('[data-station-count-row]').map(row => ({
    product_id: row.dataset.stationCountRow,
    pre_stocked_qty: row.querySelector('[name="pre_stocked_qty"]').value,
    post_stocked_qty: row.querySelector('[name="post_stocked_qty"]').value,
    prep_needed: row.querySelector('[name="prep_needed"]').checked,
    notes: row.querySelector('[name="notes"]').value,
    min_station_qty: row.dataset.minQty || 0,
    min_station_unit: row.dataset.minUnit || ''
  })).filter(x => x.product_id && (String(x.pre_stocked_qty).trim() !== '' || String(x.post_stocked_qty).trim() !== '' || x.prep_needed || x.notes));
  if (!counts.length) {
    toast('Enter at least one station count before submitting');
    return;
  }
  const result = await api('/api/station_counts', { method: 'POST', body: JSON.stringify({ station, count_date, service_period, counts }) });
  const prepSelections = counts.filter(x => x.prep_needed).map(x => {
    const product = state.products.find(p => String(p.id) === String(x.product_id));
    const minQty = Number(x.min_station_qty || 0);
    const postQty = Number(x.post_stocked_qty || 0);
    const prepQty = minQty > 0 ? Math.max(minQty - postQty, 0.001) : (Number(x.post_stocked_qty || x.pre_stocked_qty || 1) || 1);
    return {
      kind: 'product',
      id: Number(x.product_id),
      qty: prepQty,
      unit: product?.unit || x.min_station_unit || 'each',
      flags: { need_before_start: true },
      due_at: '',
      notes: x.notes || `Added from FILL / CLOSEOUT / PREP CHECK. Minimum ${minQty || 'not set'} ${x.min_station_unit || product?.unit || ''}.`
    };
  });
  let prepResult = null;
  if (prepSelections.length) {
    prepResult = await api('/api/prep/station_build_submit', {
      method: 'POST',
      body: JSON.stringify({ station, prep_date: count_date, service_period, selections: prepSelections })
    });
  }
  $('#stationCountResult').innerHTML = `<strong>Submitted ${result.saved.length} station count(s).</strong>${prepResult ? `<div class="small-note good">Added ${prepSelections.length} checked PREP item(s) to the Master/Live PREPSHEET workflow. Inventory PREP estimator, PAR risk, and order suggestions were refreshed.</div>` : ''}${result.saved.map(x => `<div class="small-note ${x.ready_for_next_service ? 'good' : 'warn'}">${escapeHtml(x.product_name)}: end-shift left ${qty(x.pre_stocked_qty)} ${escapeHtml(x.unit)}, ready amount ${qty(x.post_stocked_qty)} ${escapeHtml(x.unit)}, restocked from house ${qty(x.restocked_from_house)} ${escapeHtml(x.unit)} · ${escapeHtml(x.status.replaceAll('_', ' '))}</div>`).join('')}`;
  toast(prepSelections.length ? 'Station count submitted and PREP items added' : 'Station count sent to team leader');
  await preloadCore();
  await loadPrep();
  await loadSuggestions();
  await loadStationCountForm();
  await loadStationCountHistory();
}

function renderEmployeeStationCountHistory(counts) {
  return `<h3>Your recent station submissions</h3>${listOrEmpty(counts.slice(0, 12).map(c => `<div class="list-item">
    <div class="row"><strong>${escapeHtml(c.station)} · ${escapeHtml(c.product_name)}</strong><span class="${Number(c.ready_for_next_service) ? 'good' : 'warn'}">${Number(c.ready_for_next_service) ? 'ready' : 'prep check submitted'}</span></div>
    <span class="muted">${escapeHtml(c.count_date)} ${escapeHtml(c.service_period || '')}: end-shift left ${qty(c.pre_stocked_qty || c.qty_left)} ${escapeHtml(c.unit)}, ready amount ${qty(c.post_stocked_qty || c.qty_left)} ${escapeHtml(c.unit)}, restocked ${qty(c.restocked_from_house || 0)} ${escapeHtml(c.unit)}.</span>
  </div>`), 'No station count submissions yet.')}`;
}

function renderLeaderStationCountHistory(counts) {
  return `<h3>Team-leader station usage review</h3>
    <p class="muted">Manager-only analytics compare POS expected use against station closeout and restock records. Employees do not see POS expected use, expected-left math, or variance.</p>
    ${counts.length ? `<table><thead><tr><th>Station / item</th><th>Employee</th><th>Pre-stocked left</th><th>Post-restock ready</th><th>Restocked from house</th><th>POS expected used</th><th>Actual used est.</th><th>Variance</th><th>Est. house left</th><th>Status</th></tr></thead><tbody>${counts.slice(0, 60).map(c => `<tr>
      <td><strong>${escapeHtml(c.station)} · ${escapeHtml(c.product_name)}</strong><br><span class="muted">${escapeHtml(c.product_category || '')} · ${escapeHtml(c.count_date)} ${escapeHtml(c.service_period || '')}</span></td>
      <td>${escapeHtml(c.user_name || '')}</td>
      <td>${qty(c.pre_stocked_qty || c.qty_left)} ${escapeHtml(c.unit)}</td>
      <td>${qty(c.post_stocked_qty || c.qty_left)} ${escapeHtml(c.unit)}</td>
      <td>${qty(c.restocked_from_house || 0)} ${escapeHtml(c.unit)}</td>
      <td>${qty(c.manager_expected_usage || c.expected_pos_usage || 0)} ${escapeHtml(c.unit)}</td>
      <td>${qty(c.actual_station_used || 0)} ${escapeHtml(c.unit)}</td>
      <td><span class="${Number(c.usage_variance_qty || c.variance_qty || 0) > 0 ? 'warn' : Number(c.usage_variance_qty || c.variance_qty || 0) < 0 ? 'good' : 'muted'}">${qty(c.usage_variance_qty || c.variance_qty || 0)} ${escapeHtml(c.unit)}</span></td>
      <td>${qty(c.house_qty_after_restock || 0)} ${escapeHtml(c.unit)}</td>
      <td><span class="${String(c.status || '').includes('ready') || String(c.status || '').includes('track') ? 'good' : 'warn'}">${escapeHtml((c.status || '').replaceAll('_', ' '))}</span></td>
    </tr>`).join('')}</tbody></table>` : '<div class="empty">No station closeout counts submitted yet.</div>'}`;
}

async function loadStationCountHistory() {
  const data = await api('/api/station_counts').catch(() => ({ counts: [] }));
  const counts = data.counts || [];
  $('#stationCountHistory').innerHTML = isLeader() ? renderLeaderStationCountHistory(counts) : renderEmployeeStationCountHistory(counts);
}

async function loadAccessGrants() {
  if (!isLeader()) return;
  const data = await api('/api/access_grants').catch(() => ({ grants: [] }));
  state.accessGrants = data.grants || [];
  const expires = $('#accessGrantForm')?.elements?.expires_at;
  if (expires && !expires.value) {
    const dt = new Date(Date.now() + 4 * 60 * 60 * 1000);
    expires.value = dt.toISOString().slice(0, 16);
  }
  const list = $('#accessGrantList');
  if (list) list.innerHTML = `<h3>Active temporary access</h3>${listOrEmpty(state.accessGrants.map(g => `<div class="list-item"><div class="row"><strong>${escapeHtml(g.user_name)}</strong><span>${escapeHtml(g.tool)}</span></div><span class="muted">Expires ${fmtDateTime(g.expires_at)} · granted by ${escapeHtml(g.granted_by_name)} · ${escapeHtml(g.reason || '')}</span><div class="row"><button class="ghost delete-access-grant" data-id="${g.id}">Remove access</button></div></div>`), 'No active temporary access grants.')}`;
}

async function saveAccessGrant(e) {
  e.preventDefault();
  await api('/api/access_grants', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  toast('Temporary access granted');
  e.target.reset();
  await loadAccessGrants();
}

async function deleteAccessGrant(id) {
  await api(`/api/access_grants/${id}`, { method: 'DELETE' });
  toast('Temporary access removed');
  await loadAccessGrants();
}

async function ensureCountData() {
  if (state.countData?.rows?.length) return state.countData;
  const days = $('#countForecastDays')?.value || '7';
  const data = await api(`/api/count/stock?days=${encodeURIComponent(days)}`).catch(() => ({ rows: [], suggested: [], vendors: {}, locations: [] }));
  state.countData = data;
  state.countOrders = state.countOrders || {};
  (data.suggested || []).forEach(row => {
    const productId = String(row.product_id);
    if (state.countOrders[productId] === undefined || state.countOrders[productId] === null || state.countOrders[productId] === '') {
      state.countOrders[productId] = countOrderValue(productId, row.suggested_order || 0);
    }
  });
  return data;
}
function renderOrdersNextDeadline() {
  const box = $('#ordersNextDeadlineList');
  if (!box) return;
  const vendorGroups = sortedVendorGroups();
  if (!vendorGroups.length) {
    box.innerHTML = `<div class="empty action-empty"><p>No vendor deadline cards yet. Enter ORDER or PAR TO ORDER quantities in COUNT.</p><button class="primary" type="button" data-count-nav="areas">CREATE / COUNT</button><button class="ghost" type="button" data-count-nav="suggested">Open PAR TO ORDER</button></div>`;
    return;
  }
  box.innerHTML = `<div class="deadline-rank-list">${vendorGroups.map(({ vendor, rows, meta, risk }, index) => {
    const total = vendorGroupTotal(rows);
    const hotRows = rows.slice().sort((a,b) => vendorRowRiskClass(a).label.localeCompare(vendorRowRiskClass(b).label));
    return `<article class="deadline-vendor-card ${risk.cls}"><div class="vendor-card-head"><h3>${index + 1}. ${escapeHtml(vendor)}</h3><span class="deadline-badge big">NEXT ORDER DEADLINE: ${shortDateLabel(meta.deadline)} · ${fmtClockFromDate(meta.deadline)}</span><span class="delivery-badge">DELIVERY DATE: ${shortDateLabel(meta.delivery)}</span></div><p class="muted">Next delivery after current order: ${shortDateLabel(meta.nextDelivery)} · ${rows.length} item(s) · estimated order ${money(total)}</p>${vendorItemsTable(hotRows, true)}<div class="vendor-create-row"><strong>${money(total)}</strong><div class="create-dropdown"><button class="primary" type="button" data-create-menu-toggle="${escapeHtml(vendor)}">CREATE ▾</button><div class="create-menu"><button type="button" data-order-create="count" data-vendor="${escapeHtml(vendor)}">CREATE / COUNT</button><button type="button" data-order-create="sheet" data-vendor="${escapeHtml(vendor)}">CREATE / ORDER SHEET</button></div></div></div></article>`;
  }).join('')}</div>`;
}
function renderOrderSheetPage() {
  const select = $('#orderSheetVendorSelect');
  const body = $('#orderSheetVendorBody');
  if (!select || !body) return;
  const vendorGroups = sortedVendorGroups();
  if (!vendorGroups.length) {
    select.innerHTML = '<option value="">No vendor sheets yet</option>';
    body.innerHTML = `<div class="empty action-empty"><p>Enter ORDER or PAR TO ORDER quantities in COUNT to create vendor order sheets.</p><button class="primary" type="button" data-count-nav="areas">CREATE / COUNT</button></div>`;
    return;
  }
  const vendorNames = vendorGroups.map(g => g.vendor);
  if (!state.selectedOrderSheetVendor || !vendorNames.includes(state.selectedOrderSheetVendor)) state.selectedOrderSheetVendor = vendorNames[0];
  select.innerHTML = vendorNames.map(v => `<option value="${escapeHtml(v)}" ${v === state.selectedOrderSheetVendor ? 'selected' : ''}>${escapeHtml(v)}</option>`).join('');
  const group = vendorGroups.find(g => g.vendor === state.selectedOrderSheetVendor) || vendorGroups[0];
  const total = vendorGroupTotal(group.rows);
  body.innerHTML = `<article class="vendor-sheet order-sheet-page ${group.risk.cls}"><div class="vendor-card-head"><h3>${escapeHtml(group.vendor)}</h3><span class="deadline-badge big">ORDER BY DATE: ${shortDateLabel(group.meta.deadline)} · ${fmtClockFromDate(group.meta.deadline)}</span><span class="delivery-badge">DELIVERY DATE: ${shortDateLabel(group.meta.delivery)}</span></div><p class="muted">Immediate order sheet: below-par, 86-risk, and projected-risk items from COUNT. Review quantities before sending to the vendor.</p>${vendorItemsTable(group.rows)}<div class="vendor-create-row"><strong>Estimated vendor total: ${money(total)}</strong><button class="primary" type="button" onclick="window.print()">PRINT / SAVE PDF OR JPEG</button></div></article>`;
}
function downloadSelectedOrderSheetCsv() {
  const groups = sortedVendorGroups();
  const group = groups.find(g => g.vendor === state.selectedOrderSheetVendor) || groups[0];
  if (!group) return toast('No vendor order sheet to download yet.');
  const lines = ['Vendor,Next Order Deadline,Delivery Date,Item,Order Qty,Unit,Unit Price,Total,Risk'];
  group.rows.forEach(r => {
    const order = countOrderValue(r.product_id, 0);
    const risk = vendorRowRiskClass(r).label;
    lines.push([group.vendor, `${shortDateLabel(group.meta.deadline)} ${fmtClockFromDate(group.meta.deadline)}`, shortDateLabel(group.meta.delivery), r.name, order, countOrderUnit(r), r.package_price || 0, (order * Number(r.package_price || 0)).toFixed(2), risk].map(v => `"${String(v).replaceAll('"', '""')}"`).join(','));
  });
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `chef-ledger-${String(group.vendor).replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-order-sheet-${todayInput()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function loadOrders() {
  await ensureCountData();
  const days = Number($('#orderForecastDays')?.value || 3);
  const [suggestions, orders] = await Promise.all([api(`/api/orders/suggest?days=${days}`), api('/api/orders')]);
  state.suggestions = suggestions.suggestions || [];
  state.orders = orders.orders || [];
  $('#suggestionsTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Vendor</th><th>Item</th><th>Delivery</th><th>Current Inventory</th><th>Open Prep Use</th><th>POS Expected Use</th><th>Total Expected Use</th><th>Projected Before Delivery</th><th>Par</th><th>Suggested Order</th><th>Projected After Order</th><th>Reason</th></tr></thead><tbody>
    ${state.suggestions.map(s => `<tr>
      <td>${escapeHtml(s.vendor_name)}</td>
      <td><strong>${escapeHtml(s.product_name)}</strong><br><span class="muted">Pack: ${qty(s.pack_size_qty)} ${escapeHtml(s.pack_size_unit)} per ${escapeHtml(s.supplier_unit)}</span></td>
      <td>${escapeHtml(s.delivery_date || '')}<br><span class="muted">${qty(s.days_until_delivery)} day forecast</span></td>
      <td>${qty(s.current_qty)} ${escapeHtml(s.base_unit || s.unit)}</td>
      <td>${qty(s.pending_prep_usage)} ${escapeHtml(s.base_unit || s.unit)}<br><span class="muted">${escapeHtml((s.prep_sources || []).slice(0,2).join('; '))}</span></td>
      <td>${qty(s.forecast_usage)} ${escapeHtml(s.base_unit || s.unit)}<br><span class="muted">${escapeHtml((s.pos_sources || []).slice(0,2).join('; '))}</span></td>
      <td>${qty(s.expected_total_usage)} ${escapeHtml(s.base_unit || s.unit)}</td>
      <td class="risk-${escapeHtml(s.risk)}">${qty(s.projected_qty)} ${escapeHtml(s.base_unit || s.unit)}</td>
      <td>${qty(s.par_level)} ${escapeHtml(s.base_unit || s.unit)}</td>
      <td><strong>${qty(s.suggested_order_qty)} ${escapeHtml(s.supplier_unit)}</strong><br><span class="muted">covers ${qty(s.suggested_base_qty)} ${escapeHtml(s.base_unit || s.unit)} · ${money(s.unit_cost)} / ${escapeHtml(s.supplier_unit)}</span></td>
      <td>${qty(s.projected_after_order)} ${escapeHtml(s.base_unit || s.unit)}</td>
      <td>${escapeHtml((s.risk || '').replaceAll('_',' '))}</td>
    </tr>`).join('')}
  </tbody></table></div>`;
  $('#ordersList').innerHTML = listOrEmpty(state.orders.map(o => `<div class="list-item"><div class="row"><strong>${escapeHtml(o.title)}</strong><span>${escapeHtml(o.status)}</span></div><span class="muted">${escapeHtml(o.vendor_name || 'Unassigned')} · order ${escapeHtml(o.order_date)} · delivery ${escapeHtml(o.expected_delivery || 'not set')}</span><div class="row"><button class="ghost print-order" data-id="${o.id}">Print forecast order sheet</button><button class="primary receive-order" data-id="${o.id}">Mark received + update inventory</button></div></div>`), 'No orders saved yet. Create vendor orders from suggestions.');
  renderOrdersNextDeadline();
  renderOrderSheetPage();
}


function scheduleWeekPresetFromStart(start) {
  const thisWeek = mondayOf(new Date()).toISOString().slice(0, 10);
  const nextWeekDate = new Date(thisWeek + 'T00:00:00');
  nextWeekDate.setDate(nextWeekDate.getDate() + 7);
  const nextWeek = nextWeekDate.toISOString().slice(0, 10);
  return start === nextWeek ? 'next' : 'this';
}

function scheduleWeekStartForPreset(preset) {
  const d = mondayOf(new Date());
  if (preset === 'next') d.setDate(d.getDate() + 7);
  return d.toISOString().slice(0, 10);
}

function normalizeScheduleFilters() {
  state.scheduleFilters = state.scheduleFilters || { week: 'this', day: '', station: '', employee: '' };
  return state.scheduleFilters;
}

function renderSchedulerFilterBar(data) {
  const filters = normalizeScheduleFilters();
  const weekSelect = $('#scheduleFilterWeek');
  const daySelect = $('#scheduleFilterDay');
  const stationSelect = $('#scheduleFilterStation');
  const employeeSelect = $('#scheduleFilterEmployee');
  if (!daySelect || !stationSelect || !employeeSelect || !weekSelect) return;
  filters.week = scheduleWeekPresetFromStart(data.week_start || scheduleWeekStartForPreset(filters.week || 'this'));
  weekSelect.value = filters.week;
  const days = data.days || [];
  const stations = unique([...(data.blueprint_slots || []).map(s => s.station), ...(data.shifts || []).map(s => s.station)].filter(Boolean)).sort((a,b)=>String(a).localeCompare(String(b)));
  const employees = data.users || [];
  daySelect.innerHTML = '<option value="">All days</option>' + days.map(d => `<option value="${escapeHtml(d)}">${dayLabel(d)}</option>`).join('');
  stationSelect.innerHTML = '<option value="">All stations</option>' + stations.map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('');
  employeeSelect.innerHTML = '<option value="">All employees</option>' + employees.map(u => `<option value="${u.id}">${escapeHtml(u.name)}</option>`).join('');
  if (days.includes(filters.day)) daySelect.value = filters.day; else { filters.day = ''; daySelect.value = ''; }
  if (stations.includes(filters.station)) stationSelect.value = filters.station; else { filters.station = ''; stationSelect.value = ''; }
  if (employees.some(u => String(u.id) === String(filters.employee))) employeeSelect.value = String(filters.employee); else { filters.employee = ''; employeeSelect.value = ''; }
}

function dateInFilterDays(value, days) {
  if (!value) return false;
  return days.includes(String(value).slice(0, 10));
}

function stationMatchesFilter(station, filter) {
  if (!filter) return true;
  return String(station || '').trim().toLowerCase() === String(filter || '').trim().toLowerCase();
}

function applyScheduleFilters(data) {
  const filters = normalizeScheduleFilters();
  const allDays = data.days || [];
  const days = filters.day && allDays.includes(filters.day) ? [filters.day] : allDays;
  const employeeId = filters.employee ? String(filters.employee) : '';
  const station = filters.station || '';
  const shiftAllowed = s => dateInFilterDays(s.start_at, days) && stationMatchesFilter(s.station, station) && (!employeeId || String(s.assigned_to || '') === employeeId);
  const slotAllowed = slot => days.includes(String(slot.date || '')) && stationMatchesFilter(slot.station, station);
  const userAllowed = u => !employeeId || String(u.id) === employeeId;
  const filtered = { ...data };
  filtered.days = days;
  filtered.users = (data.users || []).filter(userAllowed);
  filtered.shifts = (data.shifts || []).filter(shiftAllowed);
  filtered.blueprint_slots = (data.blueprint_slots || []).filter(slotAllowed);
  filtered.available = (data.available || []).filter(a => dateInFilterDays(a.start_at, days) && (!employeeId || String(a.user_id) === employeeId));
  filtered.unavailable = (data.unavailable || []).filter(a => dateInFilterDays(a.start_at, days) && (!employeeId || String(a.user_id) === employeeId));
  filtered.claims = (data.claims || []).filter(c => {
    const sh = (data.shifts || []).find(s => String(s.id) === String(c.shift_id));
    if (!sh) return !employeeId || String(c.user_id) === employeeId;
    return dateInFilterDays(sh.start_at, days) && stationMatchesFilter(sh.station, station) && (!employeeId || String(c.user_id) === employeeId || String(sh.assigned_to || '') === employeeId);
  });
  filtered.hours = (data.hours || []).filter(h => !employeeId || String(h.user_id) === employeeId);
  return filtered;
}

function renderScheduleShiftList(data) {
  return listOrEmpty((data.shifts || []).map(s => {
    const mine = String(s.assigned_to || '') === String(state.user?.id || '');
    const response = s.employee_response || 'pending';
    const responseButtons = mine && s.status === 'assigned' ? `<button class="primary respond-shift" data-id="${s.id}" data-response="accepted">Accept</button><button class="ghost respond-shift" data-id="${s.id}" data-response="declined">No</button>` : '';
    const offerOwn = String(s.assigned_to || '') === String(state.user?.id || '') && s.status === 'assigned' ? `<button class="ghost offer-my-shift" data-id="${s.id}">Offer your shift</button>` : '';
    return `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.status)}${s.status === 'assigned' ? ' · ' + escapeHtml(response) : ''}</span></div><span class="muted">${escapeHtml(s.station || '')} · ${fmtDateTime(s.start_at)} → ${fmtDateTime(s.end_at)} · assigned ${escapeHtml(s.assigned_name || 'open')}</span><div class="row">${s.status === 'open' ? `<button class="primary claim-shift" data-id="${s.id}">I can work this</button>` : ''}${responseButtons}${offerOwn}${isLeader() ? `<button class="ghost delete-shift" data-id="${s.id}">Delete</button>` : ''}</div></div>`;
  }), 'No shifts match the current Day / Week / Station / Employee filters.');
}

function rerenderSchedulerFilteredViews() {
  if (!state.weekSchedule) return;
  renderSchedulerFilterBar(state.weekSchedule);
  const filtered = applyScheduleFilters(state.weekSchedule);
  if (!filtered.days.includes(state.activeScheduleDay)) state.activeScheduleDay = filtered.days[0] || '';
  $('#weeklyScheduleBoard').innerHTML = renderWeeklySchedule(filtered);
  placeSchedulerSlotControls();
  if ($('#shiftList')) $('#shiftList').innerHTML = renderScheduleShiftList(filtered);
  renderSlotCandidates();
  renderSelectedEmployeeSchedulePreview();
  loadManagerPreplist().catch(() => {});
}

async function handleScheduleFilterChange(e) {
  const filters = normalizeScheduleFilters();
  const target = e.target;
  if (target.id === 'scheduleFilterWeek') {
    filters.week = target.value || 'this';
    const start = scheduleWeekStartForPreset(filters.week);
    const weekInput = $('#scheduleWeekStart');
    if (weekInput) weekInput.value = start;
    await loadScheduler();
    return;
  }
  if (target.id === 'scheduleFilterDay') filters.day = target.value || '';
  if (target.id === 'scheduleFilterStation') filters.station = target.value || '';
  if (target.id === 'scheduleFilterEmployee') filters.employee = target.value || '';
  if (['managerPreplistStationFilter','managerPreplistShiftFilter','managerPreplistSort'].includes(target.id)) { await loadManagerPreplist(); return; }
  rerenderSchedulerFilteredViews();
}

async function loadScheduler() {
  await preloadCore();
  const weekInput = $('#scheduleWeekStart');
  if (weekInput && !weekInput.value) weekInput.value = mondayOf(new Date()).toISOString().slice(0, 10);
  const weekStart = weekInput?.value || mondayOf(new Date()).toISOString().slice(0, 10);
  const data = await api(`/api/scheduler/week?start=${encodeURIComponent(weekStart)}`);
  state.weekSchedule = data;
  state.shifts = data.shifts || [];
  if (weekInput) weekInput.value = data.week_start;

  $('#scheduleWarnings').innerHTML = listOrEmpty((data.warnings || []).map(w => `<div class="list-item warning-item"><strong>Schedule conflict</strong><span class="muted">${escapeHtml(w.message)}</span></div>`), "No can-work / can't-work conflicts for this week.");
  renderSchedulerFilterBar(data);
  const filteredSchedule = applyScheduleFilters(data);
  if (!filteredSchedule.days.includes(state.activeScheduleDay)) state.activeScheduleDay = filteredSchedule.days[0] || '';
  $('#weeklyScheduleBoard').innerHTML = renderWeeklySchedule(filteredSchedule);
  placeSchedulerSlotControls();
  if ($('#shiftList')) $('#shiftList').innerHTML = renderScheduleShiftList(filteredSchedule);
  // Blueprint templates are edited only in BUILD → Schedule BUILD.
  // The Manager scheduler shows and fills needed slots; it should not expose blueprint deletion controls.
  const blueprintEl = $('#blueprintList');
  if (blueprintEl && state.activeView === 'build') {
    const blueprints = data.blueprints || [];
    const shifts = unique(blueprints.map(bp => bp.shift_label || 'Shift')).sort();
    const stations = unique(blueprints.map(bp => bp.station || 'Station')).sort();
    blueprintEl.innerHTML = blueprints.length ? `<div class="blueprint-summary-card"><div class="row"><strong>${blueprints.length} needed-shift templates saved</strong><span>${stations.length} stations · ${shifts.length} shift types</span></div><p class="muted">Template details are hidden here so the demo is not cluttered. The Manager Schedule Maker turns these saved rules into grey needed-shift boxes and blackout blocks.</p><div class="chip-row"><span>${escapeHtml(shifts.join(', '))}</span><span>${escapeHtml(stations.slice(0, 8).join(', '))}${stations.length > 8 ? '…' : ''}</span></div></div>` : '<div class="empty">No scheduler blueprint saved yet. Build the normal weekly station coverage above.</div>';
    populateEmployeeScheduleProfileOptions();
  }
  renderSlotCandidates();
  $('#hoursList').innerHTML = `<h3>Estimated weekly hours</h3>${listOrEmpty((data.hours || []).map(h => `<div class="list-item"><div class="row"><strong>${escapeHtml(h.name)}</strong><span class="${h.overtime > 0 ? 'warn' : 'good'}">${qty(h.hours)} hrs</span></div><span class="muted">${h.shift_count || 0} shift(s) · overtime risk: ${qty(h.overtime)} hrs</span></div>`), 'No assigned hours yet.')}
  <h3>Open shift claims</h3>${listOrEmpty((data.claims || []).map(c => { const h = (data.hours || []).find(x => String(x.user_id) === String(c.user_id)) || { hours: 0 }; const sh = (data.shifts || []).find(s => String(s.id) === String(c.shift_id)) || c; const projected = Number(h.hours || 0) + shiftDurationHours(sh); return `<div class="list-item"><div class="row"><strong>${escapeHtml(c.user_name)} → ${escapeHtml(c.shift_title)}</strong><span>${escapeHtml(c.status)}</span></div><span class="muted">${fmtDateTime(c.start_at)} · current ${qty(h.hours || 0)} hrs · with claim ${qty(projected)} hrs</span>${c.status === 'pending' ? `<div class="row"><button class="primary decide-claim" data-id="${c.id}" data-status="approved">Approve</button><button class="ghost decide-claim" data-id="${c.id}" data-status="declined">Decline</button></div>` : ''}</div>`; }), 'No pending claims.')}`;
  const myWeeklyCan = weeklyPatterns(data, state.user?.id, 'can_work');
  const myWeeklyOff = weeklyPatterns(data, state.user?.id, 'cannot_work');
  const myDateOff = oneOffBlocks(data, state.user?.id, 'cannot_work');
  const myOffers = (data.claims || []).filter(c => String(c.user_id) === String(state.user?.id || '') && ['offered','pending'].includes(String(c.status || '')));
  const offerHeadline = myOffers.some(c => c.status === 'pending') ? '<div class="employee-alert-headline">AWAITING APPROVAL</div>' : (myOffers.some(c => c.status === 'offered') ? '<div class="employee-alert-headline">SHIFT OFFERED — RESPOND</div>' : '');
  $('#myScheduleMakerList').innerHTML = `${offerHeadline}<h3>My offered shifts</h3>${listOrEmpty(myOffers.map(c => `<div class="list-item offer-item"><div class="row"><strong>${escapeHtml(c.shift_title || 'Offered shift')}</strong><span>${c.status === 'pending' ? 'AWAITING APPROVAL' : 'Offered'}</span></div><span class="muted">${escapeHtml(c.shift_station || '')} · ${fmtDateTime(c.start_at)} → ${fmtDateTime(c.end_at || '')}</span>${c.status === 'offered' ? `<div class="row"><button class="primary respond-offered-shift" data-id="${c.id}" data-response="accepted">Accept</button><button class="ghost respond-offered-shift" data-id="${c.id}" data-response="declined">No</button></div>` : ''}</div>`), 'No offered shifts right now.')}<h3>My weekly can-work shifts</h3>${listLimited(myWeeklyCan.map(a => `<div class="list-item can-work-item"><div class="row"><strong>${formatWeeklyPattern(a)}</strong><span>weekly</span></div><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'Add weekly shifts you can work.', 3, 'more can-work patterns are saved but hidden here to keep the employee demo clean.')}<h3>My weekly cannot-work shifts</h3>${listLimited(myWeeklyOff.map(a => `<div class="list-item unavailable-item"><div class="row"><strong>${formatWeeklyPattern(a)}</strong><span>weekly</span></div><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'Add weekly shifts you cannot work.', 3, 'more cannot-work patterns are saved but hidden here to keep the employee demo clean.')}<h3>My approved date-specific time off</h3>${listOrEmpty(myDateOff.map(a => `<div class="list-item"><div class="row"><strong>${fmtDateTime(a.start_at)} → ${fmtDateTime(a.end_at)}</strong><span>${escapeHtml(a.reason || 'Scheduled off')}</span></div></div>`), 'No approved time-off dates in this week.')}`;
  const teamWeekly = data.weekly_patterns || [];
  const dateUnavailable = (data.unavailable || []).filter(a => a.source !== 'weekly');
  $('#availabilityList').innerHTML = `<h3>Team weekly can-work shift patterns</h3>${listLimited(teamWeekly.filter(a => a.status === 'can_work').map(a => `<div class="list-item can-work-item"><div class="row"><strong>${escapeHtml(a.user_name)}</strong><span>can work</span></div><span class="muted">${formatWeeklyPattern(a)}</span><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'No weekly can-work patterns yet.', 3, 'more team can-work patterns are saved and still used by scheduler filtering.')}<h3>Team weekly cannot-work shift patterns</h3>${listLimited(teamWeekly.filter(a => a.status === 'cannot_work').map(a => `<div class="list-item unavailable-item"><div class="row"><strong>${escapeHtml(a.user_name)}</strong><span>cannot work</span></div><span class="muted">${formatWeeklyPattern(a)}</span><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'No weekly cannot-work patterns yet.', 3, 'more team cannot-work patterns are saved and still used by scheduler conflict checks.')}<h3>Date-specific time off / call off blocks</h3>${listLimited(dateUnavailable.map(a => `<div class="list-item"><div class="row"><strong>${escapeHtml(a.user_name)}</strong><span>${escapeHtml(a.reason || 'Scheduled off')}</span></div><span class="muted">${fmtDateTime(a.start_at)} → ${fmtDateTime(a.end_at)}</span><div class="row"><button class="ghost delete-availability" data-id="${a.id}">Remove</button></div></div>`), 'No date-specific unavailable blocks for this week.', 3, 'more time-off blocks are saved and still used by scheduler conflict checks.')}`;
  renderSelectedEmployeeSchedulePreview();
}


function renderWeeklySchedule(data) {
  const days = data.days || [];
  if (!state.activeScheduleDay || !days.includes(state.activeScheduleDay)) state.activeScheduleDay = days[0] || '';
  const users = data.users || [];
  const hoursByUser = Object.fromEntries((data.hours || []).map(h => [String(h.user_id), h]));
  const tabs = `<div class="day-tabs">${days.map(d => `<button class="${d === state.activeScheduleDay ? 'active' : ''}" data-daytab="${escapeHtml(d)}">${dayLabel(d)}</button>`).join('')}</div>`;
  const dayView = renderDailySchedule(data, state.activeScheduleDay);
  const header = `<div class="weekly-row weekly-header"><div class="employee-col">Employee / hours</div>${days.map(d => `<div class="day-col"><strong>${dayLabel(d)}</strong><span>6 AM–midnight</span></div>`).join('')}</div>`;
  const rows = users.map(user => {
    const h = hoursByUser[String(user.id)] || { hours: 0, overtime: 0, shift_count: 0 };
    return `<div class="weekly-row"><div class="employee-col"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.role)}${user.station ? ' · ' + escapeHtml(user.station) : ''}</span><span class="${h.overtime > 0 ? 'warn' : 'good'}">${qty(h.hours)} hrs${h.overtime > 0 ? ' · OT ' + qty(h.overtime) : ''}</span></div>${days.map(day => renderScheduleCell(data, user, day)).join('')}</div>`;
  }).join('');
  return `${tabs}${dayView}<details class="week-overview"><summary>Show full-week overview</summary><div class="weekly-scroll">${header}${rows || `<div class="empty">Add employees before building the weekly schedule.</div>`}</div></details>`;
}

function placeSchedulerSlotControls() {
  const controls = $('#schedulerSlotControls');
  const mount = $('#inlineSlotControlsMount');
  if (!controls || !mount) return;
  if (controls.parentElement !== mount) mount.appendChild(controls);
  controls.classList.add('inside-scheduler-ui');
}

function shiftMatchesBlueprintSlot(s, slot) {
  const sameDate = String(s.start_at || '').slice(0, 10) === String(slot.date || '');
  const sameStation = String(s.station || '').trim().toLowerCase() === String(slot.station || '').trim().toLowerCase();
  const sameStart = String(s.start_at || '').slice(11, 16) === String(slot.start_at || '').slice(11, 16);
  const sameEnd = String(s.end_at || '').slice(11, 16) === String(slot.end_at || '').slice(11, 16);
  const titleShift = String(s.title || '').split('—')[0].trim().toLowerCase();
  const sameShift = !slot.shift_label || titleShift === String(slot.shift_label || '').trim().toLowerCase() || String(s.title || '').toLowerCase().includes(String(slot.shift_label || '').toLowerCase());
  return sameDate && sameStation && sameStart && sameEnd && sameShift;
}

function assignmentsForBlueprintSlot(data, slot) {
  return (data.shifts || []).filter(s => shiftMatchesBlueprintSlot(s, slot) && String(s.status || '') === 'assigned').map(s => {
    const u = userById(s.assigned_to) || {};
    return { shift: s, id: s.assigned_to, name: s.assigned_name || u.name || 'Employee', schedule_color: u.schedule_color || '#2f6fed' };
  });
}

function offersForBlueprintSlot(data, slot) {
  const offeredShifts = (data.shifts || []).filter(s => shiftMatchesBlueprintSlot(s, slot) && String(s.status || '') === 'offered');
  const out = [];
  offeredShifts.forEach(shift => {
    (data.claims || []).filter(c => String(c.shift_id) === String(shift.id)).forEach(c => {
      const u = userById(c.user_id) || {};
      out.push({ shift, claim: c, id: c.user_id, name: c.user_name || u.name || 'Employee', status: c.status || 'offered', schedule_color: c.schedule_color || u.schedule_color || '#2f6fed' });
    });
  });
  return out;
}

function minutesToTime(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function timeToMinutes(t) {
  const [h, m] = String(t || '00:00').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function blackoutBlocksForDay(data, day) {
  const slots = (data.blueprint_slots || []).filter(slot => String(slot.date) === String(day));
  const dayIndex = new Date(`${day}T12:00:00`).getDay();
  const isSunday = dayIndex === 0;
  const open = isSunday ? 9 * 60 : 8 * 60;
  const close = (dayIndex === 5 || dayIndex === 6) ? (23 * 60 + 30) : (isSunday ? 15 * 60 : 22 * 60);
  const intervals = slots.map(s => [timeToMinutes(String(s.start_at || '').slice(11, 16)), timeToMinutes(String(s.end_at || '').slice(11, 16))]).filter(([a, b]) => b > a).sort((a, b) => a[0] - b[0]);
  const gaps = [];
  let cursor = open;
  intervals.forEach(([a, b]) => {
    if (a > cursor && a - cursor >= 60) gaps.push({ day, start_time: minutesToTime(cursor), end_time: minutesToTime(a) });
    cursor = Math.max(cursor, b);
  });
  if (close > cursor && close - cursor >= 60) gaps.push({ day, start_time: minutesToTime(cursor), end_time: minutesToTime(close) });
  return gaps.slice(0, 3);
}

function renderBlackoutBlocks(data, day) {
  const blocks = blackoutBlocksForDay(data, day);
  if (!blocks.length) return '<div class="empty">No blackout gaps for this day. The current blueprint covers the visible operating windows.</div>';
  return blocks.map(b => `<button class="blackout-block" type="button" data-blackout-day="${escapeHtml(b.day)}" data-blackout-start="${escapeHtml(b.start_time)}" data-blackout-end="${escapeHtml(b.end_time)}"><strong>BLACKOUT</strong><span>${escapeHtml(b.start_time)}–${escapeHtml(b.end_time)}</span><small>No Blueprint Maker shift exists for this time. Click to open Blueprint Maker with these hours prefilled.</small></button>`).join('');
}

async function openBlueprintFromBlackout(day, startTime, endTime) {
  state.pendingBlueprintPrefill = { day, startTime, endTime };
  await switchView('build', 'buildChefSchedulerCard');
  setTimeout(() => {
    const form = $('#schedulerBlueprintForm');
    if (!form) return;
    const d = new Date(`${day}T12:00:00`);
    const dayIndex = (d.getDay() + 6) % 7;
    const daysSelect = $('[name="days"]', form);
    if (daysSelect) Array.from(daysSelect.options).forEach(o => { o.selected = String(o.value) === String(dayIndex); });
    $('[name="start_time"]', form).value = startTime || '';
    $('[name="end_time"]', form).value = endTime || '';
    toast('Blueprint Maker opened from a blackout block. Choose SHIFT and STATION, then SUBMIT.');
    focusElement('schedulerBlueprintForm');
  }, 150);
}

function renderDailySchedule(data, day) {
  const users = data.users || [];
  const hoursByUser = Object.fromEntries((data.hours || []).map(h => [String(h.user_id), h]));
  const slots = (data.blueprint_slots || []).filter(slot => String(slot.date) === String(day));
  const slotCards = (slot, kind) => {
    const candidates = candidateUsersForSlot(data, slot, false);
    const assignments = assignmentsForBlueprintSlot(data, slot);
    const offers = offersForBlueprintSlot(data, slot);
    const selected = state.selectedBlueprintSlot && String(state.selectedBlueprintSlot.id) === String(slot.id) && String(state.selectedBlueprintSlot.date) === String(slot.date);
    const filled = assignments.length >= Number(slot.employees_needed || 1);
    const offered = !filled && offers.length > 0;
    if (kind === 'needed' && filled) return '';
    if (kind === 'filled' && !filled && !offered) return '';
    const color = assignments[0]?.schedule_color || '#8b8b8b';
    const chips = assignments.map(a => `<span class="slot-employee-chip" style="--chip-color:${escapeHtml(a.schedule_color || '#2f6fed')}">${escapeHtml(a.name || 'Employee')}</span>`).join('');
    const offerSegs = offers.map(o => `<span class="offer-segment" style="--offer-color:${escapeHtml(o.schedule_color || '#b58a2a')}" title="${escapeHtml(o.name)} · ${escapeHtml(o.status)}"></span>`).join('');
    const offerNames = offers.map(o => `${o.name}${o.status === 'pending' ? ' awaiting approval' : ''}`).join(', ');
    const cls = ['blueprint-slot', filled ? 'filled assigned' : '', offered ? 'offered' : '', selected ? 'selected' : ''].filter(Boolean).join(' ');
    return `<button class="${cls}" style="--slot-color:${escapeHtml(color)}" type="button" data-blueprint-slot="${slot.id}" data-day="${escapeHtml(day)}"><strong>${escapeHtml(slot.station || 'Station')}</strong><span>${escapeHtml(slot.shift_label || 'Shift')} · ${formatTimeShort(slot.start_at)}–${formatTimeShort(slot.end_at)}</span><small>Need ${qty(slot.employees_needed || 1)} · assigned ${qty(assignments.length || 0)} · ${candidates.length} eligible</small>${offerSegs ? `<div class="slot-offer-split">${offerSegs}</div><em>Offered to: ${escapeHtml(offerNames)}</em>` : chips ? `<div class="slot-chip-row">${chips}</div>` : '<em>Click to fill or offer</em>'}</button>`;
  };
  const needed = slots.map(s => slotCards(s, 'needed')).filter(Boolean).join('');
  const filled = slots.map(s => slotCards(s, 'filled')).filter(Boolean).join('');
  const blackout = renderBlackoutBlocks(data, day);
  const slotHtml = `<div class="planner-columns scheduler-control-layout"><section class="needed-slot-section"><h3>Shifts needed to be filled</h3><div class="blueprint-slot-grid">${needed || '<div class="empty">All required needed-shift slots for this day are filled. Use the blackout blocks below if a missing shift/time needs to be added to Blueprint Maker.</div>'}</div><div id="inlineSlotControlsMount" class="inline-slot-controls-mount" aria-label="Selected shift controls appear here"></div><h3>Blackout time blocks</h3><div class="blackout-grid">${blackout}</div></section><section><h3>Filled shifts / offered shifts</h3><div class="blueprint-slot-grid filled-slot-grid">${filled || '<div class="empty">No filled or offered shifts yet.</div>'}</div></section></div>`;
  const rows = users.map(user => {
    const h = hoursByUser[String(user.id)] || { hours: 0, overtime: 0 };
    return `<div class="daily-row"><div class="employee-col"><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.role)}${user.station ? ' · ' + escapeHtml(user.station) : ''}</span><span class="${h.overtime > 0 ? 'warn' : 'good'}">${qty(h.hours)} weekly hrs</span></div>${renderScheduleCell(data, user, day)}</div>`;
  }).join('');
  return `<div class="daily-schedule"><div class="daily-head"><strong>${dayLabel(day)}</strong><span>Use Day / Week / Station / Employee filters above to break the schedule down. Click a colored shift for the manager side panel. One extra grey demo slot remains for testing fill-by-station, fill-by-day, employee availability, and offer-shift mechanics.</span></div>${slotHtml}<h3>Employee timeline</h3>${rows || '<div class="empty">No employees yet.</div>'}</div>`;
}

function renderScheduleCell(data, user, day) {
  const shifts = (data.shifts || []).filter(s => String(s.assigned_to || '') === String(user.id) && sameDay(s.start_at, day));
  const available = (data.available || []).filter(a => String(a.user_id) === String(user.id) && overlapsDay(a.start_at, a.end_at, day));
  const unavailable = (data.unavailable || []).filter(a => String(a.user_id) === String(user.id) && overlapsDay(a.start_at, a.end_at, day));
  const hours = (data.hours || []).find(h => String(h.user_id) === String(user.id)) || { hours: 0, overtime: 0 };
  const availableBars = available.map(a => `<div class="schedule-bar available-bar" style="${barStyle(a.start_at, a.end_at, day)}" title="${escapeHtml(a.label || 'Can work')}"><span>${formatTimeShort(a.start_at)}–${formatTimeShort(a.end_at)} · ${escapeHtml(a.label || 'Can work')}</span></div>`).join('');
  const shiftBars = shifts.map(s => {
    const color = user.schedule_color || '#2f6fed';
    const conflictMessages = shiftConflictSummary(data, user.id, s.start_at, s.end_at);
    const hasConflict = conflictMessages.length > 0;
    const overtimeRisk = Number(hours.overtime || 0) > 0;
    const cls = ['schedule-bar','shift-bar', hasConflict ? 'shift-conflict-flash' : '', overtimeRisk ? 'shift-overtime-flash' : ''].filter(Boolean).join(' ');
    const warning = hasConflict ? ' · scheduling conflict' : overtimeRisk ? ' · overtime risk' : '';
    const title = hasConflict ? `${s.title} · ${conflictMessages.join('; ')}` : `${s.title}${warning}`;
    return `<button class="${cls}" data-shift-side-panel="${s.id}" style="${barStyle(s.start_at, s.end_at, day)};--shift-color:${escapeHtml(color)}" title="${escapeHtml(title)}"><span>${formatTimeShort(s.start_at)}–${formatTimeShort(s.end_at)} · ${escapeHtml(s.title)}${warning ? ` · ${escapeHtml(warning.replace(' · ', ''))}` : ''}</span></button>`;
  }).join('');
  const offBars = unavailable.map(a => `<div class="schedule-bar off-bar" style="${barStyle(a.start_at, a.end_at, day)}" title="${escapeHtml(a.reason || 'Scheduled off')}"><span>${formatTimeShort(a.start_at)}–${formatTimeShort(a.end_at)} · ${escapeHtml(a.reason || 'Scheduled off')}</span></div>`).join('');
  return `<div class="day-cell">${availableBars}${offBars}${shiftBars}${!shiftBars && !offBars && !availableBars ? '<span class="muted tiny">—</span>' : ''}</div>`;
}

function sameDay(value, day) {
  if (!value) return false;
  return String(value).slice(0, 10) === day;
}

function overlapsDay(startAt, endAt, day) {
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dayStart = dateAtTime(day, 0, 0);
  const dayEnd = dateAtTime(day, 23, 59);
  return end >= dayStart && start <= dayEnd;
}

function dateAtTime(day, hour, minute) {
  return new Date(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
}

function barStyle(startAt, endAt, day) {
  const open = 6 * 60;
  const close = 24 * 60;
  const start = new Date(startAt);
  const end = new Date(endAt);
  const dayStart = dateAtTime(day, 6, 0);
  const dayEnd = dateAtTime(day, 23, 59);
  const clippedStart = start < dayStart ? dayStart : start;
  const clippedEnd = end > dayEnd ? dayEnd : end;
  const startMinutes = clippedStart.getHours() * 60 + clippedStart.getMinutes();
  const endMinutes = clippedEnd.getHours() * 60 + clippedEnd.getMinutes();
  const left = Math.max(0, Math.min(100, ((startMinutes - open) / (close - open)) * 100));
  const width = Math.max(6, Math.min(100 - left, ((endMinutes - startMinutes) / (close - open)) * 100));
  return `left:${left}%;width:${width}%;`;
}

function dayLabel(day) {
  const date = new Date(`${day}T12:00:00`);
  return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTimeShort(value) {
  if (!value) return '';
  try { return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }); }
  catch { return value; }
}

const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatWeeklyPattern(p) {
  const day = p.day_name || dayNames[Number(p.day_of_week || 0)] || 'Day';
  const label = p.label || p.reason || p.shift_label || (p.status === 'can_work' ? 'Can work' : 'Unavailable');
  const shift = p.shift_label ? ` · ${escapeHtml(p.shift_label)}` : '';
  return `${escapeHtml(day)}${shift} · ${escapeHtml(p.start_time || '')}–${escapeHtml(p.end_time || '')} · ${escapeHtml(label)}`;
}

function weeklyPatterns(data, userId, status) {
  return (data.weekly_patterns || []).filter(p => String(p.user_id) === String(userId) && (!status || p.status === status));
}

function oneOffBlocks(data, userId, kind) {
  const source = kind === 'can_work' ? (data.available || []) : (data.unavailable || []);
  return source.filter(a => String(a.user_id) === String(userId) && a.source !== 'weekly');
}

function unique(values) { return [...new Set((values || []).filter(v => v !== undefined && v !== null && String(v).trim() !== '').map(v => String(v).trim()))]; }

function csvList(value) {
  return String(value || '').split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
}

function userMatchesStation(user, station) {
  const target = String(station || '').trim().toLowerCase();
  if (!target) return true;
  const qualified = csvList(user.qualified_stations);
  if (qualified.length) return qualified.includes(target);
  return String(user.station || '').trim().toLowerCase() === target || !user.station;
}

function userMatchesShift(user, shiftLabel) {
  const target = String(shiftLabel || '').trim().toLowerCase();
  if (!target) return true;
  const eligible = csvList(user.eligible_shifts);
  if (!eligible.length) return true;
  return eligible.includes(target) || eligible.includes('any shift') || eligible.includes('any');
}

function timeRangesOverlap(a0, a1, b0, b1) {
  try {
    const startA = new Date(a0), endA = new Date(a1), startB = new Date(b0), endB = new Date(b1);
    return startA < endB && startB < endA;
  } catch { return false; }
}

function timeRangeCovers(a0, a1, b0, b1) {
  try {
    const startA = new Date(a0), endA = new Date(a1), startB = new Date(b0), endB = new Date(b1);
    return startA <= startB && endA >= endB;
  } catch { return false; }
}

function candidateInfoForSlot(data, user, slot) {
  const stationOk = userMatchesStation(user, slot.station);
  const shiftOk = userMatchesShift(user, slot.shift_label);
  const availabilityMessages = availabilityDiscrepancyMessages(data, user.id, slot.start_at, slot.end_at);
  const canBlocks = (data.available || []).filter(a => String(a.user_id) === String(user.id));
  const hasAnyCanWork = canBlocks.length > 0;
  const canWork = availabilityMessages.filter(m => m.type === 'can_work_gap' || m.type === 'no_can_work').length === 0;
  const conflict = availabilityMessages.some(m => m.type === 'unavailable');
  const valid = stationOk && shiftOk && canWork && !conflict;
  const reasons = [];
  if (!stationOk) reasons.push('not qualified for station');
  if (!shiftOk) reasons.push('not eligible for shift');
  if (!hasAnyCanWork) reasons.push('no can-work availability submitted');
  availabilityMessages.forEach(m => reasons.push(m.message));
  return { user, stationOk, shiftOk, canWork, conflict, valid, reasons, availabilityMessages };
}

function candidateUsersForSlot(data, slot, includeOverride = false) {
  return (data.users || [])
    .filter(u => ROLE_LEVEL[u.role] <= ROLE_LEVEL.manager || u.role === 'team_leader')
    .map(u => candidateInfoForSlot(data, u, slot))
    .filter(info => includeOverride ? (info.stationOk || info.shiftOk) : info.valid)
    .sort((a, b) => Number(b.valid) - Number(a.valid) || String(a.user.name).localeCompare(String(b.user.name)));
}


function shiftById(shiftId) {
  return (state.weekSchedule?.shifts || state.shifts || []).find(s => String(s.id) === String(shiftId));
}

function shiftDurationHours(shift) {
  if (!shift) return 0;
  try { return Math.max(0, (new Date(shift.end_at) - new Date(shift.start_at)) / 3600000); }
  catch { return 0; }
}

function payPeriodHoursForUser(userId) {
  const h = (state.weekSchedule?.hours || []).find(x => String(x.user_id) === String(userId));
  return h || { user_id: userId, hours: 0, overtime: 0, shift_count: 0 };
}

function unresolvedTimeOffConflictsForShift(shift) {
  if (!shift || !shift.assigned_to) return [];
  return (state.weekSchedule?.unavailable || [])
    .filter(b => String(b.user_id) === String(shift.assigned_to) && timeRangesOverlap(shift.start_at, shift.end_at, b.start_at, b.end_at));
}

function candidateOptionsWithHours(candidates, selectedSet = new Set()) {
  return listOrEmpty(candidates.map(c => {
    const h = payPeriodHoursForUser(c.user.id);
    return `<label class="check-card offer-candidate-card"><input type="checkbox" class="side-offer-employee-check" value="${c.user.id}" ${selectedSet.has(String(c.user.id)) ? 'checked' : ''}><span class="swatch" style="background:${escapeHtml(c.user.schedule_color || '#2f6fed')}"></span><span>${escapeHtml(c.user.name)} <small>(${qty(h.hours || 0)} hrs)</small></span></label>`;
  }), 'No matching employees. Choose another station/shift, or leave Send To blank to use all eligible employees for the selected shift.');
}

function openShiftSidePanel(shiftId) {
  state.selectedShiftId = String(shiftId || '');
  renderShiftSidePanel();
  const panel = $('#shiftSidePanel');
  if (panel) panel.classList.add('open');
}

function closeShiftSidePanel() {
  state.selectedShiftId = null;
  const panel = $('#shiftSidePanel');
  if (panel) panel.classList.remove('open');
}

function renderShiftSidePanel() {
  const panel = $('#shiftSidePanel');
  if (!panel) return;
  const shift = shiftById(state.selectedShiftId);
  if (!shift) {
    panel.innerHTML = `<button class="ghost side-close" id="closeShiftSidePanel" type="button">Close</button><div class="empty">Click an assigned shift bar to view details.</div>`;
    return;
  }
  const user = userById(shift.assigned_to) || { name: shift.assigned_name || 'Open employee', schedule_color: '#8b8b8b' };
  const hours = payPeriodHoursForUser(shift.assigned_to);
  const duration = shiftDurationHours(shift);
  const projected = Number(hours.hours || 0) + duration;
  const conflicts = shiftConflictSummary(state.weekSchedule || {}, shift.assigned_to, shift.start_at, shift.end_at);
  const allCandidates = candidateUsersForSlot(state.weekSchedule || {}, {
    station: shift.station,
    shift_label: (shift.title || '').split('—')[0]?.trim() || shift.title,
    start_at: shift.start_at,
    end_at: shift.end_at
  }, false);
  const candidateChecks = candidateOptionsWithHours(allCandidates.filter(c => String(c.user.id) !== String(shift.assigned_to)));
  const currentLine = shift.assigned_to ? `${escapeHtml(user.name || shift.assigned_name || 'Employee')} · ${qty(hours.hours || 0)} current hrs · ${qty(projected)} with this shift` : 'Unassigned shift';
  const flash = conflicts.length ? `<div class="side-alert danger"><strong>Scheduling conflict</strong><ul>${conflicts.map(c => `<li>${escapeHtml(c)}</li>`).join('')}</ul></div>` : Number(hours.overtime || 0) > 0 || projected > 40 ? '<div class="side-alert warn">Overtime risk: this employee is at or above 40 hours for the rolling pay period.</div>' : '<div class="side-alert good">No overtime or request-off conflict detected for this shift.</div>';
  panel.innerHTML = `
    <div class="side-panel-head"><div><p class="eyebrow">Shift side panel</p><h2>${escapeHtml(shift.title || 'Shift')}</h2></div><button class="ghost side-close" id="closeShiftSidePanel" type="button">Close</button></div>
    <div class="side-shift-card" style="--shift-color:${escapeHtml(user.schedule_color || '#2f6fed')}">
      <strong>${escapeHtml(shift.station || 'Station')}</strong>
      <span>${fmtDateTime(shift.start_at)} → ${fmtDateTime(shift.end_at)}</span>
      <span>${currentLine}</span>
      <span>Shift length: ${qty(duration)} hrs · projected pay-period hours: ${qty(projected)}</span>
    </div>
    ${flash}
    <label>Chef-only note <textarea id="sideShiftNoteText">${escapeHtml(shift.notes || '')}</textarea></label>
    <div class="row"><button class="primary" id="saveSideShiftNote" type="button">Save note</button><button class="gold-save" id="openSideOfferShift" type="button">OFFER SHIFT</button></div>
    <div class="side-offer-box" id="sideOfferBox" hidden>
      <h3>Offer this shift</h3>
      <p class="muted">Leave Send To blank to auto-send to employees who can work this station/shift. Add a respond-by date/time so the shift captain knows when to finalize.</p>
      <div class="form-grid">
        <label>Respond by <input id="sideOfferRespondBy" type="datetime-local"></label>
        <label>Station(s) <select id="sideOfferStationSelect" multiple>${stationNames().map(st => `<option value="${escapeHtml(st)}" ${String(st).toLowerCase() === String(shift.station || '').toLowerCase() ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('')}</select></label>
        <label>Shift(s) <select id="sideOfferShiftSelect" multiple>${unique([(shift.title || '').split('—')[0]?.trim() || 'Shift','Prep','Lunch','Dinner','Close','Brunch']).map(sh => `<option value="${escapeHtml(sh)}" ${String(shift.title || '').toLowerCase().includes(String(sh).toLowerCase()) ? 'selected' : ''}>${escapeHtml(sh)}</option>`).join('')}</select></label>
      </div>
      <div class="row"><button class="ghost" id="addOfferGroupBtn" type="button">+ Add another station/shift group</button><span class="muted tiny">Each group can target a station, a shift, or specific employees.</span></div>
      <div id="sideOfferExtraGroups"></div>
      <h4>SEND TO</h4>
      <div class="checkbox-grid">${candidateChecks}</div>
      <button class="primary" id="sendSideOfferShift" type="button">Send offer</button>
    </div>
  `;
}

function selectedBlueprintSlot() {
  if (!state.selectedBlueprintSlot) return null;
  return (state.weekSchedule?.blueprint_slots || []).find(slot => String(slot.id) === String(state.selectedBlueprintSlot.id) && String(slot.date) === String(state.selectedBlueprintSlot.date)) || state.selectedBlueprintSlot;
}

function setSlotPanel(name) {
  state.activeSlotMenu = name || 'shift';
  $$('.slot-menu-tabs button').forEach(btn => btn.classList.toggle('active', btn.dataset.slotMenu === state.activeSlotMenu));
  $$('.slot-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.slotPanel === state.activeSlotMenu));
}

function renderSlotCandidates() {
  const el = $('#slotCandidateList');
  const summary = $('#selectedBlueprintSummary');
  const employeeSelect = $('#slotEmployeeSelect');
  const shiftSelect = $('#slotShiftSelect');
  const stationSelect = $('#slotStationSelect');
  const offerChecks = $('#offerEmployeeChecks');
  const hint = $('#slotControlHint');
  const slot = selectedBlueprintSlot();
  if (!slot || !state.weekSchedule) {
    if (el) el.innerHTML = '<div class="empty">Click a grey needed shift to see valid employees.</div>';
    if (summary) summary.innerHTML = '<span class="muted">No grey slot selected yet.</span>';
    if (employeeSelect) employeeSelect.innerHTML = '<option value="">Select a shift slot first</option>';
    if (shiftSelect) shiftSelect.innerHTML = '<option value="">No slot selected</option>';
    if (stationSelect) stationSelect.innerHTML = '<option value="">No slot selected</option>';
    if (offerChecks) offerChecks.innerHTML = '<div class="empty">Select a slot first.</div>';
    if (hint) hint.textContent = 'Click a grey needed shift above. The box turns white, then use SHIFT, EMPLOYEE, STATION, or OFFER SHIFT directly under the needed-shift boxes.';
    return;
  }
  const includeOverride = $('#slotOverrideConflict')?.checked;
  const candidates = candidateUsersForSlot(state.weekSchedule, slot, Boolean(includeOverride));
  const validCandidates = candidateUsersForSlot(state.weekSchedule, slot, false);
  if (summary) summary.innerHTML = `<div class="slot-summary-grid"><div><span>Selected shift</span><strong>${escapeHtml(slot.shift_label || 'Shift')}</strong></div><div><span>Station</span><strong>${escapeHtml(slot.station || 'Station')}</strong></div><div><span>Day</span><strong>${dayLabel(slot.date)}</strong></div><div><span>Hours</span><strong>${formatTimeShort(slot.start_at)}–${formatTimeShort(slot.end_at)}</strong></div></div>`;
  if (hint) hint.textContent = `Selected: ${slot.station || 'Station'} · ${slot.shift_label || 'Shift'} · ${formatTimeShort(slot.start_at)}–${formatTimeShort(slot.end_at)}. Employee list is filtered by station, day, shift, and availability from Employee Profile BUILD.`;
  if (shiftSelect) shiftSelect.innerHTML = `<option value="${escapeHtml(slot.shift_label || 'Shift')}">${escapeHtml(slot.shift_label || 'Shift')} · ${formatTimeShort(slot.start_at)}–${formatTimeShort(slot.end_at)}</option>`;
  const stations = unique([slot.station, ...stationNames()]).filter(Boolean);
  if (stationSelect) stationSelect.innerHTML = stations.map(st => `<option value="${escapeHtml(st)}" ${String(st).toLowerCase() === String(slot.station).toLowerCase() ? 'selected' : ''}>${escapeHtml(st)}</option>`).join('');
  if (el) el.innerHTML = listOrEmpty(candidates.map(c => `<button class="candidate-button ${c.valid ? 'good-candidate' : 'override-candidate'}" type="button" data-candidate-user="${c.user.id}"><span class="swatch" style="background:${escapeHtml(c.user.schedule_color || '#2f6fed')}"></span><strong>${escapeHtml(c.user.name)}</strong><small>${c.valid ? 'Available for this station/time' : 'Override needed: ' + escapeHtml(c.reasons.join('; '))}</small></button>`), includeOverride ? 'No override candidates for this station/time.' : 'No employee profile matches this station/time. Chef can use override to show conflict candidates.');
  if (employeeSelect) employeeSelect.innerHTML = ['<option value="">Choose employee</option>', ...candidates.map(c => `<option value="${c.user.id}">${escapeHtml(c.user.name)}${c.valid ? '' : ' ⚠ override'}</option>`)].join('');
  if (offerChecks) offerChecks.innerHTML = listOrEmpty(validCandidates.map(c => `<label class="check-card"><input type="checkbox" class="offer-employee-check" value="${c.user.id}" checked><span class="swatch" style="background:${escapeHtml(c.user.schedule_color || '#2f6fed')}"></span><span>${escapeHtml(c.user.name)}</span></label>`), 'No eligible employees to offer this shift to. Use the employee BUILD profile to add availability/station qualifications first.');
}

function fillShiftFromBlueprint(slot) {
  state.selectedBlueprintSlot = { ...slot };
  setSlotPanel('employee');
  renderSlotCandidates();
  renderSelectedEmployeeSchedulePreview();
  placeSchedulerSlotControls();
  focusElement('schedulerSlotControls');
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
}


function userById(userId) {
  return (state.users || []).find(u => String(u.id) === String(userId));
}

function selectedTeamProfileUserId() {
  return $('#teamProfileUserSelect')?.value || state.user?.id;
}


function setTeamSubpage(name = 'access') {
  state.teamSubpage = name;
  $$('#teamSubNav button').forEach(btn => btn.classList.toggle('active', btn.dataset.teamSubpage === name));
  $$('.team-panel').forEach(panel => panel.classList.toggle('active', panel.dataset.teamPanel === name));
}

function selectedMemberHomeUserId() {
  return $('#memberHomeUserSelect')?.value || state.user?.id;
}

function getUserPermissions(userId) {
  return (state.messagePermissions || []).filter(p => String(p.user_id) === String(userId)).map(p => p.tool);
}

function renderMessagePermissionForm() {
  const uid = $('#messagePermissionUserSelect')?.value;
  const allowed = new Set(getUserPermissions(uid));
  $$('#messagePermissionTools input[name="tool"]').forEach(cb => { cb.checked = allowed.has(cb.value); });
}

function renderMemberHome() {
  const uid = selectedMemberHomeUserId();
  const u = userById(uid) || state.user || {};
  const weekData = state.profileSchedule || state.weekSchedule || { shifts: [], claims: [], weekly_patterns: [], unavailable: [] };
  const myShifts = (weekData.shifts || []).filter(s => String(s.assigned_to || '') === String(uid));
  const myClaims = (weekData.claims || []).filter(c => String(c.user_id || '') === String(uid));
  const myNotifications = (state.notifications || []).filter(n => !n.user_id || String(n.user_id) === String(uid)).slice(0, 8);
  const eligible = getUserPermissions(uid);
  const panel = $('#memberHomePanel');
  if (!panel) return;
  panel.innerHTML = `
    <div class="profile-summary-card">
      <div class="row"><strong>${escapeHtml(u.name || 'Employee')}</strong><span><i class="profile-color-dot" style="background:${escapeHtml(u.schedule_color || '#2f6fed')}"></i>${escapeHtml(u.role || '')}</span></div>
      <span class="muted">${escapeHtml(u.email || '')} · station ${escapeHtml(u.station || 'not set')}</span>
      <div class="row"><span class="muted">Stations: ${escapeHtml(u.qualified_stations || u.station || 'none')}</span><span class="muted">Eligible shifts: ${escapeHtml(u.eligible_shifts || 'none')}</span></div>
      <div class="row"><span class="muted">Message eligibility: ${escapeHtml(eligible.join(', ') || 'generic only')}</span><span class="muted">Days off: ${qty(u.days_off_remaining || 0)}</span></div>
    </div>
    <h3>Current / next shifts</h3>${listOrEmpty(myShifts.map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.status)}</span></div><span class="muted">${escapeHtml(s.station || '')} · ${fmtDateTime(s.start_at)} → ${fmtDateTime(s.end_at)}</span></div>`), 'No scheduled shifts in the selected week.')}
    <h3>Offered shifts</h3>${listOrEmpty(myClaims.map(c => `<div class="list-item"><div class="row"><strong>${escapeHtml(c.shift_title || 'Offered shift')}</strong><span>${escapeHtml(c.status)}</span></div><span class="muted">${escapeHtml(c.shift_station || '')} · ${fmtDateTime(c.start_at)} → ${fmtDateTime(c.end_at)}</span></div>`), 'No offered shifts for this employee.')}
    <h3>Notifications</h3>${listOrEmpty(myNotifications.map(n => `<div class="list-item"><div class="row"><strong>${escapeHtml(n.title)}</strong><span>${fmtDateTime(n.created_at)}</span></div><span class="muted">${escapeHtml(n.body)}</span></div>`), 'No notifications yet.')}
  `;
  const hidden = $('#memberMessageTargetUserId');
  if (hidden) hidden.value = uid || '';
}

async function loadTeamMemberProfiles() {
  const weekInput = $('#teamProfileWeekStart');
  if (weekInput && !weekInput.value) weekInput.value = mondayOf(new Date()).toISOString().slice(0, 10);
  const weekStart = weekInput?.value || mondayOf(new Date()).toISOString().slice(0, 10);
  const data = await api(`/api/scheduler/week?start=${encodeURIComponent(weekStart)}`);
  state.profileSchedule = data;
  if (weekInput) weekInput.value = data.week_start;
  renderTeamMemberProfileSchedule();
  renderSelectedEmployeeSchedulePreview();
}

function renderTeamMemberProfileSchedule() {
  const selectedId = selectedTeamProfileUserId();
  const selectedUser = userById(selectedId) || state.user || {};
  const data = state.profileSchedule || { weekly_patterns: [], available: [], unavailable: [], shifts: [], hours: [] };
  const canPatterns = weeklyPatterns(data, selectedId, 'can_work');
  const offPatterns = weeklyPatterns(data, selectedId, 'cannot_work');
  const dateOff = oneOffBlocks(data, selectedId, 'cannot_work');
  const assigned = (data.shifts || []).filter(s => String(s.assigned_to || '') === String(selectedId));
  const hours = (data.hours || []).find(h => String(h.user_id) === String(selectedId)) || { hours: 0, overtime: 0, shift_count: 0 };

  const canWorkSelect = $('#profileCanWorkUserSelect');
  const cannotWorkSelect = $('#profileCannotWorkUserSelect');
  if (canWorkSelect) canWorkSelect.value = selectedId || '';
  if (cannotWorkSelect) cannotWorkSelect.value = selectedId || '';
  const profileForm = $('#employeeScheduleProfileForm');
  if (profileForm) {
    $('#scheduleProfileUserId').value = selectedId || '';
    const nameInput = $('#scheduleProfileEmployeeName');
    if (nameInput) nameInput.value = selectedUser.name || '';
    $('[name="schedule_color"]', profileForm).value = selectedUser.schedule_color || '#2f6fed';
    populateEmployeeScheduleProfileOptions();
    $('[name="qualified_stations"]', profileForm).value = selectedUser.qualified_stations || selectedUser.station || '';
    $('[name="eligible_shifts"]', profileForm).value = selectedUser.eligible_shifts || '';
  }

  const summary = $('#teamProfileScheduleSummary');
  if (summary) {
    summary.innerHTML = `<div class="profile-summary-card"><div class="row"><strong>${escapeHtml(selectedUser.name || 'Employee')}</strong><span><i class="profile-color-dot" style="background:${escapeHtml(selectedUser.schedule_color || '#2f6fed')}"></i>${escapeHtml(selectedUser.role || '')}</span></div><span class="muted">${escapeHtml(selectedUser.email || '')} · home station ${escapeHtml(selectedUser.station || 'No station')} · days off ${qty(selectedUser.days_off_remaining || 0)} / ${qty(selectedUser.days_off_allowed || 0)}</span><div class="row"><span class="muted">Qualified: ${escapeHtml(selectedUser.qualified_stations || selectedUser.station || 'not set')}</span><span class="muted">Eligible: ${escapeHtml(selectedUser.eligible_shifts || 'not set')}</span></div><div class="row"><span class="good">${qty(hours.hours)} scheduled hrs</span><span class="${hours.overtime > 0 ? 'warn' : 'muted'}">${qty(hours.overtime)} overtime hrs</span><span class="muted">${hours.shift_count || 0} shift(s)</span></div></div>`;
  }

  const list = $('#teamProfileScheduleBlocks');
  if (list) {
    list.innerHTML = `<h3>Weekly can-work shift patterns</h3>${listLimited(canPatterns.map(a => `<div class="list-item can-work-item"><div class="row"><strong>${formatWeeklyPattern(a)}</strong><span>can work</span></div><span class="muted">Repeats every ${escapeHtml(a.day_name || dayNames[a.day_of_week] || 'week')}</span><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'No weekly can-work shifts saved for this profile.', 3, 'more saved schedule patterns exist for filtering, but the demo only shows a few.')}<h3>Weekly cannot-work shift patterns</h3>${listLimited(offPatterns.map(a => `<div class="list-item unavailable-item"><div class="row"><strong>${formatWeeklyPattern(a)}</strong><span>cannot work</span></div><span class="muted">This label appears on the scheduler every selected week.</span><div class="row"><button class="ghost delete-weekly-availability" data-id="${a.id}">Remove</button></div></div>`), 'No weekly cannot-work shifts saved for this profile.', 3, 'more saved cannot-work patterns exist for conflict checks, but the demo only shows a few.')}<h3>Date-specific vacation / sick / call-off blocks</h3>${listLimited(dateOff.map(a => `<div class="list-item unavailable-item"><div class="row"><strong>${fmtDateTime(a.start_at)} → ${fmtDateTime(a.end_at)}</strong><span>${escapeHtml(a.reason || 'Scheduled off')}</span></div><span class="muted">One-time block from time-off approval or manager entry.</span><div class="row"><button class="ghost delete-availability" data-id="${a.id}">Remove</button></div></div>`), 'No date-specific vacation, sick, call off, or approved time off in this week.', 3, 'more date-specific blocks are saved but hidden from this profile demo view.')}<h3>Assigned shifts</h3>${listLimited(assigned.map(s => `<div class="list-item"><div class="row"><strong>${escapeHtml(s.title)}</strong><span>${escapeHtml(s.status)}</span></div><span class="muted">${escapeHtml(s.station || '')} · ${fmtDateTime(s.start_at)} → ${fmtDateTime(s.end_at)}</span></div>`), 'No shifts assigned to this employee this week.', 3, 'more assigned shifts are saved but hidden from this profile demo view.')}`;
  }
}

function renderSelectedEmployeeSchedulePreview() {
  const box = $('#shiftSelectedEmployeeProfile');
  if (!box) return;
  const selectedId = $('#slotEmployeeSelect')?.value;
  if (!selectedId) {
    box.innerHTML = '<span class="muted">Choose an employee from the filtered list for the selected slot.</span>';
    return;
  }
  const data = state.weekSchedule || state.profileSchedule || { weekly_patterns: [], unavailable: [], hours: [] };
  const selectedUser = userById(selectedId) || {};
  const canPatterns = weeklyPatterns(data, selectedId, 'can_work');
  const offPatterns = weeklyPatterns(data, selectedId, 'cannot_work');
  const dateOff = oneOffBlocks(data, selectedId, 'cannot_work');
  const hours = (data.hours || []).find(h => String(h.user_id) === String(selectedId)) || { hours: 0, overtime: 0 };
  const nextCan = canPatterns.slice(0, 3).map(a => `<li><strong>${formatWeeklyPattern(a)}</strong></li>`).join('');
  const nextOff = offPatterns.slice(0, 3).map(a => `<li><strong>${formatWeeklyPattern(a)}</strong></li>`).join('');
  const dateLabels = dateOff.slice(0, 3).map(a => `<li><strong>${fmtDateTime(a.start_at)} → ${fmtDateTime(a.end_at)}</strong><br><span>${escapeHtml(a.reason || 'Scheduled off')}</span></li>`).join('');
  box.innerHTML = `<div class="profile-preview-head"><strong><i class="profile-color-dot" style="background:${escapeHtml(selectedUser.schedule_color || '#2f6fed')}"></i>${escapeHtml(selectedUser.name || 'Employee')} profile auto-fill</strong><span class="${hours.overtime > 0 ? 'warn' : 'good'}">${qty(hours.hours)} hrs this week${hours.overtime > 0 ? ' · OT ' + qty(hours.overtime) : ''}</span></div><div class="row"><span class="muted">Qualified: ${escapeHtml(selectedUser.qualified_stations || selectedUser.station || 'not set')}</span><span class="muted">Eligible shifts: ${escapeHtml(selectedUser.eligible_shifts || 'not set')}</span></div><div class="profile-preview-grid"><div><h4>Weekly can work</h4><ul>${nextCan || '<li class="muted">No weekly can-work shifts.</li>'}</ul></div><div><h4>Weekly cannot work</h4><ul>${nextOff || '<li class="muted">No weekly cannot-work shifts.</li>'}</ul></div><div><h4>Date-specific time off</h4><ul>${dateLabels || '<li class="muted">No vacation, sick, call off, or approved time-off dates this week.</li>'}</ul></div></div>`;
}

async function saveProfileCanWork(e) {
  e.preventDefault();
  const data = formData(e.target);
  data.user_id = $('#teamProfileUserSelect')?.value || data.user_id || state.user?.id;
  data.status = 'can_work';
  await api('/api/weekly_availability', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Weekly can-work profile shift saved');
  await loadTeamMemberProfiles();
  await loadScheduler().catch(() => {});
}

async function saveProfileCannotWork(e) {
  e.preventDefault();
  const data = formData(e.target);
  data.user_id = $('#teamProfileUserSelect')?.value || data.user_id || state.user?.id;
  const category = data.reason_category || '';
  const detail = data.reason_detail || '';
  data.reason = [category, detail].filter(Boolean).join(detail ? ': ' : '') || data.reason || 'Unavailable';
  data.label = data.reason;
  data.status = 'cannot_work';
  delete data.reason_category;
  delete data.reason_detail;
  await api('/api/weekly_availability', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Weekly cannot-work profile shift saved');
  await loadTeamMemberProfiles();
  await loadScheduler().catch(() => {});
}

async function loadTeam() {
  const [users, posts, notifications, timeOff, grants, messagePerms] = await Promise.all([
    api('/api/users'),
    api('/api/posts'),
    api('/api/notifications'),
    api('/api/time_off'),
    api('/api/access_grants').catch(() => ({ grants: [] })),
    api('/api/message_permissions').catch(() => ({ permissions: [] })),
  ]);
  state.users = users.users || [];
  state.notifications = notifications.notifications || [];
  state.timeOff = timeOff || { profiles: [], requests: [] };
  state.accessGrants = grants.grants || [];
  state.messagePermissions = messagePerms.permissions || [];
  populateSelects();
  renderTimeOffProfileForm();
  renderTimeOff();
  renderMessagePermissionForm();
  setTeamSubpage(state.teamSubpage || 'access');

  $('#teamUsers').innerHTML = listOrEmpty(state.users.map(u => {
    const perms = getUserPermissions(u.id);
    return `<div class="list-item"><div class="row"><strong>${escapeHtml(u.name)}</strong><span><i class="profile-color-dot" style="background:${escapeHtml(u.schedule_color || '#2f6fed')}"></i>${escapeHtml(u.role)}</span></div><span class="muted">${escapeHtml(u.email)} · station ${escapeHtml(u.station || 'none')} · qualified ${escapeHtml(u.qualified_stations || u.station || 'none')}</span><span class="muted">Message/tools: ${escapeHtml(perms.join(', ') || 'generic')}</span></div>`;
  }), 'No team members yet.');

  $('#notificationsList').innerHTML = listOrEmpty(state.notifications.map(n => `<div class="list-item ${n.read_at ? '' : 'unread'}"><div class="row"><strong>${escapeHtml(n.title)}</strong><span>${fmtDateTime(n.created_at)}</span></div><span class="muted">${escapeHtml(n.body)}</span></div>`), 'No notifications yet.');

  $('#accessGrantList').innerHTML = listOrEmpty((state.accessGrants || []).map(g => `<div class="list-item"><div class="row"><strong>${escapeHtml(g.user_name)}</strong><span>${escapeHtml(g.tool)}</span></div><span class="muted">Expires ${fmtDateTime(g.expires_at)} · granted by ${escapeHtml(g.granted_by_name || '')} · ${escapeHtml(g.reason || '')}</span></div>`), 'No active temporary access grants.');

  const allPosts = posts.posts || [];
  const voteTopics = allPosts.filter(p => p.type === 'vote_topic');
  const normalPosts = allPosts.filter(p => p.type !== 'vote_topic');
  $('#postsList').innerHTML = listOrEmpty(normalPosts.map(p => `<div class="list-item"><div class="row"><strong>${escapeHtml(p.title)}</strong><span>${escapeHtml(p.type)} · ${escapeHtml(p.category || p.visibility)}</span></div><p>${escapeHtml(p.body)}</p><span class="muted">By ${escapeHtml(p.author_name)} · ${fmtDateTime(p.created_at)}${p.target_tools ? ' · routed to ' + escapeHtml(p.target_tools) : ''}</span><div class="row"><button class="ghost vote-post" data-id="${p.id}" data-vote="approve">Vote approve</button><button class="ghost vote-post" data-id="${p.id}" data-vote="needs_work">Vote needs work</button><span class="muted">${(p.votes || []).map(v => `${escapeHtml(v.vote)}: ${v.count}`).join(' · ')}</span></div></div>`), 'No posts yet.');

  $('#voteCaptainList').innerHTML = listOrEmpty(voteTopics.filter(p => (p.status || 'pending') === 'pending').map(p => `<div class="list-item"><div class="row"><strong>${escapeHtml(p.title)}</strong><span>pending approval</span></div><p>${escapeHtml(p.body)}</p><span class="muted">By ${escapeHtml(p.author_name)} · ${fmtDateTime(p.created_at)}</span><label>Captain edit note <input class="vote-review-note" data-id="${p.id}" placeholder="Refine the choices or request edits" value="${escapeHtml(p.captain_note || '')}"></label><div class="row"><button class="primary review-vote-topic" data-id="${p.id}" data-status="approved">APPROVE</button><button class="ghost review-vote-topic danger" data-id="${p.id}" data-status="denied">DENY</button></div></div>`), 'No vote topics waiting for captain review.');

  $('#approvedVoteList').innerHTML = listOrEmpty(voteTopics.filter(p => (p.status || '') === 'approved').map(p => `<div class="list-item"><div class="row"><strong>${escapeHtml(p.title)}</strong><span>approved vote</span></div><p>${escapeHtml(p.body)}</p><span class="muted">Allowed voters: ${escapeHtml(p.target_tools || 'all')}</span><div class="row"><button class="ghost vote-post" data-id="${p.id}" data-vote="yes">Vote yes</button><button class="ghost vote-post" data-id="${p.id}" data-vote="no">Vote no</button><button class="ghost vote-post" data-id="${p.id}" data-vote="abstain">Abstain</button><span class="muted">${(p.votes || []).map(v => `${escapeHtml(v.vote)}: ${v.count}`).join(' · ')}</span></div></div>`), 'No approved vote topics yet.');

  await loadTeamMemberProfiles().catch(err => toast(err.message));
  renderMemberHome();
}

function renderTimeOffProfileForm() {
  const form = $('#timeOffProfileForm');
  if (!form) return;
  const selectedId = $('#timeOffProfileUserSelect')?.value || state.user?.id;
  const profile = (state.timeOff.profiles || state.users || []).find(u => String(u.id) === String(selectedId)) || state.user || {};
  form.elements.days_off_allowed.value = profile.days_off_allowed ?? 0;
  form.elements.days_off_remaining.value = profile.days_off_remaining ?? 0;
  form.elements.days_off_reset_date.value = profile.days_off_reset_date || '';
  form.elements.days_off_rollover.value = String(profile.days_off_rollover || 0);
}

function renderTimeOff() {
  const profiles = state.timeOff.profiles || [];
  const requests = state.timeOff.requests || [];
  const profileCards = profiles.map(u => `<div class="list-item"><div class="row"><strong>${escapeHtml(u.name)}</strong><span>${qty(u.days_off_remaining || 0)} days left</span></div><span class="muted">Allowed ${qty(u.days_off_allowed || 0)} · reset ${escapeHtml(u.days_off_reset_date || 'not set')} · ${Number(u.days_off_rollover) ? 'rollover + add days' : 'reset to allowed days'}${u.days_off_last_reset_at ? ' · last reset ' + fmtDateTime(u.days_off_last_reset_at) : ''}</span></div>`).join('');
  const requestCards = requests.map(r => `<div class="list-item"><div class="row"><strong>${escapeHtml(r.user_name)} requested ${qty(r.days_requested)} day(s)</strong><span class="status-pill">${escapeHtml(r.status)}</span></div><span class="muted">${escapeHtml(r.start_date)} → ${escapeHtml(r.end_date)} · ${escapeHtml(r.reason || 'No reason entered')} ${r.decided_by_name ? '· decided by ' + escapeHtml(r.decided_by_name) : ''}</span>${r.status === 'pending' ? `<div class="row"><button class="primary decide-time-off" data-id="${r.id}" data-status="approved">Approve + deduct days</button><button class="ghost decide-time-off" data-id="${r.id}" data-status="declined">Decline</button></div>` : ''}</div>`).join('');
  $('#timeOffList').innerHTML = `<h3>Employee days-off balances</h3>${profileCards || '<div class="empty">No employees yet.</div>'}<h3>Time-off requests</h3>${requestCards || '<div class="empty">No time-off requests yet.</div>'}`;
}

async function calculateTimeOffRequest() {
  const form = $('#timeOffRequestForm');
  const data = formData(form);
  if (!data.start_date || !data.end_date) return toast('Choose first and last day off');
  const result = await api(`/api/time_off/calculate?user_id=${encodeURIComponent(data.user_id || state.user.id)}&start_date=${encodeURIComponent(data.start_date)}&end_date=${encodeURIComponent(data.end_date)}`);
  $('#timeOffCalcResult').innerHTML = `<strong>Requested:</strong> ${qty(result.days_requested)} day(s)<br><strong>Current remaining:</strong> ${qty(result.days_remaining)} day(s)<br><strong>After approval:</strong> <span class="${result.enough_days ? 'good' : 'danger'}">${qty(result.days_after_request)} day(s)</span>`;
  return result;
}

async function saveTimeOffProfile(e) {
  e.preventDefault();
  await api('/api/time_off/profile', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  toast('Employee days-off profile saved');
  await preloadCore();
  await loadTeam();
}

async function submitTimeOffRequest(e) {
  e.preventDefault();
  const result = await calculateTimeOffRequest();
  const res = await api('/api/time_off/request', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  $('#timeOffCalcResult').innerHTML = `<strong>Request submitted:</strong> ${qty(res.days_requested)} day(s). ${res.enough_days ? 'Enough days available if approved.' : 'Warning: request is over current remaining balance.'}`;
  e.target.reset();
  toast('Time-off request submitted');
  await loadTeam();
}

async function decideTimeOffRequest(id, status) {
  await api(`/api/time_off/requests/${id}/decide`, { method: 'POST', body: JSON.stringify({ status }) });
  toast(`Time-off request ${status}`);
  await preloadCore();
  await loadTeam();
  await loadScheduler().catch(() => {});
}


async function switchDemoProfile(e) {
  const email = e.target.value;
  if (!email) return;
  try {
    await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'ChefLedger123!' }) });
    toast('Switched demo profile');
    e.target.value = '';
    state.activeView = 'dashboard';
    await loadSession();
  } catch (err) {
    e.target.value = '';
    toast('Demo profile switch is available only in the packaged demo database.');
  }
}


function addSideOfferGroup() {
  const box = $('#sideOfferExtraGroups');
  if (!box) return;
  state.offerGroupCount = (state.offerGroupCount || 1) + 1;
  const id = state.offerGroupCount;
  const wrap = document.createElement('div');
  wrap.className = 'side-offer-extra-group';
  wrap.innerHTML = `<div class="form-grid"><label>Station group ${id}<select class="side-extra-station"><option value="">Any station</option>${stationNames().map(st => `<option value="${escapeHtml(st)}">${escapeHtml(st)}</option>`).join('')}</select></label><label>Shift group ${id}<select class="side-extra-shift"><option value="">Any shift</option><option>Prep</option><option>Lunch</option><option>Dinner</option><option>Close</option><option>Brunch</option></select></label></div>`;
  box.appendChild(wrap);
}

async function saveSidePanelShiftNote() {
  if (!canWriteSchedule()) return toast('Read-only schedule access: ask a chef/team leader for scheduler-write clearance.');
  const shift = shiftById(state.selectedShiftId);
  if (!shift) return toast('Click a shift first');
  const note = $('#sideShiftNoteText')?.value || '';
  await api(`/api/shifts/${shift.id}`, { method: 'PUT', body: JSON.stringify({ notes: note }) });
  toast('Chef-only shift note saved');
  await loadScheduler();
  openShiftSidePanel(shift.id);
}

async function sendSidePanelOfferShift() {
  if (!canWriteSchedule()) return toast('Read-only schedule access: ask a chef/team leader for scheduler-write clearance.');
  const shift = shiftById(state.selectedShiftId);
  if (!shift) return toast('Click a shift first');
  let userIds = $$('.side-offer-employee-check:checked').map(x => String(x.value));
  if (!userIds.length) {
    const slot = { station: shift.station, shift_label: (shift.title || '').split('—')[0]?.trim() || shift.title, start_at: shift.start_at, end_at: shift.end_at };
    userIds = candidateUsersForSlot(state.weekSchedule || {}, slot, false).map(c => String(c.user.id));
  }
  userIds = [...new Set(userIds)].filter(id => String(id) !== String(shift.assigned_to || ''));
  if (!userIds.length) return toast('No eligible employees found for this offer. Check Employee Profile BUILD availability/stations.');
  const respondBy = $('#sideOfferRespondBy')?.value || '';
  const notePrefix = respondBy ? `Respond by: ${respondBy}\n` : '';
  await api('/api/shifts/offer', { method: 'POST', body: JSON.stringify({
    title: shift.title,
    station: shift.station,
    start_at: String(shift.start_at || '').slice(0, 16),
    end_at: String(shift.end_at || '').slice(0, 16),
    user_ids: userIds,
    notes: `${notePrefix}Offered from side panel for existing shift ${shift.id}. ${$('#sideShiftNoteText')?.value || ''}`.trim(),
    respond_by: respondBy
  })});
  toast('Shift offer sent to eligible employees. Claims will show for the shift captain with each claimant’s hours.');
  await loadScheduler();
  openShiftSidePanel(shift.id);
}

async function editShiftNote(shiftId) {
  if (!isLeader()) return toast('Chef-only notes are visible to team leaders only.');
  const shift = (state.shifts || []).find(s => String(s.id) === String(shiftId));
  if (!shift) return;
  const note = window.prompt(`Chef-only note for ${shift.title}`, shift.notes || '');
  if (note === null) return;
  await api(`/api/shifts/${shiftId}`, { method: 'PUT', body: JSON.stringify({ notes: note }) });
  toast('Shift note saved');
  await loadScheduler();
}


function fmtClockFromDate(value) {
  try {
    const d = new Date(value);
    let h = d.getHours();
    const m = String(d.getMinutes()).padStart(2, '0');
    const ap = h >= 12 ? 'pm' : 'am';
    h = h % 12 || 12;
    return `${h}:${m}${ap}`;
  } catch { return String(value || '').slice(11, 16); }
}

function clipIntervalToRange(interval, startMs, endMs) {
  const s = Math.max(new Date(interval.start_at).getTime(), startMs);
  const e = Math.min(new Date(interval.end_at).getTime(), endMs);
  return e > s ? [s, e] : null;
}

function mergeIntervals(intervals) {
  const sorted = intervals.filter(Boolean).sort((a,b)=>a[0]-b[0]);
  const out = [];
  sorted.forEach(int => {
    if (!out.length || int[0] > out[out.length-1][1]) out.push([...int]);
    else out[out.length-1][1] = Math.max(out[out.length-1][1], int[1]);
  });
  return out;
}

function availabilityDiscrepancyMessages(data, userId, startAt, endAt) {
  const messages = [];
  if (!userId || !startAt || !endAt) return messages;
  let shiftStart, shiftEnd;
  try { shiftStart = new Date(startAt).getTime(); shiftEnd = new Date(endAt).getTime(); } catch { return messages; }
  const canBlocks = (data.available || []).filter(a => String(a.user_id) === String(userId) && String(a.start_at || '').slice(0,10) === String(startAt || '').slice(0,10));
  const unavailableBlocks = (data.unavailable || []).filter(a => String(a.user_id) === String(userId) && timeRangesOverlap(startAt, endAt, a.start_at, a.end_at));
  unavailableBlocks.forEach(b => {
    const s = Math.max(new Date(b.start_at).getTime(), shiftStart);
    const e = Math.min(new Date(b.end_at).getTime(), shiftEnd);
    messages.push({ type: 'unavailable', message: `UNRESOLVED REQUEST OFF ${fmtClockFromDate(s)}–${fmtClockFromDate(e)}: ${b.reason || b.label || 'unavailable'}` });
  });
  if (!canBlocks.length) {
    messages.push({ type: 'no_can_work', message: 'No can-work availability submitted for this employee on this day.' });
    return messages;
  }
  const covered = mergeIntervals(canBlocks.map(b => clipIntervalToRange(b, shiftStart, shiftEnd)));
  const gaps = [];
  let cursor = shiftStart;
  covered.forEach(([s,e]) => {
    if (s > cursor) gaps.push([cursor, s]);
    cursor = Math.max(cursor, e);
  });
  if (cursor < shiftEnd) gaps.push([cursor, shiftEnd]);
  if (gaps.length) {
    const minCan = Math.min(...canBlocks.map(b => new Date(b.start_at).getTime()));
    const maxCan = Math.max(...canBlocks.map(b => new Date(b.end_at).getTime()));
    gaps.forEach(([s,e]) => {
      let label = 'UNABLE TO WORK';
      if (s >= maxCan) label = 'BEYOND THE SHIFT HOURS';
      else if (e <= minCan) label = 'BEFORE EMPLOYEE AVAILABILITY';
      messages.push({ type: 'can_work_gap', message: `${label} ${fmtClockFromDate(s)}–${fmtClockFromDate(e)}` });
    });
  }
  return messages;
}

function playScheduleConflictBeep() {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 740;
    gain.gain.value = 0.04;
    osc.connect(gain); gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => { osc.stop(); ctx.close(); }, 180);
  } catch {}
}

function showScheduleConflictPopup(messages, data) {
  playScheduleConflictBeep();
  document.body.classList.add('schedule-conflict-active');
  setTimeout(() => document.body.classList.remove('schedule-conflict-active'), 1200);
  const existing = $('#scheduleConflictPopup');
  if (existing) existing.remove();
  const box = document.createElement('div');
  box.id = 'scheduleConflictPopup';
  box.className = 'schedule-conflict-popup';
  box.innerHTML = `<div class="modal-card conflict-card"><h2>SCHEDULING CONFLICT</h2><p>${escapeHtml(data.title || 'Selected shift')} cannot be saved without manager override.</p><ul>${messages.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul><div class="row right"><button class="primary" id="closeScheduleConflictPopup" type="button">Review conflict</button></div></div>`;
  document.body.appendChild(box);
  $('#closeScheduleConflictPopup')?.addEventListener('click', () => box.remove());
}

function shiftConflictSummary(data, userId, startAt, endAt) {
  if (!userId || !startAt || !endAt) return [];
  return availabilityDiscrepancyMessages(data, userId, startAt, endAt).map(m => m.message);
}


function timeRangesOverlap(aStart, aEnd, bStart, bEnd) {
  return new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart);
}

function timeRangeCovers(outerStart, outerEnd, innerStart, innerEnd) {
  return new Date(outerStart) <= new Date(innerStart) && new Date(outerEnd) >= new Date(innerEnd);
}

function setupEvents() {
  mountBuildTools();
  $$('#mainNav .menu-trigger').forEach(btn => {
    btn.setAttribute('aria-haspopup', 'true');
    btn.setAttribute('aria-expanded', 'false');
  });
  $$('[data-tabs="authTabs"] button').forEach(btn => btn.addEventListener('click', () => {
    $$('[data-tabs="authTabs"] button').forEach(b => b.classList.toggle('active', b === btn));
    $$('.tab-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === btn.dataset.tab));
  }));
  $('#brandHomeBtn')?.addEventListener('click', async () => {
    state.activeView = 'dashboard';
    if (!state.subpages) state.subpages = {};
    await switchView('dashboard');
    scrollActiveViewTop('dashboard');
  });
  $('#mainNav').addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-view]');
    if (!btn) return;
    const view = btn.dataset.view;
    if (!state.subpages) state.subpages = {};

    const group = btn.closest('.menu-group');
    const isMainMenuTrigger = group && btn.classList.contains('menu-trigger') && !btn.dataset.subpage && !btn.dataset.focus && !btn.dataset.teamSubpage && !btn.dataset.inventoryMenuTab;
    if (isMainMenuTrigger) {
      const wasOpen = group.classList.contains('open');
      $$('#mainNav .menu-group.open').forEach(g => {
        if (g !== group) {
          g.classList.remove('open');
          g.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false');
        }
      });
      group.classList.toggle('open', !wasOpen);
      btn.setAttribute('aria-expanded', String(!wasOpen));
      switchView(view).catch(err => toast(err.message));
      return;
    }

    if (btn.dataset.filesSubpage) {
      state.subpages.files = btn.dataset.filesSubpage;
      $$('#mainNav .menu-group.open').forEach(g => { g.classList.remove('open'); g.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false'); });
      switchView('files').then(() => scrollActiveViewTop('files')).catch(err => toast(err.message));
      return;
    }
    if (btn.dataset.teamSubpage) {
      state.teamSubpage = btn.dataset.teamSubpage;
      state.subpages.team = btn.dataset.teamSubpage;
      $$('#mainNav .menu-group.open').forEach(g => { g.classList.remove('open'); g.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false'); });
      switchView('team').then(() => scrollActiveViewTop('team')).catch(err => toast(err.message));
      return;
    }
    const selectedSubpage = btn.dataset.subpage || btn.dataset.inventoryMenuTab || subpageFromFocus(view, btn.dataset.focus || '');
    if (selectedSubpage) state.subpages[view] = selectedSubpage;
    if (btn.dataset.inventoryMenuTab) state.pendingInventoryTab = btn.dataset.inventoryMenuTab;
    $$('#mainNav .menu-group.open').forEach(g => { g.classList.remove('open'); g.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false'); });
    const isMainNavSubpage = Boolean(btn.closest('#mainNav')) && !btn.classList.contains('menu-trigger');
    switchView(view, isMainNavSubpage ? '' : (btn.dataset.focus || '')).then(() => { if (isMainNavSubpage) scrollActiveViewTop(view); }).catch(err => toast(err.message));
  });
  document.body.addEventListener('click', async (e) => {
    try {
      if (!e.target.closest('#mainNav')) {
        $$('#mainNav .menu-group.open').forEach(g => { g.classList.remove('open'); g.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false'); });
      }
      const tierBtn = e.target.closest('[data-select-subscription-tier]');
      if (tierBtn) {
        const tier = tierBtn.dataset.selectSubscriptionTier;
        const context = tierBtn.dataset.context || 'landing';
        if (context === 'lock') await chooseLockedSubscriptionTier(tier); else selectSubscriptionTier(tier, 'landing');
        return;
      }
      const localActivateBtn = e.target.closest('#activateLocalSubscriptionBtn');
      if (localActivateBtn) { await activateLocalSubscription(); return; }
      const subLogoutBtn = e.target.closest('#subscriptionLogoutBtn');
      if (subLogoutBtn) { await api('/api/auth/logout', { method: 'POST', body: '{}' }); showAuth(); return; }
      const jump = e.target.closest('[data-jump]');
      if (jump) { await switchView(jump.dataset.jump, jump.dataset.focus || ''); return; }
      const filesPrepDay = e.target.closest('[data-files-prep-day]');
      if (filesPrepDay) { await loadFilesPrepSheets(filesPrepDay.dataset.filesPrepDay); return; }
      const subpageBtn = e.target.closest('[data-subpage-select]');
      if (subpageBtn) {
        const bar = subpageBtn.closest('[data-subpage-bar]');
        const view = bar?.dataset?.subpageBar || state.activeView;
        if (!state.subpages) state.subpages = {};
        state.subpages[view] = subpageBtn.dataset.subpageSelect;
        if (view !== state.activeView) await switchView(view); else updateSubpageUI(view);
        scrollActiveViewTop(view);
        return;
      }
      const focusBtn = e.target.closest('[data-focus]:not([data-view])');
      if (focusBtn) { focusElement(focusBtn.dataset.focus); return; }
      const menuBtn = e.target.closest('[data-view][data-focus]');
      if (menuBtn) { await switchView(menuBtn.dataset.view, menuBtn.dataset.focus); return; }

      const saveSlotBtn = e.target.closest('#saveSlotAssignmentBtn');
      if (saveSlotBtn) { await saveSlotAssignment(); return; }
      const offerShiftBtn = e.target.closest('#sendOfferShiftBtn');
      if (offerShiftBtn) { await offerSelectedSlot(); return; }
      const slotMenu = e.target.closest('[data-slot-menu]');
      if (slotMenu) { setSlotPanel(slotMenu.dataset.slotMenu); return; }
      const dayTab = e.target.closest('[data-daytab]');
      if (dayTab) { state.activeScheduleDay = dayTab.dataset.daytab; rerenderSchedulerFilteredViews(); return; }
      const shiftSide = e.target.closest('[data-shift-side-panel]');
      if (shiftSide) { openShiftSidePanel(shiftSide.dataset.shiftSidePanel); return; }
      const closeSide = e.target.closest('#closeShiftSidePanel');
      if (closeSide) { closeShiftSidePanel(); return; }
      const openSideOffer = e.target.closest('#openSideOfferShift');
      if (openSideOffer) { const box = $('#sideOfferBox'); if (box) box.hidden = !box.hidden; return; }
      const addOfferGroup = e.target.closest('#addOfferGroupBtn');
      if (addOfferGroup) { addSideOfferGroup(); return; }
      const saveSideNote = e.target.closest('#saveSideShiftNote');
      if (saveSideNote) { await saveSidePanelShiftNote(); return; }
      const sendSideOffer = e.target.closest('#sendSideOfferShift');
      if (sendSideOffer) { await sendSidePanelOfferShift(); return; }
      const blueprintSlot = e.target.closest('[data-blueprint-slot]');
      if (blueprintSlot) {
        const slot = (state.weekSchedule?.blueprint_slots || []).find(x => String(x.id) === String(blueprintSlot.dataset.blueprintSlot) && String(x.date) === String(blueprintSlot.dataset.day));
        if (slot) { fillShiftFromBlueprint(slot); return; }
      }
      const blackoutSlot = e.target.closest('[data-blackout-day]');
      if (blackoutSlot) { await openBlueprintFromBlackout(blackoutSlot.dataset.blackoutDay, blackoutSlot.dataset.blackoutStart, blackoutSlot.dataset.blackoutEnd); return; }
      const adjustScopeBtn = e.target.closest('[data-blueprint-adjust-scope]');
      if (adjustScopeBtn) {
        const scopeInput = $('#blueprintAdjustScope');
        if (scopeInput) scopeInput.value = adjustScopeBtn.dataset.blueprintAdjustScope;
        $$('[data-blueprint-adjust-scope]').forEach(b => b.classList.toggle('active', b === adjustScopeBtn));
        return;
      }
      const candidateBtn = e.target.closest('[data-candidate-user]');
      if (candidateBtn) {
        const assign = $('#slotEmployeeSelect');
        if (assign) assign.value = candidateBtn.dataset.candidateUser;
        setSlotPanel('employee');
        renderSelectedEmployeeSchedulePreview();
        return;
      }

      const countLocationBtn = e.target.closest('[data-count-location]');
      if (countLocationBtn) { state.countLocation = countLocationBtn.dataset.countLocation || ''; renderCountPage(); return; }
      const prepModeBtn = e.target.closest('[data-prep-mode]');
      if (prepModeBtn) { setPrepMode(prepModeBtn.dataset.prepMode || 'closeout'); return; }
      const removeRow = e.target.closest('.remove-row');
      if (removeRow) { removeRow.closest('.recipe-item-row')?.remove(); return; }
      const removeStep = e.target.closest('.remove-step');
      if (removeStep) { removeStep.closest('.step-row')?.remove(); return; }
      const countBtn = e.target.closest('.count-btn');
      if (countBtn) { await saveCount(countBtn.dataset.id); return; }
      const completeBtn = e.target.closest('.complete-task');
      if (completeBtn) { await completeTask(completeBtn.dataset.id); return; }
      const claimPrepBtn = e.target.closest('.claim-prep-task');
      if (claimPrepBtn) { await claimPrepTask(claimPrepBtn.dataset.id); return; }
      const assignPrepBtn = e.target.closest('.assign-prep-task');
      if (assignPrepBtn) { await assignPrepTaskFromSelect(assignPrepBtn.dataset.id); return; }
      const priorityBtn = e.target.closest('.edit-task-priority');
      if (priorityBtn) { await updateTaskPriority(priorityBtn.dataset.id, priorityBtn.dataset.priority); return; }
      const printOrderBtn = e.target.closest('.print-order');
      if (printOrderBtn) { window.open(`/print/order/${printOrderBtn.dataset.id}.html`, '_blank'); return; }
      const receiveBtn = e.target.closest('.receive-order');
      if (receiveBtn) { await receiveOrder(receiveBtn.dataset.id); return; }
      const claimBtn = e.target.closest('.claim-shift');
      if (claimBtn) { await claimShift(claimBtn.dataset.id); return; }
      const offerMyShiftBtn = e.target.closest('.offer-my-shift');
      if (offerMyShiftBtn) { await offerMyShift(offerMyShiftBtn.dataset.id); return; }
      const respondBtn = e.target.closest('.respond-shift');
      if (respondBtn) { await respondShift(respondBtn.dataset.id, respondBtn.dataset.response); return; }
      const offeredResponseBtn = e.target.closest('.respond-offered-shift');
      if (offeredResponseBtn) { await respondOfferedShift(offeredResponseBtn.dataset.id, offeredResponseBtn.dataset.response); return; }
      const deleteShiftBtn = e.target.closest('.delete-shift');
      if (deleteShiftBtn) { await deleteShift(deleteShiftBtn.dataset.id); return; }
      const deleteAvailabilityBtn = e.target.closest('.delete-availability');
      if (deleteAvailabilityBtn) { await deleteAvailability(deleteAvailabilityBtn.dataset.id); return; }
      const deleteCanWorkBtn = e.target.closest('.delete-canwork');
      if (deleteCanWorkBtn) { await deleteCanWork(deleteCanWorkBtn.dataset.id); return; }
      const deleteWeeklyBtn = e.target.closest('.delete-weekly-availability');
      if (deleteWeeklyBtn) { await deleteWeeklyAvailability(deleteWeeklyBtn.dataset.id); return; }
      const deleteBlueprintBtn = e.target.closest('.delete-blueprint');
      if (deleteBlueprintBtn) { await deleteBlueprint(deleteBlueprintBtn.dataset.id); return; }
      const decideClaimBtn = e.target.closest('.decide-claim');
      if (decideClaimBtn) { await decideClaim(decideClaimBtn.dataset.id, decideClaimBtn.dataset.status); return; }
      const reviewVoteBtn = e.target.closest('.review-vote-topic');
      if (reviewVoteBtn) { await reviewVoteTopic(reviewVoteBtn.dataset.id, reviewVoteBtn.dataset.status); return; }
      const votePostBtn = e.target.closest('.vote-post');
      if (votePostBtn) { await votePost(votePostBtn.dataset.id, votePostBtn.dataset.vote); return; }
      const decideTimeOffBtn = e.target.closest('.decide-time-off');
      if (decideTimeOffBtn) { await decideTimeOffRequest(decideTimeOffBtn.dataset.id, decideTimeOffBtn.dataset.status); return; }
      const deleteGrantBtn = e.target.closest('.delete-access-grant');
      if (deleteGrantBtn) { await deleteAccessGrant(deleteGrantBtn.dataset.id); return; }
    } catch (err) {
      console.error(err);
      toast(err.message || 'That button hit an error.');
    }
  });
  const demoSwitch = $('#demoProfileSwitch');
  if (demoSwitch) demoSwitch.addEventListener('change', switchDemoProfile);
  $('#loginForm').addEventListener('submit', submitAuth('/api/auth/login'));
  $$('.demo-login-option').forEach(btn => btn.addEventListener('click', async () => {
    const email = btn.dataset.demoEmail || 'highvolume@chefledger.test';
    const login = $('#loginForm');
    login.email.value = email;
    login.password.value = 'ChefLedger123!';
    try {
      await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password: 'ChefLedger123!' }) });
      toast(`${btn.textContent.trim()} loaded. Opening the demo restaurant.`);
      state.activeView = 'dashboard';
      await loadSession();
    } catch (err) {
      toast(err.message || 'Demo account could not be loaded.');
    }
  }));
  $('#registerForm').addEventListener('submit', submitAuth('/api/auth/register'));
  $('#joinForm').addEventListener('submit', submitAuth('/api/auth/join'));
  $('#logoutBtn').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST', body: '{}' }); showAuth(); });
  $('#vendorForm').addEventListener('submit', async (e) => { e.preventDefault(); await api('/api/vendors', { method: 'POST', body: JSON.stringify(formData(e.target)) }); e.target.reset(); toast('Vendor saved'); await preloadCore(); await loadInventory(); });
  $('#locationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await api('/api/locations', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    e.target.reset();
    toast('COUNT location saved and added to Inventory Item Builder / COUNT tabs');
    await preloadCore();
    renderLocationBuildList();
    await loadCount().catch(() => {});
  });
  $('#manualInventoryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = formData(e.target);
    if (!data.product_id) return toast('Choose an inventory item');
    await api(`/api/products/${data.product_id}/count`, { method: 'POST', body: JSON.stringify({ quantity: data.quantity, reason: data.reason || 'Manual inventory count' }) });
    toast('Manual inventory saved and live inventory/order math updated');
    await preloadCore();
    await loadBuild();
    await loadInventory().catch(() => {});
  });
  $('#productForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await confirmBuildSubmit(e, 'Inventory Tool'))) return;
    const data = formData(e.target);
    if (data.stock_location_custom) data.stock_location = data.stock_location_custom;
    delete data.stock_location_custom;
    await api('/api/products', { method: 'POST', body: JSON.stringify(data) });
    e.target.reset();
    toast('Inventory item saved and propagated to recipes, stations, plates, prep, and orders');
    await preloadCore();
    await loadInventory();
  });
  $('#stationForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!(await confirmBuildSubmit(e, 'Station Tool'))) return;
    await api('/api/stations', { method: 'POST', body: JSON.stringify(formData(e.target)) });
    e.target.reset();
    toast('Station saved and added to station dropdowns');
    await loadBuild();
  });
  $('#addRecipeItemBtn').addEventListener('click', addRecipeItemRow);
  $('#recipeStepsToggle')?.addEventListener('change', (e) => {
    const on = e.target.checked;
    $('#recipeStepRows').hidden = !on;
    $('#addRecipeStepBtn').hidden = !on;
    if (on && !$('#recipeStepRows').children.length) addRecipeStepRow();
  });
  $('#addRecipeStepBtn')?.addEventListener('click', () => addRecipeStepRow());
  const addDishComponentBtn = $('#addDishComponentBtn');
  if (addDishComponentBtn) addDishComponentBtn.addEventListener('click', addDishComponentRow);
  const dishForm = $('#dishForm');
  if (dishForm) dishForm.addEventListener('submit', saveDish);
  $('#recipeForm').addEventListener('submit', saveRecipe);
  $('#runOptimizerBtn').addEventListener('click', runOptimizer);
  $('#prepSheetForm')?.addEventListener('submit', async (e) => { e.preventDefault(); await api('/api/prep_sheets', { method: 'POST', body: JSON.stringify(formData(e.target)) }); e.target.reset(); toast('Prep sheet created'); await loadPrep(); });
  $('#generatePrepBtn')?.addEventListener('click', generatePrepTask);
  $('#generateStationPrepBtn')?.addEventListener('click', generateStationPrepChecklist);
  $('#closePrepTemplateBtn')?.addEventListener('click', () => { const modal = $('#prepTemplateModal'); if (modal) modal.hidden = true; });
  $('#savePrepTemplateBtn')?.addEventListener('click', savePrepTemplate);
  $('#loadEmployeePrepBtn')?.addEventListener('click', loadEmployeePrepTemplate);
  $('#uploadEmployeePrepBtn')?.addEventListener('click', submitPrepChecklist);
  $('#sendPrepToNextShiftBtn')?.addEventListener('click', sendPrepToNextShift);
  $('#printPrepReviewBtn')?.addEventListener('click', printPrepReview);
  $('#savePrepReviewBtn')?.addEventListener('click', downloadPrepReview);
  $('#refreshPrepBtn')?.addEventListener('click', () => renderPrepSelected());
  $('#refreshClaimPrepBtn')?.addEventListener('click', () => renderPrepSelected());
  $('#prepSheetSelect')?.addEventListener('change', () => renderPrepSelected());
  $('#loadStationCountBtn')?.addEventListener('click', loadStationCountForm);
  $('#stationCountStation')?.addEventListener('change', loadStationCountForm);
  $('#stationCountDate')?.addEventListener('change', loadStationCountForm);
  $('#stationCountService')?.addEventListener('change', loadStationCountForm);
  $('#stationCountForm')?.addEventListener('submit', submitStationCount);
  $('#readyForServiceToggle')?.addEventListener('change', (e) => { state.readyForServiceEnabled = Boolean(e.target.checked); localStorage.setItem('chefLedgerReadyForServiceEnabled', state.readyForServiceEnabled ? 'yes' : 'no'); setPrepMode(state.readyForServiceEnabled ? state.prepMode : 'closeout'); toast(state.readyForServiceEnabled ? 'READY FOR SERVICE tab enabled' : 'READY FOR SERVICE tab hidden'); });
  $('#printPrepBtn')?.addEventListener('click', printPrepReview);
  $('#refreshSuggestionsBtn').addEventListener('click', loadOrders);
  $('#createOrdersBtn').addEventListener('click', createOrders);
  $('#refreshOrderDeadlinesBtn')?.addEventListener('click', loadOrders);
  $('#orderSheetVendorSelect')?.addEventListener('change', (e) => { state.selectedOrderSheetVendor = e.target.value; renderOrderSheetPage(); });
  $('#printOrderSheetPageBtn')?.addEventListener('click', () => window.print());
  $('#downloadOrderSheetPageBtn')?.addEventListener('click', downloadSelectedOrderSheetCsv);
  $('#posImportForm').addEventListener('submit', importPOS);
  $('#saveSlotAssignmentBtn')?.addEventListener('click', saveSlotAssignment);
  $('#sendOfferShiftBtn')?.addEventListener('click', offerSelectedSlot);
  $('#schedulerBlueprintForm')?.addEventListener('submit', saveSchedulerBlueprint);
  $('#employeeScheduleProfileForm')?.addEventListener('submit', saveEmployeeScheduleProfile);
  $('#slotEmployeeSelect')?.addEventListener('change', renderSelectedEmployeeSchedulePreview);
  $('#slotOverrideConflict')?.addEventListener('change', renderSlotCandidates);
  $('#offerShiftMode')?.addEventListener('change', () => $('#offerEmployeeChecks')?.classList.toggle('manual-offer', $('#offerShiftMode')?.value === 'selected'));
  
  $('#availabilityForm')?.addEventListener('submit', saveAvailability);
  $('#myCanWorkForm')?.addEventListener('submit', saveCanWork);
  $('#myCannotWorkForm')?.addEventListener('submit', saveAvailability);
  $('#managerCanWorkForm')?.addEventListener('submit', saveCanWork);
  $('#profileCanWorkForm')?.addEventListener('submit', saveProfileCanWork);
  $('#profileCannotWorkForm')?.addEventListener('submit', saveProfileCannotWork);
  $('#teamProfileUserSelect')?.addEventListener('change', renderTeamMemberProfileSchedule);
  $('#teamProfileWeekStart')?.addEventListener('change', loadTeamMemberProfiles);
  $('#refreshTeamProfileBtn')?.addEventListener('click', loadTeamMemberProfiles);
  $('#refreshHoursBtn')?.addEventListener('click', loadScheduler);
  $('#refreshManagerPreplistBtn')?.addEventListener('click', loadManagerPreplist);
  $('#refreshScheduleBtn')?.addEventListener('click', loadScheduler);
  $('#scheduleWeekStart')?.addEventListener('change', loadScheduler);
  $('#scheduleFilterDay')?.addEventListener('change', handleScheduleFilterChange);
  $('#scheduleFilterWeek')?.addEventListener('change', handleScheduleFilterChange);
  $('#scheduleFilterStation')?.addEventListener('change', handleScheduleFilterChange);
  $('#scheduleFilterEmployee')?.addEventListener('change', handleScheduleFilterChange);
  $('#clearScheduleFilters')?.addEventListener('click', () => {
    state.scheduleFilters = { week: scheduleWeekPresetFromStart($('#scheduleWeekStart')?.value || scheduleWeekStartForPreset('this')), day: '', station: '', employee: '' };
    rerenderSchedulerFilteredViews();
  });
  $('#postScheduleBtn')?.addEventListener('click', postSchedule);
  $('#postScheduleMenuBtn')?.addEventListener('click', postSchedule);
  $('#printWeeklyScheduleBtn')?.addEventListener('click', printWeeklySchedule);
  $('#downloadScheduleCsvBtn')?.addEventListener('click', downloadScheduleCsv);
  $('#inviteForm').addEventListener('submit', createInvite);
  $('#postForm').addEventListener('submit', createPost);
  $('#memberMessageForm')?.addEventListener('submit', createPost);
  $('#messagePermissionForm')?.addEventListener('submit', saveMessagePermissions);
  $('#voteTopicForm')?.addEventListener('submit', createVoteTopic);
  $('#teamSubNav')?.addEventListener('click', (e) => { const btn = e.target.closest('[data-team-subpage]'); if (btn) setTeamSubpage(btn.dataset.teamSubpage); });
  $('#messagePermissionUserSelect')?.addEventListener('change', renderMessagePermissionForm);
  $('#memberHomeUserSelect')?.addEventListener('change', renderMemberHome);
  $('#timeOffProfileForm').addEventListener('submit', saveTimeOffProfile);
  $('#timeOffRequestForm').addEventListener('submit', submitTimeOffRequest);
  $('#calculateTimeOffBtn').addEventListener('click', calculateTimeOffRequest);
  $('#timeOffProfileUserSelect').addEventListener('change', renderTimeOffProfileForm);
  $('#markReadBtn').addEventListener('click', async () => { await api('/api/notifications/read', { method: 'POST', body: '{}' }); toast('Notifications marked read'); await loadSession(); });
  document.querySelectorAll('select[data-menu-select]').forEach(sel => {
    sel.addEventListener('change', async () => {
      const view = sel.dataset.menuSelect;
      state.subpages[view] = sel.value;
      await switchView(view);
    });
  });
  $('#notificationBtn').addEventListener('click', () => switchView('team'));
  $('#exportInventoryBtn')?.addEventListener('click', () => location.href = '/api/export/inventory.csv');
  $('#exportRecipesBtn')?.addEventListener('click', () => location.href = '/api/export/recipes.csv');
  $('#downloadPosExampleBtn')?.addEventListener('click', () => downloadTextFile('chef-ledger-pos-sample.csv', 'date,service_period,recipe,qty\n2026-06-09,dinner,Taco Salad,36\n2026-06-09,lunch,House Shortbread,48'));
  $('#filesVendorSelect')?.addEventListener('change', e => { state.filesVendor = e.target.value; renderFilesVendorSheet(); });
  $('#printFilesPrepBtn')?.addEventListener('click', () => printElementById('filesPrepList', 'Chef Ledger Prep Sheets'));
  $('#downloadFilesPrepBtn')?.addEventListener('click', () => downloadTextFile(`chef-ledger-prep-sheets-${todayInput()}.txt`, $('#filesPrepList')?.innerText || 'No prep sheets loaded'));
  $('#emailFilesPrepBtn')?.addEventListener('click', () => emailReady('Chef Ledger Prep Sheets', $('#filesPrepList')?.innerText || 'No prep sheets loaded'));
  $('#printFilesVendorBtn')?.addEventListener('click', () => printElementById('filesVendorBody', `Chef Ledger Vendor Sheet - ${state.filesVendor || ''}`));
  $('#downloadFilesVendorBtn')?.addEventListener('click', downloadCountVendorCsv);
  $('#emailFilesVendorBtn')?.addEventListener('click', () => emailReady(`Chef Ledger Vendor Sheet - ${state.filesVendor || ''}`, $('#filesVendorBody')?.innerText || 'No vendor sheet loaded'));
  $('#printFilesMenuBtn')?.addEventListener('click', () => printElementById('filesMenuList', 'Chef Ledger Menu Files'));
  $('#printFilesScheduleBtn')?.addEventListener('click', () => printElementById('filesScheduleList', 'Chef Ledger Schedule Files'));
  $('#downloadFilesScheduleBtn')?.addEventListener('click', () => downloadTextFile(`chef-ledger-schedules-${todayInput()}.txt`, $('#filesScheduleList')?.innerText || 'No schedules loaded'));
  $('#filesScheduleWindow')?.addEventListener('change', renderFilesSchedules);
  $('#saveInventorySnapshotBtn')?.addEventListener('click', () => saveFilesInventorySnapshot('inventory'));
  $('#saveCountSnapshotBtn')?.addEventListener('click', () => saveFilesInventorySnapshot('count'));
  $('#deliveriesVendorSelect')?.addEventListener('change', renderFilesDeliveriesWorkspace);
  $('#saveSuggestedDeliveryRecordBtn')?.addEventListener('click', () => saveDeliveryRecord(''));
  $('#downloadFilesMenuCsvBtn')?.addEventListener('click', downloadFilesMenuCsv);
  $('#createRecipeQrBtn')?.addEventListener('click', createRecipeQrCode);
  $('#refreshQrCodesBtn')?.addEventListener('click', async () => { state.filesQr = await api('/api/files/qr_codes'); renderFilesQrWorkspace(); });
  $('#forecasterProfileSelect')?.addEventListener('change', renderForecasterSelectedProfile);
  $('#applyForecasterBtn')?.addEventListener('click', applyForecasterProfile);
  $('#refreshForecasterBtn')?.addEventListener('click', loadForecaster);
  $('#posCsvFileInput')?.addEventListener('change', () => { const files = Array.from($('#posCsvFileInput')?.files || []); const hint = $('#posCsvFileHint'); if (hint) hint.textContent = files.length ? `${files.length} CSV file(s) selected` : 'No CSV selected yet.'; });
  $('#uploadPosCsvFilesBtn')?.addEventListener('click', uploadSelectedPosCsvFiles);
  $('#selectAllPosPlatesBtn')?.addEventListener('click', () => { state.selectedPosPlates = new Set((state.filesPos.plates || []).map(p => p.plate_name)); renderFilesPosWorkspace(); });
  $('#clearPosPlatesBtn')?.addEventListener('click', () => { state.selectedPosPlates = new Set(); renderFilesPosWorkspace(); });
  $('#posPlateSelector')?.addEventListener('change', (e) => { if (!e.target.classList.contains('pos-plate-check')) return; if (!state.selectedPosPlates) state.selectedPosPlates = new Set(); if (e.target.checked) state.selectedPosPlates.add(e.target.value); else state.selectedPosPlates.delete(e.target.value); });
  $('#runPosProjectionBtn')?.addEventListener('click', runPosProjection);
  $('#runPosSpecialBtn')?.addEventListener('click', runPosSpecialStats);
  $('#savePosProjectionProfileBtn')?.addEventListener('click', () => savePosProfile('projection'));
  $('#savePosSpecialProfileBtn')?.addEventListener('click', () => savePosProfile('special'));
  $('#refreshFilesPicturesBtn')?.addEventListener('click', async () => { state.filesPictures = await api('/api/files/pictures'); renderFilesPicturesWorkspace(); });
  $('#addPicturesBtn')?.addEventListener('click', () => $('#pictureUploadInput')?.click());
  $('#pictureUploadInput')?.addEventListener('change', () => { state.pendingPictureFiles = Array.from($('#pictureUploadInput')?.files || []); const hint = $('#pictureUploadHint'); if (hint) hint.textContent = state.pendingPictureFiles.length ? `${state.pendingPictureFiles.length} photo(s) selected. Click MAKE FOLDER to upload.` : 'Click + to add photo(s), then MAKE FOLDER.'; });
  $('#makePictureFolderBtn')?.addEventListener('click', makePictureFolderAndUpload);
  $('#saveSocialLinksBtn')?.addEventListener('click', saveSocialLinks);
  $('#generateSocialPromptBtn')?.addEventListener('click', generateSocialPrompt);
  $('#printInventoryBtn').addEventListener('click', () => window.print());
  
  $('#refreshCountBtn')?.addEventListener('click', loadCount);
  $('#countForecastDays')?.addEventListener('change', loadCount);
  $('#saveCountAreaBtn')?.addEventListener('click', saveCountArea);
  $('#copySuggestedParBtn')?.addEventListener('click', copySuggestedParToOrder);
  $('#fillOrderBtn')?.addEventListener('click', fillOrderFromCount);
  $('#printCountVendorBtn')?.addEventListener('click', () => window.print());
  $('#downloadCountVendorBtn')?.addEventListener('click', downloadCountVendorCsv);
  $('#aggregateCountVendorBtn')?.addEventListener('click', () => { renderCountVendorSheets(); toast('Aggregated vendor order file is shown by vendor below.'); });
  $('#runCountOptimizerBtn')?.addEventListener('click', runCountPriceOptimizer);
  $('#currencySelect')?.addEventListener('change', (event) => {
    state.currency = event.target.value || 'USD';
    localStorage.setItem('chefLedgerCurrency', state.currency);
    rerenderMoneyDisplays();
    toast(`Currency display changed to ${state.currency}. Saved database values remain unchanged.`);
  });
  document.addEventListener('click', async (event) => {
    const deliverySave = event.target.closest('[data-save-delivery-record]');
    if (deliverySave) { await saveDeliveryRecord(deliverySave.dataset.saveDeliveryRecord || ''); return; }
    const undoForecast = event.target.closest('[data-undo-forecast]');
    if (undoForecast) { await undoForecasterEvent(undoForecast.dataset.undoForecast); return; }
    const createAction = event.target.closest('[data-order-create]');
    if (createAction) {
      const vendor = createAction.dataset.vendor || '';
      if (createAction.dataset.orderCreate === 'count') {
        state.subpages.count = 'areas';
        await switchView('count');
        toast(`Review COUNT for ${vendor}.`);
        return;
      }
      if (createAction.dataset.orderCreate === 'sheet') {
        state.selectedOrderSheetVendor = vendor;
        state.subpages.orders = 'order_sheet';
        await switchView('orders');
        renderOrderSheetPage();
        toast(`Order sheet opened for ${vendor}.`);
        return;
      }
    }
    const countNav = event.target.closest('[data-count-nav]');
    if (countNav) {
      state.subpages.count = countNav.dataset.countNav;
      await switchView('count');
      focusElement(countNav.dataset.countNav === 'areas' ? 'countStockAreaCard' : 'countSuggestedParCard');
    }
  });
  document.addEventListener('input', (event) => {
    const orderInput = event.target.closest('[data-count-order]');
    if (orderInput) {
      const productId = orderInput.dataset.countOrder;
      const rowData = (state.countData?.rows || []).find(r => String(r.product_id) === String(productId)) || {};
      const rounded = Math.max(0, Math.round(Number(orderInput.value || 0)));
      orderInput.value = Number.isFinite(rounded) ? rounded : 0;
      state.countOrders[productId] = orderInput.value;
      syncCountOrderInputs(productId, orderInput);
      updateCountRowCalculations(productId);
      updateCountOrderTotals(productId);
      renderCountVendorSheets();
      renderCountOptimizerResult();
    }
    const haveInput = event.target.closest('[data-count-have]');
    if (haveInput) {
      state.countHaves[haveInput.dataset.countHave] = haveInput.value;
      updateCountRowCalculations(haveInput.dataset.countHave);
    }
  });

  $('#refreshInventorySheetBtn')?.addEventListener('click', loadInventory);
  $('#refreshInventoryWatchlistBtn')?.addEventListener('click', loadInventory);
  $('#inventorySheetTabs')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-inventory-tab]');
    if (!btn) return;
    state.inventoryTab = btn.dataset.inventoryTab;
    renderInventorySheetTabs();
    renderInventoryWatchlist();
  });
  $('#printRecipesBtn').addEventListener('click', () => window.print());
  const today = new Date().toISOString().slice(0, 10);
  const prepDateInput = $('input[name="prep_date"]');
  if (prepDateInput) prepDateInput.value = today;
  const weekInput = $('#scheduleWeekStart');
  if (weekInput) weekInput.value = mondayOf(new Date()).toISOString().slice(0, 10);
  const profileWeekInput = $('#teamProfileWeekStart');
  if (profileWeekInput) profileWeekInput.value = mondayOf(new Date()).toISOString().slice(0, 10);
}


function submitAuth(path) {
  return async (e) => {
    e.preventDefault();
    try {
      await api(path, { method: 'POST', body: JSON.stringify(formData(e.target)) });
      toast(path === '/api/auth/register' ? 'Profile created. Choose checkout to activate your subscription.' : 'Welcome to Chef Ledger');
      await loadSession();
    } catch (err) { toast(err.message); }
  };
}

async function saveCount(id) {
  const input = $(`[data-count-input="${id}"]`);
  await api(`/api/products/${id}/count`, { method: 'POST', body: JSON.stringify({ quantity: input.value, reason: 'Stockroom checklist count' }) });
  toast('Inventory count saved');
  await loadInventory();
}

async function saveRecipe(e) {
  e.preventDefault();
  if (!(await confirmBuildSubmit(e, 'Recipe Tool'))) return;
  const data = formData(e.target);
  data.recipe_steps = collectRecipeSteps();
  data.items = $$('#recipeItemRows .recipe-item-row').map(row => {
    const product = findProductBySearch($('[name="product_search"]', row)?.value || '');
    const id = $('[name="product_id"]', row)?.value || product?.id;
    return {
      product_id: id,
      qty: $('[name="qty"]', row).value,
      unit: $('[name="unit"]', row).value,
      prep_note: $('[name="prep_note"]', row).value,
    };
  }).filter(i => i.product_id && Number(i.qty) > 0);
  if (!data.items.length) return toast('Add at least one inventory item to the recipe');
  await api('/api/recipes', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  $('#recipeItemRows').innerHTML = '';
  $('#recipeStepRows').innerHTML = '';
  $('#recipeStepRows').hidden = true;
  $('#addRecipeStepBtn').hidden = true;
  addRecipeItemRow();
  toast('Recipe saved and connected plate costs updated');
  await preloadCore();
  await loadRecipes();
}

async function saveDish(e) {
  e.preventDefault();
  if (!(await confirmBuildSubmit(e, 'Menu Item / Plate Tool'))) return;
  const data = formData(e.target);
  data.components = $$('#dishComponentRows .dish-component-row').map(row => {
    const type = $('[name="component_type"]', row).value;
    const recipe = findRecipeBySearch($('[name="recipe_search"]', row)?.value || '');
    const product = findProductBySearch($('[name="product_search"]', row)?.value || '');
    return {
      component_type: type,
      component_id: type === 'recipe' ? ($('[name="recipe_id"]', row).value || recipe?.id) : ($('[name="product_id"]', row).value || product?.id),
      qty: $('[name="qty"]', row).value,
      unit: $('[name="unit"]', row).value,
      portion_note: $('[name="portion_note"]', row).value,
    };
  }).filter(i => i.component_id && Number(i.qty) > 0);
  if (!data.components.length) return toast('Add at least one recipe or inventory item to the menu item');
  await api('/api/dishes', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  $('#dishComponentRows').innerHTML = '';
  addDishComponentRow();
  toast('Menu item saved and plate-cost analytics updated');
  await preloadCore();
  await loadRecipes();
}

async function runOptimizer() {
  const id = $('#optimizerRecipe').value;
  if (!id) return toast('Select a recipe first');
  const target = $('#optimizerTarget').value;
  const targetType = $('#optimizerType').value;
  const data = await api(`/api/recipes/${id}/cost?target=${encodeURIComponent(target)}&target_type=${encodeURIComponent(targetType)}`);
  const opt = data.optimizer;
  $('#optimizerResult').innerHTML = `<strong>Current recipe cost:</strong> ${money(opt.current_total_cost)}<br><strong>Closest adjusted cost:</strong> ${money(opt.adjusted_total_cost)} · <strong>per plate:</strong> ${money(opt.adjusted_cost_per_plate)}<br><strong>Scale ratio:</strong> ${opt.scale_ratio}<hr>${opt.items.map(i => `<div>${escapeHtml(i.product_name)}: ${qty(i.qty)} ${escapeHtml(i.unit)} → <strong>${qty(i.adjusted_qty)} ${escapeHtml(i.unit)}</strong> (${money(i.adjusted_line_cost)})</div>`).join('')}`;
}

async function generatePrepTask() {
  const sheetId = $('#prepSheetSelect').value;
  const recipeId = $('#prepRecipeSelect').value;
  if (!sheetId || !recipeId) return toast('Select a prep sheet and recipe');
  await api(`/api/prep_sheets/${sheetId}/generate`, { method: 'POST', body: JSON.stringify({ recipe_demands: [{ recipe_id: recipeId, servings: $('#prepExpectedServings').value, due_at: $('#prepDueAt').value, priority: $('#prepPriority').value }] }) });
  toast('Prep task generated from recipe');
  await renderPrepSelected();
}

async function completeTask(id) {
  await api(`/api/prep_tasks/${id}/complete`, { method: 'POST', body: JSON.stringify({}) });
  toast('Task complete. Inventory deducted, IN-USE batch created, and order suggestions updated.');
  await preloadCore();
  await renderPrepSelected();
}

async function updateTaskPriority(id, priority) {
  await api(`/api/prep_tasks/${id}`, { method: 'PUT', body: JSON.stringify({ priority }) });
  toast('Task ranked as needed now');
  await renderPrepSelected();
  await loadManagerPreplist().catch(() => {});
}

async function createOrders() {
  await api('/api/orders/create_from_suggestions', { method: 'POST', body: JSON.stringify({ suggestions: state.suggestions }) });
  toast('Vendor order drafts created');
  await loadOrders();
}

async function receiveOrder(id) {
  await api(`/api/orders/${id}/receive`, { method: 'POST', body: JSON.stringify({}) });
  toast('Order received. Inventory updated.');
  await loadOrders();
}

async function importPOS(e) {
  e.preventDefault();
  const data = formData(e.target);
  const res = await api('/api/files/pos/upload_csv', { method: 'POST', body: JSON.stringify({ filename: `pasted-pos-${todayInput()}.csv`, csv: data.csv || '', notes: 'Pasted from FILES → POS CSV', source_kind: 'pasted_csv' }) });
  state.filesPos = res.workspace || state.filesPos;
  renderFilesPosWorkspace();
  toast(`Scanned pasted POS CSV; imported ${res.imported || 0} matched sales rows`);
  await loadOrders().catch(() => {});
}

async function saveSchedulerBlueprint(e) {
  e.preventDefault();
  if (!(await confirmBuildSubmit(e, 'Schedule BUILD Blueprint'))) return;
  const data = formData(e.target);
  data.action = e.submitter?.dataset?.buildAction || 'submit';
  data.adjust_scope = $('#blueprintAdjustScope')?.value || 'day';
  const select = $('[name="days"]', e.target);
  data.days = select ? Array.from(select.selectedOptions).map(o => o.value) : [];
  await api('/api/scheduler/blueprints', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Schedule BUILD blueprint saved. Needed slots are now grey blocks in the planner.');
  await loadScheduleBlueprintSummary();
  if (state.activeView === 'scheduler') await loadScheduler();
}

async function deleteBlueprint(id) {
  await api(`/api/scheduler/blueprints/${id}/delete`, { method: 'POST', body: '{}' });
  toast('Blueprint slot removed');
  await loadScheduleBlueprintSummary();
  if (state.activeView === 'scheduler') await loadScheduler();
}

async function saveEmployeeScheduleProfile(e) {
  e.preventDefault();
  const data = formData(e.target);
  data.qualified_stations = selectedMultiValues($('#scheduleProfileStationSelect')).join(', ');
  data.eligible_shifts = selectedMultiValues($('#scheduleProfileShiftSelect')).join(', ');
  const userId = data.user_id || $('#teamProfileUserSelect')?.value;
  if (!userId) return toast('Choose an employee profile first');
  await api(`/api/users/${userId}/schedule_profile`, { method: 'POST', body: JSON.stringify(data) });
  toast('Employee schedule BUILD profile saved');
  await preloadCore();
  await loadTeamMemberProfiles();
  await loadScheduler().catch(() => {});
}

function printWeeklySchedule() {
  const weekStart = $('#scheduleWeekStart')?.value || mondayOf(new Date()).toISOString().slice(0, 10);
  window.open(`/print/schedule/${weekStart}.html?start=${encodeURIComponent(weekStart)}`, '_blank');
}

function downloadScheduleCsv() {
  const rows = [['Start','End','Station','Shift','Employee','Status','Notes']];
  (state.weekSchedule?.shifts || []).forEach(s => rows.push([s.start_at || '', s.end_at || '', s.station || '', s.title || '', s.assigned_name || 'Open', s.status || '', s.notes || '']));
  const csv = rows.map(r => r.map(v => `"${String(v).replaceAll('"','""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'chef-ledger-weekly-schedule.csv';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function saveSlotAssignment() {
  if (!canWriteSchedule()) return toast('Read-only schedule access: ask a chef/team leader for scheduler-write clearance.');
  const slot = selectedBlueprintSlot();
  if (!slot) return toast('Click a grey needed shift first');
  const userId = $('#slotEmployeeSelect')?.value || '';
  if (!userId) return toast('Choose an employee for the selected slot');
  const station = $('#slotStationSelect')?.value || slot.station || '';
  const shiftLabel = $('#slotShiftSelect')?.value || slot.shift_label || 'Shift';
  const data = {
    title: `${shiftLabel} — ${station}`,
    station,
    status: 'assigned',
    start_at: String(slot.start_at || '').slice(0, 16),
    end_at: String(slot.end_at || '').slice(0, 16),
    assigned_to: userId,
    notes: $('#slotChefNotes')?.value || '',
    override_conflict: $('#slotOverrideConflict')?.checked ? '1' : ''
  };
  const weekStart = localWeekFromDateInput(data.start_at);
  const schedule = state.weekSchedule?.week_start === weekStart ? state.weekSchedule : await api(`/api/scheduler/week?start=${encodeURIComponent(weekStart)}`);
  const conflicts = shiftConflictSummary(schedule, data.assigned_to, data.start_at, data.end_at);
  const assignedUser = userById(data.assigned_to);
  if (assignedUser && !userMatchesStation(assignedUser, data.station)) conflicts.push('Employee is not qualified for this station');
  if (assignedUser && shiftLabel && !userMatchesShift(assignedUser, shiftLabel)) conflicts.push('Employee is not marked eligible for this shift type');
  if (conflicts.length && data.override_conflict !== '1') {
    showScheduleConflictPopup(conflicts, data);
    return toast('SCHEDULING CONFLICT — review the time-frame discrepancy or check Chef override.');
  }
  if (conflicts.length && data.override_conflict === '1') data.notes = `${data.notes || ''}\nChef override: ${conflicts.join('; ')}`.trim();
  delete data.override_conflict;
  await api('/api/shifts', { method: 'POST', body: JSON.stringify(data) });
  $('#slotChefNotes').value = '';
  toast('Saved. Needed slot moved to Filled Shifts with employee color.');
  await loadScheduler();
}

async function offerSelectedSlot() {
  if (!canWriteSchedule()) return toast('Read-only schedule access: ask a chef/team leader for scheduler-write clearance.');
  const slot = selectedBlueprintSlot();
  if (!slot) return toast('Click a grey needed shift first');
  const mode = $('#offerShiftMode')?.value || 'all';
  let userIds = [];
  if (mode === 'all') userIds = candidateUsersForSlot(state.weekSchedule || {}, slot, false).map(c => String(c.user.id));
  else userIds = $$('.offer-employee-check:checked').map(x => String(x.value));
  userIds = [...new Set(userIds)].filter(Boolean);
  if (!userIds.length) return toast('Choose at least one eligible employee to offer this shift');
  const station = $('#slotStationSelect')?.value || slot.station || '';
  const shiftLabel = $('#slotShiftSelect')?.value || slot.shift_label || 'Shift';
  await api('/api/shifts/offer', { method: 'POST', body: JSON.stringify({
    title: `${shiftLabel} — ${station}`,
    station,
    start_at: String(slot.start_at || '').slice(0, 16),
    end_at: String(slot.end_at || '').slice(0, 16),
    user_ids: userIds,
    notes: $('#slotChefNotes')?.value || '',
    respond_by: $('#sideOfferRespondBy')?.value || ''
  })});
  toast('Shift offered. Employees will see Accept / No, then Awaiting Approval after accepting.');
  await loadScheduler();
}

async function saveShift(e) { e.preventDefault(); return saveSlotAssignment(); }

function localWeekFromDateInput(value) {
  const d = value ? new Date(value) : new Date();
  return mondayOf(d).toISOString().slice(0, 10);
}

async function saveAvailability(e) {
  e.preventDefault();
  const data = formData(e.target);
  data.status = data.status || 'cannot_work';
  data.label = data.reason || data.label || 'Unavailable';
  await api('/api/weekly_availability', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast("Weekly cannot-work shift saved");
  await loadScheduler();
  await loadTeamMemberProfiles().catch(() => {});
}

async function saveCanWork(e) {
  e.preventDefault();
  const data = formData(e.target);
  data.status = data.status || 'can_work';
  await api('/api/weekly_availability', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Weekly can-work shift saved');
  await loadScheduler();
  await loadTeamMemberProfiles().catch(() => {});
}

async function deleteCanWork(id) {
  await api(`/api/available_shifts/${id}`, { method: 'DELETE' });
  toast('Can-work block removed');
  await loadScheduler();
  await loadTeamMemberProfiles().catch(() => {});
}

async function deleteAvailability(id) {
  await api(`/api/availability/${id}`, { method: 'DELETE' });
  toast('Scheduled-off block removed');
  await loadScheduler();
  await loadTeamMemberProfiles().catch(() => {});
}

async function deleteWeeklyAvailability(id) {
  await api(`/api/weekly_availability/${id}`, { method: 'DELETE' });
  toast('Weekly availability pattern removed');
  await loadScheduler();
  await loadTeamMemberProfiles().catch(() => {});
}

async function deleteShift(id) {
  await api(`/api/shifts/${id}`, { method: 'DELETE' });
  toast('Shift deleted');
  await loadScheduler();
}

async function postSchedule() {
  if (!canWriteSchedule()) return toast('Read-only schedule access: ask a chef/team leader for scheduler-write clearance.');
  const weekStart = $('#scheduleWeekStart').value || mondayOf(new Date()).toISOString().slice(0, 10);
  const res = await api('/api/scheduler/publish_week', { method: 'POST', body: JSON.stringify({ week_start: weekStart }) });
  toast(`Weekly schedule posted to team (${res.notified} notification${res.notified === 1 ? '' : 's'})`);
  await loadScheduler();
}

async function respondShift(id, response) {
  await api(`/api/shifts/${id}/respond`, { method: 'POST', body: JSON.stringify({ response }) });
  toast(response === 'accepted' ? 'Shift accepted' : 'Shift declined');
  await loadScheduler();
}

async function claimShift(id) {
  await api(`/api/shifts/${id}/claim`, { method: 'POST', body: JSON.stringify({}) });
  toast('Shift claim submitted to managers');
  await loadScheduler();
}

async function offerMyShift(id) {
  await api(`/api/shifts/${id}/offer_own`, { method: 'POST', body: JSON.stringify({}) });
  toast('Your shift was sent to eligible coworkers. A shift captain must approve any claim before it changes hands.');
  await loadScheduler();
}

async function respondOfferedShift(id, response) {
  await api(`/api/shift_claims/${id}/respond_offer`, { method: 'POST', body: JSON.stringify({ response }) });
  toast(response === 'accepted' ? 'AWAITING APPROVAL' : 'Shift declined');
  await loadScheduler();
}

async function decideClaim(id, status) {
  await api(`/api/shift_claims/${id}/decide`, { method: 'POST', body: JSON.stringify({ status }) });
  toast(`Claim ${status}`);
  await loadScheduler();
}

async function createInvite(e) {
  e.preventDefault();
  const res = await api('/api/invites', { method: 'POST', body: JSON.stringify(formData(e.target)) });
  $('#newInviteCode').innerHTML = `<strong>Give this one-time passcode to the employee:</strong><br><span style="font-size:2rem;color:var(--gold)">${escapeHtml(res.code)}</span><br><span class="muted">Role: ${escapeHtml(res.role)} · Station: ${escapeHtml(res.station || 'Any')}</span>`;
  toast('Passcode created');
}

async function createPost(e) {
  e.preventDefault();
  const data = formData(e.target);
  if (e.target.id === 'memberMessageForm') {
    data.target_user_id = $('#memberMessageTargetUserId')?.value || '';
    data.category = data.category || 'generic';
    data.type = data.type || 'note';
    data.visibility = data.visibility || 'team';
  }
  await api('/api/posts', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Post sent');
  await loadTeam();
}

async function saveMessagePermissions(e) {
  e.preventDefault();
  const user_id = $('#messagePermissionUserSelect')?.value;
  const tools = $$('#messagePermissionTools input[name="tool"]:checked').map(cb => cb.value);
  const notes = $('[name="notes"]', e.target)?.value || '';
  await api('/api/message_permissions', { method: 'POST', body: JSON.stringify({ user_id, tools, notes }) });
  toast('Message eligibility saved');
  await loadTeam();
}

async function createVoteTopic(e) {
  e.preventDefault();
  const data = formData(e.target);
  await api('/api/vote_topics', { method: 'POST', body: JSON.stringify(data) });
  e.target.reset();
  toast('Vote topic sent to captain for review');
  await loadTeam();
}

async function reviewVoteTopic(id, status) {
  const note = $(`.vote-review-note[data-id="${CSS.escape(String(id))}"]`)?.value || '';
  await api(`/api/posts/${id}/review`, { method: 'POST', body: JSON.stringify({ status, captain_note: note }) });
  toast(status === 'approved' ? 'Vote topic approved' : 'Vote topic denied');
  await loadTeam();
}

async function votePost(id, vote) {
  await api(`/api/posts/${id}/vote`, { method: 'POST', body: JSON.stringify({ vote }) });
  toast('Vote saved');
  await loadTeam();
}

let notificationTimer = null;
function startNotificationPolling() {
  if (notificationTimer) clearInterval(notificationTimer);
  notificationTimer = setInterval(async () => {
    if (!state.user) return;
    try {
      const data = await api('/api/session');
      $('#notificationCount').textContent = data.unread_notifications || 0;
    } catch {}
  }, 15000);
}

setupEvents();
loadSubscriptionTiers().finally(() => loadSession().catch(err => { console.error(err); showAuth(); }));
