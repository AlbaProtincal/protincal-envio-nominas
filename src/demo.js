// Datos de demostración: todo inventado. Sirven para ver la pantalla sin conectar con Microsoft 365.
const KB = 1024;
// `nominas` = cuántas nóminas hay dentro del PDF (en la app real se cuenta leyendo el PDF).
const pdf = (ruta, kb = 110, modificado = 100, nominas = 1) => ({ ruta, bytes: kb * KB, modificado, nominas });

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
    pdf('panaderia luna nom 11.pdf', 128, 100, 4), pdf('talleres sol nom 11.pdf', 152, 100, 7), pdf('ferreteria mar nom 11.pdf', 104),
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
  // Tablero de contabilidad (inventado): hojas del CONTROL tal como las escribe el script.
  contabilidad: {
    costes: ['panaderia luna', 'talleres sol', 'optica norte', 'clinica norte', 'reformas pico', 'gimnasio vega', 'estudio rio', 'ferreteria mar']
      .map((n) => ({ nombre: `${n} costes 11.xlt`, modificado: 500 })),
    control: {
      Resumen: [
        ['Fichero origen', 'Cód. empresa', 'NIF', 'Razón social', 'Estado', 'Fichero importación', 'Trabajadores', 'Total bruto', 'Total líquido', 'Total liquidación SS'],
        ['panaderia luna costes 11.xlt', '101', 'B00000001', 'PANADERIA LUNA S.L.', 'OK', 'panaderia luna importar 11.xlsx', 4, 7200, 5900, 2350.4],
        ['talleres sol costes 11.xlt', '102', 'B00000002', 'TALLERES SOL S.L.', 'REVISAR', 'talleres sol importar 11.xlsx', 6, 11800, 9400, 3900.1],
        ['optica norte costes 11.xlt', '103', 'B00000003', 'OPTICA NORTE S.L.', 'OK', 'optica norte importar 11.xlsx', 2, 3900, 3200, 1210],
        ['clinica norte costes 11.xlt', '104', 'B00000004', 'CLINICA NORTE S.L.', 'OK', 'clinica norte importar 11.xlsx', 3, 6100, 4900, 1980.5],
        ['reformas pico costes 11.xlt', '105', 'B00000005', 'REFORMAS PICO S.L.', 'ERROR', 'reformas pico importar 11.xlsx', 5, 9800, 8100, 3100],
        ['gimnasio vega costes 11.xlt', '106', 'B00000006', 'GIMNASIO VEGA S.L.', 'OK', 'gimnasio vega importar 11.xlsx', 3, 4500, 3800, 1400],
        ['estudio rio costes 11.xlt', '107', 'B00000007', 'ESTUDIO RIO S.L.', 'OK', 'estudio rio importar 11.xlsx', 2, 5200, 4000, 1650],
        ['ferreteria mar costes 11.xlt', '108', '00000008T', 'MARTIN MAR LUIS', 'ERROR', 'ferreteria mar importar 11.xlsx', 1, 1300, 1150, 420],
      ],
      Incidencias: [
        ['Fichero', 'Nivel', 'Cód. trabajador', 'Trabajador', 'Detalle'],
        ['talleres sol costes 11.xlt', 'REVISAR', '4', 'ROCA LIMA, PABLO', 'Prestaciones IT pago delegado 812.40 restadas del coste SS empresa (criterio histórico)'],
        ['reformas pico costes 11.xlt', 'ERROR', '9', 'SANZ GIL, EVA', 'Trabajador sin ficha identificable en Quantum (sin coincidencia): darlo de alta o completar la tabla de trabajadores'],
        ['ferreteria mar costes 11.xlt', 'ERROR', '', '', 'NIF 00000008T sin trabajadores en la tabla de Quantum: completar la tabla (o la empresa no está en Quantum)'],
        ['panaderia luna costes 11.xlt', 'INFO', '3', 'LUZ PAZ, MAR', 'Código nóminas 3 → código Quantum 5 (LUZ PAZ, MAR)'],
      ],
    },
    cuadre: {
      Resumen: [
        ['Fichero origen', 'Cód. empresa', 'NIF', 'Razón social', 'Estado', 'Fichero importación', 'Trabajadores', 'Total bruto', 'Total líquido', 'Total liquidación SS', 'Total RLC (NIF)', 'Dif. RLC (NIF)'],
        ['optica norte costes 11.xlt', '103', 'B00000003', 'OPTICA NORTE S.L.', 'OK', 'x', 2, 3900, 3200, 1210, 1210.01, -0.01],
        ['clinica norte costes 11.xlt', '104', 'B00000004', 'CLINICA NORTE S.L.', 'ERROR', 'x', 3, 6100, 4900, 1980.5, 1940.5, 40],
        ['estudio rio costes 11.xlt', '107', 'B00000007', 'ESTUDIO RIO S.L.', 'OK', 'x', 2, 5200, 4000, 1650, 1650, 0],
      ],
      Incidencias: [['Fichero', 'Nivel', 'Cód. trabajador', 'Trabajador', 'Detalle']],
    },
    guardado: {
      version: 1, mes: 11, anio: 2026,
      empresas: {
        B00000003: { importado: { cuando: '2026-11-24T09:12:00Z', quien: 'demostración' } },
        B00000004: { importado: { cuando: '2026-11-24T09:20:00Z', quien: 'demostración' } },
        B00000006: { importado: { cuando: '2026-11-24T09:31:00Z', quien: 'demostración' } },
        B00000007: { importado: { cuando: '2026-11-24T09:40:00Z', quien: 'demostración' }, revisado: { cuando: '2026-12-09T11:00:00Z', quien: 'demostración' } },
      },
    },
  },
};
