# Lavandería a domicilio con agenda

_Started 2026-07-13 15:40 UTC_

---

## User

Necesito crear un website para mi lavanderia a domicilio, debe tener un apartado donde puedan ver el catalogo con precios y detalles de como hacemos cada proceso o que incluye, un apartado de Academy donde enseñamos algunos casos de procesos que puedes hacer en casa, casos donde ya no se puede arreglar la prenda, etc, y el mas importante un apartado para agendar, te explico el flujo de agenda ingresar direccion (validacion de cobertura) - ingresar telefono - escoger horario de recoleccion - agregar detalles (opcional) hacer pago por adelantado (opcional) - listo

## Assistant

_[tool: questions_v2]_

## User

Questions answered:
- nombre: La Laundry
- estilo: azul y naranja vintage
- catalogo: Lavanderia
Ropa y Ropa de Cama $40
por Kg
Recolección y entrega gratis en ordenes superiores a $300, tardamos alrededor de 72 horas en tener listo tu pedido.

Edredón $160
Matrimonial +$10, Queen +$20, King +$30, Pluma +$55
Tenis $150
Gorras $80
Gamuza y Ante +$20
Almohada $170
Queen y King +$30
Mochila $140
Maleta o grande +$30, Cuero +$40
Cubrecolchón $300
Matrimonial +$30, Queen +$70, King +$100 
Sneakers Lavado en Seco $250
Botas Lavado en Seco $300
Bolsas Mantenimiento desde $250
Tintoreria
Saco $140
Recolección y entrega gratis en ordenes superiores a $300

Vestido $200
Sueter $130
Pantalón $140
Falda $110
Camisa $110
Abrigo $230
Gabardina $250
Corbata $110
Seda o Lino +$40
Bolsas $140
Cham. Piel $900
Otros
Planchado $35
Recolección y entrega gratis en ordenes superiores a $300

Planchado Largo $60
Desmanchado $100 por pieza
Planchado Mantel $140m2
Transporte Sencillo $70
Transporte Sencillo $70
Suelas amarillas $150
Lavado a mano $70 por prenda
agendar
Bolsa desde $140
Teñido desde $300
Vestido de Novia desde $1,500
Lavado enzimatico desde $100
- academy: Dejalo abierto, despues agrego el contenido 
- cobertura: Debe poder ser validado en maps y de una lista de CPs que compartire despues 
- pago: Pago en linea, el pago con tarjeta y efectivo solo disponibles hasta pagar a la entrega 
- fidelidad: Solo visual (clicable pero sin lógica real)
- paginas: Páginas separadas: Inicio, Catálogo, Academy, Agendar

## Assistant

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

_[tool: dc_write]_

4 páginas listas: Inicio, Catálogo, Academy y Agendar (flujo completo con stepper). Verificando.

_[tool: ready_for_verification]_

Listo — 4 páginas navegables (Inicio, Catálogo, Academy, Agendar) en estilo azul marino y naranja vintage, con el flujo de agenda completo (dirección→teléfono→horario→detalles→pago→confirmación). Academy quedó con estructura lista para que agregues contenido. Cuando tengas la lista de CPs, la integro a la validación.

