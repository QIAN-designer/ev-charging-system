const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const authMiddleware = require('../middlewares/auth.middleware');
const requireRole = require('../middlewares/role.middleware');

// Todas las rutas de administración requieren autenticación y rol 'admin'
router.use(authMiddleware);
router.use(requireRole('admin'));

router.get('/stats', adminController.getDashboardStats);
router.get('/users', adminController.getAllUsers);
router.patch('/users/:id/role', adminController.updateUserRole);
router.patch('/users/:id/password', adminController.resetUserPassword);
router.get('/bookings', adminController.getAllBookings);
router.patch('/bookings/:id/cancel', adminController.cancelBookingByAdmin);

// Algoritmo de asignación y reservas inteligentes
router.get('/auto-dispatch/stats', adminController.getAutoDispatchStats);
router.put('/auto-dispatch/settings', adminController.updateAutoDispatchSettings);
router.post('/auto-dispatch/run', adminController.runAutoDispatch);

router.get('/schedules', adminController.getSchedules);
router.post('/schedules/import', adminController.importSchedules);
router.delete('/schedules', adminController.clearSchedules);

module.exports = router;

