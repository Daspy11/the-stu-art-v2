import { ComponentType, JSX } from "preact"
import { useState, useEffect, useRef, useCallback } from "preact/hooks"

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

// --- Powder Game Particle Simulation ---

type ParticleType = 0 | 1 | 2 | 3 | 4 | 5 | 6
const EMPTY = 0 as const
const SAND = 1 as const
const WATER = 2 as const
const FIRE = 3 as const
const WALL = 4 as const
const PLANT = 5 as const
const SMOKE = 6 as const

const PARTICLE_COLORS: Record<number, string[]> = {
  [SAND]: ["#e6c35c", "#d4b44a", "#c8a83e", "#dbb94f"],
  [WATER]: ["#4a90d9", "#3a7bc8", "#5a9ae0", "#3080d0"],
  [FIRE]: ["#ff4500", "#ff6600", "#ff2200", "#ff8800"],
  [WALL]: ["#888888", "#777777", "#999999", "#808080"],
  [PLANT]: ["#228B22", "#2d9e2d", "#1e7a1e", "#33a833"],
  [SMOKE]: ["#aaaaaa", "#999999", "#bbbbbb", "#b0b0b0"],
}

const MATERIAL_INFO: { type: ParticleType; name: string; color: string }[] = [
  { type: SAND, name: "Sand", color: "#e6c35c" },
  { type: WATER, name: "Water", color: "#4a90d9" },
  { type: FIRE, name: "Fire", color: "#ff4500" },
  { type: WALL, name: "Wall", color: "#888888" },
  { type: PLANT, name: "Plant", color: "#228B22" },
  { type: EMPTY, name: "Erase", color: "transparent" },
]

export function PowderGame({
  width = 200,
  height = 120,
  cellSize = 3,
}: {
  width?: number
  height?: number
  cellSize?: number
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const gridRef = useRef<Uint8Array>(new Uint8Array(width * height))
  const updatedRef = useRef<Uint8Array>(new Uint8Array(width * height))
  const animRef = useRef<number>(0)
  const mouseRef = useRef<{ down: boolean; x: number; y: number }>({ down: false, x: 0, y: 0 })
  const materialRef = useRef<ParticleType>(SAND)
  const [selectedMaterial, setSelectedMaterial] = useState<ParticleType>(SAND)
  const [paused, setPaused] = useState(false)
  const pausedRef = useRef(false)

  const idx = (x: number, y: number) => y * width + x
  const inBounds = (x: number, y: number) => x >= 0 && x < width && y >= 0 && y < height
  const get = (x: number, y: number) => (inBounds(x, y) ? gridRef.current[idx(x, y)] : WALL)
  const set = (x: number, y: number, v: ParticleType) => {
    if (inBounds(x, y)) gridRef.current[idx(x, y)] = v
  }

  const spawnParticles = useCallback(() => {
    const { down, x, y } = mouseRef.current
    if (!down) return
    const mat = materialRef.current
    const brushSize = mat === WATER || mat === FIRE ? 3 : 2
    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        if (dx * dx + dy * dy > brushSize * brushSize) continue
        const px = x + dx
        const py = y + dy
        if (!inBounds(px, py)) continue
        if (mat === EMPTY) {
          set(px, py, EMPTY)
        } else if (get(px, py) === EMPTY) {
          if (mat === FIRE || mat === WATER ? Math.random() < 0.6 : true) {
            set(px, py, mat)
          }
        }
      }
    }
  }, [width, height])

  const simulate = useCallback(() => {
    const grid = gridRef.current
    const updated = updatedRef.current
    updated.fill(0)

    // Process bottom-up so gravity works naturally
    for (let y = height - 1; y >= 0; y--) {
      // Randomize horizontal scan direction to avoid bias
      const leftToRight = Math.random() < 0.5
      for (let i = 0; i < width; i++) {
        const x = leftToRight ? i : width - 1 - i
        const cell = grid[idx(x, y)]
        if (cell === EMPTY || cell === WALL || updated[idx(x, y)]) continue

        if (cell === SAND) {
          // Fall down
          if (get(x, y + 1) === EMPTY) {
            set(x, y, EMPTY)
            set(x, y + 1, SAND)
            updated[idx(x, y + 1)] = 1
          } else if (get(x, y + 1) === WATER) {
            // Sink through water
            set(x, y, WATER)
            set(x, y + 1, SAND)
            updated[idx(x, y + 1)] = 1
            updated[idx(x, y)] = 1
          } else {
            // Slide diagonally
            const dir = Math.random() < 0.5 ? -1 : 1
            if (get(x + dir, y + 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x + dir, y + 1, SAND)
              updated[idx(x + dir, y + 1)] = 1
            } else if (get(x - dir, y + 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x - dir, y + 1, SAND)
              updated[idx(x - dir, y + 1)] = 1
            }
          }
        } else if (cell === WATER) {
          if (get(x, y + 1) === EMPTY) {
            set(x, y, EMPTY)
            set(x, y + 1, WATER)
            updated[idx(x, y + 1)] = 1
          } else {
            const dir = Math.random() < 0.5 ? -1 : 1
            if (get(x + dir, y + 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x + dir, y + 1, WATER)
              updated[idx(x + dir, y + 1)] = 1
            } else if (get(x - dir, y + 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x - dir, y + 1, WATER)
              updated[idx(x - dir, y + 1)] = 1
            } else {
              // Flow sideways
              if (get(x + dir, y) === EMPTY) {
                set(x, y, EMPTY)
                set(x + dir, y, WATER)
                updated[idx(x + dir, y)] = 1
              } else if (get(x - dir, y) === EMPTY) {
                set(x, y, EMPTY)
                set(x - dir, y, WATER)
                updated[idx(x - dir, y)] = 1
              }
            }
          }
        } else if (cell === FIRE) {
          // Fire rises and dies
          if (Math.random() < 0.08) {
            set(x, y, SMOKE)
            updated[idx(x, y)] = 1
          } else if (Math.random() < 0.15) {
            set(x, y, EMPTY)
          } else {
            // Spread to adjacent plant
            for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
              if (get(x + dx, y + dy) === PLANT && Math.random() < 0.05) {
                set(x + dx, y + dy, FIRE)
                updated[idx(x + dx, y + dy)] = 1
              }
            }
            // Rise
            const dir = Math.random() < 0.5 ? -1 : 1
            if (get(x, y - 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x, y - 1, FIRE)
              updated[idx(x, y - 1)] = 1
            } else if (get(x + dir, y - 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x + dir, y - 1, FIRE)
              updated[idx(x + dir, y - 1)] = 1
            }
          }
        } else if (cell === SMOKE) {
          if (Math.random() < 0.03) {
            set(x, y, EMPTY)
          } else {
            const dir = Math.random() < 0.5 ? -1 : 1
            if (get(x, y - 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x, y - 1, SMOKE)
              updated[idx(x, y - 1)] = 1
            } else if (get(x + dir, y - 1) === EMPTY) {
              set(x, y, EMPTY)
              set(x + dir, y - 1, SMOKE)
              updated[idx(x + dir, y - 1)] = 1
            } else if (get(x + dir, y) === EMPTY) {
              set(x, y, EMPTY)
              set(x + dir, y, SMOKE)
              updated[idx(x + dir, y)] = 1
            }
          }
        } else if (cell === PLANT) {
          // Grow slowly when touching water
          for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as const) {
            if (get(x + dx, y + dy) === WATER && Math.random() < 0.01) {
              set(x + dx, y + dy, PLANT)
              updated[idx(x + dx, y + dy)] = 1
            }
          }
        }
      }
    }
  }, [width, height])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return
    const grid = gridRef.current

    ctx.fillStyle = "#1a1a2e"
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const cell = grid[idx(x, y)]
        if (cell === EMPTY) continue
        const colors = PARTICLE_COLORS[cell]
        ctx.fillStyle = colors[(x * 7 + y * 13) % colors.length]
        ctx.fillRect(x * cellSize, y * cellSize, cellSize, cellSize)
      }
    }
  }, [width, height, cellSize])

  useEffect(() => {
    const loop = () => {
      spawnParticles()
      if (!pausedRef.current) simulate()
      draw()
      animRef.current = requestAnimationFrame(loop)
    }
    animRef.current = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(animRef.current)
  }, [simulate, draw, spawnParticles])

  const getGridPos = (e: MouseEvent | TouchEvent) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clientX = "touches" in e ? e.touches[0]?.clientX ?? 0 : e.clientX
    const clientY = "touches" in e ? e.touches[0]?.clientY ?? 0 : e.clientY
    mouseRef.current.x = Math.floor(((clientX - rect.left) / rect.width) * width)
    mouseRef.current.y = Math.floor(((clientY - rect.top) / rect.height) * height)
  }

  const canvasWidth = width * cellSize
  const canvasHeight = height * cellSize

  return (
    <div className="powder-game" style={{ marginBlock: "1.5rem" }}>
      <canvas
        ref={canvasRef}
        width={canvasWidth}
        height={canvasHeight}
        style={{
          width: "100%",
          maxWidth: `${canvasWidth}px`,
          imageRendering: "pixelated",
          borderRadius: "6px",
          cursor: "crosshair",
          touchAction: "none",
          display: "block",
          border: "1px solid var(--gray, #444)",
        }}
        onMouseDown={(e) => {
          mouseRef.current.down = true
          getGridPos(e)
        }}
        onMouseMove={(e) => {
          if (mouseRef.current.down) getGridPos(e)
        }}
        onMouseUp={() => { mouseRef.current.down = false }}
        onMouseLeave={() => { mouseRef.current.down = false }}
        onTouchStart={(e) => {
          e.preventDefault()
          mouseRef.current.down = true
          getGridPos(e)
        }}
        onTouchMove={(e) => {
          e.preventDefault()
          getGridPos(e)
        }}
        onTouchEnd={() => { mouseRef.current.down = false }}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "6px",
          marginTop: "8px",
          alignItems: "center",
        }}
      >
        {MATERIAL_INFO.map(({ type, name, color }) => (
          <button
            key={name}
            onClick={() => {
              materialRef.current = type
              setSelectedMaterial(type)
            }}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              border: selectedMaterial === type ? "2px solid var(--secondary, #b4d0e7)" : "1px solid var(--gray, #444)",
              borderRadius: "4px",
              background: color === "transparent" ? "var(--light, #1a1a2e)" : color,
              color: type === SAND || type === PLANT ? "#111" : "#fff",
              cursor: "pointer",
              opacity: selectedMaterial === type ? 1 : 0.7,
              fontWeight: selectedMaterial === type ? 700 : 400,
            }}
          >
            {name}
          </button>
        ))}
        <button
          onClick={() => {
            pausedRef.current = !pausedRef.current
            setPaused(p => !p)
          }}
          style={{
            padding: "4px 10px",
            fontSize: "12px",
            border: "1px solid var(--gray, #444)",
            borderRadius: "4px",
            background: "var(--light, #1a1a2e)",
            color: "var(--darkgray, #ccc)",
            cursor: "pointer",
            marginLeft: "auto",
          }}
        >
          {paused ? "Play" : "Pause"}
        </button>
        <button
          onClick={() => gridRef.current.fill(EMPTY)}
          style={{
            padding: "4px 10px",
            fontSize: "12px",
            border: "1px solid var(--gray, #444)",
            borderRadius: "4px",
            background: "var(--light, #1a1a2e)",
            color: "var(--darkgray, #ccc)",
            cursor: "pointer",
          }}
        >
          Clear
        </button>
      </div>
    </div>
  )
}

export const mdxComponents: Record<string, ComponentType<any>> = {
  Counter,
  Collapsible,
  Tabs,
  Alert,
  PowderGame,
}
