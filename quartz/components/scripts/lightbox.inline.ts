// Click an image in an article to see it full size. It grows out of the page and shrinks back
// into it on close; arrows (keys, buttons or a swipe) step through the page's other images.

const THUMB = "lightbox-thumb"
const EASE = "cubic-bezier(0.2, 0.8, 0.2, 1)"
const DURATION = 320

let thumbs: HTMLImageElement[] = []
let index = 0
let box: HTMLDivElement | null = null
let big: HTMLImageElement
let caption: HTMLElement
let counter: HTMLElement
let closing = false
let lastFocus: Element | null = null

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches

function eligible(img: HTMLImageElement): boolean {
  return (
    !img.closest("a, .popover, .lightbox, .no-lightbox") && !img.classList.contains("no-lightbox")
  )
}

// an image's caption is the italic line under it, else its alt text
function captionFor(img: HTMLImageElement): string {
  const next = img.nextElementSibling
  if (next?.tagName === "EM") return next.textContent?.trim() ?? ""
  return img.alt?.trim() ?? ""
}

function visible(r: DOMRect): boolean {
  const view = screenRect()
  return r.width > 0 && r.bottom > view.top && r.top < view.top + view.height
}

// the part of the page actually on screen (on phones a too-wide page makes the layout
// viewport, which fixed elements follow, wider than the screen)
function screenRect() {
  const vv = window.visualViewport
  return vv
    ? { left: vv.offsetLeft, top: vv.offsetTop, width: vv.width, height: vv.height }
    : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight }
}

// cover the screen and size the big image to fit it, leaving room for the caption
function fit() {
  if (!box) return
  const view = screenRect()
  Object.assign(box.style, {
    left: `${view.left}px`,
    top: `${view.top}px`,
    width: `${view.width}px`,
    height: `${view.height}px`,
  })
  const thumb = thumbs[index]
  const nw = thumb.naturalWidth || thumb.width
  const nh = thumb.naturalHeight || thumb.height
  const pad = view.width < 600 ? 12 : 56
  const room = caption.textContent ? caption.offsetHeight + 16 : 0
  const scale = Math.min((view.width - pad * 2) / nw, (view.height - pad * 2 - room) / nh, 2)
  big.style.width = `${Math.round(nw * scale)}px`
  big.style.height = `${Math.round(nh * scale)}px`
}

// transform that puts the big image over `from`
function transformFrom(from: DOMRect): string {
  const to = big.getBoundingClientRect()
  return `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`
}

function show(i: number) {
  thumbs[index].style.visibility = ""
  index = (i + thumbs.length) % thumbs.length
  const thumb = thumbs[index]
  thumb.style.visibility = "hidden"
  big.src = thumb.currentSrc || thumb.src
  big.alt = thumb.alt
  caption.textContent = captionFor(thumb)
  caption.hidden = !caption.textContent
  counter.textContent = thumbs.length > 1 ? `${index + 1} / ${thumbs.length}` : ""
  fit()
}

function step(dir: number) {
  if (!box || thumbs.length < 2) return
  show(index + dir)
  if (reducedMotion()) return
  big.animate(
    [
      { opacity: 0, transform: `translateX(${dir * 24}px)` },
      { opacity: 1, transform: "none" },
    ],
    { duration: 220, easing: EASE },
  )
}

function lockScroll(lock: boolean) {
  const root = document.documentElement
  if (lock) {
    const gutter = window.innerWidth - root.clientWidth
    root.style.overflow = "hidden"
    if (gutter > 0) document.body.style.paddingRight = `${gutter}px`
  } else {
    root.style.overflow = ""
    document.body.style.paddingRight = ""
  }
}

function button(cls: string, label: string, icon: string, onClick: () => void) {
  const b = document.createElement("button")
  b.className = `lightbox-button ${cls}`
  b.type = "button"
  b.setAttribute("aria-label", label)
  b.innerHTML = `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon}</svg>`
  b.addEventListener("click", (e) => {
    e.stopPropagation()
    onClick()
  })
  return b
}

function open(thumb: HTMLImageElement, fromKeyboard: boolean) {
  if (box) return
  thumbs = [...document.querySelectorAll<HTMLImageElement>(`img.${THUMB}`)]
  index = Math.max(0, thumbs.indexOf(thumb))
  // hand focus back on close only to keyboard users; a mouse click would leave a focus ring
  lastFocus = fromKeyboard ? document.activeElement : null
  closing = false

  box = document.createElement("div")
  box.className = "lightbox"
  box.setAttribute("role", "dialog")
  box.setAttribute("aria-modal", "true")
  box.setAttribute("aria-label", "Image viewer")

  const figure = document.createElement("figure")
  figure.className = "lightbox-figure"
  big = document.createElement("img")
  big.className = "lightbox-image"
  big.decoding = "async"
  caption = document.createElement("figcaption")
  caption.className = "lightbox-caption"
  figure.append(big, caption)

  counter = document.createElement("div")
  counter.className = "lightbox-counter"
  const closeBtn = button("lightbox-close", "Close", '<path d="M6 6l12 12M18 6L6 18"/>', close)
  box.append(figure, counter, closeBtn)
  if (thumbs.length > 1) {
    box.append(
      button("lightbox-prev", "Previous image", '<path d="M15 5l-7 7 7 7"/>', () => step(-1)),
      button("lightbox-next", "Next image", '<path d="M9 5l7 7-7 7"/>', () => step(1)),
    )
  }
  box.addEventListener("click", close)
  bindSwipe(box)

  lockScroll(true)
  document.body.appendChild(box)
  const from = thumb.getBoundingClientRect()
  show(index)

  if (!reducedMotion()) {
    big.style.transformOrigin = "0 0"
    big.style.transform = transformFrom(from)
    big.getBoundingClientRect() // commit the starting position before animating
    big.style.transition = `transform ${DURATION}ms ${EASE}`
  }
  requestAnimationFrame(() => {
    box?.classList.add("open")
    big.style.transform = ""
  })
  closeBtn.focus({ preventScroll: true })
}

function close() {
  if (!box || closing) return
  closing = true
  const done = box
  const thumb = thumbs[index]
  lockScroll(false)

  // come back to wherever the image being shown lives on the page
  let to = thumb.getBoundingClientRect()
  if (!visible(to) && thumb.isConnected) {
    thumb.scrollIntoView({ block: "center", behavior: "instant" as ScrollBehavior })
    to = thumb.getBoundingClientRect()
  }

  done.classList.remove("open")
  if (!reducedMotion() && visible(to)) {
    big.style.transition = `transform ${DURATION}ms ${EASE}`
    big.style.transform = transformFrom(to)
  } else {
    big.style.transition = `opacity ${DURATION}ms ease`
    big.style.opacity = "0"
  }
  window.setTimeout(() => {
    thumb.style.visibility = ""
    done.remove()
    if (box === done) box = null
    if (lastFocus instanceof HTMLElement) lastFocus.focus({ preventScroll: true })
    else if (document.activeElement instanceof HTMLElement) document.activeElement.blur()
  }, DURATION)
}

// one-finger horizontal swipes step through the images; pinches are left to the browser
function bindSwipe(el: HTMLElement) {
  let x0 = 0,
    y0 = 0,
    tracking = false
  el.addEventListener(
    "touchstart",
    (e) => {
      tracking = e.touches.length === 1
      x0 = e.touches[0].clientX
      y0 = e.touches[0].clientY
    },
    { passive: true },
  )
  el.addEventListener("touchmove", (e) => {
    if (e.touches.length > 1) tracking = false
  })
  el.addEventListener("touchend", (e) => {
    if (!tracking) return
    tracking = false
    const t = e.changedTouches[0]
    const dx = t.clientX - x0,
      dy = t.clientY - y0
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      e.preventDefault() // no click, so the viewer stays open
      step(dx < 0 ? 1 : -1)
    }
  })
}

document.addEventListener("click", (e) => {
  const img = (e.target as Element | null)?.closest?.(`img.${THUMB}`)
  if (img instanceof HTMLImageElement && !e.defaultPrevented) open(img, false)
})

document.addEventListener("keydown", (e) => {
  if (!box) {
    const t = e.target as Element | null
    if (
      (e.key === "Enter" || e.key === " ") &&
      t instanceof HTMLImageElement &&
      t.classList.contains(THUMB)
    ) {
      e.preventDefault()
      open(t, true)
    }
    return
  }
  if (e.key === "Escape") close()
  else if (e.key === "ArrowLeft") step(-1)
  else if (e.key === "ArrowRight") step(1)
  else if (e.key === "Tab") {
    // keep focus on the viewer's buttons
    const buttons = [...box.querySelectorAll<HTMLButtonElement>("button")]
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement)
    buttons[(at + (e.shiftKey ? -1 : 1) + buttons.length) % buttons.length]?.focus()
  } else return
  e.preventDefault()
})

const refit = () => {
  if (box && !closing) fit()
}
window.addEventListener("resize", refit)
window.visualViewport?.addEventListener("resize", refit)
window.visualViewport?.addEventListener("scroll", refit)

document.addEventListener("nav", () => {
  // a page change while open (back button) just drops the viewer
  if (box) {
    lockScroll(false)
    box.remove()
    box = null
  }
  for (const img of document.querySelectorAll<HTMLImageElement>("article img")) {
    if (!eligible(img)) continue
    img.classList.add(THUMB)
    img.tabIndex = 0
    img.setAttribute("aria-haspopup", "dialog")
  }
})
