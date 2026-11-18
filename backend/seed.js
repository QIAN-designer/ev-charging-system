const argon2 = require('argon2');
const db = require('./src/config/db');

async function seed() {
  console.log('🌱 Iniciando seed de usuarios de prueba (Alumnos GVA)...');

  const defaultPassword = await argon2.hash('123456');

  const classes = ['Horario 2º DAW', '1º Comercia Internacional'];

  const students = [
    {
      name: 'Lucía Navarro Gómez',
      email: 'lucnavgom@alu.edu.gva.es',
      vehicle_brand: 'Renault',
      vehicle_model: 'Zoe',
      vehicle_plate: '2411-LMN',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'Alejandro Martínez Soler',
      email: 'alemarsol@alu.edu.gva.es',
      vehicle_brand: 'Peugeot',
      vehicle_model: 'e-208',
      vehicle_plate: '5890-KLR',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'Marta Vidal Ferrando',
      email: 'marvidfer@alu.edu.gva.es',
      vehicle_brand: 'Tesla',
      vehicle_model: 'Model 3',
      vehicle_plate: '3314-MPX',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'Javier Pons Benítez',
      email: 'javponben@alu.edu.gva.es',
      vehicle_brand: 'Hyundai',
      vehicle_model: 'Kona EV',
      vehicle_plate: '8741-KJH',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'Sara Giménez Ortiz',
      email: 'sargimort@alu.edu.gva.es',
      vehicle_brand: 'MG',
      vehicle_model: 'MG4 Electric',
      vehicle_plate: '1299-NBL',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'David Serrano Roca',
      email: 'davserroc@alu.edu.gva.es',
      vehicle_brand: 'Cupra',
      vehicle_model: 'Born',
      vehicle_plate: '6402-MDF',
      class_name: '1º Comercia Internacional'
    },
    {
      name: 'Elena Moreno Campos',
      email: 'elemorcam@alu.edu.gva.es',
      vehicle_brand: 'Nissan',
      vehicle_model: 'Leaf',
      vehicle_plate: '4581-KVC',
      class_name: '1º Comercia Internacional'
    },
    {
      name: 'Marcos Gil Alcaraz',
      email: 'margilalc@alu.edu.gva.es',
      vehicle_brand: 'Fiat',
      vehicle_model: '500e',
      vehicle_plate: '9034-LKP',
      class_name: '1º Comercia Internacional'
    },
    {
      name: 'Clara Doménech Bosch',
      email: 'cladombos@alu.edu.gva.es',
      vehicle_brand: 'Kia',
      vehicle_model: 'e-Niro',
      vehicle_plate: '7125-MTR',
      class_name: '1º Comercia Internacional'
    },
    {
      name: 'Rubén Castillo Sanz',
      email: 'rubcassanz@alu.edu.gva.es',
      vehicle_brand: 'Volkswagen',
      vehicle_model: 'ID.3',
      vehicle_plate: '8210-LXW',
      class_name: '1º Comercia Internacional'
    },
    {
      name: 'Paula Beltrán Molina',
      email: 'paubelmol@alu.edu.gva.es',
      vehicle_brand: 'BYD',
      vehicle_model: 'Atto 3',
      vehicle_plate: '5019-NKR',
      class_name: 'Horario 2º DAW'
    },
    {
      name: 'Adrián Rius Serra',
      email: 'adrriuser@alu.edu.gva.es',
      vehicle_brand: 'Opel',
      vehicle_model: 'Corsa-e',
      vehicle_plate: '3724-LDT',
      class_name: '1º Comercia Internacional'
    }
  ];

  let insertedCount = 0;
  let updatedCount = 0;

  for (const s of students) {
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [s.email]);

    if (existing.rows.length === 0) {
      await db.query(
        `INSERT INTO users (name, email, password, role, vehicle_plate, vehicle_brand, vehicle_model, class_name)
         VALUES ($1, $2, $3, 'alumno', $4, $5, $6, $7)`,
        [s.name, s.email, defaultPassword, s.vehicle_plate, s.vehicle_brand, s.vehicle_model, s.class_name]
      );
      insertedCount++;
    } else {
      await db.query(
        `UPDATE users 
         SET name = $1, vehicle_plate = $2, vehicle_brand = $3, vehicle_model = $4, class_name = $5, role = 'alumno'
         WHERE id = $6`,
        [s.name, s.vehicle_plate, s.vehicle_brand, s.vehicle_model, s.class_name, existing.rows[0].id]
      );
      updatedCount++;
    }
  }

  console.log(`✅ Seed completado con éxito:`);
  console.log(`   - ${insertedCount} alumnos nuevos creados.`);
  console.log(`   - ${updatedCount} alumnos actualizados con vehículo y clase.`);
  console.log(`   - Contraseña común para todos: 123456`);
  console.log(`   - Correos institucionales: *@alu.edu.gva.es`);

  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Error en el seed:', err);
  process.exit(1);
});
