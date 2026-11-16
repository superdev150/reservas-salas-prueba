import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth.jsx';
import BookingForm from '../components/BookingForm.jsx';
import Modal from '../components/Modal.jsx';
import { SLOTS, confirmCancel, defaultEnd } from '../slots.js';

// Avisos cuando el día no se puede reservar (D-44).
const NOTICES = {
  past: 'Este día ya pasó.',
  weekend: 'Solo se puede reservar de lunes a viernes.',
  too_far: 'Solo se puede reservar hasta 30 días por adelantado.',
  no_time_left: 'Ya no quedan horas disponibles hoy.',
};

const slotIndex = (time) => SLOTS.indexOf(time);
// Fila de la rejilla: la 1 es la cabecera; 08:00 es la 2. Un fin a las 20:00 cae en la línea 50.
const rowOf = (time) => (time === '20:00' ? SLOTS.length : slotIndex(time)) + 2;

export default function Agenda() {
  const { user } = useAuth();
  const [date, setDate] = useState(null);
  const [calendar, setCalendar] = useState(null);
  const [rooms, setRooms] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState(null);
  const [newBooking, setNewBooking] = useState(null);
  const [selected, setSelected] = useState(null);
  const [cancelError, setCancelError] = useState(null);

  // Fecha por defecto: la decide la API (D-43).
  useEffect(() => {
    api('/calendar')
      .then((cal) => setDate(cal.defaultDate))
      .catch((err) => setError(err.message));
  }, []);

  // Solo se aplica la respuesta de la última petición (cambiar de fecha rápido no mezcla días).
  const lastRequest = useRef(0);
  const load = useCallback(async () => {
    if (!date) return;
    const requestId = ++lastRequest.current;
    try {
      const [cal, roomList, dayBookings] = await Promise.all([
        api(`/calendar?date=${date}`),
        api('/rooms'),
        api(`/bookings?date=${date}`),
      ]);
      if (requestId !== lastRequest.current) return;
      setCalendar(cal);
      setRooms(roomList);
      setBookings(dayBookings);
      setError(null);
    } catch (err) {
      if (requestId === lastRequest.current) setError(err.message);
    }
  }, [date]);

  useEffect(() => {
    load();
  }, [load]);

  if (!date) return error ? <p className="error">{error}</p> : <p className="muted">Cargando…</p>;

  const dayOk = calendar?.date === date && calendar.dayStatus === 'ok';
  const isEnabled = (time) => dayOk && time >= calendar.bookableFrom;

  // Celdas ocupadas por una reserva (no se dibujan: las tapa el bloque).
  const occupied = new Set();
  for (const b of bookings) {
    for (let i = slotIndex(b.startTime); i < SLOTS.length && SLOTS[i] < b.endTime; i += 1) {
      occupied.add(`${b.roomId}-${SLOTS[i]}`);
    }
  }
  const columnOf = new Map(rooms.map((r, i) => [r.id, i + 2]));
  // El dueño cancela las suyas; el admin, cualquiera (R9, spec §9).
  const canCancel = (b) => b.userId === user.id || user.role === 'admin';

  function openForm(room, time) {
    setNewBooking({ roomId: String(room.id), date, startTime: time, endTime: defaultEnd(time) });
  }

  async function handleCancel(booking) {
    if (!confirmCancel(booking)) return;
    setCancelError(null);
    try {
      await api(`/bookings/${booking.id}`, { method: 'DELETE' });
      setSelected(null);
    } catch (err) {
      setCancelError(err.message);
    }
    load();
  }

  return (
    <section>
      <div className="agenda-toolbar">
        <h1>Agenda</h1>
        <label className="date-picker">
          Fecha
          <input
            type="date"
            data-testid="agenda-date"
            value={date}
            onChange={(e) => e.target.value && setDate(e.target.value)}
          />
        </label>
      </div>

      {error && <p className="error" role="alert">{error}</p>}
      {calendar?.date === date && calendar.dayStatus !== 'ok' && (
        <p className="notice" data-testid="agenda-notice" role="status">
          {NOTICES[calendar.dayStatus]}
        </p>
      )}

      <div
        className="grid"
        data-testid="agenda-grid"
        style={{ gridTemplateColumns: `4rem repeat(${rooms.length}, minmax(8rem, 1fr))` }}
      >
        <div className="grid-corner" style={{ gridRow: 1, gridColumn: 1 }} />
        {rooms.map((room) => (
          <div key={room.id} className="grid-head" style={{ gridRow: 1, gridColumn: columnOf.get(room.id) }}>
            <strong>{room.name}</strong>
            <span>{room.capacity} pers. · {room.location}</span>
          </div>
        ))}

        {SLOTS.map((time, i) => (
          <div
            key={time}
            className={`grid-time${time.endsWith(':00') ? ' grid-time-hour' : ''}`}
            style={{ gridRow: i + 2, gridColumn: 1 }}
          >
            {time.endsWith(':00') || time.endsWith(':30') ? time : ''}
          </div>
        ))}

        {rooms.map((room) =>
          SLOTS.map((time, i) =>
            occupied.has(`${room.id}-${time}`) ? null : (
              <button
                key={`${room.id}-${time}`}
                type="button"
                className={`slot${time.endsWith(':00') ? ' slot-hour' : ''}`}
                data-testid={`slot-${room.id}-${time}`}
                style={{ gridRow: i + 2, gridColumn: columnOf.get(room.id) }}
                disabled={!isEnabled(time)}
                aria-label={`${room.name} ${time}`}
                onClick={() => openForm(room, time)}
              />
            ),
          ),
        )}

        {bookings
          .filter((b) => columnOf.has(b.roomId))
          .map((b) => (
            <button
              key={b.id}
              type="button"
              className={`booking${b.userId === user.id ? ' booking-mine' : ''}`}
              data-testid={`booking-${b.id}`}
              style={{
                gridRow: `${rowOf(b.startTime)} / ${rowOf(b.endTime)}`,
                gridColumn: columnOf.get(b.roomId),
              }}
              title={`${b.title} · ${b.userName} · ${b.startTime}–${b.endTime}`}
              onClick={() => {
                setCancelError(null);
                setSelected(b);
              }}
            >
              <strong>{b.title}</strong>
              <span>{b.userName}</span>
              <span>{b.startTime}–{b.endTime}</span>
            </button>
          ))}
      </div>

      {newBooking && (
        <BookingForm
          rooms={rooms}
          initial={newBooking}
          onClose={() => setNewBooking(null)}
          onConflict={load}
          onCreated={(booking) => {
            setNewBooking(null);
            if (booking.date !== date) setDate(booking.date);
            else load();
          }}
        />
      )}

      {selected && (
        <Modal title="Reserva" onClose={() => setSelected(null)}>
          <dl className="details">
            <dt>Título</dt><dd>{selected.title}</dd>
            <dt>Sala</dt><dd>{selected.roomName}</dd>
            <dt>Horario</dt><dd>{selected.date} · {selected.startTime}–{selected.endTime}</dd>
            <dt>Reservada por</dt><dd>{selected.userName}</dd>
          </dl>
          {cancelError && <p className="error" role="alert">{cancelError}</p>}
          {canCancel(selected) && (
            <button
              type="button"
              className="btn btn-danger"
              data-testid="booking-cancel"
              onClick={() => handleCancel(selected)}
            >
              Cancelar
            </button>
          )}
        </Modal>
      )}
    </section>
  );
}
