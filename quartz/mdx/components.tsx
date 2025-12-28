import { ComponentType, JSX } from "preact"
import { useState } from "preact/hooks"

export function Counter({ initial = 0 }: { initial?: number }) {
  const [count, setCount] = useState(initial)

  return (
    <div className="mdx-counter" style={{ padding: "1rem", border: "1px solid var(--gray)", borderRadius: "8px", marginBlock: "1rem" }}>
      <p style={{ marginBottom: "0.5rem" }}>Count: <strong>{count}</strong></p>
      <button
        onClick={() => setCount(c => c - 1)}
        style={{ marginRight: "0.5rem", padding: "0.25rem 0.75rem", cursor: "pointer" }}
      >
        -
      </button>
      <button
        onClick={() => setCount(c => c + 1)}
        style={{ padding: "0.25rem 0.75rem", cursor: "pointer" }}
      >
        +
      </button>
    </div>
  )
}

export function Collapsible({ title, children }: { title: string; children: JSX.Element | JSX.Element[] }) {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <div className="mdx-collapsible" style={{ border: "1px solid var(--gray)", borderRadius: "8px", marginBlock: "1rem" }}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          width: "100%",
          padding: "0.75rem 1rem",
          textAlign: "left",
          background: "var(--light)",
          border: "none",
          cursor: "pointer",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontWeight: 600,
        }}
      >
        {title}
        <span style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
          ▼
        </span>
      </button>
      {isOpen && (
        <div style={{ padding: "1rem" }}>
          {children}
        </div>
      )}
    </div>
  )
}

export function Tabs({ children, labels }: { children: JSX.Element[]; labels: string[] }) {
  const [activeTab, setActiveTab] = useState(0)

  return (
    <div className="mdx-tabs" style={{ marginBlock: "1rem" }}>
      <div style={{ display: "flex", borderBottom: "1px solid var(--gray)" }}>
        {labels.map((label, i) => (
          <button
            key={i}
            onClick={() => setActiveTab(i)}
            style={{
              padding: "0.5rem 1rem",
              border: "none",
              background: activeTab === i ? "var(--light)" : "transparent",
              borderBottom: activeTab === i ? "2px solid var(--secondary)" : "2px solid transparent",
              cursor: "pointer",
              fontWeight: activeTab === i ? 600 : 400,
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div style={{ padding: "1rem" }}>
        {children[activeTab]}
      </div>
    </div>
  )
}

export function Alert({
  type = "info",
  title,
  children
}: {
  type?: "info" | "warning" | "error" | "success"
  title?: string
  children: JSX.Element | JSX.Element[] | string
}) {
  const colors = {
    info: { bg: "#e3f2fd", border: "#2196f3", icon: "ℹ️" },
    warning: { bg: "#fff3e0", border: "#ff9800", icon: "⚠️" },
    error: { bg: "#ffebee", border: "#f44336", icon: "❌" },
    success: { bg: "#e8f5e9", border: "#4caf50", icon: "✅" },
  }

  const { bg, border, icon } = colors[type]

  return (
    <div
      className={`mdx-alert mdx-alert-${type}`}
      style={{
        padding: "1rem",
        borderLeft: `4px solid ${border}`,
        background: bg,
        borderRadius: "4px",
        marginBlock: "1rem",
      }}
    >
      {title && (
        <div style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
          {icon} {title}
        </div>
      )}
      <div>{children}</div>
    </div>
  )
}

export const mdxComponents: Record<string, ComponentType<any>> = {
  Counter,
  Collapsible,
  Tabs,
  Alert,
}
