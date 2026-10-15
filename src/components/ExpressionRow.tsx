import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { ExpressionEntry } from '../types';

const SWATCHES = ['#5EEAD4', '#F5A623', '#818CF8', '#FB7185', '#4ADE80', '#38BDF8', '#F472B6', '#FBBF24', '#A78BFA', '#2DD4BF'];

const KIND_LABEL: Record<string, string> = {
  parameter: 'variable',
  explicit2d: '2D function',
  implicit2d: '2D implicit',
  inequality2d: '2D region',
  explicit3d: '3D surface',
  implicit3d: '3D implicit',
  inequality3d: '3D volume',
  parametric2d: '2D parametric',
  parametric3d: '3D parametric',
  empty: '',
  error: 'error',
};

export function ExpressionRow({ entry, index }: { entry: ExpressionEntry; index: number }) {
  const updateExpression = useStore((s) => s.updateExpression);
  const removeExpression = useStore((s) => s.removeExpression);
  const duplicateExpression = useStore((s) => s.duplicateExpression);
  const toggleVisible = useStore((s) => s.toggleVisible);
  const toggleCollapsed = useStore((s) => s.toggleCollapsed);
  const setStyle = useStore((s) => s.setStyle);
  const select = useStore((s) => s.select);
  const selectedId = useStore((s) => s.selectedId);

  const [local, setLocal] = useState(entry.raw);
  const [showColors, setShowColors] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<number | null>(null);

  useEffect(() => setLocal(entry.raw), [entry.raw]);

  useEffect(() => () => { if (debounceRef.current !== null) window.clearTimeout(debounceRef.current); }, []);

  const handleChange = (val: string) => {
    setLocal(val);
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => updateExpression(entry.id, val), 180);
  };

  const kind = entry.parsed?.kind ?? 'empty';
  const hasError = kind === 'error';
  const isEmpty = kind === 'empty' && local.trim() !== '';
  const selected = selectedId === entry.id;
  const canExtrude = kind === 'explicit2d' || kind === 'implicit2d' || kind === 'inequality2d';
  const extruded = canExtrude && !!entry.style.extrude;

  return (
    <div className={`expr-row ${selected ? 'selected' : ''} ${!entry.visible ? 'hidden-row' : ''}`} onClick={() => select(entry.id)}>
      <div className="expr-row-main">
        <span className="expr-index">{index + 1}</span>
        <button
          className="swatch-btn"
          style={{ background: entry.style.color }}
          onClick={(e) => { e.stopPropagation(); setShowColors((v) => !v); }}
          aria-label="Change color"
          title="Change color"
        />
        <input
          ref={inputRef}
          className="expr-input"
          value={local}
          spellCheck={false}
          placeholder="e.g. z = sin(x)·cos(y)"
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
            if (local !== entry.raw) updateExpression(entry.id, local);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
              updateExpression(entry.id, local);
              inputRef.current?.blur();
            }
            if (e.key === 'Escape') { setLocal(entry.raw); inputRef.current?.blur(); }
          }}
        />
        <button
          className="icon-btn"
          onClick={(e) => { e.stopPropagation(); toggleVisible(entry.id); }}
          title={entry.visible ? 'Hide' : 'Show'}
        >
          {entry.visible ? '◉' : '○'}
        </button>
        <button className="icon-btn" onClick={(e) => { e.stopPropagation(); toggleCollapsed(entry.id); }} title="Options">
          ⋯
        </button>
        <button className="icon-btn danger" onClick={(e) => { e.stopPropagation(); removeExpression(entry.id); }} title="Delete">
          ×
        </button>
      </div>

      {showColors && (
        <div className="swatch-row" onClick={(e) => e.stopPropagation()}>
          {SWATCHES.map((c) => (
            <button
              key={c}
              className="swatch"
              style={{ background: c }}
              onClick={() => { setStyle(entry.id, { color: c }); setShowColors(false); }}
            />
          ))}
        </div>
      )}

      <div className="expr-meta">
        {hasError && <span className="tag tag-error">{entry.parsed?.error ?? 'parse error'}</span>}
        {isEmpty && <span className="tag tag-muted">no graph variable</span>}
        {!hasError && !isEmpty && kind !== 'empty' && (
          <span className="tag">{KIND_LABEL[kind]}{extruded ? ' · extruded' : ''}</span>
        )}
        {canExtrude && !hasError && (
          <button
            className={`extrude-chip ${extruded ? 'active' : ''}`}
            onClick={(e) => { e.stopPropagation(); setStyle(entry.id, { extrude: !extruded }); }}
            title="Sweep this 2D curve/region along its missing axis into a full 3D surface or solid"
          >
            ⛶ Extend to 3D
          </button>
        )}
      </div>

      {entry.collapsed && (
        <div className="expr-options" onClick={(e) => e.stopPropagation()}>
          <label>
            Opacity
            <input type="range" min={0.05} max={1} step={0.05} value={entry.style.opacity}
              onChange={(e) => setStyle(entry.id, { opacity: Number(e.target.value) })} />
          </label>
          <label>
            Line style
            <select value={entry.style.style} onChange={(e) => setStyle(entry.id, { style: e.target.value as 'solid' | 'dashed' | 'dotted' })}>
              <option value="solid">Solid</option>
              <option value="dashed">Dashed</option>
              <option value="dotted">Dotted</option>
            </select>
          </label>
          <label>
            Quality
            <select value={entry.style.quality} onChange={(e) => setStyle(entry.id, { quality: e.target.value as 'low' | 'medium' | 'high' })}>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </label>
          <button className="text-btn" onClick={() => duplicateExpression(entry.id)}>Duplicate</button>
        </div>
      )}
    </div>
  );
}
