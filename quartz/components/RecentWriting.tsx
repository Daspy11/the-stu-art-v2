import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { QuartzPluginData } from "../plugins/vfile"
import { resolveRelative } from "../util/path"
import { byDateAndAlphabetical } from "./PageList"
import { Date, getDate } from "./Date"
import { AiBadge, isAiWritten } from "./AiBadge"
import { unescapeHTML } from "../util/escape"
import style from "./styles/recentWriting.css"

/** True for the page that lists everything (`showRecent: true` in its frontmatter). */
function isRecentPage(data: QuartzPluginData): boolean {
  const flag = data.frontmatter?.showRecent
  return flag === true || flag === "true"
}

// Writing lives in folders; the homepage, folder and tag indexes, test pages at the root
// and empty pages aren't writing
function isWriting(page: QuartzPluginData): boolean {
  const slug = page.slug ?? ""
  return (
    slug.includes("/") &&
    !slug.endsWith("/index") &&
    !slug.startsWith("tags/") &&
    !isRecentPage(page) &&
    !!page.text?.trim()
  )
}

// Every page of writing, newest first, under a heading for each year
const RecentWriting: QuartzComponent = ({ fileData, allFiles, cfg }: QuartzComponentProps) => {
  if (!isRecentPage(fileData)) return null
  const pages = allFiles.filter(isWriting).sort(byDateAndAlphabetical(cfg))

  const years: [string, QuartzPluginData[]][] = []
  for (const page of pages) {
    const year = getDate(cfg, page)?.getFullYear().toString() ?? "Undated"
    if (years.at(-1)?.[0] !== year) years.push([year, []])
    years.at(-1)![1].push(page)
  }

  return (
    <div class="recent-writing">
      {years.map(([year, yearPages]) => (
        <section>
          <h2>{year}</h2>
          <ul>
            {yearPages.map((page) => {
              const date = getDate(cfg, page)
              const summary = page.frontmatter?.description ?? page.description
              return (
                <li>
                  <p class="meta">{date && <Date date={date} locale={cfg.locale} />}</p>
                  <div>
                    <h3>
                      <a href={resolveRelative(fileData.slug!, page.slug!)} class="internal">
                        {page.frontmatter?.title}
                      </a>
                      {isAiWritten(page) && <AiBadge />}
                    </h3>
                    {summary && <p class="summary">{unescapeHTML(summary)}</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

RecentWriting.css = AiBadge.css + style

export default (() => RecentWriting) satisfies QuartzComponentConstructor
