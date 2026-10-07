/**
 * 扫描一个 JS 文件里的块注释，按体积列出候选（给 shell 补丁换算字节用）。
 *
 * 补丁要求 asar 内 lib/main.js 保持"字节等长"，所以插入的代码必须从别处的注释里等量删掉。
 * 本脚本用带字符串/注释状态机的小扫描器找出真实块注释（跳过 ' " ` 字符串、行注释、块注释、
 * 以及 / 作为正则起点的情形），并按字节数从大到小打印，附带：是否纯 ASCII、是否可作为锚点
 * （在全文里是否唯一）、内容预览。
 *
 * 用法：node tools/scan-comments.mjs <file> [topN]
 */
import { readFileSync } from "node:fs";

const file = process.argv[2];
const topN = Number(process.argv[3] ?? 25);
if (!file) {
	console.error("用法：node tools/scan-comments.mjs <file> [topN]");
	process.exit(1);
}
const source = readFileSync(file, "utf8");

/** 上一个非空白有效 token 的最后一个字符（决定 `/` 是正则还是除号）。 */
function regexAllowed(previous) {
	if (previous === "") return true;
	return "(,=:[!&|?{};+-*%~^<>".includes(previous);
}

const comments = [];
let index = 0;
let previousToken = "";
let line = 1;
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
		const text = source.slice(start, index);
		comments.push({ start, end: index, text, line: startLine });
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
	if (ch === "/" && regexAllowed(previousToken)) {
		// 正则字面量：跳到未转义的 /，再吃掉 flags
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

const rows = comments
	.map((comment) => {
		const bytes = Buffer.byteLength(comment.text, "utf8");
		const ascii = /^[\x09\x0a\x0d\x20-\x7e]*$/u.test(comment.text);
		const body = comment.text.replace(/^\/\*+|\*\/$/gu, "").trim();
		const prose = body.length === 0 ? 0 : (body.match(/[A-Za-z0-9 ,.;:'"()\-_/`[\]]/gu) ?? []).length / body.length;
		const anchorCandidate = body.length >= 24 ? body.slice(0, 48) : "";
		const unique = anchorCandidate !== "" && source.split(anchorCandidate).length === 2;
		return { ...comment, bytes, ascii, prose, body, anchorCandidate, unique };
	})
	.filter((row) => row.bytes >= 160)
	.sort((a, b) => b.bytes - a.bytes);

console.log(`文件 ${file}：${source.length} 字符 / ${Buffer.byteLength(source, "utf8")} 字节；块注释 ${comments.length} 处，≥160 字节的 ${rows.length} 处`);
console.log("");
for (const row of rows.slice(0, topN)) {
	console.log(
		`#${String(row.bytes).padStart(6)}B  L${String(row.line).padStart(6)}  ascii=${row.ascii ? "Y" : "n"}  prose=${(row.prose * 100).toFixed(0)}%  anchorUnique=${row.unique ? "Y" : "n"}`
	);
	console.log(`        ${JSON.stringify(row.anchorCandidate.slice(0, 60))}`);
}
const totalBytes = rows.filter((r) => r.ascii && r.prose > 0.85).reduce((sum, r) => sum + r.bytes - 4, 0);
console.log("");
console.log(`可用（纯 ASCII + 正文占比>85%）的注释总余量：${totalBytes} 字节`);
