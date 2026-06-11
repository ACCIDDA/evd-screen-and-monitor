import { defineConfig } from "vite";

// On `vite build` (GitHub Pages), assets must resolve under the project-pages subpath
// https://accidda.github.io/evd-screen-and-monitor/ ; locally (`vite`/dev) keep root "/".
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/evd-screen-and-monitor/" : "/",
}));
