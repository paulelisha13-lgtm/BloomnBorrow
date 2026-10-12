import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const argument = name => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
const debugOrigin = argument("cdp") || process.env.CDP_ORIGIN || "http://127.0.0.1:9223";
const appOrigin = argument("app") || process.env.APP_ORIGIN || "http://127.0.0.1:4173";
const outputDir = join(tmpdir(), "bloom-borrow-responsive-audit");
const widths = (argument("widths") || "248,320,375,430,768").split(",").map(Number).filter(Number.isFinite);
const height = 900;
const publicRoutes = [
  "/access/login",
  "/shop",
  "/shop/browse",
  "/shop/cart",
  "/shop/checkout",
  "/shop/status",
  "/shop/terms",
  "/shop/privacy"
];
const adminRoutes = [
  "/admin",
  "/admin/inventory",
  "/admin/bookings",
  "/admin/bookings/new",
  "/admin/customers",
  "/admin/payments",
  "/admin/calendar",
  "/admin/reports",
  "/admin/finance/expenses",
  "/admin/finance/profit-loss",
  "/admin/maintenance",
  "/admin/access",
  "/admin/audit",
  "/admin/settings",
  "/admin/account-settings"
];

const target = await fetch(`${debugOrigin}/json/new?${encodeURIComponent(appOrigin)}`, { method: "PUT" }).then(response => response.json());
const socket = new WebSocket(target.webSocketDebuggerUrl);
const pending = new Map();
let sequence = 0;

await new Promise((resolve, reject) => {
  socket.addEventListener("open", resolve, { once: true });
  socket.addEventListener("error", reject, { once: true });
});

socket.addEventListener("message", event => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) reject(new Error(message.error.message));
  else resolve(message.result);
});

function call(method, params = {}) {
  const id = ++sequence;
  socket.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
}

const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));
const evaluate = async expression => {
  const result = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
};

async function navigate(path) {
  await call("Page.navigate", { url: `${appOrigin}${path}` });
  await wait(900);
}

async function setAdmin() {
  await evaluate(`localStorage.setItem("bloom_borrow_user", JSON.stringify({id:1,full_name:"Responsive Test Admin",email:"responsive@example.com",role:"admin"}))`);
}

async function setCart() {
  await evaluate(`localStorage.setItem("bb_customer_cart", JSON.stringify([
    {item_id:90001,name:"Tall portrait wedding backdrop with a deliberately long name",category:"Events",image_url:"",daily_price:1250,security_deposit:500,available_quantity:8,quantity:2},
    {item_id:90002,name:"Complete garden ceremony package",category:"Package",image_url:"",daily_price:2400,security_deposit:800,available_quantity:4,quantity:1}
  ]))`);
}

const auditExpression = `(() => {
  const root = document.documentElement;
  const viewport = root.clientWidth;
  const isClipped = element => {
    for (let parent = element.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
      const style = getComputedStyle(parent);
      if (["auto", "scroll", "hidden", "clip"].includes(style.overflowX)) return true;
    }
    return false;
  };
  const offenders = [...document.querySelectorAll("body *")].flatMap(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const fullyOffscreen = rect.right <= 0 || rect.left >= viewport;
    if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width < 1 || rect.height < 1 || fullyOffscreen || isClipped(element)) return [];
    if (rect.left >= -1 && rect.right <= viewport + 1) return [];
    return [{tag: element.tagName.toLowerCase(), className: String(element.className || "").slice(0, 90), left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width)}];
  }).slice(0, 8);
  const tooSmall = [...document.querySelectorAll("button,a,input,select,textarea")].flatMap(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    const type = String(element.getAttribute("type") || "").toLowerCase();
    const inlineLink = element.tagName === "A" && style.display === "inline";
    const compactNativeControl = element.tagName === "INPUT" && ["checkbox", "radio", "range", "hidden"].includes(type);
    const hidden = style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0 || rect.width < 1 || rect.height < 1 || rect.right <= 0 || rect.left >= viewport;
    if (hidden || inlineLink || compactNativeControl || !(rect.width < 28 || rect.height < 28)) return [];
    return [{tag: element.tagName.toLowerCase(), className: String(element.className || "").slice(0, 80), text: String(element.textContent || element.getAttribute("aria-label") || "").trim().replace(/\\s+/g," ").slice(0, 55), width: Math.round(rect.width), height: Math.round(rect.height)}];
  }).slice(0, 12);
  return {
    title: document.title,
    viewport,
    viewportHeight: window.innerHeight,
    scrollWidth: root.scrollWidth,
    overflow: Math.max(0, root.scrollWidth - viewport),
    offenders,
    tooSmall
  };
})()`;

const dialogExpression = `(() => {
  const dialog = document.querySelector('[role="dialog"], [role="alertdialog"], .shop-detail-modal, .item-form-modal');
  if (!dialog) return null;
  const rect = dialog.getBoundingClientRect();
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight;
  const scrollRegions = [dialog, ...dialog.querySelectorAll('*')].flatMap(element => {
    const style = getComputedStyle(element);
    const scrollable = ["auto", "scroll"].includes(style.overflowY) && element.scrollHeight > element.clientHeight + 1;
    if (!scrollable) return [];
    return [{ className: String(element.className || "").slice(0, 90), clientHeight: element.clientHeight, scrollHeight: element.scrollHeight }];
  }).slice(0, 4);
  return {
    className: String(dialog.className || "").slice(0, 120),
    left: Math.round(rect.left),
    top: Math.round(rect.top),
    right: Math.round(rect.right),
    bottom: Math.round(rect.bottom),
    withinViewport: rect.left >= -1 && rect.top >= -1 && rect.right <= viewportWidth + 1 && rect.bottom <= viewportHeight + 1,
    scrollRegions
  };
})()`;

async function record(results, width, route, state = "page") {
  results.push({ width, route, state, ...(await evaluate(auditExpression)), dialog: await evaluate(dialogExpression) });
}

async function click(selector) {
  return evaluate(`(() => { const element = document.querySelector(${JSON.stringify(selector)}); if (!element) return false; element.click(); return true; })()`);
}

async function clickButton(text) {
  return evaluate(`(() => { const wanted = ${JSON.stringify(text)}; const element = [...document.querySelectorAll("button")].find(button => button.textContent.trim().includes(wanted)); if (!element) return false; element.click(); return true; })()`);
}

async function populateNotificationFixture() {
  return evaluate(`(() => {
    const list = document.querySelector(".notification-list");
    if (!list) return false;
    const count = document.querySelector(".notification-header-copy small");
    if (count) count.textContent = "14 unread";
    const actions = document.querySelector(".notification-header-actions");
    if (actions && !actions.querySelector("button:not(.notification-close)")) {
      const markAll = document.createElement("button");
      markAll.type = "button";
      markAll.textContent = "Mark all read";
      actions.prepend(markAll);
    }
    list.replaceChildren(...Array.from({ length: 14 }, (_, index) => {
      const item = document.createElement("button");
      item.type = "button";
      item.className = "notification-item notif-new";
      const icon = document.createElement("span");
      icon.className = "notification-icon";
      icon.textContent = "B";
      const content = document.createElement("div");
      content.className = "notification-content";
      const title = document.createElement("strong");
      title.textContent = index % 2 ? "Booking updated" : "New rental request";
      const message = document.createElement("p");
      message.textContent = "A deliberately long customer and rental description that must wrap without leaving the mobile panel.";
      const detail = document.createElement("small");
      detail.textContent = "Booking #BB-2026-001 · Review requested today";
      const dot = document.createElement("span");
      dot.className = "notification-dot";
      content.append(title, message, detail);
      item.append(icon, content, dot);
      return item;
    }));
    return true;
  })()`);
}

async function screenshot(name) {
  const capture = await call("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  await writeFile(join(outputDir, `${name}.png`), Buffer.from(capture.data, "base64"));
}

await mkdir(outputDir, { recursive: true });
await call("Page.enable");
await call("Runtime.enable");

const results = [];
for (const width of widths) {
  await call("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });

  await navigate("/shop");
  await setCart();
  for (const route of publicRoutes) {
    await navigate(route);
    await record(results, width, route);
    if ((width === 320 || width === 768) && ["/access/login", "/shop", "/shop/browse", "/shop/checkout"].includes(route)) {
      await screenshot(`${width}-${route.replaceAll("/", "-").replace(/^-+/, "") || "root"}`);
    }
  }

  await navigate("/shop");
  const footerVisible = await evaluate(`(() => {
    const footer = document.querySelector(".shop-footer");
    if (!footer) return false;
    document.documentElement.style.scrollBehavior = "auto";
    footer.scrollIntoView({ block: "start", behavior: "instant" });
    return true;
  })()`);
  if (footerVisible) {
    await wait(150);
    await record(results, width, "/shop", "footer-row");
    if (width === 320 || width === 360 || width === 502 || width === 768) await screenshot(`${width}-shop-footer-row`);
  }

  await navigate("/shop/browse");
  if (await click(".shop-item-card-link")) {
    await wait(250);
    await record(results, width, "/shop/browse", "item-detail-modal");
  }

  await navigate("/shop/checkout");
  const acceptedPrivacy = await evaluate(`(() => {
    const text = document.querySelector(".shop-privacy-text");
    if (!text) return false;
    text.scrollTop = text.scrollHeight;
    text.dispatchEvent(new Event("scroll", { bubbles: true }));
    return true;
  })()`);
  if (acceptedPrivacy) {
    await wait(100);
    await clickButton("I Agree");
    await wait(350);
    await record(results, width, "/shop/checkout", "request-form");
    if (await clickButton("Read rental terms")) {
      await wait(200);
      await record(results, width, "/shop/checkout", "terms-modal");
    }
  }

  for (const route of adminRoutes) {
    await setAdmin();
    await navigate(route);
    await record(results, width, route);
    if ((width === 248 || width === 320 || width === 768) && ["/admin", "/admin/inventory", "/admin/bookings/new", "/admin/calendar", "/admin/access", "/admin/settings"].includes(route)) {
      await screenshot(`${width}-${route.replaceAll("/", "-").replace(/^-+/, "")}`);
    }
  }

  await setAdmin();
  await navigate("/admin/access");
  const accessPolicyVisible = await evaluate(`(() => {
    const policy = document.querySelector(".access-policy-card");
    if (!policy) return false;
    policy.scrollIntoView({ block: "start" });
    return true;
  })()`);
  if (accessPolicyVisible) {
    await wait(150);
    await record(results, width, "/admin/access", "access-policy-row");
    if (width === 248 || width === 320 || width === 768) await screenshot(`${width}-admin-access-policy`);
  }

  await setAdmin();
  await navigate("/admin");
  if (await click(".notification-trigger")) {
    await wait(100);
    await populateNotificationFixture();
    await record(results, width, "/admin", "notification-panel");
    if (width === 248 || width === 320) await screenshot(`${width}-admin-notifications`);
  }


  await setAdmin();
  await navigate("/admin/calendar");
  if (await click(".calendar-toolbar .primary-button")) {
    await wait(200);
    await record(results, width, "/admin/calendar", "entry-modal");
  }

  await navigate("/admin");
  const openedItemForm = await evaluate(`new Promise(resolve => {
    localStorage.setItem("bloom_borrow_user", JSON.stringify({id:1,full_name:"Responsive Test Admin",email:"responsive@example.com",role:"admin"}));
    const findAndOpen = () => {
      const button = [...document.querySelectorAll("button")].find(candidate => candidate.textContent.includes("Add Rental Item"));
      if (!button) return false;
      button.click();
      return true;
    };
    const observer = new MutationObserver(() => {
      if (!findAndOpen()) return;
      observer.disconnect();
      resolve(true);
    });
    observer.observe(document.body, { childList: true, subtree: true });
    history.pushState({}, "", "/admin/inventory");
    window.dispatchEvent(new PopStateEvent("popstate"));
    if (findAndOpen()) { observer.disconnect(); resolve(true); }
    setTimeout(() => { observer.disconnect(); resolve(false); }, 1200);
  })`);
  if (openedItemForm) {
    await wait(200);
    await record(results, width, "/admin/inventory", "item-form-modal");
  }
}

socket.close();
const failures = results.filter(result => result.overflow > 1 || result.offenders.length || result.dialog?.withinViewport === false);
const touchWarnings = results.filter(result => result.tooSmall.length > 0).map(({ width, route, state, tooSmall }) => ({ width, route, state, tooSmall }));
const stateCounts = Object.fromEntries(Object.entries(results.reduce((counts, result) => ({ ...counts, [result.state]: (counts[result.state] || 0) + 1 }), {})).sort());
console.log(JSON.stringify({ outputDir, checked: results.length, stateCounts, failures, touchWarnings }, null, 2));
