# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Quartz v4 static site generator project - a digital garden/personal website that transforms Markdown content into a static website. The site is live at https://thestu.art and uses GitHub Pages for hosting.

## Essential Commands

### Development
- `npm run quartz build --serve` - Build and serve the site locally (main development command)
- `npm run quartz build` - Build static site to /public directory
- `npm run format` - Format code with Prettier
- `npm run check` - Run TypeScript type checking and Prettier check
- `npm test` - Run tests (minimal test coverage)

### Quartz CLI Commands
- `npm run quartz sync --commit --push` - Commit and push changes to GitHub
- `npm run quartz update` - Update Quartz framework from upstream
- `npm run quartz restore` - Restore content folder from cache

## Architecture

### Directory Structure
- `/content/` - All Markdown content files
  - `Assets/` - Images and media
  - `Things/` - Main content pages
  - `Thoughts/` - Personal essays and thoughts
  - `Templates/` - Content templates
- `/quartz/` - Core framework code
  - `components/` - Preact UI components
  - `mdx/` - MDX component registry and hydration
  - `plugins/` - Content transformation plugins
  - `processors/` - Content parsing (Markdown and MDX)
  - `styles/` - CSS stylesheets
- `/public/` - Build output (gitignored)

### Plugin System
Quartz uses a three-stage plugin pipeline:

1. **Transformers** (`/quartz/plugins/transformers/`) - Process Markdown content
   - Modify content via `textTransform()` or add remark/rehype plugins
   - Examples: frontmatter parsing, link processing, syntax highlighting

2. **Filters** (`/quartz/plugins/filters/`) - Control what gets published
   - Implement `shouldPublish(ctx)` to include/exclude content

3. **Emitters** (`/quartz/plugins/emitters/`) - Generate output files
   - Implement `emit(ctx, content)` to create files in /public
   - Can depend on other emitters via `getDependencyGraph()`

### Key Configuration Files
- `quartz.config.ts` - Main site configuration (title, theme, analytics, plugins)
- `quartz.layout.ts` - Page layout components configuration
- `package.json` - Dependencies and scripts
- `.github/workflows/deploy.yaml` - GitHub Actions deployment to GitHub Pages

### Content Processing
- Markdown files support Obsidian-flavored and GitHub-flavored syntax
- MDX files (`.mdx`) support interactive Preact components
- Frontmatter metadata is parsed and available to components
- Internal links use [[wikilinks]] or standard Markdown links
- Search is implemented client-side using FlexSearch

### MDX Support
The project supports MDX files with interactive components:

- **Component registry**: `/quartz/mdx/components.tsx` - Define Preact components here
- **Hydration script**: `/quartz/mdx/hydrate.inline.ts` - Client-side component mounting
- **MDX processor**: `/quartz/processors/mdx.tsx` - Compiles MDX to HTML with hydration markers

Available components: `Counter`, `Collapsible`, `Tabs`, `Alert`

To add a new component:
1. Create the component in `/quartz/mdx/components.tsx` using Preact hooks
2. Export it from `mdxComponents` object
3. Add it to the `components` registry in `/quartz/mdx/hydrate.inline.ts`
4. Use in any `.mdx` file: `<YourComponent prop="value" />`

MDX files require `share: true` in frontmatter to be published.

### Deployment
The site automatically deploys to GitHub Pages when pushing to the `v4` branch via GitHub Actions.

## Landing Page Particle World

The landing page runs a falling-sand world with a colony of stick-figure builders. The page script is `quartz/components/scripts/particles.inline.ts` (canvases, text mask, input, toolbar, localStorage saves); the simulation is plain TypeScript in `quartz/components/scripts/particles/` so it also runs in Node:

- `sim.ts` - `createWorld(W, H, seed, textRects)` and `step(world)`; same seed + size + text layout always plays out identically (all randomness comes from `rng.ts`)
- `terrain.ts` - procedural terrain: heightfield (hills, ridged mountains, mesas, lake basins), overhangs, caves open to the sky, dirt over stone, lakes, sand only around water, trees and flowers. Kept clear of the page text
- `world.ts` - grids and falling-particle physics. Page text becomes invisible solid `TEXT` cells
- `nav.ts` - walkable cells and Dijkstra pathfinding; the "safe set" is everywhere a guy can reach from home and walk back from
- `colony.ts` - planner (tower sites, raises, bridges, balconies, cliff ladders, mine shafts, furniture), job board of projects made of build steps, guy brains (fell trees, quarry, stockpile, build, relax), tech tiers, and immigration driven by furniture. Guys only build within arm's reach (`REACH_X`/`REACH_UP`/`REACH_DOWN`), so blueprints must always leave something to stand on
- `blueprints.ts` - turns towers, roofs, bridges and ladders into ordered build steps: frame and ladders first (storey by storey), then walls and windows, then the roof from the outside in through a hatch that's boarded over last
- `guys.ts`, `trees.ts`, `furniture.ts`, `render.ts`, `save.ts`

Tools: `npm test` (determinism, terrain and build-rule checks), `npm run simulate -- <seed> <ticks> --png out.png` (headless run), `npm run particles:video` (after `npx quartz build`; renders the tiled timelapse video to `video-out/`, needs ffmpeg). Add `?seed=N` to the landing page URL to load a specific world. `npm run og-image` re-renders the default link-preview image (`quartz/static/og-image.png`) from a grown world.

## Link Previews and Images

- `Head.tsx` picks each page's preview image: frontmatter `image`/`cover`/`socialImage` (a URL, a content path like `Assets/photo.png`, or a file name), else the first non-SVG image on the page, else `static/og-image.png`. It also writes canonical URLs, article dates and JSON-LD; `author` in `quartz.config.ts` names the site's author
- The `Description` transformer builds meta descriptions from the page's prose only (no headings, tags or footnotes)
- `ImageLightbox` (`scripts/lightbox.inline.ts`) opens any image in an article full screen; images inside links or with class `no-lightbox` are left alone
- `RecentWriting` lists every page of writing, newest first by year, on any page with `showRecent: true` in its frontmatter (`content/Recent.md`, linked from the homepage). Writing means pages inside a folder, not folder indexes, tag pages or empty pages

## Styling with CSS and Tailwind

The project uses modern CSS with Tailwind CSS integration:

- **CSS Variables**: The project uses CSS custom properties defined in `/quartz/styles/variables.css`
- **Tailwind entry point**: `/quartz/styles/tailwind.css` 
- **Config file**: `tailwind.config.js` - configured to scan Quartz components and content files
- **PostCSS integration**: Tailwind is processed through PostCSS in the build pipeline
- **Dark mode**: Configured to work with Quartz's theme system using `[saved-theme="dark"]`
- **CSS Structure**: All styles are in standard CSS format in `/quartz/styles/` and `/quartz/components/styles/`

### CSS Architecture
- `/quartz/styles/variables.css` - CSS custom properties for theming and layout
- `/quartz/styles/base.css` - Core component styles and base styling
- `/quartz/styles/tailwind.css` - Tailwind directives
- `/quartz/styles/custom.css` - Main entry point that imports all other CSS files
- `/quartz/components/styles/*.css` - Individual component stylesheets

### Using Tailwind Classes
1. In components: Add classes directly to JSX elements
2. In content: Use HTML elements with Tailwind classes in Markdown files  
3. In CSS: Tailwind directives and `@apply` are available in any CSS file

## Development Tips

1. When modifying components, they're in `/quartz/components/` and use Preact (React-compatible)
2. Styles are in standard CSS format using CSS custom properties and modern CSS features
3. To add new content transformations, create a transformer plugin
4. The build process uses esbuild with a custom CSS loader that processes PostCSS for Tailwind
5. Component props are fully typed - check existing components for patterns
6. CSS imports are processed recursively and bundled into the final stylesheet