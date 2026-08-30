/* 孫子兵法研讀：篇節閱讀、三段朗讀（原文／白話／要義解讀）、螢幕常亮、離線 PWA */
(function () {
  "use strict";

  var SETTINGS_KEY = "sunzi-settings-v1";
  var PANES = ["text", "plain", "essence"];
  var PANE_NAME = { text: "原文", plain: "白話", essence: "要義解讀" };

  var data = Array.isArray(window.SUNZI) ? window.SUNZI : [];

  var settings = {
    chapter: 1,
    scope: "all",
    rate: 0.85,
    pauseSec: 2,
    voiceURI: "",
    autoNext: false,
    keepAwake: true,
    fontSize: 1,      /* FONT_SIZES 的索引 */
  };

  /* 內文字體的四個級距（rem） */
  var FONT_SIZES = [0.96, 1.08, 1.22, 1.38];

  var el = {
    chapterTitle: document.getElementById("chapter-title"),
    chapterBook: document.getElementById("chapter-book"),
    prev: document.getElementById("prev-btn"),
    next: document.getElementById("next-btn"),
    tocBtn: document.getElementById("toc-btn"),
    tocList: document.getElementById("toc-list"),
    status: document.getElementById("status"),
    playBtn: document.getElementById("play-btn"),
    playLabel: document.getElementById("play-label"),
    iconPlay: document.getElementById("icon-play"),
    iconPause: document.getElementById("icon-pause"),
    fontGroup: document.getElementById("font-group"),
    scope: document.getElementById("scope-sel"),
    rate: document.getElementById("rate-range"),
    rateVal: document.getElementById("rate-val"),
    pause: document.getElementById("pause-range"),
    pauseVal: document.getElementById("pause-val"),
    voice: document.getElementById("voice-sel"),
    autoNext: document.getElementById("auto-next"),
    keepAwake: document.getElementById("keep-awake"),
    wakeNote: document.getElementById("wake-note"),
    wakeVideo: document.getElementById("wake-video"),
  };

  /* ---------- 設定存取 ---------- */

  function loadSettings() {
    try {
      var s = JSON.parse(localStorage.getItem(SETTINGS_KEY));
      if (!s || typeof s !== "object") return;
      if (typeof s.chapter === "number" && s.chapter >= 1 && s.chapter <= data.length) {
        settings.chapter = Math.floor(s.chapter);
      }
      if (PANE_NAME[s.scope] || s.scope === "all") settings.scope = s.scope;
      if (typeof s.rate === "number" && s.rate >= 0.5 && s.rate <= 1.3) settings.rate = s.rate;
      if (typeof s.pauseSec === "number" && s.pauseSec >= 0 && s.pauseSec <= 5) settings.pauseSec = s.pauseSec;
      if (typeof s.voiceURI === "string") settings.voiceURI = s.voiceURI;
      settings.autoNext = !!s.autoNext;
      settings.keepAwake = s.keepAwake !== false;
      if (typeof s.fontSize === "number" && s.fontSize >= 0 && s.fontSize < FONT_SIZES.length) {
        settings.fontSize = Math.floor(s.fontSize);
      }
    } catch (e) { /* 設定損壞則沿用預設值 */ }
  }

  function saveSettings() {
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (e) { /* 儲存空間異常不影響閱讀 */ }
  }

  /* ---------- 斷句 ---------- */

  /* 依句末標點斷句，保留標點與後綴的引號，供逐句朗讀與高亮 */
  function splitLine(text) {
    if (!text) return [];
    var out = [];
    var buf = "";
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      buf += c;
      if ("。！？".indexOf(c) >= 0) {
        while (i + 1 < text.length && "」』）".indexOf(text[i + 1]) >= 0) {
          buf += text[++i];
        }
        out.push(buf);
        buf = "";
      }
    }
    if (buf.trim()) out.push(buf);
    return out;
  }

  /* ---------- 畫面 ---------- */

  var activePane = "text";
  var sentEls = { text: [], plain: [], essence: [] };

  function chapter() {
    return data[settings.chapter - 1];
  }

  function renderChapter() {
    var ch = chapter();
    if (!ch) return;
    el.chapterBook.textContent = ch.chapterName;
    el.chapterTitle.textContent = ch.name;
    el.prev.disabled = settings.chapter <= 1;
    el.next.disabled = settings.chapter >= data.length;

    PANES.forEach(function (key) {
      var host = document.getElementById("pane-" + key);
      host.innerHTML = "";
      sentEls[key] = [];
      var blocks = ch[key] || [];
      if (!blocks.length) {
        var note = document.createElement("p");
        note.className = "empty";
        note.textContent = "（本節的" + PANE_NAME[key] + "尚未撰寫）";
        host.appendChild(note);
        return;
      }
      blocks.forEach(function (block) {
        var p = document.createElement("p");
        if (block.type === "verse") p.className = "verse";
        block.lines.forEach(function (line, li) {
          if (li > 0) p.appendChild(document.createElement("br"));
          splitLine(line).forEach(function (sent) {
            var span = document.createElement("span");
            span.className = "sent";
            span.textContent = sent;
            p.appendChild(span);
            sentEls[key].push(span);
          });
        });
        host.appendChild(p);
      });
    });

    document.querySelectorAll(".toc-list li.toc-sec").forEach(function (li) {
      li.classList.toggle("current", parseInt(li.dataset.no, 10) === settings.chapter);
    });
    window.scrollTo(0, 0);
  }

  function showPane(key) {
    if (PANES.indexOf(key) < 0) return;
    activePane = key;
    PANES.forEach(function (k) {
      document.getElementById("pane-" + k).classList.toggle("hidden", k !== key);
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.pane === key);
    });
  }

  function clearHighlight() {
    PANES.forEach(function (k) {
      sentEls[k].forEach(function (s) { s.classList.remove("on"); });
    });
    document.querySelectorAll(".tab").forEach(function (t) {
      t.classList.remove("speaking");
    });
  }

  function highlight(pane, i) {
    clearHighlight();
    var span = sentEls[pane][i];
    if (span) {
      span.classList.add("on");
      var r = span.getBoundingClientRect();
      if (r.top < 70 || r.bottom > window.innerHeight - 90) {
        span.scrollIntoView({ block: "center", behavior: "smooth" });
      }
    }
    var tab = document.querySelector('.tab[data-pane="' + pane + '"]');
    if (tab) tab.classList.add("speaking");
  }

  function applyFontSize() {
    document.documentElement.style.setProperty("--pane-font", FONT_SIZES[settings.fontSize] + "rem");
    el.fontGroup.querySelectorAll(".seg-btn").forEach(function (b) {
      b.classList.toggle("active", parseInt(b.dataset.font, 10) === settings.fontSize);
    });
  }

  function setStatus(msg) {
    el.status.textContent = msg || "";
  }

  /* ---------- 語音 ---------- */

  var voices = [];

  function refreshVoices() {
    try {
      voices = window.speechSynthesis.getVoices() || [];
    } catch (e) {
      voices = [];
    }
    var zh = voices.filter(function (v) {
      return (v.lang || "").toLowerCase().replace("_", "-").indexOf("zh") === 0;
    });
    var list = zh.length ? zh : voices;
    var cur = el.voice.value;
    el.voice.innerHTML = '<option value="">系統預設</option>';
    list.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v.voiceURI;
      o.textContent = v.name + "（" + v.lang + "）";
      el.voice.appendChild(o);
    });
    el.voice.value = settings.voiceURI || cur || "";
    if (el.voice.value !== settings.voiceURI) el.voice.value = "";
  }

  /* 優先台灣華語，其次任何華語，最後交給系統 */
  function pickVoice() {
    if (settings.voiceURI) {
      var chosen = voices.filter(function (v) { return v.voiceURI === settings.voiceURI; })[0];
      if (chosen) return chosen;
    }
    function langOf(v) { return (v.lang || "").toLowerCase().replace("_", "-"); }
    var tw = voices.filter(function (v) {
      var l = langOf(v);
      return l.indexOf("zh") === 0 && (l.indexOf("tw") >= 0 || l.indexOf("hant") >= 0);
    });
    if (tw.length) {
      var good = tw.filter(function (v) { return /Google|Siri|Meijia|美佳|Microsoft/i.test(v.name); });
      return good[0] || tw[0];
    }
    var zh = voices.filter(function (v) { return langOf(v).indexOf("zh") === 0; });
    return zh[0] || null;
  }

  function buildUtterance(text) {
    var u = new SpeechSynthesisUtterance(text);
    var v = pickVoice();
    if (v) {
      u.voice = v;
      u.lang = v.lang;
    } else {
      u.lang = "zh-TW";
    }
    u.rate = settings.rate;
    u.pitch = 1;
    u.volume = 1;
    return u;
  }

  /* ---------- 音訊保活（改善 iOS 每段開頭切音） ---------- */

  var audioCtx = null;
  var keepAliveNode = null;

  function ensureAudioCtx() {
    try {
      if (!audioCtx) {
        var AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (e) {
      return null;
    }
  }

  function startAudioKeepAlive() {
    var ctx = ensureAudioCtx();
    if (!ctx || keepAliveNode) return;
    try {
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      gain.gain.value = 0.0001;   /* 約 -80dB，實質無聲 */
      osc.frequency.value = 20;
      osc.connect(gain).connect(ctx.destination);
      osc.start();
      keepAliveNode = { osc: osc, gain: gain };
    } catch (e) { /* 忽略 */ }
  }

  function stopAudioKeepAlive() {
    try {
      if (keepAliveNode) {
        keepAliveNode.osc.stop();
        keepAliveNode.osc.disconnect();
        keepAliveNode = null;
      }
      if (audioCtx && audioCtx.state === "running") audioCtx.suspend();
    } catch (e) { /* 忽略 */ }
  }

  /* ---------- 螢幕常亮 ---------- */

  /* 兩條路：優先 Screen Wake Lock；沒有或失敗時，改用無聲循環影片（iOS 舊版唯一可行的
   * 作法）。影片必須在使用者手勢當下就開始播放，而且不能是 0 尺寸或 display:none，
   * 否則 iOS 會當成沒有在播放，螢幕照樣鎖。 */

  var wakeLock = null;
  var wakeVideoOn = false;
  var wakeState = "idle";   /* idle | lock | video | failed | off */

  function wakeSupported() {
    return "wakeLock" in navigator;
  }

  function setWakeState(state) {
    wakeState = state;
    updateWakeNote();
  }

  function requestWake() {
    if (!settings.keepAwake) {
      setWakeState("off");
      return;
    }
    /* 先在手勢當下把備援影片播起來，之後 Wake Lock 成功再收掉 */
    startWakeVideo();
    setWakeState(wakeVideoOn ? "video" : "failed");
    if (!wakeSupported()) return;
    try {
      navigator.wakeLock.request("screen").then(function (lock) {
        wakeLock = lock;
        lock.addEventListener("release", function () {
          wakeLock = null;
          /* 系統收回時（例如切到背景又回來），朗讀還在就改用影片頂著 */
          if (speech.playing && settings.keepAwake) {
            startWakeVideo();
            setWakeState(wakeVideoOn ? "video" : "failed");
          }
        });
        stopWakeVideo();
        setWakeState("lock");
      }).catch(function () {
        /* 取得失敗就維持影片備援 */
      });
    } catch (e) { /* 維持影片備援 */ }
  }

  function releaseWake() {
    try {
      if (wakeLock) {
        wakeLock.release();
        wakeLock = null;
      }
    } catch (e) { /* 忽略 */ }
    stopWakeVideo();
    setWakeState("idle");
  }

  function startWakeVideo() {
    var v = el.wakeVideo;
    if (!v || wakeVideoOn) return;
    try {
      if (!v.getAttribute("src")) v.setAttribute("src", "wake.mp4");
      v.muted = true;
      v.loop = true;
      v.playsInline = true;
      v.classList.add("on");   /* 必須有實際尺寸，iOS 才認定影片在播放 */
      var pr = v.play();
      if (pr && pr.catch) {
        pr.catch(function () {
          v.classList.remove("on");
          wakeVideoOn = false;
          /* Wake Lock 已經取得時，影片播不起來無妨，別把狀態誤報成失敗 */
          if (!wakeLock) setWakeState(settings.keepAwake && speech.playing ? "failed" : "idle");
        });
      }
      wakeVideoOn = true;
    } catch (e) {
      wakeVideoOn = false;
    }
  }

  function stopWakeVideo() {
    var v = el.wakeVideo;
    if (!v) return;
    try { v.pause(); } catch (e) { /* 忽略 */ }
    v.classList.remove("on");
    wakeVideoOn = false;
  }

  var WAKE_TEXT = {
    idle: function () {
      return wakeSupported()
        ? "本裝置支援 Wake Lock，朗讀期間會直接阻止螢幕自動關閉。"
        : "本裝置不支援 Wake Lock，朗讀期間改用無聲影片維持螢幕常亮。";
    },
    lock: function () { return "目前狀態：Wake Lock 生效中，螢幕不會自動關閉。"; },
    video: function () { return "目前狀態：無聲影片備援生效中（本裝置沒有 Wake Lock 或取得失敗）。"; },
    failed: function () { return "目前狀態：無法維持螢幕常亮，請把系統的自動鎖定時間調長。"; },
    off: function () { return "已關閉螢幕常亮。"; },
  };

  function updateWakeNote() {
    var fn = WAKE_TEXT[wakeState] || WAKE_TEXT.idle;
    el.wakeNote.textContent = fn();
  }

  /* ---------- 朗讀流程 ---------- */

  var speech = {
    epoch: 0,
    playing: false,
    paused: false,
    queue: [],
    pos: 0,
    resumeTimer: null,
    pauseTimer: null,
    pendingResume: false,
  };

  function buildQueue() {
    var ch = chapter();
    var q = [];
    var keys = settings.scope === "all" ? PANES : [settings.scope];
    var gap = Math.round(settings.pauseSec * 1000);
    keys.forEach(function (key) {
      var sents = [];
      (ch[key] || []).forEach(function (block) {
        block.lines.forEach(function (line) {
          splitLine(line).forEach(function (sent) { sents.push(sent); });
        });
      });
      if (!sents.length) return;
      if (q.length && gap > 0) q.push({ pause: gap });
      sents.forEach(function (sent, i) {
        q.push({ say: sent, pane: key, index: i });
      });
    });
    return q;
  }

  function stopSpeech() {
    speech.epoch++;
    speech.playing = false;
    speech.paused = false;
    speech.queue = [];
    speech.pos = 0;
    if (speech.pauseTimer) { clearTimeout(speech.pauseTimer); speech.pauseTimer = null; }
    if (speech.resumeTimer) { clearInterval(speech.resumeTimer); speech.resumeTimer = null; }
    try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
    stopAudioKeepAlive();
    releaseWake();
    clearHighlight();
    updatePlayButton();
    setStatus("");
  }

  function startSpeech() {
    if (!("speechSynthesis" in window)) {
      setStatus("此瀏覽器不支援語音朗讀");
      return;
    }
    stopSpeech();
    var q = buildQueue();
    if (!q.length) {
      setStatus("本節沒有可朗讀的內容");
      return;
    }
    speech.epoch++;
    speech.playing = true;
    speech.paused = false;
    speech.queue = q;
    speech.pos = 0;
    startAudioKeepAlive();
    requestWake();
    /* 部分瀏覽器約 15 秒後會自動暫停語音，定期 resume 維持播放 */
    speech.resumeTimer = setInterval(function () {
      if (speech.playing && !speech.paused) {
        try { window.speechSynthesis.resume(); } catch (e) { /* 忽略 */ }
      }
    }, 10000);
    updatePlayButton();
    playNext(speech.epoch);
  }

  function playNext(epoch) {
    if (epoch !== speech.epoch || !speech.playing) return;
    if (speech.pos >= speech.queue.length) {
      onQueueDone();
      return;
    }
    var item = speech.queue[speech.pos++];
    if (item.pause) {
      setStatus("停頓中…　長按停止");
      speech.pauseTimer = setTimeout(function () {
        speech.pauseTimer = null;
        playNext(epoch);
      }, item.pause);
      return;
    }
    if (activePane !== item.pane) showPane(item.pane);
    highlight(item.pane, item.index);
    setStatus("朗讀中：" + PANE_NAME[item.pane] + "　長按停止");
    var u = buildUtterance(item.say);
    /* 少數環境不會回報 onend/onerror，加上寬鬆的逾時保護避免整串卡住 */
    var advanced = false;
    var guard = setTimeout(function () { advance(); },
      8000 + Math.round(item.say.length * 800 / settings.rate));
    function advance() {
      if (advanced) return;
      /* 暫停期間不讓逾時保護推進，等使用者繼續後再計時 */
      if (speech.paused) {
        clearTimeout(guard);
        guard = setTimeout(advance, 3000);
        return;
      }
      advanced = true;
      clearTimeout(guard);
      playNext(epoch);
    }
    u.onend = advance;
    u.onerror = advance;
    try {
      window.speechSynthesis.speak(u);
    } catch (e) {
      advance();
    }
  }

  function onQueueDone() {
    if (settings.autoNext && settings.chapter < data.length) {
      goChapter(settings.chapter + 1);
      var gap = Math.max(Math.round(settings.pauseSec * 1000), 600);
      speech.pauseTimer = setTimeout(function () {
        speech.pauseTimer = null;
        startSpeech();
      }, gap);
      setStatus("接續下一節…");
      return;
    }
    stopSpeech();
    setStatus("朗讀完畢");
  }

  function togglePlay() {
    if (!speech.playing) {
      startSpeech();
      return;
    }
    if (speech.paused) {
      speech.paused = false;
      try { window.speechSynthesis.resume(); } catch (e) { /* 忽略 */ }
      setStatus("繼續朗讀");
    } else {
      speech.paused = true;
      try { window.speechSynthesis.pause(); } catch (e) { /* 忽略 */ }
      setStatus("已暫停");
    }
    updatePlayButton();
  }

  function updatePlayButton() {
    var showPause = speech.playing && !speech.paused;
    el.iconPlay.classList.toggle("hidden", showPause);
    el.iconPause.classList.toggle("hidden", !showPause);
    el.playLabel.textContent = !speech.playing ? "朗讀" : (speech.paused ? "繼續" : "暫停");
  }

  /* ---------- 換分 ---------- */

  function goChapter(n) {
    if (!(n >= 1 && n <= data.length)) return;
    settings.chapter = n;
    saveSettings();
    renderChapter();
    showPane(activePane);
  }

  function changeChapter(n) {
    stopSpeech();
    goChapter(n);
  }

  /* ---------- 面板 ---------- */

  function openSheet(id) { document.getElementById(id).classList.remove("hidden"); }
  function closeSheet(id) { document.getElementById(id).classList.add("hidden"); }

  /* 目錄兩層：篇為標題列，節為可點的項目 */
  function buildToc() {
    el.tocList.innerHTML = "";
    var lastBook = null;
    data.forEach(function (sec) {
      if (sec.chapter !== lastBook) {
        lastBook = sec.chapter;
        var head = document.createElement("li");
        head.className = "toc-book";
        head.textContent = sec.chapterName;
        el.tocList.appendChild(head);
      }
      var li = document.createElement("li");
      li.className = "toc-sec";
      li.dataset.no = sec.no;
      var name = document.createElement("span");
      name.textContent = sec.name;
      li.appendChild(name);
      li.addEventListener("click", function () {
        changeChapter(sec.no);
        closeSheet("toc");
      });
      el.tocList.appendChild(li);
    });
  }

  /* ---------- 事件 ---------- */

  el.prev.addEventListener("click", function () { changeChapter(settings.chapter - 1); });
  el.next.addEventListener("click", function () { changeChapter(settings.chapter + 1); });
  el.tocBtn.addEventListener("click", function () { openSheet("toc"); });
  document.getElementById("about-btn").addEventListener("click", function () { openSheet("about"); });
  document.getElementById("settings-btn").addEventListener("click", function () {
    refreshVoices();
    updateWakeNote();
    openSheet("settings");
  });

  document.querySelectorAll(".close-btn[data-close]").forEach(function (b) {
    b.addEventListener("click", function () { closeSheet(b.dataset.close); });
  });
  document.querySelectorAll(".sheet").forEach(function (sheet) {
    sheet.addEventListener("click", function (e) {
      if (e.target === sheet) sheet.classList.add("hidden");
    });
  });

  document.querySelectorAll(".tab").forEach(function (t) {
    t.addEventListener("click", function () { showPane(t.dataset.pane); });
  });

  /* 單一播放鍵：按一下 朗讀／暫停／繼續，長按停止並回到本節開頭 */
  var HOLD_MS = 400;
  var holdTimer = null;
  var holdFired = false;

  function beginHold() {
    if (holdTimer !== null) return;
    holdFired = false;
    el.playBtn.classList.add("holding");
    holdTimer = setTimeout(function () {
      holdTimer = null;
      holdFired = true;
      el.playBtn.classList.remove("holding");
      /* 清掉 iOS 可能已經起頭的選取，避免放大鏡殘留 */
      try {
        var sel = window.getSelection();
        if (sel && sel.removeAllRanges) sel.removeAllRanges();
      } catch (e) { /* 忽略 */ }
      if (speech.playing) {
        stopSpeech();
        setStatus("已停止");
      }
    }, HOLD_MS);
  }

  function endHold() {
    if (holdTimer !== null) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    el.playBtn.classList.remove("holding");
  }

  el.playBtn.addEventListener("pointerdown", beginHold);
  /* iOS：長按會啟動選字/放大鏡手勢並送出 pointercancel，把長按計時吃掉。
   * 這裡直接擋掉按鈕上的預設觸控行為，click 仍會照常發生。 */
  el.playBtn.addEventListener("touchstart", function (e) {
    e.preventDefault();
    beginHold();
  }, { passive: false });
  var touchHandledAt = 0;
  el.playBtn.addEventListener("touchend", function (e) {
    var fired = holdFired;
    endHold();
    /* preventDefault 之後 iOS 不一定會補送 click，這裡自己補上短按行為 */
    e.preventDefault();
    touchHandledAt = Date.now();
    if (fired) {
      holdFired = false;
      return;
    }
    togglePlay();
  }, { passive: false });
  el.playBtn.addEventListener("touchcancel", endHold);
  ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) {
    el.playBtn.addEventListener(ev, endHold);
  });
  /* 長按時抑制隨後的 click，避免停止後又立刻重新開始 */
  el.playBtn.addEventListener("click", function () {
    /* 觸控已經處理過就不要再重複切換（少數瀏覽器仍會補送 click） */
    if (Date.now() - touchHandledAt < 700) return;
    if (holdFired) {
      holdFired = false;
      return;
    }
    togglePlay();
  });
  el.playBtn.addEventListener("contextmenu", function (e) { e.preventDefault(); });

  el.fontGroup.addEventListener("click", function (e) {
    var btn = e.target.closest ? e.target.closest(".seg-btn") : null;
    if (!btn) return;
    var n = parseInt(btn.dataset.font, 10);
    if (!(n >= 0 && n < FONT_SIZES.length)) return;
    settings.fontSize = n;
    applyFontSize();
    saveSettings();
  });

  el.scope.addEventListener("change", function () {
    settings.scope = el.scope.value;
    saveSettings();
  });
  el.rate.addEventListener("input", function () {
    settings.rate = parseFloat(el.rate.value);
    el.rateVal.textContent = settings.rate.toFixed(2);
    saveSettings();
  });
  el.pause.addEventListener("input", function () {
    settings.pauseSec = parseFloat(el.pause.value);
    el.pauseVal.textContent = settings.pauseSec.toFixed(1);
    saveSettings();
  });
  el.voice.addEventListener("change", function () {
    settings.voiceURI = el.voice.value;
    saveSettings();
  });
  el.autoNext.addEventListener("change", function () {
    settings.autoNext = el.autoNext.checked;
    saveSettings();
  });
  el.keepAwake.addEventListener("change", function () {
    settings.keepAwake = el.keepAwake.checked;
    saveSettings();
    if (!settings.keepAwake) releaseWake();
    else if (speech.playing) requestWake();
  });

  document.addEventListener("keydown", function (e) {
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    if (e.key === "ArrowLeft") changeChapter(settings.chapter - 1);
    else if (e.key === "ArrowRight") changeChapter(settings.chapter + 1);
    else if (e.key === " ") { e.preventDefault(); togglePlay(); }
    else if (e.key === "Escape") {
      document.querySelectorAll(".sheet").forEach(function (s) { s.classList.add("hidden"); });
    }
  });

  /* 切到背景：瀏覽器會暫停語音，若不主動中斷，逾時保護會在沒有真的唸出來的
   * 情況下一路往下跳，等於跳過內容。因此離開時乾淨中斷並標記待續，
   * 回到前景時重取 Wake Lock 並從目前這一分重讀。 */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      if (speech.playing) {
        speech.pendingResume = true;
        stopSpeech();
        setStatus("已暫停，回到本頁後續讀");
      }
    } else if (document.visibilityState === "visible") {
      if (speech.pendingResume) {
        speech.pendingResume = false;
        startSpeech();
      } else if (speech.playing && settings.keepAwake) {
        requestWake();
      }
    }
  });

  if (window.speechSynthesis) {
    window.speechSynthesis.onvoiceschanged = refreshVoices;
  }

  window.addEventListener("beforeunload", function () {
    try { window.speechSynthesis.cancel(); } catch (e) { /* 忽略 */ }
  });

  /* ---------- PWA ---------- */

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {
      /* 以 file:// 開啟時註冊會失敗，不影響閱讀 */
    });
  }

  /* ---------- 啟動 ---------- */

  loadSettings();
  el.scope.value = settings.scope;
  el.rate.value = settings.rate;
  el.rateVal.textContent = settings.rate.toFixed(2);
  el.pause.value = settings.pauseSec;
  el.pauseVal.textContent = settings.pauseSec.toFixed(1);
  el.autoNext.checked = settings.autoNext;
  el.keepAwake.checked = settings.keepAwake;
  updateWakeNote();
  applyFontSize();
  buildToc();
  renderChapter();
  showPane("text");
  updatePlayButton();
  refreshVoices();
})();
