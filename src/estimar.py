"""
estimar.py
Corre todo: validación cruzada, medidas de error, combinaciones, intervalos y pronóstico final,
en los dos escenarios de exógenas ("pron" = pronosticadas, "obs" = observadas donde ya existen).

Uso:  python src/estimar.py [ruta_datos.csv]      (escribe site/data/resultados.json y resultados/*.csv)
"""
import sys
from pathlib import Path

import numpy as np
import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
import evaluacion as E
import modelos as M

RAIZ = Path(__file__).resolve().parents[1]
MODELOS = M.MODELOS
TODOS = MODELOS + E.ESQUEMAS


def exog_final(d: pd.DataFrame, full: pd.DataFrame) -> dict:
    """Valores de las exógenas (promedio del trimestre) que entran al pronóstico final en cada escenario."""
    cols = M.EXOG["PROM"]
    base = M.exog_futuras(d.loc[M.INICIO_EXOG:], cols, M.H)
    obs = M.con_observados(base, full)
    visto = pd.DataFrame({c: [bool(t in full.index and pd.notna(full.loc[t, c])) for t in base.index] for c in cols}, index=base.index)
    return {"pron": base, "obs": obs, "observado": visto}


def correr(full: pd.DataFrame, verbose: bool = True) -> dict:
    y = full["itaee_jalisco"].dropna()
    d = full.loc[:y.index[-1]]          # las exógenas no pueden ir más allá del último ITAEE (los pronósticos arrancan después)
    idx = pd.period_range(y.index[-1] + 1, periods=M.H, freq="Q")

    if verbose: print("1/4 Validación cruzada (ventana expansiva, dos escenarios)…")
    cv_all, info = M.validacion_cruzada(d, full)
    if verbose: print("2/4 Pronóstico final…")
    res = M.ajustar_y_pronosticar(d, obs=full)
    ic = {m: res["pron"][m]["ic"] for m in MODELOS}

    R = {"y": y, "d": d, "idx": idx, "ic": pd.DataFrame(ic).T, "info": info,
         "detalle": {m: res["pron"][m]["det"] for m in MODELOS if res["pron"][m]["det"]},
         "exog": exog_final(d, full), "esc": {}}

    if verbose: print("3/4 Medidas, combinaciones e intervalos…")
    for esc in M.ESCENARIOS:
        cv = cv_all[cv_all.esc == esc].drop(columns="esc")
        comb = E.combinaciones_cv(cv[["origen", "h", "objetivo", "modelo", "real", "pron"]], info)
        todo = pd.concat([cv, comb], ignore_index=True)
        medidas = E.tabla_medidas(todo, y)
        pesos = E.pesos_finales(cv, ic, MODELOS)

        pron = pd.DataFrame({m: res[esc][m]["f"] for m in MODELOS}, index=idx)
        for q in E.ESQUEMAS:
            pron[q] = [E.combinar({m: pron.loc[t, m] for m in MODELOS}, pesos[q][k + 1]) for k, t in enumerate(idx)]
        lo_m = pd.DataFrame({m: res[esc][m]["lo"] for m in MODELOS}, index=idx)
        hi_m = pd.DataFrame({m: res[esc][m]["hi"] for m in MODELOS}, index=idx)

        rm = medidas.pivot(index="modelo", columns="h", values="RMSE")
        nn = medidas.pivot(index="modelo", columns="h", values="n")
        lo_v, hi_v = pd.DataFrame(index=idx, columns=TODOS, dtype=float), pd.DataFrame(index=idx, columns=TODOS, dtype=float)
        for m in TODOS:
            for k, t in enumerate(idx):
                lo_v.loc[t, m], hi_v.loc[t, m] = E.intervalo_validacion(pron.loc[t, m], rm.loc[m, k + 1], nn.loc[m, k + 1])

        R["esc"][esc] = dict(cv=todo, medidas=medidas, pesos=pesos, pron=pron, lo_modelo=lo_m, hi_modelo=hi_m,
                             lo_val=lo_v, hi_val=hi_v, cobertura=E.cobertura(cv))
    return R


def main(ruta=None):
    import exportar
    full = M.cargar(ruta or RAIZ / "datos" / "series_macro_jalisco_trimestral.csv")
    R = correr(full)
    print("4/4 Guardando…")
    exportar.escribir(R, RAIZ)
    return R


if __name__ == "__main__":
    R = main(sys.argv[1] if len(sys.argv) > 1 else None)
    pd.set_option("display.width", 200)
    for esc, r in R["esc"].items():
        print(f"\n== Escenario {esc} ==\n", r["pron"].round(2).T.to_string())
