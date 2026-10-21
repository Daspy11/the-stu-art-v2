import { randomUUID } from "crypto"
import { JSX } from "preact/jsx-runtime"

export type JSResource = {
  loadTime: "beforeDOMReady" | "afterDOMReady"
  moduleType?: "module"
  spaPreserve?: boolean
} & (
  | {
      src: string
      contentType: "external"
    }
  | {
      script: string
      contentType: "inline"
    }
)

export type CSSResource = {
  content: string
  inline?: boolean
  spaPreserve?: boolean
}

// `persist` marks a script for the SPA's page swap (micromorph) to insert as-is
// rather than recreate: a recreated script runs again (it even gets a fresh `?t=`
// query, so a module isn't deduplicated), doubling every listener and loop on the site.
export function JSResourceToScriptElement(
  resource: JSResource,
  preserve?: boolean,
  persist?: boolean,
): JSX.Element {
  const scriptType = resource.moduleType ?? "application/javascript"
  const spaPreserve = preserve ?? resource.spaPreserve
  const dataPersist = persist ? "" : undefined
  if (resource.contentType === "external") {
    return (
      <script
        key={resource.src}
        src={resource.src}
        type={scriptType}
        spa-preserve={spaPreserve}
        data-persist={dataPersist}
      />
    )
  } else {
    const content = resource.script
    return (
      <script
        key={randomUUID()}
        type={scriptType}
        spa-preserve={spaPreserve}
        data-persist={dataPersist}
        dangerouslySetInnerHTML={{ __html: content }}
      ></script>
    )
  }
}

export function CSSResourceToStyleElement(resource: CSSResource, preserve?: boolean): JSX.Element {
  const spaPreserve = preserve ?? resource.spaPreserve
  if (resource.inline ?? false) {
    return <style>{resource.content}</style>
  } else {
    return (
      <link
        key={resource.content}
        href={resource.content}
        rel="stylesheet"
        type="text/css"
        spa-preserve={spaPreserve}
      />
    )
  }
}

export interface StaticResources {
  css: CSSResource[]
  js: JSResource[]
}
