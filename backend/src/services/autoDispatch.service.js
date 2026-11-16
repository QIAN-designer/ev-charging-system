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
      charging_window_start: settings.charging_window_start || '08:00',
      charging_window_end: settings.charging_window_end || '15:00',
      slot_duration_hours: parseFloat(settings.slot_duration_hours || '2'),
      auto_dispatch_enabled: settings.auto_dispatch_enabled !== 'false',
      auto_dispatch_frequency: settings.auto_dispatch_frequency || 'daily', // daily | weekly | monthly
      auto_dispatch_time: settings.auto_dispatch_time || '20:00',
      auto_dispatch_day_of_week: parseInt(settings.auto_dispatch_day_of_week || '1', 10), // 1=Lunes..7=Domingo
      auto_dispatch_day_of_month: parseInt(settings.auto_dispatch_day_of_month || '1', 10), // 1..31
      auto_dispatch_target_scope: settings.auto_dispatch_target_scope || 'tomorrow',
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
   * Genera y asigna automáticamente reservas para una fecha dada (por defecto hoy o mañana).
   * Algoritmo:
   * 1. Toma los alumnos ordenados por menos horas acumuladas.
   * 2. Obtiene los cargadores disponibles ('available').
   * 3. Itera las franjas horarias del día lectivo (ej: 08:00 a 15:00 en slots de 2h).
   * 4. Asigna plaza en cargador libre al alumno con menor carga que aún no tenga reserva ese día.
   */
  async generateAutoBookings(targetDateStr = null) {
    // Sincronizar expirados antes
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

    // Determinar la fecha objetivo (si no se especifica, hoy si son antes de las 13:00, o mañana)
    let target = targetDateStr ? new Date(targetDateStr) : new Date();
    if (isNaN(target.getTime())) target = new Date();

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

    // Configuración de franjas horarias
    const [startH, startM] = settings.charging_window_start.split(':').map(Number);
    const [endH, endM] = settings.charging_window_end.split(':').map(Number);

    // Regla de intervalos:
    // Todos los días: 3h por intervalo.
    // Miércoles: primer intervalo de 2h, y los siguientes de 3h.
    const isWednesday = target.getDay() === 3;

    // Generar las franjas horarias del día objetivo
    const timeSlots = [];
    let currentSlotStart = new Date(target);
    currentSlotStart.setHours(startH, startM, 0, 0);

    const dayEndLimit = new Date(target);
    dayEndLimit.setHours(endH, endM, 0, 0);

    const now = new Date();
    let slotIndex = 0;

    while (currentSlotStart < dayEndLimit) {
      // Si es miércoles y es el primer slot del día -> 2 horas; de lo contrario -> 3 horas
      const currentSlotDurationHours = (isWednesday && slotIndex === 0) ? 2 : 3;

      const slotEnd = new Date(currentSlotStart.getTime() + currentSlotDurationHours * 3600 * 1000);
      if (slotEnd > dayEndLimit) break;

      // Solo franjas futuras
      if (currentSlotStart > now) {
        timeSlots.push({
          start: new Date(currentSlotStart),
          end: new Date(slotEnd),
          durationHours: currentSlotDurationHours
        });
      }
      currentSlotStart = new Date(slotEnd);
      slotIndex++;
    }

    if (timeSlots.length === 0) {
      return {
        success: false,
        message: 'No quedan franjas horarias disponibles para la fecha seleccionada.',
        createdBookings: []
      };
    }

    // Consultar reservas ya existentes ese día para no duplicar ni solapar
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

    const createdBookings = [];

    // Priorizar alumnos con menos horas
    for (const student of priority_ranking) {
      if (studentsWithBookingToday.has(student.id)) {
        continue; // Un slot por alumno al día
      }

      // Buscar el primer cargador y slot disponible
      let assigned = false;
      for (const slot of timeSlots) {
        for (const charger of chargers) {
          // Verificar si el cargador está ocupado en esta franja
          const isOccupied = existing.some(b => 
            b.charger_id === charger.id &&
            new Date(b.start_time) < slot.end &&
            new Date(b.end_time) > slot.start
          );

          if (!isOccupied) {
            // Asignar reserva
            const insertRes = await db.query(
              `INSERT INTO bookings (user_id, charger_id, start_time, end_time, status)
               VALUES ($1, $2, $3, $4, 'active')
               RETURNING id, user_id, charger_id, start_time, end_time, status`,
              [student.id, charger.id, slot.start.toISOString(), slot.end.toISOString()]
            );

            const newBooking = insertRes.rows[0];
            existing.push(newBooking);
            studentsWithBookingToday.add(student.id);

            createdBookings.push({
              id: newBooking.id,
              user_id: student.id,
              user_name: student.name,
              vehicle_plate: student.vehicle_plate,
              charger_name: charger.name,
              start_time: newBooking.start_time,
              end_time: newBooking.end_time,
              accumulated_hours: student.total_hours_charged
            });

            assigned = true;
            break;
          }
        }
        if (assigned) break;
      }
    }

    // Registrar timestamp de última ejecución
    await db.query(
      `INSERT INTO system_settings (key, value, updated_at)
       VALUES ('auto_dispatch_last_run', $1, CURRENT_TIMESTAMP)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
      [new Date().toISOString()]
    );

    return {
      success: true,
      message: createdBookings.length > 0 
        ? `Se han generado ${createdBookings.length} reserva(s) automáticas con éxito según prioridad de carga.`
        : 'Todos los alumnos con prioridad ya tienen asignación o los cargadores están al completo para esta jornada.',
      createdBookings,
      targetDate: target.toISOString().split('T')[0]
    };
  }

  /**
   * Verifica periódicamente si ha llegado el momento programado (diario, semanal o mensual).
   */
  async checkAndRunScheduledDispatch() {
    const settings = await this.getSettings();
    if (!settings.auto_dispatch_enabled) return false;

    const now = new Date();
    const frequency = settings.auto_dispatch_frequency || 'daily';

    // 1. Comprobación según frecuencia (diaria, semanal, mensual)
    if (frequency === 'daily') {
      // Días lectivos activos (1=Lunes..5=Viernes)
      const currentDayOfWeek = now.getDay();
      const activeDays = (settings.auto_dispatch_days || '1,2,3,4,5')
        .split(',')
        .map(d => parseInt(d.trim(), 10))
        .filter(n => !isNaN(n));

      if (!activeDays.includes(currentDayOfWeek)) {
        return false;
      }
    } else if (frequency === 'weekly') {
      // Día específico de la semana (1=Lunes..7=Domingo; getDay() 0=Dom, 1=Lun..6=Sab)
      const currentIsoDay = now.getDay() === 0 ? 7 : now.getDay();
      if (currentIsoDay !== settings.auto_dispatch_day_of_week) {
        return false;
      }
    } else if (frequency === 'monthly') {
      // Día específico del mes (1..31)
      const currentDayOfMonth = now.getDate();
      if (currentDayOfMonth !== settings.auto_dispatch_day_of_month) {
        return false;
      }
    }

    // 2. Comprobar la hora programada (ej: "20:00")
    const [schedH, schedM] = (settings.auto_dispatch_time || '20:00').split(':').map(Number);
    const nowH = now.getHours();
    const nowM = now.getMinutes();

    // 3. Comprobar si ya se ejecutó en este periodo
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
        // Misma semana (diferencia < 6 días)
        const diffDays = Math.floor((now.getTime() - lastRun.getTime()) / (1000 * 3600 * 24));
        if (diffDays < 6) return false;
      } else if (frequency === 'monthly') {
        // Mismo mes y año
        if (lastRun.getFullYear() === now.getFullYear() && lastRun.getMonth() === now.getMonth()) {
          return false;
        }
      }
    }

    // 4. Si la hora actual es igual o posterior a la programada
    if (nowH > schedH || (nowH === schedH && nowM >= schedM)) {
      console.log(`[AutoDispatch] Ejecutando reparto programado (${frequency}) a las ${schedH.toString().padStart(2, '0')}:${schedM.toString().padStart(2, '0')}...`);
      
      let targetDate = new Date();
      if (settings.auto_dispatch_target_scope === 'tomorrow') {
        targetDate.setDate(targetDate.getDate() + 1);
      }
      
      const targetStr = targetDate.toISOString().split('T')[0];
      const result = await this.generateAutoBookings(targetStr);
      console.log(`[AutoDispatch] Reparto (${frequency}) completado: ${result.message}`);
      return true;
    }

    return false;
  }
}

module.exports = new AutoDispatchService();
