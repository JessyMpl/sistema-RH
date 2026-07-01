const prisma = require('../config/db');

async function main() {
  const records = await prisma.attendanceRecord.findMany();
  console.log(`Encontrados ${records.length} registros en total.`);
  let updatedCount = 0;

  for (const record of records) {
    const ts = record.timestamp;
    
    // Si contiene la zona horaria '+00' o la 'Z' o está en UTC
    if (ts.includes('+00') || ts.includes('Z')) {
      const date = new Date(ts);
      if (!isNaN(date.getTime())) {
        // Restar las 6 horas de desfase del huso horario de México
        const localDate = new Date(date.getTime() - (6 * 60 * 60 * 1000));
        const yyyy = localDate.getUTCFullYear();
        const mm = String(localDate.getUTCMonth() + 1).padStart(2, '0');
        const dd = String(localDate.getUTCDate()).padStart(2, '0');
        const hh = String(localDate.getUTCHours()).padStart(2, '0');
        const min = String(localDate.getUTCMinutes()).padStart(2, '0');
        const ss = String(localDate.getUTCSeconds()).padStart(2, '0');
        
        const newTimestamp = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;
        
        await prisma.attendanceRecord.update({
          where: { id: record.id },
          data: { timestamp: newTimestamp }
        });
        
        console.log(`Fijando ID ${record.id}: "${ts}" -> "${newTimestamp}"`);
        updatedCount++;
      }
    } else if (ts.includes('T')) {
      // Si solo tiene la 'T', la reemplazamos por un espacio para normalizar
      const newTimestamp = ts.replace('T', ' ');
      await prisma.attendanceRecord.update({
        where: { id: record.id },
        data: { timestamp: newTimestamp }
      });
      console.log(`Normalizando ID ${record.id}: "${ts}" -> "${newTimestamp}"`);
      updatedCount++;
    }
  }

  console.log(`Proceso de limpieza completado. Se actualizaron ${updatedCount} registros.`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
