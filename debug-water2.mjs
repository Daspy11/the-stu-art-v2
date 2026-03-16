import { readFileSync } from "fs"

const raw = readFileSync("badstate.json", "utf8")
const scene = JSON.parse("{" + raw + "}").index
const EMPTY=0,SAND=1,WATER=2,SEED=9,TREE=14,LEAF=10
const W=scene.w, H=scene.h
const grid=new Uint8Array(W*H), bgGrid=new Uint8Array(W*H)
for (const [x,y,t] of scene.p) { if(x>=0&&x<W&&y>=0&&y<H) grid[y*W+x]=t }
if (scene.bg) for (const [x,y,t] of scene.bg) { if(x>=0&&x<W&&y>=0&&y<H) bgGrid[y*W+x]=t }

// Simulate with radius=20
for (const [gi, gx, gy] of [[0, 470, 314], [1, 250, 305]]) {
  console.log(`\n=== Guy ${gi} at (${gx}, ${gy}) ===`)

  // Trees
  let treeCount = 0
  for (let dx=-6;dx<=6;dx++) for (let dy=-8;dy<=2;dy++) {
    const nx=gx+dx,ny=gy+dy
    if(nx>=0&&nx<W&&ny>=0&&ny<H&&bgGrid[ny*W+nx]===TREE) treeCount++
  }
  console.log(`  Trees: ${treeCount}`)

  // Seed within 8
  let hasSeed = false
  for (let r=1;r<=8&&!hasSeed;r++) for (let dx=-r;dx<=r;dx++) {
    for (const dy of (Math.abs(dx)===r?Array.from({length:2*r+1},(_,i)=>i-r):[-r,r])) {
      if(gx+dx>=0&&gx+dx<W&&gy+dy>=0&&gy+dy<H&&grid[(gy+dy)*W+(gx+dx)]===SEED) hasSeed=true
    }
  }

  // Inland sand within 20 + plantable check
  let usefulSand = false
  for (let r=3;r<=20&&!usefulSand;r++) {
    for (let dx=-r;dx<=r;dx++) {
      for (const dy of (Math.abs(dx)===r?Array.from({length:2*r+1},(_,i)=>i-r):[-r,r])) {
        const nx=gx+dx,ny=gy+dy
        if(nx<0||nx>=W||ny<0||ny>=H||grid[ny*W+nx]!==SAND) continue
        let nearW=false
        for (const [fx,fy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]]) {
          const wx=nx+fx,wy=ny+fy
          if(wx>=0&&wx<W&&wy>=0&&wy<H&&grid[wy*W+wx]===WATER) nearW=true
        }
        if(nearW) continue
        if(ny-1<0||grid[(ny-1)*W+nx]!==EMPTY) continue
        let tooClose=false
        for(let sy=-3;sy<=3&&!tooClose;sy++) for(let sx=-3;sx<=3&&!tooClose;sx++) {
          if(sx===0&&sy===0) continue
          const px=nx+sx,py=(ny-1)+sy
          if(px>=0&&px<W&&py>=0&&py<H) {
            if(grid[py*W+px]===SEED||bgGrid[py*W+px]===TREE||bgGrid[py*W+px]===LEAF) tooClose=true
          }
        }
        if(!tooClose) { usefulSand=true; console.log(`  Useful sand at (${nx},${ny}) dist=${r}`) }
      }
    }
  }

  // Plantable mud within 20
  let plantableMud = false
  for (let r=1;r<=20&&!plantableMud;r++) {
    for (let dx=-r;dx<=r;dx++) {
      for (const dy of (Math.abs(dx)===r?Array.from({length:2*r+1},(_,i)=>i-r):[-r,r])) {
        const mx=gx+dx,my=gy+dy
        if(mx<0||mx>=W||my<0||my>=H||grid[my*W+mx]!==8) continue // MUD=8
        if(my-1<0||grid[(my-1)*W+mx]!==EMPTY) continue
        let tooClose=false
        for(let sy=-3;sy<=3&&!tooClose;sy++) for(let sx=-3;sx<=3&&!tooClose;sx++) {
          if(sx===0&&sy===0) continue
          const px=mx+sx,py=(my-1)+sy
          if(px>=0&&px<W&&py>=0&&py<H) {
            if(grid[py*W+px]===SEED||bgGrid[py*W+px]===TREE||bgGrid[py*W+px]===LEAF) tooClose=true
          }
        }
        if(!tooClose) plantableMud=true
      }
    }
  }

  const hasFarmWork = hasSeed || usefulSand || plantableMud
  console.log(`  hasSeed=${hasSeed} usefulSand=${usefulSand} plantableMud=${plantableMud}`)
  console.log(`  hasFarmWork=${hasFarmWork}`)

  if (treeCount >= 2 && !hasFarmWork) {
    console.log(`  → BUILDER`)
  } else if (hasFarmWork) {
    console.log(`  → FARMER`)
  } else {
    console.log(`  → WANDERER`)
  }
}
