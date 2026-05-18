<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';

const empleados = ref([]);
const horarios = ref([]); 
const vistaInterna = ref('lista'); 

// --- CAMBIO 1: Variables para la nueva tabla dinamica y el buscador ---
// Variable para almacenar el texto que se escriba en el buscador por nombre
const searchValue = ref('');

// Definicion de las columnas que requiere vue3-easy-data-table
// "text" es el titulo visible y "value" es el campo exacto de la base de datos
const headers = [
  { text: "Num Empleado", value: "numeroEmpleado", sortable: true },
  { text: "Nombre Completo", value: "nombreCompleto", sortable: true },
  { text: "Departamento", value: "departamento", sortable: true },
  { text: "Tipo de Horario", value: "regimen" }
];
// ----------------------------------------------------------------------

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
    Swal.fire('Atencion', 'Por favor selecciona un Horario.', 'warning');
    return;
  }

  try {
    const res = await fetch('http://localhost:3000/api/empleados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formulario.value)
    });
    
    if (res.ok) {
      Swal.fire({
        title: 'Registro Exitoso!',
        text: 'El servidor publico ha sido guardado en la base de datos.',
        icon: 'success',
        confirmButtonColor: '#2563eb', 
        confirmButtonText: 'Aceptar'
      });

      formulario.value = { numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL', horarioId: '' };
      cargarEmpleados();
      vistaInterna.value = 'lista';
    } else {
      Swal.fire({ title: 'Error', text: 'No se pudo guardar. Verifica que el ID no este duplicado.', icon: 'error', confirmButtonColor: '#ef4444' });
    }
  } catch (error) {
    Swal.fire('Error de conexion', 'No se pudo conectar con el servidor', 'error');
  }
};

const archivoCatalogo = ref(null);
const importando = ref(false);

const seleccionarArchivoCatalogo = (event) => {
  archivoCatalogo.value = event.target.files[0];
};

const procesarImportacion = async () => {
  if (!archivoCatalogo.value) {
    Swal.fire('Atencion', 'Selecciona un archivo Excel.', 'warning');
    return;
  }

  importando.value = true;
  const formData = new FormData();
  formData.append('archivoExcel', archivoCatalogo.value);

  try {
    const res = await fetch('http://localhost:3000/api/empleados/importar', { method: 'POST', body: formData });
    const data = await res.json();

    if (res.ok) {
      Swal.fire({ title: 'Catalogo Importado!', text: data.mensaje, icon: 'success', confirmButtonColor: '#16a34a' });
      archivoCatalogo.value = null;
      cargarEmpleados();
      vistaInterna.value = 'lista';
    } else {
      Swal.fire('Error', data.error, 'error');
    }
  } catch (error) {
    Swal.fire('Error', 'No se pudo conectar con el servidor', 'error');
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
      <button @click="vistaInterna = 'lista'" :class="vistaInterna === 'lista' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">📋 Ver Catálogo</button>
      <button @click="vistaInterna = 'nuevo'" :class="vistaInterna === 'nuevo' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">➕ Registro Manual</button>
      <button @click="vistaInterna = 'importar'" :class="vistaInterna === 'importar' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition"> Importar Excel</button>
    </div>

    <div v-if="vistaInterna === 'lista'" class="space-y-4">
      
      <div class="flex justify-between items-center bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
        <div class="w-full max-w-md">
          <label class="block text-xs font-bold uppercase text-inst-primario mb-1"> Buscar Servidor Público     <i class="fa-solid fa-magnifying-glass w-6 flex-shrink-0 text-center mr-3 text-lg"></i></label>
          <input 
            v-model="searchValue" 
            type="text" 
            placeholder="Escribe el nombre para filtrar..." 
            class="w-full p-2 border border-gray-300 rounded-lg outline-none focus:border-blue-500 transition shadow-sm text-sm"
          />
        </div>
        <div class="text-sm text-gray-500 font-medium">
          Total: <span class="font-bold text-gray-800">{{ empleados.length }}</span> registros
        </div>
      </div>

      <div class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden p-2">
        <EasyDataTable
          :headers="headers"
          :items="empleados"
          :search-value="searchValue"
          :rows-per-page="30"
          buttons-pagination
          theme-color="#2563eb"
          table-class-name="img-strattia-style"
        >
          <template #item-regimen="emp">
            <span :class="{
              'bg-blue-100 text-blue-800': emp.regimen === 'NORMAL',
              'bg-purple-100 text-purple-800': emp.regimen === 'ESPECIAL',
              'bg-orange-100 text-orange-800': emp.regimen === 'LISTA',
              'bg-gray-100 text-gray-800': emp.regimen === 'EXENTO'
            }" class="px-2 py-1 text-xs font-bold rounded-full">
              {{ emp.regimen }}
            </span>
          </template>
        </EasyDataTable>
      </div>
      </div>

    <div v-if="vistaInterna === 'nuevo'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-blue-600">
      <h2 class="text-xl font-bold mb-4 text-gray-800">Alta Individual de Personal</h2>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Número de Empleado / ID</label>
          <input v-model="formulario.numeroEmpleado" placeholder="Ej. 12345" class="w-full p-2 border rounded focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Nombre Completo</label>
          <input v-model="formulario.nombreCompleto" placeholder="APELLIDOS NOMBRE(S)" class="w-full p-2 border rounded focus:ring-blue-500 outline-none" />
        </div>
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Departamento</label>
          <input v-model="formulario.departamento" placeholder="Ej. Informática" class="w-full p-2 border rounded focus:ring-blue-500 outline-none" />
        </div>
 
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Asistencia</label>
          <select v-model="formulario.regimen" class="w-full p-2 border rounded bg-white focus:ring-blue-500 outline-none">
            <option value="NORMAL">Normal</option>
            <option value="ESPECIAL">Especial</option>
            <option value="LISTA">Por Lista </option>
            <option value="EXENTO">Exento</option>
          </select>
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Turno Asignado</label>
          <select v-model="formulario.horarioId" class="w-full p-2 border rounded bg-white focus:ring-blue-500 outline-none">
            <option value="" disabled>Selecciona un turno...</option>
            <option v-for="h in horarios" :key="h.id" :value="h.id">
              {{ h.nombre }} ({{ h.horaEntrada }} - {{ h.horaSalida }})
            </option>
          </select>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button @click="guardarManual" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow transition"> Guardar en Base de Datos</button>
      </div>
    </div>

    <div v-if="vistaInterna === 'importar'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-green-600">
      <h2 class="text-xl font-bold mb-2 text-gray-800">Carga Masiva de Personal</h2>
      <p class="text-sm text-gray-600 mb-6">Sube tu archivo Excel con las columnas: <strong>ID, Nombre, Departamento, Regimen</strong>.</p>
      
      <div class="border-2 border-dashed border-green-300 bg-green-50 p-8 text-center rounded-lg flex flex-col items-center">
        <div class="mb-4 text-green-600">
          <svg class="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
        </div>

        <input 
          type="file" 
          accept=".xlsx, .xls" 
          @change="seleccionarArchivoCatalogo"
          class="mb-6 block w-full max-w-md text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-green-100 file:text-green-800 hover:file:bg-green-200 cursor-pointer" 
        />
        
        <button 
          @click="procesarImportacion" 
          :disabled="importando"
          class="bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white font-bold py-2 px-8 rounded shadow transition flex items-center gap-2">
          <span v-if="importando">⏳ Procesando archivo...</span>
          <span v-else> Subir e Importar Catálogo</span>
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.img-strattia-style {
  --easy-table-header-background-color: #6B1C3A;
  --easy-table-header-font-color: #FFFFFF;
  --easy-table-header-font-size: 14px;
  
  --easy-table-body-row-font-color: #475569;
  --easy-table-body-row-font-size: 14px;

  /* Aquí está la magia de la cebra */
  --easy-table-body-even-row-background-color: #f1f5f9;
  --easy-table-body-even-row-font-color: #475569;

  --easy-table-body-row-hover-background-color: #e2e8f0;
  --easy-table-border: 1px solid #cbd5e1;
}
</style>