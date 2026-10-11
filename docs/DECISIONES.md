# Decisiones de diseño

Notas sobre por qué StatBet funciona como funciona. Sirven para revisar o cambiar el comportamiento sabiendo qué se pensó en cada caso.

## Las rondas rotan por tema

La propuesta original habla de «una afirmación por cada tema». Con una sola afirmación por tema la nota quedaría en manos de cuatro respuestas, así que la partida intercala los temas (Estimación, Hipótesis, Regresión, ANOVA, y de nuevo) y por defecto usa tres afirmaciones de cada uno: doce rondas, unos quince minutos de clase. El docente puede bajarlo a una por tema o subirlo hasta siete desde los ajustes, y elegir si las afirmaciones salen en orden o al azar.

## La confianza es la fracción apostada

Lo que cuenta no es cuántas fichas se apuestan sino qué parte del saldo representan. Alguien que va perdiendo y tiene 40 fichas puede decir «estoy completamente seguro» igual que alguien con 300. El saldo de referencia es el que el estudiante tenía al abrir la ronda, de modo que cambiar la apuesta antes del cierre no altera la medida.

Esa fracción se convierte en una probabilidad: apostar lo mínimo equivale a lanzar una moneda (50 %) y apostar todo equivale a estar seguro (100 %). El celular muestra la traducción mientras el estudiante mueve el control («Estoy 75 % seguro»), para que entienda qué está declarando.

## Por qué Brier y no otra regla

La calibración de cada ronda se mide con la puntuación de Brier, `1 − (resultado − probabilidad)²`. Es una regla propia: la mejor estrategia posible es apostar según la seguridad real, y ningún atajo (siempre todo, siempre lo mínimo) da mejor resultado esperado. Las pruebas automáticas comparan esos escenarios para que la regla no se rompa con un cambio futuro.

Se descartó la puntuación logarítmica porque castiga sin límite un todo o nada fallido. En un juego de clase eso se siente injusto y cuesta explicarlo.

El promedio de Brier va de 0,5 a 1 en la práctica, así que se reescala a la nota de 0 a 5. Una ronda en la que el estudiante no apostó cuenta como una moneda al aire y como respuesta no acertada: no se premia quedarse quieto, pero tampoco pesa tanto como un error de concepto.

## La nota: 60 % aciertos y 40 % calibración

La actividad evalúa contenidos, así que los aciertos pesan más. La calibración agrega lo que interesa medir aquí, si el estudiante reconoce cuándo sabe y cuándo no, sin que se coma la nota. El docente puede mover los pesos entre 30/70 y 90/10, y el panel muestra cómo quedarían varios perfiles típicos antes de jugar.

## Cuadrantes con umbral del 50 %

Una apuesta se considera fuerte cuando arriesga la mitad del saldo o más, que equivale a declarar un 75 % de seguridad, el punto medio entre la duda total y la certeza. El umbral es fijo para que los cuadrantes (dominio, duda, prudencia y error de concepto) se puedan comparar entre grupos y semestres.

## Cómo se ordenan los conceptos críticos

Para cada afirmación se calcula la confianza promedio que se perdió: la seguridad de quienes fallaron, contando cero por quienes acertaron. Ese índice sube tanto si fallaron muchos como si los que fallaron estaban muy seguros, que es justo lo que el docente necesita encontrar. El informe ordena por ese índice y también agrupa por concepto y por tema, junto con la curva de calibración del curso.

## Rescates y ranking

Quedarse sin fichas no debería sacar a nadie de la evaluación. Si al abrir una ronda un estudiante tiene menos que la apuesta mínima, el banco le presta 30 fichas. El préstamo no afecta la nota, que depende de aciertos y calibración, y el ranking usa el patrimonio neto (fichas menos préstamos), así que pedir rescates no da ventaja.

El ranking y la nota son cosas distintas a propósito. El podio premia el juego, y alguien puede ganarlo con apuestas audaces aunque su calibración sea floja. Para equilibrar, el premio de «Oráculo» va a la mejor calibración del salón.

## Las notas no se proyectan

En el proyector solo aparece el juego: fichas, ranking y podio. Cada estudiante ve su nota en el celular, y el docente las ve en el panel, el Excel y el informe. La posición de cada estudiante tampoco aparece en su celular hasta que se revela el podio, para no anticipar el final.

## El servidor guarda el secreto

La respuesta correcta y el reparto de apuestas entre Verdadero y Falso no llegan a ningún navegador antes de revelar. El servidor arma una vista distinta para cada rol y la envía por canales separados; el proyector, durante la ronda, solo conoce cuántas fichas hay en la bolsa. Las apuestas se validan en el servidor y se pueden cambiar mientras la ronda siga abierta.

## 3D solo en el proyector

La mesa 3D con Three.js vive en el proyector, que suele ser un computador conectado a una pantalla grande. En los celulares la profundidad se logra con CSS (fichas apiladas, la moneda que gira, la tarjeta que se voltea), para que cargue rápido en teléfonos modestos y con datos móviles. Si el navegador del proyector no soporta WebGL 2, la vista pasa a un fondo plano con la misma información.

Los textos sobre la mesa son HTML anclado a puntos de la escena, no texto dibujado en 3D: se leen nítidos a cualquier resolución y se acomodan para no quedar detrás de los paneles laterales.

## Identidad visual

El rosa (`#ff4f9a`) y el cian (`#22d3ee`) son los colores de la marca, sobre un azul tinta (`#0b1026`) que les da contraste. No son decoración: el cian siempre significa Verdadero y el rosa Falso, en la mesa, los botones, las barras y el informe. Ganar y perder usan verde menta y coral para que «Falso» nunca se confunda con «perdiste», y ningún dato depende solo del color, siempre va acompañado de texto o de un ícono.

Las tipografías son Sora para títulos y cifras e Inter para el texto, servidas desde el propio servidor. Los íconos son SVG propios. Si el sistema pide reducir el movimiento, se desactivan la cámara en órbita y la caída de fichas.

## Mismo stack que TimeQuest

StatBet continúa la línea de TimeQuest (*El Laboratorio Sellado*): Node con Express, Socket.IO, Preact con htm sin compilación, persistencia en Render Key Value o en archivos, despliegue con Blueprint, exportaciones a Excel, informe imprimible y prueba de carga con bots. Quien conozca un proyecto puede mantener el otro sin aprender infraestructura nueva.
