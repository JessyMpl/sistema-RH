<script setup>
import { ref } from 'vue';
import SidebarRH from '@/components/SidebarRH.vue';
import GestionEmpleados from '@/components/GestionEmpleados.vue'; // <-- 1. Importamos tu nuevo módulo

const vistaActiva = ref('reporte'); 
const archivoSeleccionado = ref(null);
const mensajeStatus = ref('');
const estaSubiendo = ref(false);
const datosExtraidos = ref(null);

const seleccionarArchivo = (event) => {
  archivoSeleccionado.value = event.target.files[0];
  mensajeStatus.value = '';
  datosExtraidos.value = null; 
};

const subirExcel = async () => {
  if (!archivoSeleccionado.value) {
    mensajeStatus.value = '⚠️ Por favor, selecciona un archivo Excel primero.';
    return;
  }
  estaSubiendo.value = true;
  mensajeStatus.value = '⏳ Subiendo y procesando archivo...';
  
  const formData = new FormData();
  formData.append('archivoExcel', archivoSeleccionado.value);

  try {
    const respuesta = await fetch('http://localhost:3000/api/excel/subir-asistencias', {
      method: 'POST',
      body: formData
    });
    
    const data = await respuesta.json();
    
    if (respuesta.ok) {
      mensajeStatus.value = `✅ ¡Éxito! ${data.mensaje} (Filas leídas: ${data.totalRegistros})`;
      datosExtraidos.value = data.datos; 
    } else {
      mensajeStatus.value = `❌ Error: ${data.error}`;
    }
  } catch (error) {
    mensajeStatus.value = '❌ Error al conectar con el servidor.';
  } finally {
    estaSubiendo.value = false;
  }
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 flex">
    
    <SidebarRH 
      :vistaActiva="vistaActiva" 
      @cambiar-vista="(nuevaVista) => vistaActiva = nuevaVista" 
    />

    <main class="flex-1 p-8 overflow-y-auto"> 
      
      <div v-if="vistaActiva === 'reporte'" class="bg-white rounded-lg shadow-md p-6 border-t-4 border-blue-600">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Procesar Asistencias (Excel)</h1>
        
        <div class="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center bg-gray-50 mb-6">
          <p class="text-gray-500 mb-6">Selecciona el archivo Excel (.xlsx, .xls) extraído del checador biométrico.</p>
          <div class="flex flex-col items-center justify-center gap-4">
            <input type="file" accept=".xlsx, .xls" @change="seleccionarArchivo"
              class="block w-full max-w-sm text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
            />
            <button @click="subirExcel" :disabled="estaSubiendo"
              class="mt-4 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-bold py-2 px-6 rounded-md shadow-sm transition">
              {{ estaSubiendo ? 'Procesando...' : 'Subir y Procesar Excel' }}
            </button>
          </div>
          <p v-if="mensajeStatus" class="mt-4 font-medium" :class="{'text-green-600': mensajeStatus.includes('✅'), 'text-red-600': mensajeStatus.includes('❌') || mensajeStatus.includes('⚠️'), 'text-blue-600': mensajeStatus.includes('⏳')}">
            {{ mensajeStatus }}
          </p>
        </div>

        <div v-if="datosExtraidos && datosExtraidos.length > 0" class="mt-8">
          <div class="flex justify-between items-center mb-4">
            <h3 class="text-xl font-bold text-gray-700">Previsualización de Datos en Bruto</h3>
            <div class="space-x-2">
              <span class="bg-blue-100 text-blue-800 text-xs font-bold px-3 py-1 rounded-full">
                {{ datosExtraidos.length }} Registros Extraídos
              </span>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden">
            <div class="overflow-x-auto">
              <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                  <tr>
                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">ID</th>
                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Servidor Público</th>
                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Departamento</th>
                    <th class="px-6 py-3 text-left text-xs font-bold text-gray-500 uppercase">Registro (Fecha/Hora)</th>
                  </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                  <tr v-for="(item, index) in datosExtraidos.slice(0, 100)" :key="index" class="hover:bg-gray-50 transition">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-600">
                      {{ item.ID || item.id || item.numeroEmpleado || '---' }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {{ item.Name || item.nombre || item.nombreCompleto || '---' }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {{ item.Department || item.departamento || '---' }}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                      {{ item.Time || item.fecha || item.hora || '---' }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            
            <div v-if="datosExtraidos.length > 100" class="bg-gray-50 px-6 py-3 text-center text-sm text-gray-500 border-t border-gray-200">
              Mostrando los primeros 100 registros de {{ datosExtraidos.length }}. El sistema procesará la totalidad de los datos.
            </div>
            
          </div>
        </div>
      </div>

      <div v-else-if="vistaActiva === 'empleados'">
        <h1 class="text-2xl font-bold text-gray-800 mb-6">Gestión de Personal</h1>
        <GestionEmpleados />
      </div>

      <div v-else class="bg-white rounded-lg shadow-md p-10 text-center flex flex-col items-center justify-center">
        <div class="text-6xl mb-4">🚧</div>
        <h1 class="text-2xl font-bold text-gray-800 mb-2">Módulo en Construcción</h1>
        <p class="text-gray-500">Esta sección estará disponible en la próxima etapa del desarrollo.</p>
      </div>

    </main>
  </div>
</template>