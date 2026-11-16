const userService = require('../services/user.service');
const bookingService = require('../services/booking.service');
const scheduleService = require('../services/schedule.service');
const autoDispatchService = require('../services/autoDispatch.service');
const db = require('../config/db');

const getAllUsers = async (req, res) => {
  try {
    const users = await userService.getAllUsers();
    return res.status(200).json({
      success: true,
      data: users
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al listar usuarios'
    });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'El nuevo rol es obligatorio'
      });
    }

    const updated = await userService.updateUserRole(id, role);
    return res.status(200).json({
      success: true,
      message: 'Rol de usuario actualizado',
      data: updated
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al actualizar rol de usuario'
    });
  }
};

const getAllBookings = async (req, res) => {
  try {
    const { status, charger_id } = req.query;
    const bookings = await bookingService.getAllBookings({
      status,
      chargerId: charger_id
    });

    return res.status(200).json({
      success: true,
      data: bookings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al listar reservas'
    });
  }
};

const getDashboardStats = async (req, res) => {
  try {
    await bookingService.syncExpiredBookings();
    const usersCount = await db.query('SELECT COUNT(*) FROM users');
    const chargersCount = await db.query('SELECT COUNT(*) FROM chargers');
    const activeBookingsCount = await db.query("SELECT COUNT(*) FROM bookings WHERE status = 'active'");
    const totalBookingsCount = await db.query('SELECT COUNT(*) FROM bookings');

    // Desglose por roles
    const rolesDistribution = await db.query(`
      SELECT role, COUNT(*) as count
      FROM users
      GROUP BY role
    `);

    // Estado de los cargadores
    const chargersStatus = await db.query(`
      SELECT status, COUNT(*) as count
      FROM chargers
      GROUP BY status
    `);

    return res.status(200).json({
      success: true,
      data: {
        total_users: parseInt(usersCount.rows[0].count, 10),
        total_chargers: parseInt(chargersCount.rows[0].count, 10),
        active_bookings: parseInt(activeBookingsCount.rows[0].count, 10),
        total_bookings: parseInt(totalBookingsCount.rows[0].count, 10),
        roles_distribution: rolesDistribution.rows,
        chargers_status: chargersStatus.rows
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al obtener métricas del panel de administración'
    });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { id } = req.params;
    const { password } = req.body;

    if (!password || password.trim().length < 6) {
      return res.status(400).json({
        success: false,
        message: 'La nueva contraseña es obligatoria y debe tener al menos 6 caracteres'
      });
    }

    const updated = await userService.resetPasswordByAdmin(id, password);
    return res.status(200).json({
      success: true,
      message: 'Contraseña restablecida correctamente',
      data: updated
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al restablecer la contraseña del usuario'
    });
  }
};

const getSchedules = async (req, res) => {
  try {
    const schedules = await scheduleService.getAllSchedules();
    return res.status(200).json({
      success: true,
      data: schedules
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al obtener los horarios de clases'
    });
  }
};

const importSchedules = async (req, res) => {
  try {
    const { scheduleName, format, content, replaceExisting = true } = req.body;

    if (!scheduleName || !scheduleName.trim()) {
      return res.status(400).json({
        success: false,
        message: 'El nombre del horario es obligatorio (ej: 2º DAW, 1º ASIR...)'
      });
    }

    if (!content) {
      return res.status(400).json({
        success: false,
        message: 'El contenido del archivo (XML o JSON) es obligatorio'
      });
    }

    const imported = await scheduleService.importSchedule({
      scheduleName: scheduleName.trim(),
      format,
      content,
      replaceExisting
    });

    return res.status(201).json({
      success: true,
      message: `Horario "${scheduleName.trim()}" importado (${imported.length} sesiones de clase)`,
      data: imported
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al importar el horario de clases'
    });
  }
};

const clearSchedules = async (req, res) => {
  try {
    const { name } = req.query;
    await scheduleService.clearSchedules(name || null);
    return res.status(200).json({
      success: true,
      message: name ? `Horario "${name}" eliminado correctamente` : 'Todos los horarios han sido eliminados correctamente'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al vaciar los horarios de clases'
    });
  }
};

const cancelBookingByAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const cancelled = await bookingService.cancelBooking(id, req.user.id, 'admin');
    return res.status(200).json({
      success: true,
      message: `Reserva #${id} cancelada por el administrador`,
      data: cancelled
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al cancelar la reserva'
    });
  }
};

const getAutoDispatchStats = async (req, res) => {
  try {
    const stats = await autoDispatchService.getAlgorithmStats();
    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al calcular estadísticas del algoritmo'
    });
  }
};

const updateAutoDispatchSettings = async (req, res) => {
  try {
    const updated = await autoDispatchService.updateSettings(req.body);
    return res.status(200).json({
      success: true,
      message: 'Configuración del algoritmo actualizada con éxito',
      data: updated
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al actualizar configuración'
    });
  }
};

const runAutoDispatch = async (req, res) => {
  try {
    const { targetDate } = req.body;
    const result = await autoDispatchService.generateAutoBookings(targetDate);
    return res.status(200).json(result);
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al ejecutar asignación automática de reservas'
    });
  }
};

module.exports = {
  getAllUsers,
  updateUserRole,
  resetUserPassword,
  getAllBookings,
  cancelBookingByAdmin,
  getDashboardStats,
  getSchedules,
  importSchedules,
  clearSchedules,
  getAutoDispatchStats,
  updateAutoDispatchSettings,
  runAutoDispatch
};

