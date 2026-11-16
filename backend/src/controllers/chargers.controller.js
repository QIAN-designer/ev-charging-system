const db = require('../config/db');

const getAllChargers = async (req, res) => {
  try {
    const query = `
      SELECT 
        c.id, 
        c.name, 
        c.power_kw, 
        c.status as base_status, 
        c.location_description, 
        c.created_at,
        EXISTS (
          SELECT 1 
          FROM bookings b 
          WHERE b.charger_id = c.id 
            AND b.status = 'active' 
            AND b.start_time <= NOW() 
            AND b.end_time > NOW()
        ) as is_occupied,
        EXISTS (
          SELECT 1 
          FROM bookings b 
          WHERE b.charger_id = c.id 
            AND b.status = 'active' 
            AND b.end_time > NOW()
        ) as has_active_bookings
      FROM chargers c 
      ORDER BY c.id ASC
    `;

    const result = await db.query(query);

    // Calcular estado dinámico para cada cargador
    const chargers = result.rows.map(c => {
      let dynamicStatus = c.base_status;

      // Si operativamente está disponible pero tiene reservas activas:
      if (c.base_status === 'available') {
        if (c.is_occupied) {
          dynamicStatus = 'occupied'; // Ocupado ahora mismo
        } else if (c.has_active_bookings) {
          dynamicStatus = 'reserved'; // Con reserva futura activa
        }
      }

      return {
        id: c.id,
        name: c.name,
        power_kw: c.power_kw,
        status: dynamicStatus, // 'available', 'reserved', 'occupied', 'maintenance', 'out_of_service'
        base_status: c.base_status,
        is_occupied: c.is_occupied,
        has_active_bookings: c.has_active_bookings,
        location_description: c.location_description,
        created_at: c.created_at
      };
    });

    return res.status(200).json({
      success: true,
      data: chargers
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los cargadores'
    });
  }
};

const getChargerById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('SELECT * FROM chargers WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cargador no encontrado'
      });
    }

    // Obtener también reservas activas para ver disponibilidad
    const bookings = await db.query(
      `SELECT id, start_time, end_time, status FROM bookings
       WHERE charger_id = $1 AND status = 'active' AND end_time > NOW()
       ORDER BY start_time ASC`,
      [id]
    );

    return res.status(200).json({
      success: true,
      data: {
        ...result.rows[0],
        active_bookings: bookings.rows
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al obtener detalle del cargador'
    });
  }
};

const createCharger = async (req, res) => {
  try {
    const { name, power_kw, status, location_description } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del cargador es obligatorio'
      });
    }

    const result = await db.query(
      `INSERT INTO chargers (name, power_kw, status, location_description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [name, power_kw || 7.4, status || 'available', location_description || null]
    );

    return res.status(201).json({
      success: true,
      message: 'Cargador creado exitosamente',
      data: result.rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al crear el cargador'
    });
  }
};

const updateChargerStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, name, power_kw, location_description } = req.body;

    const validStatuses = ['available', 'maintenance', 'out_of_service'];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Estado inválido. Opciones: ${validStatuses.join(', ')}`
      });
    }

    const existing = await db.query('SELECT * FROM chargers WHERE id = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cargador no encontrado'
      });
    }

    const current = existing.rows[0];
    const updated = await db.query(
      `UPDATE chargers
       SET name = $1, power_kw = $2, status = $3, location_description = $4
       WHERE id = $5
       RETURNING *`,
      [
        name || current.name,
        power_kw || current.power_kw,
        status || current.status,
        location_description !== undefined ? location_description : current.location_description,
        id
      ]
    );

    return res.status(200).json({
      success: true,
      message: 'Cargador actualizado',
      data: updated.rows[0]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al actualizar el cargador'
    });
  }
};

const deleteCharger = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.query('DELETE FROM chargers WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Cargador no encontrado'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Cargador eliminado correctamente'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al eliminar cargador'
    });
  }
};

module.exports = {
  getAllChargers,
  getChargerById,
  createCharger,
  updateChargerStatus,
  deleteCharger
};

