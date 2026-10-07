/**
 * dsh-open-exit-animation — browser half.
 *
 * Hand-written `window.__ModuleLoader__` bundle (no bundler step): the client module system only
 * REGISTERS this factory here; the body runs when the client kernel materializes the row, and
 * `apply()` is called on the client plugin fiber.
 *
 * 设计约束（有意为之）：
 *  - 只 require 宿主提供的 "react"（可选：拿不到就跳过设置面板，动画照常）。
 *    默认动画是 DOM/CSS/SVG 自绘；用户也能在设置页选一段自己的视频 / 动图当素材：
 *    二进制存进浏览器本地库（IndexedDB），播放时用 blob: URL，零宿主路由、零资源请求。
 *  - 整个 factory 体带兜底 try/catch：浏览器半一旦抛异常会拖垮客户端启动图，绝不能发生。
 *  - 开场动画在页面挂载时自动播一次；退场动画由 `globalThis.__dshExitAnimation()` 驱动，
 *    桌面壳补丁（见 tools/patch-asar.mjs）在 before-quit（托盘退出 / 退出应用）时 await 它；
 *    点 X 关窗走 `globalThis.__dshCloseAnimation()`——由配置 `exitOnClose`（默认关）决定
 *    播不播，默认立刻 resolve，窗口马上隐藏到托盘。
 *  - 设置页面板走 `settings.section` 槽（React 容器 + 纯 DOM 内容）：可切样式、速度、
 *    粒子数、主色、文案——保存即生效（下一次播放）。面板内容也能在 preview.html 里单独看。
 *  - 手工预览：Ctrl+Alt+O 播开场，Ctrl+Alt+X 播退场（不真的退出）；或 console 里用 __dshAnim。
 */
window.__ModuleLoader__.load({
	id: "dsh-open-exit-animation",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		var inject = [];
		var apply = function () {};
		exports.inject = inject;
		exports.apply = apply;

		try {
			// ==================== 可选的 react（设置页面板需要；拿不到就只做动画） ====================
			var react = null;
			try {
				if (typeof require === "function") react = require("react");
			} catch (error) {
				react = null;
			}

			// ==================== 常量 ====================
			/** DeepSeek 鲸鱼剪影路径（与 @deepseek-ai/dsh-client-ui-primitives 的 FISH_LOGO_PATH 同源）。 */
			var FISH_PATH = "M22.9168 1.43018C22.6713 1.31018 22.5658 1.53918 22.4223 1.65519C22.3733 1.69269 22.3318 1.74169 22.2903 1.78669C21.9317 2.1697 21.5127 2.42121 20.9657 2.39121C20.1657 2.34621 19.4827 2.59771 18.8787 3.20973C18.7502 2.45521 18.3236 2.0047 17.6746 1.71569C17.3351 1.56568 16.9916 1.41518 16.7536 1.08867C16.5876 0.856163 16.5421 0.597155 16.4591 0.341647C16.4061 0.187643 16.3536 0.0301382 16.1761 0.00363739C15.9836 -0.0263635 15.9081 0.135141 15.8326 0.270145C15.5306 0.822162 15.4136 1.43018 15.4251 2.0462C15.4516 3.43174 16.0366 4.53527 17.1991 5.3203C17.3311 5.4103 17.3651 5.5003 17.3236 5.63181C17.2441 5.90231 17.1501 6.16482 17.0671 6.43533C17.0141 6.60784 16.9351 6.64584 16.7501 6.57033C16.1121 6.30383 15.5611 5.90931 15.074 5.4328C14.2475 4.63328 13.5 3.75075 12.568 3.05973C12.349 2.89822 12.13 2.74822 11.9034 2.60522C10.9524 1.68169 12.028 0.923165 12.277 0.833162C12.5375 0.739159 12.3675 0.41615 11.5259 0.42015C10.6844 0.42365 9.91439 0.705658 8.93286 1.08117C8.78935 1.13767 8.63835 1.17867 8.48384 1.21267C7.59332 1.04367 6.66829 1.00617 5.70226 1.11517C3.88321 1.31768 2.43016 2.1777 1.36213 3.64575C0.0790928 5.4103 -0.222916 7.41536 0.146595 9.50642C0.535106 11.7105 1.66014 13.535 3.38869 14.9616C5.18125 16.4406 7.24581 17.1657 9.60138 17.0266C11.0319 16.9441 12.6245 16.7526 14.421 15.2321C14.874 15.4576 15.3496 15.5476 16.1381 15.6151C16.7456 15.6716 17.3306 15.5851 17.7836 15.4911C18.4931 15.3411 18.4441 14.6841 18.1876 14.5636C16.1081 13.595 16.5646 13.9891 16.1496 13.67C17.2061 12.42 18.8202 10.1979 19.3182 7.17235C19.3672 6.83834 19.4297 6.36783 19.4222 6.09732C19.4182 5.93231 19.4562 5.86831 19.6447 5.84931C20.1657 5.78931 20.6712 5.64681 21.1357 5.3913C22.4833 4.65528 23.0268 3.44624 23.1548 1.9972C23.1738 1.77569 23.1508 1.54668 22.9168 1.43018ZM11.1749 14.4736C9.15936 12.889 8.18184 12.3675 7.77832 12.39C7.40081 12.4125 7.46881 12.8445 7.55182 13.126C7.63882 13.404 7.75182 13.5955 7.91033 13.8396C8.01983 14.0011 8.09533 14.2411 7.80083 14.4216C7.15181 14.8231 6.02327 14.2866 5.97027 14.2601C4.65673 13.4865 3.5587 12.4655 2.78467 11.069C2.03715 9.72493 1.60314 8.28289 1.53164 6.74384C1.51264 6.37233 1.62214 6.24082 1.99215 6.17332C2.47916 6.08332 2.98118 6.06432 3.46769 6.13582C5.52476 6.43633 7.27581 7.35586 8.74385 8.8129C9.58188 9.64243 10.2159 10.634 10.8689 11.6025C11.5634 12.631 12.3105 13.611 13.262 14.4146C13.598 14.6961 13.866 14.9101 14.1225 15.0681C13.349 15.1546 12.058 15.1731 11.1749 14.4746L11.1749 14.4736ZM12.141 8.25988C12.141 8.09488 12.273 7.96338 12.439 7.96338C12.4765 7.96338 12.5105 7.97088 12.541 7.98188C12.5825 7.99688 12.6205 8.01938 12.6505 8.05338C12.7035 8.10588 12.7335 8.18088 12.7335 8.25988C12.7335 8.42489 12.6015 8.55639 12.4355 8.55639C12.2695 8.55639 12.141 8.42489 12.141 8.25988ZM15.1415 9.79893C14.949 9.87793 14.7565 9.94544 14.5715 9.95294C14.2845 9.96794 13.9715 9.85143 13.8015 9.70893C13.5375 9.48742 13.3485 9.36342 13.2695 8.97691C13.2355 8.8119 13.2545 8.55639 13.2845 8.40989C13.3525 8.09438 13.277 7.89187 13.0545 7.70787C12.8735 7.55786 12.643 7.51636 12.39 7.51636C12.2955 7.51636 12.209 7.47486 12.1445 7.44136C12.039 7.38886 11.9519 7.25735 12.035 7.09585C12.0615 7.04335 12.19 6.91584 12.22 6.89334C12.5635 6.69784 12.9595 6.76184 13.326 6.90834C13.6655 7.04735 13.9225 7.30236 14.292 7.66287C14.6695 8.09838 14.7375 8.21838 14.9525 8.54539C15.1225 8.8009 15.277 9.06341 15.3831 9.36392C15.4471 9.55142 15.3641 9.70493 15.1415 9.79893Z";
			/** 鲸鱼原始 viewBox。 */
			var FISH_VIEWBOX = "0 0 23.16 17.04";
			var STORE_KEY = "dsh-open-exit-animation:config";
			var Z_INDEX = 2147483000;
			var VERSION = "0.3.1";
			var PANEL_ID = "open-exit-animation";
			var PANEL_ORDER = 600;
			var PANEL_LABEL = "开关动画";
			var BASE_OPEN_MS = 2260;
			var BASE_EXIT_MS = 1420;
			var REDUCED_MS = 260;

			var DEFAULTS = {
				open: true,
				exit: true,
				exitOnClose: false,
				speed: 1,
				style: "whale",
				particleCount: 26,
				accent: "",
				word: "DeepSeek Harness",
				subOpen: "正在启动 · starting",
				subExit: "正在退出 · shutting down",
				mediaOpen: null,
				mediaExit: null,
				mediaMuted: true,
				mediaMaxMs: 6000,
				mediaFit: "cover"
			};

			/**
			 * 动画样式表。每个样式 = 一份纯代码画面配方：
			 *  whale: full=填充+光扫+描边 / solid=只填充 / line=只描边 / none=无标志
			 *  dots: 切换到该样式时的推荐粒子数；rings: 扩散环数量；其余为装饰开关。
			 */
			var STYLES = [
				{ id: "whale", label: "鲸鱼光扫", note: "描边自绘 + 光扫 + 汇聚粒子（默认）", whale: "full", dots: 26, rings: 0, cursor: false, bar: true, core: false, grid: false, openMs: 2260, exitMs: 1420, charStagger: 26, letterSpacing: ".42em", uppercase: true },
				{ id: "pulse", label: "极简脉冲", note: "同心光环扩散 + 实心鲸鱼淡入", whale: "solid", dots: 14, rings: 3, cursor: false, bar: true, core: false, grid: false, openMs: 1900, exitMs: 1200, charStagger: 22, letterSpacing: ".3em", uppercase: true },
				{ id: "stardust", label: "星尘汇聚", note: "无标志：粒子汇聚成核 + 文字浮现", whale: "none", dots: 54, rings: 0, cursor: false, bar: true, core: true, grid: false, openMs: 2400, exitMs: 1500, charStagger: 20, letterSpacing: ".34em", uppercase: true },
				{ id: "typewriter", label: "打字机", note: "纯文字逐字打印 + 光标 + 扫描线", whale: "none", dots: 0, rings: 0, cursor: true, bar: false, core: false, grid: false, openMs: 2100, exitMs: 1100, charStagger: 52, letterSpacing: ".12em", uppercase: false },
				{ id: "rings", label: "雷达环", note: "网格 + 扩散环 + 鲸鱼轮廓", whale: "line", dots: 18, rings: 3, cursor: false, bar: true, core: false, grid: true, openMs: 2000, exitMs: 1300, charStagger: 22, letterSpacing: ".36em", uppercase: true }
			];
			var STYLE_MAP = {};
			for (var si = 0; si < STYLES.length; si++) STYLE_MAP[STYLES[si].id] = STYLES[si];

			var DEFAULT_PALETTE = {
				ac: "#2f7fe0",
				ac2: "#7fe6ff",
				acGlow: "rgba(64,148,255,.34)",
				acGlow2: "rgba(47,109,214,.16)",
				acLine: "rgba(170,216,255,.95)",
				acDot: "rgba(160,210,255,.9)",
				acDotShadow: "rgba(110,180,255,.85)",
				acText: "#dbe9ff",
				acTextShadow: "rgba(96,168,255,.45)",
				acSub: "rgba(150,190,235,.72)"
			};
			var ACCENT_SWATCHES = ["", "#2f7fe0", "#7c5cff", "#12b886", "#ff6b6b", "#f59f00", "#22d3ee"];

			// ==================== 样式表（CSS） ====================
			// 时长/延迟统一写成 `calc(<基准> * var(--k) / var(--sp))`：
			//   --sp = 用户速度倍率（越大越快）；--k = 当前样式的时间线缩放（由 style.openMs/exitMs 推出）。
			// 颜色统一走 --ac* 变量（由 config.accent 计算）⇒ 换主色不用改任何节点。
			var CSS = [
				".dsa{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;overflow:hidden;pointer-events:none;--sp:1;--k:1;font-family:'Segoe UI Variable Text','Segoe UI',Inter,system-ui,-apple-system,'Microsoft YaHei',sans-serif;animation:dsa-in calc(200ms / var(--sp)) ease-out both}",
				".dsa,.dsa *{box-sizing:border-box}",
				".dsa-veil{position:absolute;inset:0;background:radial-gradient(115% 85% at 50% 44%,rgba(14,32,58,.93) 0%,rgba(5,11,20,.975) 58%,rgba(2,5,9,.995) 100%)}",
				".dsa-exit .dsa-veil{opacity:0;animation:dsa-veil-exit calc(1350ms * var(--k) / var(--sp)) linear both}",
				"@keyframes dsa-veil-exit{0%{opacity:0}30%{opacity:.94}100%{opacity:1}}",
				".dsa-glow{position:absolute;width:82vmin;height:82vmin;border-radius:50%;opacity:0;background:radial-gradient(circle,var(--acGlow,rgba(64,148,255,.34)) 0%,var(--acGlow2,rgba(47,109,214,.16)) 38%,rgba(10,20,36,0) 70%);filter:blur(8px)}",
				".dsa-open .dsa-glow{animation:dsa-glow-in calc(1600ms * var(--k) / var(--sp)) cubic-bezier(.3,0,.2,1) calc(120ms / var(--sp)) both}",
				"@keyframes dsa-glow-in{0%{opacity:0;transform:scale(.7)}45%{opacity:.95;transform:scale(1)}100%{opacity:.45;transform:scale(1.14)}}",
				".dsa-exit .dsa-glow{animation:dsa-glow-out calc(1350ms * var(--k) / var(--sp)) cubic-bezier(.3,0,.25,1) both}",
				"@keyframes dsa-glow-out{0%{opacity:0;transform:scale(.85)}40%{opacity:1;transform:scale(1.05)}100%{opacity:0;transform:scale(1.32)}}",
				".dsa-grid{position:absolute;inset:-12%;opacity:.13;background-image:linear-gradient(var(--acLine,rgba(170,216,255,.95)) 1px,transparent 1px),linear-gradient(90deg,var(--acLine,rgba(170,216,255,.95)) 1px,transparent 1px);background-size:6.5vmin 6.5vmin;-webkit-mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 70%);mask-image:radial-gradient(circle at 50% 50%,#000 0%,transparent 70%)}",
				".dsa-ring{position:absolute;left:50%;top:50%;width:30vmin;height:30vmin;margin:-15vmin 0 0 -15vmin;border:1px solid var(--acLine,rgba(170,216,255,.95));border-radius:50%;opacity:0}",
				".dsa-open .dsa-ring{animation:dsa-ring-in calc(1500ms * var(--k) / var(--sp)) cubic-bezier(.2,.6,.2,1) calc(var(--rd) * var(--k) / var(--sp)) both}",
				"@keyframes dsa-ring-in{0%{opacity:0;transform:scale(.42)}26%{opacity:.7}100%{opacity:0;transform:scale(1.55)}}",
				".dsa-exit .dsa-ring{animation:dsa-ring-out calc(1250ms * var(--k) / var(--sp)) cubic-bezier(.3,0,.25,1) calc(var(--rd) * var(--k) / var(--sp)) both}",
				"@keyframes dsa-ring-out{0%{opacity:0;transform:scale(1.4)}30%{opacity:.62}100%{opacity:0;transform:scale(.55)}}",
				".dsa-center{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2.4vmin}",
				".dsa-mark{position:relative;width:36vmin;min-width:140px;max-width:340px;filter:drop-shadow(0 8px 40px var(--acGlow,rgba(58,140,255,.5)));will-change:transform,opacity}",
				".dsa-open .dsa-mark{animation:dsa-mark-in calc(1000ms * var(--k) / var(--sp)) cubic-bezier(.2,.8,.2,1) both}",
				"@keyframes dsa-mark-in{0%{opacity:0;transform:scale(.82) translateY(1.4vmin)}55%{opacity:1}100%{opacity:1;transform:scale(1) translateY(0)}}",
				".dsa-exit .dsa-mark{animation:dsa-mark-out calc(1350ms * var(--k) / var(--sp)) cubic-bezier(.35,0,.2,1) both}",
				"@keyframes dsa-mark-out{0%{opacity:0;transform:scale(.9)}20%{opacity:1;transform:scale(1)}68%{opacity:1;transform:scale(1.02)}100%{opacity:0;transform:scale(1.16)}}",
				".dsa-whale{display:block;width:100%;height:auto;overflow:visible}",
				".dsa-whale-fill{opacity:0}",
				".dsa-open .dsa-whale-fill{animation:dsa-fade-in calc(700ms * var(--k) / var(--sp)) ease-out calc(420ms * var(--k) / var(--sp)) both}",
				".dsa-exit .dsa-whale-fill{animation:dsa-fade-in calc(420ms * var(--k) / var(--sp)) ease-out calc(90ms * var(--k) / var(--sp)) both}",
				"@keyframes dsa-fade-in{from{opacity:0}to{opacity:1}}",
				".dsa-whale-line{fill:none;stroke:var(--acLine,rgba(170,216,255,.95));stroke-width:.24;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:1;stroke-dashoffset:1}",
				".dsa-open .dsa-whale-line{animation:dsa-draw calc(950ms * var(--k) / var(--sp)) cubic-bezier(.45,.05,.2,1) both}",
				".dsa-exit .dsa-whale-line{animation:dsa-draw calc(480ms * var(--k) / var(--sp)) cubic-bezier(.45,.05,.2,1) both}",
				"@keyframes dsa-draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}",
				".dsa-sheen{will-change:transform}",
				".dsa-open .dsa-sheen{animation:dsa-sheen calc(1050ms * var(--k) / var(--sp)) cubic-bezier(.35,0,.25,1) calc(500ms * var(--k) / var(--sp)) both}",
				".dsa-exit .dsa-sheen{animation:dsa-sheen calc(700ms * var(--k) / var(--sp)) cubic-bezier(.35,0,.25,1) calc(260ms * var(--k) / var(--sp)) both}",
				"@keyframes dsa-sheen{from{transform:translateX(0)}to{transform:translateX(42px)}}",
				".dsa-core{position:absolute;left:50%;top:50%;width:1.8vmin;height:1.8vmin;margin:-.9vmin 0 0 -.9vmin;border-radius:50%;background:#fff;box-shadow:0 0 20px 7px var(--ac2,#7fe6ff);opacity:0}",
				".dsa-open .dsa-core{animation:dsa-core-in calc(1500ms * var(--k) / var(--sp)) ease-out both}",
				"@keyframes dsa-core-in{0%{opacity:0;transform:scale(.15)}45%{opacity:1;transform:scale(1.15)}100%{opacity:.9;transform:scale(1)}}",
				".dsa-exit .dsa-core{animation:dsa-core-out calc(1250ms * var(--k) / var(--sp)) ease-in both}",
				"@keyframes dsa-core-out{0%{opacity:.9;transform:scale(1)}100%{opacity:0;transform:scale(2.4)}}",
				".dsa-word{display:flex;align-items:baseline;margin-left:.42em;font-size:clamp(11px,2.15vmin,24px);font-weight:600;letter-spacing:.42em;text-transform:uppercase;color:var(--acText,#dbe9ff);text-shadow:0 0 20px var(--acTextShadow,rgba(96,168,255,.45));white-space:pre}",
				".dsa-word span{display:inline-block;opacity:0;transform:translateY(.35em)}",
				".dsa-open .dsa-word span{animation:dsa-char calc(520ms * var(--k) / var(--sp)) cubic-bezier(.2,.8,.2,1) calc((560ms + var(--i) * var(--st) * 1ms) * var(--k) / var(--sp)) both}",
				".dsa-exit .dsa-word span{animation:dsa-char calc(380ms * var(--k) / var(--sp)) cubic-bezier(.2,.8,.2,1) calc((150ms + var(--i) * 13ms) * var(--k) / var(--sp)) both}",
				"@keyframes dsa-char{from{opacity:0;transform:translateY(.35em)}to{opacity:1;transform:translateY(0)}}",
				".dsa-cursor{display:inline-block;width:2px;height:1.05em;margin-left:.18em;background:var(--ac2,#7fe6ff);box-shadow:0 0 9px var(--ac2,#7fe6ff);animation:dsa-blink calc(900ms / var(--sp)) steps(1,end) infinite}",
				"@keyframes dsa-blink{0%,49%{opacity:1}50%,100%{opacity:0}}",
				".dsa-scan{position:absolute;left:0;right:0;top:50%;height:1px;background:linear-gradient(90deg,rgba(0,0,0,0),var(--ac2,#7fe6ff),rgba(0,0,0,0));opacity:0}",
				".dsa-open .dsa-scan{animation:dsa-scan calc(1200ms * var(--k) / var(--sp)) ease-in-out calc(200ms * var(--k) / var(--sp)) both}",
				"@keyframes dsa-scan{0%{opacity:0;transform:translateY(-9vmin)}32%{opacity:.9}100%{opacity:0;transform:translateY(9vmin)}}",
				".dsa-sub{font-size:clamp(9px,1.5vmin,14px);letter-spacing:.34em;text-transform:uppercase;color:var(--acSub,rgba(150,190,235,.72));opacity:0}",
				".dsa-open .dsa-sub{animation:dsa-char calc(560ms * var(--k) / var(--sp)) ease-out calc(1200ms * var(--k) / var(--sp)) both}",
				".dsa-exit .dsa-sub{animation:dsa-char calc(420ms * var(--k) / var(--sp)) ease-out calc(520ms * var(--k) / var(--sp)) both}",
				".dsa-bar{position:relative;width:26vmin;max-width:280px;height:2px;border-radius:2px;background:rgba(120,170,225,.16);overflow:hidden;opacity:0}",
				".dsa-open .dsa-bar{animation:dsa-fade-in calc(400ms * var(--k) / var(--sp)) ease-out calc(900ms * var(--k) / var(--sp)) both}",
				".dsa-exit .dsa-bar{display:none}",
				".dsa-bar i{position:absolute;inset:0;transform-origin:left center;transform:scaleX(0);background:linear-gradient(90deg,var(--ac,#2f7fe0),var(--ac2,#7fe6ff))}",
				".dsa-open .dsa-bar i{animation:dsa-bar calc(1100ms * var(--k) / var(--sp)) cubic-bezier(.3,.6,.2,1) calc(950ms * var(--k) / var(--sp)) both}",
				"@keyframes dsa-bar{from{transform:scaleX(0)}to{transform:scaleX(1)}}",
				".dsa-dots{position:absolute;inset:0}",
				".dsa-dots i{position:absolute;left:50%;top:50%;width:calc(var(--s) * 1px);height:calc(var(--s) * 1px);margin-top:calc(var(--s) * -.5px);margin-left:calc(var(--s) * -.5px);border-radius:50%;background:var(--acDot,rgba(160,210,255,.9));box-shadow:0 0 7px var(--acDotShadow,rgba(110,180,255,.85));opacity:0}",
				".dsa-open .dsa-dots i{animation:dsa-dot-in calc(1600ms * var(--k) / var(--sp)) cubic-bezier(.3,0,.2,1) calc(var(--d) * var(--k) / var(--sp)) both}",
				"@keyframes dsa-dot-in{0%{opacity:0;transform:translate(calc(var(--x) * 1.9),calc(var(--y) * 1.9)) scale(.35)}30%{opacity:.85}100%{opacity:0;transform:translate(0,0) scale(1)}}",
				".dsa-exit .dsa-dots i{animation:dsa-dot-out calc(1250ms * var(--k) / var(--sp)) cubic-bezier(.3,0,.25,1) calc(var(--d) * var(--k) / var(--sp)) both}",
				"@keyframes dsa-dot-out{0%{opacity:0;transform:translate(0,0) scale(.85)}22%{opacity:.9}100%{opacity:0;transform:translate(calc(var(--x) * 2.4),calc(var(--y) * 2.4)) scale(.3)}}",
				".dsa-open{animation:dsa-in calc(200ms / var(--sp)) ease-out both,dsa-out calc(440ms * var(--k) / var(--sp)) ease-in calc(1820ms * var(--k) / var(--sp)) both}",
				"@keyframes dsa-in{from{opacity:0}to{opacity:1}}",
				"@keyframes dsa-out{from{opacity:1}to{opacity:0}}",
				".dsa-reduced,.dsa-reduced *{animation-duration:220ms !important;animation-delay:0ms !important}",
				/* ---- 样式专属微调 ---- */
				".dsa-style-pulse .dsa-mark{width:42vmin}",
				".dsa-style-stardust .dsa-mark{width:12vmin;min-width:48px;max-width:120px;height:12vmin}",
				".dsa-style-stardust .dsa-center{gap:2vmin}",
				".dsa-style-typewriter .dsa-center{gap:1.6vmin}",
				".dsa-style-typewriter .dsa-word{font-weight:500;text-transform:none;margin-left:0}",
				".dsa-style-rings .dsa-glow{opacity:.3}",
				/* ---- 视频 / 动图素材层 ---- */
				".dsa-media{background:#05070c;animation:dsa-media-in calc(200ms / var(--sp,1)) ease-out both}",
				"@keyframes dsa-media-in{from{opacity:0}to{opacity:1}}",
				".dsa-media-el{width:100%;height:100%;display:block;object-fit:cover;background:#05070c}",
				".dsa-media-contain .dsa-media-el{object-fit:contain}",
				".dsa-media-leave{animation:dsa-media-leave 240ms ease-in both !important}",
				"@keyframes dsa-media-leave{from{opacity:1}to{opacity:0}}",
				/* ---- 设置页面板 ---- */
				".dsa-panel-host{display:block}",
				".dsa-panel{font:13px/1.65 inherit;color:var(--theme-text,#e6e6e6);max-width:780px;padding:2px 2px 26px}",
				".dsa-panel h3{margin:0 0 10px;font-size:13px;font-weight:600;letter-spacing:.04em}",
				".dsa-panel-lead{margin:0 0 14px;font-size:12px;color:var(--theme-text-secondary,#8b8b8b)}",
				".dsa-card{border:1px solid var(--theme-border,#333);border-radius:10px;padding:14px 16px;margin-bottom:14px;background:var(--theme-input-bg,rgba(127,127,127,.06))}",
				".dsa-styles{display:grid;grid-template-columns:repeat(auto-fill,minmax(154px,1fr));gap:10px}",
				".dsa-style{border:1px solid var(--theme-border,#333);border-radius:10px;padding:10px;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}",
				".dsa-style:hover{border-color:var(--theme-accent,#4a9eff)}",
				".dsa-style.on{border-color:var(--theme-accent,#4a9eff);background:var(--theme-input-bg,rgba(74,158,255,.1))}",
				".dsa-style .t{display:block;font-weight:600;margin-bottom:3px}",
				".dsa-style .n{display:block;font-size:11px;line-height:1.45;color:var(--theme-text-secondary,#8b8b8b)}",
				".dsa-style .pv{position:relative;height:36px;margin-bottom:9px;border-radius:7px;overflow:hidden;background:radial-gradient(circle at 50% 50%,var(--acGlow,rgba(64,148,255,.34)) 0%,rgba(6,11,20,.9) 72%)}",
				".dsa-style .pv b{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);border-radius:50%;border:1px solid var(--acLine,rgba(170,216,255,.95));opacity:.7}",
				".dsa-style .pv i{position:absolute;left:50%;top:50%;width:4px;height:4px;margin:-2px 0 0 -2px;border-radius:50%;background:var(--acDot,rgba(160,210,255,.9))}",
				".dsa-row{display:flex;align-items:center;gap:12px;padding:6px 0}",
				".dsa-row>.k{flex:0 0 92px;font-size:12px;color:var(--theme-text-secondary,#8b8b8b)}",
				".dsa-row>.v{flex:1;display:flex;align-items:center;gap:10px;min-width:0}",
				".dsa-pill{border:1px solid var(--theme-border,#333);background:transparent;color:inherit;font:inherit;font-size:12px;border-radius:999px;padding:4px 13px;cursor:pointer}",
				".dsa-pill.on{background:var(--theme-accent,#4a9eff);border-color:var(--theme-accent,#4a9eff);color:#fff}",
				".dsa-range{flex:1;min-width:90px;accent-color:var(--theme-accent,#4a9eff)}",
				".dsa-num{min-width:46px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--theme-text-secondary,#8b8b8b)}",
				".dsa-input{flex:1;min-width:0;font:inherit;font-size:12px;padding:6px 8px;border-radius:6px;border:1px solid var(--theme-border,#333);background:var(--theme-input-bg,rgba(127,127,127,.08));color:inherit}",
				".dsa-swatches{display:flex;align-items:center;gap:7px;flex-wrap:wrap}",
				".dsa-swatch{width:22px;height:22px;padding:0;border-radius:50%;border:1px solid var(--theme-border,#333);cursor:pointer;background-clip:padding-box}",
				".dsa-swatch.on{box-shadow:0 0 0 2px var(--theme-text,#e6e6e6)}",
				".dsa-color{width:26px;height:24px;padding:0;border:1px solid var(--theme-border,#333);border-radius:6px;background:transparent;cursor:pointer}",
				".dsa-btn{background:var(--theme-accent,#4a9eff);color:#fff;border:none;border-radius:7px;padding:7px 14px;font:inherit;font-size:12px;cursor:pointer}",
				".dsa-btn.ghost{background:transparent;border:1px solid var(--theme-border,#444);color:inherit}",
				".dsa-actions{display:flex;gap:8px;flex-wrap:wrap;margin:2px 0 10px}",
				".dsa-hint{margin:8px 0 0;font-size:11px;color:var(--theme-text-secondary,#8b8b8b)}",
				".dsa-media-row{display:flex;align-items:center;gap:8px;min-width:0;width:100%}",
				".dsa-media-state{flex:1;min-width:0;font-size:12px;color:var(--theme-text-secondary,#8b8b8b);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}",
				".dsa-btn.ghost.off{opacity:.4}",
				".dsa-json{margin:10px 0 0;padding:8px 10px;border-radius:6px;border:1px solid var(--theme-border,#333);background:var(--theme-input-bg,rgba(0,0,0,.25));font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:11px;white-space:pre-wrap;word-break:break-all;color:var(--theme-text-secondary,#9aa7bd)}"
			].join("\n");

			// ==================== 配置读写（localStorage，无需宿主半） ====================
			function clamp(value, min, max) {
				if (value < min) return min;
				if (value > max) return max;
				return value;
			}

			function textOr(value, fallback, max) {
				if (typeof value !== "string") return fallback;
				var text = value.replace(/[\r\n\t]+/g, " ").trim();
				if (text === "") return fallback;
				return text.slice(0, max);
			}

			/**
			 * 素材元信息（二进制存在 IndexedDB，配置里只留文件名/大小/类型）。
			 * 任何不认识或空掉的值一律当作"没有素材"。
			 */
			function mediaMetaOr(value) {
				if (!value || typeof value !== "object") return null;
				var name = textOr(value.name, "", 96);
				if (name === "") return null;
				var size = Number(value.size);
				var type = typeof value.type === "string" ? value.type.slice(0, 64) : "";
				return {
					name: name,
					size: isFinite(size) && size > 0 ? Math.round(size) : 0,
					kind: value.kind === "image" ? "image" : "video",
					type: type
				};
			}

			function formatSize(bytes) {
				var value = Number(bytes);
				if (!isFinite(value) || value <= 0) return "0 B";
				if (value < 1024) return Math.round(value) + " B";
				if (value < 1024 * 1024) return (value / 1024).toFixed(0) + " KB";
				if (value < 1024 * 1024 * 1024) return (value / 1024 / 1024).toFixed(1) + " MB";
				return (value / 1024 / 1024 / 1024).toFixed(2) + " GB";
			}

			/** 把任意输入规范化成合法配置（越界钳制、未知键丢弃、旧版 particles 迁移）。 */
			function sanitize(raw) {
				var source = raw && typeof raw === "object" ? raw : {};
				var out = {};
				out.open = typeof source.open === "boolean" ? source.open : DEFAULTS.open;
				out.exit = typeof source.exit === "boolean" ? source.exit : DEFAULTS.exit;
				out.exitOnClose = typeof source.exitOnClose === "boolean" ? source.exitOnClose : DEFAULTS.exitOnClose;
				var speed = Number(source.speed);
				out.speed = isFinite(speed) ? Math.round(clamp(speed, 0.5, 3) * 10) / 10 : DEFAULTS.speed;
				out.style = STYLE_MAP[source.style] ? source.style : DEFAULTS.style;
				var count = source.particleCount !== undefined ? Number(source.particleCount) : undefined;
				if (count === undefined && source.particles === false) count = 0;
				out.particleCount = isFinite(count) ? clamp(Math.round(count), 0, 60) : DEFAULTS.particleCount;
				out.accent = typeof source.accent === "string" && /^#[0-9a-fA-F]{6}$/.test(source.accent) ? source.accent.toLowerCase() : "";
				out.word = textOr(source.word, DEFAULTS.word, 48);
				out.subOpen = textOr(source.subOpen, DEFAULTS.subOpen, 48);
				out.subExit = textOr(source.subExit, DEFAULTS.subExit, 48);
				out.mediaOpen = mediaMetaOr(source.mediaOpen);
				out.mediaExit = mediaMetaOr(source.mediaExit);
				out.mediaMuted = typeof source.mediaMuted === "boolean" ? source.mediaMuted : DEFAULTS.mediaMuted;
				var maxMs = Number(source.mediaMaxMs);
				out.mediaMaxMs = isFinite(maxMs) ? clamp(Math.round(maxMs), 800, 15000) : DEFAULTS.mediaMaxMs;
				out.mediaFit = source.mediaFit === "contain" ? "contain" : "cover";
				return out;
			}

			function readConfig() {
				var raw = null;
				try {
					raw = JSON.parse(globalThis.localStorage.getItem(STORE_KEY) || "null");
				} catch (error) {
					raw = null;
				}
				return sanitize(raw);
			}

			function writeConfig(patch) {
				var next = readConfig();
				if (patch && typeof patch === "object") {
					for (var key in patch) next[key] = patch[key];
				}
				next = sanitize(next);
				try {
					globalThis.localStorage.setItem(STORE_KEY, JSON.stringify(next));
				} catch (error) {
					/* localStorage 不可用时只影响持久化 */
				}
				notifyPanels();
				return next;
			}

			// ==================== 工具 ====================
			function el(tag, className) {
				var node = document.createElement(tag);
				if (className) node.className = className;
				return node;
			}

			function rand() {
				return Math.random();
			}

			function styleFor(config) {
				return STYLE_MAP[config.style] || STYLE_MAP[DEFAULTS.style];
			}

			function styleList() {
				var list = [];
				for (var i = 0; i < STYLES.length; i++) {
					list.push({ id: STYLES[i].id, label: STYLES[i].label, note: STYLES[i].note, dots: STYLES[i].dots });
				}
				return list;
			}

			function ensureStyle() {
				if (document.getElementById("dsh-open-exit-animation-style") !== null) return;
				var style = document.createElement("style");
				style.id = "dsh-open-exit-animation-style";
				style.textContent = CSS;
				(document.head || document.documentElement).appendChild(style);
			}

			function reducedMotion() {
				try {
					return globalThis.matchMedia("(prefers-reduced-motion: reduce)").matches === true;
				} catch (error) {
					return false;
				}
			}

			// ---- 主色 → 调色板（换主色不用改任何节点，只换 CSS 变量与 SVG 渐变色标） ----
			function hexToRgb(hex) {
				var match = /^#?([0-9a-fA-F]{6})$/.exec(String(hex || ""));
				if (!match) return null;
				var value = parseInt(match[1], 16);
				return { r: (value >> 16) & 255, g: (value >> 8) & 255, b: value & 255 };
			}

			function rgbHex(c) {
				function part(n) {
					var text = clamp(Math.round(n), 0, 255).toString(16);
					return text.length === 1 ? "0" + text : text;
				}
				return "#" + part(c.r) + part(c.g) + part(c.b);
			}

			function mix(c, target, amount) {
				return {
					r: c.r + (target.r - c.r) * amount,
					g: c.g + (target.g - c.g) * amount,
					b: c.b + (target.b - c.b) * amount
				};
			}

			function rgba(c, alpha) {
				return "rgba(" + Math.round(c.r) + "," + Math.round(c.g) + "," + Math.round(c.b) + "," + alpha + ")";
			}

			var WHITE = { r: 255, g: 255, b: 255 };

			function palette(accent) {
				var base = hexToRgb(accent);
				if (!base) return DEFAULT_PALETTE;
				var bright = mix(base, WHITE, 0.45);
				return {
					ac: rgbHex(base),
					ac2: rgbHex(bright),
					acGlow: rgba(base, 0.34),
					acGlow2: rgba(base, 0.16),
					acLine: rgba(mix(base, WHITE, 0.55), 0.95),
					acDot: rgba(mix(base, WHITE, 0.6), 0.9),
					acDotShadow: rgba(bright, 0.85),
					acText: rgbHex(mix(base, WHITE, 0.78)),
					acTextShadow: rgba(base, 0.45),
					acSub: rgba(mix(base, WHITE, 0.5), 0.72)
				};
			}

			// ==================== 画面构建 ====================
			function whaleSvg(id, p, mode) {
				var body = "dsa-body-" + id;
				var clip = "dsa-clip-" + id;
				var sheen = "dsa-sheen-" + id;
				var defs =
					"<defs>" +
					'<linearGradient id="' + body + '" x1="0" y1="0" x2="1" y2="1">' +
					'<stop offset="0" stop-color="' + p.ac + '"/><stop offset=".45" stop-color="' + p.ac2 + '"/><stop offset="1" stop-color="' + p.ac2 + '"/>' +
					"</linearGradient>" +
					(mode === "full"
						? '<clipPath id="' + clip + '"><path d="' + FISH_PATH + '"/></clipPath>' +
							'<linearGradient id="' + sheen + '" x1="0" y1="0" x2="1" y2=".35">' +
							'<stop offset="0" stop-color="#ffffff" stop-opacity="0"/><stop offset=".5" stop-color="#ffffff" stop-opacity=".92"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>' +
							"</linearGradient>"
						: "") +
					"</defs>";
				var out = '<svg class="dsa-whale" viewBox="' + FISH_VIEWBOX + '" aria-hidden="true">' + defs;
				if (mode !== "line") out += '<path class="dsa-whale-fill" d="' + FISH_PATH + '" fill="url(#' + body + ')"/>';
				if (mode === "full") out += '<g clip-path="url(#' + clip + ')"><rect class="dsa-sheen" x="-16" y="-4" width="12" height="26" fill="url(#' + sheen + ')"/></g>';
				if (mode !== "solid") out += '<path class="dsa-whale-line" d="' + FISH_PATH + '" pathLength="1"/>';
				return out + "</svg>";
			}

			function buildDots(count) {
				var wrap = el("div", "dsa-dots");
				wrap.style.position = "absolute";
				wrap.style.inset = "0";
				for (var i = 0; i < count; i++) {
					var dot = document.createElement("i");
					var angle = (i / count) * Math.PI * 2 + (rand() - 0.5) * 0.55;
					var radius = 150 + rand() * 330;
					dot.style.setProperty("--x", Math.round(Math.cos(angle) * radius) + "px");
					dot.style.setProperty("--y", Math.round(Math.sin(angle) * radius * 0.74) + "px");
					dot.style.setProperty("--s", (1 + rand() * 2.4).toFixed(2));
					dot.style.setProperty("--d", (rand() * 620).toFixed(0) + "ms");
					wrap.appendChild(dot);
				}
				return wrap;
			}

			function buildRings(count) {
				var wrap = el("div", "dsa-rings");
				wrap.style.position = "absolute";
				wrap.style.inset = "0";
				for (var i = 0; i < count; i++) {
					var ring = el("div", "dsa-ring");
					ring.style.setProperty("--rd", String(i * 260) + "ms");
					wrap.appendChild(ring);
				}
				return wrap;
			}

			function buildWord(text, style) {
				var word = el("div", "dsa-word");
				word.setAttribute("aria-hidden", "true");
				var value = typeof text === "string" && text !== "" ? text : DEFAULTS.word;
				for (var i = 0; i < value.length; i++) {
					var ch = value.charAt(i);
					var span = document.createElement("span");
					span.textContent = ch === " " ? "\u00a0" : ch;
					span.style.setProperty("--i", String(i));
					span.style.setProperty("--st", String(style.charStagger));
					word.appendChild(span);
				}
				word.style.letterSpacing = style.letterSpacing;
				if (style.uppercase === false) word.style.textTransform = "none";
				return word;
			}

			/** 组装一次动画所需的整棵画面（含全屏兜底内联样式：即使 <style> 被 CSP 拦掉也不会漏出破图）。 */
			function buildOverlay(kind, config, id) {
				var style = styleFor(config);
				var p = palette(config.accent);
				var reduced = reducedMotion();
				var root = el("div", "dsa dsa-" + kind + " dsa-style-" + style.id);
				root.setAttribute("data-dsh-animation", kind);
				root.setAttribute("data-style", style.id);
				var st = root.style;
				st.position = "fixed";
				st.left = "0";
				st.top = "0";
				st.right = "0";
				st.bottom = "0";
				st.display = "flex";
				st.alignItems = "center";
				st.justifyContent = "center";
				st.overflow = "hidden";
				st.pointerEvents = "none";
				st.zIndex = String(Z_INDEX);
				var speed = Number(config.speed);
				if (!isFinite(speed) || speed <= 0) speed = 1;
				st.setProperty("--sp", reduced ? "1" : String(speed));
				var scale = (kind === "exit" ? style.exitMs / BASE_EXIT_MS : style.openMs / BASE_OPEN_MS);
				st.setProperty("--k", String(Math.round(scale * 1000) / 1000));
				st.setProperty("--ac", p.ac);
				st.setProperty("--ac2", p.ac2);
				st.setProperty("--acGlow", p.acGlow);
				st.setProperty("--acGlow2", p.acGlow2);
				st.setProperty("--acLine", p.acLine);
				st.setProperty("--acDot", p.acDot);
				st.setProperty("--acDotShadow", p.acDotShadow);
				st.setProperty("--acText", p.acText);
				st.setProperty("--acTextShadow", p.acTextShadow);
				st.setProperty("--acSub", p.acSub);
				if (reduced) root.className += " dsa-reduced";

				if (style.grid && !reduced) root.appendChild(el("div", "dsa-grid"));

				var veil = el("div", "dsa-veil");
				veil.style.position = "absolute";
				veil.style.inset = "0";
				veil.style.background = "radial-gradient(115% 85% at 50% 44%,rgba(14,32,58,.93) 0%,rgba(5,11,20,.975) 58%,rgba(2,5,9,.995) 100%)";
				root.appendChild(veil);
				root.appendChild(el("div", "dsa-glow"));

				var count = Number(config.particleCount);
				if (!isFinite(count)) count = DEFAULTS.particleCount;
				count = clamp(Math.round(count), 0, 60);
				if (count > 0 && !reduced) root.appendChild(buildDots(count));
				if (style.rings > 0 && !reduced) root.appendChild(buildRings(style.rings));

				var center = el("div", "dsa-center");
				center.style.position = "relative";
				center.style.display = "flex";
				center.style.flexDirection = "column";
				center.style.alignItems = "center";
				center.style.justifyContent = "center";

				if (style.whale !== "none" || style.core) {
					var mark = el("div", "dsa-mark");
					if (style.whale !== "none") mark.innerHTML = whaleSvg(id, p, style.whale);
					if (style.core) mark.appendChild(el("div", "dsa-core"));
					center.appendChild(mark);
				}
				center.appendChild(buildWord(config.word, style));
				if (style.cursor) center.appendChild(el("span", "dsa-cursor"));

				var sub = el("div", "dsa-sub");
				sub.setAttribute("aria-hidden", "true");
				sub.textContent = kind === "exit" ? config.subExit : config.subOpen;
				center.appendChild(sub);

				if (style.bar) {
					var bar = el("div", "dsa-bar");
					bar.appendChild(document.createElement("i"));
					center.appendChild(bar);
				}
				if (style.cursor && !reduced) root.appendChild(el("div", "dsa-scan"));

				root.appendChild(center);
				return root;
			}

			// ==================== 自备视频 / 动图素材（浏览器本地库，不需要宿主半） ====================
			// 为什么走 IndexedDB：窗口是沙箱（nodeIntegration:false / contextIsolation / sandbox /
			// webSecurity），file:// 不能当 <video src>，也没有资源路由可用。于是把用户选的
			// 文件（Blob）原样存进浏览器本地库，播放时用 URL.createObjectURL(blob) 生成同源地址：
			// 跨重启仍在、零网络请求、零宿主改动。
			var MEDIA_DB = "dsh-open-exit-animation-media";
			var MEDIA_STORE = "assets";
			var MEDIA_KEYS = ["open", "exit"];
			var MEDIA_LEAVE_MS = 240; // 收尾淡出时长（退场必须在桌面壳 8s 兜底内）
			var MEDIA_EXIT_CAP_MS = 7000;
			// 素材迟迟不出画（readyState 仍为 0）就直接换回代码自绘，宁可看自绘也不要黑屏
			var MEDIA_START_MS = 700;
			var assetUrls = { open: null, exit: null };
			var assetStamps = { open: 0, exit: 0 };
			var assetReady = { open: false, exit: false };
			var assetElements = { open: null, exit: null };

			function mediaKeyOf(kind) {
				return kind === "exit" ? "exit" : "open";
			}

			function mediaMetaKey(kind) {
				return mediaKeyOf(kind) === "exit" ? "mediaExit" : "mediaOpen";
			}

			function mediaLabelOf(kind) {
				return mediaKeyOf(kind) === "exit" ? "退场" : "开场";
			}

			function mediaSupported() {
				try {
					return typeof globalThis.indexedDB === "object" && globalThis.indexedDB !== null;
				} catch (error) {
					return false;
				}
			}

			function blobUrlSupported() {
				try {
					return typeof URL === "function" && typeof URL.createObjectURL === "function";
				} catch (error) {
					return false;
				}
			}

			function openMediaDb() {
				return new Promise(function (resolve, reject) {
					if (!mediaSupported()) {
						reject(new Error("当前环境没有 IndexedDB"));
						return;
					}
					var request;
					try {
						request = globalThis.indexedDB.open(MEDIA_DB, 1);
					} catch (error) {
						reject(error);
						return;
					}
					request.onupgradeneeded = function () {
						try {
							var db = request.result;
							if (!db.objectStoreNames.contains(MEDIA_STORE)) db.createObjectStore(MEDIA_STORE);
						} catch (error) {
							/* 建表失败会在后面 onsuccess/transaction 里继续报 */
						}
					};
					request.onsuccess = function () {
						resolve(request.result);
					};
					request.onerror = function () {
						reject(request.error || new Error("打开本地库失败"));
					};
					request.onblocked = function () {
						reject(new Error("本地库被其它窗口占用"));
					};
				});
			}

			/** 一次事务：run(store) 返回请求；事务完成时以 request.result 兑现。 */
			function mediaTx(mode, run) {
				return openMediaDb().then(function (db) {
					return new Promise(function (resolve, reject) {
						var tx;
						var request;
						try {
							tx = db.transaction(MEDIA_STORE, mode);
							request = run(tx.objectStore(MEDIA_STORE));
						} catch (error) {
							try {
								db.close();
							} catch (inner) {
								/* 忽略 */
							}
							reject(error);
							return;
						}
						tx.oncomplete = function () {
							try {
								db.close();
							} catch (error) {
								/* 忽略 */
							}
							resolve(request ? request.result : undefined);
						};
						tx.onerror = function () {
							try {
								db.close();
							} catch (error) {
								/* 忽略 */
							}
							reject(tx.error || new Error("本地库读写失败"));
						};
						tx.onabort = function () {
							try {
								db.close();
							} catch (error) {
								/* 忽略 */
							}
							reject(tx.error || new Error("本地库事务被中断"));
						};
					});
				});
			}

			function mediaGet(key) {
				return mediaTx("readonly", function (store) {
					return store.get(key);
				});
			}

			function mediaPut(key, record) {
				return mediaTx("readwrite", function (store) {
					return store.put(record, key);
				});
			}

			function mediaDelete(key) {
				return mediaTx("readwrite", function (store) {
					return store.delete(key);
				});
			}

			function releaseAsset(kind) {
				var key = mediaKeyOf(kind);
				if (assetUrls[key] !== null && blobUrlSupported()) {
					try {
						URL.revokeObjectURL(assetUrls[key]);
					} catch (error) {
						/* 忽略 */
					}
				}
				assetUrls[key] = null;
				assetStamps[key] = 0;
				assetReady[key] = false;
				assetElements[key] = null;
			}

			/** 把配置里声明的素材从本地库读出来（顺带预建 <video> 元素，保证开播第一帧不卡）。 */
			function hydrateMedia() {
				var config = readConfig();
				return Promise.all(
					MEDIA_KEYS.map(function (key) {
						var meta = config[mediaMetaKey(key)];
						if (!meta) {
							releaseAsset(key);
							return null;
						}
						return mediaGet(key)
							.then(function (record) {
								if (!record || !record.blob) throw new Error("本地库里已经没有这份素材");
								if (assetReady[key] === true && assetUrls[key] !== null && assetStamps[key] === record.savedAt) return null;
								releaseAsset(key);
								if (!blobUrlSupported()) throw new Error("当前环境不支持 blob URL");
								assetUrls[key] = URL.createObjectURL(record.blob);
								assetStamps[key] = record.savedAt;
								assetReady[key] = true;
								if (meta.kind === "video") {
									var video = document.createElement("video");
									video.setAttribute("playsinline", "");
									video.setAttribute("webkit-playsinline", "");
									video.muted = true;
									video.preload = "auto";
									video.src = assetUrls[key];
									if (typeof video.load === "function") {
										try {
											video.load();
										} catch (error) {
											/* 忽略 */
										}
									}
									assetElements[key] = video;
								}
								return null;
							})
							.catch(function (error) {
								releaseAsset(key);
								try {
									console.warn("[dsh-open-exit-animation] 读取" + mediaLabelOf(key) + "素材失败，先用代码自绘：" + (error && error.message ? error.message : error));
								} catch (inner) {
									/* 忽略 */
								}
								return null;
							});
					})
				);
			}

			/** 选中一段素材：配置里记元信息，二进制进本地库，成功后立刻试播一次。 */
			function pickMedia(kind, file) {
				var key = mediaKeyOf(kind);
				if (!file) return Promise.resolve(false);
				var patch = {};
				var type = typeof file.type === "string" ? file.type : "";
				var name = String(file.name || "素材").slice(0, 96);
				var isImage = /^image\//.test(type) || /\.(gif|png|jpe?g|webp|avif|bmp)$/i.test(name);
				patch[mediaMetaKey(key)] = {
					name: name,
					size: isFinite(file.size) ? Math.round(file.size) : 0,
					kind: isImage ? "image" : "video",
					type: type.slice(0, 64)
				};
				writeConfig(patch);
				return mediaPut(key, { blob: file, savedAt: Date.now(), name: name, type: type.slice(0, 64) })
					.then(function () {
						try {
							if (globalThis.navigator && globalThis.navigator.storage && typeof globalThis.navigator.storage.persist === "function") globalThis.navigator.storage.persist();
						} catch (error) {
							/* 忽略：拿不到持久化许可也不影响本次使用 */
						}
						return hydrateMedia();
					})
					.then(function () {
						notifyPanels();
						return play(key, true);
					})
					.catch(function (error) {
						try {
							console.warn("[dsh-open-exit-animation] 保存" + mediaLabelOf(key) + "素材失败（本次会话仍可试看）：" + (error && error.message ? error.message : error));
						} catch (inner) {
							/* 忽略 */
						}
						releaseAsset(key);
						if (blobUrlSupported()) {
							try {
								assetUrls[key] = URL.createObjectURL(file);
							} catch (inner) {
								assetUrls[key] = null;
							}
						}
						notifyPanels();
						return play(key, true);
					});
			}

			function clearMedia(kind) {
				var key = mediaKeyOf(kind);
				var patch = {};
				patch[mediaMetaKey(key)] = null;
				writeConfig(patch);
				releaseAsset(key);
				notifyPanels();
				return mediaDelete(key).catch(function () {
					return null;
				});
			}

			/** 本次播放该用哪份素材（没有就返回 null ⇒ 走代码自绘）。 */
			function mediaFor(kind, config) {
				var key = mediaKeyOf(kind);
				var meta = config[mediaMetaKey(key)];
				if (!meta || typeof meta !== "object") return null;
				var url = assetUrls[key];
				if (typeof url !== "string" || url === "") return null;
				return { url: url, kind: meta.kind === "image" ? "image" : "video", name: meta.name || "" };
			}

			function mediaTotalMs(kind, config) {
				if (reducedMotion()) return REDUCED_MS;
				var max = Number(config.mediaMaxMs);
				if (!isFinite(max)) max = DEFAULTS.mediaMaxMs;
				max = clamp(Math.round(max), 800, 15000);
				if (mediaKeyOf(kind) === "exit") max = Math.min(max, MEDIA_EXIT_CAP_MS);
				return max;
			}

			/** 素材层：整屏 <video> / <img>。视频元素复用（预解码），动图每次新建。 */
			function buildMediaOverlay(kind, config, asset, total) {
				var key = mediaKeyOf(kind);
				var root = el("div", "dsa-media dsa-media-" + kind);
				root.setAttribute("data-dsh-animation", kind);
				root.setAttribute("data-media", asset.kind);
				root.setAttribute("data-media-total", String(total));
				var speed = Number(config.speed);
				if (!isFinite(speed) || speed <= 0) speed = 1;
				var st = root.style;
				st.position = "fixed";
				st.left = "0";
				st.top = "0";
				st.right = "0";
				st.bottom = "0";
				st.display = "flex";
				st.alignItems = "center";
				st.justifyContent = "center";
				st.overflow = "hidden";
				st.pointerEvents = "none";
				st.zIndex = String(Z_INDEX);
				st.background = "#05070c";
				st.setProperty("--sp", String(speed));
				if (config.mediaFit === "contain") root.className += " dsa-media-contain";

				var media;
				if (asset.kind === "video") {
					media = assetElements[key];
					if (!media || media.tagName !== "VIDEO") {
						media = document.createElement("video");
						media.setAttribute("playsinline", "");
						media.setAttribute("webkit-playsinline", "");
						media.muted = true;
						media.preload = "auto";
						media.src = asset.url;
						assetElements[key] = media;
					}
					media.muted = config.mediaMuted !== false;
					media.loop = false;
					try {
						media.currentTime = 0;
					} catch (error) {
						/* 元数据没到之前设不上，忽略 */
					}
				} else {
					media = document.createElement("img");
					media.src = asset.url;
					media.setAttribute("alt", "");
				}
				media.className = "dsa-media-el";
				var ms = media.style;
				ms.width = "100%";
				ms.height = "100%";
				ms.display = "block";
				ms.objectFit = config.mediaFit === "contain" ? "contain" : "cover";
				root.appendChild(media);
				return { root: root, media: media };
			}

			/** 复用同一个 <video> 元素时，旧的 ended/error 监听必须先摘掉（否则会越积越多）。 */
			function bindMediaEvents(media, handlers) {
				var previous = media.__dsaBound;
				if (previous) {
					unbindMedia(media, previous);
				}
				media.__dsaBound = handlers;
				try {
					if (handlers.ended) media.addEventListener("ended", handlers.ended);
					if (handlers.error) media.addEventListener("error", handlers.error);
				} catch (error) {
					/* 忽略 */
				}
				return function () {
					unbindMedia(media, handlers);
					if (media.__dsaBound === handlers) media.__dsaBound = null;
				};
			}

			function unbindMedia(media, handlers) {
				try {
					if (handlers.ended) media.removeEventListener("ended", handlers.ended);
					if (handlers.error) media.removeEventListener("error", handlers.error);
				} catch (error) {
					/* 忽略 */
				}
			}

			// ==================== 播放调度 ====================
			var openFlight = null;
			var exitFlight = null;
			var seq = 0;

			/**
			 * 播放一次动画。
			 * @param kind "open" | "exit"
			 * @param force true = 忽略配置开关（手动预览用）；默认尊重 open/exit 开关，
			 *              这样把退场动画关掉时桌面壳补丁 await 到的是立即 resolve，关窗不被拖延。
			 * @param styleOverride 只本次生效的样式 id（设置页点样式卡片即时试看用，不写配置）。
			 */
			function play(kind, force, styleOverride) {
				if (kind === "exit" && exitFlight !== null) return exitFlight.promise;
				var config = readConfig();
				if (styleOverride && STYLE_MAP[styleOverride]) config.style = styleOverride;
				var enabled = force === true || (kind === "exit" ? config.exit !== false : config.open !== false);
				if (!enabled || !document.body) return Promise.resolve(false);
				var style = styleFor(config);
				var reduced = reducedMotion();
				var speed = Number(config.speed);
				if (!isFinite(speed) || speed <= 0) speed = 1;
				var base = kind === "exit" ? style.exitMs : style.openMs;
				var drawnTotal = reduced ? REDUCED_MS : Math.round(base / speed);
				var asset = mediaFor(kind, config);
				var total = asset ? mediaTotalMs(kind, config) : drawnTotal;

				if (kind === "exit" && openFlight !== null) {
					// 退出时开场动画还在播：立刻撤掉（开场 Promise 无消费者等待，不算悬挂）
					try {
						openFlight.cancel();
					} catch (error) {
						/* 忽略 */
					}
				}

				var flight = {};
				var promise = new Promise(function (resolve) {
					var timer = null;
					var guardTimer = null;
					var settled = false;
					var detach = null;
					var node = null;
					if (asset) {
						var built = buildMediaOverlay(kind, config, asset, total);
						node = built.root;
						detach = bindMediaEvents(built.media, {
							ended: function () {
								leave();
							},
							error: function () {
								fallbackToDrawn();
							}
						});
					} else {
						node = buildOverlay(kind, config, "n" + ++seq);
					}
					function clearTimer() {
						if (timer !== null) {
							clearTimeout(timer);
							timer = null;
						}
						if (guardTimer !== null) {
							clearTimeout(guardTimer);
							guardTimer = null;
						}
					}
					function dropNode() {
						if (detach) {
							try {
								detach();
							} catch (error) {
								/* 忽略 */
							}
							detach = null;
						}
						try {
							if (node.parentNode) node.parentNode.removeChild(node);
						} catch (error) {
							/* 忽略 */
						}
					}
					function settle(value) {
						if (settled) return;
						settled = true;
						clearTimer();
						dropNode();
						if (openFlight === flight) openFlight = null;
						if (exitFlight === flight) exitFlight = null;
						resolve(value);
					}
					/** 素材正常播完：先淡出 240ms 再收场，避免硬切。 */
					function leave() {
						if (settled) return;
						clearTimer();
						try {
							node.className += " dsa-media-leave";
						} catch (error) {
							/* 忽略 */
						}
						timer = setTimeout(function () {
							settle(true);
						}, MEDIA_LEAVE_MS);
					}
					/** 素材读不出来 / 解不了码：换回代码自绘，不让用户看到黑屏。 */
					function fallbackToDrawn() {
						if (settled) return;
						clearTimer();
						dropNode();
						node = buildOverlay(kind, config, "n" + ++seq);
						flight.node = node;
						document.body.appendChild(node);
						void node.offsetWidth;
						timer = setTimeout(function () {
							settle(true);
						}, drawnTotal);
					}
					flight.cancel = function () {
						settle(false);
					};
					flight.node = node;
					document.body.appendChild(node);
					// 触发一次布局，保证入场动画从首帧干净起跑
					void node.offsetWidth;
					if (asset) {
						var media = node.firstChild;
						if (media && media.tagName === "VIDEO" && typeof media.play === "function") {
							guardTimer = setTimeout(function () {
								guardTimer = null;
								if (settled) return;
								// readyState 0 = 一帧都没解出来：别让用户盯着黑屏等满整段时长
								if (media.readyState === 0) fallbackToDrawn();
							}, MEDIA_START_MS);
							try {
								var started = media.play();
								if (started && typeof started.catch === "function") {
									started.catch(function () {
										try {
											media.muted = true;
										} catch (error) {
											/* 忽略 */
										}
										var retry = media.play();
										if (retry && typeof retry.catch === "function") retry.catch(function () {});
									});
								}
							} catch (error) {
								/* 忽略：真解不了码会触发 error 事件，届时回落到自绘 */
							}
						}
					}
					timer = setTimeout(function () {
						settle(true);
					}, total);
				});

				if (kind === "exit") exitFlight = flight;
				else openFlight = flight;
				flight.promise = promise;
				return promise;
			}

			// ==================== 设置页面板（React 容器 + 纯 DOM 内容） ====================
			var panels = [];

			function notifyPanels() {
				for (var i = 0; i < panels.length; i++) {
					try {
						panels[i].refresh();
					} catch (error) {
						/* 单个面板刷新失败不影响其它 */
					}
				}
			}

			function control(tag, className, text) {
				var node = el(tag, className);
				if (text !== undefined) node.textContent = text;
				return node;
			}

			function row(labelText, controlNode) {
				var wrap = el("div", "dsa-row");
				wrap.appendChild(control("div", "k", labelText));
				var value = el("div", "v");
				value.appendChild(controlNode);
				wrap.appendChild(value);
				return wrap;
			}

			function pill(labelText, onClick) {
				var button = control("button", "dsa-pill", labelText);
				button.setAttribute("type", "button");
				button.addEventListener("click", onClick);
				return button;
			}

			function slider(min, max, step, value, onInput) {
				var input = document.createElement("input");
				input.setAttribute("type", "range");
				input.className = "dsa-range";
				input.min = String(min);
				input.max = String(max);
				input.step = String(step);
				input.value = String(value);
				input.addEventListener("input", function () {
					onInput(Number(input.value));
				});
				return input;
			}

			function stylePreview(style) {
				var box = el("div", "pv");
				var shapes = style.whale === "none" ? 0 : 1;
				for (var i = 0; i < shapes; i++) {
					var ring = document.createElement("b");
					var size = style.whale === "line" ? 20 : 22;
					ring.style.width = size + "px";
					ring.style.height = size + "px";
					box.appendChild(ring);
				}
				var dots = style.dots === 0 ? 0 : style.dots > 30 ? 5 : 3;
				for (var d = 0; d < dots; d++) {
					var dot = document.createElement("i");
					var angle = (d / dots) * Math.PI * 2;
					dot.style.left = "calc(50% + " + Math.round(Math.cos(angle) * 13) + "px)";
					dot.style.top = "calc(50% + " + Math.round(Math.sin(angle) * 9) + "px)";
					box.appendChild(dot);
				}
				return box;
			}

			/**
			 * 构建设置页面板内容（纯 DOM，可在 preview.html 里单独挂载）。
			 * 返回 { refresh, destroy }；每次配置变化都会被 notifyPanels 调 refresh 同步。
			 */
			function buildPanelDom(host) {
				if (!host) return null;
				ensureStyle();
				host.textContent = "";

				var wrap = el("div", "dsa-panel");
				wrap.appendChild(control("p", "dsa-panel-lead", "开场片头与退场片尾默认是纯代码自绘；也可以用你自己的视频 / 动图（存浏览器本地库，不上传）。改动即时保存，下一次播放生效。"));

				// ---- 动画样式 ----
				var styleCard = el("div", "dsa-card");
				styleCard.appendChild(control("h3", null, "动画样式"));
				var grid = el("div", "dsa-styles");
				var styleButtons = [];
				for (var i = 0; i < STYLES.length; i++) {
					(function (style) {
						var card = el("button", "dsa-style");
						card.setAttribute("type", "button");
						card.setAttribute("data-style-id", style.id);
						card.appendChild(stylePreview(style));
						card.appendChild(control("span", "t", style.label));
						card.appendChild(control("span", "n", style.note));
						card.addEventListener("click", function () {
							writeConfig({ style: style.id, particleCount: style.dots });
							play("open", true, style.id);
						});
						grid.appendChild(card);
						styleButtons.push(card);
					})(STYLES[i]);
				}
				styleCard.appendChild(grid);
				styleCard.appendChild(control("p", "dsa-hint", "点击卡片即切换样式并立刻试播开场动画（试播不写入配置，样式与推荐粒子数会被保存）。"));
				wrap.appendChild(styleCard);

				// ---- 开关 ----
				var switchCard = el("div", "dsa-card");
				switchCard.appendChild(control("h3", null, "开关"));
				var openPill = pill("", function () {
					writeConfig({ open: readConfig().open !== true });
				});
				var exitPill = pill("", function () {
					writeConfig({ exit: readConfig().exit !== true });
				});
				switchCard.appendChild(row("开场动画", openPill));
				switchCard.appendChild(row("退场动画", exitPill));
				var closePill = pill("", function () {
					writeConfig({ exitOnClose: readConfig().exitOnClose !== true });
				});
				switchCard.appendChild(row("点 X 关窗也播", closePill));
				switchCard.appendChild(control("p", "dsa-hint", "“托盘退出 / 退出应用”会先播完退场动画再真正退出（点过 X 后窗口在托盘里藏着，补丁会先把它亮出来再播）。“点 X 关窗”默认只隐藏到托盘、不播动画；打开上面这一项后点 X 也会先播完再隐藏。关掉“退场动画”总开关则两处都不播。"));
				wrap.appendChild(switchCard);

				// ---- 视频素材（可选）：选文件 → 存进浏览器本地库（IndexedDB），播放时用 blob: URL ----
				var mediaCard = el("div", "dsa-card");
				mediaCard.appendChild(control("h3", null, "视频素材（可选）"));
				var mediaReady = mediaSupported() && blobUrlSupported();
				var pickKind = "open";
				var fileInput = document.createElement("input");
				fileInput.setAttribute("type", "file");
				fileInput.setAttribute("accept", "video/*,image/*");
				fileInput.style.display = "none";
				fileInput.addEventListener("change", function () {
					var files = fileInput.files || [];
					var file = files.length > 0 ? files[0] : null;
					try {
						fileInput.value = "";
					} catch (error) {
						/* 忽略 */
					}
					if (file) pickMedia(pickKind, file);
				});
				// 隐藏的文件选择框挂在面板容器里（随面板一起销毁，不污染 body）
				if (host) host.appendChild(fileInput);

				var mediaNodes = {};
				for (var m = 0; m < MEDIA_KEYS.length; m++) {
					(function (key) {
						var stateText = control("span", "dsa-media-state", "未设置");
						var box = el("div", "dsa-media-row");
						var pickButton = control("button", "dsa-btn ghost", "选择…");
						pickButton.setAttribute("type", "button");
						var clearButton = control("button", "dsa-btn ghost", "清除");
						clearButton.setAttribute("type", "button");
						pickButton.addEventListener("click", function () {
							pickKind = key;
							try {
								fileInput.value = "";
							} catch (error) {
								/* 忽略 */
							}
							if (typeof fileInput.click === "function") fileInput.click();
						});
						clearButton.addEventListener("click", function () {
							clearMedia(key);
						});
						box.appendChild(stateText);
						box.appendChild(pickButton);
						box.appendChild(clearButton);
						mediaNodes[key] = { state: stateText, clear: clearButton, pick: pickButton };
						mediaCard.appendChild(row(mediaLabelOf(key) + "素材", box));
					})(MEDIA_KEYS[m]);
				}

				var mediaMutedPill = pill("", function () {
					writeConfig({ mediaMuted: readConfig().mediaMuted !== true });
				});
				mediaCard.appendChild(row("静音播放", mediaMutedPill));

				var mediaMaxValue = control("span", "dsa-num", "");
				var mediaMaxRange = slider(800, 15000, 100, DEFAULTS.mediaMaxMs, function (value) {
					writeConfig({ mediaMaxMs: value });
				});
				var mediaMaxRow = row("素材最长播放", mediaMaxRange);
				mediaMaxRow.lastChild.appendChild(mediaMaxValue);
				mediaCard.appendChild(mediaMaxRow);

				var fitPill = pill("", function () {
					writeConfig({ mediaFit: readConfig().mediaFit === "contain" ? "cover" : "contain" });
				});
				mediaCard.appendChild(row("画面适配", fitPill));

				var usageText = control("p", "dsa-hint", "本地库用量：读取中…");
				mediaCard.appendChild(usageText);
				if (mediaReady) {
					mediaCard.appendChild(control("p", "dsa-hint", "支持浏览器能自己解码的格式（mp4 / webm / mov / mkv / gif / png 等）：素材存在本机浏览器库里，不上传、不联网、重启后仍在。退场素材最长按 7 秒收尾（桌面壳兜底 8 秒），播放失败会自动回落到代码自绘。"));
				} else {
					mediaCard.appendChild(control("p", "dsa-hint", "当前环境不提供浏览器本地库（IndexedDB）或 blob URL，视频素材不可用，动画继续用代码自绘。"));
				}

				// ---- 参数 ----
				var tuning = el("div", "dsa-card");
				tuning.appendChild(control("h3", null, "参数"));
				var speedValue = control("span", "dsa-num", "");
				var speedRange = slider(0.5, 3, 0.1, 1, function (value) {
					writeConfig({ speed: value });
				});
				var speedRow = row("速度", speedRange);
				speedRow.lastChild.appendChild(speedValue);
				tuning.appendChild(speedRow);

				var dotsValue = control("span", "dsa-num", "");
				var dotsRange = slider(0, 60, 1, 26, function (value) {
					writeConfig({ particleCount: value });
				});
				var dotsRow = row("粒子数", dotsRange);
				dotsRow.lastChild.appendChild(dotsValue);
				tuning.appendChild(dotsRow);

				var swatches = el("div", "dsa-swatches");
				var swatchButtons = [];
				for (var s = 0; s < ACCENT_SWATCHES.length; s++) {
					(function (color) {
						var swatch = control("button", "dsa-swatch");
						swatch.setAttribute("type", "button");
						swatch.setAttribute("data-accent", color === "" ? "default" : color);
						swatch.style.background = color === "" ? "linear-gradient(135deg,#2f7fe0,#7fe6ff)" : color;
						swatch.addEventListener("click", function () {
							writeConfig({ accent: color });
						});
						swatches.appendChild(swatch);
						swatchButtons.push(swatch);
					})(ACCENT_SWATCHES[s]);
				}
				var colorInput = document.createElement("input");
				colorInput.setAttribute("type", "color");
				colorInput.className = "dsa-color";
				colorInput.value = "#2f7fe0";
				colorInput.addEventListener("input", function () {
					writeConfig({ accent: colorInput.value });
				});
				swatches.appendChild(colorInput);
				tuning.appendChild(row("主色", swatches));
				wrap.appendChild(tuning);

				// 素材卡放在参数之后：滑条顺序保持「速度 → 粒子 → 素材最长播放」
				wrap.appendChild(mediaCard);

				// ---- 文字 ----
				var textCard = el("div", "dsa-card");
				textCard.appendChild(control("h3", null, "文字"));
				var inputs = {};
				var fields = [
					["word", "主标题"],
					["subOpen", "开场副标题"],
					["subExit", "退场副标题"]
				];
				for (var f = 0; f < fields.length; f++) {
					(function (key, labelText) {
						var input = document.createElement("input");
						input.setAttribute("type", "text");
						input.className = "dsa-input";
						input.setAttribute("data-field", key);
						input.addEventListener("input", function () {
							var patch = {};
							patch[key] = input.value;
							writeConfig(patch);
						});
						inputs[key] = input;
						textCard.appendChild(row(labelText, input));
					})(fields[f][0], fields[f][1]);
				}
				wrap.appendChild(textCard);

				// ---- 动作 ----
				var actions = el("div", "dsa-actions");
				var previewOpen = control("button", "dsa-btn", "预览开场");
				previewOpen.setAttribute("type", "button");
				previewOpen.addEventListener("click", function () {
					play("open", true);
				});
				var previewExit = control("button", "dsa-btn ghost", "预览退场");
				previewExit.setAttribute("type", "button");
				previewExit.addEventListener("click", function () {
					play("exit", true);
				});
				var resetButton = control("button", "dsa-btn ghost", "恢复默认");
				resetButton.setAttribute("type", "button");
				resetButton.addEventListener("click", function () {
					writeConfig(DEFAULTS);
				});
				actions.appendChild(previewOpen);
				actions.appendChild(previewExit);
				actions.appendChild(resetButton);
				wrap.appendChild(actions);

				var json = control("pre", "dsa-json", "");
				wrap.appendChild(json);
				wrap.appendChild(control("p", "dsa-hint", "快捷键：Ctrl+Alt+O 预览开场 / Ctrl+Alt+X 预览退场；控制台可用 __dshAnim（get/set/reset/play/styles）。配置存于 localStorage 的 " + STORE_KEY + "。"));
				host.appendChild(wrap);

				var usageRequested = false;

				function refresh() {
					var config = readConfig();
					for (var i = 0; i < styleButtons.length; i++) {
						var active = styleButtons[i].getAttribute("data-style-id") === config.style;
						styleButtons[i].className = active ? "dsa-style on" : "dsa-style";
					}
					openPill.className = config.open === true ? "dsa-pill on" : "dsa-pill";
					openPill.textContent = config.open === true ? "已开启" : "已关闭";
					exitPill.className = config.exit === true ? "dsa-pill on" : "dsa-pill";
					exitPill.textContent = config.exit === true ? "已开启" : "已关闭";
					closePill.className = config.exitOnClose === true ? "dsa-pill on" : "dsa-pill";
					closePill.textContent = config.exitOnClose === true ? "已开启" : "已关闭";
					speedRange.value = String(config.speed);
					speedValue.textContent = config.speed.toFixed(1) + "×";
					dotsRange.value = String(config.particleCount);
					dotsValue.textContent = config.particleCount === 0 ? "关闭" : String(config.particleCount) + " 个";
					for (var s = 0; s < swatchButtons.length; s++) {
						var key = swatchButtons[s].getAttribute("data-accent");
						var selected = key === "default" ? config.accent === "" : config.accent === key;
						swatchButtons[s].className = selected ? "dsa-swatch on" : "dsa-swatch";
					}
					if (config.accent !== "") colorInput.value = config.accent;
					for (var f = 0; f < fields.length; f++) {
						var name = fields[f][0];
						if (inputs[name] !== document.activeElement) inputs[name].value = config[name];
					}
					for (var mk = 0; mk < MEDIA_KEYS.length; mk++) {
						var mediaKey = MEDIA_KEYS[mk];
						var meta = config[mediaMetaKey(mediaKey)];
						var nodes = mediaNodes[mediaKey];
						nodes.state.textContent = meta
							? (meta.kind === "image" ? "动图/图片" : "视频") + " · " + meta.name + " · " + formatSize(meta.size)
							: mediaReady ? "未设置（用代码自绘）" : "不可用";
						nodes.clear.className = meta ? "dsa-btn ghost" : "dsa-btn ghost off";
						nodes.pick.className = mediaReady ? "dsa-btn ghost" : "dsa-btn ghost off";
					}
					mediaMutedPill.className = config.mediaMuted === true ? "dsa-pill on" : "dsa-pill";
					mediaMutedPill.textContent = config.mediaMuted === true ? "静音" : "有声";
					mediaMaxRange.value = String(config.mediaMaxMs);
					mediaMaxValue.textContent = (config.mediaMaxMs / 1000).toFixed(1) + "s";
					fitPill.className = "dsa-pill on";
					fitPill.textContent = config.mediaFit === "contain" ? "完整显示" : "铺满裁切";
					if (mediaReady && !usageRequested) {
						usageRequested = true;
						try {
							if (globalThis.navigator && globalThis.navigator.storage && typeof globalThis.navigator.storage.estimate === "function") {
								globalThis.navigator.storage.estimate().then(
									function (info) {
										if (!info) return;
										usageText.textContent = "本地库用量：" + formatSize(info.usage) + " / 可用 " + formatSize(info.quota);
									},
									function () {
										usageText.textContent = "本地库用量：读取失败（不影响使用）";
									}
								);
							} else {
								usageText.textContent = "本地库用量：当前环境不提供存储信息";
							}
						} catch (error) {
							usageText.textContent = "本地库用量：读取失败（不影响使用）";
						}
					}
					json.textContent = JSON.stringify(config, null, 2);
				}

				var instance = {
					host: host,
					refresh: refresh,
					destroy: function () {
						var index = panels.indexOf(instance);
						if (index >= 0) panels.splice(index, 1);
						try {
							if (fileInput.parentNode) fileInput.parentNode.removeChild(fileInput);
						} catch (error) {
							/* 忽略 */
						}
						try {
							host.textContent = "";
						} catch (error) {
							/* 忽略 */
						}
					}
				};
				panels.push(instance);
				refresh();
				return instance;
			}

			/** settings.section 槽要的是 React 组件；内容仍旧由 buildPanelDom 生成（同一份代码也供 preview 用）。 */
			function SettingsPanel() {
				var hostRef = react.useRef(null);
				react.useEffect(function () {
					var handle = buildPanelDom(hostRef.current);
					return function () {
						if (handle) handle.destroy();
					};
				}, []);
				return react.createElement("div", { ref: hostRef, className: "dsa-panel-host" });
			}

			/** 把设置页面板挂进 settings.section（slots 服务就绪后执行；失败不影响动画）。 */
			function registerSettingsSection(ctx, slotsOverride) {
				try {
					if (react === null || typeof react.createElement !== "function") {
						console.warn("[dsh-open-exit-animation] 拿不到 react，跳过设置页面板（动画不受影响）。");
						return false;
					}
					// Cordis 里读未声明的服务会抛 cannot get property "slots" without inject：
					// 所以这里单独 try，拿不到就当作没有，绝不冒泡打断动画。
					var slots = slotsOverride || null;
					if (!slots) {
						try {
							slots = (ctx && ctx.slots) || null;
						} catch (error) {
							slots = null;
						}
					}
					if (!slots || typeof slots.inject !== "function" || typeof slots.register !== "function") return false;
					var install = function () {
						return slots.inject("settings.section", function () {
							return slots.register(
								{
									name: "settings.section",
									id: PANEL_ID,
									order: PANEL_ORDER,
									label: function () {
										return PANEL_LABEL;
									}
								},
								function () {
									return react.createElement(SettingsPanel);
								}
							);
						});
					};
					if (typeof ctx.effect === "function") ctx.effect(install, "dsh-open-exit-animation: settings section");
					else install();
					return true;
				} catch (error) {
					try {
						console.error("[dsh-open-exit-animation] 设置页面板注册失败", error);
					} catch (inner) {
						/* 忽略 */
					}
					return false;
				}
			}

			// ==================== 客户端插件入口 ====================
			function installHooks() {
				var g = globalThis;
				if (g.__dshOpenExitAnimationInstalled === true) return;
				g.__dshOpenExitAnimationInstalled = true;
				// 桌面壳补丁 await 这个函数（托盘退出 / 退出应用）：返回 Promise ⇒ 动画播完才真正退出
				g.__dshExitAnimation = function () {
					return play("exit");
				};
				// 桌面壳补丁在"点 X 关窗"时 await 这个函数；这里由配置 exitOnClose 决定播不播。
				// 默认关 ⇒ 立刻返回已完成的 Promise，窗口马上隐藏到托盘（行为等于没打补丁）。
				g.__dshCloseAnimation = function () {
					var config = readConfig();
					if (config.exitOnClose !== true) return Promise.resolve(false);
					return play("exit");
				};
				g.__dshAnim = {
					version: VERSION,
					play: play,
					open: function (style) {
						return play("open", true, style);
					},
					exit: function (style) {
						return play("exit", true, style);
					},
					styles: styleList,
					get: readConfig,
					set: writeConfig,
					reset: function () {
						return writeConfig(DEFAULTS);
					}
				};
				// 给 preview.html / 其它插件用的挂点：面板内容与样式清单
				g.__dsaPanel = {
					mount: buildPanelDom,
					styles: styleList,
					version: VERSION
				};
				g.__dsaStyles = styleList();
				// 给用户 / 其它插件用的素材接口（选文件、清除、重新水合、查状态）
				g.__dsaMedia = {
					supported: mediaSupported,
					pick: pickMedia,
					clear: clearMedia,
					hydrate: hydrateMedia,
					state: function () {
						var config = readConfig();
						return {
							supported: mediaSupported(),
							open: config.mediaOpen,
							exit: config.mediaExit,
							ready: { open: assetReady.open === true, exit: assetReady.exit === true },
							urls: { open: assetUrls.open, exit: assetUrls.exit }
						};
					}
				};
				document.addEventListener(
					"keydown",
					function (event) {
						if (event.ctrlKey !== true || event.altKey !== true || event.repeat === true) return;
						var key = String(event.key || "").toLowerCase();
						if (key === "o") {
							event.preventDefault();
							play("open", true);
						} else if (key === "x") {
							event.preventDefault();
							play("exit", true);
						}
					},
					true
				);
				try {
					console.info(
						"[dsh-open-exit-animation] " + VERSION + " ready — 设置 → " + PANEL_LABEL + " 可换样式/速度/主色/文案，也能换成你自己的视频 / 动图；Ctrl+Alt+O 预览开场，Ctrl+Alt+X 预览退场；window.__dshAnim / window.__dsaMedia 可编程调用。"
					);
				} catch (error) {
					/* 忽略 */
				}
			}

			apply = function (ctx) {
				try {
					ensureStyle();
				} catch (error) {
					/* 样式失败不阻塞动画的内联兜底 */
				}
				installHooks();
				if (ctx && typeof ctx.effect === "function") {
					try {
						ctx.effect(function () {
							return function () {
								if (openFlight !== null) openFlight.cancel();
								for (var i = panels.length - 1; i >= 0; i--) panels[i].destroy();
								releaseAsset("open");
								releaseAsset("exit");
							};
						}, "dsh-open-exit-animation: overlay teardown");
					} catch (error) {
						/* 忽略 */
					}
				}
				// 设置页面板：只走动态 inject(["slots"]) —— 不阻塞动画本体，服务后到也能拿到。
				// 不要用 ctx.slots 试探：Cordis 对未声明的服务直接抛错，真机上正是这一步吞掉了注册分支。
				try {
					if (ctx && typeof ctx.inject === "function") {
						ctx.inject(["slots"], function (scoped) {
							registerSettingsSection(scoped || ctx);
						});
					} else if (ctx) {
						var directSlots = null;
						try {
							directSlots = ctx.slots || null;
						} catch (error) {
							directSlots = null;
						}
						if (directSlots) registerSettingsSection(ctx, directSlots);
					}
				} catch (error) {
					try {
						console.error("[dsh-open-exit-animation] 设置页注册流程异常", error);
					} catch (inner) {
						/* 忽略 */
					}
				}
				// 素材水合：把本地库里的视频/动图读成 blob: URL。没有开场素材时完全不介入，
				// 保持原本时序（自检对这条路径敏感）；有素材时最多多等 1.2 秒，保证首帧就出画面。
				var hydrated = Promise.resolve();
				try {
					hydrated = hydrateMedia() || Promise.resolve();
				} catch (error) {
					hydrated = Promise.resolve();
				}
				var startOpen = function () {
					if (readConfig().open !== false) {
						setTimeout(function () {
							play("open");
						}, 120);
					}
				};
				if (readConfig().mediaOpen) {
					Promise.race([
						hydrated,
						new Promise(function (resolve) {
							setTimeout(resolve, 1200);
						})
					]).then(startOpen, startOpen);
				} else {
					startOpen();
				}
			};
			exports.apply = apply;
		} catch (error) {
			try {
				console.error("[dsh-open-exit-animation] client half failed to initialize", error);
			} catch (inner) {
				/* 忽略 */
			}
		}

		return module.exports;
	}
});
