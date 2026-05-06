<script setup>
import { ref } from 'vue';
import SidebarRH from '@/components/SidebarRH.vue';

const vistaActiva = ref('reporte'); 
const archivoSeleccionado = ref(null);
const mensajeStatus = ref('');
const estaSubiendo = ref(false);
const datosExtraidos = ref(null); // <-- 1. Nueva cajita para guardar los datos

const seleccionarArchivo = (event) => {
  archivoSeleccionado.value = event.target.files[0];
  mensajeStatus.value = '';
  datosExtraidos.value = null; // Limpiamos la pantalla si seleccionas otro archivo
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
      // Le agregamos el total de filas que encontró Node.js
      mensajeStatus.value = `✅ ¡Éxito! ${data.mensaje} (Filas leídas: ${data.totalRegistros})`;
      // 2. Guardamos los datos para mostrarlos en la pantalla
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

    <main class="flex-1 p-8 overflow-y-auto"> <div v-if="vistaActiva === 'reporte'" class="bg-white rounded-lg shadow-md p-6 border-t-4 border-blue-600">
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

        <div v-if="datosExtraidos" class="bg-gray-800 text-green-400 p-4 rounded-lg overflow-x-auto text-left text-sm font-mono shadow-inner">
          <h3 class="text-white mb-4 font-bold text-lg border-b border-gray-600 pb-2">Datos extraídos por Node.js:</h3>
          <pre>{{ datosExtraidos }}</pre>
        </div>

      </div>

      <div v-else class="bg-white rounded-lg shadow-md p-10 text-center flex flex-col items-center justify-center">
        <div class="text-6xl mb-4">🚧</div>
        <h1 class="text-2xl font-bold text-gray-800 mb-2">Módulo en Construcción</h1>
        <p class="text-gray-500">Esta sección estará disponible en la próxima etapa del desarrollo.</p>
      </div>

    </main>
  </div>
</template>