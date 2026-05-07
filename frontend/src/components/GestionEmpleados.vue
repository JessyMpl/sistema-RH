<script setup>
import { ref, onMounted } from 'vue';
import Swal from 'sweetalert2';

const empleados = ref([]);
const horarios = ref([]); // <-- 1. Cajita para guardar los horarios de la BD
const vistaInterna = ref('lista'); 

// 2. Agregamos horarioId al formulario
const formulario = ref({ 
  numeroEmpleado: '', 
  nombreCompleto: '', 
  departamento: '', 
  regimen: 'NORMAL',
  horarioId: '' 
});

// -- FUNCIONES PARA CARGAR DATOS --
const cargarEmpleados = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/empleados');
    empleados.value = await res.json();
  } catch (error) {
    console.error('Error cargando catálogo', error);
  }
};

const cargarHorarios = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/horarios'); // Ruta que crearemos en Node
    horarios.value = await res.json();
  } catch (error) {
    console.error('Error cargando horarios', error);
  }
};

// -- FUNCIÓN: REGISTRO MANUAL --
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
      Swal.fire({
        title: '¡Registro Exitoso!',
        text: 'El servidor público ha sido guardado en la base de datos.',
        icon: 'success',
        confirmButtonColor: '#2563eb', 
        confirmButtonText: 'Aceptar'
      });

      formulario.value = { numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL', horarioId: '' };
      cargarEmpleados();
      vistaInterna.value = 'lista';
    } else {
      Swal.fire({ title: 'Error', text: 'No se pudo guardar. Verifica que el ID no esté duplicado.', icon: 'error', confirmButtonColor: '#ef4444' });
    }
  } catch (error) {
    Swal.fire('Error de conexión', 'No se pudo conectar con el servidor', 'error');
  }
};

// -- FUNCIONES: IMPORTACIÓN MASIVA EXCEL --
const archivoCatalogo = ref(null);
const importando = ref(false);

const seleccionarArchivoCatalogo = (event) => {
  archivoCatalogo.value = event.target.files[0];
};

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
      Swal.fire({ title: '¡Catálogo Importado!', text: data.mensaje, icon: 'success', confirmButtonColor: '#16a34a' });
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

// -- AL CARGAR LA PANTALLA --
onMounted(() => {
  cargarEmpleados();
  cargarHorarios(); // Cargamos los horarios automáticamente
});
</script>
<template>
  <div class="space-y-6">
    <div class="flex space-x-4 mb-6">
      <button @click="vistaInterna = 'lista'" :class="vistaInterna === 'lista' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">📋 Ver Catálogo</button>
      <button @click="vistaInterna = 'nuevo'" :class="vistaInterna === 'nuevo' ? 'bg-blue-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">➕ Registro Manual</button>
      <button @click="vistaInterna = 'importar'" :class="vistaInterna === 'importar' ? 'bg-green-600 text-white shadow-md' : 'bg-white text-gray-600 border'" class="px-5 py-2 rounded-lg font-bold transition">📥 Importar Excel</button>
    </div>

    <div v-if="vistaInterna === 'lista'" class="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Nombre Completo</th>
            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Departamento</th>
            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Horario</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-gray-200">
          <tr v-for="emp in empleados" :key="emp.id" class="hover:bg-gray-50">
            <td class="px-6 py-4 text-sm font-mono text-gray-600">{{ emp.numeroEmpleado }}</td>
            <td class="px-6 py-4 text-sm font-medium text-gray-900">{{ emp.nombreCompleto }}</td>
            <td class="px-6 py-4 text-sm text-gray-500">{{ emp.departamento }}</td>
            <td class="px-6 py-4">
              <span :class="{
                'bg-blue-100 text-blue-800': emp.regimen === 'NORMAL',
                'bg-purple-100 text-purple-800': emp.regimen === 'ESPECIAL',
                'bg-orange-100 text-orange-800': emp.regimen === 'LISTA'
              }" class="px-2 py-1 text-xs font-bold rounded-full">{{ emp.regimen }}</span>
            </td>
          </tr>
          <tr v-if="empleados.length === 0">
            <td colspan="4" class="px-6 py-8 text-center text-gray-500 italic">No hay personal registrado.</td>
          </tr>
        </tbody>
      </table>
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
 
       <!-- Selector 1: Define CÓMO checa la persona -->
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Tipo de Asistencia</label>
          <select v-model="formulario.regimen" class="w-full p-2 border rounded bg-white focus:ring-blue-500 outline-none">
            <option value="NORMAL">Normal</option>
            <option value="ESPECIAL">Especial</option>
            <option value="LISTA">Por Lista </option>
          </select>
        </div>

        <!-- Selector 2: Define el HORARIO de la persona -->
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
        <button @click="guardarManual" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow transition">💾 Guardar en Base de Datos</button>
      </div>
    </div>
<!-- Pestaña 3: Importar -->
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
          <span v-else>🚀 Subir e Importar Catálogo</span>
        </button>
      </div>
    </div>
  </div>
</template>