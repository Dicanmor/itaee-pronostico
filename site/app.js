/* Plataforma de resultados · Pronóstico ITAEE Jalisco
 * Lee data/resultados.json (lo genera scripts/exportar_resultados.py) y pinta todo.
 * Sin dependencias ni build. */
(function () {
  'use strict';

  var D;            // datos
  var MOD = {};     // modelos por clave
  var S = { vis: {}, sel: 0, banda: true, modo: 'nivel', h: '1', rango: '5a' };
  var DEFAULT_VIS = ['ETS', 'COMB_SIMPLE', 'COMB_VARIANZA', 'COMB_BIC'];
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

  /* ---------- KPIs ---------- */
  function renderKPIs() {
    var H = D.historico, last = H[H.length - 1];
    var prev = H.filter(function (p) { return p.t === hace4(last.t); })[0];
    var c = D.pronosticos[D.meta.modelo_banda], q = D.trimestres, b = D.base_anual, w = D.banda;

    var m1 = D.medidas['1'] || {}, hs = Object.keys(D.medidas).sort(), mh = D.medidas[hs[hs.length - 1]] || {};
    var best = null;
    Object.keys(m1).forEach(function (k) { if (m1[k].RMSE != null && (!best || m1[k].RMSE < m1[best].RMSE)) best = k; });

    var cards = [
      { label: 'Último dato observado · ' + last.t, value: last.v.toFixed(2), sub: prev ? pct(last.v, prev.v) + ' vs ' + prev.t : '', cls: prev ? sgn(last.v, prev.v) : '' },
      { label: 'Pronóstico ' + q[0] + ' · comb. por error', value: f2(c[0]), sub: pct(c[0], b[0]) + ' vs ' + hace4(q[0]) + ' · banda ' + (c[0] - w[0]).toFixed(1) + ' – ' + (c[0] + w[0]).toFixed(1), cls: '' },
      { label: 'Pronóstico ' + q[1] + ' · comb. por error', value: f2(c[1]), sub: pct(c[1], b[1]) + ' vs ' + hace4(q[1]), cls: sgn(c[1], b[1]) },
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
    if (S.banda) D.pronosticos[D.meta.modelo_banda].forEach(function (v, j) { vals.push(v + D.banda[j], v - D.banda[j]); });
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
      var c = D.pronosticos[D.meta.modelo_banda], up = [P(nh - 1, last.v)], dn = [P(nh - 1, last.v)];
      c.forEach(function (v, j) { up.push(P(nh + j, v + D.banda[j])); dn.unshift(P(nh + j, v - D.banda[j])); });
      o.push('<polygon points="' + up.concat(dn).map(function (s) { return s.replace(' ', ','); }).join(' ') + '" fill="#E34948" fill-opacity="0.12"/>');
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
    var k0 = D.meta.modelo_banda, c = D.pronosticos[k0], s = S.sel;
    $('qbtns').innerHTML = D.trimestres.map(function (q, j) {
      return '<button type="button" class="qbtn" data-q="' + j + '" aria-pressed="' + (j === s) + '"><b>' + q + '</b><span>Comb. ' + f2(c[j]) + '</span></button>';
    }).join('');
    $('sel-label').textContent = MOD[k0].label + ' · ' + D.trimestres[s];
    $('sel-main').textContent = f2(c[s]);
    $('sel-sub').textContent = 'Banda 95%: ' + (c[s] - D.banda[s]).toFixed(1) + ' – ' + (c[s] + D.banda[s]).toFixed(1) + ' · ' + pct(c[s], D.base_anual[s]) + ' a/a';
    $('sel-rows').innerHTML = '<div class="prow prow--head"><span>Modelo</span><span>Nivel</span><span>a/a</span></div>' +
      D.modelos.map(function (m) {
        var v = D.pronosticos[m.k][s];
        return '<div class="prow num' + (m.k === k0 ? ' is-main' : '') + '"><span class="prow__name"><span class="sw" style="background:' + m.color + '"></span><span>' +
          esc(m.short) + '</span></span><span>' + f2(v) + '</span><span>' + pct(v, D.base_anual[s]) + '</span></div>';
      }).join('');
  }

  /* ---------- Tabla de pronósticos ---------- */
  function renderTabla() {
    var k0 = D.meta.modelo_banda, firstComb = true;
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
    rows.push(['BANDA_95_SEMIANCHO'].concat(D.banda));
    var blob = new Blob(['﻿' + rows.map(function (r) { return r.join(','); }).join('\n')], { type: 'text/csv;charset=utf-8' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pronostico_itaee_jalisco_' + D.trimestres[0] + '_' + D.trimestres[D.trimestres.length - 1] + '.csv';
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
  function renderPesos() {
    var P = D.pesos;
    var h = '<thead><tr><th scope="col">Modelo</th>' + P.columnas.map(function (c) { return '<th scope="col">' + esc(c) + '</th>'; }).join('') + '</tr></thead><tbody>';
    D.modelos.forEach(function (m) {
      var r = P.filas[m.k]; if (!r) return;
      h += '<tr><th scope="row"><span class="name"><span class="sw" style="background:' + m.color + '"></span>' + esc(m.label) + '</span></th>' +
        r.map(function (v) {
          var a = Math.max(0.04, (v || 0) / 100);
          return '<td><div class="heat" style="background:rgba(43,75,196,' + a.toFixed(3) + ');color:' + (v >= 45 ? '#fff' : '#14161A') + '">' + (v == null ? '—' : v.toFixed(1) + '%') + '</div></td>';
        }).join('') + '</tr>';
    });
    $('tbl-pesos').innerHTML = h + '</tbody>';
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
    renderChips(); renderChart(); renderPanel(); renderTabla(); renderSegH(); renderCV(); renderRMSE(); renderPesos();
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
  }

  /* ---------- Arranque ---------- */
  fetch('data/resultados.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
    .then(function (data) {
      D = data;
      D.modelos.forEach(function (m) { MOD[m.k] = m; S.vis[m.k] = DEFAULT_VIS.indexOf(m.k) >= 0; });
      renderKPIs(); renderMeta(); renderAll(); bind();
    })
    .catch(function (err) {
      $('status-text').textContent = 'Error al cargar datos';
      document.querySelector('.main').insertAdjacentHTML('afterbegin',
        '<div class="card" style="padding:20px">No se pudo cargar <code>data/resultados.json</code> (' + esc(err.message) +
        '). Si abriste el archivo con doble clic, sirve la carpeta: <code>python -m http.server -d site</code>.</div>');
    });
})();
