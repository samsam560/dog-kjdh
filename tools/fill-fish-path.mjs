/**
 * 把 lib/client.js 里的 `@@FISH_PATH@@` 占位符替换成真实的 DeepSeek 鲸鱼剪影路径。
 *
 * 用法：node tools/fill-fish-path.mjs [fish-path.json 路径]
 * 默认从 ~/.dsh/tmp-asar/fish-path.json 读取（该文件由 extract-fish.mjs
 * 从 @deepseek-ai/dsh-client-ui-primitives 的 FISH_LOGO_PATH 提取）。
 * 也接受 --path "M…" 直接传路径字符串，或 --from-file <file>（文件内容即路径）。
 */
import { readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const clientPath = resolve(here, "..", "lib", "client.js");
const PLACEHOLDER = "@@FISH_PATH@@";

const argv = process.argv.slice(2);
let fishPath = null;

const pathFlag = argv.indexOf("--path");
const fileFlag = argv.indexOf("--from-file");
if (pathFlag !== -1) {
	fishPath = argv[pathFlag + 1];
} else if (fileFlag !== -1) {
	fishPath = readFileSync(argv[fileFlag + 1], "utf8").trim();
} else {
	const jsonPath = argv.find((a) => !a.startsWith("--")) ?? join(homedir(), ".dsh", "tmp-asar", "fish-path.json");
	const raw = JSON.parse(readFileSync(jsonPath, "utf8"));
	if (typeof raw === "string") fishPath = raw;
	else {
		for (const key of ["path", "d", "FISH_LOGO_PATH", "fishPath", "value"]) {
			if (typeof raw?.[key] === "string") {
				fishPath = raw[key];
				break;
			}
		}
	}
}

if (typeof fishPath !== "string" || fishPath.length < 20) {
	console.error("未取得有效的鲸鱼路径；请检查输入文件或使用 --path。");
	process.exit(1);
}
if (/["'`\\]/.test(fishPath)) {
	console.error("路径含引号或反斜杠，不能安全内联进双引号字符串。");
	process.exit(1);
}

const source = readFileSync(clientPath, "utf8");
if (!source.includes(PLACEHOLDER)) {
	const already = /var FISH_PATH = "(M[^"]{40,})"/.exec(source);
	console.log(already ? `占位符已替换过（现有路径 ${already[1].length} 字符），未改动。` : "未找到占位符 " + PLACEHOLDER + "，未改动。");
	process.exit(already ? 0 : 1);
}
writeFileSync(clientPath, source.replace(PLACEHOLDER, fishPath), "utf8");
console.log(`已写入鲸鱼路径（${fishPath.length} 字符）→ ${clientPath}`);
