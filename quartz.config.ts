import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

/**
 * Quartz 4.0 Configuration
 *
 * See https://quartz.jzhao.xyz/configuration for more information.
 */
const config: QuartzConfig = {
  configuration: {
    pageTitle: "🦊 stu.art",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "umami",
      websiteId: "1aeb32f8-db30-4a76-bfa8-86b86c06e3b0"
    },
    locale: "en-US",
    baseUrl: "thestu.art",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    generateSocialImages: false,
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Lora",
        body: "Lato",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#F7F4F1",
          lightgray: "#e9e9e8",
          gray: "#d3d2d1",
          darkgray: "#363534",
          dark: "#363534",
          secondary: "#E85530",
          tertiary: "#f66f4e",
          highlight: "rgba(232,85,48,0.15)",
          textHighlight: "#fff23688",
        },
        darkMode: {
          light: "#F7F4F1",
          lightgray: "#e9e9e8",
          gray: "#d3d2d1",
          darkgray: "#363534",
          dark: "#363534",
          secondary: "#E85530",
          tertiary: "#f66f4e",
          highlight: "rgba(232,85,48,0.15)",
          textHighlight: "#b3aa0288",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest", externalLinkIcon: false }),
      Plugin.Description(),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
