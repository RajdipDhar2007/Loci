import { useEffect, useState } from 'react';
import { useStore } from '../store/useStore';
import { ThemeToggle } from './ThemeToggle';

const PRESETS: Record<string, { azimuth: number; elevation: number }> = {
  Front: { azimuth: 0, elevation: 0 },
  Back: { azimuth: Math.PI, elevation: 0 },
  Top: { azimuth: 0, elevation: Math.PI / 2 - 0.001 },
  Bottom: { azimuth: 0, elevation: -Math.PI / 2 + 0.001 },
  Left: { azimuth: -Math.PI / 2, elevation: 0 },
  Right: { azimuth: Math.PI / 2, elevation: 0 },
  Iso: { azimuth: 0.8, elevation: 0.55 },
};

const MIN_LIMIT = 2;
const MAX_LIMIT = 100000;
const logSpan = Math.log(MAX_LIMIT / MIN_LIMIT);
const sliderToLimit = (t: number) => Math.round(MIN_LIMIT * Math.exp(logSpan * t));
const limitToSlider = (v: number) => Math.log(Math.max(v, MIN_LIMIT) / MIN_LIMIT) / logSpan;

function formatLimit(v: number): string {
  if (v >= 100000) return '∞';
  if (v >= 1000) return `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k`;
  return String(v);
}

export function Toolbar({ onMenuClick }: { onMenuClick: () => void }) {
  const view = useStore((s) => s.view);
  const setView = useStore((s) => s.setView);
  const setCamera = useStore((s) => s.setCamera);
  const [limitInput, setLimitInput] = useState(String(view.axisLimit));

  useEffect(() => { setLimitInput(String(view.axisLimit)); }, [view.axisLimit]);

  const commitLimitInput = () => {
    const n = Number(limitInput);
    if (Number.isFinite(n) && n > 0) {
      setView({ axisLimit: n });
    } else {
      setLimitInput(String(view.axisLimit));
    }
  };

  return (
    <header className="toolbar">
      <button className="icon-btn menu-btn" onClick={onMenuClick} aria-label="Toggle panel">☰</button>

      <div className="toolbar-group">
        <button className={`chip ${view.showGrid ? 'active' : ''}`} onClick={() => setView({ showGrid: !view.showGrid })}>Grid</button>
        <button className={`chip ${view.showAxes ? 'active' : ''}`} onClick={() => setView({ showAxes: !view.showAxes })}>Axes</button>
        <button className={`chip ${view.showLabels ? 'active' : ''}`} onClick={() => setView({ showLabels: !view.showLabels })}>Labels</button>
      </div>

      <div className="toolbar-group preset-group">
        {Object.entries(PRESETS).map(([name, { azimuth, elevation }]) => (
          <button key={name} className="chip" onClick={() => setCamera({ azimuth, elevation, distance: 14 })}>
            {name}
          </button>
        ))}
      </div>

      <div className="axis-limit-control" title="Master range — grows or shrinks every axis (x, y, z) together, from ±2 up to effectively unbounded">
        <span className="axis-limit-label">Range</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.001}
          value={limitToSlider(view.axisLimit)}
          onChange={(e) => {
            const v = sliderToLimit(Number(e.target.value));
            setView({ axisLimit: v });
            setLimitInput(String(v));
          }}
        />
        <input
          className="axis-limit-input"
          type="text"
          inputMode="numeric"
          value={limitInput}
          onFocus={() => setLimitInput(String(view.axisLimit))}
          onChange={(e) => setLimitInput(e.target.value)}
          onBlur={commitLimitInput}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        />
        <span className="axis-limit-value">±{formatLimit(view.axisLimit)}</span>
      </div>

      <div className="toolbar-spacer" />
      <ThemeToggle />
    </header>
  );
}
