const db = require('../config/db');

class IncidentService {
  /**
   * Crea una nueva incidencia reportada por un usuario (alumno, profesor o admin)
   */
  async createIncident({ userId, chargerId, type, title, description, reportedVehiclePlate }) {
    if (!type || !title) {
      const err = new Error('El tipo y el título de la incidencia son obligatorios.');
      err.status = 400;
      throw err;
    }

    const res = await db.query(
      `INSERT INTO incidents (user_id, charger_id, type, title, description, reported_vehicle_plate, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'pending')
       RETURNING *`,
      [
        userId,
        chargerId ? parseInt(chargerId, 10) : null,
        type,
        title.trim(),
        description ? description.trim() : null,
        reportedVehiclePlate ? reportedVehiclePlate.trim().toUpperCase() : null
      ]
    );

    return res.rows[0];
  }

  /**
   * Obtiene las incidencias reportadas por un usuario específico
   */
  async getMyIncidents(userId) {
    const res = await db.query(
      `SELECT i.*, 
              c.name AS charger_name, 
              c.location_description AS charger_location
       FROM incidents i
       LEFT JOIN chargers c ON i.charger_id = c.id
       WHERE i.user_id = $1
       ORDER BY i.created_at DESC`,
      [userId]
    );
    return res.rows;
  }

  /**
   * Obtiene todas las incidencias (Panel del Administrador) con filtro opcional por estado
   */
  async getAllIncidents(status = null) {
    let query = `
      SELECT i.*, 
             u.name AS user_name, 
             u.email AS user_email, 
             u.role AS user_role,
             u.class_name AS user_class,
             c.name AS charger_name,
             c.location_description AS charger_location,
             c.power_kw AS charger_power
      FROM incidents i
      JOIN users u ON i.user_id = u.id
      LEFT JOIN chargers c ON i.charger_id = c.id
    `;
    const params = [];

    if (status && status !== 'all') {
      query += ` WHERE i.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY i.created_at DESC`;

    const res = await db.query(query, params);
    return res.rows;
  }

  /**
   * Obtiene el conteo de incidencias pendientes para el badge de notificaciones
   */
  async getPendingCount() {
    const res = await db.query(`SELECT COUNT(*) FROM incidents WHERE status = 'pending'`);
    return parseInt(res.rows[0].count, 10);
  }

  /**
   * Actualiza el estado y respuesta de una incidencia por parte del Administrador
   */
  async updateIncidentStatus(incidentId, { status, adminResponse }) {
    const validStatuses = ['pending', 'in_progress', 'resolved', 'dismissed'];
    if (status && !validStatuses.includes(status)) {
      const err = new Error('Estado de incidencia no válido.');
      err.status = 400;
      throw err;
    }

    const resolvedAt = (status === 'resolved' || status === 'dismissed') ? new Date().toISOString() : null;

    const res = await db.query(
      `UPDATE incidents 
       SET status = COALESCE($1, status),
           admin_response = COALESCE($2, admin_response),
           resolved_at = CASE 
             WHEN $1 IN ('resolved', 'dismissed') THEN CURRENT_TIMESTAMP 
             ELSE resolved_at 
           END
       WHERE id = $3
       RETURNING *`,
      [status, adminResponse !== undefined ? adminResponse : null, incidentId]
    );

    if (res.rows.length === 0) {
      const err = new Error('Incidencia no encontrada.');
      err.status = 404;
      throw err;
    }

    return res.rows[0];
  }
}

module.exports = new IncidentService();
