# Secuencia TR desfasada: `TR_DUPLICADO`

**Síntoma.** Aceptar una oferta responde `409 TR_DUPLICADO`. En `/metrics` aparece
`asotracmet_errores_dominio_total{codigo="TR_DUPLICADO"}`.

**Causa.** El código lo genera la secuencia de `parametros.secuencia_tr` (`{ prefix, next }`) y
`trs.codigo` es único (RULE-015). Se desfasa si alguien insertó TR con códigos altos por fuera
(migración del Excel, restore de un backup viejo con parámetros nuevos, o al revés).

**Confirmar.**

```sql
select max((substring(codigo from 4))::int) as mayor from trs where codigo ~ '^TR-[0-9]+$';
select value from parametros where key = 'secuencia_tr';
```

Si `mayor >= next`, la secuencia está atrás.

**Actuar.** Como superadmin, desde `/admin/parametros` no se edita la secuencia (a propósito); se
hace por API para que quede auditado con antes y después:

```bash
curl -X PATCH https://turnos.<dominio>/api/v1/parametros \
  -H "authorization: Bearer <token superadmin>" -H "content-type: application/json" \
  -d '{"secuencia_tr":{"prefix":"TR-","next":<mayor + 1>}}'
```

Volver a aceptar la oferta: el motor toma el siguiente código libre.

**Nota sobre los TR legados.** Los viajes migrados del Excel llevan códigos sintéticos
`TR-1AAAAMMNNN` (once dígitos) precisamente para no chocar con la secuencia real (`TR-41947` en
adelante). No incluirlos al calcular `mayor`: filtrar `length(codigo) <= 9`.
