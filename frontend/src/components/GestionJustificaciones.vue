<script setup>
import { ref, computed, onMounted } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// Control de Pestañas
const pestanaActiva = ref('pendientes');

// Estados de datos
const listaPendientes = ref([]);
const listaHistorial = ref([]);
const cargando = ref(false);
const valorBusquedaPendientes = ref('');
const valorBusquedaHistorial = ref('');

// Variables del Formulario de Registro Individual
const empleadoSeleccionado = ref(null);
const formulario = ref({
  cobertura: '',
  tipoIncidencia: '',
  folio: '',
  observaciones: ''
});

// Variables del Formulario de Registro MASIVO
const filtroMasivo = ref({
  fecha: '',
  tipoAlerta: ''
});
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

// 💡 CAMBIO 1: Lenguaje humano para los filtros de justificación masiva
const tiposAlerta = [
  { valor: 'ENTRADA', texto: 'Solo Entrada (Retardos y Omisiones)' },
  { valor: 'SALIDA', texto: 'Solo Salida (Omisiones de Salida)' },
  { valor: 'COMPLETO', texto: 'Día Completo (Faltas)' }
];

// Encabezados de la Tabla de Pendientes 
const headersPendientes = [
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "FECHA", value: "fecha", sortable: true },
  { text: "ENTRADA", value: "entrada" },
  { text: "SALIDA", value: "salida" },
  { text: "ALERTA", value: "incidencia", sortable: true },
  { text: "ACCIONES", value: "acciones" }
];

// Encabezados de la Tabla de Historial 
const headersHistorial = [
  { text: "FECHA INCIDENCIA", value: "fechaIncidencia", sortable: true },
  { text: "NUM. EMP", value: "servidor.numeroEmpleado", sortable: true, align: 'center' },
  { text: "SERVIDOR PÚBLICO", value: "servidor.nombreCompleto", sortable: true },
  { text: "ALCANCE", value: "cobertura", sortable: true },
  { text: "FOLIO FORMATO", value: "folio", sortable: true },
  { text: "MOTIVO JUSTIFICACIÓN", value: "motivo", sortable: true },
  { text: "FECHA CAPTURA", value: "fechaRegistro", sortable: true }
];

// Lógica Computada para la Justificación Masiva
const fechasDisponibles = computed(() => {
  const fechas = listaPendientes.value.map(item => formatearFecha(item.fecha));
  return [...new Set(fechas)].sort((a, b) => new Date(b) - new Date(a));
});

// 💡 CAMBIO 1 (Lógica): Relacionamos la opción elegida por el usuario con las incidencias reales de la BD
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

  return listaPendientes.value.filter(item => 
    formatearFecha(item.fecha) === filtroMasivo.value.fecha && 
    incidenciasValidas.includes(item.incidencia)
  );
});

// Extrae las siglas oficiales según la normatividad interna
const obtenerSiglasJustificacion = (motivo) => {
  if (motivo.includes("Comisión de Servicios") || motivo.includes("Comisión sindical")) return "CS";
  if (motivo.includes("médica") || motivo.includes("Enfermedad") || motivo.includes("Riesgo") || motivo.includes("lactancia")) return "IN";
  if (motivo.includes("Días económicos")) return "DE";
  if (motivo.includes("Licencia") || motivo.includes("matrimonio") || motivo.includes("nacimiento") || motivo.includes("fallecimiento") || motivo.includes("examen")) return "LI";
  return "JU"; 
};

// Formateador de fechas
const formatearFecha = (fechaInput) => {
  if (!fechaInput) return '';
  const d = new Date(fechaInput);
  return d.toISOString().split('T')[0];
};

// --- LLAMADAS REALES AL BACKEND ---

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

// 💡 CAMBIO 2: Agrupación mágica para el historial
const cargarHistorial = async () => {
  try {
    const res = await fetch(apiUrl('/api/justificaciones/historial'));
    if (!res.ok) throw new Error('Error al consultar historial');
    const data = await res.json();

    const agrupado = {};

    // Al usar una transacción en el backend, todos los registros masivos tienen el MISMO milisegundo exacto
    data.forEach(item => {
      const key = item.fechaRegistro; 
      if (!agrupado[key]) {
        agrupado[key] = {
          ...item,
          fechaIncidencia: item.asistencia?.fecha,
          count: 1
        };
      } else {
        agrupado[key].count++; // Si hay otro con el mismo milisegundo, sumamos el contador
      }
    });

    // Mapeamos los resultados para cambiarles el nombre si son masivos
    listaHistorial.value = Object.values(agrupado).map(grupo => {
      if (grupo.count > 1) {
        return {
          ...grupo,
          servidor: {
            numeroEmpleado: 'MASIVO',
            nombreCompleto: `JUSTIFICACIÓN MASIVA EN LOTE (${grupo.count} EMPLEADOS)`
          }
        };
      }
      return grupo;
    });

    // Ordenar del más reciente al más antiguo
    listaHistorial.value.sort((a, b) => new Date(b.fechaRegistro) - new Date(a.fechaRegistro));

  } catch (error) {
    console.error(error);
  }
};

const prepararJustificacion = (item) => {
  empleadoSeleccionado.value = item;
  formulario.value = { cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  pestanaActiva.value = 'registrar';
};

const cancelarRegistro = () => {
  empleadoSeleccionado.value = null;
  formulario.value = { cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  formularioMasivo.value = { cobertura: '', tipoIncidencia: '', folio: '', observaciones: '' };
  pestanaActiva.value = 'pendientes';
};

// Guardado Individual
const guardarJustificacion = async () => {
  if (!formulario.value.cobertura || !formulario.value.tipoIncidencia) {
    Swal.fire('Atención', 'Selecciona el alcance y motivo del catálogo.', 'warning');
    return;
  }

  const siglasOficiales = obtenerSiglasJustificacion(formulario.value.tipoIncidencia);
  const payload = {
    asistenciaId: empleadoSeleccionado.value.id, 
    servidorId: empleadoSeleccionado.value.servidorId, 
    motivo: formulario.value.tipoIncidencia,
    cobertura: formulario.value.cobertura,
    folio: formulario.value.folio,
    observaciones: formulario.value.observaciones,
    siglas: siglasOficiales 
  };

  try {
    const respuesta = await fetch(apiUrl('/api/justificaciones/registrar'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (!respuesta.ok) throw new Error('Error al guardar');
    
    Swal.fire({ icon: 'success', title: '¡Justificación Aplicada!', confirmButtonColor: '#902c3e' });
    await cargarPendientes();
    await cargarHistorial();
    cancelarRegistro();
  } catch (error) {
    Swal.fire('Error', error.message, 'error');
  }
};

// Guardado Masivo
const guardarJustificacionMasiva = async () => {
  if (registrosAfectados.value.length === 0) {
    Swal.fire('Atención', 'No hay registros que coincidan con estos filtros.', 'warning');
    return;
  }
  if (!formularioMasivo.value.cobertura || !formularioMasivo.value.tipoIncidencia) {
    Swal.fire('Atención', 'Debes seleccionar el alcance y motivo del catálogo.', 'warning');
    return;
  }

  const result = await Swal.fire({
    title: '¿Estás seguro?',
    text: `Vas a justificar masivamente a ${registrosAfectados.value.length} empleados. Esta acción es definitiva.`,
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#902c3e',
    cancelButtonColor: '#6b7280',
    confirmButtonText: 'Sí, aplicar a todos'
  });

  if (!result.isConfirmed) return;

  const siglasOficiales = obtenerSiglasJustificacion(formularioMasivo.value.tipoIncidencia);
  
  const asistenciasPayload = registrosAfectados.value.map(item => ({
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

onMounted(() => {
  cargarPendientes();
  cargarHistorial();
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
        <i class="fa-solid fa-user-check mr-2"></i> Individual
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

    <!-- PESTAÑA: BANDEJA PENDIENTES -->
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

    <!-- PESTAÑA: REGISTRO INDIVIDUAL -->
    <div v-if="pestanaActiva === 'registrar'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <h2 class="text-base font-bold text-gray-700 border-b pb-3 mb-6 uppercase tracking-wide">Captura de Justificación Individual</h2>
      
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
            <p class="text-[10px] text-blue-600 font-bold uppercase tracking-wider mb-1">Registro Seleccionado</p>
            <p class="font-bold text-gray-800 text-lg">{{ empleadoSeleccionado.servidor?.nombreCompleto }}</p>
            <p class="text-sm text-gray-600">No. Empleado: <span class="font-mono font-bold text-gray-800">{{ empleadoSeleccionado.servidor?.numeroEmpleado }}</span></p>
            <p class="text-sm text-gray-600">Fecha: <strong class="text-gray-800">{{ formatearFecha(empleadoSeleccionado.fecha) }}</strong></p>
          </div>
          <div class="text-right">
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
              Alerta: {{ empleadoSeleccionado.incidencia }}
            </span> 
          </div>
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
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Folio Documento</label>
          <input v-model="formulario.folio" type="text" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm" />
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observaciones</label>
          <textarea v-model="formulario.observaciones" rows="3" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm resize-none"></textarea>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button @click="cancelarRegistro" class="px-5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg text-sm">Cancelar</button>
          <button @click="guardarJustificacion" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg text-sm"><i class="fa-solid fa-floppy-disk mr-2"></i> Guardar</button>
        </div>
      </div>
    </div>

    <!-- PESTAÑA NUEVA: JUSTIFICACIÓN MASIVA -->
    <div v-if="pestanaActiva === 'masiva'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-4xl mx-auto space-y-6">
      <div class="border-b pb-3">
        <h2 class="text-base font-bold text-gray-700 uppercase tracking-wide"><i class="fa-solid fa-bolt text-yellow-500 mr-2"></i> Aplicador de Justificaciones Masivas</h2>
        <p class="text-sm text-gray-500 mt-1">Usa esta herramienta cuando un evento general (ej. falla de red) haya provocado incidencias a múltiples empleados.</p>
      </div>

      <!-- Filtros para detectar masivos (CON TEXTOS HUMANOS) -->
      <div class="bg-gray-50 p-4 rounded-lg border border-gray-200 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Día de la Incidencia <span class="text-red-500">*</span></label>
          <select v-model="filtroMasivo.fecha" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
            <option value="" disabled>Selecciona la fecha afectada...</option>
            <option v-for="fecha in fechasDisponibles" :key="fecha" :value="fecha">{{ fecha }}</option>
          </select>
        </div>
        <div>
          <label class="block text-xs font-bold text-gray-600 uppercase mb-1">Filtro de Afectación <span class="text-red-500">*</span></label>
          <select v-model="filtroMasivo.tipoAlerta" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
            <option value="" disabled>Selecciona a quiénes justificar...</option>
            <option v-for="tipo in tiposAlerta" :key="tipo.valor" :value="tipo.valor">{{ tipo.texto }}</option>
          </select>
        </div>
      </div>

      <!-- Conteo de afectados -->
      <div v-if="filtroMasivo.fecha && filtroMasivo.tipoAlerta" class="flex justify-between items-center bg-blue-50 border border-blue-200 p-4 rounded-lg">
        <div>
          <p class="text-sm text-blue-800">Se encontraron <strong class="text-2xl ml-1 mr-1 text-blue-900">{{ registrosAfectados.length }}</strong> registros que coinciden con este problema listos para ser justificados.</p>
        </div>
      </div>

      <!-- Formulario para planchar a todos -->
      <div v-if="registrosAfectados.length > 0" class="space-y-4 pt-4 border-t border-gray-100">
        <h3 class="text-sm font-bold text-gray-700 uppercase">Detalles del Formato Oficial para Todos</h3>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Alcance <span class="text-red-500">*</span></label>
            <select v-model="formularioMasivo.cobertura" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Selecciona...</option>
              <option value="ENTRADA">Planchar Entradas</option>
              <option value="SALIDA">Planchar Salidas</option>
              <option value="COMPLETO">Planchar Día Completo</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo <span class="text-red-500">*</span></label>
            <select v-model="formularioMasivo.tipoIncidencia" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Seleccione...</option>
              <option v-for="(motivo, index) in catalogoIncidencias" :key="index" :value="motivo">{{ motivo }}</option>
            </select>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
           <div>
             <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Folio (Opcional)</label>
             <input v-model="formularioMasivo.folio" type="text" placeholder="Ej. Minuta General" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm" />
           </div>
           <div>
             <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Observaciones</label>
             <input v-model="formularioMasivo.observaciones" type="text" placeholder="Falla general de energía..." class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm" />
           </div>
        </div>

        <div class="flex justify-end pt-4">
          <button @click="guardarJustificacionMasiva" class="px-6 py-3 bg-inst-primario text-white font-bold rounded-lg text-sm shadow-md hover:bg-inst-secundario transition w-full md:w-auto">
            <i class="fa-solid fa-layer-group mr-2"></i> Procesar a los {{ registrosAfectados.length }} Empleados
          </button>
        </div>
      </div>
    </div>

    <!-- PESTAÑA: HISTORIAL -->
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
        
        <!-- 💡 CAMBIO 2: Si es masivo, pintamos una placa especial en el número de empleado -->
        <template #item-servidor.numeroEmpleado="item">
          <span v-if="item.count > 1" class="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
            <i class="fa-solid fa-layer-group mr-1"></i> LOTE
          </span>
          <span v-else>
            {{ item.servidor.numeroEmpleado }}
          </span>
        </template>

        <!-- 💡 CAMBIO 2: Destacamos el texto si fue justificación masiva -->
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

  </div>
</template>

<style scoped>
.img-strattia-style {
  --easy-table-header-background-color: #f8fafc;
  --easy-table-header-font-color: #475569;
  --easy-table-header-font-size: 13px;
  --easy-table-body-row-font-size: 13px;
  --easy-table-border: 1px solid #e2e8f0;
  --easy-table-row-border: 1px solid #e2e8f0;
}
</style>