const incidentService = require('../services/incident.service');

const createIncident = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { charger_id, type, title, description, reported_vehicle_plate } = req.body;

    const incident = await incidentService.createIncident({
      userId,
      chargerId: charger_id,
      type,
      title,
      description,
      reportedVehiclePlate: reported_vehicle_plate
    });

    return res.status(201).json({
      success: true,
      message: 'Incidencia reportada correctamente. El administrador ha sido notificado.',
      data: incident
    });
  } catch (error) {
    next(error);
  }
};

const getMyIncidents = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const incidents = await incidentService.getMyIncidents(userId);

    return res.status(200).json({
      success: true,
      data: incidents
    });
  } catch (error) {
    next(error);
  }
};

const getAllIncidents = async (req, res, next) => {
  try {
    const { status } = req.query;
    const incidents = await incidentService.getAllIncidents(status);

    return res.status(200).json({
      success: true,
      data: incidents
    });
  } catch (error) {
    next(error);
  }
};

const getPendingCount = async (req, res, next) => {
  try {
    const count = await incidentService.getPendingCount();
    return res.status(200).json({
      success: true,
      data: { pendingCount: count }
    });
  } catch (error) {
    next(error);
  }
};

const updateIncidentStatus = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { status, admin_response } = req.body;

    const updated = await incidentService.updateIncidentStatus(id, {
      status,
      adminResponse: admin_response
    });

    return res.status(200).json({
      success: true,
      message: 'Incidencia actualizada con éxito.',
      data: updated
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createIncident,
  getMyIncidents,
  getAllIncidents,
  getPendingCount,
  updateIncidentStatus
};
