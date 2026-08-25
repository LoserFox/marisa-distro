// dsh-bash-terminal (Marisa fork) unit tests — pure functions only.
// Run: node --test test/unit.mjs  (peer deps resolve from the workspace
// node_modules; see README "测试" section for the junction setup).
import { test } from "node:test";
import assert from "node:assert/strict";
import { candidateMsys2Paths, buildArgv, buildEnv, SHELLS, DEFAULT_MSYSTEM, internals } from "../lib/index.js";
import { terminalArgv } from "../lib/terminal.js";

const { resolveAllPaths } = internals;

const ENV = {
  ProgramFiles: "C:\\Program Files",
  SystemRoot: "C:\\Windows",
  LOCALAPPDATA: "C:\\Users\\me\\AppData\\Local",
  PATH: "C:\\msys64\\usr\\bin;C:\\Program Files\\Git\\bin;C:\\Windows\\System32"
};

test("SHELLS catalog includes the four backends", () => {
  assert.deepEqual(SHELLS, ["powershell", "msys2", "gitbash", "wsl"]);
});

test("candidateMsys2Paths finds the well-known C:\\msys64 root first", () => {
  const candidates = candidateMsys2Paths(ENV);
  assert.equal(candidates[0], "C:\\msys64\\usr\\bin\\bash.exe");
});

test("candidateMsys2Paths excludes System32 and Git-for-Windows PATH entries", () => {
  const candidates = candidateMsys2Paths(ENV);
  // C:\Windows\System32 is excluded by the systemRoot filter.
  assert.ok(!candidates.some((c) => c.toLowerCase().includes("system32")), "System32 must not be a candidate");
  // C:\Program Files\Git\bin does not end with usr\bin -> skipped by shape filter.
  // A hypothetical Git usr\bin entry is excluded by the \git\ filter.
  const withGitUsrBin = candidateMsys2Paths({ ...ENV, PATH: "C:\\Program Files\\Git\\usr\\bin;C:\\msys64\\usr\\bin" });
  assert.ok(!withGitUsrBin.some((c) => c.toLowerCase().includes("git")), "Git for Windows bash must not be detected as msys2");
  assert.ok(withGitUsrBin.includes("C:\\msys64\\usr\\bin\\bash.exe"));
});

test("resolveAllPaths honors msys2Root config and falls back to detection", () => {
  const detected = resolveAllPaths({}, ENV);
  assert.equal(detected.msys2, "C:\\msys64\\usr\\bin\\bash.exe");
  const configured = resolveAllPaths({ msys2Root: "D:\\dev\\msys64" }, ENV);
  assert.equal(configured.msys2, "D:\\dev\\msys64\\usr\\bin\\bash.exe");
});

test("buildArgv builds msys2 -lc argv", () => {
  const argv = buildArgv("msys2", "echo hi", { msys2: "C:\\msys64\\usr\\bin\\bash.exe" });
  assert.deepEqual(argv, ["C:\\msys64\\usr\\bin\\bash.exe", "-lc", "echo hi"]);
});

test("buildArgv wsl honors distro", () => {
  const paths = { wsl: "C:\\Windows\\System32\\wsl.exe" };
  assert.deepEqual(buildArgv("wsl", "uname -a", paths, "Ubuntu-22.04"), ["C:\\Windows\\System32\\wsl.exe", "-d", "Ubuntu-22.04", "-e", "bash", "-lc", "uname -a"]);
  assert.deepEqual(buildArgv("wsl", "uname -a", paths, ""), ["C:\\Windows\\System32\\wsl.exe", "-e", "bash", "-lc", "uname -a"]);
});

test("buildArgv rejects unknown shells", () => {
  assert.throws(() => buildArgv("csh", "x", {}, undefined), /invalid shell/);
});

test("buildEnv injects MSYSTEM for msys2 only when unset", () => {
  const env = buildEnv("msys2", { DSH_X: "1" });
  assert.equal(env.MSYSTEM, DEFAULT_MSYSTEM);
  const custom = buildEnv("msys2", {}, "MSYS");
  assert.equal(custom.MSYSTEM, "MSYS");
  const kept = buildEnv("msys2", { MSYSTEM: "UCRT64" });
  assert.equal(kept.MSYSTEM, "UCRT64");
  const pwsh = buildEnv("powershell", { DSH_X: "1" });
  assert.equal(pwsh.MSYSTEM, undefined);
});

test("buildEnv keeps the upstream WSLENV behavior", () => {
  const env = buildEnv("wsl", { DSH_A: "1", DSH_B: "2" });
  assert.ok(env.WSLENV.includes("DSH_A:DSH_B"));
});

test("terminalArgv runs msys2 interactive", () => {
  const argv = terminalArgv("msys2", { msys2: "C:\\msys64\\usr\\bin\\bash.exe" }, undefined);
  assert.deepEqual(argv, ["C:\\msys64\\usr\\bin\\bash.exe", "-i"]);
});

test("terminalArgv wsl keeps the upstream -- fallback for the default distro", () => {
  const paths = { wsl: "C:\\Windows\\System32\\wsl.exe" };
  assert.deepEqual(terminalArgv("wsl", paths, undefined), ["C:\\Windows\\System32\\wsl.exe", "--", "bash", "-i"]);
  assert.deepEqual(terminalArgv("wsl", paths, "Debian"), ["C:\\Windows\\System32\\wsl.exe", "-d", "Debian", "-e", "bash", "-i"]);
});

test("shellGuidanceText embeds the current default shell and forbids guessing", () => {
  const t = internals.shellGuidanceText("gitbash");
  assert.ok(t.includes("Git Bash"), "label must be human-readable");
  assert.ok(t.includes('value "gitbash"'), "raw settings value must be present");
  assert.ok(t.includes("Do NOT pass the shell argument"), "must instruct the model to keep the default");
  assert.ok(t.includes("msys2"), "must keep the per-call override hint");
  const m = internals.shellGuidanceText("msys2");
  assert.ok(m.includes("MSYS2"));
  const p = internals.shellGuidanceText("powershell");
  assert.ok(p.includes("PowerShell"));
  const w = internals.shellGuidanceText("wsl");
  assert.ok(w.includes("WSL"));
});

test("callDescription prefixes the terminal label like the official row chrome", () => {
  assert.equal(internals.callDescription("查看 git 状态", "gitbash"), "Git Bash · 查看 git 状态");
  assert.equal(internals.callDescription("install package", "msys2"), "MSYS2 · install package");
  assert.equal(internals.callDescription("get processes", "powershell"), "PowerShell · get processes");
  // unknown ids fall back to the raw id, never crash
  assert.equal(internals.callDescription("x", "unknown-shell"), "unknown-shell · x");
});
