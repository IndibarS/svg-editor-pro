# SVG Editor Pro

SVG Editor Pro is a high-precision vector graphics editor focused on accurate SVG path manipulation and CAD-like workflows. It provides a structured environment for editing paths, Bézier curves, and geometric primitives with consistent interaction behavior across zoom levels.

---

## Features

### Precision Editing

* Non-scaling control handles (consistent size across zoom levels)
* Direct manipulation of anchors and control points
* Support for cubic (`C`, `S`) and quadratic (`Q`, `T`) Bézier curves
* Visual helpers for control points and curve structure

### Workspace

* Infinite canvas with out-of-bounds support
* Coordinate-locked grid system
* Rulers with real-time cursor tracking

### Interaction

* Mouse and touchpad optimized navigation
* Zoom at cursor position
* Pan via middle-click or modifier keys
* Keyboard shortcuts for zoom control

### Shape Support

* Path editing (SVG path commands)
* Primitive shapes (circle, ellipse)
* Stroke and fill customization

---

## Tech Stack

* **Framework**: Svelte
* **Build Tool**: Vite
* **Styling**: Vanilla CSS
* **Graphics**: Custom SVG path handling and Bézier logic

---

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/IndibarS/svg-editor-pro.git
cd svg-editor-pro
```

### 2. Install dependencies

```bash
npm install
```

### 3. Run development server

```bash
npm run dev
```

### 4. Build for production

```bash
npm run build
```

---

## Controls

| Action      | Input                          |
| ----------- | ------------------------------ |
| Zoom        | Scroll / Pinch                 |
| Pan         | Middle-click drag / Alt + Drag |
| Reset Zoom  | Ctrl/Cmd + 0                   |
| Zoom In/Out | Ctrl/Cmd + +/-                 |

---

## Deployment

This project can be deployed on platforms like:

* Vercel
* Netlify
* GitHub Pages

Build the project and deploy the `dist/` folder.

---

## Roadmap

* Smooth / corner handle modes
* Arc editing improvements
* Constraint-based geometry system
* SVG import/export enhancements

---

## License

MIT License

---

## Author

Indibar
