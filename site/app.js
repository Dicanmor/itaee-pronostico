/* Plataforma de resultados · Pronóstico ITAEE Jalisco
 * Lee data/resultados.json (lo genera scripts/exportar_resultados.py) y pinta todo.
 * Sin dependencias ni build. */
(function () {
  'use strict';

  var D;            // datos
  var MOD = {};     // modelos por clave
  var S = { vis: {}, sel: 0, banda: true, modo: 'nivel', h: '1', hw: '1', rango: '5a', esc: 'pron', int: 'modelo', bandaK: null };
  var DEFAULT_VIS = ['ETS', 'COMB_SIMPLE', 'COMB_RMSE', 'COMB_BIC'];
  var ESQ = [['COMB_SIMPLE', 'Simple'], ['COMB_RMSE', '1/RMSE'], ['COMB_VARIANZA', '1/MSE'], ['COMB_BIC', 'BIC'], ['COMB_AIC', 'AIC'], ['COMB_AICC', 'AICc']];
  var SVGNS = 'http://www.w3.org/2000/svg';

  var $ = function (id) { return document.getElementById(id); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); };
  var f2 = function (v) { return v == null ? '—' : v.toFixed(2); };
  var f3 = function (v) { return v == null ? '—' : (v < 0 ? '−' : '') + Math.abs(v).toFixed(3); };
  function pct(v, b) {
    if (v == null || b == null) return '—';
    var p = (v / b - 1) * 100;
    if (Math.abs(p) < 0.05) return '0.0%';
    return (p > 0 ? '+' : '−') + Math.abs(p).toFixed(1) + '%';
  }
  function sgn(v, b) { if (v == null || b == null) return ''; var p = (v / b - 1) * 100; return p >= 0.05 ? 'up' : (p <= -0.05 ? 'down' : ''); }
  function line(d, color, comb) {
    return '<path d="' + d + '" fill="none" stroke="' + color + '" stroke-width="' + (comb ? 3 : 1.6) + '"' +
      (comb ? '' : ' stroke-dasharray="5 4"') + ' stroke-linejoin="round" stroke-linecap="round"/>';
  }
  function niceStep(range, target) {
    var raw = range / target, mag = Math.pow(10, Math.floor(Math.log10(raw))), r = raw / mag;
    return (r < 1.5 ? 1 : r < 3 ? 2 : r < 7 ? 5 : 10) * mag;
  }
  function fecha(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Mexico_City' }); }
    catch (e) { return iso; }
  }
  // año anterior de 'YYYYTq'
  function hace4(t) { return (parseInt(t.slice(0, 4), 10) - 1) + t.slice(4); }

  /* ---------- Escenario e intervalos ---------- */
  // pasa a la raíz del objeto lo del escenario elegido, para que el resto del código lea D.pronosticos, D.medidas, etc.
  function usar(esc) {
    S.esc = esc;
    var E = D.escenarios[esc];
    ['pronosticos', 'intervalo_modelo', 'intervalo_val', 'medidas', 'rmse', 'pesos', 'cobertura'].forEach(function (k) { D[k] = E[k]; });
  }
  // intervalo de un modelo según el tipo elegido; los modelos sin intervalo propio (combinaciones) usan el de validación
  function ints(k) {
    var propio = S.int === 'modelo' && D.intervalo_modelo[k];
    return { inf: (propio ? D.intervalo_modelo[k] : D.intervalo_val[k]).inf, sup: (propio ? D.intervalo_modelo[k] : D.intervalo_val[k]).sup, propio: !!propio };
  }
  function rangoTxt(i, j) { return i.inf[j].toFixed(1) + ' – ' + i.sup[j].toFixed(1); }

  /* ---------- KPIs ---------- */
  function renderKPIs() {
    var H = D.historico, last = H[H.length - 1];
    var prev = H.filter(function (p) { return p.t === hace4(last.t); })[0];
    var k0 = S.bandaK, c = D.pronosticos[k0], q = D.trimestres, b = D.base_anual, iv = ints(k0);

    var m1 = D.medidas['1'] || {}, hs = Object.keys(D.medidas).sort(), mh = D.medidas[hs[hs.length - 1]] || {};
    var best = null;
    Object.keys(m1).forEach(function (k) { if (m1[k].RMSE != null && (!best || m1[k].RMSE < m1[best].RMSE)) best = k; });

    var cards = [
      { label: 'Último dato observado · ' + last.t, value: last.v.toFixed(2), sub: prev ? pct(last.v, prev.v) + ' vs ' + prev.t : '', cls: prev ? sgn(last.v, prev.v) : '' },
      { label: 'Pronóstico ' + q[0] + ' · ' + MOD[k0].short, value: f2(c[0]), sub: pct(c[0], b[0]) + ' vs ' + hace4(q[0]) + ' · 95%: ' + rangoTxt(iv, 0), cls: '' },
      { label: 'Pronóstico ' + q[1] + ' · ' + MOD[k0].short, value: f2(c[1]), sub: pct(c[1], b[1]) + ' vs ' + hace4(q[1]) + ' · 95%: ' + rangoTxt(iv, 1), cls: sgn(c[1], b[1]) },
      { label: 'Mejor modelo en validación (h=1)', value: best ? MOD[best].short : '—',
        sub: best ? 'RMSE ' + m1[best].RMSE.toFixed(2) + ' a 1 trim.' + (mh[best] && hs.length > 1 ? ' · ' + mh[best].RMSE.toFixed(2) + ' a ' + hs[hs.length - 1] + ' trim.' : '') : '', cls: '' }
    ];
    $('kpis').innerHTML = cards.map(function (k) {
      return '<div class="kpi"><span class="kpi__label">' + esc(k.label) + '</span><span class="kpi__value num' + (String(k.value).length > 8 ? ' kpi__value--sm' : '') + '">' + esc(k.value) +
        '</span><span class="kpi__sub num ' + k.cls + '">' + esc(k.sub) + '</span></div>';
    }).join('');
    $('titulo').textContent = 'Pronóstico del ITAEE de Jalisco, ' + q[0] + ' – ' + q[q.length - 1];
  }

  /* ---------- Chips ---------- */
  function renderChips() {
    $('chips').innerHTML = D.modelos.map(function (m) {
      return '<button type="button" class="chip" data-k="' + m.k + '" aria-pressed="' + !!S.vis[m.k] + '">' +
        '<svg width="22" height="10" viewBox="0 0 22 10" aria-hidden="true"><line x1="1" y1="5" x2="21" y2="5" stroke="' + m.color +
        '" stroke-width="' + (m.comb ? 3 : 2) + '"' + (m.comb ? '' : ' stroke-dasharray="4 3"') + ' stroke-linecap="round"/></svg>' +
        '<span>' + esc(m.short) + '</span></button>';
    }).join('');
  }

  /* ---------- Gráfica principal ---------- */
  function renderChart() {
    var hist = S.rango === '5a' ? D.historico.slice(-20) : D.historico;
    var nh = hist.length, nf = D.trimestres.length, N = nh + nf;
    var labels = hist.map(function (p) { return p.t; }).concat(D.trimestres);
    var W = 900, Hh = 380, L = 52, R = 20, T = 20, B = 40, PW = W - L - R, PH = Hh - T - B;
    var visK = D.modelos.filter(function (m) { return S.vis[m.k]; }).map(function (m) { return m.k; });

    var vals = hist.map(function (p) { return p.v; });
    visK.forEach(function (k) { vals = vals.concat(D.pronosticos[k]); });
    if (S.banda) { var ib = ints(S.bandaK); ib.inf.forEach(function (v, j) { vals.push(v, ib.sup[j]); }); }
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var step = niceStep(hi - lo, 6), ymin = Math.floor(lo / step) * step, ymax = Math.ceil(hi / step) * step;
    if (ymax - hi < step * 0.15) ymax += step;

    var x = function (i) { return L + i * PW / (N - 1); };
    var y = function (v) { return T + (ymax - v) / (ymax - ymin) * PH; };
    var P = function (i, v) { return x(i).toFixed(1) + ' ' + y(v).toFixed(1); };
    var o = [];

    // zona de pronóstico
    o.push('<rect x="' + x(nh - 1) + '" y="' + T + '" width="' + (x(N - 1) - x(nh - 1) + R) + '" height="' + PH + '" fill="#F1F3FB"/>');
    o.push('<text x="' + (W - R - 6) + '" y="' + (T + 16) + '" font-size="12" font-weight="600" fill="#2B4BC4" text-anchor="end">Pronóstico</text>');
    // eje y
    for (var v = ymin; v <= ymax + 1e-9; v += step) {
      o.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E6E7E2"/>');
      o.push('<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" font-size="12" fill="#5A5F69" text-anchor="end">' + (+v.toFixed(2)) + '</text>');
    }
    // eje x: años (en T1), espaciados según cuántos haya
    var years = []; labels.forEach(function (t, i) { if (t.slice(-1) === '1') years.push([i, t.slice(0, 4)]); });
    var every = Math.max(1, Math.ceil(years.length / 12));
    years.forEach(function (yv, j) {
      if (j % every) return;
      o.push('<line x1="' + x(yv[0]) + '" x2="' + x(yv[0]) + '" y1="' + (T + PH) + '" y2="' + (T + PH + 6) + '" stroke="#9A9EA6"/>');
      o.push('<text x="' + x(yv[0]) + '" y="' + (T + PH + 24) + '" font-size="12" fill="#5A5F69" text-anchor="middle">' + yv[1] + '</text>');
    });
    // banda
    var last = hist[nh - 1];
    if (S.banda) {
      var ib2 = ints(S.bandaK), up = [P(nh - 1, last.v)], dn = [P(nh - 1, last.v)];
      ib2.sup.forEach(function (v, j) { up.push(P(nh + j, v)); dn.unshift(P(nh + j, ib2.inf[j])); });
      o.push('<polygon points="' + up.concat(dn).map(function (s) { return s.replace(' ', ','); }).join(' ') + '" fill="' + MOD[S.bandaK].color + '" fill-opacity="0.13"/>');
    }
    // trimestre seleccionado
    o.push('<line x1="' + x(nh + S.sel) + '" x2="' + x(nh + S.sel) + '" y1="' + T + '" y2="' + (T + PH) + '" stroke="#14161A" stroke-dasharray="3 3"/>');
    // histórico
    o.push('<path d="' + hist.map(function (p, i) { return (i ? 'L' : 'M') + P(i, p.v); }).join(' ') + '" fill="none" stroke="#14161A" stroke-width="2.5" stroke-linejoin="round"/>');
    // pronósticos
    var dots = [];
    visK.forEach(function (k) {
      var m = MOD[k], f = D.pronosticos[k];
      var d = 'M' + P(nh - 1, last.v) + ' ' + f.map(function (v, j) { return 'L' + P(nh + j, v); }).join(' ');
      o.push(line(d, m.color, m.comb));
      dots.push('<circle cx="' + x(nh + S.sel) + '" cy="' + y(f[S.sel]) + '" r="4.5" fill="' + m.color + '" stroke="#fff" stroke-width="1.5"><title>' + esc(m.label + ': ' + f2(f[S.sel])) + '</title></circle>');
    });
    o.push('<circle cx="' + x(nh - 1) + '" cy="' + y(last.v) + '" r="4.5" fill="#14161A"><title>' + last.t + ': ' + last.v.toFixed(2) + '</title></circle>');
    o = o.concat(dots);

    $('chart').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="Serie del ITAEE de Jalisco desde ' + hist[0].t +
      ' y pronósticos hasta ' + D.trimestres[nf - 1] + '" font-family="Inter, sans-serif">' + o.join('') + '</svg>';
  }

  /* ---------- Panel del trimestre ---------- */
  function renderPanel() {
    var k0 = S.bandaK, c = D.pronosticos[k0], s = S.sel, iv = ints(k0);
    $('qbtns').innerHTML = D.trimestres.map(function (q, j) {
      return '<button type="button" class="qbtn" data-q="' + j + '" aria-pressed="' + (j === s) + '"><b>' + q + '</b><span>' + MOD[k0].short + ' ' + f2(c[j]) + '</span></button>';
    }).join('');
    $('sel-label').textContent = MOD[k0].label + ' · ' + D.trimestres[s];
    $('sel-main').textContent = f2(c[s]);
    $('sel-sub').textContent = '95%: ' + rangoTxt(iv, s) + ' · ' + pct(c[s], D.base_anual[s]) + ' a/a';
    $('sel-rows').innerHTML = '<div class="prow prow--head"><span>Modelo</span><span>Nivel</span><span>a/a</span></div>' +
      D.modelos.map(function (m) {
        var v = D.pronosticos[m.k][s];
        return '<div class="prow num' + (m.k === k0 ? ' is-main' : '') + '"><span class="prow__name"><span class="sw" style="background:' + m.color + '"></span><span>' +
          esc(m.short) + '</span></span><span>' + f2(v) + '</span><span>' + pct(v, D.base_anual[s]) + '</span></div>';
      }).join('');
    document.querySelector('.legend__band').style.background = MOD[k0].color; document.querySelector('.legend__band').style.opacity = '0.35';
    $('leg-banda').textContent = 'Banda 95% de ' + MOD[k0].short + (iv.propio ? ' (intervalo del modelo)' : ' (±t·RMSE de la validación)');
  }

  /* ---------- Tabla de pronósticos ---------- */
  function renderTabla() {
    var k0 = S.bandaK, firstComb = true;
    var h = '<thead><tr><th scope="col">Modelo</th>' + D.trimestres.map(function (q) { return '<th scope="col">' + q + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.forEach(function (m) {
      var cls = [];
      if (m.comb) { cls.push('is-comb'); if (firstComb) { cls.push('is-comb-first'); firstComb = false; } }
      if (m.k === k0) cls.push('is-main');
      h += '<tr class="' + cls.join(' ') + '"><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + '</span></th>' +
        D.pronosticos[m.k].map(function (v, j) { return '<td>' + (S.modo === 'nivel' ? f2(v) : pct(v, D.base_anual[j])) + '</td>'; }).join('') + '</tr>';
    });
    $('tbl-pron').innerHTML = h + '</tbody>';
  }

  function descargarCSV() {
    var rows = [['modelo'].concat(D.trimestres)];
    D.modelos.forEach(function (m) { rows.push([m.k].concat(D.pronosticos[m.k].map(function (v) { return v == null ? '' : v; }))); });
    D.modelos.forEach(function (m) { var i = ints(m.k); rows.push([m.k + '_95_inf'].concat(i.inf)); rows.push([m.k + '_95_sup'].concat(i.sup)); });
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pronostico_itaee_jalisco_' + S.esc + '_' + D.trimestres[0] + '_' + D.trimestres[D.trimestres.length - 1] + '.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 1000);
  }

  /* ---------- Validación ---------- */
  function renderSegH() {
    var hs = Object.keys(D.medidas).sort(function (a, b) { return a - b; });
    if (hs.indexOf(S.h) < 0) S.h = hs[0];
    $('seg-h').innerHTML = hs.map(function (h) {
      return '<button type="button" data-h="' + h + '" aria-pressed="' + (h === S.h) + '">' + h + (h === '1' ? ' trimestre' : ' trimestres') + '</button>';
    }).join('');
  }

  function renderCV() {
    var md = D.medidas[S.h], best = null;
    D.modelos.forEach(function (m) { var r = md[m.k]; if (r && r.RMSE != null && (!best || r.RMSE < md[best].RMSE)) best = m.k; });
    var cols = [['n', 'n'], ['ME', 'ME'], ['MAE', 'MAE'], ['RMSE', 'RMSE'], ['MAPE', 'MAPE'], ['MASE', 'MASE'], ['ACF1', 'ACF1'], ['Theil_U', 'Theil U']];
    var h = '<thead><tr><th scope="col">Modelo</th>' + cols.map(function (c) { return '<th scope="col"' + (c[0] === 'RMSE' ? ' class="key"' : '') + '>' + c[1] + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.forEach(function (m) {
      var r = md[m.k]; if (!r) return;
      h += '<tr' + (m.k === best ? ' class="is-best"' : '') + '><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + '</span></th>' +
        cols.map(function (c) {
          var v = r[c[0]], cls = c[0] === 'RMSE' ? 'key' : (c[0] === 'Theil_U' && v > 1 ? 'bad' : '');
          return '<td' + (cls ? ' class="' + cls + '"' : '') + '>' + (c[0] === 'n' ? (v == null ? '—' : v) : f3(v)) + '</td>';
        }).join('') + '</tr>';
    });
    $('tbl-cv').innerHTML = h + '</tbody>';
  }

  function renderRMSE() {
    var W = 520, Hh = 300, L = 44, R = 16, T = 16, B = 36, PW = W - L - R, PH = Hh - T - B;
    var keys = D.modelos.filter(function (m) { return S.vis[m.k] && D.rmse[m.k]; }).map(function (m) { return m.k; });
    var nH = D.meta.horizonte, all = [];
    keys.forEach(function (k) { all = all.concat(D.rmse[k].filter(function (v) { return v != null; })); });
    if (!all.length) { $('chart-rmse').innerHTML = '<p class="muted small">Activa al menos un modelo.</p>'; return; }
    var lo = Math.min.apply(null, all), hi = Math.max.apply(null, all), step = niceStep(hi - lo || 1, 4);
    var ymin = Math.floor(lo / step) * step, ymax = Math.ceil(hi / step) * step;
    if (ymax === ymin) ymax += step;
    var x = function (h) { return L + (h - 1) * PW / Math.max(1, nH - 1); };
    var y = function (v) { return T + (ymax - v) / (ymax - ymin) * PH; };
    var o = [];
    for (var v = ymin; v <= ymax + 1e-9; v += step) {
      o.push('<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="#E6E7E2"/>');
      o.push('<text x="' + (L - 8) + '" y="' + (y(v) + 4) + '" font-size="12" fill="#5A5F69" text-anchor="end">' + v.toFixed(1) + '</text>');
    }
    for (var h = 1; h <= nH; h++) o.push('<text x="' + x(h) + '" y="' + (Hh - 10) + '" font-size="12" fill="#5A5F69" text-anchor="middle">h = ' + h + '</text>');
    var dots = [];
    keys.forEach(function (k) {
      var m = MOD[k], d = [];
      D.rmse[k].forEach(function (v, i) {
        if (v == null) return;
        d.push((d.length ? 'L' : 'M') + x(i + 1).toFixed(1) + ' ' + y(v).toFixed(1));
        dots.push('<circle cx="' + x(i + 1) + '" cy="' + y(v) + '" r="3.5" fill="' + m.color + '"><title>' + esc(m.label + ', h=' + (i + 1) + ': ' + v.toFixed(3)) + '</title></circle>');
      });
      o.push(line(d.join(' '), m.color, m.comb));
    });
    $('chart-rmse').innerHTML = '<svg viewBox="0 0 ' + W + ' ' + Hh + '" role="img" aria-label="RMSE de cada modelo por horizonte" font-family="Inter, sans-serif">' + o.concat(dots).join('') + '</svg>';
  }

  /* ---------- Pesos ---------- */
  function renderSegHW() {
    var hs = Object.keys(D.pesos).sort(function (a, b) { return a - b; });
    $('seg-hw').innerHTML = hs.map(function (h) {
      return '<button type="button" data-hw="' + h + '" aria-pressed="' + (h === S.hw) + '">' + h + (h === '1' ? ' trimestre' : ' trimestres') + '</button>';
    }).join('');
  }
  function renderPesos() {
    var P = D.pesos[S.hw];
    var h = '<thead><tr><th scope="col">Modelo</th>' + ESQ.map(function (q) { return '<th scope="col">' + q[1] + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.filter(function (m) { return !m.comb; }).forEach(function (m) {
      h += '<tr><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + '</span></th>' +
        ESQ.map(function (q) {
          var v = P[q[0]][m.k], a = Math.max(0.04, (v || 0) / 100);
          return '<td><div class="heat" style="background:rgba(43,75,196,' + a.toFixed(3) + ');color:' + (v >= 45 ? '#fff' : '#14161A') + '">' + (v == null ? '—' : v.toFixed(1) + '%') + '</div></td>';
        }).join('') + '</tr>';
    });
    $('tbl-pesos').innerHTML = h + '</tbody>';
    $('ic-nota').textContent = 'Criterios de información de cada modelo (ventana común de 20 residuos): ' +
      D.modelos.filter(function (m) { return !m.comb; }).map(function (m) { var c = D.ic[m.k]; return m.short + ' BIC ' + c.bic + ' · AIC ' + c.aic + ' · AICc ' + c.aicc; }).join(' | ') + '. Los pesos por error cambian con el horizonte; los de BIC, AIC y AICc no.';
  }

  /* ---------- Intervalos ---------- */
  function renderIntervalos() {
    var propio = S.int === 'modelo';
    $('int-desc').textContent = propio
      ? 'Intervalo de predicción propio de cada modelo (en logaritmos, pasado a nivel). Las combinaciones no tienen uno propio: se usa centro ± t·RMSE de la validación. No incluye la incertidumbre de las exógenas pronosticadas.'
      : 'Centro ± t·RMSE de la validación cruzada para todos los modelos (t de Student con n−1 g.l.; n son los errores de cada horizonte).';
    var h = '<thead><tr><th scope="col">Modelo</th>' + D.trimestres.map(function (q) { return '<th scope="col">' + q + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.forEach(function (m) {
      var i = ints(m.k);
      h += '<tr class="' + (m.comb ? 'is-comb' : '') + (m.k === S.bandaK ? ' is-main' : '') + '"><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + (propio && !i.propio ? ' <span class="muted small">(validación)</span>' : '') + '</span></th>' +
        D.trimestres.map(function (q, j) { return '<td>' + rangoTxt(i, j) + '</td>'; }).join('') + '</tr>';
    });
    $('tbl-int').innerHTML = h + '</tbody>';
    var hs = Object.keys(D.medidas).sort(function (a, b) { return a - b; });
    var c = '<thead><tr><th scope="col">Modelo</th>' + hs.map(function (x) { return '<th scope="col">h = ' + x + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.filter(function (m) { return D.cobertura[m.k]; }).forEach(function (m) {
      c += '<tr><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + '</span></th>' +
        D.cobertura[m.k].map(function (v) { return '<td class="' + (v != null && v < 0.8 ? 'bad' : '') + '">' + (v == null ? '—' : Math.round(v * 100) + '%') + '</td>'; }).join('') + '</tr>';
    });
    $('tbl-cob').innerHTML = c + '</tbody>';
  }

  /* ---------- Exógenas usadas ---------- */
  function renderExo() {
    var X = D.exogenas;
    var h = '<thead><tr><th scope="col">Variable</th>' + X.trimestres.map(function (q) { return '<th scope="col">' + q + '</th>'; }).join('') + '</tr></thead><tbody>';
    X.variables.forEach(function (v) {
      var vals = S.esc === 'obs' ? v.obs : v.pron;
      h += '<tr><th scope="row">' + esc(v.label) + '</th>' + vals.map(function (x, j) {
        var ob = S.esc === 'obs' && v.observado[j];
        return '<td>' + f2(x) + (ob ? ' <span class="tag">observado</span>' : (S.esc === 'obs' ? ' <span class="muted small">pron.</span>' : '')) + '</td>';
      }).join('') + '</tr>';
    });
    $('tbl-exo').innerHTML = h + '</tbody>';
  }

  /* ---------- Controles de escenario / banda ---------- */
  function renderControles() {
    $('seg-esc').innerHTML = Object.keys(D.meta.escenarios).map(function (k) {
      return '<button type="button" data-esc="' + k + '" aria-pressed="' + (k === S.esc) + '">' + esc(D.meta.escenarios[k]) + '</button>';
    }).join('');
    $('esc-desc').textContent = S.esc === 'obs'
      ? 'Se usan los valores observados donde INEGI ya los publicó (hoy, la EMEC de 2026T3) y el pronóstico de suavización exponencial en el resto. En la validación, las exógenas del periodo pronosticado son las observadas: es un pronóstico condicional, no uno hecho en tiempo real.'
      : 'Las exógenas futuras se pronostican con suavización exponencial. Es el escenario que se podría haber usado en tiempo real.';
    $('seg-int').innerHTML = [['modelo', 'Intervalo del modelo'], ['val', 'De la validación']].map(function (x) {
      return '<button type="button" data-int="' + x[0] + '" aria-pressed="' + (x[0] === S.int) + '">' + x[1] + '</button>';
    }).join('');
    $('sel-banda').innerHTML = D.modelos.map(function (m) { return '<option value="' + m.k + '"' + (m.k === S.bandaK ? ' selected' : '') + '>' + esc(m.short) + '</option>'; }).join('');
  }

  /* ---------- Meta ---------- */
  // https://<usuario>.github.io/<repo>/ -> https://github.com/<usuario>/<repo>
  function repoURL() {
    var h = location.hostname;
    if (!/\.github\.io$/.test(h)) return null;
    var user = h.replace(/\.github\.io$/, ''), seg = location.pathname.split('/').filter(Boolean)[0];
    return 'https://github.com/' + user + '/' + (seg && seg.indexOf('.') < 0 ? seg : h);
  }

  function renderMeta() {
    var m = D.meta;
    if (m.ejemplo) {
      $('banner-ejemplo').hidden = false;
      $('status-dot').className = 'status__dot demo';
      $('status-text').textContent = 'Datos de ejemplo';
      $('footer-gen').textContent = 'Datos de ejemplo · publicado con GitHub Actions';
    } else {
      $('status-dot').className = 'status__dot ok';
      $('status-text').textContent = 'Resultados del ' + fecha(m.generado);
      $('footer-gen').textContent = 'Resultados generados el ' + fecha(m.generado) + ' · publicado con GitHub Actions';
    }
    $('cv-desc').textContent = 'Validación cruzada con ventana expansiva: ' + m.n_pronosticos_cv + ' pronósticos, ' + m.n_origenes_cv +
      ' orígenes. Error = real − pronóstico. Theil U menor a 1 = mejor que repetir el último valor.';
    $('rango-datos').textContent = 'INEGI: ITAEE, EMEC, EMIM · ' + m.primer_trimestre + ' – ' + m.ultimo_trimestre;

    var repo = repoURL();
    if (repo) {
      $('lnk-repo').href = repo;
      $('lnk-nb').href = repo + '/blob/main/notebook_estimacion.ipynb';
    } else {
      $('lnk-repo').hidden = true; $('lnk-nb').hidden = true;
    }
  }

  function renderAll() {
    renderControles(); renderKPIs(); renderChips(); renderChart(); renderPanel(); renderTabla(); renderIntervalos(); renderSegH(); renderCV(); renderRMSE(); renderSegHW(); renderPesos(); renderExo();
  }

  /* ---------- Eventos ---------- */
  function press(group, attr, val) {
    group.querySelectorAll('[' + attr + ']').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute(attr) === val)); });
  }
  function bind() {
    $('chips').addEventListener('click', function (e) {
      var b = e.target.closest('.chip'); if (!b) return;
      S.vis[b.dataset.k] = !S.vis[b.dataset.k];
      renderChips(); renderChart(); renderRMSE();
    });
    $('qbtns').addEventListener('click', function (e) {
      var b = e.target.closest('.qbtn'); if (!b) return;
      S.sel = +b.dataset.q; renderPanel(); renderChart();
    });
    $('btn-banda').addEventListener('click', function () {
      S.banda = !S.banda; this.setAttribute('aria-pressed', String(S.banda)); renderChart();
    });
    document.querySelectorAll('[data-rango]').forEach(function (b) {
      b.addEventListener('click', function () { S.rango = b.dataset.rango; press(b.parentNode, 'data-rango', S.rango); renderChart(); });
    });
    document.querySelectorAll('[data-modo]').forEach(function (b) {
      b.addEventListener('click', function () { S.modo = b.dataset.modo; press(b.parentNode, 'data-modo', S.modo); renderTabla(); });
    });
    $('seg-h').addEventListener('click', function (e) {
      var b = e.target.closest('[data-h]'); if (!b) return;
      S.h = b.dataset.h; press($('seg-h'), 'data-h', S.h); renderCV();
    });
    $('btn-csv').addEventListener('click', descargarCSV);
    $('seg-esc').addEventListener('click', function (e) {
      var b = e.target.closest('[data-esc]'); if (!b || b.dataset.esc === S.esc) return;
      usar(b.dataset.esc); renderAll();
    });
    $('seg-int').addEventListener('click', function (e) {
      var b = e.target.closest('[data-int]'); if (!b) return;
      S.int = b.dataset.int; renderAll();
    });
    $('sel-banda').addEventListener('change', function () { S.bandaK = this.value; renderAll(); });
    $('seg-hw').addEventListener('click', function (e) {
      var b = e.target.closest('[data-hw]'); if (!b) return;
      S.hw = b.dataset.hw; renderSegHW(); renderPesos();
    });
  }

  /* ---------- Arranque ---------- */
  fetch('data/resultados.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      D = data;
      D.modelos.forEach(function (m) { MOD[m.k] = m; S.vis[m.k] = DEFAULT_VIS.indexOf(m.k) >= 0; });
      S.bandaK = D.meta.modelo_banda; usar(S.esc);
      renderMeta(); renderAll(); bind();
    })
    .catch(function (err) {
      $('status-text').textContent = 'Error al cargar datos';
      document.querySelector('.main').insertAdjacentHTML('afterbegin',
        '<div class="card" style="padding:20px">No se pudo cargar <code>data/resultados.json</code> (' + esc(err.message) +
        '). Si abriste el archivo con doble clic, sirve la carpeta: <code>python -m http.server -d site</code>.</div>');
    });
})();
