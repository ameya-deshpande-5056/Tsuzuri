#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");

// Read version argument or fallback to git describe / package.json
let targetVersion = process.argv[2];

if (!targetVersion) {
  try {
    const { execSync } = await import("node:child_process");
    targetVersion = execSync("git describe --tags --exact-match 2>/dev/null || git describe --tags --abbrev=0 2>/dev/null", { encoding: "utf8" }).trim();
  } catch {}
}

if (!targetVersion) {
  console.error("Usage: node scripts/sync-version.js <version-or-tag>");
  process.exit(1);
}

// Strip leading 'v'
const cleanVersion = targetVersion.replace(/^v/, "").trim();
if (!cleanVersion || !/^\d+\.\d+\.\d+/.test(cleanVersion)) {
  console.error(`Invalid semver version: "${targetVersion}"`);
  process.exit(1);
}

console.log(`Synchronizing app version to: ${cleanVersion}`);

// 1. package.json
const pkgPath = path.join(rootDir, "package.json");
if (fs.existsSync(pkgPath)) {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  pkg.version = cleanVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  console.log(`✓ package.json -> ${cleanVersion}`);
}

// 2. package-lock.json
const pkgLockPath = path.join(rootDir, "package-lock.json");
if (fs.existsSync(pkgLockPath)) {
  const pkgLock = JSON.parse(fs.readFileSync(pkgLockPath, "utf8"));
  pkgLock.version = cleanVersion;
  if (pkgLock.packages && pkgLock.packages[""]) {
    pkgLock.packages[""].version = cleanVersion;
  }
  fs.writeFileSync(pkgLockPath, JSON.stringify(pkgLock, null, 2) + "\n");
  console.log(`✓ package-lock.json -> ${cleanVersion}`);
}

// 3. src-tauri/tauri.conf.json
const tauriConfPath = path.join(rootDir, "src-tauri", "tauri.conf.json");
if (fs.existsSync(tauriConfPath)) {
  const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8"));
  tauriConf.version = cleanVersion;

  // Calculate Android versionCode: major * 1000000 + minor * 1000 + patch
  const semverParts = cleanVersion.split("-")[0].split(".").map(Number);
  const major = semverParts[0] || 0;
  const minor = semverParts[1] || 0;
  const patch = semverParts[2] || 0;
  const versionCode = major * 1000000 + minor * 1000 + patch;

  if (!tauriConf.bundle) tauriConf.bundle = {};
  if (!tauriConf.bundle.android) tauriConf.bundle.android = {};
  tauriConf.bundle.android.versionCode = versionCode;

  fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + "\n");
  console.log(`✓ tauri.conf.json -> ${cleanVersion} (android.versionCode: ${versionCode})`);
}

// 4. src-tauri/Cargo.toml
const cargoTomlPath = path.join(rootDir, "src-tauri", "Cargo.toml");
if (fs.existsSync(cargoTomlPath)) {
  let cargoContent = fs.readFileSync(cargoTomlPath, "utf8");
  cargoContent = cargoContent.replace(/^version\s*=\s*"[^"]+"/m, `version = "${cleanVersion}"`);
  fs.writeFileSync(cargoTomlPath, cargoContent);
  console.log(`✓ src-tauri/Cargo.toml -> ${cleanVersion}`);
}

console.log("App version synchronization complete!");
