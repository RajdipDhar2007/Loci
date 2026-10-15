import { useEffect, useRef, useState } from 'react';
import { useStore, loadPersistedWorkspace } from './store/useStore';
import { Sidebar } from './components/Sidebar';
import { Toolbar } from './components/Toolbar';
import { Scene3D } from './render/Scene3D';

export default function App() {
  const theme = useStore((s) => s.theme);
  const tickAnimations = useStore((s) => s.tickAnimations);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const lastRef = useRef<number>(performance.now());

  useEffect(() => {
    loadPersistedWorkspace();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    let raf = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - lastRef.current) / 1000);
      lastRef.current = now;
      tickAnimations(dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tickAnimations]);

  useEffect(() => {
    const onResize = () => setSidebarOpen(window.innerWidth > 860);
    onResize();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.tagName === 'TEXTAREA') return;
      if (e.key === 'n' || e.key === 'N') useStore.getState().addExpression('');
      if (e.key === 'g' || e.key === 'G') {
        const s = useStore.getState();
        s.setView({ showGrid: !s.view.showGrid });
      }
      if (e.key === 'r' || e.key === 'R') {
        useStore.getState().setCamera({ azimuth: 0.8, elevation: 0.55, distance: 14, target: [0, 0, 0] });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="app-shell">
      <Toolbar onMenuClick={() => setSidebarOpen((v) => !v)} />
      <div className="app-body">
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="graph-area">
          <Scene3D />
        </main>
      </div>
      {sidebarOpen && window.innerWidth <= 860 && <div className="sidebar-scrim" onClick={() => setSidebarOpen(false)} />}
      <div className="credit-tag">A <b>RAJDIP DHAR</b> PROJECT</div>
    </div>
  );
}
