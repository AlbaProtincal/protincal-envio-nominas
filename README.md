# protincal-envio-nominas

Aplicación interna de PROTINCAL para el envío mensual a cada cliente de su nómina + RNT + RLC.

**En este repositorio va solo código. Nunca datos de clientes** (ni el maestro, ni PDF, ni listados de carpetas).
Los documentos y el maestro viven en el OneDrive de PROTINCAL.

## Estado

| Pieza | Estado |
|---|---|
| Motor de emparejamiento y pre-chequeo (`src/motor.js`) | Hecho y probado |
| División de nóminas en individuales (`src/dividir.js`) | Hecho y probado |
| Lectura de carpetas y maestro desde OneDrive (Microsoft Graph) | Pendiente del registro de la app en Microsoft 365 |
| Envío de correos y verificación en Enviados | Pendiente |
| Pantalla (página web) | Pendiente |

## Qué hace el motor

Recibe el maestro y los listados de las tres carpetas del mes y devuelve, por cliente:

- **LISTO**: tiene todos sus documentos y no se le ha enviado. Lleva la lista exacta de adjuntos.
- **PENDIENTE**: le falta algún documento. No se envía a medias.
- **YA_ENVIADO**: consta en el registro del mes o en Enviados (mismo destinatario y asunto).
- **INCIDENCIA**: sin correo, correo mal escrito, dos nóminas candidatas o un fichero que casa con dos filas.
- **NO_SE_ENVIA**: el maestro dice `NADA`.

Además lista los **huérfanos**: ficheros que no casan con ninguna fila del maestro y que no se adjuntan a nadie.

### Reglas

- El emparejamiento sale solo del maestro (`MAESTRO clientes nominas.xlsx`, hoja `Maestro`), nunca por parecido.
- Nómina: PDF de `Nóminas/MMAAAA` cuyo nombre contiene el alias (por palabras completas) y termina en ` MM`.
  Los ficheros de costes y de importación a Quantum nunca se envían.
- Si existe una subcarpeta con el nombre exacto de un alias, se envían las nóminas individuales que contiene
  en lugar de la nómina conjunta.
- RNT y RLC: PDF de `Seguros Sociales/AAAA/MM.AAAA/RNT|RLC` (mes anterior al de la nómina) cuyo nombre es la
  razón social del maestro, o la razón social seguida de un número de cuenta (`(2)`).
  Solo se tolera la puntuación; una razón social parecida no casa.
- Si dos clientes comparten correo, el asunto lleva el nombre de la empresa.
- Comprobación final: ningún fichero puede quedar asignado a dos correos.

## Nóminas individuales

Los clientes con `SI` en la columna F del maestro (`NÓMINAS INDIVIDUALES`) no reciben el PDF conjunto,
sino una nómina por trabajador. Paso previo al envío:

1. Se lee cada página del PDF conjunto: empresa, CIF, trabajador, DNI y periodo.
2. Se corta en un PDF por trabajador (las páginas consecutivas del mismo DNI van juntas), con el nombre
   `NOMBRE APELLIDOS nom MM.pdf`.
3. Se guardan en una subcarpeta con el alias del cliente en mayúsculas (`Nóminas/MMAAAA/ALIAS/`).

No se divide nada si alguna página no se lee con certeza, si el periodo no es el del mes, si el PDF mezcla
empresas o si dos trabajadores darían el mismo nombre de fichero. Mientras no esté dividido, el cliente queda
PENDIENTE y el PDF conjunto no se adjunta nunca. Si el conjunto se vuelve a guardar después de dividirlo,
hay que dividir otra vez.

## Pruebas

```
npm test
```

Usan datos inventados. Para probar contra un mes real, con los datos fuera del repositorio:

```
node herramientas/prueba-real.mjs <maestro.json> <listado.tsv> <mes> <año> [corte_epoch] [alias_ya_enviados]
node herramientas/prueba-dividir.mjs <mes> <año> <carpeta_salida> <pdf>...
```
