import { h, render } from "preact"
import { Counter, Collapsible, Tabs, Alert } from "./components"

const components: Record<string, any> = {
  Counter,
  Collapsible,
  Tabs,
  Alert,
}

function hydrateMdxComponents() {
  document.querySelectorAll("[data-mdx-hydrate]").forEach((target) => {
    const componentName = target.getAttribute("data-mdx-component")
    const propsJson = target.getAttribute("data-mdx-props")

    if (!componentName || !components[componentName]) {
      console.warn(`MDX component not found: ${componentName}`)
      return
    }

    try {
      const props = propsJson ? JSON.parse(propsJson) : {}
      render(h(components[componentName], props), target)
    } catch (err) {
      console.error(`Failed to hydrate MDX component ${componentName}:`, err)
    }
  })
}

document.addEventListener("nav", () => requestAnimationFrame(hydrateMdxComponents))

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", hydrateMdxComponents)
} else {
  hydrateMdxComponents()
}

export default ""
