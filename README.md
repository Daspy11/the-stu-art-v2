[![Deploy Quartz site to GitHub Pages](https://github.com/Daspy11/the-stu-art-v2/actions/workflows/deploy.yaml/badge.svg)](https://github.com/Daspy11/the-stu-art-v2/actions/workflows/deploy.yaml) [![Build and Test](https://github.com/Daspy11/the-stu-art-v2/actions/workflows/ci.yaml/badge.svg)](https://github.com/Daspy11/the-stu-art-v2/actions/workflows/ci.yaml)

I'm Stuart Johnson. This is my digital garden.

It's...

- Edited with [Obsidian](https://obsidian.md/)
- Built with [Quartz v4](https://quartz.jzhao.xyz/)
- Hosted with Github Pages
- Live at https://thestu.art

Everything is available under an MIT license. Feel free to take this and do whatever you want with it.

---

## Development

**[Documentation](https://quartz.jzhao.xyz/)**

1. Clone the repo, then run `npm i`
2. To run locally, run `npx quartz build --serve`

## Modifications made

Ways I've changed Quartz's default behavior:

- Modified path resolution behavior in `util/path.ts` to convert all URLs to lowercase
- Fixed a bug in `util/path.ts joinSegments` that allowed double slashes to resolve in URLs
- Modified `Breadcrumbs.tsx` to capitalize the first letter of each word in each crumb
- Added CSS rules for Youtube videos in `popover.scss`
- Fixed a bug with CSS rules for images in `popover.scss` that caused images with text as part of the same paragraph to display inline.