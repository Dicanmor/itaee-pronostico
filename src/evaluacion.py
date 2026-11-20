"""
evaluacion.py
Medidas de error (presentación "Medidas de error y combinación de pronósticos"), combinación de pronósticos
e intervalos a partir de los errores de validación.

Medidas: ME, MAE, RMSE, MPE, MAPE, MASE, ACF1 (de los errores de 1 paso) y U de Theil.

Combinaciones (6):
  COMB_SIMPLE     promedio simple
  COMB_RMSE       pesos  w ∝ 1/RMSE   de la validación cruzada, por horizonte
  COMB_VARIANZA   pesos  w ∝ 1/MSE    (inverso de la varianza del error), por horizonte
  COMB_BIC        pesos  a = exp((IC* - IC_i)/2),  w = a / Σa   con el BIC
  COMB_AIC        lo mismo con el AIC
  COMB_AICC       lo mismo con el AICc
"""
import numpy as np
import pandas as pd
from scipy import stats

MIN_ERRORES = 3          # errores previos mínimos para ponderar con el error; si no, promedio simple
ESQUEMAS = ["COMB_SIMPLE", "COMB_RMSE", "COMB_VARIANZA", "COMB_BIC", "COMB_AIC", "COMB_AICC"]
IC_DE = {"COMB_BIC": "bic", "COMB_AIC": "aic", "COMB_AICC": "aicc"}


# ───────────────────────── medidas de error ─────────────────────────
def medidas(real, pron, y_origen, escala_mase) -> dict:
    real, pron, y_origen = map(lambda a: np.asarray(a, float), (real, pron, y_origen))
    e = real - pron
    pe = e / real * 100
    fpe = (pron - y_origen) / y_origen
    ape = (real - y_origen) / y_origen
    acf1 = np.corrcoef(e[:-1], e[1:])[0, 1] if len(e) > 3 else np.nan
    return dict(n=len(e), ME=e.mean(), MAE=np.abs(e).mean(), RMSE=np.sqrt((e ** 2).mean()),
                MPE=pe.mean(), MAPE=np.abs(pe).mean(), MASE=np.abs(e).mean() / escala_mase,
                ACF1=acf1, Theil_U=np.sqrt(((fpe - ape) ** 2).sum() / (ape ** 2).sum()))


def escala_mase(y: pd.Series, m: int = 4) -> float:
    y = y.dropna().values
    return float(np.abs(y[m:] - y[:-m]).mean())


def tabla_medidas(cv: pd.DataFrame, y: pd.Series) -> pd.DataFrame:
    """Medidas por modelo y horizonte. cv trae [origen, h, objetivo, modelo, real, pron]."""
    esc = escala_mase(y)
    yo = cv["origen"].map(lambda o: float(y[pd.Period(o, freq="Q")]))
    cv = cv.assign(y_origen=yo)
    filas = []
    for (mod, h), g in cv.sort_values("origen").groupby(["modelo", "h"]):
        filas.append(dict(modelo=mod, h=h, **medidas(g["real"], g["pron"], g["y_origen"], esc)))
    return pd.DataFrame(filas)


# ───────────────────────── pesos ─────────────────────────
def _inversos(x: dict) -> dict:
    inv = {m: 1.0 / v for m, v in x.items() if v and np.isfinite(v) and v > 0}
    s = sum(inv.values())
    return {m: inv[m] / s for m in inv}


def pesos_rmse(rmse: dict) -> dict:
    """w_i = (1/RMSE_i) / Σ(1/RMSE_j)"""
    return _inversos(rmse)


def pesos_varianza(mse: dict) -> dict:
    """w_i = (1/MSE_i) / Σ(1/MSE_j)   (inverso de la varianza del error, como en la presentación)"""
    return _inversos(mse)


def pesos_ic(ic: dict) -> dict:
    """a_i = exp((IC* - IC_i)/2), w_i = a_i / Σa. Sirve para BIC, AIC o AICc."""
    mejor = min(ic.values())
    a = {m: np.exp((mejor - b) / 2) for m, b in ic.items()}
    s = sum(a.values())
    return {m: a[m] / s for m in a}


def iguales(modelos) -> dict:
    return {m: 1 / len(modelos) for m in modelos}


def combinar(pron: dict, w: dict) -> float:
    return sum(pron[m] * w[m] for m in w) / sum(w.values())


def mse_por_modelo(cv: pd.DataFrame, h: int, modelos) -> dict:
    g = cv[cv["h"] == h]
    return {m: float(((g[g.modelo == m].real - g[g.modelo == m].pron) ** 2).mean()) for m in modelos}


def pesos_finales(cv: pd.DataFrame, ic: dict, modelos) -> dict:
    """Pesos con todo lo observado en la validación. Devuelve {esquema: {h: {modelo: w}}}; los de IC no dependen de h."""
    hs = sorted(cv["h"].unique())
    out = {"COMB_SIMPLE": {h: iguales(modelos) for h in hs}, "COMB_RMSE": {}, "COMB_VARIANZA": {}}
    for h in hs:
        mse = mse_por_modelo(cv, h, modelos)
        out["COMB_RMSE"][h] = pesos_rmse({m: np.sqrt(v) for m, v in mse.items()})
        out["COMB_VARIANZA"][h] = pesos_varianza(mse)
    for esq, col in IC_DE.items():
        w = pesos_ic({m: ic[m][col] for m in modelos})
        out[esq] = {h: w for h in hs}
    return out


# ───────────────────────── combinaciones en la validación cruzada (sin ver el futuro) ─────────────────────────
def combinaciones_cv(cv: pd.DataFrame, info: pd.DataFrame) -> pd.DataFrame:
    """Para cada origen y horizonte, combina los pronósticos. Los pesos usan SOLO lo disponible en ese origen:
    errores de pronósticos cuyo objetivo ya había ocurrido y los criterios de información de ese origen."""
    modelos = sorted(cv["modelo"].unique())
    cv = cv.assign(o=pd.PeriodIndex(cv["origen"], freq="Q"), t=pd.PeriodIndex(cv["objetivo"], freq="Q"))
    cv["e2"] = (cv["real"] - cv["pron"]) ** 2
    ic = {(r.origen, r.modelo): r for r in info.itertuples()}
    filas = []
    for (origen, h), g in cv.groupby(["origen", "h"]):
        o = pd.Period(origen, freq="Q")
        pron = dict(zip(g["modelo"], g["pron"]))
        real = float(g["real"].iloc[0]); obj = g["objetivo"].iloc[0]
        previo = cv[(cv["h"] == h) & (cv["t"] <= o)]
        mse = {m: previo.loc[previo["modelo"] == m, "e2"].mean() for m in modelos if (previo["modelo"] == m).sum() >= MIN_ERRORES}
        hay = len(mse) == len(modelos)
        pesos = {"COMB_SIMPLE": iguales(modelos),
                 "COMB_RMSE": pesos_rmse({m: np.sqrt(v) for m, v in mse.items()}) if hay else iguales(modelos),
                 "COMB_VARIANZA": pesos_varianza(mse) if hay else iguales(modelos)}
        for esq, col in IC_DE.items():
            pesos[esq] = pesos_ic({m: getattr(ic[(origen, m)], col) for m in modelos})
        for nombre in ESQUEMAS:
            filas.append(dict(origen=origen, h=h, objetivo=obj, modelo=nombre, real=real, pron=combinar(pron, pesos[nombre])))
    return pd.DataFrame(filas)


# ───────────────────────── intervalos a partir de los errores de validación ─────────────────────────
def intervalo_validacion(centro: float, rmse: float, n: int, nivel: float = 0.95):
    """centro ± t · RMSE de la validación (t de Student con n-1 g.l.: son pocos errores)."""
    t = stats.t.ppf(0.5 + nivel / 2, max(int(n) - 1, 1))
    return centro - t * rmse, centro + t * rmse


def cobertura(cv: pd.DataFrame) -> pd.DataFrame:
    """Qué proporción de lo observado cayó dentro del intervalo propio del modelo (modelo × horizonte)."""
    d = cv.assign(dentro=(cv["real"] >= cv["lo"]) & (cv["real"] <= cv["hi"]))
    return d.groupby(["modelo", "h"])["dentro"].mean().unstack("h")
