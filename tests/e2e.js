/* 端到端測試：閱讀流程、朗讀順序與停頓、螢幕常亮、設定保存、離線 */
const puppeteer = require(process.env.PUPPETEER_PATH || "/home/pi/WorkDir/browser-tool/node_modules/puppeteer-core");

const BASE = "http://localhost:8128/";
const NEUTRAL = BASE + "icons/";
const SHOT_DIR = __dirname + "/";
let fail = 0;
function ok(cond, msg) {
  console.log((cond ? "[O] " : "[X] ") + msg);
  if (!cond) fail++;
}

/* 在頁面腳本執行前植入假的語音引擎與 Wake Lock，讓朗讀流程可被觀測 */
async function installStubs(page) {
  await page.evaluateOnNewDocument(() => {
    window.__spoken = [];
    window.__cancels = 0;
    window.__wake = { requests: 0, releases: 0, locks: [] };
    window.__wake.held = () => window.__wake.locks.filter((l) => !l.released).length;
    window.__wake.systemRelease = () => window.__wake.locks.forEach((l) => l.fire());
    const fakeVoice = { name: "Test TW", lang: "zh-TW", voiceURI: "test-tw", default: true };
    /* speechSynthesis 是唯讀 getter，必須用 defineProperty 覆寫 */
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => [fakeVoice],
        speak(u) {
          window.__spoken.push({ text: u.text, t: Date.now(), rate: u.rate, lang: u.lang,
            voice: u.voice ? u.voice.voiceURI : null });
          setTimeout(() => { if (u.onend) u.onend(); }, window.__speakDelay || 10);
        },
        cancel() { window.__cancels++; },
        pause() { window.__paused = true; },
        resume() { window.__paused = false; },
        onvoiceschanged: null,
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function (text) { this.text = text; },
    });
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: {
        request() {
          window.__wake.requests++;
          const handlers = [];
          const lock = {
            released: false,
            /* 系統收回：標記失效並觸發 release 事件（不算頁面自己放掉） */
            fire() {
              if (lock.released) return;
              lock.released = true;
              handlers.forEach((h) => h({}));
            },
            release() {
              if (!lock.released) window.__wake.releases++;
              lock.fire();
              return Promise.resolve();
            },
            addEventListener(ev, fn) { if (ev === "release") handlers.push(fn); },
          };
          window.__wake.locks.push(lock);
          return Promise.resolve(lock);
        },
      },
    });
  });
}

/* Android 形狀的語音清單：底線 lang、Hant 變體、重複 voiceURI、非中文語音，
   且清單是非同步送達的（首次 getVoices() 為空，稍後才觸發 onvoiceschanged）。
   failVoiceURIs 內的語音一旦被指派給 u.voice 就回報 synthesis-failed，
   用來重現「手動選了台灣語音卻不出聲」。 */
async function installAndroidStubs(page, opts) {
  await page.evaluateOnNewDocument((o) => {
    window.__spoken = [];
    window.__cancels = 0;
    window.__wake = { requests: 0, releases: 0, locks: [] };
    window.__wake.held = () => window.__wake.locks.filter((l) => !l.released).length;
    window.__wake.systemRelease = () => window.__wake.locks.forEach((l) => l.fire());
    const VOICES = [
      { name: "Chinese (China)", lang: "zh_CN", voiceURI: "zh-CN-x-ccc-network" },
      { name: "Chinese (Taiwan)", lang: "zh_TW", voiceURI: "zh-TW-x-ttt-local" },
      { name: "Chinese (Hong Kong)", lang: "zh_HK", voiceURI: "zh-HK-x-hhh-local" },
      { name: "Cantonese (Hong Kong)", lang: "yue-Hant-HK", voiceURI: "yue-HK-x-yyy-local" },
      { name: "Chinese (Taiwan) Network", lang: "zh-Hant-TW", voiceURI: "zh-TW-x-ttt-network" },
      { name: "English (US)", lang: "en_US", voiceURI: "en-US-x-eee-local" },
      { name: "日本語", lang: "ja_JP", voiceURI: "ja-JP-x-jjj-local" },
    ];
    let ready = false;
    const fail = o.failVoiceURIs || [];
    const target = { onvoiceschanged: null };
    Object.defineProperty(window, "speechSynthesis", {
      configurable: true,
      value: {
        getVoices: () => (ready ? VOICES.slice() : []),
        speak(u) {
          if (u.voice && fail.indexOf(u.voice.voiceURI) >= 0) {
            setTimeout(() => { if (u.onerror) u.onerror({ error: "synthesis-failed" }); }, 5);
            return;
          }
          window.__spoken.push({ text: u.text, lang: u.lang,
            voice: u.voice ? u.voice.voiceURI : null });
          setTimeout(() => { if (u.onstart) u.onstart(); }, 3);
          setTimeout(() => { if (u.onend) u.onend(); }, window.__speakDelay || 10);
        },
        cancel() { window.__cancels++; },
        pause() {}, resume() {},
        get onvoiceschanged() { return target.onvoiceschanged; },
        set onvoiceschanged(fn) { target.onvoiceschanged = fn; },
      },
    });
    Object.defineProperty(window, "SpeechSynthesisUtterance", {
      configurable: true,
      value: function (text) { this.text = text; },
    });
    /* 模擬 Android：清單稍後才到，且 onvoiceschanged 觸發兩次 */
    window.__deliverVoices = () => {
      ready = true;
      if (target.onvoiceschanged) { target.onvoiceschanged(); target.onvoiceschanged(); }
    };
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request() { return Promise.reject(new Error("no")); } },
    });
  }, opts || {});
}

/* 觸控裝置（iOS 走這條路）的短按與長按 */
async function touchPlay(page, holdMs) {
  const btn = await page.$("#play-btn");
  const box = await btn.boundingBox();
  const handle = await page.touchscreen.touchStart(box.x + box.width / 2, box.y + box.height / 2);
  await new Promise((r) => setTimeout(r, holdMs));
  await handle.end();
  await new Promise((r) => setTimeout(r, 80));
}

/* 長按播放鍵＝停止（單一按鈕設計） */
async function longPressPlay(target) {
  const btn = await target.$("#play-btn");
  const box = await btn.boundingBox();
  await target.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await target.mouse.down();
  await new Promise((r) => setTimeout(r, 800));
  await target.mouse.up();
  await new Promise((r) => setTimeout(r, 60));
}

async function enterWithSettings(page, settings) {
  await page.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await page.evaluate((s) => {
    if (s === null) localStorage.removeItem("sunzi-settings-v1");
    else localStorage.setItem("sunzi-settings-v1", JSON.stringify(s));
  }, settings);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });
}

(async () => {
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium-browser",
    headless: "new",
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 420, height: 860 });
  page.on("pageerror", (e) => { console.log("[X] page error: " + e.message); fail++; });
  await installStubs(page);

  // 1. 首次載入
  await enterWithSettings(page, null);
  const head = await page.evaluate(() => ({
    book: document.getElementById("chapter-book").textContent,
    sec: document.getElementById("chapter-title").textContent,
  }));
  ok(head.book === "始計第一" && head.sec === "兵者國之大事",
     "首次載入停在第一節（" + head.book + "／" + head.sec + "）");
  const toc = await page.evaluate(() => ({
    books: document.querySelectorAll("#toc-list li.toc-book").length,
    secs: document.querySelectorAll("#toc-list li.toc-sec").length,
    firstBook: document.querySelector("#toc-list li.toc-book").textContent,
  }));
  ok(toc.books === 13, "目錄有 13 篇（" + toc.books + "）");
  ok(toc.secs === 61, "目錄有 61 節（" + toc.secs + "）");
  ok(toc.firstBook === "始計第一", "目錄第一列是篇名（" + toc.firstBook + "）");
  const firstText = await page.$eval("#pane-text", (e) => e.textContent);
  ok(firstText.indexOf("孫子曰：兵者，國之大事") === 0, "第一節原文以「孫子曰：兵者，國之大事」開頭");
  const prevDisabled = await page.$eval("#prev-btn", (e) => e.disabled);
  ok(prevDisabled, "第一節時「上一節」停用");

  // 2. 頁籤切換
  await page.click('.tab[data-pane="plain"]');
  const plainShown = await page.$eval("#pane-plain", (e) => !e.classList.contains("hidden"));
  const textHidden = await page.$eval("#pane-text", (e) => e.classList.contains("hidden"));
  ok(plainShown && textHidden, "切換到白話頁籤");
  const plainText = await page.$eval("#pane-plain", (e) => e.textContent);
  ok(plainText.length > 40 && plainText.indexOf("尚未撰寫") < 0, "白話有內容（" + plainText.length + " 字）");
  await page.click('.tab[data-pane="essence"]');
  const essText = await page.$eval("#pane-essence", (e) => e.textContent);
  ok(essText.length > 100 && essText.indexOf("尚未撰寫") < 0, "要義解讀有內容（" + essText.length + " 字）");
  ok(essText.indexOf("拿到今天") >= 0, "要義解讀含現代對照段落");

  // 3. 目錄跳到最後一節
  await page.click("#toc-btn");
  await page.click('#toc-list li[data-no="61"]');
  const last = await page.evaluate(() => ({
    book: document.getElementById("chapter-book").textContent,
    sec: document.getElementById("chapter-title").textContent,
  }));
  ok(last.book === "用間第十三" && last.sec === "以上智為間",
     "由目錄跳至最後一節（" + last.book + "／" + last.sec + "）");
  const lastText = await page.$eval("#pane-text", (e) => e.textContent);
  ok(lastText.indexOf("伊摯在夏") >= 0 && lastText.indexOf("三軍之所恃而動也") >= 0,
     "末節原文完整");
  const nextDisabled = await page.$eval("#next-btn", (e) => e.disabled);
  ok(nextDisabled, "最後一節時「下一節」停用");

  // 4. 朗讀：三段順序與段落間停頓
  await enterWithSettings(page, { chapter: 1, scope: "all", rate: 0.85, pauseSec: 0.8, autoNext: false, keepAwake: true });
  await page.click("#play-btn");
  await page.waitForFunction(() => !document.getElementById("play-label").textContent.includes("朗讀"),
    { timeout: 5000 });
  await page.waitForFunction(() => window.__spoken.length >= 3, { timeout: 8000 });
  await page.screenshot({ path: SHOT_DIR + "shot_speaking.png" });
  const speakingTab = await page.$$eval(".tab.speaking", (els) => els.map((e) => e.textContent.trim()));
  ok(speakingTab.length === 1, "朗讀中只有一個頁籤標示為朗讀中");
  const hasHighlight = await page.$$eval(".sent.on", (els) => els.length);
  ok(hasHighlight === 1, "朗讀中恰有一句被高亮（" + hasHighlight + "）");
  ok((await page.evaluate(() => window.__wake.requests)) >= 1, "朗讀時已請求螢幕常亮");

  await page.waitForFunction(() => {
    const el = document.getElementById("play-label");
    return el.textContent === "朗讀";
  }, { timeout: 60000 });
  const spoken = await page.evaluate(() => window.__spoken);
  const data = await page.evaluate(() => window.SUNZI[0]);
  const flat = (blocks) => blocks.reduce((a, b) => a.concat(b.lines), []).join("");
  const said = spoken.map((s) => s.text).join("");
  ok(said === flat(data.text) + flat(data.plain) + flat(data.essence),
     "朗讀內容依原文→白話→要義解讀完整且無遺漏");
  const nText = flat(data.text).length;
  let idx = 0, boundary = -1;
  for (let i = 0; i < spoken.length; i++) {
    idx += spoken[i].text.length;
    if (idx === nText) { boundary = i; break; }
  }
  ok(boundary > 0, "找得到原文與白話的交界（第 " + boundary + " 句）");
  const gapAtBoundary = spoken[boundary + 1].t - spoken[boundary].t;
  const gapWithin = spoken[1].t - spoken[0].t;
  ok(gapAtBoundary >= 800, "原文與白話之間停頓 " + gapAtBoundary + "ms（設定 800ms）");
  ok(gapWithin < 400, "同一段落內的句子沒有額外停頓（" + gapWithin + "ms）");
  ok((await page.evaluate(() => window.__wake.releases)) >= 1, "朗讀結束後已釋放螢幕常亮");
  const status = await page.$eval("#status", (e) => e.textContent);
  ok(status === "朗讀完畢", "朗讀結束顯示完畢（" + status + "）");

  // 5. 只讀原文
  await enterWithSettings(page, { chapter: 5, scope: "text", rate: 0.85, pauseSec: 0.8 });
  await page.click("#play-btn");
  await page.waitForFunction(() => {
    return window.__spoken.length > 0 && document.getElementById("play-label").textContent === "朗讀";
  }, { timeout: 30000 });
  const only = await page.evaluate(() => window.__spoken.map((s) => s.text).join(""));
  const ch5 = await page.evaluate(() => window.SUNZI[4]);
  ok(only === flat(ch5.text), "朗讀範圍設為只讀原文時不會讀到白話與解讀");

  // 6. 停止鍵
  await enterWithSettings(page, { chapter: 1, scope: "all", pauseSec: 3 });
  await page.click("#play-btn");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  await longPressPlay(page);
  const afterStop = await page.evaluate(() => ({
    label: document.getElementById("play-label").textContent,
    status: document.getElementById("status").textContent,
    highlights: document.querySelectorAll(".sent.on").length,
    cancels: window.__cancels,
  }));
  ok(afterStop.label === "朗讀" && afterStop.status === "已停止" && afterStop.highlights === 0,
     "長按播放鍵停止後回到初始狀態（" + afterStop.label + " / " + afterStop.status + "）");
  ok(afterStop.cancels >= 1, "停止時有呼叫語音取消");
  const spokenCount = await page.evaluate(() => window.__spoken.length);
  await new Promise((r) => setTimeout(r, 800));
  const spokenAfter = await page.evaluate(() => window.__spoken.length);
  ok(spokenCount === spokenAfter, "停止後不再繼續朗讀");

  // 7. 換節會停止朗讀
  await page.click("#play-btn");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  await page.click("#next-btn");
  const label = await page.$eval("#play-label", (e) => e.textContent);
  ok(label === "朗讀", "換節時自動停止朗讀");

  // 7b. 單一按鈕：短按循環 朗讀→暫停→繼續，長按停止且不會誤觸重播
  await enterWithSettings(page, { chapter: 14, scope: "all", pauseSec: 0.5 });
  ok((await page.$("#stop-btn")) === null, "已移除獨立的停止鍵");
  /* iOS 的長按選字手勢會攔截長按，按鈕與其內容都必須關閉選取 */
  const sel = await page.evaluate(() => {
    const btn = document.getElementById("play-btn");
    const label = document.getElementById("play-label");
    const cs = (e) => getComputedStyle(e);
    return {
      btn: cs(btn).webkitUserSelect || cs(btn).userSelect,
      label: cs(label).webkitUserSelect || cs(label).userSelect,
      touchAction: cs(btn).touchAction,
      labelPointer: cs(label).pointerEvents,
    };
  });
  ok(sel.btn === "none" && sel.label === "none",
     "播放鍵與其文字都不可被選取（" + sel.btn + " / " + sel.label + "）");
  ok(sel.touchAction === "manipulation", "播放鍵設定 touch-action: manipulation（" + sel.touchAction + "）");
  ok(sel.labelPointer === "none", "播放鍵內部元素不接收指標事件，長按目標一致");
  const selScope = await page.evaluate(() => {
    const cs = (sel) => {
      const e = document.querySelector(sel);
      const s = getComputedStyle(e);
      return s.webkitUserSelect || s.userSelect;
    };
    return { body: cs("body"), pane: cs("#pane-text"), header: cs(".top") };
  });
  ok(selScope.body === "none" && selScope.header === "none",
     "介面預設不可選取（body " + selScope.body + "）");
  ok(selScope.pane === "text", "三個頁籤的內文仍可選取複製（" + selScope.pane + "）");
  await page.evaluate(() => { window.__speakDelay = 400; });
  await page.click("#play-btn");
  await page.waitForFunction(() => document.getElementById("play-label").textContent === "暫停", { timeout: 5000 });
  await page.click("#play-btn");
  const pausedLabel = await page.$eval("#play-label", (e) => e.textContent);
  ok(pausedLabel === "繼續", "朗讀中短按變成暫停狀態（" + pausedLabel + "）");
  await page.click("#play-btn");
  const resumed2 = await page.$eval("#play-label", (e) => e.textContent);
  ok(resumed2 === "暫停", "暫停中短按恢復朗讀（" + resumed2 + "）");
  await longPressPlay(page);
  /* 長按當下就要停住；接著再觀察一段時間，確認後續的 click 沒有把它重新啟動 */
  const atHold = await page.evaluate(() => ({
    label: document.getElementById("play-label").textContent,
    count: window.__spoken.length,
  }));
  await new Promise((r) => setTimeout(r, 900));
  const afterHold = await page.evaluate(() => ({
    label: document.getElementById("play-label").textContent,
    count: window.__spoken.length,
  }));
  ok(atHold.label === "朗讀" && afterHold.label === "朗讀", "長按停止後回到朗讀狀態");
  ok(afterHold.count === atHold.count,
     "長按停止不會被隨後的 click 誤觸重播（" + atHold.count + " -> " + afterHold.count + "）");
  await page.evaluate(() => { window.__speakDelay = 10; });

  // 7bb. 觸控路徑（iOS）：短按切換、長按停止，且不會重複觸發
  const touchPage = await browser.newPage();
  await touchPage.setViewport({ width: 420, height: 860, hasTouch: true, isMobile: true });
  touchPage.on("pageerror", (e) => { console.log("[X] page error: " + e.message); fail++; });
  await installStubs(touchPage);
  await touchPage.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await touchPage.evaluate(() => localStorage.setItem("sunzi-settings-v1",
    JSON.stringify({ chapter: 14, scope: "all", pauseSec: 0.5 })));
  await touchPage.goto(BASE, { waitUntil: "domcontentloaded" });
  await touchPage.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });
  await touchPage.evaluate(() => { window.__speakDelay = 400; });
  await touchPlay(touchPage, 80);
  await touchPage.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  const touchStarted = await touchPage.$eval("#play-label", (e) => e.textContent);
  ok(touchStarted === "暫停", "觸控短按可開始朗讀（" + touchStarted + "）");
  await touchPlay(touchPage, 80);
  const touchPaused = await touchPage.$eval("#play-label", (e) => e.textContent);
  ok(touchPaused === "繼續", "觸控短按可暫停（" + touchPaused + "）");
  await touchPlay(touchPage, 80);
  await touchPlay(touchPage, 800);
  const touchStopped = await touchPage.evaluate(() => ({
    label: document.getElementById("play-label").textContent,
    status: document.getElementById("status").textContent,
    count: window.__spoken.length,
  }));
  ok(touchStopped.label === "朗讀" && touchStopped.status === "已停止",
     "觸控長按可停止（" + touchStopped.label + " / " + touchStopped.status + "）");
  await new Promise((r) => setTimeout(r, 900));
  const touchAfter = await touchPage.evaluate(() => window.__spoken.length);
  ok(touchAfter === touchStopped.count, "觸控長按停止後不會被補送的 click 重播");
  await touchPage.close();

  // 7c. 內文字體大小
  const sizeOf = () => page.$eval("#pane-text p", (e) => parseFloat(getComputedStyle(e).fontSize));
  await page.click("#settings-btn");
  await page.click('.seg-btn[data-font="0"]');
  const small = await sizeOf();
  await page.click('.seg-btn[data-font="3"]');
  const large = await sizeOf();
  ok(large > small + 3, "字體大小四級可調（小 " + small + "px → 特大 " + large + "px）");
  const activeCount = await page.$$eval(".seg-btn.active", (els) => els.map((e) => e.textContent));
  ok(activeCount.length === 1 && activeCount[0] === "特大", "目前級距有標示（" + activeCount.join(",") + "）");
  const headerSize = await page.$eval("#chapter-title", (e) => parseFloat(getComputedStyle(e).fontSize));
  await page.click('.seg-btn[data-font="1"]');
  const headerSize2 = await page.$eval("#chapter-title", (e) => parseFloat(getComputedStyle(e).fontSize));
  ok(headerSize === headerSize2, "字體大小只影響內文，節名維持原大小");
  await page.click('.seg-btn[data-font="2"]');
  await page.click('.close-btn[data-close="settings"]');
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0, { timeout: 15000 });
  const restoredFont = await page.$$eval(".seg-btn.active", (els) => els.map((e) => e.textContent));
  ok(restoredFont.length === 1 && restoredFont[0] === "大", "字體大小設定會保存（" + restoredFont.join(",") + "）");

  // 8. 切到背景：乾淨中斷，回前景續讀（避免逾時保護空跳過內容）
  await enterWithSettings(page, { chapter: 14, scope: "all", pauseSec: 0.5 });
  /* 放慢假語音，確保設為背景時這一節還沒讀完（否則測到的是「已讀完」而非中斷） */
  await page.evaluate(() => { window.__speakDelay = 400; });
  await page.click("#play-btn");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  /* 這版 Chromium 沒有 Emulation.setPageVisibilityOverride，改在頁面內覆寫
   * document.visibilityState（唯讀 getter，需用 defineProperty）並派發事件 */
  const setVisibility = (state) => page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => v === "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  }, state);
  await setVisibility("hidden");
  await new Promise((r) => setTimeout(r, 300));
  const hiddenState = await page.evaluate(() => ({
    count: window.__spoken.length,
    label: document.getElementById("play-label").textContent,
    status: document.getElementById("status").textContent,
  }));
  await new Promise((r) => setTimeout(r, 1200));
  const stillSame = await page.evaluate(() => window.__spoken.length);
  ok(hiddenState.label === "朗讀", "切到背景時停止朗讀");
  ok(stillSame === hiddenState.count, "背景期間不會空跳過內容（" + hiddenState.count + " -> " + stillSame + "）");
  ok(hiddenState.status.indexOf("續讀") >= 0,
     "背景時提示回到本頁後續讀（" + hiddenState.status + "）");
  await setVisibility("visible");
  await page.waitForFunction((n) => window.__spoken.length > n, { timeout: 8000 }, stillSame);
  const resumedLabel = await page.$eval("#play-label", (e) => e.textContent);
  ok(resumedLabel === "暫停", "回到前景後自動續讀");
  await longPressPlay(page);

  // 8b. 自行暫停後關螢幕再打開，不可自動接續朗讀
  await page.evaluate(() => { window.__spoken = []; window.__speakDelay = 400; });
  await page.click("#play-btn");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  await page.click("#play-btn");                       /* 短按＝暫停 */
  const pauseBeforeHide = await page.$eval("#play-label", (e) => e.textContent);
  ok(pauseBeforeHide === "繼續", "短按進入暫停狀態（" + pauseBeforeHide + "）");
  const beforeHide = await page.evaluate(() => window.__spoken.length);
  await setVisibility("hidden");
  await new Promise((r) => setTimeout(r, 300));
  await setVisibility("visible");
  await new Promise((r) => setTimeout(r, 1500));
  const afterShow = await page.evaluate(() => ({
    count: window.__spoken.length,
    label: document.getElementById("play-label").textContent,
    status: document.getElementById("status").textContent,
  }));
  ok(afterShow.count === beforeHide,
    "暫停後關螢幕再打開不會自動接續朗讀（" + beforeHide + " -> " + afterShow.count + "）");
  ok(afterShow.label === "朗讀", "暫停後關螢幕再打開回到未播放狀態（" + afterShow.label + "）");
  ok(afterShow.status.indexOf("續讀") < 0, "不再顯示會自動續讀的提示（" + afterShow.status + "）");
  await longPressPlay(page);
  await page.evaluate(() => { window.__speakDelay = 10; });

  // 9. 沒有 Wake Lock API 的裝置：已拿掉無效的影片備援，設定面板要說明不支援
  const noLockPage = await browser.newPage();
  await noLockPage.setViewport({ width: 420, height: 860 });
  noLockPage.on("pageerror", (e) => { console.log("[X] page error: " + e.message); fail++; });
  await installStubs(noLockPage);
  await noLockPage.evaluateOnNewDocument(() => {
    /* 模擬 iOS 16.4 以前：wakeLock 在原型上，只刪自有屬性不夠 */
    delete navigator.wakeLock;
    delete Navigator.prototype.wakeLock;
    window.__videoPlays = 0;
    const realPlay = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function () {
      window.__videoPlays++;
      try { return realPlay.call(this); } catch (e) { return Promise.resolve(); }
    };
  });
  await noLockPage.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await noLockPage.evaluate(() => localStorage.setItem("sunzi-settings-v1",
    JSON.stringify({ chapter: 1, scope: "text", pauseSec: 0.5, keepAwake: true })));
  await noLockPage.goto(BASE, { waitUntil: "domcontentloaded" });
  await noLockPage.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });
  await noLockPage.evaluate(() => { window.__speakDelay = 400; });
  await noLockPage.click("#play-btn");
  await noLockPage.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  const fb = await noLockPage.evaluate(() => ({
    plays: window.__videoPlays,
    video: !!document.querySelector("video"),
    note: document.getElementById("wake-note").textContent,
  }));
  ok(!fb.video, "頁面上已沒有無聲影片備援");
  ok(fb.plays === 0, "朗讀時不播放任何影片（" + fb.plays + "）");
  ok(fb.note.indexOf("不支援") >= 0, "無 Wake Lock 時設定面板說明不支援（" + fb.note + "）");
  await longPressPlay(noLockPage);
  await noLockPage.close();

  // 有 Wake Lock：生效、被系統收回後補回、始終只握一把
  await enterWithSettings(page, { chapter: 1, scope: "text", pauseSec: 0.5, keepAwake: true });
  await page.evaluate(() => { window.__speakDelay = 400; });
  await page.click("#play-btn");
  await page.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  await page.click("#settings-btn");
  await page.waitForFunction(() => document.getElementById("wake-note").textContent.indexOf("Wake Lock 生效") >= 0,
    { timeout: 5000 });
  ok(true, "有 Wake Lock 時顯示 Wake Lock 生效");
  ok((await page.evaluate(() => window.__wake.held())) === 1, "朗讀中只握一把 Wake Lock");
  await page.evaluate(() => window.__wake.systemRelease());
  const releasedNote = await page.$eval("#wake-note", (e) => e.textContent);
  ok(releasedNote.indexOf("失敗") >= 0, "被系統收回後設定面板顯示失效（" + releasedNote + "）");
  const req0 = await page.evaluate(() => window.__wake.requests);
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForFunction(() => document.getElementById("wake-note").textContent.indexOf("Wake Lock 生效") >= 0,
    { timeout: 5000 });
  const regained = await page.evaluate(() => ({ requests: window.__wake.requests, held: window.__wake.held() }));
  ok(regained.requests === req0 + 1 && regained.held === 1,
     "回前景補回一把（要求 " + req0 + "→" + regained.requests + "，握著 " + regained.held + "）");
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await new Promise((r) => setTimeout(r, 300));
  ok((await page.evaluate(() => window.__wake.requests)) === regained.requests, "已握著鎖時不重複要求");
  await page.click('.close-btn[data-close="settings"]');
  await longPressPlay(page);
  ok((await page.evaluate(() => window.__wake.held())) === 0, "停止朗讀後放掉 Wake Lock");
  await page.evaluate(() => { window.__speakDelay = 10; });

  // 10. 設定與閱讀進度保存
  await page.click("#settings-btn");
  await page.select("#scope-sel", "plain");
  await page.click('.close-btn[data-close="settings"]');
  await page.click("#toc-btn");
  await page.click('#toc-list li[data-no="49"]');
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0, { timeout: 15000 });
  const restored = await page.evaluate(() => ({
    chapter: document.getElementById("chapter-title").textContent,
    scope: document.getElementById("scope-sel").value,
  }));
  ok(restored.chapter === "率然之勢", "重新開啟回到上次讀的節（" + restored.chapter + "）");
  ok(restored.scope === "plain", "朗讀範圍設定被保存（" + restored.scope + "）");

  // 11. 離線
  await page.evaluate(() => navigator.serviceWorker.ready);
  ok(true, "service worker 已啟用");
  await page.setOfflineMode(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0, { timeout: 15000 });
  const offlineTitle = await page.title();
  ok(offlineTitle === "孫子兵法研讀", "離線仍可開啟（" + offlineTitle + "）");
  await page.click("#toc-btn");
  await page.click('#toc-list li[data-no="26"]');
  const offlineChapter = await page.$eval("#pane-text", (e) => e.textContent);
  ok(offlineChapter.indexOf("兵形象水") >= 0, "離線仍可切換節並讀到內容");
  await page.setOfflineMode(false);

  // 11. Android 語音：清單過濾、預設台灣、lang 正規化、失敗降級
  console.log("--- Android 語音 ---");
  const andPage = await browser.newPage();
  await andPage.setViewport({ width: 420, height: 860 });
  andPage.on("pageerror", (e) => { console.log("[X] android page error: " + e.message); fail++; });
  await installAndroidStubs(andPage, { failVoiceURIs: [] });
  await andPage.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await andPage.evaluate(() => localStorage.removeItem("sunzi-settings-v1"));
  await andPage.goto(BASE, { waitUntil: "domcontentloaded" });
  await andPage.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });

  // 清單尚未送達時不可誤鎖預設
  await andPage.click("#settings-btn");
  const beforeReady = await andPage.$$eval("#voice-sel option", (o) => o.map((x) => x.value));
  ok(beforeReady.length === 1 && beforeReady[0] === "",
    "語音清單未送達時只有「系統預設」（" + beforeReady.length + " 項）");

  // 清單送達後（onvoiceschanged 觸發兩次）
  await andPage.evaluate(() => window.__deliverVoices());
  await andPage.waitForFunction(() => document.querySelectorAll("#voice-sel option").length > 1,
    { timeout: 5000 });
  const opts = await andPage.$$eval("#voice-sel option",
    (o) => o.map((x) => ({ v: x.value, t: x.textContent })));
  const listed = opts.filter((o) => o.v);
  ok(listed.length === 3,
    "只保留台灣 2 個與香港 1 個共 3 個語音（" + listed.length + "：" + listed.map((o) => o.v).join(", ") + "）");
  ok(!listed.some((o) => /zh-CN|en-US|ja-JP/.test(o.v)), "中國、英文、日文語音已排除");
  ok(listed.filter((o) => /台灣/.test(o.t)).length === 2, "台灣語音全部列出（2 個）");
  const hk = listed.filter((o) => /香港/.test(o.t));
  ok(hk.length === 1, "香港語音只列一個（" + hk.map((o) => o.v).join(", ") + "）");
  ok(hk[0].v === "zh-HK-x-hhh-local", "香港挑的是 zh- 而非 yue-（" + hk[0].v + "）");
  ok(/(台灣)/.test(listed[0].t) && /(台灣)/.test(listed[1].t), "台灣語音排在香港之前");
  const selected = await andPage.$eval("#voice-sel", (e) => e.value);
  ok(/^zh-TW-/.test(selected), "預設選中台灣語音（" + selected + "）");

  // 朗讀時 u.lang 必須是正規化過的 BCP-47（不可出現底線）
  await andPage.click('.close-btn[data-close="settings"]');
  await andPage.click("#play-btn");
  await andPage.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  const andSpoken = await andPage.evaluate(() => window.__spoken[0]);
  ok(andSpoken.lang === "zh-TW" || andSpoken.lang === "zh-Hant-TW",
    "u.lang 已正規化為標準大小寫的合法標籤（" + andSpoken.lang + "）");
  ok(andSpoken.voice === selected, "實際使用所選的台灣語音（" + andSpoken.voice + "）");
  await longPressPlay(andPage);
  await andPage.close();

  // 所選語音會合成失敗時：降級為不指定語音、只給 lang，仍須出聲
  const failPage = await browser.newPage();
  await failPage.setViewport({ width: 420, height: 860 });
  failPage.on("pageerror", (e) => { console.log("[X] fail page error: " + e.message); fail++; });
  await installAndroidStubs(failPage,
    { failVoiceURIs: ["zh-TW-x-ttt-local", "zh-TW-x-ttt-network"] });
  await failPage.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await failPage.evaluate(() => localStorage.removeItem("sunzi-settings-v1"));
  await failPage.goto(BASE, { waitUntil: "domcontentloaded" });
  await failPage.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });
  await failPage.evaluate(() => window.__deliverVoices());
  await failPage.click("#settings-btn");
  await failPage.waitForFunction(() => document.querySelectorAll("#voice-sel option").length > 1,
    { timeout: 5000 });
  await failPage.click('.close-btn[data-close="settings"]');
  await failPage.click("#play-btn");
  await failPage.waitForFunction(() => window.__spoken.length >= 1, { timeout: 8000 });
  const fallback = await failPage.evaluate(() => window.__spoken[0]);
  ok(fallback.voice === null, "語音合成失敗後改為不指定語音物件重試");
  ok(fallback.lang === "zh-TW", "降級後仍以 zh-TW 朗讀（" + fallback.lang + "）");
  ok(fallback.text && fallback.text.indexOf("孫子曰") === 0,
    "降級重試的是同一句、沒有被跳過（" + String(fallback.text).slice(0, 8) + "）");
  await longPressPlay(failPage);

  // 試聽按鈕：所選語音壞掉時要明確告知，而不是靜默
  await failPage.click("#settings-btn");
  await failPage.click("#voice-test");
  await failPage.waitForFunction(
    () => document.getElementById("voice-note").textContent.indexOf("系統預設") >= 0,
    { timeout: 8000 });
  const note = await failPage.$eval("#voice-note", (e) => e.textContent);
  ok(note.indexOf("系統預設") >= 0, "試聽會回報所選語音不可用（" + note + "）");
  await failPage.close();

  // 舊設定殘留的 zh-CN 語音應被清掉並改回台灣
  const stalePage = await browser.newPage();
  await stalePage.setViewport({ width: 420, height: 860 });
  await installAndroidStubs(stalePage, { failVoiceURIs: [] });
  await stalePage.goto(NEUTRAL, { waitUntil: "domcontentloaded" });
  await stalePage.evaluate(() => localStorage.setItem("sunzi-settings-v1",
    JSON.stringify({ chapter: 1, voiceURI: "zh-CN-x-ccc-network" })));
  await stalePage.goto(BASE, { waitUntil: "domcontentloaded" });
  await stalePage.waitForFunction(() => document.querySelectorAll("#pane-text .sent").length > 0,
    { timeout: 15000 });
  await stalePage.evaluate(() => window.__deliverVoices());
  await stalePage.click("#settings-btn");
  await stalePage.waitForFunction(() => document.querySelectorAll("#voice-sel option").length > 1,
    { timeout: 5000 });
  const staleSel = await stalePage.$eval("#voice-sel", (e) => e.value);
  ok(/^zh-TW-/.test(staleSel), "舊設定的 zh-CN 語音被清除並改回台灣（" + staleSel + "）");
  await stalePage.close();

  await browser.close();
  console.log(fail === 0 ? "[O] ALL E2E TESTS PASSED" : "[X] " + fail + " E2E TEST(S) FAILED");
  process.exit(fail ? 1 : 0);
})();
