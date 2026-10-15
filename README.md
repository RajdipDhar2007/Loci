<div align="center">

<img src="docs/media/header.svg" alt="Loci — A RAJDIP DHAR Project" width="100%"/>

<a href="https://github.com/RajdipDhar2007/Loci">
  <img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=600&size=22&pause=1000&color=5EEAD4&center=true&vCenter=true&width=720&lines=z+%3D+sin(x)*cos(y);x%5E2+%2B+y%5E2+%2B+z%5E2+%3C%3D+16;(cos(t)%2C+sin(t)%2C+t);y+%3D+a*x%5E2+%E2%86%92+auto+slider!;2D+%2B+3D.+One+scene.+Zero+mode+switching." alt="Typing animation of Loci expressions"/>
</a>

<br/>

![theme](https://img.shields.io/badge/theme-dark%20%2F%20light-5EEAD4?style=for-the-badge)
![stack](https://img.shields.io/badge/React%20%2B%20TypeScript%20%2B%20Three.js-38BDF8?style=for-the-badge&logo=react&logoColor=white)
![tests](https://img.shields.io/badge/tests-34%20passing-4ADE80?style=for-the-badge)
![license](https://img.shields.io/badge/license-MIT-F5A623?style=for-the-badge)

<br/>

<img src="docs/media/rotate.gif" alt="Loci — a sphere inside a sine surface, rotating live" width="90%"/>

<sub>↑ Real capture of the running app — drag, flick, and it keeps spinning.</sub>

</div>

<br/>

## ✨ What is Loci?

A browser-based graphing calculator that renders **everything** — 2D functions, implicit curves, inequalities, parametric curves, and full 3D surfaces — in **one live, interactive 3D scene**.

There is no 2D/3D mode switch. A 2D equation is simply auto-embedded on whichever principal plane (**XY / XZ / YZ**) it belongs to, right next to your 3D graphs. Type, and it draws. No Enter key. No setup.

<br/>

<img src="docs/media/divider.svg" width="100%" alt=""/>

## 📸 See it in action

<div align="center">

### 🌙 Dark — surfaces, implicit shapes & parametric curves together
<img src="docs/media/dark-surfaces.png" alt="Loci dark theme screenshot" width="92%"/>

### ☀️ Light — same scene, same speed
<img src="docs/media/light-surfaces.png" alt="Loci light theme screenshot" width="92%"/>

### 🧊 True 3D inequality volumes — not just a boundary shell
<img src="docs/media/inequality-volume.png" alt="Loci 3D inequality voxel volume" width="92%"/>

### 🎚️ Any unknown symbol becomes a slider — instantly
<img src="docs/media/sliders.png" alt="Loci auto-generated variable sliders" width="92%"/>

</div>

<br/>

## 🚀 Run it

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + production build -> dist/
npm run preview   # serve the production build
npm test          # vitest unit tests (parser + geometry)
npm run lint      # oxlint
```

<br/>

## 🧠 What it understands

Type any of these directly — the graph updates live as you type (debounced ~180ms), no Enter required:

| Expression | What you get |
|---|---|
| `y = x^2`, `x = y^2` | Explicit 2D function, embedded on the XY plane |
| `z = sin(x)`, `y = sin(z)`, `x = z^2` | Explicit 2D function on the XZ or YZ plane |
| `x^2 + y^2 = 25` | Implicit 2D curve |
| `x^2 + z^2 = 25`, `y^2 + z^2 = 25` | Implicit 2D curve, auto-embedded on XZ / YZ |
| `x < y^2`, `x^2 + y^2 <= 25` | Shaded 2D inequality region |
| `z = sin(x)*cos(y)` | Explicit 3D surface |
| `x^2 + y^2 + z^2 = 25` | Implicit 3D surface (marching tetrahedra) |
| `x > y + z`, `x^2+y^2+z^2 <= 25` | True 3D inequality **volume fill** — `<`, `<=`, `>`, `>=`, and `=` all look visibly different |
| `(cos(t), sin(t))` / `(cos(t), sin(t), t)` | 2D / 3D parametric curve |
| `a = 5` | Defines a variable and auto-creates a slider |
| `y = a*x^2` | Any symbol other than x/y/z becomes a slider automatically |

Any 2D curve or region can also be **extended into 3D** with one click — its missing axis is swept out so `x + y = 9` becomes a full plane instead of a line.

All standard functions (`sin cos tan cot sec csc` + inverses/hyperbolics, `log ln log10 sqrt cbrt abs floor ceil round exp sign min max`), `pi`, `e`, implicit multiplication, and nested parentheses are supported. Invalid expressions never crash the app — they show an inline error tag.

<br/>

## 🎮 Interacting with the scene

| | |
|---|---|
| 🌀 **Rotate** | Click/touch and drag. Flick it and it keeps spinning until you grab it again. |
| 🔍 **Zoom / Pan** | Scroll or pinch · right-click drag (or two-finger drag) |
| 🎥 **Camera presets** | Front / Back / Top / Bottom / Left / Right / Iso |
| 📏 **Range slider** | One master control scales all three axes, from ±2 to effectively unbounded |
| 🧭 **Grid / Axes / Labels** | Independent toggles; thick, arrow-tipped, constant-thickness axes with glowing labels that hide behind surfaces |
| 🎨 **Per-expression styling** | Color, opacity, solid/dashed/dotted, render quality, extrude-to-3D |

**Shortcuts:** `N` add expression · `G` toggle grid · `R` reset camera

<br/>

## 🏗️ Architecture

```
src/math/       expression parsing, graph-type detection, marching squares
                (2D contours) and marching tetrahedra (3D isosurfaces)
src/store/      zustand store — expressions, variables, camera, theme,
                view/range settings, localStorage persistence, JSON import/export
src/render/     Scene3D — the single Three.js scene rendering every graph type
src/components/ toolbar, sidebar, expression rows, variable sliders, theme toggle
```

<details>
<summary><b>🔬 Under the hood (click to expand)</b></summary>

<br/>

- Parsing/eval uses `mathjs` compiled expressions — never `eval`.
- 3D implicit surfaces use marching tetrahedra (6 tets per cube); 3D inequalities render as an instanced-voxel volume fill (plus an optional boundary shell) so the satisfied region is genuinely visible.
- Surfaces use a physically-based material (opaque by default, clearcoat, ACES tone mapping) so intersections are readable.
- Geometry rebuilds are **throttled**, not debounced, so slider animation and live typing both stay smooth. Quality auto-degrades while a variable animates, then restores.
- Sliders animate via `requestAnimationFrame`, ping-pong or loop, with per-variable range/step/speed.
- Workspace auto-saves to `localStorage` and can be exported/imported as JSON.

</details>

<details>
<summary><b>⚠️ Known limitations</b></summary>

<br/>

- Parametric *surfaces* (two parameters, e.g. `u, v`) aren't supported — only single-parameter parametric curves.
- Extremely large range values trade some sampling density for performance, since mesh resolution is capped.

</details>

<br/>

## 🤝 Contributing

Issues, ideas, and pull requests are welcome.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes (`git commit -m 'Add some feature'`)
4. Push and open a pull request

Please run `npm run lint` and `npm run build` before submitting.

## 📜 License

Distributed under the MIT License — see [`LICENSE`](./LICENSE).

<br/>

<div align="center">

## 💚 If Loci made your math prettier, a ⭐ on the repo would make my day.

<br/>

<a href="https://github.com/RajdipDhar2007/Loci"><img src="https://img.shields.io/badge/⭐_Star_Loci-5EEAD4?style=for-the-badge&labelColor=0B1020" alt="Star Loci"/></a>
<a href="https://github.com/RajdipDhar2007"><img src="https://img.shields.io/badge/👤_More_from_RAJDIP_DHAR-818CF8?style=for-the-badge&labelColor=0B1020" alt="More from RAJDIP DHAR"/></a>

</div>

<img src="docs/media/footer.svg" alt="Made with love by RAJDIP DHAR" width="100%"/>

<div align="center">

<img src="https://readme-typing-svg.demolab.com?font=JetBrains+Mono&weight=500&size=16&pause=1500&color=5EEAD4&center=true&vCenter=true&width=600&lines=Made+with+%E2%9D%A4%EF%B8%8F+%26+%E2%88%AB+by+RAJDIP+DHAR;Every+equation+has+a+shape.+Go+find+it.;%E2%88%BF+Loci+%E2%80%94+the+place+where+math+takes+shape." alt="Made with love and calculus by RAJDIP DHAR"/>

</div>
