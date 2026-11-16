const bookingService = require('../services/booking.service');

const createBooking = async (req, res) => {
  try {
    // Si es alumno, el sistema reserva automáticamente por algoritmo
    if (req.user.role === 'alumno') {
      return res.status(403).json({
        success: false,
        message: 'Las reservas de alumnos son asignadas automáticamente por la aplicación mediante el algoritmo de reparto inteligente. Puedes consultar o anular tu plaza asignada en "Mis Reservas".'
      });
    }

    const { charger_id, start_time, end_time } = req.body;

    if (!charger_id || !start_time || !end_time) {
      return res.status(400).json({
        success: false,
        message: 'charger_id, start_time y end_time son obligatorios'
      });
    }

    const booking = await bookingService.createBooking({
      userId: req.user.id,
      userRole: req.user.role,
      chargerId: charger_id,
      startTime: start_time,
      endTime: end_time
    });

    return res.status(201).json({
      success: true,
      message: 'Reserva creada con éxito',
      data: booking
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al crear la reserva'
    });
  }
};

const getMyBookings = async (req, res) => {
  try {
    const bookings = await bookingService.getMyBookings(req.user.id);
    return res.status(200).json({
      success: true,
      data: bookings
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: 'Error al recuperar tus reservas'
    });
  }
};

const cancelBooking = async (req, res) => {
  try {
    const { id } = req.params;
    const cancelled = await bookingService.cancelBooking(id, req.user.id, req.user.role);

    return res.status(200).json({
      success: true,
      message: 'Reserva cancelada correctamente',
      data: cancelled
    });
  } catch (error) {
    return res.status(error.status || 500).json({
      success: false,
      message: error.message || 'Error al cancelar reserva'
    });
  }
};

const getWeeklySchedule = async (req, res) => {
  try {
    const { week_start } = req.query;
    const schedule = await bookingService.getWeeklySchedule(week_start);
    return res.status(200).json({
      success: true,
      data: schedule
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message || 'Error al obtener el horario semanal de recargas'
    });
  }
};

module.exports = {
  createBooking,
  getMyBookings,
  cancelBooking,
  getWeeklySchedule
};

