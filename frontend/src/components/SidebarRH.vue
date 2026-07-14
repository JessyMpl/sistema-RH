<script setup>
import { useRouter } from 'vue-router';
import logoSemujeres from '@/assets/logo-semujeres.svg';

defineProps({
  vistaActiva: String
});

const emit = defineEmits(['cambiar-vista']);
const router = useRouter();

const cerrarSesion = () => {
  localStorage.removeItem('token');
  router.push('/');
};
</script>

<template>
  
  <aside class="w-64 bg-inst-primario text-white flex flex-col min-h-screen fixed left-0 top-0 bottom-0 z-40 shadow-2xl">
    
    <div class="p-6 text-center border-b border-white/10">
      <img src="/src/assets/colibri_cafe.svg" alt="Logo" class="w-22 h-22 mx-auto mb-4 rounded-full shadow-md">
      <h3 class="text-xl font-bold text-white tracking-wide">Control de Asistencia</h3>
      <p class="text-xs text-white/80 mt-1 uppercase tracking-wider font-semibold">Sistema Recursos Humanos</p>
    </div>

   <nav class="flex-1 p-4 space-y-1.5 overflow-y-auto">
      
      <!-- Se cambió text-gray-300 por text-white/80 -->
      <button @click="emit('cambiar-vista', 'reporte')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'reporte' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-fingerprint w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Procesar Datos</span>
      </button>

      <button @click="emit('cambiar-vista', 'eventos')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'eventos' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-clock-rotate-left w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Eventos</span>
      </button>

      <button @click="emit('cambiar-vista', 'consultas')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'consultas' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-magnifying-glass w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Consultas</span>
      </button>

      <button @click="emit('cambiar-vista', 'empleados')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'empleados' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-users w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Gestión Personal</span>
      </button>

      <button @click="emit('cambiar-vista', 'justificaciones')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'justificaciones' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-file-pen w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Justificaciones</span>
      </button>

      <button @click="emit('cambiar-vista', 'sanciones')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'sanciones' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-circle-exclamation w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Sanciones</span>
      </button>

      <button @click="emit('cambiar-vista', 'reporteFinal')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'reporteFinal' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-calendar w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Reportes</span>
      </button>
      
      <button @click="emit('cambiar-vista', 'perfil')"
        :class="['w-full flex items-center px-4 py-3 rounded-lg transition-all duration-200', 
                 vistaActiva === 'perfil' ? 'bg-inst-secundario text-white font-bold shadow-md' : 'text-white/80 hover:bg-white/10 hover:text-white']">
        <i class="fa-solid fa-gear w-6 flex-shrink-0 text-center mr-3 text-lg"></i>
        <span class="text-left leading-tight">Configuración</span>
      </button>
    </nav>

    <div class="p-4 border-t border-white/10">
      <button @click="cerrarSesion" class="w-full flex items-center px-4 py-3 text-white/80 rounded-lg transition-colors duration-200 hover:bg-red-500/20 hover:text-red-200">
        <i class="fa-solid fa-arrow-right-from-bracket w-6 text-center mr-3 text-lg"></i>
        <span class="font-medium">Cerrar Sesión</span>
      </button>
    </div>
  </aside>

  <div class="fixed top-6 right-8 z-50 flex items-center gap-6 bg-white/90 backdrop-blur-md px-5 py-2.5 rounded-xl shadow-sm border border-gray-200">
    <img 
      :src="logoSemujeres" 
      alt="SEMUJERES" 
      class="h-9 w-auto object-contain"
    >
  </div>
</template>