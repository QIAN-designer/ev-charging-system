const express = require('express');
const router = express.Router();
const bookingsController = require('../controllers/bookings.controller');
const authMiddleware = require('../middlewares/auth.middleware');

// Rutas protegidas para usuarios autenticados (alumnos, profesores, admin)
router.post('/', authMiddleware, bookingsController.createBooking);
router.get('/my', authMiddleware, bookingsController.getMyBookings);
router.patch('/:id/cancel', authMiddleware, bookingsController.cancelBooking);

module.exports = router;

