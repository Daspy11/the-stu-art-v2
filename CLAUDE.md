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