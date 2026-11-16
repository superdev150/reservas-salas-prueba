// Tramos fijos de la rejilla y de los selects (spec §9). No hay cálculo de fechas ni de zona
// horaria en el frontend: "hoy" y qué se puede reservar los da GET /api/calendar (D-43).
function label(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

const OPEN = 8 * 60;
const CLOSE = 20 * 60;

// Inicios de tramo 08:00 … 19:45 (48 filas).
export const SLOTS = Array.from({ length: (CLOSE - OPEN) / 15 }, (_, i) => label(OPEN + i * 15));
// Fines posibles 08:15 … 20:00.
export const END_TIMES = Array.from({ length: (CLOSE - OPEN) / 15 }, (_, i) => label(OPEN + (i + 1) * 15));

export function toMinutes(time) {
  const [hh, mm] = time.split(':').map(Number);
  return hh * 60 + mm;
}

// Fin por defecto: inicio + 60 min, recortado a 20:00 (spec §9).
export function defaultEnd(start) {
  return label(Math.min(toMinutes(start) + 60, CLOSE));
}

export function confirmCancel(booking) {
  return window.confirm(
    `¿Cancelar la reserva "${booking.title}" del ${booking.date} de ${booking.startTime} a ${booking.endTime} en ${booking.roomName}?`,
  );
}
