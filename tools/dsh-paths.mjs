/**
 * 跨机器的路径解析：定位 DSH 的 app.asar 与本地状态目录。
 *
 * 公开分发时不能写死某台机器的绝对路径，所以这里按顺序找：
 *   1. 显式指定（`--asar <path>` 或环境变量 `DSH_ASAR`）
 *   2. 常见安装位置（Windows / macOS / Linux 各几个候选）
 *   3. 都没找到就报错，并把试过的路径打印出来，让用户用 `--asar` 指定。
 *
 * 状态目录（备份、manifest、语法检查临时文件）统一放 `~/.dsh/open-exit-animation`。
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const ASAR_TAIL = ["resources", "app.asar"];

function winCandidates() {
	const out = [];
	const local = process.env.LOCALAPPDATA;
	const roaming = process.env.APPDATA;
	const pf = process.env.ProgramFiles;
	const pf86 = process.env["ProgramFiles(x86)"];
	for (const base of [local ? path.join(local, "Programs") : null, pf, pf86, local]) {
		if (!base) continue;
		out.push(path.join(base, "DeepSeek Harness", ...ASAR_TAIL));
		out.push(path.join(base, "deepseek-harness", ...ASAR_TAIL));
	}
	return out;
}

function macCandidates() {
	return [
		"/Applications/DeepSeek Harness.app/Contents/Resources/app.asar",
		path.join(os.homedir(), "Applications", "DeepSeek Harness.app", "Contents", "Resources", "app.asar")
	];
}

function linuxCandidates() {
	return [
		"/opt/DeepSeek Harness/resources/app.asar",
		"/opt/deepseek-harness/resources/app.asar",
		"/usr/lib/deepseek-harness/resources/app.asar",
		"/usr/share/deepseek-harness/resources/app.asar"
	];
}

/** 所有会尝试的候选路径（按平台）。 */
export function asarCandidates() {
	const envPath = process.env.DSH_ASAR;
	const list = [
		...(envPath ? [envPath] : []),
		...(process.platform === "win32" ? winCandidates() : []),
		...(process.platform === "darwin" ? macCandidates() : []),
		...(process.platform === "linux" ? linuxCandidates() : []),
		...macCandidates(),
		...linuxCandidates()
	];
	return [...new Set(list)];
}

/**
 * 找到 app.asar 的绝对路径。
 * @param explicit 显式传入的路径（`--asar`），优先于一切
 */
export function findAsar(explicit) {
	if (explicit) {
		if (!fs.existsSync(explicit)) throw new Error(`指定的 asar 不存在：${explicit}`);
		return path.resolve(explicit);
	}
	const tried = asarCandidates();
	for (const item of tried) {
		try {
			if (fs.existsSync(item)) return path.resolve(item);
		} catch (error) {
			/* 权限问题就当没找到 */
		}
	}
	throw new Error(
		"没找到 DeepSeek Harness 的 app.asar，请用 --asar <path> 指定，或设环境变量 DSH_ASAR。\n试过：\n" +
			tried.map((item) => `  - ${item}`).join("\n")
	);
}

/** 本地状态目录：备份、manifest、临时文件（自动创建）。 */
export function stateDir() {
	const dir = path.join(os.homedir(), ".dsh", "open-exit-animation");
	fs.mkdirSync(dir, { recursive: true });
	return dir;
}

/** asar 里主进程入口的内部路径。 */
export const MAIN_ENTRY = "lib/main.js";
