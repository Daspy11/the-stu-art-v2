// Cell types, their physical properties and their colours.
// The foreground grid and the background layer share one id space.

// Original ids are kept stable so scenes saved by older versions still load.
export const EMPTY = 0,
  SAND = 1,
  WATER = 2,
  FIRE = 3,
  WALL = 4,
  WOOD = 5,
  SMOKE = 6,
  GUY = 7,
  MUD = 8,
  SEED = 9,
  LEAF = 10,
  BRICK = 11,
  DOOR = 12,
  STONE = 13,
  TREE = 14,
  KILN_FIRE = 15,
  GRASS = 16,
  KILN_STONE = 17,
  HOUSE_BRICK = 18
// Terrain (static)
export const DIRT = 19,
  TURF = 20,
  CLAY = 21,
  ROCK = 22,
  SLATE = 23,
  COPPER = 24,
  GOLD = 25,
  GRAVEL = 26
// Construction (foreground)
export const PLANK = 27,
  BEAM = 28,
  LADDER = 29,
  RUNG = 30,
  ROOF = 31,
  ROOF_SLATE = 32,
  STONEBLOCK = 33,
  BRICKWORK = 34,
  ROOF_GREEN = 35
// Background layer
export const AUTUMN = 38,
  BIRCH = 39,
  PINE = 40,
  BLOSSOM = 41,
  TUFT = 42,
  FLOWER_RED = 43,
  FLOWER_GOLD = 44,
  FLOWER_BLUE = 45,
  VINE = 46,
  MUSHROOM = 47,
  WALL_WOOD = 48,
  FRAME = 49,
  WALL_STONE = 50,
  GLASS = 51,
  ROPE = 52,
  BANNER_RED = 53,
  BANNER_BLUE = 54,
  LANTERN = 55,
  DIRT_WALL = 56,
  ROCK_WALL = 57,
  WALL_BRICK = 58,
  BIRCH_LEAF = 59,
  FLAGPOLE = 60,
  WALL_PLASTER = 61,
  WALL_DARK = 62
// Invisible solid cells covering the page's text
export const TEXT = 63

export const NUM_TYPES = 64

function table(ids: number[]): Uint8Array {
  const t = new Uint8Array(NUM_TYPES)
  for (const id of ids) t[id] = 1
  return t
}

// Blocks guys and falling particles
export const SOLID = table([
  SAND,
  MUD,
  GRASS,
  SEED,
  WALL,
  BRICK,
  STONE,
  WOOD,
  KILN_STONE,
  HOUSE_BRICK,
  DOOR,
  DIRT,
  TURF,
  CLAY,
  ROCK,
  SLATE,
  COPPER,
  GOLD,
  GRAVEL,
  PLANK,
  BEAM,
  ROOF,
  ROOF_SLATE,
  STONEBLOCK,
  BRICKWORK,
  ROOF_GREEN,
  TEXT,
])
// Cells the particle pass has to look at
export const DYNAMIC = table([SAND, WATER, FIRE, SMOKE, MUD, SEED, GRASS, KILN_FIRE])
// Guys can climb these and stand on top of them
export const CLIMB = table([LADDER, RUNG])
// Ground a tree can root in
export const SOIL = table([DIRT, TURF, MUD, GRASS, CLAY])
// Things fire spreads into
export const FLAMMABLE = table([WOOD, PLANK, BEAM, LADDER, RUNG, ROOF])
export const BG_FLAMMABLE = table([
  TREE,
  LEAF,
  PINE,
  BLOSSOM,
  AUTUMN,
  BIRCH,
  BIRCH_LEAF,
  TUFT,
  FLOWER_RED,
  FLOWER_GOLD,
  FLOWER_BLUE,
  VINE,
  WALL_WOOD,
  WALL_DARK,
  WALL_PLASTER,
  FRAME,
  ROPE,
  BANNER_RED,
  BANNER_BLUE,
])
// Built by guys (used for stats and to keep terrain processes off structures)
export const BUILT = table([
  PLANK,
  BEAM,
  LADDER,
  RUNG,
  ROOF,
  ROOF_SLATE,
  STONEBLOCK,
  BRICKWORK,
  ROOF_GREEN,
])
export const BUILT_BG = table([
  WALL_WOOD,
  WALL_PLASTER,
  WALL_DARK,
  FRAME,
  WALL_STONE,
  GLASS,
  ROPE,
  BANNER_RED,
  BANNER_BLUE,
  LANTERN,
  WALL_BRICK,
  FLAGPOLE,
])
// Cells guys can dig through for building sites
export const DIGGABLE = table([
  DIRT,
  TURF,
  CLAY,
  GRAVEL,
  SAND,
  MUD,
  GRASS,
  STONE,
  ROCK,
  COPPER,
  GOLD,
])
export const QUARRY = table([STONE, ROCK, SLATE, GRAVEL])

// --- Colours (pre-packed ABGR for Uint32Array pixel buffers) ---
export function rgba(r: number, g: number, b: number, a = 255): number {
  return ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
}
const c = rgba

// Four variants per type; patterns pick between them
export const PAL: (Uint32Array | undefined)[] = new Array(NUM_TYPES)
function pal(id: number, cols: [number, number, number][]) {
  PAL[id] = Uint32Array.from(cols.map(([r, g, b]) => c(r, g, b)))
}

pal(SAND, [
  [194, 160, 60],
  [180, 148, 50],
  [168, 138, 44],
  [186, 154, 55],
])
pal(WATER, [
  [60, 120, 200],
  [45, 105, 185],
  [75, 130, 210],
  [35, 100, 190],
])
pal(FIRE, [
  [232, 85, 48],
  [240, 100, 40],
  [220, 60, 30],
  [246, 111, 78],
])
pal(WALL, [
  [140, 138, 135],
  [130, 128, 125],
  [150, 148, 145],
  [135, 133, 130],
])
pal(WOOD, [
  [120, 80, 40],
  [110, 72, 35],
  [130, 88, 45],
  [115, 76, 38],
])
pal(SMOKE, [
  [190, 188, 185],
  [180, 178, 175],
  [200, 198, 195],
  [185, 183, 180],
])
pal(MUD, [
  [101, 67, 33],
  [92, 60, 28],
  [110, 75, 38],
  [96, 63, 30],
])
pal(SEED, [
  [160, 140, 60],
  [148, 130, 50],
  [170, 150, 70],
  [155, 135, 55],
])
pal(LEAF, [
  [60, 140, 50],
  [50, 125, 40],
  [70, 150, 60],
  [55, 130, 45],
])
pal(BRICK, [
  [180, 80, 50],
  [170, 72, 44],
  [190, 88, 56],
  [175, 76, 48],
])
pal(DOOR, [
  [140, 100, 50],
  [130, 92, 44],
  [150, 108, 56],
  [135, 96, 48],
])
pal(STONE, [
  [160, 160, 155],
  [150, 150, 145],
  [170, 170, 165],
  [155, 155, 150],
])
pal(TREE, [
  [120, 80, 40],
  [110, 72, 35],
  [130, 88, 45],
  [115, 76, 38],
])
pal(KILN_FIRE, [
  [240, 140, 40],
  [250, 160, 50],
  [230, 120, 30],
  [245, 150, 45],
])
pal(GRASS, [
  [76, 140, 50],
  [66, 125, 40],
  [86, 150, 58],
  [72, 132, 46],
])
pal(KILN_STONE, [
  [140, 140, 135],
  [130, 130, 125],
  [150, 150, 145],
  [135, 135, 130],
])
pal(HOUSE_BRICK, [
  [180, 80, 50],
  [170, 72, 44],
  [190, 88, 56],
  [175, 76, 48],
])

pal(DIRT, [
  [128, 88, 54],
  [119, 81, 49],
  [136, 94, 58],
  [123, 85, 51],
])
pal(TURF, [
  [92, 150, 60],
  [80, 138, 52],
  [102, 160, 66],
  [72, 128, 46],
])
pal(CLAY, [
  [156, 96, 64],
  [146, 88, 58],
  [164, 102, 70],
  [150, 92, 60],
])
pal(ROCK, [
  [122, 120, 116],
  [113, 111, 107],
  [130, 128, 124],
  [117, 115, 111],
])
pal(SLATE, [
  [90, 90, 98],
  [83, 83, 91],
  [97, 97, 105],
  [87, 87, 95],
])
pal(COPPER, [
  [196, 116, 62],
  [178, 100, 52],
  [210, 132, 74],
  [186, 108, 58],
])
pal(GOLD, [
  [230, 190, 66],
  [214, 172, 52],
  [242, 206, 90],
  [222, 182, 60],
])
pal(GRAVEL, [
  [146, 138, 126],
  [126, 120, 110],
  [158, 150, 138],
  [136, 128, 118],
])

pal(PLANK, [
  [168, 118, 68],
  [156, 108, 61],
  [176, 126, 74],
  [128, 88, 50],
])
pal(BEAM, [
  [108, 72, 40],
  [100, 66, 36],
  [116, 78, 44],
  [92, 60, 32],
])
pal(LADDER, [
  [132, 90, 50],
  [122, 82, 45],
  [140, 96, 54],
  [112, 76, 42],
])
pal(RUNG, [
  [150, 104, 60],
  [140, 96, 54],
  [158, 110, 64],
  [132, 90, 50],
])
pal(ROOF, [
  [172, 74, 52],
  [156, 64, 46],
  [184, 84, 58],
  [136, 54, 40],
])
pal(ROOF_SLATE, [
  [84, 96, 120],
  [74, 86, 110],
  [94, 106, 130],
  [64, 74, 96],
])
pal(ROOF_GREEN, [
  [78, 128, 104],
  [68, 116, 94],
  [88, 140, 114],
  [58, 102, 82],
])
pal(STONEBLOCK, [
  [168, 166, 158],
  [156, 154, 146],
  [176, 174, 166],
  [198, 196, 188],
])
pal(BRICKWORK, [
  [176, 82, 56],
  [164, 74, 50],
  [186, 90, 62],
  [206, 180, 160],
])

pal(AUTUMN, [
  [214, 120, 48],
  [196, 100, 40],
  [226, 140, 60],
  [188, 86, 36],
])
pal(BIRCH, [
  [226, 222, 210],
  [212, 208, 196],
  [236, 232, 220],
  [70, 66, 60],
])
pal(BIRCH_LEAF, [
  [132, 176, 70],
  [120, 164, 60],
  [146, 188, 80],
  [112, 154, 56],
])
pal(PINE, [
  [44, 104, 66],
  [36, 94, 58],
  [52, 114, 74],
  [32, 86, 52],
])
pal(BLOSSOM, [
  [236, 160, 182],
  [226, 144, 170],
  [244, 176, 194],
  [216, 132, 160],
])
pal(TUFT, [
  [96, 160, 62],
  [84, 146, 54],
  [108, 172, 70],
  [76, 136, 48],
])
pal(FLOWER_RED, [
  [220, 70, 70],
  [204, 58, 64],
  [232, 92, 84],
  [96, 160, 62],
])
pal(FLOWER_GOLD, [
  [240, 196, 60],
  [228, 180, 48],
  [248, 210, 84],
  [96, 160, 62],
])
pal(FLOWER_BLUE, [
  [120, 120, 220],
  [104, 104, 204],
  [140, 140, 232],
  [96, 160, 62],
])
pal(VINE, [
  [70, 130, 56],
  [60, 118, 48],
  [82, 142, 64],
  [54, 108, 42],
])
pal(MUSHROOM, [
  [200, 64, 56],
  [230, 220, 200],
  [214, 80, 66],
  [190, 180, 160],
])
pal(WALL_WOOD, [
  [196, 160, 118],
  [186, 151, 110],
  [204, 168, 126],
  [170, 136, 98],
])
pal(FRAME, [
  [112, 76, 44],
  [104, 70, 40],
  [120, 82, 48],
  [96, 64, 36],
])
pal(WALL_STONE, [
  [176, 174, 168],
  [166, 164, 158],
  [184, 182, 176],
  [150, 148, 142],
])
pal(GLASS, [
  [184, 216, 232],
  [170, 206, 226],
  [214, 236, 246],
  [160, 196, 218],
])
pal(ROPE, [
  [150, 120, 80],
  [140, 112, 74],
  [158, 128, 86],
  [132, 104, 68],
])
pal(BANNER_RED, [
  [196, 54, 54],
  [180, 44, 48],
  [212, 70, 64],
  [230, 196, 90],
])
pal(BANNER_BLUE, [
  [60, 90, 176],
  [50, 78, 160],
  [74, 104, 190],
  [230, 196, 90],
])
pal(LANTERN, [
  [255, 214, 110],
  [250, 196, 90],
  [255, 232, 150],
  [90, 70, 50],
])
pal(DIRT_WALL, [
  [92, 64, 42],
  [86, 60, 39],
  [98, 68, 45],
  [80, 56, 36],
])
pal(ROCK_WALL, [
  [84, 83, 82],
  [78, 77, 76],
  [90, 89, 88],
  [74, 73, 72],
])
pal(WALL_BRICK, [
  [160, 100, 80],
  [150, 92, 74],
  [168, 108, 86],
  [190, 160, 140],
])
pal(WALL_PLASTER, [
  [232, 224, 204],
  [226, 217, 196],
  [238, 231, 212],
  [204, 192, 168],
])
pal(WALL_DARK, [
  [150, 108, 72],
  [142, 101, 67],
  [158, 115, 78],
  [124, 88, 58],
])
pal(FLAGPOLE, [
  [90, 86, 80],
  [80, 76, 70],
  [100, 96, 90],
  [70, 66, 60],
])

// How each type picks a palette variant. -1 = draw nothing for this cell.
const P_NOISE = 0,
  P_PLANK = 1,
  P_BLOCK3 = 2,
  P_BRICK2 = 3,
  P_ROOF = 4,
  P_RUNG = 5,
  P_WALLWOOD = 6,
  P_GLASS = 7,
  P_SOLID = 8,
  P_SPECK = 9,
  P_BIRCH = 10,
  P_INVISIBLE = 11
const PATTERN = new Uint8Array(NUM_TYPES)
PATTERN[PLANK] = P_PLANK
PATTERN[STONEBLOCK] = P_BLOCK3
PATTERN[WALL_STONE] = P_BLOCK3
PATTERN[BRICKWORK] = P_BRICK2
PATTERN[WALL_BRICK] = P_BRICK2
PATTERN[ROOF] = P_ROOF
PATTERN[ROOF_SLATE] = P_ROOF
PATTERN[ROOF_GREEN] = P_ROOF
PATTERN[RUNG] = P_RUNG
PATTERN[WALL_WOOD] = P_WALLWOOD
PATTERN[WALL_DARK] = P_WALLWOOD
PATTERN[GLASS] = P_GLASS
PATTERN[LADDER] = P_SOLID
PATTERN[BEAM] = P_SOLID
PATTERN[FRAME] = P_SOLID
PATTERN[FLAGPOLE] = P_SOLID
PATTERN[GRAVEL] = P_SPECK
PATTERN[COPPER] = P_SPECK
PATTERN[GOLD] = P_SPECK
PATTERN[BIRCH] = P_BIRCH
PATTERN[TEXT] = P_INVISIBLE

export function cellColor(type: number, x: number, y: number): number {
  const p = PAL[type]
  if (!p) return 0
  switch (PATTERN[type]) {
    case P_NOISE:
      return p[(x * 7 + y * 13) & 3]
    case P_PLANK:
      return (x + ((y & 1) << 2)) % 7 === 0 ? p[3] : p[((x >> 1) + y * 3) % 3]
    case P_BLOCK3: {
      const row = Math.floor(y / 3)
      if (y % 3 === 0 || (x + (row & 1) * 3) % 6 === 0) return p[3]
      return p[(row * 5 + Math.floor((x + (row & 1) * 3) / 6)) % 3]
    }
    case P_BRICK2: {
      const row = y >> 1
      if ((y & 1) === 0 || (x + (row & 1) * 2) % 4 === 0) return p[3]
      return p[(row * 7 + ((x + (row & 1) * 2) >> 2)) % 3]
    }
    case P_ROOF:
      return (y & 1) === 0 ? p[3] : p[(x * 5 + y) % 3]
    case P_RUNG:
      return (y & 1) === 0 ? p[(x + y) & 1] : 0
    case P_WALLWOOD:
      return x % 4 === 0 ? p[3] : p[(x * 3 + (y >> 2)) % 3]
    case P_GLASS:
      return (x - y) % 4 === 0 ? p[2] : p[(x + y) & 1]
    case P_SOLID:
      return p[(y >> 1) & 1]
    case P_SPECK: {
      const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0
      return p[h & 3]
    }
    case P_BIRCH: {
      const h = (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0
      return h % 5 === 0 ? p[3] : p[h & 1]
    }
    case P_INVISIBLE:
      return 0
  }
  return p[0]
}
