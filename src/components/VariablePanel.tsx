import { useStore } from '../store/useStore';

export function VariablePanel() {
  const variables = useStore((s) => s.variables);
  const setVariable = useStore((s) => s.setVariable);
  const toggleAnimating = useStore((s) => s.toggleAnimating);

  const entries = Object.values(variables);
  if (entries.length === 0) return null;

  return (
    <div className="variable-panel">
      <div className="panel-heading">Variables</div>
      {entries.map((v) => (
        <div className="variable-row" key={v.name}>
          <div className="variable-top">
            <button
              className={`play-btn ${v.animating ? 'active' : ''}`}
              onClick={() => toggleAnimating(v.name)}
              title={v.animating ? 'Pause' : 'Animate'}
            >
              {v.animating ? '❚❚' : '▶'}
            </button>
            <span className="variable-name">{v.name}</span>
            <input
              className="variable-value"
              type="number"
              value={round(v.value)}
              step={v.step}
              onChange={(e) => setVariable(v.name, { value: Number(e.target.value) })}
            />
          </div>
          <div className="variable-slider-row">
            <input
              type="number"
              className="bound-input"
              value={v.min}
              onChange={(e) => setVariable(v.name, { min: Number(e.target.value) })}
            />
            <input
              type="range"
              min={v.min}
              max={v.max}
              step={v.step}
              value={v.value}
              onChange={(e) => setVariable(v.name, { value: Number(e.target.value) })}
            />
            <input
              type="number"
              className="bound-input"
              value={v.max}
              onChange={(e) => setVariable(v.name, { max: Number(e.target.value) })}
            />
          </div>
          <div className="variable-fine">
            <label>Step <input type="number" value={v.step} step={0.01} min={0.001}
              onChange={(e) => setVariable(v.name, { step: Number(e.target.value) })} /></label>
            <label>Speed <input type="number" value={v.animSpeed} step={0.1} min={0.1}
              onChange={(e) => setVariable(v.name, { animSpeed: Number(e.target.value) })} /></label>
            <select value={v.animMode} onChange={(e) => setVariable(v.name, { animMode: e.target.value as 'loop' | 'pingpong' })}>
              <option value="pingpong">Ping-pong</option>
              <option value="loop">Loop</option>
            </select>
          </div>
        </div>
      ))}
    </div>
  );
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
