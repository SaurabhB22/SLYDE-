import { useEffect, useRef, useState } from 'react';
import { slydeMarkup } from './slydeMarkup';
import { connectSlydeBackend } from './api';

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-slyde-src="${src}"]`);
    if (existing) { if (existing.dataset.loaded === 'true') return resolve(); existing.addEventListener('load', resolve, { once: true }); existing.addEventListener('error', reject, { once: true }); return; }
    const script = document.createElement('script');
    script.src = src; script.async = true; script.dataset.slydeSrc = src;
    script.onload = () => { script.dataset.loaded = 'true'; resolve(); };
    script.onerror = () => reject(new Error(`Could not load ${src}`));
    document.head.appendChild(script);
  });
}

export default function App() {
  const root = useRef(null);
  const [engineError, setEngineError] = useState('');
  useEffect(() => {
    let disposed = false;
    (async () => {
      try {
        await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js');
        await loadScript('https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js');
        if (disposed) return;
        const engine = document.createElement('script');
        engine.src = '/slyde-engine.js'; engine.dataset.slydeEngine = 'true';
        engine.onload = async () => {
          if (disposed) return;
          try {
            await connectSlydeBackend();
            await loadScript('/slyde-location-alarm.js');
          }
          catch (error) { console.error('SLYDE backend integration:', error); }
        };
        engine.onerror = () => setEngineError('The 3D map engine could not load. Check that the frontend is running and reload.');
        document.body.appendChild(engine);
      } catch (error) {
        console.error(error);
        if (!disposed) setEngineError('The 3D dependencies could not load. Check your internet connection and reload.');
      }
    })();
    return () => { disposed = true; };
  }, []);
  return <>
    <div ref={root} dangerouslySetInnerHTML={{ __html: slydeMarkup }} />
    {engineError && <div role="alert" style={{position:'fixed',zIndex:20,left:12,right:12,top:12,padding:12,background:'#A81F18',color:'#fff',borderRadius:8}}>{engineError}</div>}
  </>;
}
