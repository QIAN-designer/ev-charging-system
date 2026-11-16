const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const chargersRoutes = require('./routes/chargers.routes');
const bookingsRoutes = require('./routes/bookings.routes');
const adminRoutes = require('./routes/admin.routes');

const app = express();

// Middlewares globales
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));

// Endpoint de verificación de estado
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'ev-charging-backend'
  });
});

// Rutas de la API
app.use('/api/auth', authRoutes);
app.use('/api/chargers', chargersRoutes);
app.use('/api/bookings', bookingsRoutes);
app.use('/api/admin', adminRoutes);

// Manejo de ruta no encontrada (404)
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Ruta no encontrada: ${req.method} ${req.originalUrl}`
  });
});

// Middleware centralizado de errores
app.use((err, req, res, next) => {
  console.error('[Error Global]:', err.stack || err.message);
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Error interno del servidor'
  });
});

module.exports = app;

