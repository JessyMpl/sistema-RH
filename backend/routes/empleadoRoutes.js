const express = require('express');
const router = express.Router();
const prisma = require('../database'); 

// Obtener catálogo
router.get('/', async (req, res) => {
  try {
    const empleados = await prisma.servidorPublico.findMany({
      orderBy: { nombreCompleto: 'asc' }
    });
    res.json(empleados);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar empleados.' });
  }
});

// Alta manual
router.post('/', async (req, res) => {
  const { numeroEmpleado, nombreCompleto, departamento, regimen } = req.body;
  try {
    const nuevo = await prisma.servidorPublico.create({
      // Forzamos el horarioId en 1 por ahora, asumiendo que ya creaste un horario en Prisma Studio
      data: { numeroEmpleado, nombreCompleto, departamento, regimen, horarioId: 1 } 
    });
    res.json(nuevo);
  } catch (error) {
    res.status(400).json({ error: 'Error al registrar. Verifica que el ID no esté duplicado.' });
  }
});

module.exports = router;