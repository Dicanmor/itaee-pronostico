"""
modelos.py
Pronóstico del ITAEE de Jalisco con 5 modelos, intervalos, validación cruzada y dos escenarios de exógenas.

Modelos (todos sobre log(ITAEE), se regresan a nivel para reportar):
  ETS          suavización exponencial (error aditivo, estacionalidad aditiva, tendencia amortiguada o ninguna)
  REG_PROM     regresión lineal con EMEC mayoreo, EMEC menudeo y EMIM (promedio del trimestre)
  REG_ULT      lo mismo con el último mes del trimestre
  ARIMAX_PROM  ARIMA estacional con las mismas exógenas (promedio)
  ARIMAX_ULT   ARIMA estacional con las mismas exógenas (último mes)

Escenarios para las exógenas en el futuro (solo cambian REG_* y ARIMAX_*):
  "pron"  las exógenas se pronostican con suavización exponencial
  "obs"   se usan los valores observados donde INEGI ya los publicó (trimestres completos) y,
          donde no, el pronóstico de suavización exponencial

Cada pronóstico trae su intervalo de predicción al 95% propio del modelo (lo, hi).
Los criterios de información (BIC, AIC, AICc) se calculan con una ventana común de residuos para poder compararlos.
"""
import itertools
import warnings

import numpy as np
import pandas as pd
import statsmodels.api as sm
from statsmodels.tsa.exponential_smoothing.ets import ETSModel
from statsmodels.tsa.statespace.sarimax import SARIMAX

warnings.filterwarnings("ignore")

H = 4                          # horizonte (trimestres)
ALFA = 0.05                    # intervalos al 95%
INICIO_EXOG = "2018Q1"         # la EMIM real empieza en 2018
MIN_TRAIN = 20                 # observaciones mínimas con exógenas para estimar (2018Q1-2022Q4)
VENTANA_IC = 20                # ventana común (últimos 20 residuos) para comparar criterios entre modelos
COVID = pd.Period("2020Q2", freq="Q")

MODELOS = ["ETS", "REG_PROM", "REG_ULT", "ARIMAX_PROM", "ARIMAX_ULT"]
ESCENARIOS = ["pron", "obs"]
EXOG = {
    "PROM": ["emec_mayoreo_prom", "emec_menudeo_prom", "emim_ventas_real_idx_prom"],
    "ULT": ["emec_mayoreo_ultimo_mes", "emec_menudeo_ultimo_mes", "emim_ventas_real_idx_ultimo_mes"],
}


# ───────────────────────── datos ─────────────────────────
def cargar(ruta) -> pd.DataFrame:
    d = pd.read_csv(ruta, index_col=0)
    d.index = pd.PeriodIndex(d.index, freq="Q")
    return d.sort_index()


def _dummy_covid(idx: pd.PeriodIndex) -> np.ndarray:
    return (idx == COVID).astype(float)


# ───────────────────────── criterios de información ─────────────────────────
def criterios(resid, k: int) -> dict:
    """BIC, AIC y AICc con los últimos VENTANA_IC residuos: n·ln(MSE) + penalización(k)."""
    e = np.asarray(resid, float)[-VENTANA_IC:]
    n = len(e)
    base = n * np.log(np.mean(e ** 2))
    aic = base + 2 * k
    aicc = aic + 2 * k * (k + 1) / (n - k - 1) if n - k - 1 > 0 else np.nan
    return {"bic": float(base + k * np.log(n)), "aic": float(aic), "aicc": float(aicc)}


# ───────────────────────── suavización exponencial ─────────────────────────
def ets_fit(y: pd.Series):
    """y: serie en logs con índice trimestral. Elige entre tendencia amortiguada y sin tendencia por AIC."""
    mejor = None
    for trend, damped in [(None, False), ("add", True)]:
        try:
            r = ETSModel(y, error="add", trend=trend, damped_trend=damped, seasonal="add", seasonal_periods=4).fit(disp=False)
        except Exception:
            continue
        if mejor is None or r.aic < mejor.aic:
            mejor = r
    return mejor


def _pred_ets(r, n: int, h: int):
    pr = r.get_prediction(start=n, end=n + h - 1).summary_frame(alpha=ALFA)
    return np.exp(pr["mean"].values), np.exp(pr["pi_lower"].values), np.exp(pr["pi_upper"].values)


def modelo_ets(d: pd.DataFrame, h: int) -> dict:
    y = np.log(d["itaee_jalisco"].dropna())
    r = ets_fit(y)
    f, lo, hi = _pred_ets(r, len(y), h)
    return dict(f=f, lo=lo, hi=hi, ic=criterios(r.resid, len(r.params)), det="")


# ───────────────────────── exógenas futuras ─────────────────────────
def exog_futuras(d: pd.DataFrame, cols: list, h: int) -> pd.DataFrame:
    """Pronóstico de cada exógena (en logs) con suavización exponencial."""
    idx = pd.period_range(d.index[-1] + 1, periods=h, freq="Q")
    out = {}
    for c in cols:
        s = np.log(d[c].dropna())
        out[c] = np.exp(ets_fit(s).forecast(h).values)
    return pd.DataFrame(out, index=idx)


def con_observados(fut: pd.DataFrame, obs) -> pd.DataFrame:
    """Reemplaza el pronóstico por el valor observado donde exista (trimestre completo en INEGI)."""
    fut = fut.copy()
    if obs is None:
        return fut
    for t in fut.index:
        if t in obs.index:
            for c in fut.columns:
                if pd.notna(obs.loc[t, c]):
                    fut.loc[t, c] = obs.loc[t, c]
    return fut


def _x(d: pd.DataFrame, cols: list) -> pd.DataFrame:
    x = np.log(d[cols])
    x["covid"] = _dummy_covid(d.index)
    return x


# ───────────────────────── regresión y ARIMAX ─────────────────────────
def modelo_reg(d: pd.DataFrame, cols: list, futs: dict) -> dict:
    z = d.loc[INICIO_EXOG:].dropna(subset=["itaee_jalisco"] + cols)
    r = sm.OLS(np.log(z["itaee_jalisco"]), sm.add_constant(_x(z, cols))).fit()
    ic = criterios(r.resid.values, len(r.params) + 1)
    out = {}
    for esc, f in futs.items():
        Xf = sm.add_constant(_x(f, cols), has_constant="add")
        sf = r.get_prediction(Xf).summary_frame(alpha=ALFA)
        out[esc] = dict(f=np.exp(sf["mean"].values), lo=np.exp(sf["obs_ci_lower"].values), hi=np.exp(sf["obs_ci_upper"].values), ic=ic, det="")
    return out


GRILLA = [(p, dd, q, P, D) for p, dd, q, P, D in itertools.product([0, 1, 2], [0, 1], [0, 1], [0, 1], [0, 1])
          if not (dd == 1 and D == 1) and not (D == 1 and P == 1)]


def modelo_arimax(d: pd.DataFrame, cols: list, futs: dict) -> dict:
    z = d.loc[INICIO_EXOG:].dropna(subset=["itaee_jalisco"] + cols)
    y = np.log(z["itaee_jalisco"]).values
    X = _x(z, cols).values
    mejor = None
    for p, dd, q, P, D in GRILLA:
        try:
            m = SARIMAX(y, exog=X, order=(p, dd, q), seasonal_order=(P, D, 0, 4),
                        trend="c" if dd == 0 and D == 0 else "n", enforce_stationarity=True, enforce_invertibility=True)
            r = m.fit(disp=False, maxiter=200)
        except Exception:
            continue
        if not np.isfinite(r.bic):
            continue
        if mejor is None or r.bic < mejor[0].bic:
            mejor = (r, (p, dd, q, P, D))
    r, (p, dd, q, P, D) = mejor
    burn = dd + 4 * D + 1
    resid = r.resid[burn:] if len(r.resid) > burn + VENTANA_IC else r.resid
    ic = criterios(resid, len(r.params))
    det = f"order=({p},{dd},{q}) seasonal=({P},{D},0,4)"
    out = {}
    for esc, f in futs.items():
        fc = r.get_forecast(len(f), exog=_x(f, cols).values)
        ci = np.asarray(fc.conf_int(alpha=ALFA))
        out[esc] = dict(f=np.exp(np.asarray(fc.predicted_mean)), lo=np.exp(ci[:, 0]), hi=np.exp(ci[:, 1]), ic=ic, det=det)
    return out


# ───────────────────────── todo junto ─────────────────────────
def ajustar_y_pronosticar(d: pd.DataFrame, h: int = H, obs=None) -> dict:
    """Ajusta los 5 modelos con los datos de d y pronostica h trimestres.
    Devuelve {escenario: {modelo: dict(f, lo, hi, ic, det)}}. obs = tabla con las exógenas observadas más allá de d."""
    out = {e: {} for e in ESCENARIOS}
    ets = modelo_ets(d, h)
    for e in out:
        out[e]["ETS"] = ets
    dx = d.loc[INICIO_EXOG:]
    for v in ["PROM", "ULT"]:
        cols = EXOG[v]
        base = exog_futuras(dx, cols, h)                         # una sola vez por variante
        futs = {"pron": base, "obs": con_observados(base, obs)}
        r, a = modelo_reg(d, cols, futs), modelo_arimax(d, cols, futs)
        for e in out:
            out[e][f"REG_{v}"], out[e][f"ARIMAX_{v}"] = r[e], a[e]
    return out


# ───────────────────────── validación cruzada (ventana expansiva) ─────────────────────────
def validacion_cruzada(d: pd.DataFrame, obs=None, h: int = H):
    """Para cada origen T (desde 2022Q4) ajusta con datos hasta T y pronostica T+1..T+h en los dos escenarios.
    Devuelve (pronósticos largos [esc, origen, h, objetivo, modelo, real, pron, lo, hi], info [origen, modelo, bic, aic, aicc])."""
    y = d["itaee_jalisco"]
    primero = d.loc[INICIO_EXOG:].dropna(subset=["itaee_jalisco"] + EXOG["PROM"] + EXOG["ULT"]).index[MIN_TRAIN - 1]
    ultimo = d["itaee_jalisco"].dropna().index[-1]
    filas, info = [], []
    for origen in pd.period_range(primero, ultimo - 1, freq="Q"):
        res = ajustar_y_pronosticar(d.loc[:origen], h, obs)
        for m, p in res["pron"].items():
            info.append(dict(origen=str(origen), modelo=m, **p["ic"]))
        for esc, modelos in res.items():
            for m, p in modelos.items():
                for k in range(1, h + 1):
                    obj = origen + k
                    if obj in y.index and not np.isnan(y.get(obj, np.nan)):
                        filas.append(dict(esc=esc, origen=str(origen), h=k, objetivo=str(obj), modelo=m, real=float(y[obj]),
                                          pron=float(p["f"][k - 1]), lo=float(p["lo"][k - 1]), hi=float(p["hi"][k - 1])))
    return pd.DataFrame(filas), pd.DataFrame(info)
