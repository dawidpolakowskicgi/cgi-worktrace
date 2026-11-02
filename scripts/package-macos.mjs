import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { packager } from "@electron/packager";
import * as asar from "@electron/asar";

if (process.platform !== "darwin") throw new Error("Build the macOS package on a Mac.");
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const electron = JSON.parse(await fs.readFile(path.join(root, "node_modules/electron/package.json"), "utf8"));
const stage = await fs.mkdtemp(path.join(os.tmpdir(), "tavri-macos-package-"));
const output = path.join(root, "dist", `Tavri-${manifest.version}-${process.arch}`);
await fs.mkdir(output, { recursive: true });
const run = promisify(execFile);
const signIdentity = process.env.TAVRI_MAC_SIGN_IDENTITY || "";
const notaryProfile = process.env.TAVRI_MAC_NOTARY_PROFILE || "";
if (Boolean(signIdentity) !== Boolean(notaryProfile)) throw new Error("Set both TAVRI_MAC_SIGN_IDENTITY and TAVRI_MAC_NOTARY_PROFILE for a public signed build.");

try {
  for (const directory of ["desktop", "assets"]) await fs.cp(path.join(root, directory), path.join(stage, directory), { recursive: true });
  await fs.copyFile(path.join(root, "package.json"), path.join(stage, "package.json"));
  await fs.copyFile(path.join(root, "LICENSE"), path.join(stage, "LICENSE"));
  await fs.mkdir(path.join(stage, "node_modules"));
  await fs.cp(path.join(root, "node_modules/fflate"), path.join(stage, "node_modules/fflate"), { recursive: true });
  const bundles = await packager({
    dir: stage, name: "Tavri", appVersion: manifest.version, platform: "darwin", arch: process.arch,
    electronVersion: electron.version, out: output, overwrite: true, asar: true, prune: false,
    appBundleId: "com.dawidpolakowski.tavri",
    appCategoryType: "public.app-category.productivity",
    icon: path.join(root, "assets", "tavri-icon.icns"),
    extendInfo: { CFBundleIconFile: "tavri-icon.icns", NSAppTransportSecurity: { NSAllowsArbitraryLoads: false } },
    ...(signIdentity ? { osxSign: { identity: signIdentity, hardenedRuntime: true, entitlements: path.join(root, "assets", "tavri-entitlements.plist") }, osxNotarize: { keychainProfile: notaryProfile } } : {}),
  });
  const appPath = bundles[0];
  const bundle = path.join(appPath, "Tavri.app");
  const appAsar = path.join(bundle, "Contents/Resources/app.asar");
  const icon = await fs.readFile(path.join(bundle, "Contents/Resources/tavri-icon.icns"));
  if (!icon.equals(await fs.readFile(path.join(root, "assets/tavri-icon.icns")))) throw new Error("Packaged app icon differs from Tavri icon.");
  for (const required of ["desktop/index.html", "desktop/renderer.cjs", "desktop/appearance-themes.cjs", "desktop/i18n.cjs", "desktop/widget.html", "desktop/widget.cjs", "desktop/widget-window.cjs", "desktop/focus-store.cjs", "desktop/tavri-core.cjs", "assets/cgi-logo.svg", "LICENSE"]) {
    if (!asar.extractFile(appAsar, required).length) throw new Error(`Packaged app is missing ${required}`);
  }
  if (signIdentity) {
    await run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", bundle]);
    await run("xcrun", ["stapler", "staple", bundle], { timeout: 180000 });
    await run("xcrun", ["stapler", "validate", bundle]);
  }
  const dmgPath = path.join(output, `Tavri-${manifest.version}-${process.arch}.dmg`);
  await run("hdiutil", ["create", "-volname", "Tavri", "-srcfolder", appPath, "-ov", "-format", "UDZO", dmgPath], { timeout: 180000 });
  console.log(`Packaged app: ${appPath}`);
  console.log(`Installer image: ${dmgPath}`);
  console.log(signIdentity ? "Signed and notarized macOS build verified." : "Local build is unsigned; set the signing identity and Keychain notary profile for public distribution.");
} finally {
  await fs.rm(stage, { recursive: true, force: true });
}
