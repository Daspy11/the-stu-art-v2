import { i18n } from "../i18n"
import {
  FilePath,
  FullSlug,
  joinSegments,
  pathToRoot,
  simplifySlug,
  slugifyFilePath,
} from "../util/path"
import { CSSResourceToStyleElement, JSResourceToScriptElement } from "../util/resources"
import { googleFontHref } from "../util/theme"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import satori, { SatoriOptions } from "satori"
import fs from "fs"
import sharp from "sharp"
import { ImageOptions, SocialImageOptions, getSatoriFont, defaultImage } from "../util/og"
import { unescapeHTML } from "../util/escape"
import { Root as HtmlRoot, Element } from "hast"
import { visit, EXIT } from "unist-util-visit"

/**
 * An image named in frontmatter: a path in the content folder ("Assets/photo.png"), a bare
 * file name or wikilink ("[[photo.png]]"), or a path under quartz/static ("static/photo.png")
 */
function resolveImage(name: string, allSlugs: FullSlug[]): string {
  const clean = name.replace(/^\[\[|\]\]$/g, "").replace(/^\/+/, "")
  if (clean.startsWith("static/")) return encodeURI(clean)
  const slug = slugifyFilePath(clean as FilePath)
  const match = allSlugs.find((s) => s === slug) ?? allSlugs.find((s) => s.endsWith(`/${slug}`))
  return encodeURI(match ?? slug)
}

/**
 * The first raster image in the page, for link previews (most sites can't preview an SVG)
 */
function firstImage(tree: HtmlRoot | undefined): { src: string; alt: string } | undefined {
  let found: { src: string; alt: string } | undefined
  if (!tree) return found
  visit(tree, "element", (node: Element) => {
    if (node.tagName !== "img") return
    const src = node.properties?.src
    if (typeof src !== "string" || !src || src.startsWith("data:")) return
    if (/\.svg([?#]|$)/i.test(src)) return
    const alt = node.properties?.alt
    found = { src, alt: typeof alt === "string" ? alt : "" }
    return EXIT
  })
  return found
}

/**
 * Generates social image (OG/twitter standard) and saves it as `.webp` inside the public folder
 * @param opts options for generating image
 */
async function generateSocialImage(
  { cfg, description, fileName, fontsPromise, title, fileData }: ImageOptions,
  userOpts: SocialImageOptions,
  imageDir: string,
) {
  const fonts = await fontsPromise
  const { width, height } = userOpts

  // JSX that will be used to generate satori svg
  const imageComponent = userOpts.imageStructure(cfg, userOpts, title, description, fonts, fileData)

  const svg = await satori(imageComponent, { width, height, fonts })

  // Convert svg directly to webp (with additional compression)
  const compressed = await sharp(Buffer.from(svg)).webp({ quality: 40 }).toBuffer()

  // Write to file system
  const filePath = joinSegments(imageDir, `${fileName}.${extension}`)
  fs.writeFileSync(filePath, compressed)
}

const extension = "webp"

const defaultOptions: SocialImageOptions = {
  colorScheme: "lightMode",
  width: 1200,
  height: 630,
  imageStructure: defaultImage,
  excludeRoot: false,
}

export default (() => {
  let fontsPromise: Promise<SatoriOptions["fonts"]>

  let fullOptions: SocialImageOptions
  const Head: QuartzComponent = ({
    cfg,
    fileData,
    externalResources,
    ctx,
    tree,
  }: QuartzComponentProps) => {
    // Initialize options if not set
    if (!fullOptions) {
      if (typeof cfg.generateSocialImages !== "boolean") {
        fullOptions = { ...defaultOptions, ...cfg.generateSocialImages }
      } else {
        fullOptions = defaultOptions
      }
    }

    // Memoize google fonts
    if (!fontsPromise && cfg.generateSocialImages) {
      fontsPromise = getSatoriFont(cfg.theme.typography.header, cfg.theme.typography.body)
    }

    const slug = fileData.filePath
    // since "/" is not a valid character in file names, replace with "-"
    const fileName = slug?.replaceAll("/", "-")

    // Get file description (priority: frontmatter > fileData > fallback below)
    const fdDescription = fileData.description?.trim() ?? ""
    const titleSuffix = cfg.pageTitleSuffix ?? ""
    const pageTitle = fileData.frontmatter?.title ?? i18n(cfg.locale).propertyDefaults.title
    // the home page leads with who it's about; everything else is "Page · site"
    const title =
      fileData.slug === "index"
        ? cfg.author
          ? `${cfg.author.name} · ${pageTitle}`
          : pageTitle
        : pageTitle + titleSuffix
    let description = ""
    if (fdDescription) {
      description = unescapeHTML(fdDescription)
    }

    if (fileData.frontmatter?.socialDescription) {
      description = fileData.frontmatter?.socialDescription as string
    } else if (fileData.frontmatter?.description) {
      description = fileData.frontmatter?.description
    }
    // a page with no prose still gets something better than an ellipsis
    if (!description.replace(/[…\s]/g, "")) {
      description = `${pageTitle}, on ${cfg.pageTitle}`
    }

    const fileDir = joinSegments(ctx.argv.output, "static", "social-images")
    if (cfg.generateSocialImages) {
      // Generate folders for social images (if they dont exist yet)
      if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true })
      }

      if (fileName) {
        // Generate social image (happens async)
        generateSocialImage(
          {
            title,
            description,
            fileName,
            fileDir,
            fileExt: extension,
            fontsPromise,
            cfg,
            fileData,
          },
          fullOptions,
          fileDir,
        )
      }
    }

    const { css, js } = externalResources

    const url = new URL(`https://${cfg.baseUrl ?? "example.com"}`)
    const path = url.pathname as FullSlug
    const baseDir = fileData.slug === "404" ? path : pathToRoot(fileData.slug!)

    const iconPath = joinSegments(baseDir, "static/icon.png")

    const ogImageDefaultPath = `https://${cfg.baseUrl}/static/og-image.png`
    // "static/social-images/slug-filename.md.webp"
    const ogImageGeneratedPath = `https://${cfg.baseUrl}/${fileDir.replace(
      `${ctx.argv.output}/`,
      "",
    )}/${fileName}.${extension}`

    // Use default og image if filePath doesnt exist (for autogenerated paths with no .md file)
    const useDefaultOgImage = fileName === undefined || !cfg.generateSocialImages

    // Path to og/social image (priority: frontmatter > first image on the page > generated image (if enabled) > default image)
    let ogImagePath = useDefaultOgImage ? ogImageDefaultPath : ogImageGeneratedPath
    let ogImageAlt = pageTitle
    // only the default and generated images have a known size
    let ogImageSize: [number, number] | undefined = useDefaultOgImage
      ? [1200, 630]
      : [fullOptions.width, fullOptions.height]

    if (fileData.slug === "index") {
      ogImagePath = ogImageDefaultPath
      ogImageSize = [1200, 630]
    }

    // Url of current page
    const socialUrl =
      fileData.slug === "404"
        ? url.toString()
        : `https://${joinSegments(cfg.baseUrl ?? "example.com", encodeURI(simplifySlug(fileData.slug!)))}`

    const pageImage = firstImage(tree as HtmlRoot)
    if (pageImage) {
      ogImagePath = new URL(pageImage.src, `https://${cfg.baseUrl}/${fileData.slug}`).toString()
      ogImageAlt = pageImage.alt || pageTitle
      ogImageSize = undefined
    }

    // Aliases for image and cover handled in `frontmatter.ts`
    const frontmatterImgUrl = fileData.frontmatter?.socialImage
    if (frontmatterImgUrl) {
      ogImagePath = /^https?:\/\//.test(frontmatterImgUrl)
        ? frontmatterImgUrl
        : `https://${cfg.baseUrl}/${resolveImage(frontmatterImgUrl, ctx.allSlugs)}`
      ogImageSize = undefined
    }

    const ogImageExt = ogImagePath.split(/[?#]/)[0].split(".").pop()?.toLowerCase()
    const ogImageType =
      ogImageExt === "jpg" ? "jpeg" : ogImageExt === "svg" ? "svg+xml" : ogImageExt

    const pageSlug = fileData.slug ?? ""
    const isArticle =
      pageSlug !== "index" &&
      pageSlug !== "404" &&
      !pageSlug.endsWith("/index") &&
      !pageSlug.startsWith("tags/")
    const dates = fileData.dates
    const author = cfg.author && {
      "@type": "Person",
      name: cfg.author.name,
      url: url.toString(),
      sameAs: cfg.author.sameAs,
    }
    const structuredData =
      pageSlug === "index"
        ? {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: cfg.pageTitle,
            url: url.toString(),
            description,
            author,
          }
        : {
            "@context": "https://schema.org",
            "@type": isArticle ? "Article" : "CollectionPage",
            headline: pageTitle,
            description,
            url: socialUrl,
            mainEntityOfPage: socialUrl,
            image: ogImagePath,
            datePublished: isArticle ? dates?.created?.toISOString() : undefined,
            dateModified: isArticle ? dates?.modified?.toISOString() : undefined,
            author,
            isPartOf: { "@type": "WebSite", name: cfg.pageTitle, url: url.toString() },
          }

    return (
      <head>
        <title>{title}</title>
        <meta charSet="utf-8" />
        {cfg.theme.cdnCaching && cfg.theme.fontOrigin === "googleFonts" && (
          <>
            <link rel="preconnect" href="https://fonts.googleapis.com" />
            <link rel="preconnect" href="https://fonts.gstatic.com" />
            <link rel="stylesheet" href={googleFontHref(cfg.theme)} />
          </>
        )}
        <link rel="preconnect" href="https://cdnjs.cloudflare.com" crossOrigin={"anonymous"} />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <meta name="description" content={description} />
        {cfg.author && <meta name="author" content={cfg.author.name} />}
        <meta
          name="robots"
          content={pageSlug === "404" ? "noindex" : "index, follow, max-image-preview:large"}
        />
        <meta name="theme-color" content={cfg.theme.colors.lightMode.light} />
        {cfg.baseUrl && pageSlug !== "404" && <link rel="canonical" href={socialUrl} />}
        {cfg.baseUrl && (
          <link
            rel="alternate"
            type="application/rss+xml"
            title={cfg.pageTitle}
            href={`https://${cfg.baseUrl}/index.xml`}
          />
        )}
        {/* OG/Twitter meta tags */}
        <meta property="og:site_name" content={cfg.pageTitle} />
        <meta property="og:locale" content={cfg.locale.replace("-", "_")} />
        <meta property="og:title" content={pageTitle} />
        <meta property="og:type" content={isArticle ? "article" : "website"} />
        {isArticle && dates?.created && (
          <meta property="article:published_time" content={dates.created.toISOString()} />
        )}
        {isArticle && dates?.modified && (
          <meta property="article:modified_time" content={dates.modified.toISOString()} />
        )}
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content={pageTitle} />
        <meta name="twitter:description" content={description} />
        <meta property="og:description" content={description} />
        {ogImageType && <meta property="og:image:type" content={`image/${ogImageType}`} />}
        <meta property="og:image:alt" content={ogImageAlt} />
        <meta name="twitter:image:alt" content={ogImageAlt} />
        {/* Dont set width and height if unknown (when using an image from the page) */}
        {ogImageSize && (
          <>
            <meta property="og:image:width" content={ogImageSize[0].toString()} />
            <meta property="og:image:height" content={ogImageSize[1].toString()} />
          </>
        )}
        {cfg.baseUrl && (
          <>
            <meta name="twitter:image" content={ogImagePath} />
            <meta property="og:image" content={ogImagePath} />
            <meta property="og:image:secure_url" content={ogImagePath} />
            <meta property="twitter:domain" content={cfg.baseUrl}></meta>
            <meta property="og:url" content={socialUrl}></meta>
            <meta property="twitter:url" content={socialUrl}></meta>
          </>
        )}
        {pageSlug !== "404" && (
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify(structuredData).replace(/</g, "\\u003c"),
            }}
          />
        )}
        <link rel="icon" href={iconPath} />
        <link rel="apple-touch-icon" href={iconPath} />
        <meta name="generator" content="Quartz" />
        {css.map((resource) => CSSResourceToStyleElement(resource, true))}
        {js
          .filter((resource) => resource.loadTime === "beforeDOMReady")
          .map((res) => JSResourceToScriptElement(res, true))}
      </head>
    )
  }

  return Head
}) satisfies QuartzComponentConstructor
