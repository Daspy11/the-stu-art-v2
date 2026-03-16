// @ts-ignore
import particlesScript from "./scripts/particles.inline"
import particlesStyle from "./styles/particles.css"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import scenes from "../particles.json"

const ParticleCanvas: QuartzComponent = ({ fileData }: QuartzComponentProps) => {
  const slug = fileData.slug ?? ""
  const isIndex = slug === "index" || slug === ""
  const scene = (scenes as Record<string, unknown>)[slug]
  const sceneData = scene ? JSON.stringify(scene) : ""
  return <div id="particle-mount" data-scene={sceneData} data-slug={slug} data-is-index={isIndex ? "true" : "false"} />
}

ParticleCanvas.css = particlesStyle
ParticleCanvas.afterDOMLoaded = particlesScript

export default (() => ParticleCanvas) satisfies QuartzComponentConstructor
