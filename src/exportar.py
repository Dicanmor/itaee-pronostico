"""
exportar.py
Escribe site/data/resultados.json (lo único que lee la página) y los CSV de resultados/.
"""
import json
import math
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd

import evaluacion as E
import modelos as M

MODELOS_PAG = {   # clave: (nombre largo, nombre corto, color, es combinación)
    "ETS": ("Suavización exponencial (ETS)", "ETS", "#2a78d6", False),
    "REG_PROM": ("Regresión · promedio", "Regresión prom.", "#17a398", False),
    "REG_ULT": ("Regresión · último mes", "Regresión últ.", "#8a63d2", False),
    "ARIMAX_PROM": ("ARIMAX · promedio", "ARIMAX prom.", "#e3a008", False),
    "ARIMAX_ULT": ("ARIMAX · último mes", "ARIMAX últ.", "#c2410c", False),
    "COMB_SIMPLE": ("Combinación simple", "Comb. simple", "#64748b", True),
    "COMB_RMSE": ("Combinación por 1/RMSE", "Comb. 1/RMSE", "#e34948", True),
    "COMB_VARIANZA": ("Combinación por 1/MSE", "Comb. 1/MSE", "#9f1239", True),
    "COMB_BIC": ("Combinación por BIC", "Comb. BIC", "#db2777", True),
    "COMB_AIC": ("Combinación por AIC", "Comb. AIC", "#65a30d", True),
    "COMB_AICC": ("Combinación por AICc", "Comb. AICc", "#854d0e", True),
}
ESCENARIOS_PAG = {"pron": "Exógenas pronosticadas", "obs": "Exógenas observadas"}
EXOG_NOMBRES = {"emec_mayoreo_prom": "EMEC mayoreo", "emec_menudeo_prom": "EMEC menudeo", "emim_ventas_real_idx_prom": "EMIM ventas reales"}


def _t(p) -> str:
    p = pd.Period(p, freq="Q"); return f"{p.year}T{p.quarter}"


def _n(x, nd=4):
    if x is None: return None
    x = float(x); return None if (math.isnan(x) or math.isinf(x)) else round(x, nd)


def _lista(s, nd=3):
    return [_n(v, nd) for v in np.asarray(s, float)]


def _escenario(r: dict) -> dict:
    medidas, pron = r["medidas"], r["pron"]
    cols = [c for c in ["n", "ME", "MAE", "RMSE", "MPE", "MAPE", "MASE", "ACF1", "Theil_U"] if c in medidas.columns]
    hs = range(1, M.H + 1)
    rm = medidas.pivot(index="h", columns="modelo", values="RMSE").reindex(hs)
    cob = r["cobertura"]
    return {
        "pronosticos": {m: _lista(pron[m]) for m in pron.columns},
        "intervalo_modelo": {m: {"inf": _lista(r["lo_modelo"][m]), "sup": _lista(r["hi_modelo"][m])} for m in r["lo_modelo"].columns},
        "intervalo_val": {m: {"inf": _lista(r["lo_val"][m]), "sup": _lista(r["hi_val"][m])} for m in r["lo_val"].columns},
        "medidas": {str(h): {m: {c: _n(row[c]) for c in cols} for m, row in medidas[medidas.h == h].set_index("modelo").iterrows()} for h in hs},
        "rmse": {m: [_n(v) for v in rm[m].values] for m in rm.columns},
        "pesos": {str(h): {q: {m: _n(w * 100, 2) for m, w in r["pesos"][q][h].items()} for q in E.ESQUEMAS} for h in hs},
        "cobertura": {m: [_n(cob.loc[m, h], 3) if h in cob.columns else None for h in hs] for m in cob.index},
    }


def construir_json(R: dict) -> dict:
    y, idx = R["y"], R["idx"]
    base_anual = []
    for t in idx:
        t4 = t - 4
        base_anual.append(_n(y.loc[t4]) if t4 in y.index else None)
    cv0 = R["esc"]["pron"]["cv"]
    cv0 = cv0[cv0["modelo"].isin(M.MODELOS)]          # solo los 5 modelos (sin combinaciones)
    ex = R["exog"]
    exogenas = {"trimestres": [_t(t) for t in idx],
                "variables": [{"k": c, "label": EXOG_NOMBRES[c], "pron": _lista(ex["pron"][c], 2), "obs": _lista(ex["obs"][c], 2),
                               "observado": [bool(v) for v in ex["observado"][c]]} for c in ex["pron"].columns]}
    return {
        "meta": {"ejemplo": False, "generado": datetime.now(timezone.utc).isoformat(timespec="minutes"),
                 "primer_trimestre": _t(y.index[0]), "ultimo_trimestre": _t(y.index[-1]), "n_trimestres": int(len(y)),
                 "n_pronosticos_cv": int(len(cv0)), "n_origenes_cv": int(cv0["origen"].nunique()), "horizonte": int(M.H),
                 "modelo_banda": "COMB_RMSE", "escenarios": ESCENARIOS_PAG},
        "modelos": [{"k": k, "label": v[0], "short": v[1], "color": v[2], "comb": v[3]} for k, v in MODELOS_PAG.items()],
        "historico": [{"t": _t(t), "v": _n(v, 3)} for t, v in y.items()],
        "trimestres": [_t(t) for t in idx],
        "base_anual": base_anual,
        "ic": {m: {c: _n(v, 2) for c, v in row.items()} for m, row in R["ic"].iterrows()},
        "detalle": R["detalle"],
        "exogenas": exogenas,
        "escenarios": {e: _escenario(R["esc"][e]) for e in R["esc"]},
    }


def escribir(R: dict, raiz: Path):
    sal = raiz / "site" / "data" / "resultados.json"
    sal.parent.mkdir(parents=True, exist_ok=True)
    sal.write_text(json.dumps(construir_json(R), ensure_ascii=False, indent=1), encoding="utf-8")
    res = raiz / "resultados"; res.mkdir(exist_ok=True)
    for e, r in R["esc"].items():
        r["medidas"].round(4).to_csv(res / f"medidas_error_{e}.csv", index=False)
        r["cv"].to_csv(res / f"validacion_cruzada_{e}.csv", index=False)
    print("Listo →", sal.relative_to(raiz))
