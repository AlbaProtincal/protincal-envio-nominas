// Configuración de la app. Ninguno de estos valores es secreto: identifican la app registrada
// en el Microsoft 365 de PROTINCAL, pero no dan acceso a nada sin iniciar sesión.
export const CONFIG = {
  clientId: '29a13b9b-0cd6-438b-8cca-fbce50546774',
  tenantId: '9fa28f7b-d7d0-4040-899a-642a61a4a56e',
  // Solo desde esta dirección exacta permite Microsoft iniciar sesión.
  redirectUri: 'https://albaprotincal.github.io/protincal-envio-nominas/',
  permisos: ['User.Read', 'Files.ReadWrite', 'Mail.Read', 'Mail.Send'],
  // Carpeta de OneDrive donde están "Nóminas" y "Seguros Sociales".
  carpetaBase: 'PROTINCAL LABORAL',
  maestro: 'Nóminas/MAESTRO clientes nominas.xlsx',
};
