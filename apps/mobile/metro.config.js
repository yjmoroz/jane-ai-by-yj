// Monorepo-aware Metro config so Expo can find packages in the workspace root.
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

// Pin expo-router's app/ root to this workspace; otherwise it resolves to the
// monorepo root and Metro fails to find ./app/index.
process.env.EXPO_ROUTER_APP_ROOT = path.join(projectRoot, "app");

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];
// Hierarchical lookup left ON: react-native ships some peer deps (e.g.
// @react-native/virtualized-lists) under its own nested node_modules and
// disabling hierarchical lookup hides them.

// expo-sqlite ships a wa-sqlite.wasm asset for the web target. Metro doesn't
// treat .wasm as an asset by default, so bundling for web fails on import
// resolution. Including it here is a no-op on native.
if (!config.resolver.assetExts.includes("wasm")) {
  config.resolver.assetExts.push("wasm");
}

module.exports = config;
