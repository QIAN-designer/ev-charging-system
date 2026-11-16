const db = require('../config/db');

const DAY_ORDER = {
  'lunes': 1,
  'martes': 2,
  'miércoles': 3,
  'miercoles': 3,
  'jueves': 4,
  'viernes': 5,
  'sábado': 6,
  'sabado': 6,
  'domingo': 7
};

class ScheduleService {
  /**
   * Decodifica entidades XML comunes
   */
  decodeXmlEntities(str) {
    if (!str) return '';
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'");
  }

  /**
   * Extrae un mapa de atributos clave="valor" desde una etiqueta XML
   */
  parseXmlAttributes(attrString) {
    const attrs = {};
    const attrRegex = /([a-zA-Z0-9_:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let match;
    while ((match = attrRegex.exec(attrString)) !== null) {
      const key = match[1];
      const val = match[2] !== undefined ? match[2] : match[3];
      attrs[key] = this.decodeXmlEntities(val);
    }
    return attrs;
  }

  /**
   * Parsea un documento XML con la estructura <horario><dia nombre="..."><clase .../></dia></horario>
   */
  parseXmlSchedule(xmlContent) {
    if (!xmlContent || typeof xmlContent !== 'string') {
      const error = new Error('El contenido XML está vacío o no es válido');
      error.status = 400;
      throw error;
    }

    // Eliminar comentarios XML
    const cleanXml = xmlContent.replace(/<!--[\s\S]*?-->/g, '');

    if (!/<horario[\s>]/i.test(cleanXml)) {
      const error = new Error('El archivo XML no contiene la etiqueta raíz <horario>');
      error.status = 400;
      throw error;
    }

    const entries = [];
    const diaRegex = /<dia\b([^>]*)>([\s\S]*?)<\/dia>/gi;
    let diaMatch;

    while ((diaMatch = diaRegex.exec(cleanXml)) !== null) {
      const diaAttrs = this.parseXmlAttributes(diaMatch[1]);
      const dayName = (diaAttrs.nombre || diaAttrs.name || '').trim();
      if (!dayName) continue;

      const diaBody = diaMatch[2];
      const claseRegex = /<clase\b([^>]*?)\/?>/gi;
      let claseMatch;

      while ((claseMatch = claseRegex.exec(diaBody)) !== null) {
        const claseAttrs = this.parseXmlAttributes(claseMatch[1]);
        const startTime = (claseAttrs.inicio || claseAttrs.start_time || '').trim();
        const endTime = (claseAttrs.fin || claseAttrs.end_time || '').trim();
        const moduleName = (claseAttrs.modulo || claseAttrs.module_name || '').trim();
        const cfs = (claseAttrs.cfs ?? '2').toString().trim();
        const destacadoRaw = (claseAttrs.destacado ?? claseAttrs.highlighted ?? 'false').toString().toLowerCase().trim();
        const highlighted = destacadoRaw === 'true' || destacadoRaw === '1' || destacadoRaw === 'si' || destacadoRaw === 'sí';

        if (!startTime || !endTime || !moduleName) {
          continue;
        }

        entries.push({
          day_name: dayName,
          start_time: startTime,
          end_time: endTime,
          module_name: moduleName,
          cfs,
          highlighted
        });
      }
    }

    if (entries.length === 0) {
      const error = new Error('No se encontraron clases válidas en el XML proporcionado');
      error.status = 400;
      throw error;
    }

    return entries;
  }

  /**
   * Parsea un documento JSON en cualquiera de las variantes habituales de horario
   */
  parseJsonSchedule(jsonInput) {
    let data = jsonInput;
    if (typeof jsonInput === 'string') {
      try {
        data = JSON.parse(jsonInput);
      } catch (err) {
        const error = new Error('El archivo JSON tiene un formato de sintaxis inválido');
        error.status = 400;
        throw error;
      }
    }

    if (!data || typeof data !== 'object') {
      const error = new Error('El contenido JSON no contiene una estructura de horario válida');
      error.status = 400;
      throw error;
    }

    const entries = [];

    const normalizeClassItem = (dayName, item) => {
      if (!item || typeof item !== 'object') return;
      const dName = (dayName || item.dia || item.day_name || item.day || '').toString().trim();
      const startTime = (item.inicio || item.start_time || item.hora_inicio || '').toString().trim();
      const endTime = (item.fin || item.end_time || item.hora_fin || '').toString().trim();
      const moduleName = (item.modulo || item.module_name || item.module || item.asignatura || '').toString().trim();
      const cfs = (item.cfs ?? '2').toString().trim();
      const rawDestacado = item.destacado ?? item.highlighted ?? false;
      const highlighted =
        rawDestacado === true ||
        String(rawDestacado).toLowerCase() === 'true' ||
        String(rawDestacado) === '1';

      if (dName && startTime && endTime && moduleName) {
        entries.push({
          day_name: dName,
          start_time: startTime,
          end_time: endTime,
          module_name: moduleName,
          cfs,
          highlighted
        });
      }
    };

    const processDaysArray = (daysArray) => {
      for (const dayObj of daysArray) {
        if (!dayObj || typeof dayObj !== 'object') continue;
        const dayName = dayObj.nombre || dayObj.dia || dayObj.day_name || dayObj.name;
        const classesList = dayObj.clases || dayObj.clase || dayObj.classes;

        if (Array.isArray(classesList)) {
          classesList.forEach(c => normalizeClassItem(dayName, c));
        } else if (classesList && typeof classesList === 'object') {
          normalizeClassItem(dayName, classesList);
        } else {
          // Caso de array plano de clases donde cada elemento ya tiene día, inicio, fin, modulo
          normalizeClassItem(dayName, dayObj);
        }
      }
    };

    const root = data.horario || data;

    if (Array.isArray(root)) {
      processDaysArray(root);
    } else if (Array.isArray(root.dias)) {
      processDaysArray(root.dias);
    } else if (Array.isArray(root.dia)) {
      processDaysArray(root.dia);
    } else if (Array.isArray(root.clases)) {
      processDaysArray(root.clases);
    } else if (typeof root === 'object') {
      // Soportar mapa por nombre de día: { "Lunes": [ ... ], "Martes": [ ... ] }
      for (const [key, value] of Object.entries(root)) {
        if (Array.isArray(value)) {
          value.forEach(c => normalizeClassItem(key, c));
        }
      }
    }

    if (entries.length === 0) {
      const error = new Error('No se encontraron clases válidas en el archivo JSON proporcionado');
      error.status = 400;
      throw error;
    }

    return entries;
  }

  /**
   * Importa un horario con nombre en la base de datos dentro de una transacción
   */
  async importSchedule({ scheduleName, format, content, replaceExisting = true }) {
    const cleanScheduleName = (scheduleName || 'Horario General').toString().trim() || 'Horario General';
    const normalizedFormat = (format || '').toLowerCase().trim();
    let entries = [];

    if (normalizedFormat === 'xml') {
      entries = this.parseXmlSchedule(content);
    } else if (normalizedFormat === 'json') {
      entries = this.parseJsonSchedule(content);
    } else {
      // Autodetección si no se especifica formato claro
      const trimmed = typeof content === 'string' ? content.trim() : '';
      if (trimmed.startsWith('<')) {
        entries = this.parseXmlSchedule(trimmed);
      } else {
        entries = this.parseJsonSchedule(content);
      }
    }

    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');

      if (replaceExisting) {
        // Reemplazar únicamente el horario que tenga el mismo nombre (permitiendo varios horarios distintos)
        await client.query('DELETE FROM class_schedules WHERE schedule_name = $1', [cleanScheduleName]);
      }

      const inserted = [];
      for (const item of entries) {
        const res = await client.query(
          `INSERT INTO class_schedules (schedule_name, day_name, start_time, end_time, module_name, cfs, highlighted)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, schedule_name, day_name, start_time, end_time, module_name, cfs, highlighted, created_at`,
          [cleanScheduleName, item.day_name, item.start_time, item.end_time, item.module_name, item.cfs, item.highlighted]
        );
        inserted.push(res.rows[0]);
      }

      await client.query('COMMIT');
      return inserted;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Obtiene todas las clases del horario ordenadas por nombre de horario, día de la semana y hora de inicio
   */
  async getAllSchedules() {
    const result = await db.query(
      'SELECT id, schedule_name, day_name, start_time, end_time, module_name, cfs, highlighted, created_at FROM class_schedules ORDER BY schedule_name ASC, start_time ASC, id ASC'
    );

    const rows = result.rows;
    rows.sort((a, b) => {
      const nameCompare = (a.schedule_name || '').localeCompare(b.schedule_name || '');
      if (nameCompare !== 0) return nameCompare;
      const orderA = DAY_ORDER[(a.day_name || '').toLowerCase()] || 99;
      const orderB = DAY_ORDER[(b.day_name || '').toLowerCase()] || 99;
      if (orderA !== orderB) return orderA - orderB;
      return (a.start_time || '').localeCompare(b.start_time || '');
    });

    return rows;
  }

  /**
   * Obtiene la lista única de nombres de horarios/clases disponibles (ej: "2º DAW", "1º ASIR")
   */
  async getDistinctClassNames() {
    const res = await db.query(
      'SELECT DISTINCT schedule_name FROM class_schedules WHERE schedule_name IS NOT NULL AND TRIM(schedule_name) <> \'\' ORDER BY schedule_name ASC'
    );
    return res.rows.map(r => r.schedule_name);
  }

  /**
   * Elimina todos los horarios registrados o solo un horario por su nombre
   */
  async clearSchedules(scheduleName = null) {
    if (scheduleName && scheduleName.trim()) {
      await db.query('DELETE FROM class_schedules WHERE schedule_name = $1', [scheduleName.trim()]);
    } else {
      await db.query('DELETE FROM class_schedules');
    }
    return { deleted: true };
  }
}

module.exports = new ScheduleService();
