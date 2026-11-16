import { useEffect, useState } from 'react';

// Estado de la API en el pie de página de todas las pantallas (spec §9, D-47).
export default function Footer() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json().then((body) => (res.ok && body.status === 'ok' ? 'ok' : 'error')))
      .catch(() => 'error')
      .then(setStatus);
  }, []);

  return (
    <footer className="footer">
      <span data-testid="api-status" className={`status status-${status ?? 'loading'}`}>
        {status === null ? 'API: comprobando…' : `API: ${status}`}
      </span>
    </footer>
  );
}
