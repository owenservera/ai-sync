import * as esbuild from 'esbuild'
import { copyFileSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))

const isWatch = process.argv.includes('--watch')

// ---- Auto version bump ----
function bumpVersion() {
  const pkgPath = join(__dirname, 'package.json')
  const manifestPath = join(__dirname, 'manifest.json')
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'))
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  const [major, minor, patch] = (pkg.version || '0.0.0').split('.').map(Number)
  const newVersion = `${major}.${minor}.${patch + 1}`

  pkg.version = newVersion
  manifest.version = newVersion

  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n')
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

  console.log(`[build] version bumped to ${newVersion}`)
  return newVersion
}

/** Generate a simple PNG icon programmatically */
function generateIcons() {
  const iconsDir = join(__dirname, 'icons')
  if (!existsSync(iconsDir)) mkdirSync(iconsDir)

  // SVG icons are simpler for POC — Chrome accepts SVG
  const svgIcon = (size) => `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <rect width="${size}" height="${size}" rx="${size * 0.18}" fill="#1a73e8"/>
  <text x="50%" y="55%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="${size * 0.5}" font-family="sans-serif" font-weight="bold">CA</text>
</svg>`

  for (const size of [16, 48, 128]) {
    writeFileSync(join(iconsDir, `icon${size}.svg`), svgIcon(size))
  }
}

generateIcons()

function copyStaticAssets(version) {
  const distDir = join(__dirname, 'dist')
  if (!existsSync(distDir)) mkdirSync(distDir, { recursive: true })

  // Copy and adjust manifest paths for dist/ layout
  const manifest = JSON.parse(readFileSync(join(__dirname, 'manifest.json'), 'utf-8'))
  manifest.background.service_worker = 'background/service_worker.js'
  manifest.side_panel.default_path = 'sidepanel/sidepanel.html'
  manifest.action.default_popup = 'sidepanel/sidepanel.html'
  manifest.version = version
  writeFileSync(join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2))

  const iconsDir = join(distDir, 'icons')
  if (!existsSync(iconsDir)) mkdirSync(iconsDir)
  const srcIconsDir = join(__dirname, 'icons')
  if (existsSync(srcIconsDir)) {
    for (const file of ['icon16.svg', 'icon48.svg', 'icon128.svg']) {
      if (existsSync(join(srcIconsDir, file))) {
        copyFileSync(join(srcIconsDir, file), join(iconsDir, file))
      }
    }
  }

  const sidepanelDir = join(distDir, 'sidepanel')
  if (!existsSync(sidepanelDir)) mkdirSync(sidepanelDir, { recursive: true })
  const srcHtml = join(__dirname, 'sidepanel', 'sidepanel.html')
  if (existsSync(srcHtml)) {
    copyFileSync(srcHtml, join(sidepanelDir, 'sidepanel.html'))
  }
}

function buildSidepanelCSS() {
  const cssInput = join(__dirname, 'sidepanel', 'sidepanel.css')
  const cssOutput = join(__dirname, 'dist', 'sidepanel', 'sidepanel.css')
  const outDir = join(__dirname, 'dist', 'sidepanel')
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true })
  if (existsSync(cssInput)) {
    try {
      execSync(`npx @tailwindcss/cli -i ${cssInput} -o ${cssOutput}`, { stdio: 'inherit', cwd: __dirname })
    } catch {
      console.log('[build] Tailwind CLI not available, copying raw CSS')
      copyFileSync(cssInput, cssOutput)
    }
  }
}

const buildOptions = {
  entryPoints: [
    join(__dirname, 'background', 'service_worker.ts'),
    join(__dirname, 'sidepanel', 'main.tsx'),
  ],
  bundle: true,
  outdir: join(__dirname, 'dist'),
  format: 'esm',
  platform: 'browser',
  target: 'es2022',
  sourcemap: true,
  minify: false,
  tsconfig: join(__dirname, 'tsconfig.json'),
  loader: { '.tsx': 'tsx', '.ts': 'ts' },
  jsx: 'automatic',
  external: ['tailwindcss'],
}

async function main() {
  const version = bumpVersion()
  copyStaticAssets(version)
  if (isWatch) {
    buildSidepanelCSS()
    const ctx = await esbuild.context(buildOptions)
    await ctx.watch()
    console.log('[build] watching...')
  } else {
    buildSidepanelCSS()
    const result = await esbuild.build(buildOptions)
    if (result.errors.length > 0) {
      console.error('[build] errors:', result.errors)
      process.exit(1)
    }
    console.log('[build] complete')
  }
}

main().catch(e => {
  console.error(e)
  process.exit(1)
})
