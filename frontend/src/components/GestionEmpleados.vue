<script setup>
import { ref, onMounted } from 'vue';

const empleados = ref([]);
const vistaInterna = ref('lista'); 
const formulario = ref({ numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL' });

const cargarEmpleados = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/empleados');
    empleados.value = await res.json();
  } catch (error) {
    console.error('Error cargando catálogo', error);
  }
};

const guardarManual = async () => {
  try {
    const res = await fetch('http://localhost:3000/api/empleados', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formulario.value)
    });
    if (res.ok) {
      alert('✅ Empleado guardado exitosamente');
      formulario.value = { numeroEmpleado: '', nombreCompleto: '', departamento: '', regimen: 'NORMAL' };
      cargarEmpleados();
      vistaInterna.value = 'lista';
    } else {
      alert('❌ Error al guardar el registro');
    }
  } catch (error) {
    alert('❌ Error de conexión');
  }
};

onMounted(cargarEmpleados);
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
            <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Régimen</th>
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
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Régimen</label>
          <select v-model="formulario.regimen" class="w-full p-2 border rounded bg-white focus:ring-blue-500 outline-none">
            <option value="NORMAL">NORMAL (Biométrico)</option>
            <option value="ESPECIAL">ESPECIAL (Guardias 1x1)</option>
            <option value="LISTA">LISTA (Asistencia LA)</option>
          </select>
        </div>
      </div>
      <div class="mt-6 flex justify-end">
        <button @click="guardarManual" class="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-6 rounded shadow transition">💾 Guardar en Base de Datos</button>
      </div>
    </div>

    <div v-if="vistaInterna === 'importar'" class="bg-white p-6 rounded-lg shadow-sm border-t-4 border-green-600">
      <h2 class="text-xl font-bold mb-2 text-gray-800">Carga Masiva de Personal</h2>
      <p class="text-sm text-gray-600 mb-6">Sube un archivo Excel para registrar múltiples empleados a la vez.</p>
      <div class="border-2 border-dashed border-gray-300 bg-gray-50 p-10 text-center rounded-lg">
        <div class="text-4xl mb-4">📊</div>
        <p class="text-gray-500 mb-4 font-medium">Módulo de importación en construcción</p>
      </div>
    </div>
  </div>
</template>