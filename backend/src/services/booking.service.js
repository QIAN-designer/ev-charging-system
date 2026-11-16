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
   * Crear reserva con reglas de negocio:
   * - Alumno: máx 2 horas por sesión
   * - Profesor: máx 4 horas por sesión
   * - Admin: sin límite estricto
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

    // Límites de tiempo según rol del instituto
    if (userRole === 'alumno' && durationHours > 2) {
      const error = new Error('Los alumnos tienen un límite máximo de reserva de 2 horas continuas');
      error.status = 400;
      throw error;
    }

    if (userRole === 'profesor' && durationHours > 4) {
      const error = new Error('Los profesores tienen un límite máximo de reserva de 4 horas continuas');
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
             u.id as user_id, u.name as user_name, u.email as user_email, u.role as user_role, u.vehicle_plate,
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
}

module.exports = new BookingService();

