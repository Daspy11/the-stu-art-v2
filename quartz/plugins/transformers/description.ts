import { Root as HTMLRoot, Element, RootContent } from "hast"
import { toString } from "hast-util-to-string"
import { QuartzTransformerPlugin } from "../types"
import { escapeHTML } from "../../util/escape"

export interface Options {
  descriptionLength: number
  replaceExternalLinks: boolean
}

const defaultOptions: Options = {
  descriptionLength: 160,
  replaceExternalLinks: true,
}

const urlRegex = new RegExp(
  /(https?:\/\/)?(?<domain>([\da-z\.-]+)\.([a-z\.]{2,6})(:\d+)?)(?<path>[\/\w\.-]*)(\?[\/\w\.=&;-]*)?/,
  "g",
)

// left out of the description: titles, tags, footnotes and anything that isn't prose
const skippedTags = new Set(["pre", "sup", "script", "style", "svg", "table", "button", "nav"])
const blockTags = new Set([
  "p",
  "li",
  "div",
  "blockquote",
  "br",
  "section",
  "dt",
  "dd",
  "figcaption",
])

function isSkipped(el: Element): boolean {
  if (/^h[1-6]$/.test(el.tagName) || skippedTags.has(el.tagName)) return true
  const cls = el.properties?.className
  if (Array.isArray(cls) && cls.includes("tag-link")) return true
  return el.properties?.dataFootnotes !== undefined
}

function proseText(node: HTMLRoot | RootContent): string {
  if (node.type === "text") return node.value
  if (node.type === "root") return node.children.map(proseText).join("")
  if (node.type !== "element" || isSkipped(node)) return ""
  const inner = node.children.map(proseText).join("")
  return blockTags.has(node.tagName) ? ` ${inner} ` : inner
}

// whole sentences up to `len` characters, or the first sentence cut at a word if it's too long
function summarise(text: string, len: number): string {
  const sentences = text.split(/(?<=[.!?…])\s+/)
  let out = ""
  for (const sentence of sentences) {
    const next = out ? `${out} ${sentence}` : sentence
    if (next.length > len) break
    out = next
  }
  if (out) return out
  const cut = text.slice(0, len - 1)
  return (
    cut
      .slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : cut.length)
      .replace(/[,;:\s]+$/, "") + "…"
  )
}

export const Description: QuartzTransformerPlugin<Partial<Options>> = (userOpts) => {
  const opts = { ...defaultOptions, ...userOpts }
  return {
    name: "Description",
    htmlPlugins() {
      return [
        () => {
          return async (tree: HTMLRoot, file) => {
            let frontMatterDescription = file.data.frontmatter?.description
            let text = escapeHTML(toString(tree))
            let prose = escapeHTML(proseText(tree))

            if (opts.replaceExternalLinks) {
              frontMatterDescription = frontMatterDescription?.replace(
                urlRegex,
                "$<domain>" + "$<path>",
              )
              text = text.replace(urlRegex, "$<domain>" + "$<path>")
              prose = prose.replace(urlRegex, "$<domain>" + "$<path>")
            }

            const desc = (frontMatterDescription ?? prose).replace(/\s+/g, " ").trim()
            file.data.description = summarise(desc, opts.descriptionLength)
            file.data.text = text
          }
        },
      ]
    },
  }
}

declare module "vfile" {
  interface DataMap {
    description: string
    text: string
  }
}
