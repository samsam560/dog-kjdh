/**
 * 离线自检：用极简 DOM shim 把 lib/client.js 当真实 bundle 跑一遍，验证
 *  ① bundle 语法与 ModuleLoader 注册契约  ② 只 require 宿主提供的 react、其余零依赖
 *  ③ 开场/退场动画各自建树、计时结束后自清理  ④ 退出动画去重（关窗 + before-quit 只播一次）
 *  ⑤ 退出时取消正在播的开场  ⑥ reduced-motion 降级  ⑦ 快捷键与 __dshAnim 编程接口
 *  ⑧ 生成的 SVG 含真实鲸鱼路径、pathLength、clipPath 光扫
 *  ⑨ 5 套动画样式各自成画（data-style / 标志模式 / 环 / 光标 / 网格）
 *  ⑩ 配置钳制与旧版键迁移  ⑪ 设置页面板：slots 注册契约、面板 DOM、控件交互与双向同步
 *
 * 用法：node tools/selftest.mjs
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, "..", "lib", "client.js");
const STORE_KEY = "dsh-open-exit-animation:config";

// ============================== 极简 DOM shim ==============================
const allNodes = [];
const timers = [];
const keyHandlers = [];
let bodyChildren = [];
let reduced = false;

class Style {
	constructor() {
		this.props = {};
	}
	setProperty(name, value) {
		this.props[name] = String(value);
	}
	getPropertyValue(name) {
		return this.props[name] ?? "";
	}
}

/** 直接属性赋值（style.position = ...）也要记录 ⇒ 用 Proxy 把任意属性写收集进 props。 */
function makeStyle() {
	const target = new Style();
	return new Proxy(target, {
		set(t, prop, value) {
			t.props[prop] = String(value);
			return true;
		},
		get(t, prop) {
			return t[prop];
		},
	});
}

class El {
	constructor(tag) {
		this.tagName = String(tag).toUpperCase();
		this.style = makeStyle();
		this.props = {};
		this.attributes = {};
		this.childNodes = [];
		this.parentNode = null;
		this.listeners = {};
		this.textContentValue = "";
		this.innerHTMLValue = "";
		this.id = "";
		this._className = "";
		allNodes.push(this);
	}
	set className(value) {
		this._className = String(value);
	}
	get className() {
		return this._className;
	}
	get offsetWidth() {
		return 1;
	}
	/** 真 DOM 的 HTMLMediaElement.readyState：4 = HAVE_ENOUGH_DATA（首帧已可画）。 */
	get readyState() {
		return this._readyState ?? 4;
	}
	set readyState(value) {
		this._readyState = value;
	}
	get firstChild() {
		return this.childNodes[0] ?? null;
	}
	get lastChild() {
		return this.childNodes[this.childNodes.length - 1] ?? null;
	}
	get children() {
		return this.childNodes;
	}
	setAttribute(name, value) {
		this.attributes[name] = String(value);
	}
	getAttribute(name) {
		return this.attributes[name] ?? null;
	}
	removeEventListener(type, handler) {
		const list = this.listeners[type] ?? [];
		const index = list.indexOf(handler);
		if (index >= 0) list.splice(index, 1);
	}
	/** <video> 专用：播放/加载都当作成功（真实解码失败在测试里用 fire(node,"error") 模拟）。 */
	play() {
		return Promise.resolve();
	}
	load() {}
	appendChild(node) {
		node.parentNode = this;
		this.childNodes.push(node);
		if (this === document.body) bodyChildren = this.childNodes;
		return node;
	}
	removeChild(node) {
		const index = this.childNodes.indexOf(node);
		if (index >= 0) this.childNodes.splice(index, 1);
		node.parentNode = null;
		if (this === document.body) bodyChildren = this.childNodes;
		return node;
	}
	set textContent(value) {
		this.textContentValue = String(value);
		this.childNodes = [];
	}
	get textContent() {
		return this.textContentValue;
	}
	set innerHTML(value) {
		this.innerHTMLValue = String(value);
	}
	get innerHTML() {
		return this.innerHTMLValue;
	}
	addEventListener(type, handler) {
		(this.listeners[type] ??= []).push(handler);
		if (this === document && type === "keydown") keyHandlers.push(handler);
	}
	/** 递归收集整棵子树的 innerHTML + textContent（用于断言画面内容）。 */
	serialize() {
		let out = this.innerHTMLValue + this.textContentValue;
		for (const child of this.childNodes) out += child.serialize();
		return out;
	}
	/** 递归查找第一个匹配 class 的节点。 */
	findByClass(name) {
		const classes = this.className.split(/\s+/);
		if (classes.includes(name)) return this;
		for (const child of this.childNodes) {
			const hit = child.findByClass(name);
			if (hit) return hit;
		}
		return null;
	}
}

const document = {
	head: null,
	body: new El("body"),
	documentElement: new El("html"),
	createElement: (tag) => new El(tag),
	getElementById: (id) => allNodes.find((node) => node.id === id) ?? null,
	addEventListener: (type, handler) => keyHandlers.push(handler),
};
document.head = new El("head");
document.body.appendChild = El.prototype.appendChild.bind(document.body);

const store = new Map();
const localStorage = {
	getItem: (key) => (store.has(key) ? store.get(key) : null),
	setItem: (key, value) => store.set(key, String(value)),
	removeItem: (key) => store.delete(key),
};

const window = {
	__ModuleLoader__: {
		rows: [],
		load(row) {
			this.rows.push(row);
		},
	},
	localStorage,
	document,
	matchMedia: () => ({ matches: reduced }),
	addEventListener: () => {},
	setTimeout: (fn, ms) => {
		timers.push({ fn, ms });
		return timers.length;
	},
	clearTimeout: (id) => {
		if (timers[id - 1]) timers[id - 1].dead = true;
	},
};

// 把 shim 挂到本 realm 的全局上：bundle 顶层用 window.__ModuleLoader__.load(...)，
// 内部用的是裸 setTimeout/clearTimeout ⇒ 必须同时替换 globalThis 上的定时器，测试才能手动 flush。
globalThis.window = window;
globalThis.document = document;
globalThis.localStorage = localStorage;
globalThis.matchMedia = window.matchMedia;
globalThis.setTimeout = window.setTimeout;
globalThis.clearTimeout = window.clearTimeout;

// ---- 内存版 IndexedDB（够跑 hydrate / pick / clear 全路径）+ blob URL + navigator.storage ----
const idbData = new Map();
let blobSeq = 0;
const revokedUrls = [];
function idbRequest() {
	return { result: undefined, error: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null, oncomplete: null, onabort: null };
}
function fakeStore() {
	return {
		get(key) {
			const request = idbRequest();
			queueMicrotask(() => {
				request.result = idbData.get(key);
				if (request.onsuccess) request.onsuccess();
			});
			return request;
		},
		put(value, key) {
			const request = idbRequest();
			queueMicrotask(() => {
				idbData.set(key, value);
				request.result = key;
				if (request.onsuccess) request.onsuccess();
			});
			return request;
		},
		delete(key) {
			const request = idbRequest();
			queueMicrotask(() => {
				idbData.delete(key);
				if (request.onsuccess) request.onsuccess();
			});
			return request;
		},
	};
}
const fakeDb = {
	objectStoreNames: { contains: () => true },
	createObjectStore: () => fakeStore(),
	close() {},
	transaction() {
		const tx = { error: null, oncomplete: null, onerror: null, onabort: null, objectStore: () => fakeStore() };
		// 事务先于请求"完成"：请求自己的微任务更早排队，所以 oncomplete 里 result 已就绪
		queueMicrotask(() => queueMicrotask(() => {
			if (tx.oncomplete) tx.oncomplete();
		}));
		return tx;
	},
};
globalThis.indexedDB = {
	open() {
		const request = idbRequest();
		request.result = fakeDb;
		queueMicrotask(() => {
			if (request.onsuccess) request.onsuccess();
		});
		return request;
	},
};
const fakeNavigator = {
	storage: {
		estimate: () => Promise.resolve({ usage: 4096, quota: 1024 * 1024 * 1024 }),
		persist: () => Promise.resolve(true),
	},
};
Object.defineProperty(globalThis, "navigator", { value: fakeNavigator, configurable: true, writable: true });
window.navigator = fakeNavigator;
Object.defineProperty(globalThis.URL, "createObjectURL", {
	configurable: true,
	writable: true,
	value: () => "blob:fake-" + ++blobSeq,
});
Object.defineProperty(globalThis.URL, "revokeObjectURL", {
	configurable: true,
	writable: true,
	value: (url) => revokedUrls.push(url),
});

function flushTimers(minMs = 0) {
	const pending = timers.splice(0).filter((timer) => !timer.dead);
	for (const timer of pending) {
		if (timer.ms >= minMs) timer.fn();
	}
}
function pendingTimers() {
	return timers.filter((timer) => !timer.dead).length;
}
/** 只冲某一个延时的定时器（别的原样留着）——用来单独观测"首帧守卫"这类中间态。 */
function flushOnly(ms) {
	const pending = timers.splice(0);
	for (const timer of pending) {
		if (timer.dead) continue;
		if (timer.ms === ms) timer.fn();
		else timers.push(timer);
	}
}

// ---- 树查询 / 事件派发助手 ----
function walk(node, visit) {
	visit(node);
	for (const child of node.childNodes) walk(child, visit);
}
function collectByClass(root, name) {
	const out = [];
	walk(root, (node) => {
		if (node.className.split(/\s+/).includes(name)) out.push(node);
	});
	return out;
}
function collectByAttr(root, name, value) {
	const out = [];
	walk(root, (node) => {
		const hit = value === undefined ? node.attributes[name] !== undefined : node.attributes[name] === value;
		if (hit) out.push(node);
	});
	return out;
}
function findByText(root, text) {
	let hit = null;
	walk(root, (node) => {
		if (hit === null && node.textContent === text && node.tagName === "BUTTON") hit = node;
	});
	return hit;
}
function fire(node, type) {
	const handlers = node.listeners[type] ?? [];
	if (handlers.length === 0) throw new Error(`节点没有 ${type} 监听器`);
	for (const handler of handlers) handler({ preventDefault() {}, target: node });
}
function overlayRoots() {
	return document.body.childNodes.filter((node) => node.className.includes("dsa-") || node.className.includes("dsa "));
}
/** IndexedDB / Promise 链要走好几轮微任务，测试里手动推它。 */
async function settleMicrotasks(times = 20) {
	for (let i = 0; i < times; i += 1) await Promise.resolve();
}
/** 定时器可能相互派生（120ms 启动 → 6000ms 收场），多冲几轮才算干净。 */
function drainTimers() {
	for (let i = 0; i < 6; i += 1) flushTimers();
}

// ---- 微型 React（只为把设置页组件真跑起来：createElement / useRef / useEffect） ----
let hookIndex = 0;
let pendingEffects = [];
const microReact = {
	__cleanups: [],
	useRef(initial) {
		const slot = hooks[hookIndex] ?? (hooks[hookIndex] = { current: initial ?? null });
		hookIndex += 1;
		return slot;
	},
	useEffect(fn) {
		pendingEffects.push(fn);
		hookIndex += 1;
	},
	createElement(type, props, ...children) {
		if (typeof type === "function") {
			hookIndex = 0;
			pendingEffects = [];
			const out = type(props || {});
			microReact.__cleanups = pendingEffects.map((fn) => fn());
			return out;
		}
		const node = document.createElement(type);
		if (props && props.className) node.className = props.className;
		if (props && props.ref && typeof props.ref === "object") props.ref.current = node;
		for (const child of children) {
			if (child === null || child === undefined || child === false) continue;
			node.appendChild(child);
		}
		return node;
	},
};
const hooks = [];

// ============================== 加载 bundle ==============================
const results = [];
function check(label, ok, detail = "") {
	results.push({ label, ok: Boolean(ok), detail });
	if (!ok) console.error(`  ✗ ${label} ${detail}`);
}

const source = readFileSync(clientPath, "utf8");
check("bundle 内已无占位符 @@FISH_PATH@@", !source.includes("@@FISH_PATH@@"), "仍为占位符，先跑 tools/fill-fish-path.mjs");
check("bundle 内不含模板字符串（${）", !source.includes("${"), "");

// 语法检查（不执行）
try {
	new Function(source);
	check("bundle 语法可解析", true);
} catch (error) {
	check("bundle 语法可解析", false, String(error));
}

// 真执行顶层（注册工厂）
store.set(STORE_KEY, JSON.stringify({ open: false, exit: true, speed: 1, particles: true }));
new Function(source)();
const rows = window.__ModuleLoader__.rows;
check("注册了一行 __ModuleLoader__.load", rows.length === 1, `rows=${rows.length}`);
const row = rows[0];
check("行 id 正确", row.id === "dsh-open-exit-animation", String(row.id));

const requireCalls = [];
const fakeRequire = (name) => {
	requireCalls.push(name);
	if (name === "react") return microReact;
	throw new Error("bundle 只允许 require react，却 require 了 " + name);
};
const mod = row.factory(fakeRequire);
check("只 require 了宿主提供的 react", requireCalls.length === 1 && requireCalls[0] === "react", JSON.stringify(requireCalls));
check("导出 apply 为函数", typeof mod.apply === "function");
check("导出 inject 为空数组", Array.isArray(mod.inject) && mod.inject.length === 0, JSON.stringify(mod.inject));

// ============================== apply + 钩子 ==============================
const effects = [];
mod.apply({ effect: (cb, label) => effects.push(label) });
check("globalThis.__dshExitAnimation 已挂载", typeof globalThis.__dshExitAnimation === "function");
check("globalThis.__dshAnim 已挂载", typeof globalThis.__dshAnim === "object" && globalThis.__dshAnim !== null);
check("注册了 ctx.effect teardown", effects.length === 1, JSON.stringify(effects));
check("旧版 particles:true 迁移为默认粒子数 26", globalThis.__dshAnim.get().particleCount === 26, String(globalThis.__dshAnim.get().particleCount));
check("配置 open=false 时不自动播开场", document.body.childNodes.length === 0 && pendingTimers() === 0, `children=${document.body.childNodes.length} timers=${pendingTimers()}`);
check("插入了样式元素", document.getElementById("dsh-open-exit-animation-style") !== null);
check("样式表含 5 个样式的专属规则", source.includes(".dsa-style-typewriter") && source.includes(".dsa-style-stardust") && source.includes(".dsa-style-rings"));

// ============================== 开场动画 ==============================
const openPromise = globalThis.__dshAnim.open();
check("开场动画建树到 body", document.body.childNodes.length === 1, `children=${document.body.childNodes.length}`);
const openRoot = document.body.childNodes[0];
check("开场根节点 class 含 dsa / dsa-open", /dsa\b/.test(openRoot.className) && openRoot.className.includes("dsa-open"), openRoot.className);
check("根节点 z-index 内联兜底", openRoot.style.props.zIndex === "2147483000", String(openRoot.style.props.zIndex));
check("根节点 --sp 已按 speed 注入", openRoot.style.getPropertyValue("--sp") === "1", openRoot.style.getPropertyValue("--sp"));
check("根节点 pointer-events:none（不挡操作）", openRoot.style.props.pointerEvents === "none", String(openRoot.style.props.pointerEvents));
check("默认样式为鲸鱼（data-style=whale）", openRoot.getAttribute("data-style") === "whale", String(openRoot.getAttribute("data-style")));

const openSerialized = openRoot.serialize();
check("画面含真实鲸鱼路径（3448 字符那条已被内联）", openSerialized.includes("M13.858") || openSerialized.length > 3000, `len=${openSerialized.length}`);
check("鲸鱼 viewBox 正确", openSerialized.includes('viewBox="0 0 23.16 17.04"'));
check("描边自绘用了 pathLength=1", openSerialized.includes('pathLength="1"'));
check("光扫用了 clipPath", openSerialized.includes("clipPath"));
check("文字含 DeepSeek Harness（逐字 span）", openSerialized.includes("DeepSeek") && openSerialized.includes("Harness"));
check("粒子层 26 个点", openRoot.findByClass("dsa-dots")?.childNodes.length === 26, String(openRoot.findByClass("dsa-dots")?.childNodes.length));
check("副标题文案为启动态", (openRoot.findByClass("dsa-sub")?.textContent ?? "").includes("正在启动"));

// ============================== 退出动画（去重 + 取消开场） ==============================
const exit1 = globalThis.__dshExitAnimation();
check("退出动画建树", document.body.childNodes.length === 1, `children=${document.body.childNodes.length}`);
const exitRoot = document.body.childNodes[0];
check("退出根节点 class 含 dsa-exit", exitRoot.className.includes("dsa-exit"), exitRoot.className);
check("退出动画替换掉了开场（开场节点已移除）", openRoot.parentNode === null);
check("开场 Promise 已 settle（被取消）", await openPromise.then((v) => v === false), "");
const exit2 = globalThis.__dshExitAnimation();
check("重复触发退出返回同一个 Promise（关窗 + before-quit 只播一次）", exit1 === exit2);
check("退出期间 body 只挂一个覆盖层", document.body.childNodes.length === 1, `children=${document.body.childNodes.length}`);
check("退出副标题文案", (exitRoot.findByClass("dsa-sub")?.textContent ?? "").includes("正在退出"));

flushTimers();
check("计时结束后退出层自清理", document.body.childNodes.length === 0, `children=${document.body.childNodes.length}`);
check("退出 Promise resolve 为 true", await exit1.then((v) => v === true), "");
check("退出后可再次播放（flight 已复位）", typeof globalThis.__dshExitAnimation() === "object");
flushTimers();
check("二次退出也清理干净", document.body.childNodes.length === 0);

// ============================== 快捷键 + reduced motion + 配置 ==============================
const before = document.body.childNodes.length;
for (const handler of keyHandlers) {
	handler({ ctrlKey: true, altKey: true, repeat: false, key: "o", preventDefault: () => {} });
}
check("Ctrl+Alt+O 触发开场动画", document.body.childNodes.length === before + 1, `children=${document.body.childNodes.length}`);
flushTimers();
for (const handler of keyHandlers) {
	handler({ ctrlKey: true, altKey: true, repeat: false, key: "x", preventDefault: () => {} });
}
check("Ctrl+Alt+X 触发退场动画", document.body.childNodes.some((n) => n.className.includes("dsa-exit")));
flushTimers();

reduced = true;
const reducedFlight = globalThis.__dshAnim.open();
check("reduced-motion 时降级（dsa-reduced）", document.body.childNodes[0].className.includes("dsa-reduced"));
check("reduced-motion 时不画粒子/装饰", document.body.childNodes[0].findByClass("dsa-dots") === null);
flushTimers();
await reducedFlight;
reduced = false;

const cfg = globalThis.__dshAnim.set({ speed: 2 });
check("配置可写并持久化", JSON.parse(localStorage.getItem(STORE_KEY)).speed === 2, JSON.stringify(cfg));
const fast = globalThis.__dshAnim.open();
check("speed=2 注入 --sp=2", document.body.childNodes[0].style.getPropertyValue("--sp") === "2");
flushTimers();
await fast;
globalThis.__dshAnim.reset();
check("reset 回到默认配置", globalThis.__dshAnim.get().speed === 1);

// ============================== 5 套样式各自成画 ==============================
const styleList = globalThis.__dshAnim.styles();
check("样式清单 5 条且含 id/label/note", styleList.length === 5 && styleList.every((s) => s.id && s.label && s.note), JSON.stringify(styleList.map((s) => s.id)));
for (const style of styleList) {
	globalThis.__dshAnim.set({ style: style.id, particleCount: 8 });
	const flight = globalThis.__dshAnim.open();
	const root = document.body.childNodes[document.body.childNodes.length - 1];
	const html = root.serialize();
	check(`样式 ${style.id}：data-style 正确`, root.getAttribute("data-style") === style.id, String(root.getAttribute("data-style")));
	check(`样式 ${style.id}：根节点带样式 class`, root.className.includes("dsa-style-" + style.id), root.className);
	check(`样式 ${style.id}：粒子数跟随配置（8）`, (root.findByClass("dsa-dots")?.childNodes.length ?? 0) === 8, String(root.findByClass("dsa-dots")?.childNodes.length ?? 0));
	check(`样式 ${style.id}：时间线缩放 --k 已注入`, root.style.getPropertyValue("--k") !== "", root.style.getPropertyValue("--k"));
	if (style.id === "whale") {
		check("样式 whale：填充 + 光扫 + 描边齐备", html.includes("dsa-whale-fill") && html.includes("dsa-sheen") && html.includes("dsa-whale-line"));
		check("样式 whale：无扩散环", root.findByClass("dsa-ring") === null);
	} else if (style.id === "pulse") {
		check("样式 pulse：实心鲸鱼无描边/光扫", html.includes("dsa-whale-fill") && !html.includes("dsa-whale-line") && !html.includes("dsa-sheen"));
		check("样式 pulse：3 个扩散环", collectByClass(root, "dsa-ring").length === 3, String(collectByClass(root, "dsa-ring").length));
	} else if (style.id === "stardust") {
		check("样式 stardust：无鲸鱼标志", !html.includes("dsa-whale"));
		check("样式 stardust：有中心核", root.findByClass("dsa-core") !== null);
	} else if (style.id === "typewriter") {
		check("样式 typewriter：无鲸鱼、有光标与扫描线", !html.includes("dsa-whale") && root.findByClass("dsa-cursor") !== null && root.findByClass("dsa-scan") !== null);
		check("样式 typewriter：无进度条", root.findByClass("dsa-bar") === null);
	} else if (style.id === "rings") {
		check("样式 rings：只用描边鲸鱼", html.includes("dsa-whale-line") && !html.includes("dsa-whale-fill"));
		check("样式 rings：有网格与 3 个环", root.findByClass("dsa-grid") !== null && collectByClass(root, "dsa-ring").length === 3);
	}
	flushTimers();
	await flight;
}
check("样式试播后 body 干净", document.body.childNodes.length === 0, `children=${document.body.childNodes.length}`);

const overrideFlight = globalThis.__dshAnim.open("typewriter");
check("play(kind, force, style) 支持一次性样式覆盖", document.body.childNodes[0].getAttribute("data-style") === "typewriter");
check("一次性覆盖不写回配置", globalThis.__dshAnim.get().style === "rings", globalThis.__dshAnim.get().style);
flushTimers();
await overrideFlight;

// ============================== 配置钳制与迁移 ==============================
check("speed 上限钳制到 3", globalThis.__dshAnim.set({ speed: 9 }).speed === 3);
check("speed 下限钳制到 0.5", globalThis.__dshAnim.set({ speed: 0.01 }).speed === 0.5);
check("粒子数上限钳制到 60", globalThis.__dshAnim.set({ particleCount: 999 }).particleCount === 60);
check("粒子数下限钳制到 0", globalThis.__dshAnim.set({ particleCount: -5 }).particleCount === 0);
check("未知样式回落到 whale", globalThis.__dshAnim.set({ style: "nope" }).style === "whale");
check("非法主色回落为空（用默认调色板）", globalThis.__dshAnim.set({ accent: "red" }).accent === "");
check("空白文案回落到默认", globalThis.__dshAnim.set({ word: "   " }).word === "DeepSeek Harness");
localStorage.setItem(STORE_KEY, JSON.stringify({ particles: false }));
check("旧版 particles:false 迁移为 0 粒子", globalThis.__dshAnim.get().particleCount === 0, String(globalThis.__dshAnim.get().particleCount));
globalThis.__dshAnim.reset();

const accentFlight = globalThis.__dshAnim.open();
globalThis.__dshAnim.set({ accent: "#12b886" });
flushTimers();
await accentFlight;
const accentRoot = (() => {
	globalThis.__dshAnim.set({ accent: "#12b886" });
	const flight = globalThis.__dshAnim.open();
	const root = document.body.childNodes[document.body.childNodes.length - 1];
	check("主色注入 --ac", root.style.getPropertyValue("--ac") === "#12b886", root.style.getPropertyValue("--ac"));
	check("主色派生出 --ac2（更亮）", root.style.getPropertyValue("--ac2") !== "" && root.style.getPropertyValue("--ac2") !== "#12b886", root.style.getPropertyValue("--ac2"));
	flushTimers();
	return { flight, root };
})();
await accentRoot.flight;
globalThis.__dshAnim.reset();

// ============================== 设置页面板 ==============================
const injectedSlots = [];
const injectedDeps = [];
const registered = [];
const panelEffects = [];
const fakeSlots = {
	inject(name, callback) {
		injectedSlots.push(name);
		return callback();
	},
	register(meta, component) {
		registered.push({ meta, component });
		return () => {};
	},
};
mod.apply({
	effect: (cb, label) => {
		panelEffects.push(label);
		return cb();
	},
	inject: (deps, cb) => {
		injectedDeps.push(deps);
		// 真实 scoped ctx 也带 effect：注册应包在 effect 里随 fiber 卸载
		cb({
			slots: fakeSlots,
			effect: (inner, innerLabel) => {
				panelEffects.push(innerLabel);
				return inner();
			},
		});
	},
});
check("面板注册走动态 inject([\"slots\"])（不阻塞动画）", injectedDeps.length === 1 && JSON.stringify(injectedDeps[0]) === '["slots"]', JSON.stringify(injectedDeps));
check("注册进 settings.section 槽", injectedSlots.length === 1 && injectedSlots[0] === "settings.section", JSON.stringify(injectedSlots));
check("注册了 1 个设置页 section", registered.length === 1, `n=${registered.length}`);
const meta = registered[0]?.meta ?? {};
check("section meta：name/id/order 正确", meta.name === "settings.section" && meta.id === "open-exit-animation" && meta.order === 600, JSON.stringify(meta));
check("section label 是 thunk 且返回「开关动画」", typeof meta.label === "function" && meta.label() === "开关动画", String(meta.label && meta.label()));
check("section 组件是函数", typeof registered[0]?.component === "function");
check("注册流程进了 ctx.effect（可随 fiber 卸载）", panelEffects.includes("dsh-open-exit-animation: settings section"), JSON.stringify(panelEffects));

const panelHost = registered[0].component();
check("组件返回容器节点 dsa-panel-host", panelHost?.className === "dsa-panel-host", String(panelHost?.className));
check("useEffect 把面板挂进了容器", panelHost?.findByClass("dsa-panel") !== null);
check("effect 返回了清理函数", microReact.__cleanups.length === 1 && typeof microReact.__cleanups[0] === "function");

const styleCards = collectByAttr(panelHost, "data-style-id");
const fields = collectByAttr(panelHost, "data-field");
const ranges = collectByClass(panelHost, "dsa-range");
const swatches = collectByAttr(panelHost, "data-accent");
check("面板：5 张样式卡", styleCards.length === 5, String(styleCards.length));
check("面板：3 个文案输入框", fields.length === 3, String(fields.length));
check("面板：3 个滑条（速度 / 粒子 / 素材最长播放）", ranges.length === 3, String(ranges.length));
check("面板：7 个主色块（含默认）", swatches.length === 7, String(swatches.length));
check("面板：有 JSON 配置回显", panelHost.findByClass("dsa-json") !== null);
check("面板：当前样式被标记为选中", collectByClass(panelHost, "dsa-style").some((node) => node.className.includes("on")));

// 点样式卡：立刻试播 + 写入配置
const typewriterCard = styleCards.find((node) => node.attributes["data-style-id"] === "typewriter");
fire(typewriterCard, "click");
check("点样式卡：配置切到 typewriter", globalThis.__dshAnim.get().style === "typewriter", globalThis.__dshAnim.get().style);
check("点样式卡：带上了该样式的推荐粒子数", globalThis.__dshAnim.get().particleCount === 0, String(globalThis.__dshAnim.get().particleCount));
check("点样式卡：立刻试播了该样式", document.body.childNodes.some((n) => n.getAttribute("data-style") === "typewriter"));
flushTimers();

// 开关 pill
const openPill = collectByClass(panelHost, "dsa-pill")[0];
const openBefore = globalThis.__dshAnim.get().open;
fire(openPill, "click");
check("点开关：开场动画开关翻转", globalThis.__dshAnim.get().open === !openBefore);
check("点开关：pill 文案同步", openPill.textContent === (openBefore ? "已关闭" : "已开启"), openPill.textContent);
globalThis.__dshAnim.set({ open: openBefore });

// 速度滑条
const speedRange = ranges[0];
speedRange.value = "2.4";
fire(speedRange, "input");
check("拉速度滑条：写入 2.4", globalThis.__dshAnim.get().speed === 2.4, String(globalThis.__dshAnim.get().speed));
check("拉速度滑条：数值回显 2.4×", collectByClass(panelHost, "dsa-num")[0].textContent === "2.4×", collectByClass(panelHost, "dsa-num")[0].textContent);

// 粒子滑条
const dotsRange = ranges[1];
dotsRange.value = "0";
fire(dotsRange, "input");
check("拉粒子滑条：写入 0", globalThis.__dshAnim.get().particleCount === 0);
check("拉粒子滑条：数值回显关闭", collectByClass(panelHost, "dsa-num")[1].textContent === "关闭", collectByClass(panelHost, "dsa-num")[1].textContent);
const noDotsFlight = globalThis.__dshAnim.open();
check("粒子数 0 时画面无粒子层", document.body.childNodes[0].findByClass("dsa-dots") === null);
flushTimers();
await noDotsFlight;

// 主色块
const greenSwatch = swatches.find((node) => node.attributes["data-accent"] === "#12b886");
fire(greenSwatch, "click");
check("点主色块：写入 accent", globalThis.__dshAnim.get().accent === "#12b886", globalThis.__dshAnim.get().accent);
check("点主色块：色块被标记选中", greenSwatch.className.includes("on"), greenSwatch.className);

// 文案输入
const wordInput = fields.find((node) => node.attributes["data-field"] === "word");
wordInput.value = "Hello DeepSeek";
fire(wordInput, "input");
check("改文案：写入配置", globalThis.__dshAnim.get().word === "Hello DeepSeek", globalThis.__dshAnim.get().word);
const wordFlight = globalThis.__dshAnim.open();
const wordSpans = document.body.childNodes[0].findByClass("dsa-word")?.childNodes.length ?? 0;
check("改文案：画面按新文案生成 span", wordSpans === "Hello DeepSeek".length, String(wordSpans));
check("改文案：画面含新文案片段", document.body.childNodes[0].serialize().includes("Hello"));
flushTimers();
await wordFlight;

// 外部改配置 → 面板自动同步（notifyPanels）
globalThis.__dshAnim.set({ style: "pulse", speed: 1.6 });
const pulseCard = styleCards.find((node) => node.attributes["data-style-id"] === "pulse");
check("外部 set 后：面板样式卡自动换选中", pulseCard.className.includes("on"), pulseCard.className);
check("外部 set 后：面板速度回显同步", collectByClass(panelHost, "dsa-num")[0].textContent === "1.6×", collectByClass(panelHost, "dsa-num")[0].textContent);

// 恢复默认
fire(findByText(panelHost, "恢复默认"), "click");
const restored = globalThis.__dshAnim.get();
check(
	"恢复默认：配置回到 DEFAULTS",
	restored.style === "whale" && restored.speed === 1 && restored.particleCount === 26 && restored.accent === "" && restored.word === "DeepSeek Harness" && restored.open === true && restored.exit === true,
	JSON.stringify(restored)
);

// 预览按钮
fire(findByText(panelHost, "预览开场"), "click");
check("面板「预览开场」立刻播放", overlayRoots().length === 1, `n=${overlayRoots().length}`);
flushTimers();
fire(findByText(panelHost, "预览退场"), "click");
check("面板「预览退场」立刻播放退场", overlayRoots().some((n) => n.className.includes("dsa-exit")));
flushTimers();
check("面板交互后 body 干净", document.body.childNodes.length === 0, `children=${document.body.childNodes.length}`);

// 面板销毁
const panelHandle = globalThis.__dsaPanel.mount(document.createElement("div"));
panelHandle.destroy();
check("面板 destroy 后容器清空", panelHandle.host.childNodes.length === 0, `children=${panelHandle.host.childNodes.length}`);
check("globals 暴露样式清单与面板挂点", Array.isArray(globalThis.__dsaStyles) && globalThis.__dsaStyles.length === 5 && typeof globalThis.__dsaPanel.mount === "function");

// ============================== 自备视频 / 动图素材 ==============================
check(
	"默认没有素材（两向都用代码自绘）",
	globalThis.__dshAnim.get().mediaOpen === null && globalThis.__dshAnim.get().mediaExit === null,
	JSON.stringify({ open: globalThis.__dshAnim.get().mediaOpen, exit: globalThis.__dshAnim.get().mediaExit })
);
check("__dsaMedia 已挂载且报告支持", typeof globalThis.__dsaMedia === "object" && globalThis.__dsaMedia.supported() === true);
check("__dsaMedia.state() 形状完整", (() => {
	const state = globalThis.__dsaMedia.state();
	return state.supported === true && state.open === null && state.ready.open === false && state.urls.open === null;
})());
check("面板：隐藏文件选择框挂在面板里", collectByAttr(panelHost, "type", "file").length === 1, String(collectByAttr(panelHost, "type", "file").length));

const openPick = globalThis.__dsaMedia.pick("open", { name: "clip.mp4", size: 2048, type: "video/mp4" });
check(
	"选中开场素材：立刻记下元信息",
	globalThis.__dshAnim.get().mediaOpen?.name === "clip.mp4" && globalThis.__dshAnim.get().mediaOpen?.kind === "video",
	JSON.stringify(globalThis.__dshAnim.get().mediaOpen)
);
await settleMicrotasks();
check("选中开场素材：进了本地库并生成 blob URL", (globalThis.__dsaMedia.state().urls.open ?? "").startsWith("blob:"), String(globalThis.__dsaMedia.state().urls.open));
check("选中开场素材：ready 标记为 true", globalThis.__dsaMedia.state().ready.open === true);
const mediaRoot = document.body.childNodes.find((node) => node.className.includes("dsa-media"));
check("选中后立刻试播：body 里是素材层而不是自绘层", mediaRoot !== undefined && mediaRoot.getAttribute("data-style") === null, String(mediaRoot && mediaRoot.className));
check("素材层：data-media=video", mediaRoot?.getAttribute("data-media") === "video", String(mediaRoot?.getAttribute("data-media")));
check("素材层：开场时长用 mediaMaxMs(6000)", mediaRoot?.getAttribute("data-media-total") === "6000", String(mediaRoot?.getAttribute("data-media-total")));
check("素材层：内含 VIDEO 元素且默认静音", mediaRoot?.firstChild?.tagName === "VIDEO" && mediaRoot?.firstChild?.muted === true, String(mediaRoot?.firstChild?.tagName));
check("素材层：object-fit 走 mediaFit", mediaRoot?.firstChild?.style.props.objectFit === "cover", String(mediaRoot?.firstChild?.style.props.objectFit));
flushOnly(700);
check(
	"首帧守卫：已经出画（readyState>0）时不抢戏",
	document.body.childNodes.some((node) => node.className.includes("dsa-media")) && !document.body.childNodes.some((node) => node.getAttribute("data-style") !== null),
	String(mediaRoot?.firstChild?.readyState)
);
fire(mediaRoot.firstChild, "error");
check(
	"素材解码失败：自动回落到代码自绘",
	!document.body.childNodes.some((node) => node.className.includes("dsa-media")) && document.body.childNodes.some((node) => node.getAttribute("data-style") !== null),
	document.body.childNodes.map((node) => node.className).join("|")
);
drainTimers();
await openPick;
check("素材播完后 body 干净", document.body.childNodes.length === 0, `children=${document.body.childNodes.length}`);

// 首帧守卫（二）：700ms 后仍 readyState === 0（一帧都没解出来）⇒ 立刻换回代码自绘，不让用户盯黑屏
const stalledPick = globalThis.__dsaMedia.pick("open", { name: "stalled.mp4", size: 8192, type: "video/mp4" });
await settleMicrotasks();
const stalledRoot = document.body.childNodes.find((node) => node.className.includes("dsa-media"));
check("首帧守卫：素材层已就位（供观测）", stalledRoot !== undefined, String(stalledRoot && stalledRoot.className));
if (stalledRoot) stalledRoot.firstChild.readyState = 0;
flushOnly(700);
check(
	"首帧守卫：700ms 没出画 ⇒ 回落代码自绘",
	!document.body.childNodes.some((node) => node.className.includes("dsa-media")) && document.body.childNodes.some((node) => node.getAttribute("data-style") !== null),
	document.body.childNodes.map((node) => node.className).join("|")
);
drainTimers();
await stalledPick;
check("首帧守卫回落播完后 body 干净", document.body.childNodes.length === 0, `children=${document.body.childNodes.length}`);

globalThis.__dshAnim.set({ mediaMaxMs: 15000 });
const exitPick = globalThis.__dsaMedia.pick("exit", { name: "loop.gif", size: 512, type: "image/gif" });
await settleMicrotasks();
const exitMediaRoot = document.body.childNodes.find((node) => node.className.includes("dsa-media"));
check("退场素材：被 7 秒硬上限钳住", exitMediaRoot?.getAttribute("data-media-total") === "7000", String(exitMediaRoot?.getAttribute("data-media-total")));
check("图片素材：媒体层用 IMG", exitMediaRoot?.firstChild?.tagName === "IMG", String(exitMediaRoot?.firstChild?.tagName));
check("图片素材：kind 记为 image", globalThis.__dshAnim.get().mediaExit?.kind === "image", JSON.stringify(globalThis.__dshAnim.get().mediaExit));
drainTimers();
await exitPick;

// 模拟"重启 DSH"：重新 apply 一遍，素材应从本地库重新水合（不需要重选文件）
mod.apply({ effect: (cb) => cb() });
await settleMicrotasks(28);
check(
	"重新 apply（模拟重启）后素材自动重新水合",
	globalThis.__dsaMedia.state().ready.exit === true && globalThis.__dsaMedia.state().exit?.name === "loop.gif",
	JSON.stringify(globalThis.__dsaMedia.state())
);
drainTimers();

await globalThis.__dsaMedia.clear("open");
check("清除开场素材：配置回到 null", globalThis.__dshAnim.get().mediaOpen === null);
check("清除开场素材：本地库里也不再有该键", idbData.has("open") === false);
const afterClear = globalThis.__dshAnim.open();
check(
	"清除后回到代码自绘（有 data-style、无素材层）",
	document.body.childNodes[0]?.getAttribute("data-style") === "whale" && !document.body.childNodes.some((node) => node.className.includes("dsa-media")),
	String(document.body.childNodes[0]?.className)
);
drainTimers();
await afterClear;

const mediaStates = collectByClass(panelHost, "dsa-media-state");
check("面板：两组素材状态位", mediaStates.length === 2, String(mediaStates.length));
check("面板：退场素材状态显示文件名与大小", (mediaStates[1]?.textContent ?? "").includes("loop.gif") && (mediaStates[1]?.textContent ?? "").includes("512"), String(mediaStates[1]?.textContent));
check("面板：开场素材清除后显示未设置", (mediaStates[0]?.textContent ?? "").includes("未设置"), String(mediaStates[0]?.textContent));
check("面板：素材最长播放回显 15.0s", collectByClass(panelHost, "dsa-num")[2]?.textContent === "15.0s", String(collectByClass(panelHost, "dsa-num")[2]?.textContent));
const mediaPills = collectByClass(panelHost, "dsa-pill");
check("面板：开关组 3 个 + 素材组 2 个 pill 就位", mediaPills.length === 5 && (mediaPills[2]?.textContent === "已开启" || mediaPills[2]?.textContent === "已关闭") && (mediaPills[3]?.textContent === "静音" || mediaPills[3]?.textContent === "有声") && (mediaPills[4]?.textContent === "铺满裁切" || mediaPills[4]?.textContent === "完整显示"), mediaPills.map((node) => node.textContent).join("|"));
check("面板：“点 X 关窗也播”默认关（只隐藏不播）", mediaPills[2]?.textContent === "已关闭" && globalThis.__dshAnim.get().exitOnClose === false, String(mediaPills[2]?.textContent) + " / " + String(globalThis.__dshAnim.get().exitOnClose));

// -------- “点 X 关窗”到底播不播：由配置 exitOnClose 决定（m02643） --------
// 桌面壳补丁 A 在 close 收尾里 await globalThis.__dshCloseAnimation()：
//   默认关 ⇒ 立刻 resolve 已完成的 Promise，窗口马上隐藏（等于没打补丁）；
//   打开   ⇒ 走 play("exit")，和托盘退出一样播完再隐藏。
check("globalThis.__dshCloseAnimation 已挂载", typeof globalThis.__dshCloseAnimation === "function");
const closeOff = await globalThis.__dshCloseAnimation();
check("默认：点 X 不播动画（立刻 resolve，且没建树）", closeOff === false && document.body.childNodes.length === 0, String(closeOff) + " / body=" + String(document.body.childNodes.length));
globalThis.__dshAnim.set({ exitOnClose: true });
check("打开后配置生效", globalThis.__dshAnim.get().exitOnClose === true);
const closeOn = globalThis.__dshCloseAnimation();
check("打开后：点 X 会播退场动画（body 里有 exit 层，自绘或素材都算）", document.body.childNodes.some((node) => node.className.includes("dsa-exit") || node.className.includes("dsa-media-exit")), String(closeOn));
drainTimers();
await closeOn;
check("播完后自清理（body 干净）", document.body.childNodes.length === 0, String(document.body.childNodes.length));
globalThis.__dshAnim.set({ exitOnClose: false });
check("关掉总开关“退场动画”后，点 X 更不会播", (() => {
	globalThis.__dshAnim.set({ exitOnClose: true, exit: false });
	const pending = globalThis.__dshCloseAnimation();
	globalThis.__dshAnim.set({ exitOnClose: false, exit: true });
	return pending instanceof Promise && document.body.childNodes.length === 0;
})(), "exit 总开关优先");

// -------- 回归（真机 Cordis 语义）：未声明 inject 时读 ctx.slots 会抛错 --------
// 真机现象：apply 里 `if (ctx.slots)` 抛 cannot get property "slots" without inject，
// 被 catch 吞掉 ⇒ inject 分支永远到不了 ⇒ 设置页里没有「开关动画」。下面把这种 ctx 原样复刻。
const regression = { deps: [], slots: [], registered: [], effects: [], errors: [] };
const throwingSlotsCtx = {
	get slots() {
		throw new Error('cannot get property "slots" without inject');
	},
	effect: (cb, label) => {
		regression.effects.push(label);
		return cb();
	},
	inject: (deps, cb) => {
		regression.deps.push(deps);
		cb({
			slots: {
				inject(name, callback) {
					regression.slots.push(name);
					return callback();
				},
				register(meta, component) {
					regression.registered.push({ meta, component });
					return () => {};
				},
			},
			effect: (inner, innerLabel) => {
				regression.effects.push(innerLabel);
				return inner();
			},
		});
	},
};
const realConsoleError = console.error;
console.error = (...args) => {
	regression.errors.push(args);
};
try {
	mod.apply(throwingSlotsCtx);
} finally {
	console.error = realConsoleError;
}
check("回归：ctx.slots 抛错时仍走 inject([\"slots\"])", regression.deps.length === 1 && JSON.stringify(regression.deps[0]) === '["slots"]', JSON.stringify(regression.deps));
check("回归：ctx.slots 抛错也照常注册设置页 section", regression.registered.length === 1, `n=${regression.registered.length}`);
check("回归：注册过程没有异常日志", regression.errors.length === 0, JSON.stringify(regression.errors.map((args) => String((args[1] && args[1].message) || args[0]))));
check("回归：注册仍包在 ctx.effect 里", regression.effects.includes("dsh-open-exit-animation: settings section"), JSON.stringify(regression.effects));
flushTimers();

// 没有 inject、slots 又抛错的最坏情况：apply 不许把异常抛出去（动画优先）
const bareCtx = {
	get slots() {
		throw new Error('cannot get property "slots" without inject');
	},
};
let bareThrew = null;
try {
	mod.apply(bareCtx);
} catch (error) {
	bareThrew = error;
}
check("回归：ctx 既无 inject 又读不到 slots 时 apply 不抛错", bareThrew === null, String(bareThrew && bareThrew.message));
flushTimers();

// ============================== 汇总 ==============================
const failed = results.filter((r) => !r.ok);
console.log("");
console.log(`自检：${results.length - failed.length}/${results.length} 项通过`);
if (failed.length > 0) {
	console.error("失败项：");
	for (const item of failed) console.error(`  ✗ ${item.label} ${item.detail}`);
	process.exit(1);
}
console.log("全部通过 ✓");
