<script setup>
import { ref, computed, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// Control de Pestañas
const pestanaActiva = ref('pendientes');

// Estados de datos
const listaPendientes = ref([]);
const listaHistorial = ref([]);
const areasAdscripcion = ref([]); 
const cargando = ref(false);
const valorBusquedaPendientes = ref('');
const valorBusquedaHistorial = ref('');

// Variables del Formulario de Registro Individual / Rango
const empleadoSeleccionado = ref(null);
const formulario = ref({
  fechaInicio: '',
  fechaFin: '',
  cobertura: '',
  tipoIncidencia: '',
  folio: '',
  observaciones: ''
});

// Variables del Formulario de Registro MASIVO
const filtroMasivo = ref({
  fecha: '',
  tipoAlerta: '',
  area: 'TODAS' 
});
const registrosSeleccionados = ref([]); 
const mostrarModalMasivo = ref(false); 
const formularioMasivo = ref({
  cobertura: '',
  tipoIncidencia: '',
  folio: '',
  observaciones: ''
});

// Catálogo oficial de incidencias
const catalogoIncidencias = [
  "1. Falta de puntualidad a la entrada", "2. Falta de asistencia", "3. Días económicos",
  "4. Comisión de Servicios", "5. Consulta médica", "6. Permiso por lactancia (9 meses)",
  "7. Robo, extravío o deterioro de Gafete-Credencial", "8. Falla eléctrica del reloj o lector óptico",
  "9. Enfermedad no profesional", "10. Riesgo profesional", "11. Licencia por matrimonio",
  "12. Licencia por nacimiento o adopción de hijo", "13. Licencia por examen profesional",
  "14. Licencia por fallecimiento de familiar", "15. Licencia por Enfermedad familiar",
  "16. Comisión sindical", "17. Salida antes con autorización", "18. Otros"
];

const tiposAlerta = [
  { valor: 'ENTRADA', texto: 'Solo Entrada (Retardos y Omisiones)' },
  { valor: 'SALIDA', texto: 'Solo Salida (Omisiones de Salida)' },
  { valor: 'COMPLETO', texto: 'Día Completo (Faltas)' }
];

const headersPendientes = [
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "ÁREA", value: "servidor.departamento", sortable: true }, 
  { text: "FECHA", value: "fecha", sortable: true },
  { text: "ENTRADA", value: "entrada" },
  { text: "SALIDA", value: "salida" },
  { text: "ALERTA", value: "incidencia", sortable: true },
  { text: "ACCIONES", value: "acciones" }
];

const headersMasivos = [
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "ÁREA", value: "servidor.departamento", sortable: true },
  { text: "ALERTA", value: "incidencia", sortable: true }
];

const headersHistorial = [
  { text: "FECHA INCIDENCIA", value: "fechaIncidencia", sortable: true },
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true, align: 'center' },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "ALCANCE", value: "cobertura", sortable: true },
  { text: "FOLIO FORMATO", value: "folio", sortable: true },
  { text: "MOTIVO JUSTIFICACIÓN", value: "motivo", sortable: true },
  { text: "FECHA CAPTURA", value: "fechaRegistro", sortable: true }
];

const fechasDisponibles = computed(() => {
  const fechas = listaPendientes.value.map(item => formatearFecha(item.fecha));
  return [...new Set(fechas)].sort((a, b) => new Date(b) - new Date(a));
});

const registrosAfectados = computed(() => {
  if (!filtroMasivo.value.fecha || !filtroMasivo.value.tipoAlerta) return [];
  
  let incidenciasValidas = [];
  if (filtroMasivo.value.tipoAlerta === 'ENTRADA') {
    incidenciasValidas = ['RETARDO', 'RETARDO_ESPECIAL', 'OMISION_E', 'RETARDO_Y_OMISION'];
  } else if (filtroMasivo.value.tipoAlerta === 'SALIDA') {
    incidenciasValidas = ['OMISION_S'];
  } else if (filtroMasivo.value.tipoAlerta === 'COMPLETO') {
    incidenciasValidas = ['FALTA'];
  }

  return listaPendientes.value.filter(item => {
    const coincideFecha = formatearFecha(item.fecha) === filtroMasivo.value.fecha;
    const coincideAlerta = incidenciasValidas.includes(item.incidencia);
    const coincideArea = filtroMasivo.value.area === 'TODAS' || item.servidor.departamento === filtroMasivo.value.area;
    
    return coincideFecha && coincideAlerta && coincideArea;
  });
});

import { watch } from 'vue';
watch([() => filtroMasivo.value.fecha, () => filtroMasivo.value.tipoAlerta, () => filtroMasivo.value.area], () => {
  registrosSeleccionados.value = []; 
});

const obtenerSiglasJustificacion = (motivo) => {
  if (motivo.includes("Comisión de Servicios") || motivo.includes("Comisión sindical")) return "CS";
  if (motivo.includes("médica") || motivo.includes("Enfermedad") || motivo.includes("Riesgo") || motivo.includes("lactancia")) return "IN";
  if (motivo.includes("Días económicos")) return "DE";
  if (motivo.includes("Licencia") || motivo.includes("matrimonio") || motivo.includes("nacimiento") || motivo.includes("fallecimiento") || motivo.includes("examen")) return "LI";
  return "JU"; 
};

const formatearFecha = (fechaInput) => {
  if (!fechaInput) return '';
  const d = new Date(fechaInput);
  return d.toISOString().split('T')[0];
};

const cargarPendientes = async () => {
  cargando.value = true;
  try {
    const res = await fetch(apiUrl('/api/justificaciones/pendientes'));
    if (!res.ok) throw new Error('Error al consultar incidencias pendientes');
    listaPendientes.value = await res.json();
  } catch (error) {
    console.error(error);
    Swal.fire('Error', 'No se pudieron recuperar las incidencias de la base de datos.', 'error');
  } finally {
    cargando.value = false;
  }
};

const cargarHistorial = async () => {
  try {
    const res = await fetch(apiUrl('/api/justificaciones/historial'));
    if (!res.ok) throw new Error('Error al consultar historial');
    const data = await res.json();

    const agrupado = {};
    data.forEach(item => {
      const key = item.fechaRegistro; 
      if (!agrupado[key]) {
        agrupado[key] = { ...item, fechaIncidencia: item.asistencia?.fecha, count: 1 };
      } else {
        agrupado[key].count++; 
      }
    });

    listaHistorial.value = Object.values(agrupado).map(grupo => {
      if (grupo.count > 1) {
        return {
          ...grupo,
          servidor: { numeroEmpleado: 'MASIVO', nombreCompleto: `JUSTIFICACIÓN MASIVA EN LOTE (${grupo.count} EMPLEADOS)` }
        };
      }
      return grupo;
    });

    listaHistorial.value.sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro));
  } catch (error) {
    console.error(error);
  }
};

const cargarAreas = async () => {
  try {
    const res = await fetch(apiUrl('/api/empleados/areas')); 
    areasAdscripcion.value = await res.json();
  } catch (error) {
    console.error('Error cargando áreas de adscripción', error);
  }
};

// 🔥 MODIFICADO: Pre-llenamos fechaInicio y fechaFin con el día de la incidencia
const prepararJustificacion = (item) => {
  empleadoSeleccionado.value = item;
  const fechaDetectada = formatearFecha(item.fecha);

  formulario.value = { 
    fechaInicio: fechaDetectada,
    fechaFin: fechaDetectada,
    cobertura: '', 
    tipoIncidencia: '', 
    folio: '', 
    observaciones: '' 
  };
  pestanaActiva.value = 'registrar';
};

const cancelarRegistro = () => {
  empleadoSeleccionado.value = null;
  formulario.value = { fechaInicio: '', fechaFin: '', cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  formularioMasivo.value = { cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  registrosSeleccionados.value = [];
  mostrarModalMasivo.value = false;
  pestanaActiva.value = 'pendientes';
};

// 🔥 MODIFICADO: Envía rango de fechas al backend
const guardarJustificacion = async () => {
  if (!formulario.value.fechaInicio || !formulario.value.fechaFin || !formulario.value.cobertura || !formulario.value.tipoIncidencia) {
    Swal.fire('Atención', 'Selecciona el rango de fechas, alcance y motivo.', 'warning');
    return;
  }

  if (formulario.value.fechaInicio > formulario.value.fechaFin) {
    Swal.fire('Error de Rango', 'La fecha de inicio no puede ser mayor a la fecha de fin.', 'error');
    return;
  }

  const siglasOficiales = obtenerSiglasJustificacion(formulario.value.tipoIncidencia);
  const payload = {
    servidorId: empleadoSeleccionado.value.servidorId, 
    fechaInicio: formulario.value.fechaInicio,
    fechaFin: formulario.value.fechaFin,
    motivo: formulario.value.tipoIncidencia,
    cobertura: formulario.value.cobertura,
    folio: formulario.value.folio,
    observaciones: formulario.value.observaciones,
    siglas: siglasOficiales 
  };

  try {
    Swal.fire({ title: 'Procesando...', text: 'Validando rango de fechas y aplicando justificación...', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const respuesta = await fetch(apiUrl('/api/justificaciones/registrar-rango'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    const data = await respuesta.json();
    if (!respuesta.ok) throw new Error(data.error || 'Error al guardar');
    
    Swal.fire({ icon: 'success', title: '¡Justificación Aplicada!', text: data.mensaje, confirmButtonColor: '#902c3e' });
    await cargarPendientes();
    await cargarHistorial();
    cancelarRegistro();
  } catch (error) {
    Swal.fire('Error', error.message, 'error');
  }
};

const guardarJustificacionMasiva = async () => {
  if (!formularioMasivo.value.cobertura || !formularioMasivo.value.tipoIncidencia) {
    Swal.fire('Atención', 'Debes seleccionar el alcance y motivo del catálogo.', 'warning');
    return;
  }

  const siglasOficiales = obtenerSiglasJustificacion(formularioMasivo.value.tipoIncidencia);
  const asistenciasPayload = registrosSeleccionados.value.map(item => ({
    id: item.id,
    servidorId: item.servidorId
  }));

  const payload = {
    asistencias: asistenciasPayload,
    motivo: formularioMasivo.value.tipoIncidencia,
    cobertura: formularioMasivo.value.cobertura,
    folio: formularioMasivo.value.folio,
    observaciones: formularioMasivo.value.observaciones,
    siglas: siglasOficiales 
  };

  try {
    mostrarModalMasivo.value = false;
    Swal.fire({ title: 'Procesando...', text: 'Aplicando justificaciones masivas', allowOutsideClick: false, didOpen: () => Swal.showLoading() });

    const respuesta = await fetch(apiUrl('/api/justificaciones/registrar-masiva'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!respuesta.ok) throw new Error('Error al guardar masivamente');
    
    Swal.fire({ icon: 'success', title: '¡Proceso Completo!', text: `Se justificaron ${asistenciasPayload.length} registros con éxito.`, confirmButtonColor: '#902c3e' });
    await cargarPendientes();
    await cargarHistorial();
    cancelarRegistro();
  } catch (error) {
    Swal.fire('Error', error.message, 'error');
  }
};

const abrirModalAfectacion = () => {
  if (registrosSeleccionados.value.length === 0) {
    Swal.fire('Atención', 'Debes seleccionar al menos un registro de la tabla.', 'warning');
    return;
  }
  formularioMasivo.value = { cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  mostrarModalMasivo.value = true;
};

onMounted(() => {
  cargarPendientes();
  cargarHistorial();
  cargarAreas(); 
});
</script>

<template>
  <div class="space-y-6">
    
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2 overflow-x-auto">
      <button @click="pestanaActiva = 'pendientes'" 
        :class="['whitespace-nowrap px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'pendientes' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-inbox mr-2"></i> Bandeja Pendientes
      </button>
      
      <button @click="pestanaActiva = 'registrar'" 
        :class="['whitespace-nowrap px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'registrar' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-user-check mr-2"></i> Individual / Rango
      </button>

      <button @click="pestanaActiva = 'masiva'" 
        :class="['whitespace-nowrap px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'masiva' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-users-gear mr-2"></i> Justificación Masiva
      </button>
      
      <button @click="pestanaActiva = 'historial'" 
        :class="['whitespace-nowrap px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'historial' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-clock-rotate-left mr-2"></i> Historial
      </button>
    </div>

    <!-- BANDEJA DE PENDIENTES -->
    <div v-if="pestanaActiva === 'pendientes'" class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-4 space-y-4">
      <div class="flex justify-between items-center bg-gray-50 p-3 rounded border border-gray-200">
        <div class="w-full max-w-md">
          <input v-model="valorBusquedaPendientes" type="text" placeholder="Buscar por nombre o número de empleado..." class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm" />
        </div>
        <button @click="cargarPendientes" class="text-inst-primario hover:text-inst-secundario font-bold text-sm transition">
          <i class="fa-solid fa-rotate-right mr-1"></i> Actualizar Bandeja
        </button>
      </div>

      <EasyDataTable
        :headers="headersPendientes"
        :items="listaPendientes"
        :search-value="valorBusquedaPendientes"
        :search-field="['servidor.numeroEmpleado', 'servidor.nombreCompleto']"
        :rows-per-page="15"
        :loading="cargando"
        buttons-pagination
        table-class-name="img-strattia-style"
      >
        <template #item-fecha="item">
          <span class="tabular-nums">{{ formatearFecha(item.fecha) }}</span>
        </template>
        <template #item-entrada="item">
          <span :class="!item.entrada || item.entrada === 'SR' ? 'text-gray-500 font-bold' : 'text-gray-800 font-medium'">
            {{ item.entrada || 'SR' }}
          </span>
        </template>
        <template #item-salida="item">
          <span :class="!item.salida || item.salida === 'SR' ? 'text-gray-500 font-bold' : 'text-gray-800 font-medium'">
            {{ item.salida || 'SR' }}
          </span>
        </template>
        <template #item-incidencia="item">
          <span :class="{
              'text-xs font-bold bg-red-100 text-red-800': item.incidencia === 'FALTA',
              'text-xs font-bold bg-amber-100 text-yellow-700': item.incidencia === 'RETARDO' || item.incidencia === 'RETARDO_ESPECIAL' || item.incidencia === 'RETARDO_Y_OMISION',
              'text-xs font-bold bg-orange-200 text-orange-800': item.incidencia === 'OMISION_E' || item.incidencia === 'OMISION_S',
            }" class="px-2 py-1 text-xs font-bold rounded-full uppercase">{{ item.incidencia }}</span>
        </template>
        <template #item-acciones="item">
          <button @click="prepararJustificacion(item)"> 
                <i class="fa-solid fa-pen-to-square text-base hover:bg-inst-vino-claro hover:text-white p-2 rounded-lg transition"> </i>  
              </button>
        </template>
      </EasyDataTable>
    </div>

    <!-- REGISTRO INDIVIDUAL / RANGO -->
    <div v-if="pestanaActiva === 'registrar'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <h2 class="text-base font-bold text-gray-700 border-b pb-3 mb-6 uppercase tracking-wide">Captura de Justificación (Individual o por Rango)</h2>
      
      <div v-if="!empleadoSeleccionado" class="text-center py-12 bg-gray-50 border border-dashed border-gray-300 rounded-lg">
        <i class="fa-solid fa-hand-pointer text-4xl text-gray-400 mb-3"></i>
        <p class="text-gray-600 font-medium">Por favor, selecciona un registro desde la <strong>Bandeja de Pendientes</strong> para procesarlo.</p>
        <button @click="pestanaActiva = 'pendientes'" class="mt-4 px-5 py-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded-md font-bold text-xs uppercase tracking-wider transition">
          Ver Bandeja
        </button>
      </div>

      <div v-else class="space-y-5">
        <div class="bg-blue-50 border border-blue-200 p-4 rounded-lg flex justify-between items-center">
          <div>
            <p class="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1">Empleado Seleccionado</p>
            <p class="font-bold text-gray-800 text-lg">{{ empleadoSeleccionado.servidor?.nombreCompleto }}</p>
            <p class="text-sm text-gray-600">No. Empleado: <span class="font-mono font-bold text-gray-800">{{ empleadoSeleccionado.servidor?.numeroEmpleado }}</span></p>
          </div>
        </div>

        <!-- 🔥 NUEVO: SELECCIÓN DE RANGOS -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-gray-50 p-4 border border-gray-200 rounded-lg">
          <div>
            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Abarca desde el día: <span class="text-red-500">*</span></label>
            <input type="date" v-model="formulario.fechaInicio" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Hasta el día: <span class="text-red-500">*</span></label>
            <input type="date" v-model="formulario.fechaFin" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white" />
          </div>
          <p class="text-xs text-gray-500 col-span-1 md:col-span-2">
            <i class="fa-solid fa-circle-info text-blue-500 mr-1"></i> Si es un permiso de un solo día, deja la misma fecha en ambos campos.
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Alcance <span class="text-red-500">*</span></label>
            <select v-model="formulario.cobertura" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Selecciona...</option>
              <option value="ENTRADA">Solo Entrada</option>
              <option value="SALIDA">Solo Salida</option>
              <option value="COMPLETO">Día Completo</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo <span class="text-red-500">*</span></label>
            <select v-model="formulario.tipoIncidencia" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Seleccione...</option>
              <option v-for="(motivo, index) in catalogoIncidencias" :key="index" :value="motivo">{{ motivo }}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Folio Documento (Opcional)</label>
          <input v-model="formulario.folio" type="text" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observaciones (Opcional)</label>
          <textarea v-model="formulario.observaciones" rows="3" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm resize-none"></textarea>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button @click="cancelarRegistro" class="px-5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-sm transition hover:bg-gray-300">Cancelar</button>
          <button @click="guardarJustificacion" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg text-sm shadow-md hover:bg-inst-secundario transition"><i class="fa-solid fa-floppy-disk mr-2"></i> Procesar Justificación</button>
        </div>
      </div>
    </div>

    <!-- JUSTIFICACIÓN MASIVA -->
    <div v-if="pestanaActiva === 'masiva'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-6xl mx-auto space-y-6">
      <div class="border-b pb-3 flex justify-between items-end">
        <div>
          <h2 class="text-base font-bold text-gray-700 uppercase tracking-wide"><i class="fa-solid fa-bolt text-yellow-500 mr-2"></i> Justificación Masiva en Lote</h2>
          <p class="text-sm text-gray-500 mt-1">Busca los registros afectados de un día en específico, selecciona a quiénes aplicar y genera el formato general.</p>
        </div>
      </div>

      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-600 uppercase mb-1">1. Día de Incidencia <span class="text-red-500">*</span></label>
          <select v-model="filtroMasivo.fecha" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white">
            <option value="" disabled>Selecciona la fecha...</option>
            <option v-for="fecha in fechasDisponibles" :key="fecha" :value="fecha">{{ fecha }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600 uppercase mb-1">2. Tipo de Afectación <span class="text-red-500">*</span></label>
          <select v-model="filtroMasivo.tipoAlerta" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white">
            <option value="" disabled>Selecciona qué falló...</option>
            <option v-for="tipo in tiposAlerta" :key="tipo.valor" :value="tipo.valor">{{ tipo.texto }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600 uppercase mb-1">3. Área (Opcional)</label>
          <select v-model="filtroMasivo.area" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white">
            <option value="TODAS">TODAS LAS ÁREAS</option>
            <option v-for="area in areasAdscripcion" :key="area.id" :value="area.nombre">{{ area.nombre }}</option>
          </select>
        </div>
      </div>

      <div v-if="filtroMasivo.fecha && filtroMasivo.tipoAlerta">
        <div class="flex justify-between items-center mb-3">
          <p class="text-sm font-bold text-gray-600">
            Registros encontrados: <span class="text-inst-primario">{{ registrosAfectados.length }}</span> | 
            Seleccionados: <span class="text-green-600">{{ registrosSeleccionados.length }}</span>
          </p>
          <button 
            @click="abrirModalAfectacion" 
            :disabled="registrosSeleccionados.length === 0"
            class="px-5 py-2 bg-inst-primario text-white font-bold rounded-lg text-sm shadow-md hover:bg-inst-secundario transition disabled:opacity-50 disabled:cursor-not-allowed">
            Generar Justificación ({{ registrosSeleccionados.length }}) <i class="fa-solid fa-arrow-right ml-1"></i>
          </button>
        </div>

        <div class="border border-gray-200 rounded-lg overflow-hidden">
          <EasyDataTable
            v-model:items-selected="registrosSeleccionados"
            :headers="headersMasivos"
            :items="registrosAfectados"
            :rows-per-page="50"
            table-class-name="img-strattia-style"
          >
            <template #item-incidencia="item">
              <span :class="{
                  'text-[10px] font-bold bg-red-100 text-red-800': item.incidencia === 'FALTA',
                  'text-[10px] font-bold bg-amber-100 text-yellow-700': item.incidencia === 'RETARDO' || item.incidencia === 'RETARDO_ESPECIAL' || item.incidencia === 'RETARDO_Y_OMISION',
                  'text-[10px] font-bold bg-orange-200 text-orange-800': item.incidencia === 'OMISION_E' || item.incidencia === 'OMISION_S',
                }" class="px-2 py-0.5 rounded uppercase">{{ item.incidencia }}</span>
            </template>
          </EasyDataTable>
        </div>
      </div>
      
      <div v-else class="text-center py-10 bg-gray-50 border border-dashed border-gray-200 rounded-lg">
        <i class="fa-solid fa-magnifying-glass text-3xl text-gray-300 mb-2"></i>
        <p class="text-gray-500 font-medium text-sm">Selecciona una Fecha y un Tipo de Afectación arriba para ver los registros.</p>
      </div>
    </div>

    <!-- HISTORIAL -->
    <div v-if="pestanaActiva === 'historial'" class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-4 space-y-4">
      <div class="w-full max-w-md bg-gray-50 p-2 rounded border border-gray-200">
        <input v-model="valorBusquedaHistorial" type="text" placeholder="Buscar en el archivo histórico..." class="w-full p-2 border border-gray-300 rounded outline-none focus:border-inst-primario text-sm" />
      </div>

      <EasyDataTable
        :headers="headersHistorial"
        :items="listaHistorial"
        :search-value="valorBusquedaHistorial"
        :search-field="['servidor.numeroEmpleado', 'servidor.nombreCompleto']"
        :rows-per-page="15"
        table-class-name="img-strattia-style"
      >
        <template #item-fechaIncidencia="item">
          <span class="tabular-nums text-gray-800">{{ formatearFecha(item.fechaIncidencia) }}</span>
        </template>
        
        <template #item-servidor.numeroEmpleado="item">
          <span v-if="item.count > 1" class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <i class="fa-solid fa-layer-group mr-1"></i> LOTE
          </span>
          <span v-else>
            {{ item.servidor.numeroEmpleado }}
          </span>
        </template>

        <template #item-servidor.nombreCompleto="item">
          <span v-if="item.count > 1" class="text-indigo-700 font-bold">
            <i class="fa-solid fa-users mr-1"></i> {{ item.servidor.nombreCompleto }}
          </span>
          <span v-else>
            {{ item.servidor.nombreCompleto }}
          </span>
        </template>

        <template #item-cobertura="item">
          <span :class="[
            'px-2 py-0.5 rounded text-[11px] font-bold border shadow-sm',
            item.cobertura === 'COMPLETO' ? 'bg-purple-100 text-purple-800 border-purple-200' : 'bg-blue-100 text-blue-800 border-blue-200'
          ]">
            {{ item.cobertura }}
          </span>
        </template>
        
        <template #item-fechaRegistro="item">
          <span class="tabular-nums text-gray-500">{{ formatearFecha(item.fechaRegistro) }}</span>
        </template>
      </EasyDataTable>
    </div>

    <!-- MODAL MASIVO -->
    <div v-if="mostrarModalMasivo" class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all" style="background-color: rgba(0,0,0,0.4); backdrop-filter: blur(4px);">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden animate__animated animate__fadeInDown">
        <div class="bg-inst-cafe-oscuro p-4 text-white font-bold flex justify-between items-center">
          <h3 class="font-bold text-lg uppercase"><i class="fa-solid fa-layer-group mr-2"></i> Formato de Justificación</h3>
          <button @click="mostrarModalMasivo = false" class="text-white text-2xl hover:text-gray-300">&times;</button>
        </div>
        
        <div class="p-6 space-y-4">
          <div class="bg-blue-50 border border-blue-200 p-3 rounded text-sm text-blue-800 mb-2">
            Se aplicará el formato a <strong>{{ registrosSeleccionados.length }} empleados</strong> seleccionados.
          </div>

          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Alcance <span class="text-red-500">*</span></label>
            <select v-model="formularioMasivo.cobertura" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white">
              <option value="" disabled>Selecciona...</option>
              <option value="ENTRADA">Justificar Entradas</option>
              <option value="SALIDA">Justificar Salidas</option>
              <option value="COMPLETO">Justificar Día Completo</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo <span class="text-red-500">*</span></label>
            <select v-model="formularioMasivo.tipoIncidencia" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm bg-white">
              <option value="" disabled>Seleccione...</option>
              <option v-for="(motivo, index) in catalogoIncidencias" :key="index" :value="motivo">{{ motivo }}</option>
            </select>
          </div>
          <div>
             <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Folio (Opcional)</label>
             <input v-model="formularioMasivo.folio" type="text" placeholder="Ej. Minuta General" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm" />
           </div>
           <div>
             <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observaciones</label>
             <input v-model="formularioMasivo.observaciones" type="text" placeholder="Falla general de energía..." class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm" />
           </div>
        </div>

        <div class="p-4 bg-gray-50 border-t flex justify-end space-x-3">
          <button @click="mostrarModalMasivo = false" class="px-5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-sm transition hover:bg-gray-300">Cancelar</button>
          <button @click="guardarJustificacionMasiva" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg text-sm shadow-md hover:bg-inst-secundario transition">
            <i class="fa-solid fa-check-double mr-2"></i> Aplicar a Todos
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<style scoped>
.bg-inst-primario { background-color: #6B1C3A; }
.text-inst-primario { color: #6B1C3A; }
.border-inst-primario { border-color: #6B1C3A; }
.bg-inst-secundario { background-color: #902c3e; }
.bg-inst-cafe-oscuro { background-color: #4b5563; } 
.bg-inst-vino-claro { background-color: #a8475c; }

.img-strattia-style {
  --easy-table-header-background-color: #f8fafc;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 13px;
  --easy-table-body-row-font-size: 13px;
  --easy-table-border: 1px solid #e2e8f0;
  --easy-table-row-border: 1px solid #e2e8f0;
}
</style>