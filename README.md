# LinkLens

LinkLens is a desktop linker script visualizer for exploring memory regions, output sections, alignment padding, and memory usage. Edit a GNU ld script and inspect the parsed layout in a connected box diagram.

## Features

- Edit and open `.ld`, `.lds`, and `.txt` linker script files.
- View parsed `MEMORY` regions and mapped output sections.
- Switch between stacked and side-by-side section layouts.
- Inspect section addresses, estimated sizes, alignment padding, and free space.
- Jump from a section in the memory map to its full linker-script block.
- Review diagnostics for unmapped regions, alignment padding, and memory overflow.
- Switch between dark and light themes.

> Section sizes are estimates in the current preview. ELF file analysis is not connected yet, so the diagram does not report measured binary sizes.

## Screenshots

Application screenshots will be added here in `docs/screenshots/`.

## Requirements

For the browser-based development preview:

- Node.js 18 or newer
- npm (included with Node.js)

For the native desktop app, install Rust stable and the system dependencies required by Tauri for your operating system. See the [Tauri v2 prerequisites](https://v2.tauri.app/start/prerequisites/) for Linux, macOS, and Windows setup.

## Install and run

Clone the repository, then install the JavaScript dependencies:

```sh
git clone <repository-url>
cd LinkLens
npm ci
```

Start the browser preview:

```sh
npm run dev
```

Open the local URL printed by Vite in your browser. To run the native Tauri desktop app during development instead:

```sh
npx tauri dev
```

Build the frontend bundle with:

```sh
npm run build
```

Build a native app bundle with:

```sh
npx tauri build
```

## Example linker scripts

The [`examples/`](examples/) folder contains scripts for a basic FLASH/RAM layout, alignment padding, a memory overflow, and a generic RISC-V bare-metal layout. Open one from the app's **Open** button and edit its values to see how the diagram and diagnostics respond. See [`examples/README.md`](examples/README.md) for details.

## Dependencies

The frontend dependencies are managed through `package-lock.json`:

- React and React DOM
- Vite and the React Vite plugin
- TypeScript
- Tauri 2 JavaScript API and CLI

The native desktop shell is implemented in Rust under [`src-tauri/`](src-tauri/).
