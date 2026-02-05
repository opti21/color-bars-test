# SMPTE Color Bars Test Pattern Generator

A broadcast-quality SMPTE color bars test pattern generator built with SvelteKit.

**Live Demo:** https://color-bars-test.vercel.app

## Features

### Test Pattern
- Official SMPTE RP 219-2002 color bars (75% intensity)
- Castellations row with reverse color order
- PLUGE (Picture Line-Up Generation Equipment) row with superblack, black, and light black references
- -I and +Q color reference signals

### Display Options
- **Resolutions:** Fit Display, 480p, 720p, 1080p, 2K, 1440p, 4K UHD, 4K DCI, 8K UHD
- **Native vs Scaled:** Shows both output and native resolution when display scaling is detected (useful for broadcast ops)
- **1:1 Pixel Mode:** Toggle between fit-to-screen and actual pixel size

### Overlays
- **Frame:** Border, diagonal cross lines, and center circle
- **Grid:** SMPTE ST 2046-1 safe areas (93% Action Safe, 90% Title Safe) with center crosshairs
- **Ball:** Bouncing ball animation for motion testing
- **Shimmer:** Diagonal gradient sweep effect

### Time Display
- Synced timecode in HH:MM:SS:FF format (30fps)
- UTC, Local, and configurable timezone display
- Any combination of time displays or none

### Customization
- Custom text overlay
- Custom image upload
- Configurable info positioning (left/center/right, top/center/bottom)
- All settings persist to localStorage

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm run dev

# Build for production
pnpm run build

# Type check
pnpm run check
```

## Tech Stack

- SvelteKit 5
- TypeScript
- SVG rendering
- Deployed on Vercel

## License

MIT
