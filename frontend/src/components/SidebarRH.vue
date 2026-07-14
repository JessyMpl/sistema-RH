<script setup>
import { useRouter } from 'vue-router';
import logoSemujeres from '@/assets/logo-semujeres.svg';

// Recibimos la variable 'vistaActiva' desde el Panel
defineProps({
  vistaActiva: String
});

// Preparamos el emisor para avisarle al Panel que queremos cambiar de vista
const emit = defineEmits(['cambiar-vista']);

const router = useRouter();

const cerrarSesion = () => {
  localStorage.removeItem('token');
  router.push('/');
};
</script>

<template>
  
  <aside class="w-64 bg-inst-primario text-white flex flex-col min-h-screen">
    <div class="p-6 text-center border-b border-white/20">
      <img src="/src/assets/colibri_cafe.svg" alt="Logo" class="w-22 h-22 mx-auto mb-4 rounded-full">
      <h2 class="text-1.7xl font-bold text-white">Control de Asistencia</h2>
      <p class="text-xs text-white mt-1 ">Sistema Recursos Humanos</p>
    </div>

   <nav class="flex-1 p-4 space-y-2">
      <button @click="emit('cambiar-vista', 'reporte')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'reporte' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-fingerprint w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Procesar Datos</span>
      </button>

      <button @click="emit('cambiar-vista', 'eventos')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'eventos' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-clock-rotate-left w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Eventos</span>
      </button>

        <button @click="emit('cambiar-vista', 'consultas')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'consultas' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-magnifying-glass w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Consultas</span>
      </button>

       <button @click="emit('cambiar-vista', 'empleados')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'empleados' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-users w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight"> Gestión Personal</span>
      </button>

       <button @click="emit('cambiar-vista', 'justificaciones')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'justificaciones' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-file-pen w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Justificaciones</span>
      </button>

        <button @click="emit('cambiar-vista', 'sanciones')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'sanciones' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-circle-exclamation w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Sanciones</span>
      </button>

      <button @click="emit('cambiar-vista', 'reporteFinal')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'reporteFinal' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-calendar w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight"> Reportes </span>
      </button>
      

      <button @click="emit('cambiar-vista', 'perfil')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition', vistaActiva === 'perfil' ? 'bg-inst-secundario' : 'hover:bg-inst-secundario']">
        <i class="fa-solid fa-gear w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Configuración</span>
      </button>
    </nav>

    <div class="p-4 border-t border-white/20">
      <button @click="cerrarSesion" class="w-full flex items-center px-4 py-2 text-white rounded-lg transition">
        <i class="fa-solid fa-arrow-right-from-bracket w-6 text-center mr-2 text-lg"></i>
        <span class="hover:underline ">Cerrar Sesión</span>
      </button>
    </div>
  </aside>

  <!--  (Independiente del menú) -->
  <div class="fixed top-6 right-8 z-50 flex items-center gap-6 bg-gray-100/80 backdrop-blur-sm px-4 py-2 rounded-xl ">
    <!-- Botón de Guía -->
    <!-- Logo SEMUJERES -->
    <img 
      :src="logoSemujeres" 
      alt="SEMUJERES" 
      class="h-10 w-auto object-contain drop-shadow-sm"
    >
  </div>
</template>