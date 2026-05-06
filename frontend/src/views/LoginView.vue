<script setup>
import { ref } from 'vue';
import { useRouter } from 'vue-router'; // <-- Agregamos esta herramienta

const email = ref('');
const password = ref('');
const router = useRouter(); // <-- La activamos

const intentarLogin = async () => {
  try {
    const respuesta = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.value, password: password.value })
    });

    const data = await respuesta.json();

    if (respuesta.ok) {
      // Guardamos tu "gafete"
      localStorage.setItem('token', data.token);
      
      // ¡Teletransportación al Panel!
      router.push('/panel');
      
    } else {
      alert('Error: ' + data.error);
    }
  } catch (error) {
    console.error(error);
    alert('Error al conectar con el servidor.');
  }
};
</script>

<template>
  <div class="min-h-screen flex items-center justify-center">
    <div class="bg-white p-8 rounded-lg shadow-md w-96">
      <!-- Encabezado -->
      <div class="text-center mb-8">
        <h1 class="text-2xl font-bold text-gray-800">Sistema RH</h1>
        <p class="text-sm text-gray-500 mt-2">Ingresa tus credenciales para continuar</p>
      </div>

      <!-- Formulario -->
      <form @submit.prevent="intentarLogin" class="space-y-4">
        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Correo Electrónico</label>
          <input 
            v-model="email" 
            type="email" 
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="admin@semujeres.mx"
            required
          >
        </div>

        <div>
          <label class="block text-sm font-medium text-gray-700 mb-1">Contraseña</label>
          <input 
            v-model="password" 
            type="password" 
            class="w-full px-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
            placeholder="••••••••"
            required
          >
        </div>

        <button 
          type="submit" 
          class="w-full bg-blue-600 text-white font-bold py-2 px-4 rounded-md hover:bg-blue-700 transition duration-300"
        >
          Iniciar Sesión
        </button>
      </form>
    </div>
  </div>
</template>