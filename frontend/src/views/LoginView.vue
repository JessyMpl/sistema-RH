<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import Swal from 'sweetalert2';
import { apiUrl } from '@/utils/api';

import refinedLogos from '@/assets/logo-edomex-blanco.svg';
import photoWomenOffice from '@/assets/photo_women_office.jpg';

const email = ref('');
const password = ref('');
// Se eliminó la variable employeeCode que ya no se usa
const showPassword = ref(false); 
const router = useRouter();

const togglePasswordVisibility = () => {
  showPassword.value = !showPassword.value;
};

const intentarLogin = async () => {
  try {
    const respuesta = await fetch(apiUrl('/api/auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        email: email.value, 
        password: password.value
        // Se eliminó el envío de employeeCode
      })
    });

    const data = await respuesta.json();

    if (respuesta.ok) {
      localStorage.setItem('token', data.token);
      
      Swal.fire({
        icon: 'success',
        title: '¡Bienvenida!',
        text: 'Has iniciado sesión correctamente.',
        showConfirmButton: false,
        timer: 1500
      }).then(() => {
        router.push('/panel');
      });
      
    } else {
      Swal.fire({
        icon: 'error',
        title: 'Error de acceso',
        text: data.error || 'Correo o contraseña incorrectos.',
        confirmButtonColor: '#902c3e'
      });
    }
  } catch (error) {
    console.error(error);
    Swal.fire({
      icon: 'error',
      title: 'Problema de red',
      text: 'Error al conectar con el servidor. ¿Está encendido Node?',
      confirmButtonColor: '#902c3e'
    });
  }
};
</script>

<template>
  <main class="min-h-screen flex flex-col">
    <header class="bg-inst-primario text-white py-4 shadow-md">
      <!-- Se cambió justify-end por justify-center -->
      <div class="container mx-auto px-6 flex justify-end items-center">
        <img :src="refinedLogos" alt="Logotipos de Gobierno" class="h-11 w-auto">
      </div>
    </header>

    <div class="flex-grow flex flex-col md:flex-row">
      <div class="w-full md:w-2/3 bg-cover bg-center flex flex-col justify-end p-10 md:p-16 text-white relative" 
           :style="{ backgroundImage: `url(${photoWomenOffice})` }">
        <div class="absolute inset-0 bg-black opacity-30"></div>
        <div class="relative z-10 flex flex-col items-start gap-3">
          <h1 class="text-4xl md:text-5xl font-extrabold tracking-tight">BIENVENIDO AL SISTEMA DE ASISTENCIA RH</h1>
          <p class="text-xl md:text-2xl font-light">Secretaría de las Mujeres</p>
          
          <div class="flex items-center gap-3 mt-6 p-4 bg-white/10 rounded-lg">
            <p class="text-sm font-light italic">"Maximizando el impacto de nuestra misión."</p>
          </div>
        </div>
      </div>

      <div class="w-full md:w-1/3 bg-white flex flex-col items-center p-8 md:p-12 pt-24 md:pt-32 relative">
        <div class="w-full max-w-sm flex-grow">
          <div class="text-left mb-10">
            <h2 class="text-3xl font-bold text-inst-primario">Sistema de Control y Registro de Asistencia</h2>
          </div>

          <form @submit.prevent="intentarLogin" class="space-y-6">
            
            <div class="space-y-1">
              <label class="block text-sm font-semibold text-gray-800">Usuario:</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <i class="fa-solid fa-envelope"></i>
                </div>
                <input 
                  v-model="email" 
                  type="email" 
                  class="w-full pl-11 pr-4 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="su.correo@semujeres.mx"
                  required
                >
              </div>
            </div>

            <div class="space-y-1 relative">
              <label class="block text-sm font-semibold text-gray-800">Contraseña:</label>
              <div class="relative">
                <div class="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-gray-400">
                  <i class="fa-solid fa-lock"></i>
                </div>
                <input 
                  v-model="password" 
                  :type="showPassword ? 'text' : 'password'" 
                  class="w-full pl-11 pr-12 py-3 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="••••••••"
                  required
                >
                <button 
                  type="button" 
                  @click="togglePasswordVisibility"
                  class="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-600 focus:outline-none"
                >
                  <i :class="showPassword ? 'fa-solid fa-eye-slash' : 'fa-solid fa-eye'"></i>
                </button>
              </div>
              <div class="text-right mt-1">
                <a href="#" class="text-sm font-medium text-inst-primario hover:underline">Olvidé mi contraseña</a>
              </div>
            </div>

            <button 
              type="submit" 
              class="w-full bg-inst-primario text-white font-bold py-3 px-6 rounded-md hover:bg-inst-secundario transition duration-300 shadow-md transform hover:scale-105"
            >
              Iniciar Sesión
            </button>
          </form>
        </div>

        <!-- Se ajustó el espaciado (space-y-2) para separar un poco los textos -->
        <footer class="w-full max-w-sm text-center text-sm text-gray-500 mt-10 space-y-2">
          <p class="font-semibold text-gray-600">Soporte Técnico: 722 934 27 00 ext.: 82761</p>
          <p>&copy; 2026 Secretaría de las Mujeres.</p>
        </footer>

      </div>
    </div>
  </main>
</template>