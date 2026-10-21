// @ts-ignore
import lightboxScript from "./scripts/lightbox.inline"
import lightboxStyle from "./styles/lightbox.css"
import { QuartzComponent, QuartzComponentConstructor } from "./types"

// Clicking an image in a page opens it full size; everything happens in the script
const ImageLightbox: QuartzComponent = () => null

ImageLightbox.css = lightboxStyle
ImageLightbox.afterDOMLoaded = lightboxScript

export default (() => ImageLightbox) satisfies QuartzComponentConstructor
