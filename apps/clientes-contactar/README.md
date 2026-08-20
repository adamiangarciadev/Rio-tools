# Clientes a contactar

Panel de seguimiento comercial conectado al bot independiente `D:\Damian\clientes-contactar-bot`.

## Publicar la API

1. Crear un proyecto de Google Apps Script con la cuenta que edita la carpeta `RIO - Ventas x cliente`.
2. Copiar `apps-script.gs` y ejecutar una vez `probarConfiguracionClientesContactar` para autorizar Drive.
3. Implementar como Aplicación web: ejecutar como propietario y permitir acceso a cualquier usuario con el enlace.
4. Copiar la URL terminada en `/exec` dentro de `api-config.js` y en `CONTACTS_API_URL` del `.env` del bot.

La contraseña nunca se envía en texto: el navegador envía SHA-256. La API entrega una sesión temporal de seis horas. El bot utiliza una clave independiente.
