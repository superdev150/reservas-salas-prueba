import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import { confirmCancel } from '../slots.js';

export default function MisReservas() {
  const [bookings, setBookings] = useState(null);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    api('/bookings/mine').then(setBookings).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  async function handleCancel(booking) {
    if (!confirmCancel(booking)) return;
    setError(null);
    try {
      await api(`/bookings/${booking.id}`, { method: 'DELETE' });
    } catch (err) {
      setError(err.message);
    }
    load();
  }

  return (
    <section>
      <h1>Mis reservas</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {bookings === null ? (
        <p className="muted">Cargando…</p>
      ) : (
        <ul className="mine-list" data-testid="mine-list">
          {bookings.length === 0 && <li className="muted">No tienes reservas próximas.</li>}
          {bookings.map((b) => (
            <li key={b.id} className="mine-item" data-testid={`mine-item-${b.id}`}>
              <div>
                <strong>{b.title}</strong>
                <span className="muted">
                  {b.roomName} · {b.date} · {b.startTime}–{b.endTime}
                </span>
              </div>
              <button
                type="button"
                className="btn btn-danger"
                data-testid={`mine-cancel-${b.id}`}
                onClick={() => handleCancel(b)}
              >
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
