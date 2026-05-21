<script setup>
import { ref, onMounted, computed } from 'vue';
import Swal from 'sweetalert2';

const empleados = ref([]);
const horarios = ref([]); 
const vistaInterna = ref('lista'); 
const searchValue = ref('');

// Variables para edición
const mostrarModalEditar = ref(false);
const empleadoEditar = ref(null);

const headers = [
  { text: "Num Empleado", value: "numeroEmpleado", sortable: true },
  { text: "Nombre Completo", value: "nombreCompleto", sortable: true },
  { text: "Departamento", value: "departamento", sortable: true },
  { text: "Tipo de Horario", value: "regimen" },
  { text: "Estatus", value: "activo" }, // Nueva columna de estatus
  { text: "Acciones", value: "acciones" }  // Nueva columna de acciones
];

const formulario = ref({ 
  numeroEmpleado: '', 
  nombreCompleto: '', 
  departamento: '', 
  regimen: 'NORMAL',
  horarioId: '' 
});

const cargarEmpleados = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/empleados');
    empleados.value = await res.json();
  } catch (error) {
    console.error('Error cargando catalogo', error);
  }
};

const cargarHorarios = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/horarios'); 
    horarios.value = await res.json();
  } catch (error) {
    console.error('Error cargando horarios', error);
  }
};

const guardarManual = async () => {
  if (!formulario.value.horarioId) {
    Swal.fire('Atención', 'Por favor selecciona un Horario.', 'warning');
    return;
  }

  try {
    const res = await fetch('http://localhost:3000/api/empleados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formulario.value)
    });
    
    if (res.ok) {
      Swal.fire({ title: '¡Registro Exitoso!', icon: 'success', confirmButtonColor: '#2563eb' });
      formulario.value = { numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL', horarioId: '' };
      cargarEmpleados();
      vistaInterna.value = 'lista';
    } else {
      Swal.fire({ title: 'Error', text: 'Verifica que el ID no esté duplicado.', icon: 'error' });
    }
  } catch (error) {
    Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
  }
};

// --- LÓGICA DE EDICIÓN ---
const abrirEditar = (emp) => {
  // Clonamos el objeto para no modificar la tabla directamente antes de guardar
  empleadoEditar.value = { ...emp };
  // Si tiene fechaBaja, la formateamos para el input type="date" (YYYY-MM-DD)
  if (empleadoEditar.value.fechaBaja) {
    empleadoEditar.value.fechaBaja = empleadoEditar.value.fechaBaja.split('T')[0];
  }
  mostrarModalEditar.value = true;
};

const actualizarEmpleado = async () => {
  try {
    const res = await fetch(`http://localhost:3000/api/empleados/${empleadoEditar.value.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(empleadoEditar.value)
    });

    if (res.ok) {
      Swal.fire('¡Actualizado!', 'Los datos se han guardado correctamente.', 'success');
      mostrarModalEditar.value = false;
      cargarEmpleados();
    } else {
      Swal.fire('Error', 'No se pudo actualizar el registro.', 'error');
    }
  } catch (error) {
    Swal.fire('Error', 'Fallo de conexión.', 'error');
  }
};

// --- IMPORTACIÓN ---
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
    const res = await fetch('http://localhost:3000/api/empleados/importar', { method: 'POST', body: formData });
    const data = await res.json();
    if (res.ok) {
      Swal.fire({ title: '¡Catálogo Importado!', text: data.mensaje, icon: 'success' });
      archivoCatalogo.value = null;
      cargarEmpleados();
      vistaInterna.value = 'lista';
    }
  } catch (error) {
    Swal.fire('Error', 'Error en el servidor', 'error');
  } finally {
    importando.value = false;
  }
};

onMounted(() => {
  cargarEmpleados();
  cargarHorarios(); 
});
</script>

<template>
  <div class="space-y-6">
    <div class="flex space-x-4 mb-6">
      <button @click="vistaInterna = 'lista'" :class="vistaInterna === 'lista' ? 'bg-inst-primario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">📋 Ver Catálogo</button>
      <button @click="vistaInterna = 'nuevo'" :class="vistaInterna === 'nuevo' ? 'bg-inst-primario text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">➕ Registro Manual</button>
      <button @click="vistaInterna = 'importar'" :class="vistaInterna === 'importar' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">📥 Importar Excel</button>
    </div>

    <div v-if="vistaInterna === 'lista'" class="space-y-4">
      <div class="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div class="w-full max-w-md">
          <label class="block text-xs font-bold uppercase text-inst-primario mb-1">Buscar Servidor Público <i class="fa-solid fa-magnifying-glass ml-2 text-lg"></i></label>
          <input v-model="searchValue" type="text" placeholder="ID o Nombre..." class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm" />
        </div>
        <div class="text-sm text-gray-500 font-medium">Total: <span class="font-bold text-gray-800">{{ empleados.length }}</span> registros</div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-2">
        <EasyDataTable
          :headers="headers"
          :items="empleados"
          :search-value="searchValue"
          :rows-per-page="30"
          buttons-pagination
          theme-color="#902c3e"
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

          <template #item-activo="emp" > <!--   columna de estatus-->
            <span v-if="emp.activo" class="text-green-600 "><i class="fa-solid fa-circle-check text-base"></i> </span>
            <span v-else class="text-red-600 font-bold"><i class="fa-solid fa-circle-xmark text-base"></i> </span>
          </template>

          <template #item-acciones="emp">
            <button @click="abrirEditar(emp)" class=" "> <!-- boton editar empleado-->
              <i class="fa-solid fa-pen-to-square text-base hover:bg-inst-cafe hover:text-inst-cafe-oscuro p-2 rounded-lg transition"> </i>  
            </button>
          </template>
        </EasyDataTable>
      </div>
    </div>

    <div v-if="mostrarModalEditar" class="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div class="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden animate__animated animate__fadeInDown">
        <div class="bg-inst-primario p-4 text-white flex justify-between items-center">
          <h3 class="font-bold text-lg uppercase">Editar Servidor Público</h3>
          <button @click="mostrarModalEditar = false" class="text-white text-2xl">&times;</button>
        </div>
        
        <div class="p-6 grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Nombre Completo</label>
            <input v-model="empleadoEditar.nombreCompleto" class="w-full p-2 border rounded shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">ID / Num Empleado</label>
            <input v-model="empleadoEditar.numeroEmpleado" class="w-full p-2 border rounded shadow-sm bg-gray-50 cursor-not-allowed" disabled />
          </div>
          <div>
            <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Departamento</label>
            <input v-model="empleadoEditar.departamento" class="w-full p-2 border rounded shadow-sm focus:ring-2 focus:ring-blue-500 outline-none" />
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
          <button @click="mostrarModalEditar = false" class="px-6 py-2 border rounded-lg hover:bg-gray-200 transition">Cancelar</button>
          <button @click="actualizarEmpleado" class="px-6 py-2 bg-inst-primario text-white font-bold rounded-lg hover:bg-inst-secundario transition">Guardar Cambios</button>
        </div>
      </div>
    </div>

    <div v-if="vistaInterna === 'nuevo'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-inst-primario">
      <h2 class="text-xl font-bold mb-4 text-gray-800 uppercase">Alta Individual de Personal</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Num Empleado</label><input v-model="formulario.numeroEmpleado" class="w-full p-2 border rounded outline-none" /></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label><input v-model="formulario.nombreCompleto" class="w-full p-2 border rounded outline-none" /></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Departamento</label><input v-model="formulario.departamento" class="w-full p-2 border rounded outline-none" /></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Régimen</label><select v-model="formulario.regimen" class="w-full p-2 border rounded outline-none bg-white"><option value="NORMAL">NORMAL</option><option value="ESPECIAL">ESPECIAL</option><option value="LISTA">POR LISTA</option><option value="EXENTO">EXENTO</option></select></div>
        <div><label class="block text-sm font-medium text-gray-700 mb-1">Turno</label><select v-model="formulario.horarioId" class="w-full p-2 border rounded outline-none bg-white"><option v-for="h in horarios" :key="h.id" :value="h.id">{{ h.nombre }}</option></select></div>
      </div>
      <div class="mt-6 flex justify-end"><button @click="guardarManual" class="bg-inst-primario hover:bg-inst-secundario text-white font-bold py-2 px-6 rounded shadow transition">Guardar Personal</button></div>
    </div>

    <div v-if="vistaInterna === 'importar'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-green-600">
      <h2 class="text-xl font-bold mb-6 text-gray-800 uppercase text-center">Carga Masiva vía Excel</h2>
      <div class="border-2 border-dashed border-green-300 bg-green-50 p-10 text-center rounded-xl flex flex-col items-center">
        <i class="fa-solid fa-file-excel text-5xl text-green-600 mb-4"></i>
        <input type="file" @change="seleccionarArchivoCatalogo" class="mb-6 block text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-green-100 file:text-green-800 cursor-pointer" />
        <button @click="procesarImportacion" :disabled="importando" class="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-10 rounded-lg shadow transition">
          {{ importando ? '⏳ Procesando...' : 'Iniciar Importación' }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
/* Tu paleta de colores guinda institucional */
.bg-inst-primario { background-color: #6B1C3A; }
.text-inst-primario { color: #6B1C3A; }
.border-inst-primario { border-color: #6B1C3A; }
.hover\:bg-inst-primario:hover { background-color: #6B1C3A; }
.bg-inst-secundario { background-color: #902c3e; }
.hover\:bg-inst-secundario:hover { background-color: #902c3e; }

.img-strattia-style {
  --easy-table-header-background-color: #6B1C3A;
  --easy-table-header-font-color: #FFFFFF;
  --easy-table-border: 1px solid #cbd5e1;
  --easy-table-body-even-row-background-color: #f8fafc;
}
</style>