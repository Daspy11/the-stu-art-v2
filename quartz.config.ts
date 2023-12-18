import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "thestu.art",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "umami",
      websiteId: "1aeb32f8-db30-4a76-bfa8-86b86c06e3b0"
    },
    baseUrl: "thestu.art",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "created",
    theme: {
      typography: {
        header: "Lora",
        body: "Bricolage Grotesque",
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
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.TableOfContents(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "filesystem"], // you can add 'git' here for last modified from Git but this makes the build slower
      }),
      Plugin.SyntaxHighlighting(),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Latex({ renderEngine: "katex" }),
      Plugin.Description(),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources({ fontOrigin: "googleFonts" }),
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
