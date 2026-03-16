// Configuration
const HEADER_OFFSET = 100 // How far from top a header should be to be considered "current"

// State
let headers: HTMLElement[] = []
let tocItems: Map<string, HTMLElement> = new Map()
let currentSection: string | null = null
let scrollTimeout: number | null = null

function getHeaderPositions(): { slug: string; top: number; bottom: number }[] {
  const positions: { slug: string; top: number; bottom: number }[] = []

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i]
    const rect = header.getBoundingClientRect()
    const nextHeader = headers[i + 1]

    // Section extends from this header to the next header (or end of document)
    const bottom = nextHeader
      ? nextHeader.getBoundingClientRect().top
      : document.documentElement.scrollHeight - window.scrollY

    positions.push({
      slug: header.id,
      top: rect.top,
      bottom: bottom
    })
  }

  return positions
}

function isAtBottom(): boolean {
  const scrollTop = window.scrollY || document.documentElement.scrollTop
  const scrollHeight = document.documentElement.scrollHeight
  const clientHeight = window.innerHeight
  // Consider "at bottom" if within 50px of the end
  return scrollTop + clientHeight >= scrollHeight - 50
}

function findCurrentSection(positions: { slug: string; top: number; bottom: number }[]): number {
  if (positions.length === 0) return -1

  // If at bottom of page, current section is the last one
  if (isAtBottom()) {
    return positions.length - 1
  }

  // If we haven't scrolled at all (first header is below offset),
  // the first section is current if its header is visible
  if (positions[0].top > HEADER_OFFSET && positions[0].top < window.innerHeight) {
    return 0
  }

  // Find the section whose header has most recently passed the offset
  let currentIndex = -1

  for (let i = 0; i < positions.length; i++) {
    const pos = positions[i]

    // If this header has scrolled past the offset, we're in or past this section
    if (pos.top <= HEADER_OFFSET) {
      currentIndex = i
    } else {
      // Headers below this haven't been reached yet
      break
    }
  }

  return currentIndex
}

function calculateProgress(currentIndex: number, positions: { slug: string; top: number; bottom: number }[]): number {
  if (currentIndex < 0 || positions.length === 0) return 0

  // If at bottom, progress is 100%
  if (isAtBottom()) {
    return 100
  }

  // Base progress: how many complete sections we've passed
  const sectionsComplete = currentIndex
  const totalSections = positions.length

  // Partial progress within current section
  const currentPos = positions[currentIndex]
  const sectionHeight = currentPos.bottom - currentPos.top
  const scrolledInSection = HEADER_OFFSET - currentPos.top
  const partialProgress = sectionHeight > 0
    ? Math.min(1, Math.max(0, scrolledInSection / sectionHeight))
    : 1

  // Total progress
  const progress = ((sectionsComplete + partialProgress) / totalSections) * 100
  return Math.min(100, Math.max(0, progress))
}

function updateTocState() {
  if (headers.length === 0) return

  const positions = getHeaderPositions()
  const currentIndex = findCurrentSection(positions)

  // Update current section
  const newCurrentSection = currentIndex >= 0 ? positions[currentIndex].slug : null

  // Clear all states first
  tocItems.forEach((item, slug) => {
    item.classList.remove("read", "past")
    const link = item.querySelector("a")
    if (link) link.classList.remove("in-view")
  })

  // Apply states
  positions.forEach((pos, index) => {
    const item = tocItems.get(pos.slug)
    if (!item) return

    const link = item.querySelector("a")

    if (index === currentIndex) {
      if (link) link.classList.add("in-view")
    }
  })

  // Update progress bar
  const progress = calculateProgress(currentIndex, positions)
  const tocList = document.querySelector("#toc-content > ul.overflow") as HTMLElement
  if (tocList) {
    tocList.style.setProperty("--progress", `${progress}%`)
  }

  currentSection = newCurrentSection
}

function onScroll() {
  if (scrollTimeout) {
    cancelAnimationFrame(scrollTimeout)
  }

  scrollTimeout = requestAnimationFrame(() => {
    updateTocState()
    scrollTimeout = null
  })
}

function handleTocClick(e: Event) {
  const target = e.target as HTMLElement
  const link = target.closest("a")
  if (!link) return

  const slug = link.getAttribute("data-for")
  if (!slug) return

  // Let the scroll happen, then update
  setTimeout(() => {
    updateTocState()
  }, 100)
}

function toggleToc(this: HTMLElement) {
  this.classList.toggle("collapsed")
  this.setAttribute(
    "aria-expanded",
    this.getAttribute("aria-expanded") === "true" ? "false" : "true",
  )
  const content = this.nextElementSibling as HTMLElement | undefined
  if (!content) return
  content.classList.toggle("collapsed")
}

function setupToc() {
  // Build map of TOC items first so we can filter headers
  tocItems.clear()
  const tocSlugs = new Set<string>()
  document.querySelectorAll("#toc-content li").forEach((item) => {
    const link = item.querySelector("a")
    const slug = link?.getAttribute("data-for")
    if (slug) {
      tocItems.set(slug, item as HTMLElement)
      tocSlugs.add(slug)
    }
  })

  // Get only headers that have corresponding TOC entries
  headers = (Array.from(
    document.querySelectorAll("h1[id], h2[id], h3[id], h4[id], h5[id], h6[id]")
  ) as HTMLElement[]).filter(h => tocSlugs.has(h.id))

  // Reset state
  currentSection = null

  // Clear existing classes
  tocItems.forEach((item) => {
    item.classList.remove("read", "past")
    const link = item.querySelector("a")
    if (link) link.classList.remove("in-view")
  })

  // Setup toggle button
  const toc = document.getElementById("toc")
  if (toc) {
    toc.removeEventListener("click", toggleToc)
    toc.addEventListener("click", toggleToc)
    window.addCleanup?.(() => toc.removeEventListener("click", toggleToc))
  }

  // Setup click handlers for TOC links
  const tocContent = document.getElementById("toc-content")
  if (tocContent) {
    tocContent.removeEventListener("click", handleTocClick)
    tocContent.addEventListener("click", handleTocClick)
    window.addCleanup?.(() => tocContent.removeEventListener("click", handleTocClick))
  }

  // Setup scroll listener
  window.removeEventListener("scroll", onScroll)
  window.addEventListener("scroll", onScroll, { passive: true })
  window.addCleanup?.(() => window.removeEventListener("scroll", onScroll))

  // Initial update
  requestAnimationFrame(() => {
    updateTocState()
  })
}

window.addEventListener("resize", () => {
  updateTocState()
})

document.addEventListener("nav", () => {
  setupToc()
})
