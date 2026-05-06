<script setup>
import { useRouter } from 'vue-router';

const router = useRouter();

const cerrarSesion = () => {
  // Borramos el gafete de seguridad
  localStorage.removeItem('token');
  // Te regresamos a la pantalla de login
  router.push('/');
};
</script>

<template>
  <div class="min-h-screen bg-gray-100 p-8">
    <div class="max-w-4xl mx-auto bg-white rounded-lg shadow-md p-6 border-t-4 border-blue-600">
      <div class="flex justify-between items-center mb-6">
        <h1 class="text-3xl font-bold text-gray-800">Panel de Control RH</h1>
        <button 
          @click="cerrarSesion" 
          class="bg-red-500 text-white font-semibold py-2 px-4 rounded hover:bg-red-600 transition duration-300"
        >
          Cerrar Sesión
        </button>
      </div>
      
      <div class="bg-blue-50 border-l-4 border-blue-400 p-4 mb-4">
        <p class="text-blue-700">
          <strong>¡Bienvenida!</strong> Has iniciado sesión correctamente. Aquí es donde próximamente construiremos la herramienta para procesar el Excel.
        </p>
      </div>
    </div>
  </div>
</template>