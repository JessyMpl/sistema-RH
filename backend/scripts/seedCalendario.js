// backend/scripts/seedCalendario.js
const prisma = require('../config/db');

// Función para calcular la semana ISO del año
function getISOWeek(date) {
  const tempDate = new Date(date.valueOf());
  const dayNum = (date.getDay() + 6) % 7;
  tempDate.setDate(tempDate.getDate() - dayNum + 3);
  const firstThursday = tempDate.valueOf();
  tempDate.setMonth(0, 1);
  if (tempDate.getDay() !== 4) {
    tempDate.setMonth(0, 1 + ((4 - tempDate.getDay() + 7) % 7));
  }
  return 1 + Math.ceil((firstThursday - tempDate) / 604800000);
}

async function main() {
  console.log("🌱 Iniciando la generación del catálogo de calendario...");

  // Definir el rango: 2020 a 2040 (21 años, cubriendo 15 años a futuro desde el actual 2026)
  const fechaInicio = new Date("2020-01-01T12:00:00Z");
  const fechaFin = new Date("2040-12-31T12:00:00Z");

  const datosAInsertar = [];
  const fechaActual = new Date(fechaInicio);

  while (fechaActual <= fechaFin) {
    const anio = fechaActual.getUTCFullYear();
    const mes = fechaActual.getUTCMonth() + 1; // 1-12
    const dia = fechaActual.getUTCDate();
    const diaSemanaRaw = fechaActual.getUTCDay(); // 0 = Domingo, 1 = Lunes...
    const diaSemana = diaSemanaRaw === 0 ? 7 : diaSemanaRaw; // 1 = Lunes, 7 = Domingo

    // Calcular semana del año usando la lógica ISO
    const semana = getISOWeek(fechaActual);

    // Calcular quincena
    const quincena = dia <= 15 ? 1 : 2;

    // Calcular si es día laboral (Lunes a Viernes)
    const esLaboral = diaSemana !== 6 && diaSemana !== 7;

    // Crear la fecha sin horas para guardarla limpia en formato DATE de Postgres
    const fechaLimpia = new Date(Date.UTC(anio, mes - 1, dia));

    datosAInsertar.push({
      fecha: fechaLimpia,
      anio,
      mes,
      dia,
      semana,
      diaSemana,
      quincena,
      esLaboral
    });

    // Avanzar un día
    fechaActual.setUTCDate(fechaActual.getUTCDate() + 1);
  }

  console.log(`📅 Se generaron ${datosAInsertar.length} días para insertar.`);

  // Limpiar catálogo previo para evitar conflictos
  console.log("🧹 Limpiando registros existentes en la tabla calendario...");
  await prisma.calendario.deleteMany({});

  // Insertar en lotes de 1000 para optimizar rendimiento de red y base de datos
  const TAMANO_LOTE = 1000;
  let insertados = 0;

  for (let i = 0; i < datosAInsertar.length; i += TAMANO_LOTE) {
    const lote = datosAInsertar.slice(i, i + TAMANO_LOTE);
    await prisma.calendario.createMany({
      data: lote,
      skipDuplicates: true
    });
    insertados += lote.length;
    console.log(`✅ Lote insertado: ${insertados} / ${datosAInsertar.length} días.`);
  }

  console.log("🏁 ¡Se ha poblado la tabla de calendario exitosamente!");
}

main()
  .catch((e) => {
    console.error("❌ Error en el proceso de seed de calendario:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
