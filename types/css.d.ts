// TypeScript 6 (TS2882) requires a module declaration even for side-effect
// CSS imports like `import "./globals.css"` — Next's bundled types cover
// *.module.css but not plain stylesheets.
declare module "*.css";
