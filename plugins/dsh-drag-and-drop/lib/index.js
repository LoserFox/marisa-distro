import { homedir, platform } from "node:os";
import { basename, join, normalize, resolve, sep } from "node:path";
import { access, constants, open, readdir, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
function normalizedDirectoryPath(path) {
	const normalized = path.normalize("NFC").replaceAll("\\", "/");
	const parts = normalized.split("/");
	if (normalized.startsWith("/") || parts.some((part) => part === "" || part === "." || part === "..")) throw new TypeError("invalid directory-relative path");
	return normalized;
}
function canonicalDirectoryEntries(entries) {
	return entries.map((entry) => ({
		path: normalizedDirectoryPath(entry.path),
		kind: entry.kind,
		...entry.kind === "file" ? { size: entry.size ?? 0 } : {}
	})).sort((a, b) => a.path.localeCompare(b.path) || a.kind.localeCompare(b.kind));
}
function directoryStructureDigest(structure) {
	const hash = createHash("sha256");
	hash.update(structure.truncated ? "truncated\n" : "complete\n");
	for (const entry of canonicalDirectoryEntries(structure.entries)) hash.update(`${entry.kind}\0${entry.path}\0${entry.size ?? ""}\n`);
	return hash.digest("hex");
}
function selectDirectorySamplePaths(entries) {
	return canonicalDirectoryEntries(entries).filter((entry) => entry.kind === "file").map((entry) => ({
		path: entry.path,
		rank: createHash("sha256").update(entry.path).digest("hex")
	})).sort((a, b) => a.rank.localeCompare(b.rank) || a.path.localeCompare(b.path)).slice(0, 24).map((entry) => entry.path);
}
function directoryContentDigest(samples) {
	const hash = createHash("sha256");
	for (const sample of [...samples].sort((a, b) => a.path.localeCompare(b.path))) hash.update(`${normalizedDirectoryPath(sample.path)}\0${sample.size}\0${sample.digest}\n`);
	return hash.digest("hex");
}
//#endregion
//#region lib/types/protocol.js
const FILE_DROP_ROUTE = "/file-drop/locate";
const SAMPLE_BYTES = 64 * 1024;
//#endregion
//#region lib/types/fingerprint.js
function sampleRanges(size) {
	if (!Number.isSafeInteger(size) || size < 0) throw new TypeError("size must be a non-negative safe integer");
	if (size <= 65536 * 3) return [{
		start: 0,
		length: size
	}];
	return [
		0,
		Math.max(0, Math.floor(size / 2) - Math.floor(SAMPLE_BYTES / 2)),
		size - SAMPLE_BYTES
	].map((start) => ({
		start,
		length: Math.min(SAMPLE_BYTES, size - start)
	}));
}
function hashParts(size, parts) {
	const hash = createHash("sha256");
	const header = Buffer.allocUnsafe(8);
	header.writeBigUInt64BE(BigInt(size));
	hash.update(header);
	for (const part of parts) hash.update(part);
	return hash.digest("hex");
}
async function sampleFingerprint(path, size) {
	const handle = await open(path, "r");
	try {
		const parts = [];
		for (const range of sampleRanges(size)) {
			const buffer = Buffer.allocUnsafe(range.length);
			const { bytesRead } = await handle.read(buffer, 0, range.length, range.start);
			parts.push(buffer.subarray(0, bytesRead));
		}
		return hashParts(size, parts);
	} finally {
		await handle.close();
	}
}
async function fullFingerprint(path) {
	const handle = await open(path, "r");
	try {
		const hash = createHash("sha256");
		const buffer = Buffer.allocUnsafe(256 * 1024);
		let position = 0;
		while (true) {
			const { bytesRead } = await handle.read(buffer, 0, buffer.length, position);
			if (bytesRead === 0) break;
			hash.update(buffer.subarray(0, bytesRead));
			position += bytesRead;
		}
		return hash.digest("hex");
	} finally {
		await handle.close();
	}
}
//#endregion
//#region lib/types/directory-node.js
async function readNodeDirectoryStructure(root) {
	const entries = [];
	let truncated = false;
	const visit = async (directory, prefix, depth) => {
		if (depth >= 32) {
			truncated = true;
			return;
		}
		let children;
		try {
			children = await readdir(directory, { withFileTypes: true });
		} catch {
			truncated = true;
			return;
		}
		children.sort((a, b) => a.name.normalize("NFC").localeCompare(b.name.normalize("NFC")));
		for (const child of children) {
			if (entries.length >= 1e4) {
				truncated = true;
				return;
			}
			const relativePath = prefix === "" ? child.name : `${prefix}/${child.name}`;
			const absolutePath = join(directory, child.name);
			if (child.isSymbolicLink()) continue;
			if (child.isDirectory()) {
				entries.push({
					path: relativePath,
					kind: "directory"
				});
				await visit(absolutePath, relativePath, depth + 1);
			} else if (child.isFile()) try {
				entries.push({
					path: relativePath,
					kind: "file",
					size: (await stat(absolutePath)).size
				});
			} catch {
				truncated = true;
			}
		}
	};
	await visit(root, "", 0);
	return {
		entries,
		truncated
	};
}
async function nodeDirectoryStructureDigest(path) {
	const structure = await readNodeDirectoryStructure(path);
	return {
		digest: directoryStructureDigest(structure),
		paths: selectDirectorySamplePaths(structure.entries)
	};
}
async function nodeDirectoryContentDigest(root, paths) {
	const samples = [];
	for (const path of paths) {
		const absolutePath = join(root, ...normalizedDirectoryPath(path).split("/"));
		const info = await stat(absolutePath);
		if (!info.isFile()) continue;
		samples.push({
			path,
			size: info.size,
			digest: await sampleFingerprint(absolutePath, info.size)
		});
	}
	return directoryContentDigest(samples);
}
//#endregion
//#region lib/types/platform-search.js
const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 3e3;
const host = {
	platform: platform(),
	home: homedir(),
	async commandExists(command) {
		if (command.includes("/") || command.includes("\\")) try {
			await access(command, constants.X_OK);
			return true;
		} catch {
			return false;
		}
		const probe = platform() === "win32" ? "where.exe" : "/usr/bin/env";
		const args = platform() === "win32" ? [command] : [
			"sh",
			"-c",
			"command -v \"$1\" >/dev/null 2>&1",
			"sh",
			command
		];
		try {
			await execFileAsync(probe, args, { timeout: 1e3 });
			return true;
		} catch {
			return false;
		}
	},
	async exec(command, args) {
		const { stdout } = await execFileAsync(command, [...args], {
			timeout: COMMAND_TIMEOUT_MS,
			maxBuffer: 1024 * 1024,
			windowsHide: true
		});
		return stdout;
	},
	async windowsDrives() {
		try {
			return (await this.exec("powershell.exe", [
				"-NoProfile",
				"-NonInteractive",
				"-Command",
				"[System.IO.DriveInfo]::GetDrives() | Where-Object {$_.DriveType -eq \"Fixed\" -and $_.IsReady} | ForEach-Object {$_.RootDirectory.FullName}"
			])).split(/\r?\n/).filter(Boolean);
		} catch {
			return [];
		}
	}
};
function lines(value) {
	return value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 100);
}
async function macSearch(name, runtime) {
	const escaped = name.replaceAll("\\", "\\\\").replaceAll("\"", "\\\"");
	try {
		return lines(await runtime.exec("/usr/bin/mdfind", [`kMDItemFSName == "${escaped}"c`]));
	} catch {
		return [];
	}
}
async function linuxSearch(name, runtime) {
	for (const command of ["plocate", "locate"]) {
		if (!await runtime.commandExists(command)) continue;
		try {
			return lines(await runtime.exec(command, [
				"--basename",
				"--limit",
				String(400),
				name
			])).filter((path) => path.split("/").at(-1) === name).slice(0, 100);
		} catch {}
	}
	return [];
}
function powershellLiteral(value) {
	return `'${value.replaceAll("'", "''")}'`;
}
async function windowsSearch(name, runtime) {
	for (const command of ["es.exe", "Everything.exe"]) {
		if (!await runtime.commandExists(command)) continue;
		try {
			return lines(await runtime.exec(command, [
				"-n",
				String(100),
				"-whole-filename",
				name
			]));
		} catch {}
	}
	if (!await runtime.commandExists("powershell.exe")) return [];
	const roots = [runtime.home, ...await runtime.windowsDrives()];
	const script = [
		`$name=${powershellLiteral(name)}`,
		`$roots=@(${roots.map(powershellLiteral).join(",")}) | Select-Object -Unique`,
		`$roots | ForEach-Object { Get-ChildItem -LiteralPath $_ -Filter $name -File -Recurse -Force -ErrorAction SilentlyContinue }`,
		`| Select-Object -First ${String(100)} -ExpandProperty FullName`
	].join(" ");
	try {
		return lines(await runtime.exec("powershell.exe", [
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			script
		]));
	} catch {
		return [];
	}
}
async function indexedSearch(name, runtime = host) {
	if (runtime.platform === "darwin") return macSearch(name, runtime);
	if (runtime.platform === "linux") return linuxSearch(name, runtime);
	if (runtime.platform === "win32") return windowsSearch(name, runtime);
	return [];
}
async function broadSearchRoots(runtime = host) {
	if (runtime.platform === "linux") {
		const roots = [runtime.home];
		for (const parent of ["/mnt", "/media"]) try {
			for (const entry of await readdir(parent, { withFileTypes: true })) if (entry.isDirectory()) roots.push(join(parent, entry.name));
		} catch {}
		return roots;
	}
	if (runtime.platform === "win32") return [runtime.home, ...await runtime.windowsDrives()];
	return [];
}
//#endregion
//#region lib/types/locator.js
const MAX_CANDIDATES = 100;
const MAX_WALK_ENTRIES = 2e4;
const WALK_DEPTH = 12;
async function directCandidate(root, name, kind) {
	const path = join(root, name);
	try {
		const info = await stat(path);
		return (kind === "file" ? info.isFile() : info.isDirectory()) ? path : void 0;
	} catch {
		return;
	}
}
async function walkByName(root, name, kind, depth = WALK_DEPTH) {
	const found = [];
	let visited = 0;
	const visit = async (directory, remaining) => {
		if (remaining < 0 || found.length >= MAX_CANDIDATES || visited >= MAX_WALK_ENTRIES) return;
		let entries;
		try {
			entries = await readdir(directory, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (++visited >= MAX_WALK_ENTRIES || found.length >= MAX_CANDIDATES) break;
			const path = join(directory, entry.name);
			if (entry.name === name && (kind === "file" ? entry.isFile() : entry.isDirectory())) found.push(path);
			if (entry.isDirectory() && !entry.isSymbolicLink()) await visit(path, remaining - 1);
		}
	};
	await visit(root, depth);
	return found;
}
async function validateCandidates(item, paths) {
	const candidates = [];
	for (const path of [...new Set(paths)].slice(0, MAX_CANDIDATES)) try {
		const info = await stat(path);
		if ((item.kind === "file" ? info.isFile() && info.size === item.size : info.isDirectory()) && basename(path) === item.name) candidates.push({
			path: normalize(path),
			mtimeMs: info.mtimeMs
		});
	} catch {}
	return candidates.sort((a, b) => item.kind === "file" ? Math.abs(a.mtimeMs - item.lastModified) - Math.abs(b.mtimeMs - item.lastModified) || a.path.localeCompare(b.path) : a.path.localeCompare(b.path));
}
async function directCandidates(item, roots) {
	return validateCandidates(item, (await Promise.all(roots.map((root) => directCandidate(root, item.name, item.kind)))).filter((path) => path !== void 0));
}
async function recursiveCandidates(item, roots) {
	const paths = [];
	for (const root of roots) paths.push(...await walkByName(root, item.name, item.kind));
	return validateCandidates(item, paths);
}
function pathsInside(paths, roots) {
	const canonicalRoots = roots.map((root) => resolve(root));
	return paths.filter((path) => {
		const candidate = resolve(path);
		return canonicalRoots.some((root) => candidate === root || candidate.startsWith(`${root}${sep}`));
	});
}
async function metadataCandidates(item, request) {
	const current = request.currentWorkspacePath;
	const otherWorkspaces = [...new Set(request.workspacePaths ?? [])].filter((root) => typeof root === "string" && root !== "").filter((root) => root !== current);
	const commonRoots = [
		join(homedir(), "Desktop"),
		join(homedir(), "Documents"),
		join(homedir(), "Downloads")
	];
	const rootGroups = [
		current === void 0 ? [] : [current],
		otherWorkspaces,
		commonRoots
	];
	const indexedPaths = await indexedSearch(item.name);
	for (const roots of rootGroups) {
		const direct = await directCandidates(item, roots);
		if (direct.length > 0) return direct;
		const indexed = await validateCandidates(item, pathsInside(indexedPaths, roots));
		if (indexed.length > 0) return indexed;
		const recursive = await recursiveCandidates(item, roots);
		if (recursive.length > 0) return recursive;
	}
	const globalIndexed = await validateCandidates(item, indexedPaths);
	if (globalIndexed.length > 0) return globalIndexed;
	return recursiveCandidates(item, await broadSearchRoots());
}
async function matchingFileDigest(candidates, digest, phase, file) {
	const matched = [];
	for (const path of candidates.slice(0, MAX_CANDIDATES)) try {
		if ((phase === "sample" ? await sampleFingerprint(path, file.size) : await fullFingerprint(path)) === digest) matched.push(path);
	} catch {}
	return matched;
}
async function locateDirectoryStructure(request) {
	if (request.file.kind !== "directory" || request.file.structure === void 0 || request.candidates === void 0) return {
		status: "error",
		message: "directory structure phase requires candidates and structure"
	};
	const candidates = request.candidates;
	const expected = directoryStructureDigest(request.file.structure);
	const matched = [];
	let samplePaths = selectDirectorySamplePaths(request.file.structure.entries);
	for (const path of candidates) try {
		const actual = await nodeDirectoryStructureDigest(path);
		if (actual.digest === expected) {
			matched.push(path);
			samplePaths = actual.paths;
		}
	} catch {}
	if (matched.length === 0) return { status: "not-found" };
	if (matched.length === 1) return {
		status: "found",
		path: matched[0]
	};
	if (samplePaths.length === 0) return {
		status: "choose",
		candidates: matched
	};
	return {
		status: "directory-content-required",
		candidates: matched,
		paths: samplePaths
	};
}
async function locate(request) {
	if (request.file.name === "") return {
		status: "error",
		message: "invalid dropped entry metadata"
	};
	if (request.file.kind === void 0) request = {
		...request,
		file: {
			...request.file,
			kind: "file"
		}
	};
	if (request.file.kind === "directory") {
		if (request.phase === "metadata") {
			const candidates = await metadataCandidates(request.file, request);
			if (candidates.length === 0) return { status: "not-found" };
			if (candidates.length === 1) return {
				status: "found",
				path: candidates[0].path
			};
			return {
				status: "directory-structure-required",
				candidates: candidates.map((candidate) => candidate.path)
			};
		}
		if (request.phase === "directory-structure") return locateDirectoryStructure(request);
		if (request.phase !== "directory-content" || request.candidates === void 0 || request.directorySamples === void 0) return {
			status: "error",
			message: "invalid directory phase"
		};
		const expected = directoryContentDigest(request.directorySamples);
		const paths = request.directorySamples.map((sample) => sample.path);
		const matched = [];
		for (const path of request.candidates.slice(0, MAX_CANDIDATES)) try {
			if (await nodeDirectoryContentDigest(path, paths) === expected) matched.push(path);
		} catch {}
		if (matched.length === 0) return { status: "not-found" };
		if (matched.length === 1) return {
			status: "found",
			path: matched[0]
		};
		return {
			status: "choose",
			candidates: matched
		};
	}
	if (!Number.isSafeInteger(request.file.size) || request.file.size < 0) return {
		status: "error",
		message: "invalid dropped-file metadata"
	};
	if (request.phase === "metadata") {
		const candidates = await metadataCandidates(request.file, request);
		if (candidates.length === 0) return { status: "not-found" };
		if (candidates.length === 1) return {
			status: "found",
			path: candidates[0].path
		};
		return {
			status: "sample-required",
			candidates: candidates.map((candidate) => candidate.path)
		};
	}
	if (request.phase !== "sample" && request.phase !== "full" || request.digest === void 0 || request.candidates === void 0) return {
		status: "error",
		message: "digest phase requires candidates and digest"
	};
	const matched = await matchingFileDigest(request.candidates, request.digest, request.phase, request.file);
	if (matched.length === 0) return { status: "not-found" };
	if (matched.length === 1) return {
		status: "found",
		path: matched[0]
	};
	if (request.phase === "sample" && request.file.size <= 8388608) return {
		status: "choose",
		candidates: matched
	};
	if (request.phase === "sample") return {
		status: "full-required",
		candidates: matched
	};
	return {
		status: "choose",
		candidates: matched
	};
}
//#endregion
//#region lib/types/index.js
const inject = ["webServer"];
const MAX_BODY_BYTES = 4 * 1024 * 1024;
async function readJson(req) {
	const chunks = [];
	let size = 0;
	for await (const chunk of req) {
		const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
		size += buffer.length;
		if (size > 4194304) throw new Error("request body too large");
		chunks.push(buffer);
	}
	return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
function sendJson(res, status, body) {
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"cache-control": "no-store",
		"x-content-type-options": "nosniff"
	});
	res.end(JSON.stringify(body));
}
function apply(ctx) {
	ctx.effect(() => ctx.webServer.register({
		kind: "exact",
		path: FILE_DROP_ROUTE,
		handler: async (req, res) => {
			if (req.method !== "POST") {
				sendJson(res, 405, {
					status: "error",
					message: "method not allowed"
				});
				return;
			}
			try {
				sendJson(res, 200, await locate(await readJson(req)));
			} catch (error) {
				sendJson(res, 400, {
					status: "error",
					message: error instanceof Error ? error.message : String(error)
				});
			}
		}
	}), "file-drop: locator route");
}
//#endregion
export { MAX_BODY_BYTES, apply, inject };
