const express = require('express');
const router = express.Router();
const prisma = require('../config/db');

// 1. LEER (Obtener todas las áreas activas)
router.get('/areas', async (req, res) => {
  try {
    const areas = await prisma.areaAdscripcion.findMany({
      where: { activo: true },
      orderBy: { nombre: 'asc' }
    });
    res.json(areas);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar las áreas.' });
  }
});

// 2. CREAR (Registrar una nueva área)
router.post('/areas', async (req, res) => {
  try {
    const { nombre } = req.body;
    
    // Verificamos si ya existe (para evitar errores por el @unique)
    const existe = await prisma.areaAdscripcion.findFirst({
      where: { nombre: nombre.trim().toUpperCase() }
    });

    if (existe) {
      if (!existe.activo) {
        // Si existe pero estaba dada de baja, la revivimos
        const areaRevivida = await prisma.areaAdscripcion.update({
          where: { id: existe.id },
          data: { activo: true }
        });
        return res.json({ mensaje: 'Área reactivada', area: areaRevivida });
      }
      return res.status(400).json({ error: 'El área ya existe actualmente.' });
    }

    const nuevaArea = await prisma.areaAdscripcion.create({
      data: { nombre: nombre.trim().toUpperCase() }
    });
    res.json({ mensaje: 'Área registrada', area: nuevaArea });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el área.' });
  }
});

// 3. ACTUALIZAR (Editar nombre del área)
router.put('/areas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { nombre } = req.body;
    
    const areaActualizada = await prisma.areaAdscripcion.update({
      where: { id: parseInt(id) },
      data: { nombre: nombre.trim().toUpperCase() }
    });
    res.json({ mensaje: 'Área actualizada', area: areaActualizada });
  } catch (error) {
    res.status(500).json({ error: 'Error al editar el área. Puede que el nombre ya esté en uso.' });
  }
});

// 4. ELIMINAR (Baja lógica)
router.delete('/areas/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.areaAdscripcion.update({
      where: { id: parseInt(id) },
      data: { activo: false } // Baja lógica
    });
    res.json({ mensaje: 'Área eliminada correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el área.' });
  }
});

module.exports = router;