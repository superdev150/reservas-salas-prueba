import { useEffect, useState } from 'react';

// Página inicial antes del login (spec §9, T1).
export default function App() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json().then((body) => (res.ok && body.status === 'ok' ? 'ok' : 'error')))
      .catch(() => 'error')
      .then(setStatus);
  }, []);

  return (
    <main className="page">
      <h1>Reservas de salas</h1>
      <p data-testid="api-status" className={`status status-${status ?? 'loading'}`}>
        {status === null ? 'API: comprobando…' : `API: ${status}`}
      </p>
    </main>
  );
}
