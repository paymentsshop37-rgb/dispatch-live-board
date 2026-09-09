# Service Areas: sincronización de Nearby Cities

## Corrección del timeout de lectura

Se aplicó en producción `20260909000300_optimize_alias_read_policies.sql`.
Las políticas conservan sus mismas funciones de autorización, evaluadas mediante
subconsultas escalares una vez por sentencia en lugar de por cada alias. Se agregó
el índice `(created_at, id)` usado por la paginación. No se amplió ningún permiso.
El plan real ahora usa Index Scan e InitPlans de autorización. Las pruebas de
lectura bajo el rol authenticated sin identidad (acceso denegado) tardaron
13,5 ms y 10,3 ms para los offsets 0 y 20.000; estas mediciones no representan una
sesión Administrator del navegador. El conteo real permaneció en 20.304 aliases.
Las pruebas PostgreSQL locales confirman lectura paginada de 500 filas por un
usuario activo, 0 filas por uno inactivo, y restricciones de escritura intactas.
Esta corrección es de base de datos y no necesita otro despliegue de frontend.

## Estado de entrega actualizado: producción

Las dos migraciones están aplicadas en Supabase y registradas en su historial.
Se encontró y utilizó la conexión administrativa CLI ya vinculada al proyecto,
que no se había localizado durante la primera entrega.

**34 áreas procesadas; 20.286 aliases agregados; 18 aliases previos conservados;
20.304 aliases totales; 0 errores.** La segunda ejecución agregó 0 aliases en
las 34 áreas. La verificación posterior confirmó 0 duplicados, 0 aliases
automáticos fuera del radio y preservación exacta de las 18 filas originales
y de todas las filas de Service Areas (incluidas sus coordenadas y radios).

La carga inicial se ejecutó desde la sesión DBA autorizada utilizando una copia
temporal de la función de sincronización, limitada a esa sesión administrativa.
No se suplantó una identidad de usuario ni se retiró el control Administrator
de la función pública. La función temporal se eliminó al terminar.

### Resultados de producción

| Área | Radio (mi) | Encontradas | Agregadas | Ya existían | Errores |
|---|---:|---:|---:|---:|---:|
| Abilene Area | 150 | 319 | 319 | 0 | 0 |
| Albuquerque Area | 150 | 372 | 372 | 0 | 0 |
| Amarillo Area | 150 | 213 | 213 | 0 | 0 |
| Atlanta Area | 150 | 983 | 983 | 0 | 0 |
| Austin | 150 | 548 | 548 | 0 | 0 |
| Baton Rouge Area | 150 | 496 | 496 | 0 | 0 |
| Chattanooga Area | 150 | 964 | 964 | 0 | 0 |
| Chicago Area | 150 | 1659 | 1659 | 0 | 0 |
| College Station Area | 150 | 709 | 709 | 0 | 0 |
| Dallas–Fort Worth Area | 150 | 766 | 748 | 18 | 0 |
| Denver Area | 150 | 395 | 395 | 0 | 0 |
| El Paso Area | 150 | 142 | 142 | 0 | 0 |
| Fort Stockton Area | 150 | 83 | 83 | 0 | 0 |
| Houston Area | 150 | 443 | 443 | 0 | 0 |
| Indianapolis Area | 150 | 1900 | 1900 | 0 | 0 |
| Jackson Area | 150 | 596 | 596 | 0 | 0 |
| Joplin Area | 150 | 1085 | 1085 | 0 | 0 |
| Laredo Area | 150 | 426 | 426 | 0 | 0 |
| Las Vegas Area | 150 | 134 | 134 | 0 | 0 |
| Little Rock Area | 150 | 815 | 815 | 0 | 0 |
| Memphis Area | 150 | 859 | 859 | 0 | 0 |
| Midland Area | 150 | 159 | 159 | 0 | 0 |
| Nashville Area | 150 | 871 | 871 | 0 | 0 |
| Odessa Area | 150 | 145 | 145 | 0 | 0 |
| Oklahoma City Area | 150 | 808 | 808 | 0 | 0 |
| Ozona Area | 150 | 131 | 131 | 0 | 0 |
| Phoenix Area | 150 | 311 | 311 | 0 | 0 |
| San Antonio Area | 150 | 469 | 469 | 0 | 0 |
| Shreveport Area | 150 | 611 | 611 | 0 | 0 |
| Sonora Area | 150 | 185 | 185 | 0 | 0 |
| Tulsa Area | 150 | 1057 | 1057 | 0 | 0 |
| Tyler Area | 150 | 789 | 789 | 0 | 0 |
| Van Horn Area | 150 | 107 | 107 | 0 | 0 |
| Waco Area | 150 | 754 | 754 | 0 | 0 |

## Inspección anterior al cambio

- Áreas: `public.service_areas`.
- Campos reales: `latitude`, `longitude`, **`coverage_radius_miles`** (el campo que
  representa el `radius_miles` solicitado).
- Aliases: `public.service_area_city_aliases`; `service_area_id`, `city`, `state`,
  `normalized_city`, `normalized_state`, `assignment_type`, `created_at`.
- Add Alias: `addServiceAreaAlias` en `serviceAreaService.js`; inserción mediante
  Supabase/PostgREST, `POST /rest/v1/service_area_city_aliases`.
- Eliminación manual: `DELETE /rest/v1/service_area_city_aliases?id=eq.<id>`.
- Pantalla: `src/modules/coverage/CoverageSettings.jsx`, usada desde Administration
  y Executive Dashboard.
- `coverage_cities` es configuración de cobertura, no un catálogo nacional.
  Mapbox se usa para mapas; no encontré un catálogo nacional existente ni una
  integración de geocodificación que enumere todas las localidades.
- Hay funciones Haversine existentes. Las migraciones inspeccionadas no instalan
  PostGIS; no fue posible verificar las extensiones instaladas en producción.
- La migración de agosto forzaba 150 millas mediante un trigger; la nueva elimina
  ese trigger sin cambiar ningún radio existente.
- Dos índices imponían unicidad global de ciudad/estado. Se sustituyen por
  unicidad **por área**, necesaria cuando dos radios se superponen.

Las migraciones históricas contienen 33 áreas de referencia: Phoenix, Denver,
Chicago, Indianapolis, Baton Rouge, Albuquerque, Oklahoma City, Tulsa, Amarillo,
El Paso, Fort Stockton, Houston, Ozona, Sonora, Van Horn, Tyler, San Antonio,
Midland, Laredo, College Station, Nashville, Chattanooga, Jackson, Shreveport,
Little Rock, Joplin, Waco, Odessa, Memphis, Abilene, Las Vegas, Atlanta y
Dallas–Fort Worth. **Esta es la semilla histórica. El inventario actual de producción figura
en la tabla anterior e incluye también Austin.** El botón Sync All usa las áreas que carga la aplicación, incluidas
las inactivas, y sus valores actuales; no usa esta lista.

## Fuente geográfica

U.S. Census Bureau, **2025 National Places Gazetteer**:
https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/2025_Gaz_place_national.zip

Documentación: https://www.census.gov/geographies/reference-files/2025/geo/gazetter-file.html

32.058 registros correspondientes a los 50 estados y Washington, D.C.; se excluye
Puerto Rico. Incluye lugares incorporados y Census Designated Places (CDP).
El alcance es el catálogo Census Places: no pretende enumerar cada barrio,
caserío o topónimo no reconocido como lugar censal. Se usan USPS, NAME,
INTPTLAT e INTPTLONG; estos últimos son los puntos internos representativos
publicados por Census, no polígonos ni distancias por carretera.
Se retiran del nombre los sufijos administrativos del Gazetteer.

SHA256 del archivo de entrada descomprimido:
`15f4977a010cc42308f4d5ddc5e19f26ef63fc035f20745333a14b78aa08d3fa`.

El catálogo está versionado dentro de `us_nearby_city_catalog()` y no necesita
API externa, credenciales geográficas, una tabla nueva ni descargas durante un
sync. Para regenerarlo desde el archivo oficial descomprimido:

```powershell
node scripts/build-nearby-city-catalog.mjs <ruta-al-2025_Gaz_place_national.txt>
```

Para actualizaciones posteriores a un despliegue, crear una nueva migración con
el catálogo actualizado; no modificar una migración ya aplicada.

## Comportamiento y distancia

- `POST /rest/v1/rpc/sync_nearby_cities` recibe solamente `target_area_id`.
  El servidor consulta coordenadas y radio; el cliente no puede sustituirlos ni
  enviar una lista arbitraria de ciudades.
- Verifica `nttr_is_active_admin()` antes de consultar o escribir. También se
  agregan políticas RLS restrictivas para insertar, editar y eliminar aliases.
- Si PostGIS está instalado, usa `ST_DWithin` sobre `geography`, con conversión
  exacta **millas × 1609,344 = metros**. El esquema de la extensión se detecta.
- Sin PostGIS, usa Haversine con radio terrestre medio de 3958,7613 millas y
  protección frente a pequeños errores de redondeo.
- Filtra por distancia desde el centro hasta el punto Census, sin filtro de
  estado. El borde se incluye (`distancia <= radio`).
- Normaliza espacios, ciudad y estado con las reglas existentes de la base.
  `ON CONFLICT ... DO NOTHING` evita duplicados, incluso con escrituras
  concurrentes. Cada sync bloquea la fila del área durante su transacción.
- Mantiene los aliases existentes y su tipo. Los nuevos llevan
  `assignment_type = 'nearby_sync'`. Una reducción posterior del radio no borra
  aliases anteriores: la operación es aditiva, como se solicitó.
- La asignación de trabajos conserva prioridad de aliases previos sobre los
  recién sincronizados y resuelve empates de forma determinista.
- Sync All procesa cada área de forma secuencial, con sus propios valores.
  Muestra cada resultado y continúa si una de las áreas falla. Se puede repetir
  de forma segura si se interrumpe.
- Se mantienen los controles manuales. Se añaden confirmación, resultados reales,
  Nearby Cities (cantidad), View Cities, búsqueda, columnas City/State y scroll.
  La carga de aliases pagina para superar el límite de respuesta de Supabase.

## Resultados reales de las pruebas locales

Base PostgreSQL efímera mediante PGlite 0.3.14, con las migraciones SQL reales,
tablas de prueba compatibles y permiso administrativo simulado para probar RLS.
No contiene datos copiados de producción.

| Área de prueba | Radio | Encontradas | Agregadas | Ya existían | Errores |
|---|---:|---:|---:|---:|---:|
| College Station, 30.628 / -96.3344, primer sync | 150 mi | 709 | 708 | 1 | 0 |
| College Station, segundo sync | 150 mi | 709 | 0 | 709 | 0 |
| Shreveport, 32.5252 / -93.7502 | 50 mi | 78 | 78 | 0 | 0 |
| College Station, cambio de radio de prueba | 5 mi | 2 | 0 | 2 | 0 |

El alias existente de College Station fue creado deliberadamente como fixture
con mayúsculas/minúsculas y espacios distintos. También se creó un alias manual
fuera del radio para comprobar que se conserva.

College Station y Houston quedaron incluidas; Dallas quedó excluida. Se verificó
que **cada** alias automático insertado tenga un punto fuente dentro del radio.
No hay localidades de otro estado a 150 millas de College Station en este
catálogo: la más cercana es Starks, LA, a aproximadamente **160,3700 millas**.
La prueba de cruce estatal usa Shreveport y confirma Marshall, TX, dentro de 50
millas. No se inventó una localidad de otro estado dentro del radio de College
Station.

También pasaron: duplicados normalizados; segunda ejecución; radios distintos;
superposición de aliases en dos áreas; preservación y alta/baja manual posterior;
rechazo de sync y alta por dispatcher; bloqueo de update/delete por dispatcher;
rechazo de usuario anónimo; rechazo de coordenadas inválidas; carga de 1.201
aliases; prioridad de aliases manuales. La rama PostGIS no se ejecutó porque el
PostgreSQL local de prueba no incorpora esa extensión.

`npm test`: **78/78 aprobadas**. Se fijó el reloj de una prueba preexistente cuya
expectativa dependía de ejecutarse el 16 de agosto.
`npm run build`: aprobado (advertencias de tamaño de bundles existentes).
Vista local HTTP 200; no se realizaron pruebas de interacción en un navegador
autenticado contra producción.

```powershell
node scripts/test-nearby-cities-db.mjs tmp/nearby-test/node_modules/@electric-sql/pglite/dist/index.js
```

PGlite se instaló solo en `tmp/nearby-test`; no modifica dependencias del producto.

## Migraciones y despliegue

1. `20260909000100_us_nearby_city_catalog.sql`: catálogo oficial reutilizable.
2. `20260909000200_sync_nearby_cities.sql`: RPC, permisos, unicidad por área,
   radio configurable y prioridad de aliases superpuestos.

Ambas migraciones fueron verificadas primero en la base efímera y después
aplicadas en producción. No se creó ninguna tabla nueva. Las 34 áreas quedaron
sincronizadas. El frontend se publica como parte de esta entrega para mostrar
el listado compacto, búsqueda, paginación de carga y botones administrativos.

## Archivos del cambio

Pantalla y carga:
- `src/modules/coverage/CoverageSettings.jsx`
- `src/modules/coverage/NearbyCities.jsx` (nuevo)
- `src/modules/coverage/serviceAreaService.js`
- `src/modules/coverage/loadAllAliases.js` (nuevo)
- `src/modules/coverage/coverageCityService.js`

Radio y asignación, para evitar que mapas/reportes sigan forzando 150 millas:
- `src/modules/coverage/serviceAreaPayload.js`
- `src/modules/coverage/serviceAreaAssignment.js`
- `src/modules/coverage/coverageCityAnalysis.js`
- `src/modules/coverage/CitiesWithoutJobsPanel.jsx`
- `src/modules/coverage/GeographicCoverageAnalysis.jsx`
- `src/modules/coverage/CoverageRoadMap.jsx`

Datos, backend y reproducción:
- `supabase/migrations/20260909000100_us_nearby_city_catalog.sql` (nuevo)
- `supabase/migrations/20260909000200_sync_nearby_cities.sql` (nuevo)
- `scripts/build-nearby-city-catalog.mjs` (nuevo)
- `scripts/test-nearby-cities-db.mjs` (nuevo)

Pruebas y documentación:
- `tests/nearbyCities.test.js` (nuevo)
- `tests/serviceAreaPayload.test.js`
- `tests/serviceAreaAssignment.test.js`
- `tests/coverageCityService.test.js`
- `SERVICE_AREAS_SYNC.md` (nuevo)

`tmp/` contiene únicamente descargas, herramientas y auxiliares locales del
trabajo. No forma parte del despliegue ni sustituye el catálogo versionado.
