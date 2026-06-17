# Frontend - Sistema Biométrico

Este proyecto fue generado con Vite y Vue 3.

## Configuración Recomendada de IDE

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (deshabilita Vetur).

## Configuración Recomendada de Navegador

- Navegadores basados en Chromium (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Activar Custom Object Formatter en Chrome DevTools](http://bit.ly/object-formatters)

---
## PREPARACIÓN DEL PROYECTO

Instala las dependencias necesarias:

```sh
pnpm install
```
---

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



