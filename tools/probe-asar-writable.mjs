// 安全性预检：DSH 正在运行时 app.asar 是否可写？只做"读到什么就写回什么"的空写，不改任何字节。
import fs from "node:fs";
import { findAsar } from "./dsh-paths.mjs";

const ASAR = process.argv[2] ?? findAsar();
const probe = Buffer.alloc(1);
let fd;
try {
	fd = fs.openSync(ASAR, "r+");
} catch (error) {
	console.log(`不可写：open r+ 失败 ${error.code} ${error.message}`);
	process.exit(1);
}
try {
	const at = fs.fstatSync(fd).size - 1;
	fs.readSync(fd, probe, 0, 1, at);
	fs.writeSync(fd, probe, 0, 1, at);
	fs.fsyncSync(fd);
	console.log(`可写 ✓（在偏移 ${at} 做了 1 字节空写并 fsync，字节未变：0x${probe[0].toString(16)}）`);
} catch (error) {
	console.log(`不可写：写入失败 ${error.code} ${error.message}`);
	process.exit(1);
} finally {
	fs.closeSync(fd);
}
