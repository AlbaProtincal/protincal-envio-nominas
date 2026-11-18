// Datos de demostración: todo inventado. Sirven para ver la pantalla sin conectar con Microsoft 365.
const KB = 1024;
const pdf = (ruta, kb = 110, modificado = 100) => ({ ruta, bytes: kb * KB, modificado });

export const demo = {
  mes: 11,
  anio: 2026,
  maestro: [
    ['CLIENTE / ALIAS NÓMINA', 'RAZÓN SOCIAL en RNT/RLC', 'EMAIL', 'RECIBE', 'A REVISAR / NOTAS', 'NÓMINAS INDIVIDUALES'],
    ['panaderia luna', 'PANADERIA LUNA, S.L.', 'administracion@panaderialuna.example', 'AMBAS', null, null],
    ['talleres sol', 'TALLERES SOL SL', 'oficina@talleressol.example', 'AMBAS', null, null],
    ['ferreteria mar', null, 'ferreteriamar@correo.example', 'NOMINA', null, null],
    ['optica norte', 'OPTICA NORTE SL', 'gestion@gruponorte.example', 'AMBAS', null, null],
    ['clinica norte', 'CLINICA NORTE SL', 'gestion@gruponorte.example', 'AMBAS', null, null],
    ['ingenieria delta', 'INGENIERIA DELTA SL', 'rrhh@ingenieriadelta.example', 'AMBAS', null, 'SI'],
    ['estudio rio', 'ESTUDIO RIO SL', 'hola@estudiorio.example', 'AMBAS', null, 'SI'],
    ['reformas pico', 'REFORMAS PICO SL', 'reformaspico@correo.example', 'AMBAS', null, null],
    ['gimnasio vega', 'GIMNASIO VEGA SL', 'info@gimnasiovega.example', 'AMBAS', null, null],
    ['libreria faro', null, null, 'NOMINA', 'Falta el correo', null],
    ['asesoria propia', 'ASESORIA PROPIA SL', null, 'NADA', 'No se envía nada', null],
    ['asociacion barrio', null, null, 'NOMINA', 'Cada nómina va al correo de su trabajadora', 'TRABAJADOR'],
  ],
  // Hoja Trabajadores: a qué correo va la nómina de cada trabajador (solo empresas marcadas TRABAJADOR).
  trabajadoresMaestro: [
    ['EMPRESA', 'NOMBRE EN LA NÓMINA', 'EMAIL'],
    ['asociacion barrio', 'LUCIA PRADO NAVA', 'lucia.prado@correo.example'],
  ],
  nominas: [
    pdf('panaderia luna nom 11.pdf', 128), pdf('talleres sol nom 11.pdf', 152), pdf('ferreteria mar nom 11.pdf', 104),
    pdf('optica norte nom 11.pdf', 119), pdf('clinica norte nom 11.pdf', 133),
    pdf('ingenieria delta nom 11.pdf', 121),
    pdf('estudio rio nom 11.pdf', 136),
    pdf('ESTUDIO RIO/CARLA MORA VIDAL nom 11.pdf', 105, 200), pdf('ESTUDIO RIO/HUGO PENA SOTO nom 11.pdf', 105, 200),
    pdf('ESTUDIO RIO/NOA REY CANO nom 11.pdf', 106, 200),
    pdf('gimnasio vega nom 11.pdf', 115), pdf('libreria faro nom 11.pdf', 103), pdf('asesoria propia nom 11.pdf', 111),
    pdf('floristeria valle nom 11.pdf', 109),
    pdf('asociacion barrio nom 11.pdf', 113),
    pdf('ASOCIACION BARRIO/LUCIA PRADO NAVA nom 11.pdf', 104, 200), pdf('ASOCIACION BARRIO/IRENE COSTA BLANCO nom 11.pdf', 104, 200),
    { ruta: 'panaderia luna costes 11.xls', bytes: 50 * KB }, { ruta: 'talleres sol costes 11.xls', bytes: 52 * KB },
  ],
  rnt: [
    pdf('PANADERIA LUNA, S.L..pdf', 233), pdf('TALLERES SOL SL.pdf', 234), pdf('TALLERES SOL SL (2).pdf', 233),
    pdf('OPTICA NORTE SL.pdf', 233), pdf('CLINICA NORTE SL.pdf', 234), pdf('INGENIERIA DELTA SL.pdf', 233),
    pdf('ESTUDIO RIO SL.pdf', 234), pdf('REFORMAS PICO SL.pdf', 233), pdf('GIMNASIO VEGA SL.pdf', 233),
    pdf('ASESORIA PROPIA SL.pdf', 233), pdf('FLORES DEL VALLE SL.pdf', 233),
  ],
  rlc: [
    pdf('PANADERIA LUNA, S.L..pdf', 236), pdf('TALLERES SOL SL.pdf', 236), pdf('TALLERES SOL SL (2).pdf', 236),
    pdf('OPTICA NORTE SL.pdf', 236), pdf('CLINICA NORTE SL.pdf', 236), pdf('INGENIERIA DELTA SL.pdf', 236),
    pdf('ESTUDIO RIO SL.pdf', 236), pdf('REFORMAS PICO SL.pdf', 236), pdf('GIMNASIO VEGA SL.pdf', 236),
    pdf('ASESORIA PROPIA SL.pdf', 236), pdf('FLORES DEL VALLE SL.pdf', 236), pdf('RLC.pdf', 334),
  ],
  // Lo que saldría al dividir cada PDF conjunto (en la app real se lee del propio PDF).
  trabajadores: { 'ingenieria delta nom 11.pdf': ['MARTA GIL SANZ', 'PABLO ROCA LIMA'] },
  enviados: [{ id: 'gimnasio vega', cuando: '18/11/2026 09:12' }],
};
