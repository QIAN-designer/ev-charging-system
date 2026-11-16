const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });
const app = require('./src/app');
const { initDB } = require('./src/config/db');
const autoDispatchService = require('./src/services/autoDispatch.service');

const PORT = process.env.PORT || 3000;

const startServer = async () => {
  try {
    // Inicializar y verificar tablas en PostgreSQL (Docker)
    await initDB();

    // Comprobador del scheduler programado por el administrador (revisa cada 60 segundos)
    setInterval(async () => {
      try {
        await autoDispatchService.checkAndRunScheduledDispatch();
      } catch (err) {
        console.error('[AutoDispatch Scheduler] Error:', err.message);
      }
    }, 60 * 1000);

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`===============================================`);
      console.log(`🚀 Servidor ejecutándose en el puerto ${PORT}`);
      console.log(`📡 URL base: http://localhost:${PORT}/api`);
      console.log(`🐘 Conexión PostgreSQL Docker: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
      console.log(`===============================================`);
    });

    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        console.error(`❌ El puerto ${PORT} ya está en uso por otro proceso.`);
      } else {
        console.error('❌ Error en el servidor HTTP:', err.message);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Error al iniciar el servidor:', error.message);
    process.exit(1);
  }
};

startServer();

