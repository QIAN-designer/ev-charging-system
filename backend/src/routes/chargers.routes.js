const express = require('express');
const router = express.Router();
const chargersController = require('../controllers/chargers.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Rutas accesibles para cualquier usuario autenticado (alumno, profesor, admin)
router.get('/', authMiddleware, chargersController.getAllChargers);
router.get('/:id', authMiddleware, chargersController.getChargerById);

// Rutas exclusivas de gestión para Administrador
router.post('/', authMiddleware, requireRole('admin'), chargersController.createCharger);
router.put('/:id', authMiddleware, requireRole('admin'), chargersController.updateChargerStatus);
router.delete('/:id', authMiddleware, requireRole('admin'), chargersController.deleteCharger);

module.exports = router;

