const prisma = require('../config/db');

async function main() {
  const records = await prisma.attendanceRecord.findMany({
    orderBy: { id: 'desc' },
    take: 5
  });
  console.log("LAST 5 RECORDS:");
  console.log(JSON.stringify(records, (key, val) => typeof val === 'bigint' ? val.toString() : val, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
