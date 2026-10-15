import { useRef } from 'react';
import { useStore } from '../store/useStore';
import { ExpressionRow } from './ExpressionRow';
import { VariablePanel } from './VariablePanel';

export function Sidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const expressions = useStore((s) => s.expressions);
  const addExpression = useStore((s) => s.addExpression);
  const newWorkspace = useStore((s) => s.newWorkspace);
  const exportWorkspace = useStore((s) => s.exportWorkspace);
  const importWorkspace = useStore((s) => s.importWorkspace);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const json = exportWorkspace();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'graph-workspace.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => importWorkspace(String(reader.result));
    reader.readAsText(file);
  };

  return (
    <aside className={`sidebar ${open ? 'open' : ''}`}>
      <div className="sidebar-header">
        <span className="brand-mark">∿</span>
        <span className="brand-name">Loci</span>
        <button className="icon-btn sidebar-close" onClick={onClose} aria-label="Close panel">×</button>
      </div>

      <div className="expr-list">
        {expressions.map((e, i) => (
          <ExpressionRow key={e.id} entry={e} index={i} />
        ))}
        <button className="add-expr-btn" onClick={() => addExpression('')}>
          + Add expression
        </button>
      </div>

      <VariablePanel />

      <div className="workspace-actions">
        <button className="text-btn" onClick={newWorkspace}>New</button>
        <button className="text-btn" onClick={handleExport}>Export</button>
        <button className="text-btn" onClick={() => fileRef.current?.click()}>Import</button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json"
          hidden
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImportFile(f); e.target.value = ''; }}
        />
      </div>
    </aside>
  );
}
