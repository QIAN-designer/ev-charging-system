const db = require('../config/db');

class AutoDispatchService {
  /**
   * Obtiene las configuraciones del sistema (horas de curso, franja horaria, etc.)
   */
  async getSettings() {
    const res = await db.query('SELECT key, value, description FROM system_settings');
    const settings = {};
    for (const row of res.rows) {
      settings[row.key] = row.value;
    }
    return {
      course_total_hours: parseFloat(settings.course_total_hours || '2000'),
      charging_window_start: settings.charging_window_start || '15:00',
      charging_window_end: settings.charging_window_end || '21:00',
      slot_duration_hours: parseFloat(settings.slot_duration_hours || '3'),
      auto_dispatch_enabled: settings.auto_dispatch_enabled !== 'false',
      auto_dispatch_frequency: settings.auto_dispatch_frequency || 'weekly', // daily | weekly | monthly
      auto_dispatch_time: settings.auto_dispatch_time || '00:00',
      auto_dispatch_day_of_week: parseInt(settings.auto_dispatch_day_of_week || '7', 10), // 1=Lunes..7=Domingo
      auto_dispatch_day_of_month: parseInt(settings.auto_dispatch_day_of_month || '1', 10), // 1..31
      auto_dispatch_target_scope: settings.auto_dispatch_target_scope || 'week',
      auto_dispatch_days: settings.auto_dispatch_days || '1,2,3,4,5',
      auto_dispatch_last_run: settings.auto_dispatch_last_run || null
    };
  }

  /**
   * Actualiza las configuraciones
   */
  async updateSettings(newSettings) {
    for (const [key, val] of Object.entries(newSettings)) {
      if (val !== undefined && val !== null) {
        await db.query(
          `INSERT INTO system_settings (key, value, updated_at)
           VALUES ($1, $2, CURRENT_TIMESTAMP)
           ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [key, String(val)]
        );
      }
    }
    return this.getSettings();
  }

  /**
   * Calcula el resumen del algoritmo de reparto de horas:
   * - Alumnos con vehículo apuntados
   * - Horas totales del curso / alumnos apuntados = Cuota de horas por alumno
   * - Horas ya consumidas/asignadas por cada alumno
   * - Ranking de prioridad (de menor a mayor horas cargadas)
   */
  async getAlgorithmStats() {
    const settings = await this.getSettings();

    // 1. Alumnos con vehículo registrado (matrícula o marca/modelo)
    const studentsRes = await db.query(`
      SELECT 
        u.id, 
        u.name, 
        u.email, 
        u.vehicle_plate, 
        u.vehicle_brand, 
        u.vehicle_model,
        u.class_name,
        COALESCE(
          SUM(
            CASE 
              WHEN b.status IN ('active', 'completed') 
              THEN EXTRACT(EPOCH FROM (b.end_time - b.start_time)) / 3600.0 
              ELSE 0 
            END
          ), 
          0
        ) AS total_hours_charged,
        COUNT(CASE WHEN b.status IN ('active', 'completed') THEN 1 END) AS total_bookings_count
      FROM users u
      LEFT JOIN bookings b ON u.id = b.user_id
      WHERE u.role = 'alumno'
        AND (u.vehicle_plate IS NOT NULL AND TRIM(u.vehicle_plate) <> '')
      GROUP BY u.id
      ORDER BY total_hours_charged ASC, u.created_at ASC
    `);

    const students = studentsRes.rows.map(s => ({
      ...s,
      total_hours_charged: parseFloat(Number(s.total_hours_charged).toFixed(2)),
      total_bookings_count: parseInt(s.total_bookings_count, 10)
    }));

    const enrolledCount = students.length;
    const courseTotalHours = settings.course_total_hours;

    // Algoritmo: horas totales del curso / alumnos apuntados
    const quotaPerHourPerStudent = enrolledCount > 0 
      ? parseFloat((courseTotalHours / enrolledCount).toFixed(2))
      : courseTotalHours;

    return {
      settings,
      total_course_hours: courseTotalHours,
      enrolled_students_count: enrolledCount,
      quota_per_student: quotaPerHourPerStudent,
      priority_ranking: students
    };
  }

  /**
   * Asigna reservas para una fecha individual (targetDate).
   * Horario exclusivo de tarde (15:10 a 21:00) en base a clases de 55 minutos:
   * - Tramo 1 (Antes del patio): 15:10 a 17:55 (3 sesiones de 55 min = 2h 45m).
   * - Patio / Descanso: 17:55 a 18:15 (20 min sin reservas para rotación/cambio de vehículos).
   * - Tramo 2 (Después del patio): 18:15 a 21:00 (3 sesiones de 55 min = 2h 45m).
   */
  async generateBookingsForSingleDay(target, settings, chargers, accumulatedHoursMap) {
    const definedSlots = [
      { startH: 15, startM: 10, endH: 17, endM: 55, durationHours: 2.75 },
      { startH: 18, startM: 15, endH: 21, endM: 0, durationHours: 2.75 }
    ];

    const now = new Date();
    const timeSlots = [];

    for (const slotDef of definedSlots) {
      const slotStart = new Date(target);
      slotStart.setHours(slotDef.startH, slotDef.startM, 0, 0);

      const slotEnd = new Date(target);
      slotEnd.setHours(slotDef.endH, slotDef.endM, 0, 0);

      const isToday = target.toDateString() === now.toDateString();
      if (!isToday || slotStart > now) {
        timeSlots.push({
          start: slotStart,
          end: slotEnd,
          durationHours: slotDef.durationHours
        });
      }
    }

    if (timeSlots.length === 0) {
      return [];
    }

    // Consultar reservas ya existentes ese día
    const dayStartIso = new Date(target);
    dayStartIso.setHours(0, 0, 0, 0);
    const dayEndIso = new Date(target);
    dayEndIso.setHours(23, 59, 59, 999);

    const existingBookingsRes = await db.query(
      `SELECT user_id, charger_id, start_time, end_time 
       FROM bookings 
       WHERE status = 'active' 
         AND start_time >= $1 AND start_time <= $2`,
      [dayStartIso.toISOString(), dayEndIso.toISOString()]
    );
    const existing = existingBookingsRes.rows;

    // Alumnos que ya tienen reserva activa ese día
    const studentsWithBookingToday = new Set(existing.map(b => b.user_id));

    // Obtener lista fresca de alumnos con vehículo
    const studentsRes = await db.query(`
      SELECT id, name, email, vehicle_plate, vehicle_brand, vehicle_model, class_name
      FROM users
      WHERE role = 'alumno'
        AND (vehicle_plate IS NOT NULL AND TRIM(vehicle_plate) <> '')
    `);

    // Ordenar por menor horas acumuladas según el mapa dinámico
    const rankedStudents = studentsRes.rows.sort((a, b) => {
      const hA = accumulatedHoursMap.get(a.id) ?? 0;
      const hB = accumulatedHoursMap.get(b.id) ?? 0;
      return hA - hB;
    });

    const dayCreatedBookings = [];

    for (const student of rankedStudents) {
      if (studentsWithBookingToday.has(student.id)) {
        continue; // Máximo 1 turno por alumno al día
      }

      let assigned = false;
      for (const slot of timeSlots) {
        for (const charger of chargers) {
          const isOccupied = existing.some(b => 
            b.charger_id === charger.id &&
            new Date(b.start_time) < slot.end &&
            new Date(b.end_time) > slot.start
          );

          if (!isOccupied) {
            const pad = (n) => String(n).padStart(2, '0');
            const formatLocal = (d) =>
              `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

            const startStr = formatLocal(slot.start);
            const endStr = formatLocal(slot.end);

            const insertRes = await db.query(
              `INSERT INTO bookings (user_id, charger_id, start_time, end_time, status)
               VALUES ($1, $2, $3, $4, 'active')
               RETURNING id, user_id, charger_id, start_time, end_time, status`,
              [student.id, charger.id, startStr, endStr]
            );

            const newBooking = insertRes.rows[0];
            existing.push(newBooking);
            studentsWithBookingToday.add(student.id);

            // Actualizar horas acumuladas dinámicamente
            const prevHours = accumulatedHoursMap.get(student.id) ?? 0;
            accumulatedHoursMap.set(student.id, prevHours + slot.durationHours);

            dayCreatedBookings.push({
              id: newBooking.id,
              user_id: student.id,
              user_name: student.name,
              vehicle_plate: student.vehicle_plate,
              charger_name: charger.name,
              start_time: newBooking.start_time,
              end_time: newBooking.end_time,
              accumulated_hours: accumulatedHoursMap.get(student.id)
            });

            assigned = true;
            break;
          }
        }
        if (assigned) break;
      }
    }

    return dayCreatedBookings;
  }

  /**
   * Genera y asigna automáticamente reservas para TODA LA SEMANA lectiva (Lunes a Viernes).
   * Si se ejecuta a mitad de semana, cubre los días restantes de la semana en curso (o la semana completa).
   * @param {String|null} referenceDateStr - Fecha de referencia (YYYY-MM-DD)
   */
  async generateWeeklyAutoBookings(referenceDateStr = null) {
    // Sincronizar reservas expiradas
    await db.query(`UPDATE bookings SET status = 'completed' WHERE status = 'active' AND end_time <= NOW()`);

    const stats = await this.getAlgorithmStats();
    const { settings, priority_ranking } = stats;

    if (priority_ranking.length === 0) {
      return {
        success: false,
        message: 'No hay alumnos con vehículo registrado para asignar reservas.',
        createdBookings: []
      };
    }

    // Obtener cargadores disponibles
    const chargersRes = await db.query(
      "SELECT id, name, power_kw, location_description FROM chargers WHERE status = 'available' ORDER BY id ASC"
    );
    const chargers = chargersRes.rows;

    if (chargers.length === 0) {
      return {
        success: false,
        message: 'No hay cargadores operativos con estado disponible.',
        createdBookings: []
      };
    }

    // Determinar la fecha de referencia
    let refDate = referenceDateStr ? new Date(referenceDateStr) : new Date();
    if (isNaN(refDate.getTime())) refDate = new Date();

    // Calcular el Lunes de la semana lectiva
    const monday = new Date(refDate);
    const dayOfWeek = monday.getDay(); // 0 = Domingo, 1 = Lunes, ...
    const diffToMonday = monday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    monday.setDate(diffToMonday);
    monday.setHours(0, 0, 0, 0);

    // Días lectivos de la semana (Lunes a Viernes)
    const schoolDays = [];
    for (let i = 0; i < 5; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      schoolDays.push(d);
    }

    // Mapa de horas acumuladas de cada alumno para balancear dinámicamente día a día
    const accumulatedHoursMap = new Map();
    priority_ranking.forEach(st => {
      accumulatedHoursMap.set(st.id, st.total_hours_charged);
    });

    const allWeeklyBookings = [];

    // Iterar cada día lectivo de la semana
    for (const dayDate of schoolDays) {
      const dayBookings = await this.generateBookingsForSingleDay(
        dayDate,
        settings,
        chargers,
        accumulatedHoursMap
      );
      allWeeklyBookings.push(...dayBookings);
    }

    // Registrar timestamp de última ejecución
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('auto_dispatch_last_run', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [new Date().toISOString()]
    );

    const startStr = schoolDays[0].toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    const endStr = schoolDays[4].toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });

    return {
      success: true,
      message: allWeeklyBookings.length > 0 
        ? `Se han planificado ${allWeeklyBookings.length} reservas automáticas para toda la semana lectiva (${startStr} - ${endStr}).`
        : `No se pudieron generar nuevas plazas: los alumnos prioritarios ya tienen reservas o las franjas ya están ocupadas para esta semana.`,
      createdBookings: allWeeklyBookings,
      weekRange: `${startStr} - ${endStr}`
    };
  }

  /**
   * Método compatible con llamadas anteriores, redirigiendo a planificación semanal
   */
  async generateAutoBookings(targetDateStr = null) {
    return this.generateWeeklyAutoBookings(targetDateStr);
  }

  /**
   * Verifica periódicamente si ha llegado el momento programado (diario, semanal o mensual).
   */
  async checkAndRunScheduledDispatch() {
    const settings = await this.getSettings();
    if (!settings.auto_dispatch_enabled) return false;

    const now = new Date();
    const frequency = settings.auto_dispatch_frequency || 'weekly';

    if (frequency === 'daily') {
      const currentDayOfWeek = now.getDay();
      const activeDays = (settings.auto_dispatch_days || '1,2,3,4,5')
        .split(',')
        .map(d => parseInt(d.trim(), 10))
        .filter(n => !isNaN(n));

      if (!activeDays.includes(currentDayOfWeek)) {
        return false;
      }
    } else if (frequency === 'weekly') {
      const currentIsoDay = now.getDay() === 0 ? 7 : now.getDay();
      if (currentIsoDay !== settings.auto_dispatch_day_of_week) {
        return false;
      }
    } else if (frequency === 'monthly') {
      const currentDayOfMonth = now.getDate();
      if (currentDayOfMonth !== settings.auto_dispatch_day_of_month) {
        return false;
      }
    }

    const [schedH, schedM] = (settings.auto_dispatch_time || '00:00').split(':').map(Number);
    const nowH = now.getHours();
    const nowM = now.getMinutes();

    if (settings.auto_dispatch_last_run) {
      const lastRun = new Date(settings.auto_dispatch_last_run);
      if (frequency === 'daily') {
        if (
          lastRun.getFullYear() === now.getFullYear() &&
          lastRun.getMonth() === now.getMonth() &&
          lastRun.getDate() === now.getDate()
        ) {
          return false;
        }
      } else if (frequency === 'weekly') {
        const diffDays = Math.floor((now.getTime() - lastRun.getTime()) / (1000 * 3600 * 24));
        if (diffDays < 6) return false;
      } else if (frequency === 'monthly') {
        if (lastRun.getFullYear() === now.getFullYear() && lastRun.getMonth() === now.getMonth()) {
          return false;
        }
      }
    }

    if (nowH > schedH || (nowH === schedH && nowM >= schedM)) {
      console.log(`[AutoDispatch] Ejecutando reparto semanal programado (${frequency})...`);
      const result = await this.generateWeeklyAutoBookings();
      console.log(`[AutoDispatch] Reparto semanal completado: ${result.message}`);
      return true;
    }

    return false;
  }
}

module.exports = new AutoDispatchService();
