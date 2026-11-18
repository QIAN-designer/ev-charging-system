const path = require("path");
const { Pool } = require("pg");
require("dotenv").config({ path: path.resolve(__dirname, "../../.env") });

const pool = new Pool({
    host: process.env.DB_HOST || "127.0.0.1",
    port: parseInt(process.env.DB_PORT, 10) || 5432,
    user: process.env.DB_USER || "admin",
    password: process.env.DB_PASSWORD || "erestonto",
    database: process.env.DB_NAME || "ev_charging_db",
});

pool.on("connect", () => {
    console.log("[DB] Conexión establecida con PostgreSQL en Docker (puerto 5432)");
});

pool.on("error", err => {
    console.error("[DB] Error inesperado en el pool de PostgreSQL:", err.message);
});

// Función para inicializar tablas automáticamente si no existen
const initDB = async () => {
    const schemaSQL = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(150) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL,
      role VARCHAR(20) NOT NULL CHECK (role IN ('alumno', 'profesor', 'admin')),
      vehicle_plate VARCHAR(20),
      vehicle_brand VARCHAR(50),
      vehicle_model VARCHAR(50),
      class_name VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS chargers (
      id SERIAL PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      power_kw NUMERIC(5,2) DEFAULT 7.4,
      status VARCHAR(20) NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'maintenance', 'out_of_service')),
      location_description VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS bookings (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      charger_id INT NOT NULL REFERENCES chargers(id) ON DELETE CASCADE,
      start_time TIMESTAMP NOT NULL,
      end_time TIMESTAMP NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'cancelled')),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT chk_time_window CHECK (end_time > start_time)
    );

    CREATE INDEX IF NOT EXISTS idx_bookings_charger_time ON bookings (charger_id, start_time, end_time);
    CREATE INDEX IF NOT EXISTS idx_bookings_user ON bookings (user_id);

    CREATE TABLE IF NOT EXISTS class_schedules (
      id SERIAL PRIMARY KEY,
      schedule_name VARCHAR(120) NOT NULL DEFAULT 'Horario General',
      day_name VARCHAR(30) NOT NULL,
      start_time VARCHAR(10) NOT NULL,
      end_time VARCHAR(10) NOT NULL,
      module_name VARCHAR(200) NOT NULL,
      cfs VARCHAR(20),
      highlighted BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_class_schedules_day ON class_schedules (day_name, start_time);

    CREATE TABLE IF NOT EXISTS system_settings (
      key VARCHAR(50) PRIMARY KEY,
      value TEXT NOT NULL,
      description VARCHAR(255),
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id SERIAL PRIMARY KEY,
      user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      charger_id INT REFERENCES chargers(id) ON DELETE SET NULL,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(150) NOT NULL,
      description TEXT,
      reported_vehicle_plate VARCHAR(30),
      status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'resolved', 'dismissed')),
      admin_response TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      resolved_at TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_incidents_status ON incidents (status);
    CREATE INDEX IF NOT EXISTS idx_incidents_user ON incidents (user_id);
  `;

    try {
        await pool.query(schemaSQL);
        // Asegurar columnas y configuraciones iniciales
        await pool.query(`
          ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_brand VARCHAR(50);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_model VARCHAR(50);
          ALTER TABLE users ADD COLUMN IF NOT EXISTS class_name VARCHAR(120);
          ALTER TABLE class_schedules ADD COLUMN IF NOT EXISTS schedule_name VARCHAR(120) NOT NULL DEFAULT 'Horario General';
          
          INSERT INTO system_settings (key, value, description)
          VALUES 
            ('course_total_hours', '2000', 'Horas lectivas totales estimadas del curso'),
            ('charging_window_start', '08:00', 'Hora inicio de franja de carga del campus'),
            ('charging_window_end', '15:00', 'Hora fin de franja de carga del campus'),
            ('slot_duration_hours', '2', 'Horas asignadas por reserva a cada alumno'),
            ('auto_dispatch_enabled', 'true', 'Activar o pausar la asignación programada'),
            ('auto_dispatch_frequency', 'daily', 'Frecuencia: daily, weekly o monthly'),
            ('auto_dispatch_time', '20:00', 'Hora de ejecución automática (HH:MM)'),
            ('auto_dispatch_day_of_week', '1', 'Día de la semana para reparto semanal (1=Lunes..7=Domingo)'),
            ('auto_dispatch_day_of_month', '1', 'Día del mes para reparto mensual (1..31)'),
            ('auto_dispatch_target_scope', 'tomorrow', 'Día a asignar: today, tomorrow o next_period'),
            ('auto_dispatch_days', '1,2,3,4,5', 'Días lectivos activos para diario (1=Lunes..5=Viernes)'),
            ('auto_dispatch_last_run', '', 'Fecha y hora de la última ejecución automática')
          ON CONFLICT (key) DO NOTHING;
        `);
        console.log("[DB] Tablas y configuraciones verificadas e inicializadas correctamente.");

        // Sembrar cargadores iniciales si la tabla está vacía
        const chargerCheck = await pool.query("SELECT COUNT(*) FROM chargers");
        if (parseInt(chargerCheck.rows[0].count, 10) === 0) {
            await pool.query(`
        INSERT INTO chargers (name, power_kw, status, location_description) VALUES
        ('Cargador 1 - Patio A', 7.4, 'available', 'Zona aparcamiento principal - Plaza 01'),
        ('Cargador 2 - Patio A', 7.4, 'available', 'Zona aparcamiento principal - Plaza 02'),
        ('Cargador 3 - Taller Automoción', 11.0, 'available', 'Junto al acceso al taller - Plaza 03'),
        ('Cargador 4 - Profesores', 22.0, 'available', 'Zona reservada claustro - Plaza 04');
      `);
            console.log("[DB] Cargadores de prueba creados.");
        }
    } catch (error) {
        console.error("[DB] Error inicializando las tablas de base de datos:", error.message);
    }
};

module.exports = {
    pool,
    query: (text, params) => pool.query(text, params),
    initDB,
};
