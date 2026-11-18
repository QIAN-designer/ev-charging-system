const express = require('express');
const router = express.Router();
const incidentsController = require('../controllers/incidents.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const roleMiddleware = require('../middlewares/role.middleware');

// Rutas de usuario autenticado (Reportar y ver mis incidencias)
router.post('/', authMiddleware, incidentsController.createIncident);
router.get('/my', authMiddleware, incidentsController.getMyIncidents);

// Rutas de Administrador (Bandeja de notificaciones y gestión)
router.get('/all', authMiddleware, roleMiddleware('admin'), incidentsController.getAllIncidents);
router.get('/pending-count', authMiddleware, roleMiddleware('admin'), incidentsController.getPendingCount);
router.patch('/:id', authMiddleware, roleMiddleware('admin'), incidentsController.updateIncidentStatus);

module.exports = router;
