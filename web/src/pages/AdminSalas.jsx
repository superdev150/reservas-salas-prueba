import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const EMPTY = { name: '', capacity: '', location: '' };

// /admin/salas (spec §9). Un solo formulario para crear y editar (D-51).
// La API valida todo (D-48); aquí solo se muestra error.message.
export default function AdminSalas() {
  const [rooms, setRooms] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [editingId, setEditingId] = useState(null);
  const [error, setError] = useState(null);
  const [message, setMessage] = useState(null);
  const [sending, setSending] = useState(false);

  const load = useCallback(() => {
    api('/rooms?includeInactive=true').then(setRooms).catch((err) => setError(err.message));
  }, []);

  useEffect(load, [load]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  function resetForm() {
    setForm(EMPTY);
    setEditingId(null);
  }

  function startEdit(room) {
    setError(null);
    setMessage(null);
    setEditingId(room.id);
    setForm({ name: room.name, capacity: String(room.capacity), location: room.location || '' });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSending(true);
    setError(null);
    setMessage(null);
    const body = {
      name: form.name,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      location: form.location,
    };
    try {
      if (editingId) {
        const { room } = await api(`/rooms/${editingId}`, { method: 'PATCH', body });
        setMessage(`Sala «${room.name}» actualizada.`);
      } else {
        const room = await api('/rooms', { method: 'POST', body });
        setMessage(`Sala «${room.name}» creada.`);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  async function handleToggle(room) {
    setError(null);
    setMessage(null);
    // Desactivar avisa antes y da el número después (D-52); activar no pide confirmación (D-53).
    if (
      room.isActive &&
      !window.confirm(`¿Desactivar «${room.name}»? Se cancelarán sus reservas futuras.`)
    ) {
      return;
    }
    try {
      const { cancelledBookings } = await api(`/rooms/${room.id}`, {
        method: 'PATCH',
        body: { isActive: !room.isActive },
      });
      setMessage(
        room.isActive
          ? `Sala desactivada. Reservas canceladas: ${cancelledBookings}.`
          : `Sala «${room.name}» activada.`,
      );
      if (editingId === room.id) resetForm();
    } catch (err) {
      setError(err.message);
    }
    load();
  }

  return (
    <section className="admin">
      <h1>Salas</h1>
      {error && <p className="error" role="alert">{error}</p>}
      {message && <p className="success" role="status">{message}</p>}

      <div className="admin-layout">
        <form className="form card" data-testid="room-form" onSubmit={handleSubmit}>
          <h2>{editingId ? 'Editar sala' : 'Nueva sala'}</h2>
          <label>
            Nombre
            <input data-testid="room-name" value={form.name} onChange={set('name')} maxLength={60} required />
          </label>
          <label>
            Capacidad (personas)
            <input
              data-testid="room-capacity"
              type="number"
              min={1}
              max={100}
              step={1}
              value={form.capacity}
              onChange={set('capacity')}
              required
            />
          </label>
          <label>
            Ubicación (opcional)
            <input data-testid="room-location" value={form.location} onChange={set('location')} maxLength={60} />
          </label>
          <div className="form-actions">
            <button type="submit" className="btn btn-primary" data-testid="room-submit" disabled={sending}>
              {editingId ? 'Guardar' : 'Crear sala'}
            </button>
            {editingId && (
              <button type="button" className="btn btn-light" onClick={resetForm}>
                Cancelar edición
              </button>
            )}
          </div>
        </form>

        {rooms === null ? (
          <p className="muted">Cargando…</p>
        ) : (
          <table className="rooms-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Capacidad</th>
                <th>Ubicación</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rooms.map((room) => (
                <tr
                  key={room.id}
                  data-testid={`room-row-${room.id}`}
                  className={room.isActive ? undefined : 'room-inactive'}
                >
                  <td>{room.name}</td>
                  <td>{room.capacity}</td>
                  <td>{room.location || '—'}</td>
                  <td>
                    <span className={`status ${room.isActive ? 'status-ok' : 'status-loading'}`}>
                      {room.isActive ? 'Activa' : 'Inactiva'}
                    </span>
                  </td>
                  <td>
                    <div className="row-actions">
                    <button type="button" className="btn btn-light" onClick={() => startEdit(room)}>
                      Editar
                    </button>
                    <button
                      type="button"
                      className={`btn ${room.isActive ? 'btn-danger' : 'btn-primary'}`}
                      data-testid={`room-toggle-${room.id}`}
                      onClick={() => handleToggle(room)}
                    >
                      {room.isActive ? 'Desactivar' : 'Activar'}
                    </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
