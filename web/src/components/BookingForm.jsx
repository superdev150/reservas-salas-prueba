import { useState } from 'react';
import { api } from '../api.js';
import { END_TIMES, SLOTS } from '../slots.js';
import Modal from './Modal.jsx';

export const CONFLICT_MESSAGE = 'Esa sala ya está reservada en ese horario. Elige otro.';

// Formulario de reserva en un modal (spec §9, D-46). La API decide todo: 409 → mensaje del §9
// y refresco de la agenda; 422 y demás → error.message del servidor.
export default function BookingForm({ rooms, initial, onClose, onCreated, onConflict }) {
  const [form, setForm] = useState({ title: '', ...initial });
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError(null);
    try {
      const booking = await api('/bookings', {
        method: 'POST',
        body: {
          roomId: Number(form.roomId),
          date: form.date,
          startTime: form.startTime,
          endTime: form.endTime,
          title: form.title,
        },
      });
      onCreated(booking);
    } catch (err) {
      if (err.status === 409) {
        setError(CONFLICT_MESSAGE);
        onConflict();
      } else {
        setError(err.message);
      }
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal title="Nueva reserva" onClose={onClose}>
      <form className="form" data-testid="booking-form" onSubmit={handleSubmit}>
        <label>
          Sala
          <select data-testid="booking-room" value={form.roomId} onChange={set('roomId')}>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>{r.name} ({r.capacity} personas)</option>
            ))}
          </select>
        </label>
        <label>
          Fecha
          <input type="date" value={form.date} onChange={set('date')} required />
        </label>
        <div className="form-row">
          <label>
            Inicio
            <select data-testid="booking-start" value={form.startTime} onChange={set('startTime')}>
              {SLOTS.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label>
            Fin
            <select data-testid="booking-end" value={form.endTime} onChange={set('endTime')}>
              {END_TIMES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
        </div>
        <label>
          Título
          <input
            data-testid="booking-title"
            value={form.title}
            onChange={set('title')}
            maxLength={120}
            placeholder="Ej.: Reunión de equipo"
          />
        </label>
        {error && <p className="error" data-testid="booking-error" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" data-testid="booking-submit" disabled={sending}>
          {sending ? 'Reservando…' : 'Reservar'}
        </button>
      </form>
    </Modal>
  );
}
