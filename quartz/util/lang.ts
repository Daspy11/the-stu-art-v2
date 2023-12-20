export function pluralize(count: number, s: string): string {
  const sLower = s.toLowerCase()
  if (sLower === "is" || sLower === "are") {
    return count === 1 ? "is" : "are"
  }

  return count === 1 ? s : s + "s"
}

export function capitalize(s: string): string {
  return s.substring(0, 1).toUpperCase() + s.substring(1)
}
