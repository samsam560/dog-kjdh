#!/usr/bin/env node
/**
 * DSH 桌面壳补丁（极小、可逆）：让"托盘退出 / 退出应用"先播完插件提供的退场动画再真正退出。
 *
 * 背景（实测结论，见 README）：桌面壳的 main.js 里，窗口 close 事件只把窗口隐藏到托盘，
 * 渲染页面完全不知情（没有 beforeunload、没有 IPC 通知），所以纯插件无法在关窗时播动画。
 * 本脚本给 asar 内 lib/main.js 打两处补丁：
 *   A. window.on("close") 的收尾：先问页面 globalThis.__dshCloseAnimation()——页面自己决定播不播
 *      （插件里"点 X 关窗也播退场动画"选项，默认关 ⇒ 立刻返回已完成的 Promise，行为等于没补丁）。
 *   B. app.on("before-quit") 里 approved 分支：先把窗口亮出来（点过 X 后它在托盘里藏着，
 *      不 show 就看不到动画），再 await 页面里的 globalThis.__dshExitAnimation()，最后 finishQuit()。
 * 页面侧函数由插件 dsh-open-exit-animation 提供；函数不存在时 executeJavaScript 立刻返回
 * null ⇒ 行为与打补丁前完全一致（插件没装也不会卡住关窗）。两处都带 8 秒兜底超时。
 *
 * 关键约束：asar 头里记录了每个文件的 offset/size，所以本脚本**保持 lib/main.js 字节等长**：
 * 插入的代码变长多少字节，就从同文件里某段纯 ASCII 的 JSDoc 注释正文中删掉同样多的字节。
 * 这样无需重写 asar 头，只覆盖数据区一段即可。任何一步校验不过就直接放弃、不写入。
 *
 * 用法：
 *   node tools/patch-asar.mjs --check              仅体检：asar 是否存在、main.js 大小、是否已打补丁
 *   node tools/patch-asar.mjs --apply [--dry-run]  打补丁（先全量校验，再单次覆盖写入，写完自校验）
 *   node tools/patch-asar.mjs --restore            从备份还原 main.js（校验当前内容是否为我们的补丁版）
 *   选项：--asar <path>   指定 app.asar（默认自动探测，找不到才需要指定）
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { MAIN_ENTRY, findAsar, stateDir } from "./dsh-paths.mjs";

const DEFAULT_ASAR = null; // null = 自动探测（DSH_ASAR 环境变量 / 常见安装位置）
const STATE_DIR = stateDir();
const TIMEOUT_MS = 8000;

// ============================ 两处补丁（find 用空白宽松匹配） ============================
const PATCHES = [
	{
		label: "A: 窗口 close 问页面要不要播退场动画，再隐藏到托盘",
		find: `if (backgroundNotice === void 0) hide(); else backgroundNotice.close(hide);`,
		replace:
			`let dshAnimDone = false;\n` +
			`\t\t\tconst dshAnimOnce = () => {\n` +
			`\t\t\t\tif (dshAnimDone) return;\n` +
			`\t\t\t\tdshAnimDone = true;\n` +
			`\t\t\t\thide();\n` +
			`\t\t\t};\n` +
			`\t\t\tconst dshAnimRun = () => {\n` +
			`\t\t\t\ttry {\n` +
			`\t\t\t\t\tconst pending = window.webContents.executeJavaScript("globalThis.__dshCloseAnimation ? globalThis.__dshCloseAnimation() : null", true);\n` +
			`\t\t\t\t\tif (pending && typeof pending.then === "function") {\n` +
			`\t\t\t\t\t\tpending.then(dshAnimOnce, dshAnimOnce);\n` +
			`\t\t\t\t\t\tsetTimeout(dshAnimOnce, ${TIMEOUT_MS});\n` +
			`\t\t\t\t\t\treturn;\n` +
			`\t\t\t\t\t}\n` +
			`\t\t\t\t} catch (error) {}\n` +
			`\t\t\t\tdshAnimOnce();\n` +
			`\t\t\t};\n` +
			`\t\t\tif (backgroundNotice === void 0) dshAnimRun(); else backgroundNotice.close(dshAnimRun);`
	},
	{
		label: "B: before-quit 确认后先把窗口亮出来、播完退场动画再真正退出",
		find: `if (approved) { finishQuit(); return; }`,
		replace:
			`if (approved) {\n` +
			`\t\t\t\tif (mainWindow === void 0 || mainWindow.isDestroyed()) {\n` +
			`\t\t\t\t\tfinishQuit();\n` +
			`\t\t\t\t\treturn;\n` +
			`\t\t\t\t}\n` +
			`\t\t\t\tlet dshQuitDone = false;\n` +
			`\t\t\t\tconst dshQuitGo = () => {\n` +
			`\t\t\t\t\tif (dshQuitDone) return;\n` +
			`\t\t\t\t\tdshQuitDone = true;\n` +
			`\t\t\t\t\tfinishQuit();\n` +
			`\t\t\t\t};\n` +
			`\t\t\t\ttry {\n` +
			`\t\t\t\t\tif (typeof mainWindow.isVisible === "function" && mainWindow.isVisible() === false) mainWindow.show();\n` +
			`\t\t\t\t\tmainWindow.webContents.executeJavaScript("globalThis.__dshExitAnimation ? globalThis.__dshExitAnimation() : null", true).then(dshQuitGo, dshQuitGo);\n` +
			`\t\t\t\t\tsetTimeout(dshQuitGo, ${TIMEOUT_MS});\n` +
			`\t\t\t\t} catch (error) {\n` +
			`\t\t\t\t\tdshQuitGo();\n` +
			`\t\t\t\t}\n` +
			`\t\t\t\treturn;\n` +
			`\t\t\t}`
	}
];

// ============================ asar 读写 ============================
function parseArgs(argv) {
	const out = { mode: null, dryRun: false, asar: DEFAULT_ASAR };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i];
		if (arg === "--check") out.mode = "check";
		else if (arg === "--apply") out.mode = "apply";
		else if (arg === "--restore") out.mode = "restore";
		else if (arg === "--dry-run") out.dryRun = true;
		else if (arg === "--asar") out.asar = argv[++i];
		else {
			console.error(`未知参数：${arg}`);
			process.exit(2);
		}
	}
	if (out.mode === null) out.mode = "check";
	return out;
}

class Asar {
	constructor(file) {
		this.file = file;
		this.fd = fs.openSync(file, "r");
		const head = Buffer.alloc(16);
		fs.readSync(this.fd, head, 0, 16, 0);
		const innerSize = head.readUInt32LE(4);
		const jsonSize = head.readUInt32LE(12);
		const json = Buffer.alloc(jsonSize);
		fs.readSync(this.fd, json, 0, jsonSize, 16);
		this.headerBytes = json;
		this.header = JSON.parse(json.toString("utf8"));
		this.base = 8 + innerSize;
		this.entries = [];
		const walk = (node, prefix) => {
			for (const [name, child] of Object.entries(node.files ?? {})) {
				const p = prefix === "" ? name : `${prefix}/${name}`;
				if (child.files) walk(child, p);
				else this.entries.push({ path: p, offset: Number(child.offset), size: child.size, unpacked: child.unpacked === true });
			}
		};
		walk(this.header, "");
	}
	entry(innerPath) {
		const hit = this.entries.find((item) => item.path === innerPath);
		if (!hit) throw new Error(`asar 内找不到 ${innerPath}`);
		return hit;
	}
	read(innerPath) {
		const item = this.entry(innerPath);
		const buf = Buffer.alloc(item.size);
		fs.readSync(this.fd, buf, 0, item.size, this.base + item.offset);
		return buf;
	}
	close() {
		fs.closeSync(this.fd);
	}
}

const sha256 = (buf) => createHash("sha256").update(buf).digest("hex");

// ============================ 空注释候选（字节预算） ============================
/**
 * 扫描 JS 源码里的块注释（跳过 ' " ` 字符串、行注释、正则字面量），只返回可安全删字节的
 * JSDoc 候选：/** 开头、纯 ASCII、正文以 * 行样式为主、48 字符前缀在全文唯一。
 */
function jsdocCandidates(source) {
	const out = [];
	let index = 0;
	let previousToken = "";
	let line = 1;
	const regexAllowed = () => previousToken === "" || "(,=:[!&|?{};+-*%~^<>".includes(previousToken);
	while (index < source.length) {
		const ch = source[index];
		const next = source[index + 1];
		if (ch === "\n") {
			line += 1;
			index += 1;
			continue;
		}
		if (ch === "/" && next === "/") {
			while (index < source.length && source[index] !== "\n") index += 1;
			continue;
		}
		if (ch === "/" && next === "*") {
			const start = index;
			const startLine = line;
			index += 2;
			while (index < source.length && !(source[index] === "*" && source[index + 1] === "/")) {
				if (source[index] === "\n") line += 1;
				index += 1;
			}
			index += 2;
			out.push({ start, end: index, text: source.slice(start, index), line: startLine });
			continue;
		}
		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch;
			index += 1;
			while (index < source.length) {
				if (source[index] === "\\") {
					index += 2;
					continue;
				}
				if (source[index] === quote) {
					index += 1;
					break;
				}
				if (source[index] === "\n") line += 1;
				index += 1;
			}
			previousToken = quote;
			continue;
		}
		if (ch === "/" && regexAllowed()) {
			index += 1;
			let inClass = false;
			while (index < source.length) {
				const c = source[index];
				if (c === "\\") {
					index += 2;
					continue;
				}
				if (c === "\n") break;
				if (c === "[") inClass = true;
				else if (c === "]") inClass = false;
				else if (c === "/" && !inClass) {
					index += 1;
					break;
				}
				index += 1;
			}
			previousToken = "/";
			continue;
		}
		if (!/\s/u.test(ch)) previousToken = ch;
		index += 1;
	}
	return out
		.filter((item) => item.text.startsWith("/**"))
		.map((item) => {
			const ascii = /^[\x09\x0a\x0d\x20-\x7e]*$/u.test(item.text);
			const body = item.text.slice(3, -2);
			const prose = body.length === 0 ? 0 : (body.match(/[A-Za-z0-9 ,.;:'"()\-_/`[\]]/gu) ?? []).length / body.length;
			const lines = body.split("\n").slice(1);
			const shaped = lines.every((text) => /^\s*\*?/u.test(text));
			const anchor = body.slice(0, 48);
			const unique = anchor.length === 48 && source.split(anchor).length === 2;
			// 可删字节 = "/**" 与 "*/" 之间的正文，去掉两端各留 1 字节余量
			const usable = item.text.length - 3 - 2 - 2;
			return { ...item, ascii, prose, shaped, unique, usable, bytes: Buffer.byteLength(item.text, "utf8") };
		})
		.filter((item) => item.ascii && item.prose > 0.9 && item.shaped && item.unique && item.usable > 64)
		.sort((a, b) => b.usable - a.usable);
}

/** 从注释尾部删掉正好 need 个字节（注释仍完整闭合）。 */
function trimComment(source, candidate, need) {
	const closeAt = candidate.end - 2; // "*/" 起点
	const from = closeAt - need;
	if (from <= candidate.start + 3) throw new Error("注释余量不足");
	const removed = source.slice(from, closeAt);
	if (!/^[\x09\x0a\x0d\x20-\x7e]*$/u.test(removed)) throw new Error("待删片段不是纯 ASCII，拒绝");
	return { text: source.slice(0, from) + source.slice(closeAt), removed, line: candidate.line };
}

/**
 * 腾出正好 need 个字节：按"最大注释优先"逐个删正文尾部，每个注释至少保留 keep 字节，
 * 不够就继续找下一处（删完 offsets 会移位 ⇒ 每轮重新扫描）。
 */
function freeBytes(source, need, keep = 24) {
	const trims = [];
	let text = source;
	let remaining = need;
	for (let round = 0; remaining > 0 && round < 40; round += 1) {
		const candidates = jsdocCandidates(text);
		let picked = null;
		for (const candidate of candidates) {
			const take = Math.min(candidate.usable - keep, remaining);
			if (take > 0) {
				picked = { candidate, take };
				break;
			}
		}
		if (!picked) break;
		const result = trimComment(text, picked.candidate, picked.take);
		text = result.text;
		remaining -= picked.take;
		trims.push({ line: picked.candidate.line, removedBytes: picked.take, preview: result.removed.replace(/\s+/gu, " ").trim().slice(0, 70) });
	}
	return { text, trims, remaining };
}

// ============================ 主流程 ============================
const args = parseArgs(process.argv.slice(2));
const manifestPath = path.join(STATE_DIR, "shell-patch.json");
const backupPath = path.join(STATE_DIR, "main.js.orig");

function readManifest() {
	if (!fs.existsSync(manifestPath)) return null;
	try {
		return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
	} catch (error) {
		return null;
	}
}

function openAsar() {
	if (!args.asar) {
		// 没给 --asar 就自动探测；探测失败时把试过的路径列出来
		try {
			args.asar = findAsar();
		} catch (error) {
			console.error(`\n${error.message}\n`);
			process.exit(2);
		}
	}
	if (!fs.existsSync(args.asar)) {
		console.error(`找不到 app.asar：${args.asar}`);
		process.exit(2);
	}
	return new Asar(args.asar);
}

function syntaxCheck(source, label) {
	const tmp = path.join(STATE_DIR, `syntax-check-${label}.mjs`);
	fs.mkdirSync(STATE_DIR, { recursive: true });
	fs.writeFileSync(tmp, source, "utf8");
	try {
		execFileSync(process.execPath, ["--check", tmp], { stdio: "inherit" });
		return true;
	} catch (error) {
		return false;
	} finally {
		try {
			fs.unlinkSync(tmp);
		} catch (error) {
			/* 忽略 */
		}
	}
}

function check() {
	const asar = openAsar();
	const entry = asar.entry(MAIN_ENTRY);
	const current = asar.read(MAIN_ENTRY).toString("utf8");
	const manifest = readManifest();
	const applied = current.includes("dshAnimRun") && current.includes("dshQuitGo") && current.includes("__dshExitAnimation");
	const hasMarkers = current.includes("__dshExitAnimation");
	console.log(`asar：${args.asar}`);
	console.log(`${MAIN_ENTRY}：${entry.size} 字节，数据偏移 ${asar.base + entry.offset}`);
	console.log(`补丁状态：${applied ? "已打补丁 ✓" : hasMarkers ? "部分补丁（异常，建议 --restore 后重打）" : "未打补丁"}`);
	if (manifest) {
		const trimmed = Array.isArray(manifest.trims) ? manifest.trims.reduce((sum, item) => sum + item.removedBytes, 0) : 0;
		console.log(`上次补丁记录：${manifest.appliedAt}  净增 ${manifest.delta} 字节（从 ${manifest.trims?.length ?? 0} 处 JSDoc 共删 ${trimmed} 字节）`);
		console.log(`  原始 sha256 ${manifest.originalSha256.slice(0, 16)}… → 补丁后 ${manifest.patchedSha256.slice(0, 16)}…`);
		console.log(`  备份：${backupPath}（${fs.existsSync(backupPath) ? "存在" : "缺失"}）`);
	} else {
		console.log("上次补丁记录：无");
	}
	asar.close();
	return applied;
}

function apply(dryRun) {
	fs.mkdirSync(STATE_DIR, { recursive: true });
	const asar = openAsar();
	console.log(`asar：${args.asar}`);
	const entry = asar.entry(MAIN_ENTRY);
	const original = asar.read(MAIN_ENTRY).toString("utf8");
	const originalSha256 = sha256(Buffer.from(original, "utf8"));

	if (original.includes("__dshExitAnimation")) {
		console.log("main.js 已含 __dshExitAnimation 补丁标记 —— 看起来已经打过补丁。");
		console.log("如需重打：先 --restore，再 --apply。");
		asar.close();
		process.exit(1);
	}
	if (!syntaxCheck(original, "before")) {
		console.error("原始 main.js 未通过 node --check —— 环境异常，放弃。");
		asar.close();
		process.exit(1);
	}

	// 逐处定位（空白宽松匹配）
	let patched = original;
	const located = [];
	for (const patch of PATCHES) {
		const pattern = new RegExp(
			patch.find
				.split(/\s+/u)
				.filter((part) => part.length > 0)
				.map((part) => part.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&"))
				.join("\\s+"),
			"gu"
		);
		const hits = [...patched.matchAll(pattern)];
		if (hits.length !== 1) {
			console.error(`补丁 ${patch.label}：在 main.js 里匹配到 ${hits.length} 处（要求恰好 1 处），放弃。`);
			asar.close();
			process.exit(1);
		}
		const hit = hits[0];
		patched = patched.slice(0, hit.index) + patch.replace + patched.slice(hit.index + hit[0].length);
		located.push({ label: patch.label, at: hit.index, matched: hit[0].length });
	}

	// 字节预算：插进去多少，就从 JSDoc 注释正文里删掉多少
	const delta = Buffer.byteLength(patched, "utf8") - entry.size;
	let trims = [];
	if (delta > 0) {
		const freed = freeBytes(patched, delta);
		if (freed.remaining !== 0) {
			console.error(`需要腾出 ${delta} 字节，但只找到 ${delta - freed.remaining} 字节的可删 JSDoc 注释，放弃。`);
			asar.close();
			process.exit(1);
		}
		patched = freed.text;
		trims = freed.trims;
	} else if (delta < 0) {
		console.error(`补丁后反而少了 ${-delta} 字节（需要填充逻辑），放弃。`);
		asar.close();
		process.exit(1);
	}

	const patchedBytes = Buffer.from(patched, "utf8");
	if (patchedBytes.length !== entry.size) {
		console.error(`等长校验失败：原始 ${entry.size} 字节，补丁后 ${patchedBytes.length} 字节，放弃。`);
		asar.close();
		process.exit(1);
	}
	if (!syntaxCheck(patched, "after")) {
		console.error("补丁后的 main.js 未通过 node --check，放弃（asar 未被修改）。");
		asar.close();
		process.exit(1);
	}

	console.log("补丁计划：");
	for (const item of located) console.log(`  · ${item.label}`);
	console.log(`  · 净增 ${delta} 字节${trims.length > 0 ? `，从 ${trims.length} 处 JSDoc 注释正文等量删除：` : ""}`);
	for (const item of trims) console.log(`      - L${item.line} 删 ${item.removedBytes} 字节  ${JSON.stringify(item.preview)}`);
	console.log(`  · 原始 ${entry.size} 字节 → 补丁后 ${patchedBytes.length} 字节（等长 ✓，asar 头无需改动）`);
	console.log(`  · node --check：原始 ✓ / 补丁后 ✓`);

	if (dryRun) {
		console.log("\n--dry-run：未写入任何字节。");
		asar.close();
		return;
	}

	// 备份原始 main.js（区域备份，不是整包 121MB）
	if (!fs.existsSync(backupPath)) fs.writeFileSync(backupPath, Buffer.from(original, "utf8"));
	fs.writeFileSync(
		manifestPath,
		JSON.stringify(
			{
				appliedAt: new Date().toISOString(),
				asar: args.asar,
				entry: MAIN_ENTRY,
				dataOffset: asar.base + entry.offset,
				size: entry.size,
				originalSha256,
				patchedSha256: sha256(patchedBytes),
				delta,
				trims,
				located
			},
			null,
			2
		),
		"utf8"
	);

	// 读取失败常见于"DSH 正在运行占用 asar" —— 先把错误讲清楚
	let fd;
	try {
		fd = fs.openSync(args.asar, "r+");
	} catch (error) {
		console.error(`\n无法以读写方式打开 app.asar（${error.code}）：请完全退出 DeepSeek Harness（托盘图标右键 → 退出）后重试。`);
		asar.close();
		process.exit(1);
	}
	try {
		fs.writeSync(fd, patchedBytes, 0, patchedBytes.length, asar.base + entry.offset);
	} catch (error) {
		fs.closeSync(fd);
		console.error(`写入失败（${error.code}）：${error.message}`);
		asar.close();
		process.exit(1);
	}
	fs.closeSync(fd);

	// 写完自校验：不一致就立刻从备份还原
	const verify = Buffer.alloc(entry.size);
	fs.readSync(asar.fd, verify, 0, entry.size, asar.base + entry.offset);
	if (sha256(verify) !== sha256(patchedBytes)) {
		console.error("写入后自校验失败 —— 立即回滚到备份。");
		const rollback = fs.openSync(args.asar, "r+");
		fs.writeSync(rollback, Buffer.from(original, "utf8"), 0, entry.size, asar.base + entry.offset);
		fs.closeSync(rollback);
		asar.close();
		process.exit(1);
	}
	console.log(`\n✓ 补丁已写入 app.asar（main.js ${entry.size} 字节等长替换，asar 头未动）。`);
	console.log(`  备份：${backupPath}`);
	console.log(`  还原：node tools/patch-asar.mjs --restore`);
	console.log("  注意：必须完全退出并重新启动 DeepSeek Harness 才生效。");
	asar.close();
}

function restore() {
	const manifest = readManifest();
	if (!manifest) {
		console.error("没有补丁记录，无法还原。");
		process.exit(1);
	}
	if (!fs.existsSync(backupPath)) {
		console.error(`备份缺失：${backupPath}`);
		process.exit(1);
	}
	const asar = openAsar();
	console.log(`asar：${args.asar}`);
	const current = asar.read(MAIN_ENTRY);
	const backup = fs.readFileSync(backupPath);
	if (sha256(current) === sha256(backup)) {
		console.log("main.js 已与备份一致（未打补丁）。");
		asar.close();
		return;
	}
	if (sha256(current) !== manifest.patchedSha256) {
		console.error("当前 main.js 既不是备份内容、也不是我们写入的补丁版（可能是 DSH 升级过）—— 拒绝覆盖。");
		console.error(`  当前 ${sha256(current).slice(0, 16)}…  期望补丁版 ${manifest.patchedSha256.slice(0, 16)}…`);
		asar.close();
		process.exit(1);
	}
	if (backup.length !== manifest.size) {
		console.error(`备份大小异常（${backup.length} ≠ ${manifest.size}），拒绝写入。`);
		asar.close();
		process.exit(1);
	}
	let fd;
	try {
		fd = fs.openSync(args.asar, "r+");
	} catch (error) {
		console.error(`无法以读写方式打开 app.asar（${error.code}）：请完全退出 DeepSeek Harness 后重试。`);
		asar.close();
		process.exit(1);
	}
	fs.writeSync(fd, backup, 0, backup.length, manifest.dataOffset);
	fs.closeSync(fd);
	const verify = asar.read(MAIN_ENTRY);
	console.log(sha256(verify) === sha256(backup) ? "✓ 已还原原始 main.js（请重启 DeepSeek Harness）。" : "✗ 还原后自校验失败，请手动恢复。");
	asar.close();
}

if (args.mode === "apply") apply(args.dryRun);
else if (args.mode === "restore") restore();
else check();
