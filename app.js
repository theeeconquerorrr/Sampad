import products from "./products.json";
import { createCustomerTracking } from "./customer-tracking.js";

const CART_KEY = "pulsedrop-demo-cart";
const ORDERS_KEY = "pulsedrop-demo-orders";
const REMINDERS_KEY = "pulsedrop-demo-refill-reminders";
const ORDER_STEPS = [
  ["placed", "Placed"],
  ["packed", "Packed"],
  ["picked_up", "Picked up"],
  ["delivered", "Delivered"]
];
const tracking = createCustomerTracking();
const byId = id => document.getElementById(id);
let cart = loadCart();
let activeCategory = "All";
let rxAttached = false;
let pendingRxFile = null;
let activeOrderListener = null;
let lastDemoOrderId = null;
const storedRefillReminders = loadStorage(REMINDERS_KEY, []);
let refillReminders = Array.isArray(storedRefillReminders)
  ? storedRefillReminders.filter(reminder => reminder && typeof reminder.orderId === "string" && Number.isFinite(reminder.dueAt))
  : [];
const sessionOrders = [];

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function showNotice(message) {
  const notice = byId("appNotice");
  notice.textContent = message;
  notice.hidden = false;
}

function loadStorage(key, fallback) {
  try {
    const saved = localStorage.getItem(key);
    return saved ? JSON.parse(saved) : fallback;
  } catch (error) {
    console.error(`Could not read ${key} from browser storage.`, error);
    showNotice("Some demo data could not be restored from this browser. You can continue with a fresh session.");
    return fallback;
  }
}

function saveStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.error(`Could not save ${key} to browser storage.`, error);
    showNotice("Your browser could not save this demo data. It may not be available after closing this page.");
  }
}

function loadCart() {
  const saved = loadStorage(CART_KEY, []);
  if (!Array.isArray(saved)) return [];
  return saved.flatMap(entry => {
    if (!entry || typeof entry !== "object") return [];
    const product = products.find(item => item.id === entry.id);
    return product && Number.isSafeInteger(entry.qty) && entry.qty > 0
      ? [{ id: product.id, qty: Math.min(entry.qty, product.quantityLimit) }]
      : [];
  });
}

function productFor(id) {
  return products.find(product => product.id === Number(id));
}

function cartItemFor(id) {
  return cart.find(item => item.id === Number(id));
}

function productVisualFor(product) {
  const palettes = [
    ["#e6eee4", "#44664c", "#e7c68b"],
    ["#e8eff0", "#52777c", "#b9d1da"],
    ["#f3eadc", "#a87150", "#e6c594"],
    ["#eeeae4", "#667d63", "#d0d9c6"]
  ];
  const [background, accent, detail] = palettes[(product.id - 1) % palettes.length];
  const label = escapeHTML(product.name.length > 23 ? `${product.name.slice(0, 20)}…` : product.name);
  let illustration;

  if (product.coldChain) {
    illustration = `
      <g transform="translate(480 112) rotate(29)">
        <rect x="34" y="12" width="56" height="292" rx="28" fill="#f8fbf8" stroke="${accent}" stroke-width="8"/>
        <rect x="41" y="39" width="42" height="60" rx="15" fill="${accent}"/>
        <path d="M62 124v95" stroke="${detail}" stroke-width="7"/>
        <rect x="51" y="232" width="22" height="38" rx="7" fill="${detail}"/>
        <path d="M53 302h18l-9 36z" fill="${accent}"/>
      </g>
      <g transform="translate(561 83)" fill="${accent}" font-family="Arial,sans-serif" font-size="54" font-weight="700">
        <text x="0" y="49">✳</text>
      </g>`;
  } else if (product.name.includes("Strips")) {
    illustration = `
      <g transform="translate(482 120) rotate(7)">
        <rect width="168" height="244" rx="35" fill="${accent}"/>
        <rect x="20" y="24" width="128" height="99" rx="17" fill="#dce8dc"/>
        <path d="M52 81h64" stroke="${accent}" stroke-width="10" stroke-linecap="round"/>
        <circle cx="84" cy="176" r="22" fill="${detail}"/>
        <path d="M73 244h22l-11 38z" fill="#fffdf5"/>
      </g>`;
  } else if (product.name.includes("ORS")) {
    illustration = `
      <g transform="translate(483 115) rotate(-5)">
        <path d="M17 0h151l12 20v260l-12 17H17L4 281V20z" fill="#fff9e8" stroke="${detail}" stroke-width="6"/>
        <path d="M8 32h164v26H8z" fill="${accent}"/>
        <text x="28" y="107" fill="${accent}" font-family="Georgia,serif" font-size="34" font-weight="700">HYDRATE</text>
        <path d="M28 133h109M28 151h82" stroke="${detail}" stroke-width="6" stroke-linecap="round"/>
        <path d="M75 219c0-23 23-42 23-42s23 19 23 42a23 23 0 1 1-46 0z" fill="#b9dadd"/>
      </g>`;
  } else {
    illustration = `
      <g transform="translate(448 126) rotate(7)">
        <rect x="7" y="14" width="188" height="252" rx="12" fill="${accent}"/>
        <path d="M7 38h188v44H7z" fill="${detail}"/>
        <rect x="26" y="108" width="150" height="106" rx="8" fill="#faf8ef"/>
        <path d="M46 177h108" stroke="${accent}" stroke-width="7" stroke-linecap="round"/>
        <path d="M46 193h78" stroke="${detail}" stroke-width="6" stroke-linecap="round"/>
      </g>
      <g transform="translate(514 350) rotate(-22)">
        <rect width="124" height="46" rx="23" fill="${detail}"/>
        <path d="M62 2v42" stroke="#fffaf0" stroke-width="4"/>
      </g>`;
  }

  return `<svg class="product-visual${product.coldChain ? " cold" : ""}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 520" role="img" aria-label="${escapeHTML(product.imageAlt)}">
    <rect width="800" height="520" rx="30" fill="${background}"/>
    <circle cx="147" cy="104" r="116" fill="#fffdf5" opacity=".72"/>
    <circle cx="679" cy="431" r="138" fill="${detail}" opacity=".28"/>
    <ellipse cx="400" cy="419" rx="227" ry="25" fill="#364b3c" opacity=".14"/>
    <g>
      <path d="M187 144h227l39 25v235H187z" fill="#fffdf8"/>
      <path d="M414 144l39 25v235h-39z" fill="${detail}" opacity=".72"/>
      <path d="M187 144h227l39 25H226z" fill="#fff"/>
      <rect x="211" y="183" width="178" height="15" rx="7" fill="${accent}"/>
      <text x="212" y="237" fill="#7b8878" font-family="Arial,sans-serif" font-size="13" font-weight="700" letter-spacing="2">ILLUSTRATIVE DEMO</text>
      <text x="211" y="287" fill="#30483a" font-family="Georgia,serif" font-size="24" font-weight="600">${label}</text>
      <path d="M211 317h155" stroke="${detail}" stroke-width="3"/>
      <text x="211" y="347" fill="#7b8878" font-family="Arial,sans-serif" font-size="12" letter-spacing="1.5">CONCEPT PACKAGING</text>
    </g>
    ${illustration}
    <text x="38" y="480" fill="#71806f" font-family="Arial,sans-serif" font-size="13" letter-spacing="2">PULSE DROP · SAMPLE PRODUCT ART</text>
  </svg>`;
}

function renderProducts() {
  const query = byId("searchInput").value.trim().toLowerCase();
  const type = byId("typeFilter").value;
  const cold = byId("coldFilter").value;
  const sort = byId("sortFilter").value;
  let matches = products.filter(product => {
    const textMatch = `${product.name} ${product.salt} ${product.category}`.toLowerCase().includes(query);
    const categoryMatch = activeCategory === "All" || product.category === activeCategory;
    const typeMatch = type === "all" || (type === "rx" ? product.rx : !product.rx);
    const coldMatch = cold === "all" || (cold === "cold" ? product.coldChain : !product.coldChain);
    return textMatch && categoryMatch && typeMatch && coldMatch;
  });
  if (sort === "price-asc") matches = matches.slice().sort((a, b) => a.price - b.price);
  if (sort === "price-desc") matches = matches.slice().sort((a, b) => b.price - a.price);

  byId("resultCount").textContent = `${matches.length} ${matches.length === 1 ? "item" : "items"}`;
  byId("clearFiltersBtn").hidden = !query && type === "all" && cold === "all" && sort === "default" && activeCategory === "All";

  byId("productGrid").innerHTML = matches.length
    ? matches.map(product => `
      <article class="product-card">
        <div>
          <div class="product-meta"><span class="badge">Example ETA: ${escapeHTML(product.eta)}</span>
            <span class="badges">
              ${product.coldChain ? '<span class="badge badge-cold">Cold-chain</span>' : ""}
              ${product.rx ? '<span class="badge badge-rx">Rx</span>' : ""}
            </span>
          </div>
          ${productVisualFor(product)}
          <h3>${escapeHTML(product.name)}</h3>
          <p>${escapeHTML(product.salt)}</p>
          <p>${escapeHTML(product.pack)} · Limit ${product.quantityLimit}</p>
        </div>
        <div class="product-footer">
          <span class="product-price">₹${product.price}</span>
          <button class="button button-quiet" data-details="${product.id}" type="button">Details</button>
          <button class="button button-primary" data-add="${product.id}" type="button" aria-label="Add ${escapeHTML(product.name)} to cart">Add</button>
        </div>
      </article>
    `).join("")
    : `<div class="empty-state">
        <span class="empty-state-icon" aria-hidden="true">⌕</span>
        <h3>No matching products</h3>
        <p>Try a different search, or clear your filters to see the full catalogue.</p>
        <button class="button button-quiet" data-reset-catalogue type="button">Clear search and filters</button>
      </div>`;
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  const total = cart.reduce((sum, item) => sum + productFor(item.id).price * item.qty, 0);
  const needsRx = cart.some(item => productFor(item.id).rx);
  byId("cartCount").textContent = String(count);
  byId("cartSubtotal").textContent = `₹${total}`;
  byId("checkoutBtn").disabled = count === 0 || (needsRx && !rxAttached);
  byId("checkoutBtn").textContent = `Continue to demo checkout · ₹${total}`;
  byId("rxAlert").hidden = !needsRx || rxAttached;
  byId("cartItems").innerHTML = cart.length
    ? cart.map(item => {
      const product = productFor(item.id);
      return `<div class="cart-item">
        <div><div class="cart-item-name">${escapeHTML(product.name)}</div>
        <div class="cart-item-price">₹${product.price} × ${item.qty}${product.coldChain ? " · Cold-chain" : ""}</div></div>
        <div class="quantity-control">
          <button type="button" data-qty="${product.id}" data-delta="-1" aria-label="Remove one ${escapeHTML(product.name)}">−</button>
          <span aria-live="polite">${item.qty}</span>
          <button type="button" data-qty="${product.id}" data-delta="1" aria-label="Add one ${escapeHTML(product.name)}" ${item.qty >= product.quantityLimit ? "disabled" : ""}>+</button>
        </div>
      </div>`;
    }).join("")
    : '<p class="cart-empty">Your demo cart is empty.</p>';
  saveStorage(CART_KEY, cart);
}

function addToCart(id, amount = 1) {
  const product = productFor(id);
  if (!product || !Number.isSafeInteger(amount) || amount < 1) return;
  const existing = cartItemFor(product.id);
  const nextQuantity = (existing?.qty || 0) + amount;
  if (nextQuantity > product.quantityLimit) {
    showNotice(`The demo quantity limit for ${product.name} is ${product.quantityLimit}.`);
    return;
  }
  if (existing) existing.qty = nextQuantity;
  else cart.push({ id: product.id, qty: amount });
  renderCart();
}

function changeQuantity(id, amount) {
  const item = cartItemFor(id);
  const product = productFor(id);
  if (!item || !product) return;
  item.qty = Math.min(product.quantityLimit, item.qty + amount);
  if (item.qty <= 0) cart = cart.filter(entry => entry.id !== Number(id));
  if (!cart.some(entry => productFor(entry.id).rx)) {
    rxAttached = false;
    pendingRxFile = null;
    byId("rxFileInput").value = "";
    byId("rxFileName").textContent = "No file selected";
  }
  renderCart();
}

function showProductDetails(id) {
  const product = productFor(id);
  if (!product) return;
  byId("productDetailContent").innerHTML = `
    ${productVisualFor(product)}
    <p class="eyebrow">${escapeHTML(product.category)}</p>
    <h2 id="productDialogTitle">${escapeHTML(product.name)}</h2>
    <p class="muted">${escapeHTML(product.salt)}</p>
    <p>${escapeHTML(product.pack)}</p>
    <p>${product.rx ? "Prescription-only example item." : "OTC example item."} ${product.coldChain ? "Illustrative cold-chain handling required." : ""}</p>
    <p>Quantity limit: ${product.quantityLimit} · Example ETA: ${escapeHTML(product.eta)}</p>
    <p class="product-price">₹${product.price}</p>
    <button class="button button-primary button-wide" id="detailAddBtn" type="button">Add to demo cart</button>`;
  byId("productDialog").showModal();
  byId("detailAddBtn").addEventListener("click", () => {
    addToCart(product.id);
    byId("productDialog").close();
  }, { once: true });
}

function setCategory(category) {
  activeCategory = category;
  document.querySelectorAll(".category-button").forEach(button => {
    const selected = button.dataset.cat === category;
    button.classList.toggle("selected", selected);
    button.setAttribute("aria-pressed", String(selected));
  });
  renderProducts();
}

function openDialog(id) {
  const dialog = byId(id);
  if (!dialog.open) dialog.showModal();
}

function closeDialog(id) {
  if (byId(id).open) byId(id).close();
}

function openRxDialog() {
  byId("rxError").hidden = true;
  openDialog("rxDialog");
}

function openCheckout() {
  const needsRx = cart.some(item => productFor(item.id).rx);
  if (!cart.length || (needsRx && !rxAttached)) {
    renderCart();
    return;
  }
  const total = cart.reduce((sum, item) => sum + productFor(item.id).price * item.qty, 0);
  byId("checkoutSummary").innerHTML = `
    ${cart.map(item => `<div class="summary-row"><span>${escapeHTML(productFor(item.id).name)} × ${item.qty}</span><span>₹${productFor(item.id).price * item.qty}</span></div>`).join("")}
    <div class="summary-row summary-total"><span>Illustrative total</span><span>₹${total}</span></div>`;
  closeDialog("cartDialog");
  openDialog("checkoutDialog");
}

function statusIndex(status) {
  return ORDER_STEPS.findIndex(([key]) => key === status);
}

function renderProgress(status) {
  const active = statusIndex(status);
  byId("statusSteps").innerHTML = ORDER_STEPS.map(([key, label], index) =>
    `<li class="${index <= active ? "complete" : ""}" ${index === active ? 'aria-current="step"' : ""}>${label}</li>`
  ).join("");
}

function setMap(lat, lng) {
  const map = byId("trackingMap");
  const pad = 0.02;
  const bounds = [lng - pad, lat - pad, lng + pad, lat + pad].map(value => value.toFixed(5)).join("%2C");
  map.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bounds}&layer=mapnik&marker=${lat}%2C${lng}`;
}

function renderTracking(order, local = false) {
  const status = ORDER_STEPS.some(([key]) => key === order.status) ? order.status : "placed";
  const labels = { placed: "Order placed", packed: "Order packed", picked_up: "Courier picked up the order", delivered: "Order delivered" };
  byId("liveOrderStatus").textContent = labels[status];
  renderProgress(status);
  if (order.tracking && Number.isFinite(order.tracking.lat) && Number.isFinite(order.tracking.lng)) {
    const { lat, lng } = order.tracking;
    byId("liveLocationState").textContent = order.tracking.active ? "Assigned courier is sharing location." : "Showing the last courier location update.";
    byId("liveLocationCoordinates").textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    byId("liveLocationUpdatedAt").textContent = Number.isFinite(order.tracking.updatedAt)
      ? `Last update: ${new Date(order.tracking.updatedAt).toLocaleString()}`
      : "";
    setMap(lat, lng);
  } else {
    byId("liveLocationState").textContent = local
      ? "Local mock order · courier location is not collected. The map below is illustrative."
      : "Waiting for the assigned courier to share a location.";
    byId("liveLocationCoordinates").textContent = "";
    byId("liveLocationUpdatedAt").textContent = "";
    if (local) setMap(12.9716, 77.5946);
  }
  byId("liveTrackingDetails").hidden = false;
}

function trackOrder(orderId) {
  const safeId = orderId.trim();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(safeId)) {
    byId("customerTrackMessage").textContent = "Enter a valid demo order ID.";
    return;
  }
  if (activeOrderListener) activeOrderListener();
  byId("customerOrderId").value = safeId;
  byId("trackingPanel").hidden = false;
  byId("liveTrackingDetails").hidden = true;

  if (tracking.mode === "local") {
    const order = savedOrders().find(entry => entry.id === safeId);
    if (!order) {
      byId("customerTrackMessage").textContent = "That local demo order is not in this browser's history.";
      return;
    }
    renderTracking({ status: order.status || "placed" }, true);
    byId("customerTrackMessage").textContent = "Local demo tracking is ready.";
    return;
  }

  byId("customerTrackMessage").textContent = "Connecting to your order…";
  activeOrderListener = tracking.watchOrder(safeId, order => {
    renderTracking(order);
    byId("customerTrackMessage").textContent = "Order tracking feed connected.";
    const localOrders = loadStorage(ORDERS_KEY, []);
    const found = localOrders.find(entry => entry.id === safeId);
    if (found && found.status !== order.status) {
      found.status = order.status;
      saveStorage(ORDERS_KEY, localOrders);
      renderHistory();
    }
  }, error => {
    console.error("Firebase order tracking failed.", error);
    byId("liveTrackingDetails").hidden = true;
    byId("customerTrackMessage").textContent = "Order status is unavailable. Check the order ID and signed-in customer account.";
  });
}

function showTrackingPanel(orderId = "") {
  byId("trackingPanel").hidden = false;
  if (orderId) byId("customerOrderId").value = orderId;
  byId("trackingPanel").scrollIntoView({ behavior: "smooth", block: "start" });
  if (orderId) trackOrder(orderId);
  else byId("customerOrderId").focus({ preventScroll: true });
}

function savedOrders() {
  const stored = loadStorage(ORDERS_KEY, []);
  const orders = new Map(sessionOrders.map(order => [order.id, order]));
  (Array.isArray(stored) ? stored : [])
    .filter(order => order && typeof order.id === "string")
    .forEach(order => orders.set(order.id, order));
  return [...orders.values()];
}

function renderHistory() {
  const orders = savedOrders().slice().reverse();
  const reminders = Array.isArray(refillReminders) ? refillReminders : [];
  byId("orderHistory").innerHTML = orders.length
    ? orders.map(order => {
      const items = Array.isArray(order.items) ? order.items.filter(item => item && Number.isSafeInteger(item.id)) : [];
      const productNames = items.map(item => productFor(item.id)?.name).filter(Boolean);
      const remindAt = reminders.find(reminder => reminder.orderId === order.id)?.dueAt;
      return `<article class="history-card">
        <h3>Order ${escapeHTML(order.id)}</h3>
        <p>${new Date(order.createdAt).toLocaleString()} · ₹${order.total} · ${escapeHTML(order.status || "placed")}</p>
        <p>${escapeHTML(productNames.join(", ") || "Catalogue items")}</p>
        ${remindAt ? `<p>Refill reminder idea: ${new Date(remindAt).toLocaleDateString()} (stored in this browser)</p>` : ""}
        <div class="history-actions">
          <button class="text-button" type="button" data-reorder="${escapeHTML(order.id)}">Reorder</button>
          <button class="text-button" type="button" data-track="${escapeHTML(order.id)}">Track</button>
          <button class="text-button" type="button" data-remind="${escapeHTML(order.id)}">${remindAt ? "Update refill reminder" : "Set 30-day refill reminder"}</button>
        </div>
      </article>`;
    }).join("")
    : '<p class="muted">No demo orders are saved in this browser yet.</p>';
}

function reorder(orderId) {
  const order = savedOrders().find(entry => entry.id === orderId);
  if (!order) return;
  for (const item of Array.isArray(order.items) ? order.items : []) {
    if (item && Number.isSafeInteger(item.id) && Number.isSafeInteger(item.qty)) addToCart(item.id, item.qty);
  }
  closeDialog("historyDialog");
  openDialog("cartDialog");
}

function saveRefillReminder(orderId) {
  const existing = refillReminders.find(reminder => reminder.orderId === orderId);
  const reminder = { orderId, dueAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  refillReminders = [...refillReminders.filter(entry => entry.orderId !== orderId), existing ? { ...reminder } : reminder];
  saveStorage(REMINDERS_KEY, refillReminders);
  renderHistory();
}

function updateAccountUI(user) {
  const signedIn = Boolean(user);
  byId("accountAuthForms").hidden = signedIn || tracking.mode === "local";
  byId("accountSignedIn").hidden = !signedIn;
  byId("accountSignedInEmail").textContent = user ? user.email || "Customer account" : "";
  byId("accountOpenBtn").textContent = user ? `Hi, ${(user.displayName || user.email || "Account").split(" ")[0]}` : "Sign in";
  if (tracking.mode === "local") {
    byId("accountAuthMessage").textContent = "Customer accounts are not configured. Local demo checkout and tracking work without signing in.";
  } else if (signedIn) {
    byId("accountAuthMessage").textContent = `Signed in as ${user.email || "customer"}.`;
  } else {
    byId("accountAuthMessage").textContent = "Sign in or create a customer account for Firebase order tracking.";
  }
}

function firebaseErrorMessage(error) {
  const messages = {
    "auth/email-already-in-use": "An account already uses this email. Please sign in.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/weak-password": "Choose a password with at least 8 characters.",
    "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Authentication.",
    "auth/unauthorized-domain": "Add this website's domain to Firebase Authentication's authorized domains.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/too-many-requests": "Too many attempts. Please wait and try again.",
    "auth/network-request-failed": "Network error. Check your connection and try again."
  };
  return messages[error.code] || "The account request could not be completed. Please try again.";
}

async function placeOrder(event) {
  event.preventDefault();
  const needsRx = cart.some(item => productFor(item.id).rx);
  if (!cart.length || (needsRx && !rxAttached)) {
    byId("checkoutError").textContent = "Add an item to the cart and attach a demo prescription for Rx items.";
    byId("checkoutError").hidden = false;
    return;
  }
  const submitButton = byId("placeOrderBtn");
  submitButton.disabled = true;
  byId("checkoutError").hidden = true;
  try {
    const orderId = await tracking.createOrder();
    const order = {
      id: orderId,
      createdAt: Date.now(),
      status: "placed",
      total: cart.reduce((sum, item) => sum + productFor(item.id).price * item.qty, 0),
      items: cart.map(item => ({ id: item.id, qty: item.qty }))
    };
    const history = savedOrders();
    history.push(order);
    sessionOrders.push(order);
    saveStorage(ORDERS_KEY, history);
    lastDemoOrderId = orderId;
    cart = [];
    rxAttached = false;
    pendingRxFile = null;
    byId("checkoutForm").reset();
    byId("rxFileInput").value = "";
    renderCart();
    closeDialog("checkoutDialog");
    byId("demoOrderId").textContent = `Tracking order ID: ${orderId}`;
    byId("orderToast").hidden = false;
    renderHistory();
    window.setTimeout(() => { byId("orderToast").hidden = true; }, 12000);
  } catch (error) {
    console.error("Could not create demo tracking order.", error);
    const message = error.code === "auth/unauthenticated"
      ? "Sign in to your customer account before creating a Firebase tracking order."
      : "Could not create the tracking record. Check your Firebase configuration and database rules, then try again.";
    byId("checkoutError").textContent = message;
    byId("checkoutError").hidden = false;
    if (error.code === "auth/unauthenticated") {
      closeDialog("checkoutDialog");
      openDialog("accountDialog");
    }
  } finally {
    submitButton.disabled = false;
  }
}

function bindEvents() {
  byId("searchInput").addEventListener("input", renderProducts);
  ["typeFilter", "coldFilter", "sortFilter"].forEach(id => byId(id).addEventListener("change", renderProducts));
  byId("clearFiltersBtn").addEventListener("click", () => {
    byId("searchInput").value = "";
    byId("typeFilter").value = "all";
    byId("coldFilter").value = "all";
    byId("sortFilter").value = "default";
    setCategory("All");
    byId("searchInput").focus();
  });
  byId("categoryTabs").addEventListener("click", event => {
    const button = event.target.closest("[data-cat]");
    if (button) setCategory(button.dataset.cat);
  });
  byId("productGrid").addEventListener("click", event => {
    const add = event.target.closest("[data-add]");
    const details = event.target.closest("[data-details]");
    const reset = event.target.closest("[data-reset-catalogue]");
    if (add) addToCart(add.dataset.add);
    if (details) showProductDetails(details.dataset.details);
    if (reset) {
      byId("searchInput").value = "";
      byId("typeFilter").value = "all";
      byId("coldFilter").value = "all";
      byId("sortFilter").value = "default";
      setCategory("All");
      byId("searchInput").focus();
    }
  });
  byId("cartItems").addEventListener("click", event => {
    const button = event.target.closest("[data-qty]");
    if (button) changeQuantity(button.dataset.qty, Number(button.dataset.delta));
  });
  byId("cartOpenBtn").addEventListener("click", () => openDialog("cartDialog"));
  byId("checkoutBtn").addEventListener("click", openCheckout);
  byId("backToCartBtn").addEventListener("click", () => {
    closeDialog("checkoutDialog");
    openDialog("cartDialog");
  });
  byId("openRxBtn").addEventListener("click", openRxDialog);
  byId("rxFileInput").addEventListener("change", event => {
    pendingRxFile = event.currentTarget.files?.[0] || null;
    byId("rxFileName").textContent = pendingRxFile ? pendingRxFile.name : "No file selected";
    byId("rxError").hidden = true;
  });
  byId("confirmRxBtn").addEventListener("click", () => {
    const file = pendingRxFile;
    const allowed = file && (file.type === "application/pdf" || file.type.startsWith("image/"));
    if (!allowed || file.size > 10 * 1024 * 1024) {
      byId("rxError").textContent = file?.size > 10 * 1024 * 1024
        ? "Choose a file smaller than 10 MB."
        : "Choose an image or PDF file before continuing.";
      byId("rxError").hidden = false;
      return;
    }
    rxAttached = true;
    closeDialog("rxDialog");
    renderCart();
  });
  byId("accountOpenBtn").addEventListener("click", () => openDialog("accountDialog"));
  byId("accountSignInTab").addEventListener("click", () => {
    byId("accountSignInForm").hidden = false;
    byId("accountSignUpForm").hidden = true;
    byId("accountSignInTab").setAttribute("aria-selected", "true");
    byId("accountSignUpTab").setAttribute("aria-selected", "false");
  });
  byId("accountSignUpTab").addEventListener("click", () => {
    byId("accountSignInForm").hidden = true;
    byId("accountSignUpForm").hidden = false;
    byId("accountSignInTab").setAttribute("aria-selected", "false");
    byId("accountSignUpTab").setAttribute("aria-selected", "true");
  });
  byId("accountSignInForm").addEventListener("submit", async event => {
    event.preventDefault();
    try {
      await tracking.signIn(byId("accountSignInEmail").value.trim(), byId("accountSignInPassword").value);
    } catch (error) {
      console.error("Customer sign-in failed.", error);
      byId("accountAuthMessage").textContent = firebaseErrorMessage(error);
    }
  });
  byId("accountSignUpForm").addEventListener("submit", async event => {
    event.preventDefault();
    const password = byId("accountSignUpPassword").value;
    if (password !== byId("accountConfirmPassword").value) {
      byId("accountAuthMessage").textContent = "The passwords do not match.";
      return;
    }
    try {
      await tracking.signUp(byId("accountSignUpEmail").value.trim(), password, byId("accountName").value.trim());
      byId("accountAuthMessage").textContent = "Account created and signed in.";
      byId("accountSignUpForm").reset();
    } catch (error) {
      console.error("Customer account creation failed.", error);
      byId("accountAuthMessage").textContent = firebaseErrorMessage(error);
    }
  });
  byId("accountSignOutBtn").addEventListener("click", async () => {
    try {
      await tracking.signOut();
      byId("accountSignInPassword").value = "";
    } catch (error) {
      console.error("Customer sign-out failed.", error);
      byId("accountAuthMessage").textContent = "Could not sign out. Please try again.";
    }
  });
  byId("historyOpenBtn").addEventListener("click", () => {
    renderHistory();
    openDialog("historyDialog");
  });
  byId("orderHistory").addEventListener("click", event => {
    const reorderButton = event.target.closest("[data-reorder]");
    const trackButton = event.target.closest("[data-track]");
    const reminderButton = event.target.closest("[data-remind]");
    if (reorderButton) reorder(reorderButton.dataset.reorder);
    if (trackButton) {
      const orderId = trackButton.dataset.track;
      closeDialog("historyDialog");
      showTrackingPanel(orderId);
    }
    if (reminderButton) saveRefillReminder(reminderButton.dataset.remind);
  });
  byId("customerTrackForm").addEventListener("submit", event => {
    event.preventDefault();
    trackOrder(byId("customerOrderId").value);
  });
  byId("trackLatestBtn").addEventListener("click", () => showTrackingPanel(lastDemoOrderId || ""));
  byId("hideTrackingBtn").addEventListener("click", () => {
    if (activeOrderListener) activeOrderListener();
    activeOrderListener = null;
    byId("trackingPanel").hidden = true;
  });
  byId("trackCreatedOrderBtn").addEventListener("click", () => {
    byId("orderToast").hidden = true;
    showTrackingPanel(lastDemoOrderId || "");
  });
  byId("deliveryWindow").addEventListener("change", event => {
    byId("checkoutEstimate").textContent = event.currentTarget.value === "soon"
      ? "Illustrative delivery estimate: 25–40 minutes. Not a real service."
      : "Illustrative delivery estimate: later today. Not a real service.";
  });
  byId("checkoutForm").addEventListener("submit", placeOrder);
  document.querySelectorAll("[data-close]").forEach(button => {
    button.addEventListener("click", () => closeDialog(button.dataset.close));
  });
  document.querySelectorAll("dialog").forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target === dialog) dialog.close();
    });
  });
}

function start() {
  lastDemoOrderId = savedOrders().at(-1)?.id || null;
  bindEvents();
  renderProducts();
  renderCart();
  updateAccountUI(null);
  tracking.onUserChanged((user, error) => {
    updateAccountUI(user);
    if (error) byId("accountAuthMessage").textContent = "Could not check sign-in status. Reload and try again.";
  });
  if (tracking.mode === "local") {
    byId("accountOpenBtn").title = "Optional Firebase accounts are not configured";
  }
  if ("serviceWorker" in navigator && location.protocol !== "file:" && document.querySelector('link[rel="manifest"]')) {
    navigator.serviceWorker.register("./service-worker.js").catch(error => {
      console.error("Could not register the offline service worker.", error);
    });
  }
}

start();
