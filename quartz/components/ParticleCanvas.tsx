// @ts-ignore
import particlesScript from "./scripts/particles.inline"
import particlesStyle from "./styles/particles.css"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"

// The world is generated in the browser to fit the screen and the page's text
const ParticleCanvas: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug ?? ""
  const isIndex = slug === "index" || slug === ""
  return <div id="particle-mount" data-slug={slug} data-is-index={isIndex ? "true" : "false"} />
}

ParticleCanvas.css = particlesStyle
ParticleCanvas.afterDOMLoaded = particlesScript

export default (() => ParticleCanvas) satisfies QuartzComponentConstructor
