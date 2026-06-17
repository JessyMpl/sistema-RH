## levantar el back 
node index.js

## levantar el front

npx pnpm run dev --host

## Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```

## BASE DE DATOS

npx prisma db push 
instrucción directa sincroniza el esquema de Prisma (schema.prisma) con la base de datos

npx prisma generate
instrucción genera el Prisma Client, que es la librería  para consultar la base de datos


para crear tablas hay que agregarlas en el archivo schema.prisma

con esta estructura 

// 8. NUEVA TABLA: Registros crudos del reloj checador externo
model RegistroBiometrico {
  id             Int      @id @default(autoincrement())
  numeroEmpleado String   // El número que envía el reloj checador (coincide con tu ServidorPublico)
  fechaHora      DateTime // Fecha y hora exacta de la lectura de huella
  tipo           String?  // Ej: "ENTRADA", "SALIDA" (Si el reloj lo manda, si no, puede quedar nulo)
  procesado      Boolean  @default(false) // Bandera para saber si ya lo calculaste en tu tabla Asistencia
  creadoEn       DateTime @default(now())
}