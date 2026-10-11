# Decisiones de diseño de StatBet

Este documento explica las decisiones que no son obvias leyendo el código, para poder revisarlas o cambiarlas con criterio.

## 1. «Una afirmación por cada tema»

La idea original dice que el estudiante ve «afirmaciones estadísticas, una por cada tema». Se interpretó como **rondas que rotan por tema**: Estimación → Hipótesis → Regresión → ANOVA → Estimación… Por defecto hay **3 afirmaciones por tema (12 rondas, unos 15 minutos)**, configurable de 1 a 7 en **Ajustes** (con 1 por tema quedan exactamente 4 rondas). Con un solo intento por tema la nota dependería demasiado de una sola afirmación; con 3 la calibración ya tiene sentido estadístico y el reporte por tema es más confiable.

Las afirmaciones se toman en el orden del banco o al azar (opción «Orden aleatorio»), siempre intercaladas por tema.

## 2. La confianza se mide con la fracción apostada

La confianza es `fichas apostadas / fichas disponibles al abrir la ronda`, no el número absoluto de fichas. Así, quien va perdiendo y tiene 40 fichas puede expresar el 100 % de seguridad igual que quien tiene 300. El saldo se congela al abrir la ronda para que cambiar la apuesta no altere la referencia.

La confianza se traduce en una probabilidad declarada `p = 0,5 + 0,5·c`: apostar lo mínimo equivale a «moneda al aire» y apostar todo a «estoy seguro». En el celular el estudiante ve esa traducción en vivo («Estoy 75 % seguro») para que entienda qué está declarando.

## 3. Calibración con la puntuación de Brier

Por ronda: `s = 1 − (o − p)²`. Se eligió Brier porque es una **regla de puntuación propia**: la estrategia que maximiza la puntuación esperada es declarar la seguridad real. Ni «apostar siempre todo» ni «apostar siempre lo mínimo» es una buena estrategia, y eso lo comprueban las pruebas automáticas (`escenarios: la honestidad le gana…`).

Se descartó la puntuación logarítmica porque castiga infinitamente un all-in fallido, y en un juego de clase eso se siente injusto y es difícil de explicar.

La calibración se escala a 0–5 con `5 · clamp((s̄ − 0,5) / 0,5)`: un promedio de 0,5 (apostar todo y acertar la mitad, o el equivalente) da 0 y un 1 perfecto da 5. Una ronda sin apuesta cuenta como `p = 0,5` (s = 0,75) y como no acertada: no apostar no se premia, pero tampoco se castiga tanto como un error de concepto.

## 4. Nota = 60 % aciertos + 40 % calibración

Los aciertos siguen pesando más porque la evaluación es de contenidos; la calibración agrega la dimensión metacognitiva sin dominarla. Los pesos se ajustan en **Ajustes** (entre 30/70 y 90/10) y el panel muestra una tabla de escenarios para ver el efecto antes de jugar.

## 5. Cuadrantes y el umbral del 50 %

Cada apuesta se clasifica con la confianza ≥ 50 % como «fuerte»:

- Acertó fuerte → **Dominio**
- Acertó con poco → **Duda**
- Falló con poco → **Prudencia**
- Falló fuerte → **Error de concepto**

El umbral del 50 % coincide con `p = 0,75`, el punto medio entre «moneda al aire» y «seguro». Es un valor fijo (constante `highConfidence`) para que los cuadrantes sean comparables entre grupos.

## 6. Reporte de conceptos críticos

El **índice de riesgo** de una afirmación es la confianza promedio perdida: la media de la confianza de quienes fallaron, contando 0 por quienes acertaron. Captura a la vez cuántos fallaron y qué tan seguros estaban, que es justo «donde el curso apostó con más confianza y falló». Las afirmaciones se ordenan por ese índice (desempate: cuántos fallaron muy seguros). El informe también agrupa por concepto y por tema, y dibuja la curva de calibración del curso (seguridad declarada frente a acierto real).

## 7. Rescate del banco y ranking por patrimonio

Si un estudiante queda por debajo de la apuesta mínima al abrir una ronda, el banco le presta 30 fichas para que siga participando: quedarse sin fichas no debe sacarlo de la evaluación. El préstamo no afecta la nota (la nota usa aciertos y calibración, no fichas), y el ranking del juego usa el **patrimonio neto** (fichas − préstamos), así que pedir rescates no regala puestos.

El ranking por fichas es la capa de juego (podio «Lobos de la Bolsa»); la **nota** es la capa de evaluación. Son independientes a propósito: se puede ganar el podio con apuestas audaces y aun así tener una calibración mediocre. El premio «Oráculo» reconoce la mejor calibración.

## 8. Privacidad de las notas

El proyector muestra el ranking por fichas, pero **nunca las notas**. Cada estudiante ve su nota, su calibración y su mapa de confianza en el celular; el docente las ve en el panel, el Excel y el informe. La posición en el ranking del estudiante se oculta en su celular hasta que el docente revela el podio, para no anticipar el final.

## 9. El servidor manda

La respuesta correcta y el reparto Verdadero/Falso de las apuestas **no salen del servidor** hasta revelar. Hay tres vistas separadas (`publicView`, `playerView`, `moderatorView`) y canales distintos por rol; el proyector solo sabe cuántas fichas hay en la bolsa. Las apuestas se validan en el servidor (ronda abierta, mínimo, saldo) y se pueden cambiar hasta que la ronda cierre.

## 10. 3D solo donde aporta

La mesa 3D (three.js) vive solo en el **proyector**, donde hay una pantalla grande y un equipo con GPU. En los celulares el efecto de profundidad se hace con CSS (fichas apiladas, moneda giratoria, tarjeta que voltea) para que funcione rápido en teléfonos modestos y con datos móviles. Si el navegador del proyector no tiene WebGL 2, la vista cae a un fondo plano con las mismas etiquetas y no se pierde información.

Las etiquetas del proyector son HTML anclado a puntos 3D de la mesa (no texto dibujado en WebGL): se leen nítidas a cualquier resolución y respetan los paneles laterales (`data-anchor-bound`).

## 11. Sistema visual rosa y cian

- Rosa `#ff4f9a` y cian `#22d3ee` son los colores de marca, sobre un azul tinta profundo `#0b1026` que les da contraste sin saturar.
- Se usan con significado, no como decoración: **cian = Verdadero**, **rosa = Falso**, en la mesa, los botones, las barras y el informe.
- Ganar y perder usan verde menta y coral, distintos de rosa/cian para que «Falso» no se confunda con «perdiste».
- Ningún dato depende solo del color: siempre va acompañado de texto o ícono (Verdadera/Falsa, Ganaste/Perdiste).
- Tipografías Sora (títulos y cifras) e Inter (texto), servidas localmente. Íconos SVG propios, sin emojis.
- Se respeta `prefers-reduced-motion`: sin animaciones de cámara ni caídas de fichas.

## 12. Continuidad con TimeQuest

Se mantuvieron el stack (Node 20+, Express 5, Socket.IO, Preact + htm sin compilación), la persistencia (Render Key Value o archivos), el despliegue con Blueprint, el panel del moderador con clave, las exportaciones CSV/XLSX, el informe imprimible y la prueba de carga con bots. Quien conozca TimeQuest puede leer StatBet sin aprender nada nuevo de infraestructura.
