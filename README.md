# Pronóstico del ITAEE de Jalisco

Página con los resultados del pronóstico del ITAEE de Jalisco: cinco modelos (ETS, regresión y ARIMAX con EMEC/EMIM), seis combinaciones, intervalos de predicción, validación cruzada y pesos. Se publica en GitHub Pages con GitHub Actions.

## Qué incluye

- **Modelos:** suavización exponencial (ETS), regresión lineal y ARIMA estacional con exógenas, estos dos últimos con EMEC mayoreo, EMEC menudeo y EMIM en versión *promedio* y *último mes* del trimestre.
- **Combinaciones (6):** promedio simple; ponderada con **1/RMSE**; con **1/MSE**; y con los criterios de información **BIC**, **AIC** y **AICc**.
- **Intervalos de predicción al 95%:** el propio de cada modelo y el de la validación (centro ± t·RMSE). Las combinaciones usan el de la validación. Se revisa la cobertura.
- **Dos escenarios para las exógenas:** *pronosticadas* (con suavización exponencial) y *observadas* (el valor real donde INEGI ya lo publicó; hoy, la EMEC de 2026T3). En la validación, el escenario “observadas” es un pronóstico condicional, no uno en tiempo real.

## Estructura

```
├── notebook_estimacion.ipynb      # análisis paso a paso; la sección 7 exporta los resultados a la página
├── src/
│   ├── modelos.py                 # los 5 modelos, intervalos, criterios de información, validación cruzada
│   ├── evaluacion.py              # medidas de error, pesos, combinaciones, intervalos de validación, cobertura
│   ├── estimar.py                 # corre todo (correr) o desde la terminal: python src/estimar.py
│   └── exportar.py                # escribe site/data/resultados.json y resultados/*.csv
├── datos/
│   ├── series_macro_jalisco_trimestral.csv   # ITAEE + EMEC + EMIM trimestral (lo lee el notebook)
│   └── emim_jalisco_ventas_corrientes.csv    # EMIM mensual por subsector, pesos corrientes (fuente)
├── resultados/                    # medidas_error_{pron,obs}.csv, validacion_cruzada_{pron,obs}.csv
├── site/                          # la página (HTML + CSS + JS, sin build)
│   └── data/resultados.json       # lo único que lee la página
└── .github/workflows/deploy.yml   # publica site/ en Pages con cada push
```

## Datos

- **ITAEE:** INEGI, índice de volumen físico, base 2018 = 100, **serie original**, total de la actividad económica, Jalisco. 2003T1–2026T2.
- **EMEC:** comercio al por mayor y al por menor, Jalisco, índice base 2018. Trimestralizado como promedio de los 3 meses (`_prom`) y último mes (`_ultimo_mes`). La fila de 2026T3 (sin ITAEE todavía) trae la EMEC ya observada, que usa el escenario “observadas”.
- **EMIM:** ventas de la industria manufacturera de Jalisco, en términos reales e índice 2018 = 100, con las mismas dos versiones. Disponible desde 2018; la de 2026T3 aún no tiene los tres meses.

## Flujo de trabajo

1. `pip install -r requirements.txt`
2. Hacer cambios en `src/` o en el notebook.
3. Correr **todo** el notebook (Kernel → Restart & Run All, unos 3 minutos). La sección 7 reescribe `site/data/resultados.json` y los CSV de `resultados/`. También se puede desde la terminal: `python src/estimar.py`.
4. Commit y push a `main`. GitHub Actions publica la página en un par de minutos.

La página se adapta sola a lo que traiga el JSON: más o menos modelos, otro horizonte, nuevos trimestres.

## Activar Pages (una sola vez)

1. Push del repo a GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → "Publicar página" → Run workflow**.
4. URL: `https://<usuario>.github.io/<repo>/`.

> En una cuenta gratis, Pages solo funciona con repos públicos (o con GitHub Education/Pro).

## Notas

- **Conclusiones:** son texto fijo en `site/index.html` (sección “Lo que dicen los resultados”). Si cambian los resultados, hay que actualizarlas a mano.
- **Modelo o esquema nuevo:** agrégalo en `src/` y a `MODELOS_PAG` en `src/exportar.py` (nombre, color y si es combinación).
- **Ver la página en local:** `python -m http.server -d site 8000` y abrir http://localhost:8000 (con doble clic en `index.html` no carga el JSON).
- **Datos nuevos:** actualiza `datos/series_macro_jalisco_trimestral.csv` (hoy se arma aparte con los datos de INEGI) y vuelve a correr el notebook.
