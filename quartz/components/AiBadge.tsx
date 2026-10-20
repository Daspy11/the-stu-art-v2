import { QuartzPluginData } from "../plugins/vfile"

/** True for pages with `ai: true` in their frontmatter. */
export function isAiWritten(data: QuartzPluginData | undefined): boolean {
  const ai = data?.frontmatter?.ai
  return ai === true || ai === "true"
}

/** The "AI-written" badge shown next to a page's name. */
export function AiBadge() {
  return <span class="ai-badge">AI-written</span>
}

// Same chip as internal links and tags (see a.internal in styles.css), but not a link.
AiBadge.css = `
.ai-badge {
  display: inline-block;
  margin-left: 0.5rem;
  padding: 0 0.2rem;
  border-radius: 5px;
  background-color: var(--highlight);
  color: var(--secondary);
  font-family: var(--bodyFont);
  font-weight: normal;
  line-height: 1.4rem;
  white-space: nowrap;
}
`
