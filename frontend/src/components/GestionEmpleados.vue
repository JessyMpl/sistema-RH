<script setup>
import { ref, onMounted, computed } from 'vue';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

// ==========================================
// 1. VARIABLES GLOBALES DE ESTADO
// ==========================================
const empleados = ref([]);
const horarios = ref([]); 
const areasAdscripcion = ref([]);
const vistaInterna = ref('lista'); 
const searchValue = ref('');
const filtroArea = ref('TODAS'); 
const filtroEstatus = ref('ACTIVOS'); // 'ACTIVOS', 'BAJAS' o 'TODOS'

const headers = [
  { text: "No. Empleado", value: "numeroEmpleado", sortable: true },
  { text: "Nombre Completo", value: "nombreCompleto", sortable: true },
  { text: "Área de Adscripción", value: "departamento", sortable: true },
  { text: "Tipo de Horario", value: "regimen" },
  { text: "Estatus", value: "activo" }, 
  { text: "Acciones", value: "acciones" }  
];

const formulario = ref({ 
  numeroEmpleado: '', 
  nombreCompleto: '', 
  departamento: '',
  regimen: 'NORMAL',
  horarioId: '',
  fechaIngreso: '' 
});

// Variables para Modal de Edición
const mostrarModalEditar = ref(false);
const empleadoEditar = ref(null);

// Variables para Modal de Detalles/Expediente
const mostrarModalDetalle = ref(false);
const empleadoDetalle = ref(null);
const tabActiva = ref('datos'); 

// ==========================================
// 2. FUNCIONES DE CARGA Y REGISTRO
// ==========================================
const cargarEmpleados = async () => {
  try {
    const res = await fetch(apiUrl('/api/empleados'));
    empleados.value = await res.json();
  } catch (error) {
    console.error('Error cargando catalogo', error);
  }
};

const cargarHorarios = async () => {
  try {
    const res = await fetch(apiUrl('/api/horarios')); 
    horarios.value = await res.json();
  } catch (error) {
    console.error('Error cargando horarios', error);
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

const guardarManual = async () => {
  if (!formulario.value.horarioId) {
    Swal.fire('Atención', 'Por favor selecciona un Horario.', 'warning');
    return;
  }
  if (!formulario.value.departamento) {
    Swal.fire('Atención', 'Por favor selecciona un Área de Adscripción.', 'warning');
    return;
  }

  try {
    const res = await fetch(apiUrl('/api/empleados'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formulario.value)
    });
    
    if (res.ok) {
      Swal.fire({ title: '¡Registro Exitoso!', icon: 'success', confirmButtonColor: '#2563eb' });
      formulario.value = { numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL', horarioId: '', fechaIngreso: '' };
      cargarEmpleados();
      cargarAreas(); 
      vistaInterna.value = 'lista';
    } else {
      Swal.fire({ title: 'Error', text: 'Verifica que el ID no esté duplicado.', icon: 'error' });
    }
  } catch (error) {
    Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
  }
};

// ==========================================
// 3. FUNCIONES DE EDICIÓN Y ACTUALIZACIÓN
// ==========================================
const abrirEditar = (emp) => {
  empleadoEditar.value = { ...emp };
  if (empleadoEditar.value.fechaBaja) {
    empleadoEditar.value.fechaBaja = empleadoEditar.value.fechaBaja.split('T')[0];
  }
  if (empleadoEditar.value.fechaIngreso) {
    empleadoEditar.value.fechaIngreso = empleadoEditar.value.fechaIngreso.split('T')[0];
  }
  mostrarModalEditar.value = true;
};

const actualizarEmpleado = async () => {
  const idEmpleado = empleadoEditar.value.id;
  if (!idEmpleado) {
    Swal.fire('Error', 'No se encontró el ID del empleado para actualizar.', 'error');
    return;
  }

  const urlFinal = apiUrl(`/api/empleados/${idEmpleado}`);
  console.log("Intentando actualizar en:", urlFinal, "con método PUT");

  try {
    const res = await fetch(urlFinal, {
      method: 'PUT',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json' 
      },
      body: JSON.stringify(empleadoEditar.value)
    });

    if (res.ok) {
      Swal.fire('¡Actualizado!', 'Los datos se han guardado correctamente.', 'success');
      mostrarModalEditar.value = false;
      cargarEmpleados();
    } else {
      const errorData = await res.text();
      console.error("Respuesta del servidor:", res.status, errorData);
      Swal.fire('Error', 'No se pudo actualizar el registro.', 'error');
    }
  } catch (error) {
    console.error("Fallo de conexión en PUT:", error);
    Swal.fire('Error', 'Fallo de conexión.', 'error');
  }
};

// ==========================================
// 4. FUNCIONES DEL EXPEDIENTE E HISTORIAL
// ==========================================
const abrirDetalle = (emp) => {
  empleadoDetalle.value = emp;
  tabActiva.value = 'datos'; 
  mostrarModalDetalle.value = true;
};

const formatearFechaLocal = (fechaISO) => {
  if (!fechaISO) return 'N/A';
  const fecha = new Date(fechaISO.includes('T') ? fechaISO : `${fechaISO}T12:00:00Z`);
  return fecha.toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' });
};

// ==========================================
// 5. FUNCIONES DE IMPORTACIÓN MASIVA
// ==========================================
const archivoCatalogo = ref(null);
const importando = ref(false);
const seleccionarArchivoCatalogo = (event) => { archivoCatalogo.value = event.target.files[0]; };

const procesarImportacion = async () => {
  if (!archivoCatalogo.value) {
    Swal.fire('Atención', 'Selecciona un archivo Excel.', 'warning');
    return;
  }
  importando.value = true;
  const formData = new FormData();
  formData.append('archivoExcel', archivoCatalogo.value);
  try {
    const res = await fetch(apiUrl('/api/empleados/importar'), { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      Swal.fire({ title: '¡Catálogo Importado!', text: data.mensaje, icon: 'success' });
      archivoCatalogo.value = null;
      cargarEmpleados();
      cargarAreas(); 
      vistaInterna.value = 'lista';
    }
  } catch (error) {
    Swal.fire('Error', 'Error en el servidor', 'error');
  } finally {
    importando.value = false;
  }
};

// ==========================================
// 6. COMPUTADOS (Filtros Avanzados)
// ==========================================
const empleadosFiltrados = computed(() => {
  return empleados.value.filter(emp => {
    // 1. Validar filtro de Área
    const pasaArea = filtroArea.value === 'TODAS' || emp.departamento === filtroArea.value;
    
    // 2. Validar filtro de Estatus
    let pasaEstatus = true;
    if (filtroEstatus.value === 'ACTIVOS') pasaEstatus = emp.activo === true;
    if (filtroEstatus.value === 'BAJAS') pasaEstatus = emp.activo === false;
    
    return pasaArea && pasaEstatus;
  });
});

onMounted(() => {
  cargarEmpleados();
  cargarHorarios(); 
  cargarAreas();
});

// ==========================================
// 7. IMPORTACIÓN DE PERSONAL
// ==========================================
const inputPadron = ref(null);

const subirPadronNominal = async (event) => {
  const archivo = event.target.files[0];
  if (!archivo) return;

  const formData = new FormData();
  formData.append('archivoNominal', archivo);

  Swal.fire({
    title: '¡Importando Personal! 🚀',
    html: 'Procesando y guardando registros por bloques. Esto tomará unos segundos...',
    allowOutsideClick: false,
    showConfirmButton: false,
    didOpen: () => { Swal.showLoading(); }
  });

  try {
    const respuesta = await fetch(apiUrl('/api/empleados/sincronizar-plantilla'), {
      method: 'POST',
      body: formData
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      Swal.fire({ 
        icon: 'success', 
        title: '¡Importación Exitosa!', 
        html: `
          <div class="text-left text-sm mt-4 text-gray-700 bg-gray-50 p-4 rounded-lg border">
            <p class="mb-2"><span class="text-green-600 font-bold"><i class="fa-solid fa-user-plus w-5"></i> Registros Nuevos:</span> ${data.resultados?.altas || 0}</p>
            <p class="mb-2"><span class="text-blue-600 font-bold"><i class="fa-solid fa-user-pen w-5"></i> Actualizados:</span> ${data.resultados?.modificaciones || 0}</p>
            <p><span class="text-gray-500 font-bold"><i class="fa-solid fa-user-minus w-5"></i> Bajas Procesadas:</span> ${data.resultados?.bajas || 0}</p>
          </div>
        `,
        confirmButtonColor: '#16a34a' 
      });
      
      cargarEmpleados();
      cargarAreas();
      vistaInterna.value = 'lista';
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: data.error || 'Hubo un problema en la importación.', confirmButtonColor: '#902c3e' });
    }
  } catch (error) {
    Swal.fire({ icon: 'error', title: 'Error de Red', text: 'Falló la conexión con el servidor (Timeout). Verifica tu red o reduce el archivo.', confirmButtonColor: '#902c3e' });
  } finally {
    if (event.target) event.target.value = null; 
  }
};

</script>

<template>
  <div class="space-y-6">
    
   <div class="flex flex-wrap gap-4 mb-6 items-center">
  <button @click="vistaInterna = 'lista'" :class="vistaInterna === 'lista' ? 'bg-inst-primario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition"> Ver Catálogo</button>
  <button @click="vistaInterna = 'nuevo'" :class="vistaInterna === 'nuevo' ? 'bg-inst-primario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition"> Registro Manual</button>
  
  <!-- BOTÓN DE IMPORTAR PERSONAL -->
  <input type="file" ref="inputPadron" accept=".xlsx, .xls" class="hidden" @change="subirPadronNominal" />
  <button @click="$refs.inputPadron.click()" class="bg-white text-gray-600 border hover:text-white hover:bg-inst-primario  font-bold px-5 py-2 rounded-lg shadow-md transition flex items-center gap-2 cursor-pointer">
    <i class="fa-solid fa-file-import"></i> Importar Personal
  </button>
</div>

    <div v-if="vistaInterna === 'lista'" class="space-y-4">
      
      <div class="flex flex-col md:flex-row justify-between items-start md:items-center bg-white p-4 rounded-lg border-t-4 border-inst-primario gap-4">
        
        <!-- NUEVO BLOQUE DE 3 COLUMNAS PARA FILTROS -->
        <div class="flex flex-col md:flex-row w-full gap-4">
          <!-- Columna 1: Búsqueda -->
          <div class="w-full md:w-1/3">
            <label class="block text-xs font-bold uppercase text-inst-primario mb-1">Buscar <i class="fa-solid fa-magnifying-glass ml-2 text-lg"></i></label>
            <input v-model="searchValue" type="text" placeholder="ID o Nombre..." class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm" />
          </div>
          
          <!-- Columna 2: Filtro de Área -->
          <div class="w-full md:w-1/3">
            <label class="block text-xs font-bold uppercase text-inst-primario mb-1">Área <i class="fa-solid fa-filter ml-2 text-lg"></i></label>
            <select v-model="filtroArea" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm bg-white cursor-pointer">
              <option value="TODAS">TODAS LAS ÁREAS</option>
              <option v-for="area in areasAdscripcion" :key="area.id" :value="area.nombre">{{ area.nombre }}</option>
            </select>
          </div>

          <!-- Columna 3: Filtro de Estatus -->
          <div class="w-full md:w-1/3">
            <label class="block text-xs font-bold uppercase text-inst-primario mb-1">Estatus <i class="fa-solid fa-user-check ml-2 text-lg"></i></label>
            <select v-model="filtroEstatus" class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm bg-white cursor-pointer">
              <option value="ACTIVOS" class="text-green-700 font-bold">SOLO ACTIVOS</option>
              <option value="BAJAS" class="text-red-700 font-bold">SOLO BAJAS</option>
              <option value="TODOS" class="text-gray-700 font-bold">MOSTRAR TODOS</option>
            </select>
          </div>
        </div>

        <div class="text-sm text-gray-500 font-medium whitespace-nowrap md:mt-6">Total: <span class="font-bold text-gray-800">{{ empleadosFiltrados.length }}</span> registros</div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-2">
        <EasyDataTable
          :headers="headers"
          :items="empleadosFiltrados"
          :search-value="searchValue"
          :rows-per-page="30"
          buttons-pagination
          theme-color="#965664"
          table-class-name="img-strattia-style"
        >
          <template #item-regimen="emp">
            <span :class="{
              'bg-blue-100 text-blue-800': emp.regimen === 'NORMAL',
              'bg-purple-100 text-purple-800': emp.regimen === 'ESPECIAL',
              'bg-orange-100 text-orange-800': emp.regimen === 'LISTA',
              'bg-gray-100 text-gray-800': emp.regimen === 'EXENTO'
            }" class="px-2 py-1 text-xs font-bold rounded-full uppercase">{{ emp.regimen }}</span>
          </template>

          <template #item-activo="emp" > 
            <span v-if="emp.activo" class="text-emerald-600 text-xs "><i class="fa-solid fa-circle-check text-base mr-1"></i>Activo </span>
            <span v-else class="text-rose-800 text-xs"> <i class="fa-solid fa-circle-xmark text-base mr-1"></i> Baja </span>
          </template>

          <template #item-acciones="emp">
            <div class="flex space-x-2">
              <button @click="abrirEditar(emp)" title="Editar"> 
                <i class="fa-solid fa-pen-to-square text-base hover:bg-inst-cafe hover:text-inst-cafe-oscuro p-2 rounded-lg transition"> </i>  
              </button>
              <button @click="abrirDetalle(emp)" title="Ver Detalles e Historial"> 
                <i class="fa-solid fa-eye text-base hover:bg-inst-cafe hover:text-inst-cafe-oscuro p-2 rounded-lg transition"> </i>  
              </button>
            </div>
          </template>
        </EasyDataTable>
      </div>
    </div>

    <!-- Modal Editar -->
    <div v-if="mostrarModalEditar" class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all" style="background-color: rgba(0,0,0,0.4); backdrop-filter: blur(4px);">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate__animated animate__fadeInDown">
        <div class="bg-inst-cafe-oscuro p-3 text-white font-bold flex justify-between items-center">
          <h3 class="font-bold text-lg uppercase">Actualizar Datos del Servidor Público</h3>
          <button @click="mostrarModalEditar = false" class="text-white text-2xl">&times;</button>
        </div>
        
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
            <input v-model="empleadoEditar.nombreCompleto" class="w-full p-2 border rounded shadow-sm focus:ring-2 focus:ring-blue-500 outline-none uppercase" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ID / Num Empleado</label>
            <input v-model="empleadoEditar.numeroEmpleado" class="w-full p-2 border rounded shadow-sm bg-gray-50 cursor-not-allowed" disabled />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Área de Adscripción</label>
            <select v-model="empleadoEditar.departamento" class="w-full p-2 border rounded bg-white shadow-sm outline-none">
              <option value="">Seleccione un Área...</option>
              <option v-for="area in areasAdscripcion" :key="area.id" :value="area.nombre">{{ area.nombre }}</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Fecha de Ingreso</label>
            <input type="date" v-model="empleadoEditar.fechaIngreso" class="w-full p-2 border rounded shadow-sm outline-none focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Régimen</label>
            <select v-model="empleadoEditar.regimen" class="w-full p-2 border rounded bg-white shadow-sm outline-none">
              <option value="NORMAL">NORMAL</option>
              <option value="ESPECIAL">ESPECIAL</option>
              <option value="LISTA">POR LISTA</option>
              <option value="EXENTO">EXENTO</option>
            </select>
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Turno/Horario</label>
            <select v-model="empleadoEditar.horarioId" class="w-full p-2 border rounded bg-white shadow-sm outline-none">
              <option v-for="h in horarios" :key="h.id" :value="h.id">{{ h.nombre }}</option>
            </select>
          </div>
          
          <div class="md:col-span-2 border-t pt-4 mt-2">
            <div class="flex items-center space-x-4">
              <label class="font-bold text-gray-700">¿ESTADO ACTUAL?</label>
              <button 
                @click="empleadoEditar.activo = !empleadoEditar.activo" 
                :class="empleadoEditar.activo ? 'bg-green-600' : 'bg-red-600'"
                class="px-4 py-1 rounded-full text-white font-bold transition flex items-center gap-2"
              >
                {{ empleadoEditar.activo ? 'ACTIVO' : 'BAJA' }}
                <i :class="empleadoEditar.activo ? 'fa-solid fa-circle-check' : 'fa-solid fa-circle-xmark'"></i>
              </button>
            </div>
          </div>

          <div v-if="!empleadoEditar.activo" class="md:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 bg-red-50 p-4 rounded-lg border border-red-200">
            <div>
              <label class="block text-xs font-bold text-red-700 uppercase mb-1">Fecha de Baja</label>
              <input type="date" v-model="empleadoEditar.fechaBaja" class="w-full p-2 border-red-300 border rounded shadow-sm outline-none" />
            </div>
            <div>
              <label class="block text-xs font-bold text-red-700 uppercase mb-1">Motivo de la Baja</label>
              <textarea v-model="empleadoEditar.motivoBaja" placeholder="Ej. Renuncia, Jubilación..." class="w-full p-2 border-red-300 border rounded shadow-sm outline-none"></textarea>
            </div>
          </div>
        </div>

        <div class="p-4 bg-gray-50 flex justify-end space-x-3">
          <button @click="mostrarModalEditar = false" class="px-6 py-2 border rounded-lg bg-gray-200 hover:bg-inst-cafe transition font-medium">Cancelar</button>
          <button @click="actualizarEmpleado" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg hover:bg-inst-secundario transition">Guardar Cambios</button>
        </div>
      </div>
    </div>

    <!-- Modal Detalles -->
    <div v-if="mostrarModalDetalle" class="fixed inset-0 z-50 flex items-center justify-center p-4 transition-all" style="background-color: rgba(0,0,0,0.4); backdrop-filter: blur(4px);">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate__animated animate__fadeInDown flex flex-col max-h-[85vh]">
        
        <div class="bg-inst-cafe-oscuro p-3 text-white font-bold flex justify-between items-center">
          <h3 class="font-bold text-lg uppercase"><i class="fa-solid fa-address-book mr-2"></i> Expediente del Servidor Público</h3>
          <button @click="mostrarModalDetalle = false" class="text-white text-2xl hover:text-gray-300">&times;</button>
        </div>
        
        <div class="flex border-b border-gray-200 bg-gray-50">
          <button 
            @click="tabActiva = 'datos'" 
            :class="tabActiva === 'datos' ? 'border-inst-primario text-inst-primario bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'" 
            class="flex-1 py-3 border-b-2 font-bold text-sm uppercase transition duration-200">
            <i class="fa-solid fa-user-tag mr-1"></i> Datos Generales
          </button>
          <button 
            @click="tabActiva = 'historial'" 
            :class="tabActiva === 'historial' ? 'border-inst-primario text-inst-primario bg-white' : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-100'" 
            class="flex-1 py-3 border-b-2 font-bold text-sm uppercase transition duration-200">
            <i class="fa-solid fa-clock-rotate-left mr-1"></i> Historial
          </button>
        </div>
        
        <div class="p-6 overflow-y-auto flex-1">
          
          <div v-if="tabActiva === 'datos'" class="space-y-6 animate__animated animate__fadeIn">
            <div class="text-center mb-6">
              <h4 class="text-2xl font-bold text-gray-800 uppercase">{{ empleadoDetalle.nombreCompleto }}</h4>
              <p class="text-gray-500 text-sm font-bold mt-1">No. Empleado: {{ empleadoDetalle.numeroEmpleado }}</p>
              
              <div class="mt-3">
                <span v-if="empleadoDetalle.activo" class="bg-green-100 text-green-800 px-3 py-1 rounded-full text-xs font-bold uppercase"><i class="fa-solid fa-circle-check mr-1"></i> Empleado Activo</span>
                <span v-else class="bg-red-100 text-red-800 px-3 py-1 rounded-full text-xs font-bold uppercase"><i class="fa-solid fa-circle-xmark mr-1"></i> Empleado Dado de Baja</span>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-4">
              <div class="bg-gray-50 p-3 rounded border border-gray-100">
                <p class="text-[10px] font-bold text-gray-400 uppercase">Área de Adscripción</p>
                <p class="text-sm font-bold text-gray-700 uppercase mt-1">{{ empleadoDetalle.departamento || 'No asignada' }}</p>
              </div>
              
              <div class="bg-gray-50 p-3 rounded border border-gray-100">
                <p class="text-[10px] font-bold text-gray-400 uppercase">Fecha de Ingreso</p>
                <p class="text-sm font-bold text-gray-700 mt-1 uppercase">{{ formatearFechaLocal(empleadoDetalle.fechaIngreso) }}</p>
              </div>

              <div class="bg-gray-50 p-3 rounded border border-gray-100">
                <p class="text-[10px] font-bold text-gray-400 uppercase">Régimen</p>
                <p class="text-sm font-bold text-gray-700 uppercase mt-1">{{ empleadoDetalle.regimen }}</p>
              </div>

              <div class="bg-gray-50 p-3 rounded border border-gray-100">
                <p class="text-[10px] font-bold text-gray-400 uppercase">Turno / Horario</p>
                <p class="text-sm font-bold text-gray-700 uppercase mt-1">{{ empleadoDetalle.horario?.nombre || 'No asignado' }}</p>
              </div>
            </div>

            <div v-if="!empleadoDetalle.activo" class="mt-4 bg-red-50 p-4 rounded-lg border border-red-200">
              <h5 class="font-bold text-red-800 text-sm mb-3 border-b border-red-200 pb-1 uppercase">Detalles de Baja</h5>
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p class="text-[10px] font-bold text-red-500 uppercase">Fecha de Baja</p>
                  <p class="text-sm font-bold text-red-900 mt-1 uppercase">{{ formatearFechaLocal(empleadoDetalle.fechaBaja) }}</p>
                </div>
                <div>
                  <p class="text-[10px] font-bold text-red-500 uppercase">Motivo</p>
                  <p class="text-sm font-bold text-red-900 mt-1">{{ empleadoDetalle.motivoBaja || 'No especificado' }}</p>
                </div>
              </div>
            </div>
          </div>

          <div v-if="tabActiva === 'historial'" class="animate__animated animate__fadeIn">
            <div v-if="!empleadoDetalle.historial || empleadoDetalle.historial.length === 0" class="text-sm text-gray-400 italic text-center py-10 bg-gray-50 rounded-lg border border-dashed border-gray-200">
              <i class="fa-solid fa-folder-open text-3xl mb-2 text-gray-300"></i><br>
              No hay movimientos registrados para este servidor público.
            </div>
            
            <div v-else class="space-y-6">
              <div v-for="mov in empleadoDetalle.historial" :key="mov.id" class="border-l-2 border-inst-primario pl-4 relative">
                <div class="absolute w-3 h-3 bg-inst-primario rounded-full -left-[7px] top-1 border-2 border-white shadow-sm"></div>
                <p class="text-[10px] font-bold text-gray-500 uppercase">{{ formatearFechaLocal(mov.fecha) }}</p>
                <p class="text-sm font-bold text-gray-800 uppercase mt-1">{{ mov.tipoMovimiento }}</p>
                <div v-if="mov.datoAnterior || mov.datoNuevo" class="mt-2 bg-gray-50 p-3 rounded shadow-sm text-xs text-gray-600 border border-gray-100">
                  <span v-if="mov.datoAnterior" class="block mb-1"><span class="text-gray-500 font-bold uppercase">De:</span> {{ mov.datoAnterior }}</span>
                  <span v-if="mov.datoNuevo" class="block"><span class="text-gray-500 font-bold uppercase">A:</span> {{ mov.datoNuevo }}</span>
                </div>
              </div>
            </div>
          </div>
          
        </div>

        <div class="p-4 bg-white border-t flex justify-end">
          <button @click="mostrarModalDetalle = false" class="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 transition font-bold text-gray-700">Cerrar Expediente</button>
        </div>
      </div>
    </div>

    <div v-if="vistaInterna === 'nuevo'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-inst-primario">
      <h2 class="text-xl font-bold mb-4 text-gray-800 uppercase">Alta Individual de Personal</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <div><label class="block text-sm font-medium text-gray-700 mb-1">No. Empleado</label><input v-model="formulario.numeroEmpleado" class="w-full p-2 border rounded outline-none" /></div>
        <div class="lg:col-span-2"><label class="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label><input v-model="formulario.nombreCompleto" class="w-full p-2 border rounded outline-none uppercase" /></div>
        
        <div class="lg:col-span-3">
          <label class="block text-sm font-medium text-gray-700 mb-1">Área de Adscripción</label>
          <select v-model="formulario.departamento" class="w-full p-2 border rounded outline-none bg-white">
            <option value="">Seleccione un Área...</option>
            <option v-for="area in areasAdscripcion" :key="area.id" :value="area.nombre">{{ area.nombre }}</option>
          </select>
        </div>
        
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Fecha de Ingreso</label><input type="date" v-model="formulario.fechaIngreso" class="w-full p-2 border rounded outline-none" /></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Régimen</label><select v-model="formulario.regimen" class="w-full p-2 border rounded outline-none bg-white"><option value="NORMAL">NORMAL</option><option value="ESPECIAL">ESPECIAL</option><option value="LISTA">POR LISTA</option><option value="EXENTO">EXENTO</option></select></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Horario</label><select v-model="formulario.horarioId" class="w-full p-2 border rounded outline-none bg-white"><option v-for="h in horarios" :key="h.id" :value="h.id">{{ h.nombre }}</option></select></div>
      </div>
      <div class="mt-6 flex justify-end"><button @click="guardarManual" class="bg-inst-primario hover:bg-inst-secundario text-white font-bold py-2 px-6 rounded shadow transition">Guardar Personal</button></div>
    </div>

  </div>
</template>

<style scoped>
.bg-inst-primario { background-color: #6B1C3A; }
.text-inst-primario { color: #6B1C3A; }
.border-inst-primario { border-color: #6B1C3A; }
.hover\:bg-inst-primario:hover { background-color: #6B1C3A; }
.bg-inst-secundario { background-color: #902c3e; }
.hover\:bg-inst-secundario:hover { background-color: #902c3e; }
.bg-inst-cafe { background-color: #e5e7eb; } 
.bg-inst-cafe-oscuro { background-color: #4b5563; } 

.img-strattia-style {
  --easy-table-header-background-color: #924156;
  --easy-table-header-font-color: #ffffff;
  --easy-table-border: 1px solid #cbd5e1;
  --easy-table-body-even-row-background-color: #f8fafc;
}

::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: #f1f1f1; border-radius: 4px; }
::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 4px; }
::-webkit-scrollbar-thumb:hover { background: #e0d2ba; }
</style>