<script setup>
import { ref, onMounted } from 'vue';
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

// Variables del Formulario de Registro
const empleadoSeleccionado = ref(null);
const formulario = ref({
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

// Extrae las siglas oficiales según la normatividad interna para planchar el biométrico
const obtenerSiglasJustificacion = (motivo) => {
  if (motivo.includes("Comisión de Servicios") || motivo.includes("Comisión sindical")) return "CS";
  if (motivo.includes("médica") || motivo.includes("Enfermedad") || motivo.includes("Riesgo") || motivo.includes("lactancia")) return "IN";
  if (motivo.includes("Días económicos")) return "DE";
  if (motivo.includes("Licencia") || motivo.includes("matrimonio") || motivo.includes("nacimiento") || motivo.includes("fallecimiento") || motivo.includes("examen")) return "LI";
  return "JU"; 
};

// Formateador de fechas para corregir la zona horaria ISO de la BD
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

// funcion para cargar el historial de justificaciones, con un mapeo para extraer la fecha de incidencia desde el objeto de asistencia relacionado
const cargarHistorial = async () => {
  try {
    const res = await fetch(apiUrl('/api/justificaciones/historial'));
    if (!res.ok) throw new Error('Error al consultar historial');
    const data = await res.json();
    listaHistorial.value = data.map(item => ({
      ...item,
      fechaIncidencia: item.asistencia?.fecha 
    }));
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
  pestanaActiva.value = 'pendientes';
};

const guardarJustificacion = async () => {
  if (!formulario.value.cobertura) {
    Swal.fire('Atención', 'Debes seleccionar el alcance de la justificación.', 'warning');
    return;
  }
  if (!formulario.value.tipoIncidencia) {
    Swal.fire('Atención', 'Debes seleccionar un motivo del catálogo.', 'warning');
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
    
    if (!respuesta.ok) {
      const errorData = await respuesta.json();
      throw new Error(errorData.error || 'Error al guardar');
    }
    
    Swal.fire({
      icon: 'success',
      title: '¡Justificación Aplicada!',
      text: `Estatus actualizado con las siglas [ ${siglasOficiales} ] con éxito.`,
      confirmButtonColor: '#902c3e'
    });

    await cargarPendientes();
    await cargarHistorial();
    cancelarRegistro();
    
  } catch (error) {
    Swal.fire('Error', error.message || 'No se pudo procesar el registro.', 'error');
  }
};

onMounted(() => {
  cargarPendientes();
  cargarHistorial();
});
</script>

<template>
  <div class="space-y-6">
    
    <div class="bg-white rounded-lg shadow-sm border border-gray-200 p-2 flex gap-2">
      <button @click="pestanaActiva = 'pendientes'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'pendientes' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-inbox mr-2"></i> Bandeja Pendientes
      </button>
      
      <button @click="pestanaActiva = 'registrar'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'registrar' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-file-signature mr-2"></i> Registrar Justificante
      </button>
      
      <button @click="pestanaActiva = 'historial'" 
        :class="['px-6 py-2 rounded-md font-bold text-sm transition', pestanaActiva === 'historial' ? 'bg-inst-primario text-white' : 'text-gray-600 hover:bg-gray-100']">
        <i class="fa-solid fa-clock-rotate-left mr-2"></i> Historial
      </button>
    </div>

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

    <div v-if="pestanaActiva === 'registrar'" class="bg-white p-6 rounded-lg shadow-sm border border-gray-200 max-w-3xl mx-auto">
      <h2 class="text-base font-bold text-gray-700 border-b pb-3 mb-6 uppercase tracking-wide">Captura de Justificación</h2>
      
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
            <p class="text-sm text-gray-600">Fecha de la incidencia: <strong class="text-gray-800">{{ formatearFecha(empleadoSeleccionado.fecha) }}</strong></p>
            <p class="text-sm text-gray-600">Checadas: Entrada <strong class="text-gray-800">{{ empleadoSeleccionado.entrada || 'SR' }}</strong> / Salida <strong class="text-gray-800">{{ empleadoSeleccionado.salida || 'SR' }}</strong></p>
          </div>
          <div class="text-right">
            
            <span class="px-3 py-1 rounded-full text-xs font-bold bg-red-100 text-red-800 border border-red-200">
              Alerta: {{ empleadoSeleccionado.incidencia }}
            </span> 
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Alcance de Justificación <span class="text-red-500">*</span></label>
            <select v-model="formulario.cobertura" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Selecciona el alcance...</option>
              <option value="ENTRADA">Solo Entrada (Preserva Salida)</option>
              <option value="SALIDA">Solo Salida (Preserva Entrada)</option>
              <option value="COMPLETO">Día Completo (Plancha Ambos)</option>
            </select>
          </div>
          
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo del Catálogo Oficial <span class="text-red-500">*</span></label>
            <select v-model="formulario.tipoIncidencia" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm bg-white">
              <option value="" disabled>Seleccione la opción correspondiente...</option>
              <option v-for="(motivo, index) in catalogoIncidencias" :key="index" :value="motivo">{{ motivo }}</option>
            </select>
          </div>
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Folio del Formato / Oficio</label>
          <input v-model="formulario.folio" type="text" placeholder="Escribe el número de folio o formato entregado..." class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm" />
        </div>

        <div>
          <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Motivo detallado de la justificación</label>
          <textarea v-model="formulario.observaciones" rows="4" class="w-full p-2.5 border border-gray-300 rounded-lg outline-none focus:border-inst-primario text-sm shadow-sm resize-none" placeholder="Anota aquí los detalles específicos o soporte documental..."></textarea>
        </div>

        <div class="flex justify-end gap-3 pt-4 border-t border-gray-100">
          <button @click="cancelarRegistro" class="px-5 py-2 bg-gray-200 text-gray-700 font-bold rounded-lg hover:bg-gray-300 transition text-sm">
            Cancelar
          </button>
          <button @click="guardarJustificacion" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg hover:bg-inst-secundario transition text-sm shadow-sm flex items-center gap-2">
            <i class="fa-solid fa-floppy-disk"></i> Guardar y Aplicar
          </button>
        </div>
      </div>
    </div>

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