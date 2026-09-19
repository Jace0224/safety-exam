(function () {
  'use strict';
  var root = document.getElementById('view');
  var TYPES = { written: '필답형', practical: '작업형' };

  /* ───────── 저장소 ───────── */
  var KEY = 'ise.v1';
  var mem = null;
  function blank() {
    return { added: { written: [], practical: [] }, wrong: {}, mockRes: {}, settings: { apiKey: '', model: 'claude-sonnet-5' } };
  }
  function load() {
    var d = blank();
    try {
      var raw = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (raw) {
        d.added.written = (raw.added && raw.added.written) || [];
        d.added.practical = (raw.added && raw.added.practical) || [];
        d.wrong = raw.wrong || {};
        d.mockRes = raw.mockRes || {};
        d.settings = Object.assign(d.settings, raw.settings || {});
      }
    } catch (e) { if (mem) return mem; }
    return d;
  }
  var store = load();
  function save() {
    mem = store;
    try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
  }

  /* ───────── 유틸 ───────── */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function ansHTML(a) {
    return esc(a).replace(/\{\{([^}]+)\}\}/g, function (m, g) { return '<mark>' + g.split('|')[0].trim() + '</mark>'; });
  }
  function hasBlanks(q) { return /\{\{[^}]+\}\}/.test(q.a); }
  function mockAll() {
    var a = [];
    [1, 2, 3, 4, 5].forEach(function (n) { a = a.concat(QDATA.mock[n] || []); });
    return a;
  }
  function mockOpts(sel) {
    return [1, 2, 3, 4, 5].map(function (n) {
      return '<option value="mock:' + n + '"' + (sel === 'mock:' + n ? ' selected' : '') + '>모의고사 ' + n + '회</option>';
    }).join('');
  }
  function subjOk(q, subj) {
    if (!subj) return true;
    if (subj.indexOf('mock:') === 0) return String(q.mock) === subj.slice(5);
    return q.subject === subj;
  }
  function mockPAll() {
    var a = [];
    [1, 2, 3, 4, 5].forEach(function (n) { a = a.concat(QDATA.mockP[n] || []); });
    return a;
  }
  /* 모의고사 문항은 퀴즈·오답노트·목록과 별개로 관리한다 */
  function getList(type) { return QDATA[type].concat(store.added[type]); }
  function findQ(id) {
    var all = getList('written').concat(getList('practical'));
    for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i];
    return null;
  }
  function qNo(q) {
    if (q.mock) return 'M' + q.mock + '-' + (QDATA.mock[q.mock].indexOf(q) + 1);
    if (q.user) return 'U' + (store.added[q.type].indexOf(q) + 1);
    return String(QDATA[q.type].indexOf(q) + 1);
  }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  var toastTimer;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('on'); }, 2600);
  }
  function subjects(type) {
    var s = [];
    getList(type).forEach(function (q) { if (s.indexOf(q.subject) < 0) s.push(q.subject); });
    return s;
  }
  function opts(arr, sel) {
    return arr.map(function (v) { return '<option value="' + esc(v) + '"' + (v === sel ? ' selected' : '') + '>' + esc(v) + '</option>'; }).join('');
  }

  /* ───────── 메뉴 ───────── */
  var ROUTES = [
    { id: 'written', plate: '01', label: '필답형', view: function () { viewList('written'); }, cnt: function () { return QDATA.written.length + store.added.written.length; } },
    { id: 'practical', plate: '02', label: '작업형', view: function () { viewList('practical'); }, cnt: function () { return getList('practical').length; } },
    { id: 'mock', plate: '03', label: '모의고사', view: viewMock, cnt: function () { return mockAll().length + mockPAll().length; } },
    { id: 'gen', plate: '04', label: '문제생성', view: viewGen, cnt: function () { return ''; } },
    { id: 'quiz', plate: '05', label: '퀴즈', view: function () { viewQuiz('quiz'); }, cnt: function () { return getList('written').filter(hasBlanks).length + getList('practical').filter(hasBlanks).length; } },
    { id: 'note', plate: '06', label: '오답노트', view: function () { viewQuiz('note'); }, cnt: function () { return Object.keys(store.wrong).filter(function (id) { return findQ(id); }).length; } }
  ];
  function drawNav(cur) {
    document.getElementById('nav').innerHTML = ROUTES.map(function (r) {
      return '<a href="#' + r.id + '" class="' + (r.id === cur ? 'on' : '') + '"><span class="plate">' + r.plate + '</span><span>' + r.label + '</span><span class="cnt">' + r.cnt() + '</span></a>';
    }).join('');
  }
  function route() {
    var id = (location.hash || '#written').slice(1);
    var r = ROUTES.filter(function (x) { return x.id === id; })[0] || ROUTES[0];
    clearInterval(mockUI.timer);
    drawNav(r.id);
    r.view();
    window.scrollTo(0, 0);
  }
  window.addEventListener('hashchange', route);

  function head(title, sub, right) {
    return '<div class="head"><div><h1>' + title + '</h1><p>' + sub + '</p></div><div>' + (right || '') + '</div></div>';
  }

  /* ───────── 필답형 / 작업형 목록 ───────── */
  var listUI = {};
  function viewList(type) {
    var ui = listUI[type] || (listUI[type] = { q: '', subj: '', hide: false });
    var base = QDATA[type];
    root.innerHTML =
      head(TYPES[type] + ' 예상문제', type === 'written'
        ? '과목별 필답형 예상문제와 정답. 노란 표시는 정답의 핵심어입니다.'
        : '영상 상황형 작업형 예상문제. 위험요인과 안전조치를 함께 익힙니다.',
        '<span class="tag">' + base.length + '문항</span>') +
      '<div class="bar">' +
      '<input type="search" id="fq" class="grow" placeholder="문제·정답 검색" value="' + esc(ui.q) + '">' +
      '<select id="fs"><option value="">전체 과목</option>' + opts(subjects(type), ui.subj) + '</select>' +
      '<label class="chk"><input type="checkbox" id="fh"' + (ui.hide ? ' checked' : '') + '> 정답 가리기</label>' +
      '<span class="meta" id="fc"></span></div>' +
      '<div class="wrap"><table class="tbl list' + (ui.hide ? ' hide' : '') + '" id="tb"><thead><tr><th>No</th><th>과목</th><th>문제</th><th>정답</th></tr></thead><tbody id="tbody"></tbody></table></div>';

    function row(q) {
      return '<tr data-id="' + q.id + '"><td class="no">' + qNo(q) + '</td><td class="sj"><span class="subj-chip">' + esc(q.subject) + '</span></td>' +
        '<td class="q">' + esc(q.q) + '</td><td class="a"><div class="ans">' + ansHTML(q.a) + '</div><div class="hint-hide">클릭하면 정답이 보입니다</div>' +
        (q.user ? '<div style="margin-top:8px"><button class="sm danger" data-del="' + q.id + '">삭제</button></div>' : '') + '</td></tr>';
    }
    function draw() {
      var kw = ui.q.trim().toLowerCase();
      var pass = function (q) {
        return subjOk(q, ui.subj) && (!kw || (q.q + ' ' + q.a).toLowerCase().indexOf(kw) >= 0);
      };
      var main = base.filter(pass), user = store.added[type].filter(function (q) { return !ui.subj && pass(q) || (ui.subj && pass(q)); });
      var h = main.map(row).join('');
      var mc = 0;
      if (store.added[type].length) {
        h += '<tr class="sec"><td colspan="4">[사용자추가] <span class="meta" style="color:#111">' + store.added[type].length + '문항</span></td></tr>' + user.map(row).join('');
      }
      if (!main.length && !user.length && !mc) h = '<tr><td colspan="4" class="empty">조건에 맞는 문제가 없습니다.</td></tr>';
      document.getElementById('tbody').innerHTML = h;
      document.getElementById('fc').textContent = (main.length + mc + user.length) + '개 표시';
    }
    draw();
    document.getElementById('fq').addEventListener('input', function (e) { ui.q = e.target.value; draw(); });
    document.getElementById('fs').addEventListener('change', function (e) { ui.subj = e.target.value; draw(); });
    document.getElementById('fh').addEventListener('change', function (e) {
      ui.hide = e.target.checked;
      document.getElementById('tb').classList.toggle('hide', ui.hide);
    });
    document.getElementById('tbody').addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]');
      if (d) {
        if (!confirm('이 사용자추가 문제를 삭제할까요?')) return;
        var id = d.getAttribute('data-del');
        store.added[type] = store.added[type].filter(function (q) { return q.id !== id; });
        delete store.wrong[id]; save(); drawNav(type); viewList(type); return;
      }
      var td = e.target.closest('td.a');
      if (td && ui.hide) td.parentNode.classList.toggle('shown');
    });
  }

  /* ───────── 모의고사 (필답형 / 작업형) ───────── */
  var mockUI = { type: 'written', n: 1, running: false, hide: false, only: false, t0: 0, elapsed: 0, timer: null };
  var MTYPE = {
    written: { label: '필답형', src: 'mock' },
    practical: { label: '작업형', src: 'mockP' }
  };
  function mockList(type, n) { return QDATA[MTYPE[type].src][n] || []; }
  function fmtT(ms) {
    var t = Math.floor(ms / 1000), h = Math.floor(t / 3600), m = Math.floor(t % 3600 / 60), r = t % 60;
    function p(x) { return (x < 10 ? '0' : '') + x; }
    return (h ? h + ':' + p(m) : String(m)) + ':' + p(r);
  }
  function mockStat(type, n) {
    var o = 0, x = 0, l = mockList(type, n);
    l.forEach(function (q) { var r = store.mockRes[q.id]; if (r === 'o') o++; else if (r === 'x') x++; });
    return { o: o, x: x, t: l.length };
  }
  function viewMock() {
    var ui = mockUI, type = ui.type, n = ui.n, list = mockList(type, n), mt = MTYPE[type];
    root.innerHTML =
      head('모의고사', '시험처럼 풀어 보는 메뉴입니다(빈칸 퀴즈와는 별개). 필답형은 회당 20문항, 작업형은 영상 상황형 회당 10문항이며 “시작”을 누르면 정답을 가리고 시간을 잽니다. 끝나면 정답을 확인하고 문항별로 맞음/틀림을 표시해 채점하세요.',
        '<span class="tag">' + mt.label + ' · 5회 × ' + list.length + '문항</span>') +
      '<div class="seg seg-type" id="tseg"><button data-t="written" class="' + (type === 'written' ? 'on' : '') + '">필답형 모의고사</button><button data-t="practical" class="' + (type === 'practical' ? 'on' : '') + '">작업형 모의고사</button></div>' +
      '<div class="seg" id="seg"></div>' +
      '<div class="bar"><button class="pri" id="mstart"></button><button id="mshow">정답 확인·채점</button>' +
      '<label class="chk"><input type="checkbox" id="monly"' + (ui.only ? ' checked' : '') + '> 틀린 문제만</label>' +
      '<button class="danger sm" id="mreset">채점 초기화</button><span class="meta" id="mtime"></span></div>' +
      '<div class="stat" id="msum" style="margin-bottom:12px"></div>' +
      '<div class="wrap"><table class="tbl list" id="tb"><thead><tr><th>No</th><th>' + (type === 'written' ? '과목' : '분야') + '</th><th>문제</th><th>정답 · 채점</th></tr></thead><tbody id="tbody"></tbody></table></div>';

    function drawSeg() {
      document.getElementById('seg').innerHTML = [1, 2, 3, 4, 5].map(function (k) {
        var s = mockStat(type, k);
        return '<button data-n="' + k + '" class="' + (k === n ? 'on' : '') + '">' + k + '회<small>' + s.o + '/' + s.t + '</small></button>';
      }).join('');
    }
    function drawSum() {
      var s = mockStat(type, n), un = s.t - s.o - s.x;
      document.getElementById('msum').innerHTML = mt.label + ' ' + n + '회 — 맞음 <b>' + s.o + '</b> · 틀림 <b>' + s.x + '</b> · 미채점 <b>' + un + '</b> · 정답률 <b>' + Math.round(s.o / s.t * 100) + '%</b>';
    }
    function drawTime() {
      var el = document.getElementById('mtime');
      if (ui.running) el.textContent = '경과 ' + fmtT(Date.now() - ui.t0);
      else el.textContent = ui.elapsed ? '소요 ' + fmtT(ui.elapsed) : '';
    }
    function drawBtns() {
      document.getElementById('mstart').textContent = ui.running ? '다시 시작' : '모의고사 시작';
      document.getElementById('tb').classList.toggle('hide', ui.hide);
      drawTime();
    }
    function row(q, i) {
      var r = store.mockRes[q.id] || '';
      return '<tr data-id="' + q.id + '" class="' + (r ? 'r-' + r : '') + '"><td class="no">' + (i + 1) + '</td><td class="sj"><span class="subj-chip">' + esc(q.subject) + '</span></td>' +
        '<td class="q">' + esc(q.q) + '</td><td class="a"><div class="ans">' + ansHTML(q.a) + '</div><div class="hint-hide">클릭하면 정답이 보입니다</div>' +
        '<div class="mk"><button class="o' + (r === 'o' ? ' on' : '') + '" data-mk="o">맞음</button><button class="x' + (r === 'x' ? ' on' : '') + '" data-mk="x">틀림</button></div></td></tr>';
    }
    function drawRows() {
      var h = '';
      list.forEach(function (q, i) { if (!ui.only || store.mockRes[q.id] === 'x') h += row(q, i); });
      if (!h) h = '<tr><td colspan="4" class="empty">' + (ui.only ? '틀림으로 표시한 문제가 없습니다.' : '문제가 없습니다.') + '</td></tr>';
      document.getElementById('tbody').innerHTML = h;
    }
    function startTimer() { clearInterval(ui.timer); ui.timer = setInterval(drawTime, 1000); }
    function resetState() { clearInterval(ui.timer); ui.running = false; ui.hide = false; ui.elapsed = 0; ui.only = false; }

    drawRows(); drawSeg(); drawSum(); drawBtns();
    if (ui.running) startTimer();

    document.getElementById('tseg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]'); if (!b) return;
      resetState(); ui.type = b.getAttribute('data-t'); ui.n = 1; viewMock();
    });
    document.getElementById('seg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-n]'); if (!b) return;
      resetState(); ui.n = parseInt(b.getAttribute('data-n'), 10); viewMock();
    });
    document.getElementById('mstart').addEventListener('click', function () {
      ui.running = true; ui.hide = true; ui.only = false; ui.t0 = Date.now(); ui.elapsed = 0;
      document.getElementById('monly').checked = false; drawRows();
      startTimer(); drawBtns(); toast(mt.label + ' ' + n + '회 시작! 정답을 가리고 시간을 잽니다.');
      window.scrollTo(0, 0);
    });
    document.getElementById('mshow').addEventListener('click', function () {
      if (ui.running) { ui.elapsed = Date.now() - ui.t0; ui.running = false; clearInterval(ui.timer); toast('소요 시간 ' + fmtT(ui.elapsed)); }
      ui.hide = false; drawBtns();
    });
    document.getElementById('monly').addEventListener('change', function (e) { ui.only = e.target.checked; drawRows(); });
    document.getElementById('mreset').addEventListener('click', function () {
      if (!confirm(mt.label + ' ' + n + '회 채점 기록을 초기화할까요?')) return;
      list.forEach(function (q) { delete store.mockRes[q.id]; });
      save(); viewMock();
    });
    document.getElementById('tbody').addEventListener('click', function (e) {
      var mk = e.target.closest('button[data-mk]');
      if (mk) {
        var tr = mk.closest('tr'), id = tr.getAttribute('data-id'), v = mk.getAttribute('data-mk');
        if (store.mockRes[id] === v) delete store.mockRes[id]; else store.mockRes[id] = v;
        save();
        var cur = store.mockRes[id] || '';
        tr.className = (cur ? 'r-' + cur : '') + (tr.classList.contains('shown') ? ' shown' : '');
        tr.querySelector('button.o').classList.toggle('on', cur === 'o');
        tr.querySelector('button.x').classList.toggle('on', cur === 'x');
        drawSeg(); drawSum();
        return;
      }
      var td = e.target.closest('td.a');
      if (td && ui.hide) td.parentNode.classList.toggle('shown');
    });
  }

  /* ───────── 문제생성 ───────── */
  var genState = { type: 'written', q: '', a: '' };
  var SYS = {
    written: '당신은 한국 산업안전기사 실기(필답형) 시험 전문 강사입니다. 사용자가 입력한 문제에 대해 시험 답안 형식으로 정답을 작성하세요. ' +
      '산업안전보건법령·산업안전보건기준에 관한 규칙 등의 수치와 기준을 정확히 쓰고, 항목이 여러 개면 ①②③ 번호를 붙여 줄바꿈하세요. ' +
      '계산 문제는 식과 결과를 함께 쓰세요. 서론, 마크다운 기호(**, #)는 쓰지 마세요. ' +
      '퀴즈 빈칸용으로 핵심 용어와 수치는 {{핵심어}} 형태로 감싸고, 인정되는 다른 표현이 있으면 {{정답|다른표현}}으로 쓰세요. 답안 본문만 출력하세요.',
    practical: '당신은 한국 산업안전기사 실기(작업형) 시험 전문 강사입니다. 사용자가 입력한 영상 상황 또는 문제에 대해 시험 답안 형식으로 작성하세요. ' +
      '반드시 "▶ 위험요인 :" 한 줄과 "▶ 안전조치 :" 항목(①②③ 번호, 줄바꿈)으로 구성하고, 관련 법령 수치·기준은 정확히 쓰세요. ' +
      '서론과 마크다운 기호(**, #)는 쓰지 마세요. ' +
      '퀴즈 빈칸용으로 핵심 용어와 수치는 {{핵심어}} 형태로 감싸세요. 답안 본문만 출력하세요.'
  };
  function viewGen() {
    var s = store.settings;
    root.innerHTML =
      head('문제생성', '문제를 입력하면 Claude가 정답을 만들고, 원하는 목록 하단의 [사용자추가]에 넣을 수 있습니다.') +
      '<div class="grid2">' +
      '<section class="card"><h2><span class="n">1</span>문제 입력</h2>' +
      '<div class="bar" style="margin-bottom:10px"><select id="gt"><option value="written">필답형</option><option value="practical">작업형</option></select></div>' +
      '<textarea id="gq" rows="4" placeholder="예) 산업안전보건법령상 안전보건관리책임자의 업무 5가지를 쓰시오.">' + esc(genState.q) + '</textarea>' +
      '<div class="row"><button class="pri" id="gs">send</button><span class="status" id="gst"></span></div></section>' +
      '<section class="card"><h2><span class="n">2</span>정답 표시란</h2>' +
      '<textarea id="ga" rows="10" placeholder="send를 누르면 정답이 여기에 표시됩니다. 직접 수정하거나 직접 입력할 수도 있습니다.">' + esc(genState.a) + '</textarea>' +
      '<div class="row"><button class="dark" id="gadd">문제목록추가</button><span class="note">선택한 유형의 목록 하단 [사용자추가]에 등록됩니다.</span></div></section>' +
      '</div>' +
      '<details class="set"' + (s.apiKey ? '' : ' open') + '><summary>Claude 연결 설정 · 데이터 백업</summary>' +
      '<div class="field"><label for="gk">Anthropic API 키</label><input type="password" id="gk" autocomplete="off" placeholder="sk-ant-..." value="' + esc(s.apiKey) + '"></div>' +
      '<div class="field"><label for="gm">모델</label><input type="text" id="gm" value="' + esc(s.model) + '"></div>' +
      '<p class="note">API 키는 이 브라우저의 저장소에만 보관되며, send를 누를 때 Anthropic API로만 전송됩니다. 키 없이도 정답표시란에 직접 입력해 추가할 수 있습니다.</p>' +
      '<div class="row"><button id="gsave">설정 저장</button><button id="gexp">백업 내려받기</button><button id="gimp">백업 불러오기</button><input type="file" id="gfile" accept="application/json" hidden></div></details>';

    document.getElementById('gt').value = genState.type;
    var st = document.getElementById('gst');
    function setStatus(msg, err) { st.className = 'status' + (err ? ' err' : ''); st.innerHTML = msg; }
    document.getElementById('gt').addEventListener('change', function (e) { genState.type = e.target.value; });
    document.getElementById('gq').addEventListener('input', function (e) { genState.q = e.target.value; });
    document.getElementById('ga').addEventListener('input', function (e) { genState.a = e.target.value; });

    document.getElementById('gsave').addEventListener('click', function () {
      store.settings.apiKey = document.getElementById('gk').value.trim();
      store.settings.model = document.getElementById('gm').value.trim() || 'claude-sonnet-5';
      save(); toast('설정을 저장했습니다.');
    });
    document.getElementById('gs').addEventListener('click', function () {
      var q = genState.q.trim();
      if (!q) { setStatus('문제를 입력하세요.', true); return; }
      var key = document.getElementById('gk').value.trim() || store.settings.apiKey;
      if (!key) { setStatus('API 키가 없습니다. 아래 설정에 입력하거나 정답을 직접 입력하세요.', true); document.querySelector('details.set').open = true; return; }
      store.settings.apiKey = key; store.settings.model = document.getElementById('gm').value.trim() || store.settings.model; save();
      var btn = document.getElementById('gs'); btn.disabled = true;
      setStatus('<span class="spin"></span>Claude가 정답을 작성 중입니다…');
      fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json', 'x-api-key': key,
          'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true'
        },
        body: JSON.stringify({
          model: store.settings.model, max_tokens: 1200, system: SYS[genState.type],
          messages: [{ role: 'user', content: q }]
        })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          if (!res.ok) throw new Error((res.j && res.j.error && res.j.error.message) || '요청에 실패했습니다.');
          var text = (res.j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('\n').trim();
          if (!text) throw new Error('빈 응답이 반환되었습니다.');
          genState.a = text; document.getElementById('ga').value = text; setStatus('정답이 생성되었습니다. 필요하면 수정한 뒤 추가하세요.');
        })
        .catch(function (e) { setStatus('오류: ' + esc(e.message), true); })
        .then(function () { btn.disabled = false; });
    });
    document.getElementById('gadd').addEventListener('click', function () {
      var q = genState.q.trim(), a = genState.a.trim(), type = genState.type;
      if (!q || !a) { toast('문제와 정답을 모두 입력하세요.'); return; }
      if (getList(type).some(function (x) { return x.q === q; })) { toast('이미 같은 문제가 목록에 있습니다.'); return; }
      store.added[type].push({ id: 'U' + Date.now().toString(36), type: type, subject: '사용자추가', q: q, a: a, unordered: false, user: true });
      save(); drawNav('gen');
      toast(TYPES[type] + ' 목록 하단 [사용자추가]에 추가했습니다.');
      genState.q = ''; genState.a = '';
      document.getElementById('gq').value = ''; document.getElementById('ga').value = ''; setStatus('');
    });
    document.getElementById('gexp').addEventListener('click', function () {
      var blob = new Blob([JSON.stringify(store, null, 2)], { type: 'application/json' });
      var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'safety-exam-backup.json'; a.click();
    });
    document.getElementById('gimp').addEventListener('click', function () { document.getElementById('gfile').click(); });
    document.getElementById('gfile').addEventListener('change', function (e) {
      var f = e.target.files[0]; if (!f) return;
      var rd = new FileReader();
      rd.onload = function () {
        try {
          var d = JSON.parse(rd.result);
          store.added = { written: (d.added && d.added.written) || [], practical: (d.added && d.added.practical) || [] };
          store.wrong = d.wrong || {}; store.mockRes = d.mockRes || {}; save(); drawNav('gen'); toast('백업을 불러왔습니다.');
        } catch (err) { toast('올바른 백업 파일이 아닙니다.'); }
      };
      rd.readAsText(f);
    });
  }

  /* ───────── 퀴즈 / 오답노트 ───────── */
  var quizUI = {
    quiz: { type: 'written', subj: '', rand: false, pool: null, i: 0, tried: 0, correct: 0 },
    note: { type: 'written', subj: '', rand: false, pool: null, i: 0, tried: 0, correct: 0 }
  };
  function norm(s) { return String(s).toLowerCase().replace(/[\s·・,.\-()\[\]「」'"“”‘’~∙:;]/g, ''); }

  function buildPool(mode) {
    var ui = quizUI[mode];
    var ids = getList(ui.type).filter(function (q) {
      return hasBlanks(q) && subjOk(q, ui.subj) && (mode === 'quiz' || store.wrong[q.id]);
    }).map(function (q) { return q.id; });
    ui.pool = ui.rand ? shuffle(ids) : ids;
    ui.i = 0;
  }

  function buildAnswer(q) {
    var box = document.createElement('div'); box.className = 'ans-box';
    var blanks = [];
    q.a.split('\n').forEach(function (line) {
      var d = document.createElement('div'); d.className = 'ans-line';
      var last = 0, m, re = /\{\{([^}]+)\}\}/g;
      while ((m = re.exec(line))) {
        d.appendChild(document.createTextNode(line.slice(last, m.index)));
        var accepts = m[1].split('|').map(function (s) { return s.trim(); });
        var inp = document.createElement('input');
        inp.type = 'text'; inp.className = 'blank'; inp.autocomplete = 'off'; inp.spellcheck = false;
        var w = Math.max.apply(null, accepts.map(function (s) { return s.length; }));
        inp.style.width = Math.min(Math.max(w * 1.9 + 3, 6), 40) + 'ch';
        var b = { inp: inp, accepts: accepts, corr: null };
        blanks.push(b); d.appendChild(inp); last = m.index + m[0].length;
      }
      d.appendChild(document.createTextNode(line.slice(last)));
      box.appendChild(d);
    });
    return { box: box, blanks: blanks };
  }

  function gradeBlanks(q, blanks) {
    var ok = 0;
    if (q.unordered) {
      var used = {};
      blanks.forEach(function (b) {
        var v = norm(b.inp.value), hit = -1;
        if (v) for (var j = 0; j < blanks.length; j++) {
          if (!used[j] && blanks[j].accepts.some(function (a) { return norm(a) === v; })) { hit = j; break; }
        }
        if (hit >= 0) used[hit] = true;
        b.ok = hit >= 0;
      });
    } else {
      blanks.forEach(function (b) {
        var v = norm(b.inp.value);
        b.ok = !!v && b.accepts.some(function (a) { return norm(a) === v; });
      });
    }
    blanks.forEach(function (b) { if (b.ok) ok++; });
    return ok;
  }

  function viewQuiz(mode) {
    var ui = quizUI[mode];
    var isNote = mode === 'note';
    function qcount(t) {
      return getList(t).filter(function (q) { return hasBlanks(q) && (!isNote || store.wrong[q.id]); }).length;
    }
    if (isNote) {
      /* 오답노트는 들어올 때마다 최신 오답 목록으로 다시 만들고, 보던 문제는 유지 */
      var keepId = ui.pool && ui.pool[ui.i];
      buildPool(mode);
      if (keepId) { var kk = ui.pool.indexOf(keepId); if (kk >= 0) ui.i = kk; }
      /* 현재 유형에 오답이 없고 다른 유형에 있으면 그쪽으로 자동 전환 */
      var other = ui.type === 'written' ? 'practical' : 'written';
      if (!ui.pool.length && !ui.subj && qcount(other) > 0) { ui.type = other; buildPool(mode); }
    } else {
      var fresh = getList(ui.type).filter(function (q) { return hasBlanks(q) && subjOk(q, ui.subj); }).length;
      if (!ui.pool || ui.pool.length !== fresh) buildPool(mode);
    }
    var subs = subjects(ui.type);
    root.innerHTML =
      head(TYPES[ui.type] + (isNote ? ' 오답노트' : ' 퀴즈'),
        isNote ? TYPES[ui.type] + ' 퀴즈에서 틀린 문제만 모아 다시 풉니다. 이해했다면 “오답 해제”로 목록에서 뺄 수 있습니다.'
          : (ui.type === 'written' ? '필답형 예상문제(기본 100문항 + 사용자추가)의 정답 핵심어를 빈칸에 채워 넣으며 복습합니다.' : '작업형 예상문제(기본 100문항 + 사용자추가)의 위험요인·안전조치 핵심어를 빈칸에 채워 넣으며 복습합니다.') + ' 시험처럼 풀어 보려면 “모의고사” 메뉴를 이용하세요.',
        '<span class="tag" id="qtag"></span>') +
      '<div class="qwrap"><div class="seg seg-type" id="qtseg">' +
      ['written', 'practical'].map(function (t) {
        return '<button data-t="' + t + '" class="' + (t === ui.type ? 'on' : '') + '">' + TYPES[t] + (isNote ? ' 오답노트' : ' 퀴즈') + '<small style="margin-left:8px">' + qcount(t) + '</small></button>';
      }).join('') + '</div><div class="bar">' +
      '<select id="qs"><option value="">전체 과목</option>' + opts(subs, ui.subj) + '</select>' +
      '<select id="qo"><option value="seq">순서대로</option><option value="rand"' + (ui.rand ? ' selected' : '') + '>무작위</option></select>' +
      (isNote ? '<button class="danger sm" id="qclear">전체 해제</button>' : '') +
      '<div class="stat" id="qstat"></div></div>' +
      '<div class="prog"><i id="qbar"></i></div><div id="qbody"></div></div>';

    document.getElementById('qs').addEventListener('change', function (e) { ui.subj = e.target.value; buildPool(mode); viewQuiz(mode); });
    document.getElementById('qo').addEventListener('change', function (e) { ui.rand = e.target.value === 'rand'; buildPool(mode); viewQuiz(mode); });
    if (isNote) document.getElementById('qclear').addEventListener('click', function () {
      if (!Object.keys(store.wrong).length) return;
      if (!confirm('오답노트를 모두 비울까요?')) return;
      store.wrong = {}; save(); drawNav('note'); buildPool(mode); viewQuiz(mode);
    });
    document.getElementById('qtseg').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-t]'); if (!b) return;
      ui.type = b.getAttribute('data-t'); ui.subj = ''; ui.tried = 0; ui.correct = 0;
      buildPool(mode); viewQuiz(mode);
    });
    drawQ();

    function drawStat() {
      document.getElementById('qstat').innerHTML = '풀이 <b>' + ui.tried + '</b> · 정답 <b>' + ui.correct + '</b> · 정답률 <b>' + (ui.tried ? Math.round(ui.correct / ui.tried * 100) : 0) + '%</b>';
      document.getElementById('qtag').textContent = ui.pool.length ? (ui.i + 1) + ' / ' + ui.pool.length : '0 / 0';
      document.getElementById('qbar').style.width = ui.pool.length ? ((ui.i + 1) / ui.pool.length * 100) + '%' : '0';
    }

    function drawQ() {
      var body = document.getElementById('qbody');
      drawStat();
      if (!ui.pool.length) {
        body.innerHTML = '<div class="qcard"><div class="empty">' + (isNote
          ? '오답노트가 비어 있습니다.<br>퀴즈에서 틀린 문제는 자동으로 이곳에 담깁니다.'
          : '조건에 맞는 문제가 없습니다.') + '</div></div>';
        return;
      }
      if (ui.i >= ui.pool.length) ui.i = ui.pool.length - 1;
      if (ui.i < 0) ui.i = 0;
      var q = findQ(ui.pool[ui.i]);
      var ab = buildAnswer(q);
      var card = document.createElement('div'); card.className = 'qcard';
      card.innerHTML =
        '<div class="qh"><span><span class="no">' + (q.user ? qNo(q) : 'No.' + qNo(q)) + '</span> · ' + esc(q.subject) + (q.mock ? ' · 모의고사 ' + q.mock + '회' : '') + '</span><span id="wf"></span></div>' +
        '<div class="qb"><p class="qtext">' + esc(q.q) + '</p><div id="abox"></div>' +
        '<div class="banner" id="bn"></div><div id="rv"></div>' +
        '<div class="qact"><button class="pri" id="bg">채점</button><button id="bs">정답 보기</button><button id="br">다시 풀기</button><button id="bw"></button></div></div>' +
        '<div class="qnav"><button id="bp">◀ 이전</button><div class="jump"><input type="number" id="bj" min="1" max="' + ui.pool.length + '" placeholder="번호"><button id="bjg" class="sm">이동</button></div><button id="bn2" class="dark">다음 ▶</button></div>';
      body.innerHTML = ''; body.appendChild(card);
      card.querySelector('#abox').appendChild(ab.box);

      var graded = false, counted = false;
      function flag() {
        var w = !!store.wrong[q.id];
        card.querySelector('#wf').innerHTML = w ? '<span class="wrongflag">오답노트 등록</span>' : '';
        card.querySelector('#bw').textContent = w ? '오답 해제' : '오답노트에 담기';
        drawNav(mode);
      }
      flag();

      function reveal() {
        card.querySelector('#rv').innerHTML = '<div class="reveal"><b>정답</b>' + ansHTML(q.a) + '</div>';
      }
      card.querySelector('#bg').addEventListener('click', function () {
        var okc = gradeBlanks(q, ab.blanks), all = okc === ab.blanks.length;
        ab.blanks.forEach(function (b) {
          b.inp.classList.toggle('ok', b.ok); b.inp.classList.toggle('ng', !b.ok);
          if (!b.ok && !q.unordered && !b.corr) {
            var s = document.createElement('span'); s.className = 'corr'; s.textContent = '(' + b.accepts[0] + ')';
            b.inp.parentNode.insertBefore(s, b.inp.nextSibling); b.corr = s;
          }
        });
        var bn = card.querySelector('#bn');
        bn.className = 'banner ' + (all ? 'ok' : 'ng');
        bn.textContent = (all ? '정답입니다! ' : '오답이 있습니다. ') + okc + ' / ' + ab.blanks.length + ' 빈칸';
        reveal();
        if (!counted) { ui.tried++; if (all) ui.correct++; counted = true; }
        if (!all && !store.wrong[q.id]) { store.wrong[q.id] = Date.now(); save(); flag(); }
        if (all && isNote) toast('정답입니다. 이해했다면 “오답 해제”를 눌러 목록에서 뺄 수 있습니다.');
        drawStat(); graded = true;
      });
      card.querySelector('#bs').addEventListener('click', reveal);
      card.querySelector('#br').addEventListener('click', function () { drawQ(); });
      card.querySelector('#bw').addEventListener('click', function () {
        if (store.wrong[q.id]) {
          delete store.wrong[q.id]; save();
          if (isNote) {
            ui.pool.splice(ui.i, 1); toast('오답노트에서 해제했습니다.'); drawNav(mode); drawQ(); return;
          }
        } else { store.wrong[q.id] = Date.now(); save(); }
        flag();
      });
      card.querySelector('#bp').addEventListener('click', function () { if (ui.i > 0) { ui.i--; drawQ(); } else toast('첫 문제입니다.'); });
      card.querySelector('#bn2').addEventListener('click', function () { if (ui.i < ui.pool.length - 1) { ui.i++; drawQ(); } else toast('마지막 문제입니다.'); });
      function jump() {
        var n = parseInt(card.querySelector('#bj').value, 10);
        if (n >= 1 && n <= ui.pool.length) { ui.i = n - 1; drawQ(); }
      }
      card.querySelector('#bjg').addEventListener('click', jump);
      card.querySelector('#bj').addEventListener('keydown', function (e) { if (e.key === 'Enter') jump(); });
      ab.blanks.forEach(function (b, k) {
        b.inp.addEventListener('keydown', function (e) {
          if (e.key !== 'Enter') return;
          e.preventDefault();
          if (ab.blanks[k + 1] && !graded) ab.blanks[k + 1].inp.focus(); else card.querySelector('#bg').click();
        });
      });
      if (ab.blanks[0]) ab.blanks[0].inp.focus({ preventScroll: true });
    }
  }

  /* ───────── 앱(PWA) 설치 · 오프라인 ───────── */
  var deferredPrompt = null;
  var installBtn = document.getElementById('install');
  window.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault(); deferredPrompt = e; installBtn.hidden = false;
  });
  installBtn.addEventListener('click', function () {
    if (!deferredPrompt) return;
    deferredPrompt.prompt(); deferredPrompt = null; installBtn.hidden = true;
  });
  window.addEventListener('appinstalled', function () { installBtn.hidden = true; toast('앱이 설치되었습니다.'); });

  var isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  var standalone = window.navigator.standalone || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  var hintKey = 'ise.ioshint';
  var hinted = false;
  try { hinted = localStorage.getItem(hintKey) === '1'; } catch (e) {}
  if (isIOS && !standalone && !hinted && /^https?:$/.test(location.protocol)) {
    var hint = document.createElement('div');
    hint.className = 'hint';
    hint.innerHTML = '<span>홈 화면에 추가하면 앱처럼 쓰고 오프라인에서도 공부할 수 있어요. Safari의 <b>공유</b> 버튼 → <b>홈 화면에 추가</b></span><button class="sm" aria-label="닫기">닫기</button>';
    hint.querySelector('button').addEventListener('click', function () {
      hint.remove(); try { localStorage.setItem(hintKey, '1'); } catch (e) {}
    });
    document.body.insertBefore(hint, document.querySelector('.hazard'));
  }
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  route();
})();
