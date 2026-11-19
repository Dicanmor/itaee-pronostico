# Pronóstico del ITAEE de Jalisco

Página con los resultados del pronóstico del ITAEE de Jalisco: cinco modelos (ETS, regresión y ARIMAX con EMEC/EMIM), tres combinaciones, validación cruzada y pesos. Se publica en GitHub Pages con GitHub Actions.

## Estructura

```
├── notebook_estimacion.ipynb      # análisis; la sección 6 exporta los resultados a la página
├── src/                           # modelos.py y evaluacion.py (los importa el notebook)
├── datos/
│   ├── series_macro_jalisco_trimestral.csv   # ITAEE + EMEC + EMIM trimestral (lo lee el notebook)
│   └── emim_jalisco_ventas_corrientes.csv    # EMIM mensual por subsector, pesos corrientes (fuente)
├── resultados/                    # medidas_error.csv, validacion_cruzada.csv
├── site/                          # la página (HTML + CSS + JS, sin build)
│   └── data/resultados.json       # lo único que lee la página
└── .github/workflows/deploy.yml   # publica site/ en Pages con cada push
```

## Datos

- **ITAEE:** INEGI, índice de volumen físico, base 2018 = 100, **serie original**, total de la actividad económica, Jalisco. 2003T1–2026T2.
- **EMEC:** comercio al por mayor y al por menor, Jalisco, índice base 2018. Trimestralizado como promedio de los 3 meses (`_prom`) y último mes (`_ultimo_mes`).
- **EMIM:** ventas de la industria manufacturera de Jalisco, en términos reales e índice 2018 = 100, con las mismas dos versiones. Disponible desde 2018.

## Flujo de trabajo

1. Hacer cambios en el notebook.
2. Correr **todo** el notebook (Kernel → Restart & Run All). La última celda reescribe `site/data/resultados.json`.
3. Hacer commit del notebook y del JSON, y push a `main`.
4. GitHub Actions publica la página en un par de minutos.

La página se adapta sola a lo que traiga el JSON: más o menos modelos, otro horizonte, nuevos trimestres.

## Activar Pages (una sola vez)

1. Push del repo a GitHub.
2. **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. **Actions → "Publicar página" → Run workflow**.
4. URL: `https://<usuario>.github.io/<repo>/`.

> En una cuenta gratis, Pages solo funciona con repos públicos (o con GitHub Education/Pro).

## Notas

- **Conclusiones:** son texto fijo en `site/index.html` (sección "Lo que dicen los resultados"). Si cambian los resultados, hay que actualizarlas a mano.
- **Modelo nuevo:** agrégalo a `INDIV` o `COMB` y a `COL` en el notebook, y su nombre en `NOMBRES` (sección 6).
- **Ver la página en local:** `python -m http.server -d site 8000` y abrir http://localhost:8000 (con doble clic en `index.html` no carga el JSON).
