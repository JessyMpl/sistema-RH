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

// ==============================================================================
// RUTAS PARA DÍAS INHÁBILES Y VACACIONES
// ==============================================================================

// 1. LEER
router.get('/dias-inhabiles', async (req, res) => {
  try {
    const dias = await prisma.diaInhabil.findMany({
      orderBy: { fecha: 'desc' }
    });
    res.json(dias);
  } catch (error) {
    res.status(500).json({ error: 'Error al cargar los días inhábiles.' });
  }
});

// 2. CREAR
router.post('/dias-inhabiles', async (req, res) => {
  try {
    const { fecha, tipo, descripcion } = req.body;
    
    // Convertimos el string YYYY-MM-DD a un objeto Date (T12:00:00Z evita problemas de zona horaria)
    const fechaObj = new Date(`${fecha}T12:00:00Z`);

    const existe = await prisma.diaInhabil.findUnique({
      where: { fecha: fechaObj }
    });

    if (existe) return res.status(400).json({ error: 'Ya existe un registro festivo o vacacional para esta fecha exacta.' });

    const nuevoDia = await prisma.diaInhabil.create({
      data: { 
        fecha: fechaObj, 
        tipo, 
        descripcion: descripcion.trim().toUpperCase() 
      }
    });
    res.json({ mensaje: 'Día inhábil registrado', dia: nuevoDia });
  } catch (error) {
    res.status(500).json({ error: 'Error al registrar el día inhábil.' });
  }
});

// 3. ELIMINAR (Borrado físico)
router.delete('/dias-inhabiles/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.diaInhabil.delete({
      where: { id: parseInt(id) }
    });
    res.json({ mensaje: 'Día inhábil eliminado correctamente.' });
  } catch (error) {
    res.status(500).json({ error: 'Error al eliminar el registro.' });
  }
});

module.exports = router;