import { compile, run } from "@mdx-js/mdx"
import * as runtime from "preact/jsx-runtime"
import { render } from "preact-render-to-string"
import remarkFrontmatter from "remark-frontmatter"
import remarkGfm from "remark-gfm"
import { VFile } from "vfile"
import { Root as HastRoot, Element } from "hast"
import { BuildCtx } from "../util/ctx"
import { ProcessedContent } from "../plugins/vfile"
import { FilePath, slugifyFilePath } from "../util/path"
import { read } from "to-vfile"
import { PerfTimer } from "../util/perf"
import { trace } from "../util/trace"
import path from "path"
import matter from "gray-matter"
import { mdxComponents } from "../mdx/components"
import { fromHtml } from "hast-util-from-html"
import { slugTag } from "../util/path"
import { i18n } from "../i18n"

// Track which components are used in each MDX file for hydration
export type MdxComponentUsage = {
  componentName: string
  props: Record<string, unknown>
  hydrationId: string
}

let hydrationCounter = 0
function generateHydrationId(): string {
  return `mdx-hydrate-${++hydrationCounter}`
}


function createHydratableComponents() {
  const usedComponents: MdxComponentUsage[] = []

  const wrappedComponents: Record<string, any> = {}

  for (const [name, Component] of Object.entries(mdxComponents)) {
    wrappedComponents[name] = (props: Record<string, unknown>) => {
      const hydrationId = generateHydrationId()

      usedComponents.push({
        componentName: name,
        props: serializeProps(props),
        hydrationId,
      })

      const element = Component(props)
      return (
        <div
          data-mdx-hydrate={hydrationId}
          data-mdx-component={name}
          data-mdx-props={JSON.stringify(serializeProps(props))}
        >
          {element}
        </div>
      )
    }
  }

  return { wrappedComponents, usedComponents }
}

function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(props)) {
    // Skip children and functions (they'll be re-parsed from MDX on client)
    if (key === "children" || typeof value === "function") {
      continue
    }

    // Handle serializable values
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      serialized[key] = value
    } else if (Array.isArray(value)) {
      serialized[key] = value.map((v) =>
        typeof v === "object" ? JSON.parse(JSON.stringify(v)) : v
      )
    } else if (typeof value === "object") {
      serialized[key] = JSON.parse(JSON.stringify(value))
    }
  }

  return serialized
}

function extractFrontmatter(content: string, file: VFile, ctx: BuildCtx): string {
  const { data, content: mdxContent } = matter(content)

  if (data.title != null && data.title.toString() !== "") {
    data.title = data.title.toString()
  } else {
    data.title = file.stem ?? i18n(ctx.cfg.configuration.locale).propertyDefaults.title
  }

  const tags = coerceToArray(data.tags ?? data.tag)
  if (tags) data.tags = [...new Set(tags.map((tag: string) => slugTag(tag)))]

  const aliases = coerceToArray(data.aliases ?? data.alias)
  if (aliases) data.aliases = aliases

  const cssclasses = coerceToArray(data.cssclasses ?? data.cssclass)
  if (cssclasses) data.cssclasses = cssclasses

  if (data.created || data.date) data.created = data.created ?? data.date
  if (data.modified || data.lastmod || data.updated) {
    data.modified = data.modified ?? data.lastmod ?? data.updated
  }
  if (data.published || data.publishDate) {
    data.published = data.published ?? data.publishDate ?? data.date
  }

  file.data.frontmatter = data as any
  return mdxContent
}

function coerceToArray(input: unknown): string[] | undefined {
  if (input === undefined || input === null) return undefined

  if (!Array.isArray(input)) {
    return String(input)
      .split(",")
      .map((s: string) => s.trim())
  }

  return input
    .filter((item: unknown) => typeof item === "string" || typeof item === "number")
    .map((item: string | number) => String(item))
}

export async function compileMdxToHast(
  ctx: BuildCtx,
  file: VFile,
): Promise<{ tree: HastRoot; componentUsage: MdxComponentUsage[] }> {
  const content = file.value.toString()
  const mdxContent = extractFrontmatter(content, file, ctx)

  try {
    const compiled = await compile(mdxContent, {
      outputFormat: "function-body",
      development: false,
      remarkPlugins: [remarkFrontmatter, remarkGfm],
    })

    const { wrappedComponents, usedComponents } = createHydratableComponents()

    const { default: MdxContent } = await run(String(compiled), {
      ...runtime,
      baseUrl: import.meta.url,
    })

    const htmlString = render(MdxContent({ components: wrappedComponents }))
    const hastTree = fromHtml(htmlString, { fragment: true })

    ;(file.data as any).mdxComponents = usedComponents
    return { tree: hastTree as HastRoot, componentUsage: usedComponents }
  } catch (err) {
    trace(`\nFailed to compile MDX \`${file.path}\``, err as Error)
    return {
      tree: { type: "root", children: [] },
      componentUsage: [],
    }
  }
}

export async function parseMdxFile(
  ctx: BuildCtx,
  fp: FilePath,
): Promise<ProcessedContent | null> {
  const { argv, cfg } = ctx

  try {
    const perf = new PerfTimer()
    const file = await read(fp)
    file.value = file.value.toString().trim()

    for (const plugin of cfg.plugins.transformers.filter((p) => p.textTransform)) {
      file.value = plugin.textTransform!(ctx, file.value.toString())
    }

    file.data.filePath = file.path as FilePath
    file.data.relativePath = path.posix.relative(argv.directory, file.path) as FilePath
    file.data.slug = slugifyFilePath(file.data.relativePath)

    const { tree: hastTree, componentUsage } = await compileMdxToHast(ctx, file)

    ;(file.data as any).isMdx = true
    ;(file.data as any).mdxComponents = componentUsage

    if (argv.verbose) {
      const componentInfo = componentUsage.length > 0
        ? ` (${componentUsage.length} interactive components)`
        : ""
      console.log(`[process:mdx] ${fp} -> ${file.data.slug} (${perf.timeSince()})${componentInfo}`)
    }

    return [hastTree, file]
  } catch (err) {
    trace(`\nFailed to process MDX \`${fp}\``, err as Error)
    return null
  }
}
