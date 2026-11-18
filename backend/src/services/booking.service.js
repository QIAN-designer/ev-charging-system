const db = require('../config/db');
const { isFutureDate, getDurationInHours } = require('../utils/dateHelpers');

class BookingService {
  /**
   * Marca automáticamente como 'completed' las reservas activas cuyo tiempo de fin ya ha expirado.
   */
  async syncExpiredBookings() {
    await db.query(
      `UPDATE bookings
       SET status = 'completed'
       WHERE status = 'active' AND end_time <= NOW()`
    );
  }

  /**
   * Obtiene la duración máxima en horas para una reserva según las reglas del centro:
   * - Todos los usuarios (alumno/profesor): 3 horas por intervalo.
   * - Excepción Miércoles: El primer intervalo del día (a partir de las 08:00) es de 2 horas.
   */
  getMaxAllowedDuration(startTime, userRole) {
    if (userRole === 'admin') return 12; // Admins sin restricción corta

    const start = new Date(startTime);
    const dayOfWeek = start.getDay(); // 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb

    // Si es Miércoles (dayOfWeek === 3)
    if (dayOfWeek === 3) {
      // El primer intervalo del día (antes de las 10:30 o las primeras 2h de campus) tiene un límite de 2h
      const startH = start.getHours();
      const startM = start.getMinutes();
      const totalMinutesFromMidnight = startH * 60 + startM;

      // Si empieza en la primera franja lectiva (ej: entre las 08:00 y las 09:00)
      if (totalMinutesFromMidnight <= 9 * 60) {
        return 2;
      }
    }

    return 3;
  }

  /**
   * Crear reserva con reglas de negocio:
   * - Intervalos de carga de 3h para todos (excepto miércoles cuyo primer intervalo es de 2h)
   * - Validación de solapamiento de horarios en el cargador
   */
  async createBooking({ userId, userRole, chargerId, startTime, endTime }) {
    const start = new Date(startTime);
    const end = new Date(endTime);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      const error = new Error('Formato de fecha inválido');
      error.status = 400;
      throw error;
    }

    if (start >= end) {
      const error = new Error('La hora de inicio debe ser anterior a la hora de fin');
      error.status = 400;
      throw error;
    }

    if (!isFutureDate(start)) {
      const error = new Error('La reserva no puede realizarse en el pasado');
      error.status = 400;
      throw error;
    }

    const durationHours = getDurationInHours(start, end);
    const maxAllowed = this.getMaxAllowedDuration(start, userRole);

    if (durationHours > maxAllowed) {
      const error = new Error(
        start.getDay() === 3 && maxAllowed === 2
          ? 'Los miércoles el primer intervalo de carga está limitado a 2 horas.'
          : `El tiempo máximo de reserva por intervalo es de ${maxAllowed} horas.`
      );
      error.status = 400;
      throw error;
    }

    // Verificar si el cargador existe y está operativo
    const chargerRes = await db.query('SELECT id, status FROM chargers WHERE id = $1', [chargerId]);
    if (chargerRes.rows.length === 0) {
      const error = new Error('El punto de carga especificado no existe');
      error.status = 404;
      throw error;
    }

    if (chargerRes.rows[0].status !== 'available') {
      const error = new Error(`El cargador no está disponible actualmente (estado: ${chargerRes.rows[0].status})`);
      error.status = 400;
      throw error;
    }

    // Comprobar conflicto de reservas activas
    const overlapRes = await db.query(
      `SELECT id FROM bookings
       WHERE charger_id = $1
         AND status = 'active'
         AND start_time < $2
         AND end_time > $3`,
      [chargerId, end.toISOString(), start.toISOString()]
    );

    if (overlapRes.rows.length > 0) {
      const error = new Error('El punto de carga ya está reservado en la franja horaria solicitada');
      error.status = 409;
      throw error;
    }

    // Crear la reserva
    const insertRes = await db.query(
      `INSERT INTO bookings (user_id, charger_id, start_time, end_time, status)
       VALUES ($1, $2, $3, $4, 'active')
       RETURNING *`,
      [userId, chargerId, start.toISOString(), end.toISOString()]
    );

    return insertRes.rows[0];
  }

  async getMyBookings(userId) {
    await this.syncExpiredBookings();
    const res = await db.query(
      `SELECT b.id, b.start_time, b.end_time, b.status, b.created_at,
              c.id as charger_id, c.name as charger_name, c.power_kw, c.location_description
       FROM bookings b
       JOIN chargers c ON b.charger_id = c.id
       WHERE b.user_id = $1
       ORDER BY b.start_time DESC`,
      [userId]
    );
    return res.rows;
  }

  async cancelBooking(bookingId, userId, userRole) {
    const res = await db.query('SELECT * FROM bookings WHERE id = $1', [bookingId]);
    if (res.rows.length === 0) {
      const error = new Error('Reserva no encontrada');
      error.status = 404;
      throw error;
    }

    const booking = res.rows[0];

    // Solo el dueño o un admin pueden cancelar
    if (userRole !== 'admin' && booking.user_id !== userId) {
      const error = new Error('No tienes permisos para cancelar esta reserva');
      error.status = 403;
      throw error;
    }

    if (booking.status === 'cancelled') {
      const error = new Error('La reserva ya ha sido cancelada con anterioridad');
      error.status = 400;
      throw error;
    }

    const updated = await db.query(
      "UPDATE bookings SET status = 'cancelled' WHERE id = $1 RETURNING *",
      [bookingId]
    );

    return updated.rows[0];
  }

  async getAllBookings(filters = {}) {
    await this.syncExpiredBookings();
    let query = `
      SELECT b.id, b.start_time, b.end_time, b.status, b.created_at,
             u.id as user_id, u.name as user_name, u.email as user_email, u.role as user_role, u.vehicle_plate, u.class_name,
             c.id as charger_id, c.name as charger_name, c.power_kw, c.location_description
      FROM bookings b
      JOIN users u ON b.user_id = u.id
      JOIN chargers c ON b.charger_id = c.id
    `;
    const params = [];
    const conditions = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`b.status = $${params.length}`);
    }

    if (filters.chargerId) {
      params.push(filters.chargerId);
      conditions.push(`b.charger_id = $${params.length}`);
    }

    if (conditions.length > 0) {
      query += ` WHERE ${conditions.join(' AND ')}`;
    }

    query += ' ORDER BY b.start_time DESC';

    const res = await db.query(query, params);
    return res.rows;
  }

  /**
   * Obtiene la cuadrícula del horario semanal de recargas (Lunes a Viernes o toda la semana)
   * con información del alumno/profesor, su clase, cargador asignado y estado.
   */
  async getWeeklySchedule(weekStartStr = null) {
    await this.syncExpiredBookings();

    // Determinar el Lunes de la semana seleccionada (o de la semana actual)
    let refDate;
    if (weekStartStr && typeof weekStartStr === 'string') {
      const parts = weekStartStr.split('-').map(Number);
      if (parts.length === 3) {
        // Fijar a mediodía local para evitar desfases de medianoche UTC/CEST
        refDate = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
      } else {
        refDate = new Date(weekStartStr);
      }
    } else {
      refDate = new Date();
    }
    if (isNaN(refDate.getTime())) refDate = new Date();

    // Encontrar el lunes de esa semana
    const day = refDate.getDay(); // 0=Dom, 1=Lun..6=Sab
    const diffToMonday = (day === 0 ? -6 : 1) - day;
    const monday = new Date(refDate);
    monday.setDate(refDate.getDate() + diffToMonday);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const pad = (n) => String(n).padStart(2, '0');
    const toLocalDateStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    const mondayStr = toLocalDateStr(monday);
    const sundayStr = toLocalDateStr(sunday);

    const res = await db.query(
      `SELECT b.id, b.start_time, b.end_time, b.status,
              u.id as user_id, u.name as user_name, u.email as user_email, u.role as user_role, u.class_name, u.vehicle_plate,
              c.id as charger_id, c.name as charger_name, c.power_kw, c.location_description
       FROM bookings b
       JOIN users u ON b.user_id = u.id
       JOIN chargers c ON b.charger_id = c.id
       WHERE b.status IN ('active', 'completed')
         AND b.start_time >= $1 AND b.start_time <= $2
       ORDER BY b.start_time ASC, c.id ASC`,
      [`${mondayStr} 00:00:00`, `${sundayStr} 23:59:59`]
    );

    return {
      week_start: mondayStr,
      week_end: sundayStr,
      bookings: res.rows
    };
  }
}

module.exports = new BookingService();

