# StatBet · La Bolsa de Hipótesis

Evaluación gamificada en tiempo real para **Análisis Cuantitativo de Datos** (estimación, pruebas de hipótesis, regresión lineal y ANOVA). Es la continuación de *TimeQuest / El Laboratorio Sellado*: mismo stack, misma forma de desplegar, pero ahora el reto no es solo acertar sino **saber lo que se sabe**.

Cada estudiante entra desde el celular, recibe **100 fichas** y juega solo. En cada ronda aparece una afirmación estadística (rotando por tema), por ejemplo:

> «Con este intervalo del 95 %, podemos asegurar que la media real está entre 12 y 15.»

Decide si es **Verdadera** o **Falsa** y cuántas fichas apuesta según qué tan seguro está. Si acierta gana lo apostado; si falla lo pierde. Al revelar, el proyector muestra en una mesa 3D cómo apostó el salón, la explicación y el error de concepto que la afirmación delata. Al final, la nota combina **aciertos** y **calibración**, y el docente recibe un reporte de los conceptos donde el curso apostó seguro y falló.

| Pantalla | Ruta | Quién la usa |
| --- | --- | --- |
| Estudiante | `/` (o `/?sala=CÓDIGO` desde el QR) | Cada estudiante en su celular |
| Panel del moderador | `/moderador` | Docente (pide la clave) |
| Proyector (mesa 3D) | `/proyector?sala=CÓDIGO` | Pantalla del salón |
| Informe imprimible / PDF | `/informe?sala=CÓDIGO` | Docente, después de la partida |

---

## 1. Ejecutar en tu computador

Requisitos: **Node.js 20 o superior**.

```bash
npm install
npm run dev        # recarga automática al editar; o "npm start"
```

Abre <http://localhost:3000/moderador>. En desarrollo la clave por defecto es **`profe123`** (cámbiala con la variable `MODERATOR_KEY`).

### Probar con celulares reales en la misma red Wi-Fi

1. Averigua la IP de tu computador (`ipconfig` en Windows, busca "Dirección IPv4", por ejemplo `192.168.1.40`).
2. Abre el panel y el proyector usando esa IP: `http://192.168.1.40:3000/moderador`. Así el QR del proyector apunta a una dirección que los celulares sí alcanzan (otra opción: define `PUBLIC_URL=http://192.168.1.40:3000`).
3. Si Windows pregunta por el firewall, permite el acceso de Node en redes privadas.

### Variables de entorno

Todas son opcionales en local; en producción solo `MODERATOR_KEY` es obligatoria. Ver [`.env.example`](.env.example).

| Variable | Para qué sirve | Por defecto |
| --- | --- | --- |
| `MODERATOR_KEY` | Clave del panel del moderador | `profe123` (solo en desarrollo) |
| `PORT` | Puerto HTTP | `3000` (Render lo define solo) |
| `REDIS_URL` | Guarda salas y banco en Render Key Value | vacío = archivos en `.data/` |
| `PUBLIC_URL` | URL base del QR y del enlace de ingreso | En Render usa `RENDER_EXTERNAL_URL` |
| `ROOM_TTL_HOURS` | Horas que se conserva una sala sin actividad | `12` |
| `STATEMENTS_FILE` | Banco de afirmaciones inicial | `data/statements.json` |
| `MAX_PLAYERS_PER_ROOM` | Tope de jugadores por sala | `80` |

---

## 2. Pruebas automáticas y herramientas

```bash
npm test                       # 27 pruebas: puntuación, calibración, motor de la bolsa, reporte y exportaciones
npm run validate:statements    # valida data/statements.json (o: npm run validate:statements -- otra-ruta.json)
npm run load-test              # simula un salón con 25 bots que apuestan y conduce la partida completa
```

Opciones de la prueba de carga (con el servidor encendido):

| Comando | Qué hace |
| --- | --- |
| `npm run load-test -- --bots 60 --pace 1` | Más bots y menos pausa entre rondas |
| `npm run load-test -- --hold` | Crea la sala y une los bots, pero tú conduces desde el panel (ideal para ver el proyector) |
| `npm run load-test -- --code ABC12` | Une bots a una sala que ya creaste |
| `npm run load-test -- --url https://statbet.onrender.com --key TU_CLAVE` | Contra el servidor desplegado |

Al terminar imprime la latencia de las apuestas y el podio.

### Pruebas manuales recomendadas antes de la clase

1. Abre `/moderador`, crea una sala y abre el proyector en otra ventana (o en el televisor).
2. Entra desde dos celulares (o un celular y una ventana de incógnito) con nombres distintos.
3. Inicia, apuesta desde ambos, cierra, revela y avanza un par de rondas. Comprueba que el celular muestra «Ganaste / Perdiste» y el cuadrante (Dominio, Duda, Prudencia, Error de concepto).
4. Recarga el celular a mitad de una ronda: debe volver a la partida con sus fichas y su apuesta.
5. Termina la partida, revela el podio y abre el informe desde la pestaña **Resultados**.

---

## 3. Guía para el día de la clase

1. **Antes**: abre el panel, revisa en **Ajustes** cuántas afirmaciones por tema (3 por defecto = 12 rondas) y los segundos por ronda (45). En **Banco** puedes editar, desactivar o agregar afirmaciones.
2. **Sala de espera**: proyecta `/proyector?sala=CÓDIGO`. Muestra el QR, el código y quién va entrando. Explica las reglas con la tarjeta del celular: apostar poco = «no estoy seguro», apostar todo = «estoy 100 % seguro».
3. **Cada ronda** (pestaña **En vivo**):
   - La afirmación aparece en el proyector y en los celulares; las fichas caen a la *bolsa* de la mesa sin revelar hacia qué lado.
   - La ronda se cierra sola al acabar el tiempo o cuando todos apostaron. Puedes **Cerrar**, dar **+15 s** o **Pausar**.
   - **Revelar**: la bolsa se reparte entre Verdadero (cian) y Falso (rosa), el banco cobra a los perdedores y paga doble a los ganadores. A los lados aparecen la distribución de seguridad, cuántos fallaron muy seguros, la explicación y el error frecuente.
   - **Siguiente** para continuar. El interruptor *spoiler* del panel muestra la respuesta correcta solo en tu pantalla.
4. **Cierre**: el proyector muestra «¿El salón sabe lo que sabe?» con los conceptos críticos, el acierto por tema y la curva de calibración. Luego **Revelar podio** muestra los *Lobos de la Bolsa* (por patrimonio) y el *Oráculo* (mejor calibración).
5. **Después**: en **Resultados** descarga el Excel o abre el informe imprimible (Ctrl+P → Guardar como PDF).

Las notas **no** se muestran en el proyector: cada estudiante ve la suya en el celular y el docente las ve en el panel y en el informe.

---

## 4. Cómo se califica

Para cada apuesta:

- **Confianza** $c$ = fichas apostadas ÷ fichas disponibles al abrir la ronda (0 a 1).
- **Probabilidad declarada** $p = 0{,}5 + 0{,}5\,c$: apostar casi nada es «moneda al aire» (50 %), apostar todo es «seguro al 100 %».
- **Calibración de la ronda** (puntuación de Brier): $s = 1 - (o - p)^2$, con $o = 1$ si acertó y $o = 0$ si falló. No apostar cuenta como $p = 0{,}5$ y como no acertada.

Nota final (0 a 5):

$$
\text{Nota} = 0{,}6 \cdot \underbrace{5 \cdot \tfrac{\text{aciertos}}{\text{rondas}}}_{\text{aciertos}} + 0{,}4 \cdot \underbrace{5 \cdot \operatorname{clamp}\left(\tfrac{\bar s - 0{,}5}{0{,}5}\right)}_{\text{calibración}}
$$

Los pesos (0,6 / 0,4) se cambian en **Ajustes**; el panel muestra cómo quedaría la nota en escenarios típicos (apostar siempre todo, siempre lo mínimo, apostar según la seguridad real…). La puntuación de Brier es una regla *propia*: la mejor estrategia esperada es apostar exactamente según lo seguro que uno está.

Cada apuesta cae en un cuadrante (umbral de confianza 50 %):

| | Apostó poco | Apostó fuerte |
| --- | --- | --- |
| **Acertó** | Duda: sabe, pero todavía duda | Dominio: sabe que sabe |
| **Falló** | Prudencia: sabe que no sabe | **Error de concepto**: cree saber algo que no es así |

El **índice de riesgo** de una afirmación es la confianza promedio perdida (la confianza de quienes fallaron, contando 0 a quienes acertaron). El reporte de conceptos críticos ordena las afirmaciones por ese índice: arriba quedan las que el curso falló apostando fuerte.

**Rescate del banco**: si al abrir una ronda un estudiante tiene menos fichas que la apuesta mínima (5), el banco le presta 30 para que siga jugando. El ranking del juego usa el patrimonio neto (fichas − préstamos), así que el préstamo no regala puestos.

Insignias: Oráculo, Lobo de la Bolsa, Pleno estadístico, Racha alcista, All-in ganador, Sabe lo que no sabe y Remontada.

---

## 5. Editar las afirmaciones

El banco inicial está en [`data/statements.json`](data/statements.json) (28 afirmaciones, 7 por tema). Cada afirmación tiene:

```json
{
  "id": "EST-1",
  "topic": 1,
  "truth": false,
  "difficulty": "media",
  "statement": "Con este intervalo del 95 %, podemos asegurar que la media real está entre 12 y 15.",
  "data": "IC del 95 % para μ: (12 ; 15)",
  "concept": "Interpretación del nivel de confianza",
  "explanation": "El 95 % describe el método, no este intervalo…",
  "misconception": "Confundir el nivel de confianza con certeza…",
  "active": true
}
```

Temas: `1` Estimación, `2` Prueba de hipótesis, `3` Regresión lineal, `4` ANOVA. Las rondas se intercalan por tema (1, 2, 3, 4, 1, 2…).

Desde el panel (pestaña **Banco**) se puede editar, agregar, desactivar, importar/exportar JSON y restaurar el original. Lo guardado en el panel queda en la persistencia (Key Value o `.data/`) y no modifica el archivo.

---

## 6. Desplegar en Render

El repositorio incluye un Blueprint ([`render.yaml`](render.yaml)) con el servicio web `statbet` y el Key Value `statbet-kv`.

1. Sube el proyecto a GitHub.
2. En Render: **New → Blueprint**, conecta el repositorio y escribe la `MODERATOR_KEY` cuando la pida.
3. Al terminar abre `https://statbet.onrender.com/moderador` (o la URL que asigne Render).

Notas:

- El plan **free** se duerme tras 15 minutos sin tráfico y tarda unos segundos en despertar. Abre el panel 5 minutos antes de la clase, o cambia a **starter** para que no se duerma.
- El Key Value conserva las salas y el banco aunque el servicio se reinicie o se redespliegue. Sin `REDIS_URL` se usan archivos en `.data/`, que en Render se pierden con cada despliegue.
- `/healthz` responde el estado del servidor y de la persistencia.

---

## 7. Estructura

```
src/
  server.js, app.js, config.js      servidor HTTP + Socket.IO, rutas, exportaciones
  lib/                              utilidades (errores, códigos, logs, límite de peticiones)
  modules/
    persistence/                    Key Value (ioredis) o archivos JSON
    statements/                     banco de afirmaciones: validación, selección, edición
    rooms/                          salas, jugadores, configuración
    market/marketEngine.js          rondas: abrir, apostar, cerrar, revelar, rescate, pausa
    scoring/                        calibración, nota, cuadrantes, insignias, reporte del curso
    realtime/                       vistas por rol (la verdad nunca llega antes de revelar) y sockets
    exports/                        CSV, Excel y JSON del informe
public/
  js/views/                         estudiante, proyector, moderador, banco, informe (Preact + htm, sin build)
  js/components/market3d.js         mesa 3D del proyector (three.js)
  css/                              sistema visual rosa / cian
data/statements.json                banco inicial
scripts/                            validación del banco y prueba de carga
tests/                              node:test
docs/DECISIONES.md                  decisiones de diseño
```

Decisiones de diseño y su justificación: [`docs/DECISIONES.md`](docs/DECISIONES.md).
