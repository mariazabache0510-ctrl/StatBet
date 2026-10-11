import { html, render } from './lib/html.js';

const routes = {
  '/': () => import('./views/student.js').then((m) => m.StudentApp),
  '/moderador': () => import('./views/moderator.js').then((m) => m.ModeratorApp),
  '/proyector': () => import('./views/projector.js').then((m) => m.ProjectorApp),
  '/informe': () => import('./views/report.js').then((m) => m.ReportApp),
};

async function boot() {
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const load = routes[path] ?? routes['/'];
  const root = document.getElementById('app');
  try {
    const App = await load();
    root.textContent = '';
    render(html`<${App} />`, root);
  } catch (err) {
    console.error(err);
    root.innerHTML = '<div class="boot"><p>No se pudo cargar StatBet. Recarga la página.</p></div>';
  }
}

boot();
