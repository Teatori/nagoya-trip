(function () {
  "use strict";

  const MODE_KEY = "nagoya-trip.curated-itinerary-mode.v1";
  const DEFAULT_MODE = localStorage.getItem(MODE_KEY) === "tight" ? "tight" : "relaxed";

  const days = [
    {
      id: "inuyama",
      title: "犬山近郊日",
      subtitle: "犬山城・神社・城下町",
      relaxed: [
        ["07:40", "从名古屋站周边出发", "步行进入名铁名古屋站"],
        ["07:50-08:40", "名铁名古屋 → 犬山方向", "约50分钟（按小程序正式参考路线，含步行缓冲）"],
        ["08:40-09:00", "步行至犬山城", "约15-20分钟；尽量开门前到"],
        ["09:00-10:30", "犬山城", "建议90分钟；天守楼梯陡，按体力决定是否登顶"],
        ["10:33-10:55", "三光稻荷神社", "犬山城旁，步行约3分钟"],
        ["10:55-11:45", "犬山城下町", "一路向犬山站方向慢慢逛"],
        ["11:55-12:55", "午饭：松野屋", "建议预约；从城下町南段步行约10分钟"],
        ["13:05-14:00", "犬山 → 名古屋", "名铁返回；约50分钟级别"],
        ["14:10以后", "回酒店休息", "松弛版到这里就是完整的一天"]
      ],
      tight: [
        ["07:30", "从名古屋站周边出发", "比松弛版提前约10分钟"],
        ["07:40-08:30", "名铁名古屋 → 犬山方向", "约50分钟（含步行缓冲）"],
        ["08:30-08:50", "⚡ 木曾川游步道短段", "只走20分钟；天气热或下雨直接删除"],
        ["09:00-10:30", "犬山城", "建议90分钟"],
        ["10:33-10:50", "三光稻荷神社", "步行约3分钟"],
        ["10:50-11:05", "⚡ 针纲神社", "与犬山城相邻，顺路短停"],
        ["11:05-11:45", "犬山城下町", "边走边逛，不追求逛完"],
        ["11:55-12:55", "午饭：松野屋", "建议预约"],
        ["13:05-14:00", "犬山 → 名古屋", "名铁返回"],
        ["19:00-20:00", "⚡ Sky Promenade", "回酒店充分休息后还有体力再去；酒店附近"]
      ],
      meals: [
        ["首选午餐", "松野屋（犬山本店）", "11:00-15:00；可电话预约；田乐定食约¥1,350-1,800；预约后最省排队"],
        ["省脚力备用", "犬山城下町就地吃", "看到有座位、没排长队的店直接进，不为了网红店回头走"],
        ["晚餐备用", "鸡五铁 JR中央双塔店", "回到名古屋站后再吃；酒店楼群内约5分钟，可预约"]
      ],
      note: "犬山是三天里步行最多的一天。城、神社、城下町已经足够完整；河边和夜景都是可删的加项。"
    },
    {
      id: "castle-tokugawa",
      title: "名古屋城・德川・栄日",
      subtitle: "城市经典＋日式庭园＋夜景商圈",
      relaxed: [
        ["08:25-08:55", "名古屋站周边 → 名古屋城", "地铁约25分钟＋步行缓冲"],
        ["09:00-11:00", "名古屋城", "建议120分钟；主天守不可进入，重点看本丸御殿和城郭"],
        ["11:00-11:35", "名古屋城 → 德川园", "Me-guru正式参考车程约22分钟；把等车一起留到35分钟"],
        ["11:45-12:45", "午饭：宝善亭", "德川园入口步行约3分钟；建议预约"],
        ["12:50-14:05", "德川园", "建议75分钟"],
        ["14:05-14:35", "德川 → 栄", "约25-30分钟，当前为行程估算；当天重新导航"],
        ["14:35-16:30", "Oasis 21＋久屋大通", "自由逛、喝东西；累了随时结束"],
        ["16:30以后", "晚饭 / 回酒店", "松弛版不强制登塔"]
      ],
      tight: [
        ["08:25-08:55", "名古屋站周边 → 名古屋城", "地铁约25分钟＋步行缓冲"],
        ["09:00-11:00", "名古屋城", "建议120分钟"],
        ["11:00-11:35", "名古屋城 → 德川园", "Me-guru＋等车缓冲"],
        ["11:45-12:45", "午饭：宝善亭", "建议预约"],
        ["12:50-14:05", "德川园", "建议75分钟"],
        ["14:10-15:40", "⚡ 德川美术馆", "与德川园步行约4分钟；室内避暑，建议90分钟"],
        ["15:40-16:10", "德川 → 栄", "约25-30分钟，行程估算；当天重新导航"],
        ["16:10-17:00", "Oasis 21＋久屋大通", "短逛"],
        ["17:05-18:05", "⚡ MIRAI TOWER", "有体力再登；天气差可直接删"],
        ["18:10以后", "晚饭", "栄或回名古屋站均可"]
      ],
      meals: [
        ["首选午餐", "宝善亭", "11:00-15:00；德川园旁；建议预约；约¥3,000-5,500/人，环境安静"],
        ["便宜备用", "金鯱横丁", "名古屋城旁；不锁定具体店，现场优先选不用排队的一家"],
        ["晚餐备用", "鸡五铁 JR中央双塔店", "回名古屋站后吃最省心；鸡料理、亲子丼、定食都有，可预约"]
      ],
      note: "这天最适合现场切换版本：下午精神好就加德川美术馆；累了直接去栄坐着逛。"
    },
    {
      id: "atsuta-osu",
      title: "白鸟庭园・热田・大须日",
      subtitle: "上午户外景色，下午进入商店街",
      relaxed: [
        ["08:25-08:55", "名古屋站周边 → 白鸟庭园", "地铁＋步行约30分钟"],
        ["09:00-10:15", "白鸟庭园", "建议75分钟；趁上午相对凉快先走室外庭园"],
        ["10:15-10:25", "白鸟庭园 → 热田神宫", "建议短程出租车；步行约20分钟但炎热时不划算"],
        ["10:25-11:40", "热田神宫", "建议75分钟；树林较多"],
        ["11:40-12:25", "午饭：宫きしめん 神宫店", "就在境内；尽量早于午餐高峰"],
        ["12:25-12:55", "热田 → 大须", "约25-30分钟，行程估算；当天重新导航"],
        ["13:00-13:30", "大须观音", "约30分钟"],
        ["13:35-15:35", "大须商店街", "建议约2小时；有顶棚，可随时坐下休息"],
        ["15:35-16:00", "大须 → 名古屋站周边", "约25分钟级别"]
      ],
      tight: [
        ["08:25-08:55", "名古屋站周边 → 白鸟庭园", "约30分钟"],
        ["09:00-10:15", "白鸟庭园", "建议75分钟"],
        ["10:15-10:25", "白鸟庭园 → 热田神宫", "短程出租车优先"],
        ["10:25-11:40", "热田神宫", "建议75分钟"],
        ["11:40-12:25", "午饭：宫きしめん 神宫店", "早点吃，避开12点后高峰"],
        ["12:25-13:15", "⚡ 草薙馆", "热田神宫境内；步行约5分钟；室内约50分钟"],
        ["13:15-13:45", "热田 → 大须", "约25-30分钟，行程估算；当天重新导航"],
        ["13:45-14:15", "大须观音", "约30分钟"],
        ["14:20-17:00", "大须商店街", "紧凑版把更多时间留给逛街、吃小东西"],
        ["17:00以后", "回酒店 / 吃晚饭", "不再额外塞远处景点"]
      ],
      meals: [
        ["首选午餐", "宫きしめん 神宫店", "热田神宫境内零绕路；约¥850-1,600；不能预约，早点吃通常更省时间"],
        ["下午加餐", "大须商店街", "不指定网红店；看到有座位、排队短的小吃或咖啡店就休息"],
        ["晚餐备用", "名古屋站鸡料理", "回名站后再决定；鸡五铁等可预约店比临时排热门店稳妥"]
      ],
      note: "这天按“先室外、后商店街”设计。热田到大须的具体车次当天导航；雨大时可以缩短白鸟庭园，提前进草薙馆或大须。"
    }
  ];

  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      .itinerary-toolbar{display:flex;gap:.65rem;flex-wrap:wrap;align-items:center;margin:1rem 0 1.25rem}.itinerary-toolbar button{min-height:44px}.itinerary-mode-button{border:1px solid #b7c9c3;background:#fff;border-radius:999px;padding:.65rem 1rem;font:inherit;font-weight:700}.itinerary-mode-button.is-active{background:#183b34;color:#fff;border-color:#183b34}.itinerary-actions{display:flex;gap:.55rem;flex-wrap:wrap;margin-left:auto}.itinerary-action{border:1px solid #9db5ad;background:#fff;border-radius:.8rem;padding:.65rem .9rem;font:inherit;font-weight:700}.itinerary-day{margin:0 0 1.25rem;padding:1rem;background:#fff;border:1px solid #d9e3df;border-radius:1rem}.itinerary-day h3{margin:.1rem 0}.itinerary-day-subtitle{margin:.2rem 0 1rem;color:#546762}.itinerary-route{display:grid;gap:.55rem}.itinerary-row{display:grid;grid-template-columns:7.5rem 1fr;gap:.75rem;padding:.7rem .75rem;border-radius:.75rem;background:#f5f8f7}.itinerary-row time{font-weight:800;color:#183b34}.itinerary-row strong{display:block}.itinerary-row span{display:block;margin-top:.2rem;color:#5b6865;font-size:.94em}.itinerary-meals{margin-top:1rem;padding-top:.9rem;border-top:1px dashed #c8d5d1}.itinerary-meals h4{margin:.1rem 0 .55rem}.itinerary-meal{margin:.45rem 0;padding:.55rem .7rem;background:#fff8e8;border-radius:.7rem}.itinerary-meal strong{display:block}.itinerary-note{margin:.85rem 0 0;padding:.7rem .8rem;background:#eef6f3;border-radius:.75rem}.itinerary-export-note{margin:.4rem 0 1rem;color:#5b6865}.itinerary-print-title{display:none}.itinerary-legend{font-size:.95em;color:#53635e}.itinerary-nav{font-weight:800}
      @media(max-width:640px){.itinerary-row{grid-template-columns:1fr;gap:.2rem}.itinerary-actions{width:100%;margin-left:0}.itinerary-action{flex:1 1 auto}}
      @media print{body.itinerary-print-mode .site-header,body.itinerary-print-mode .primary-nav,body.itinerary-print-mode .site-footer,body.itinerary-print-mode #status-message,body.itinerary-print-mode .view-section:not(#view-itinerary),body.itinerary-print-mode .itinerary-toolbar,body.itinerary-print-mode .itinerary-export-note{display:none!important}body.itinerary-print-mode #view-itinerary{display:block!important}body.itinerary-print-mode .page-shell{max-width:none;padding:0}body.itinerary-print-mode .itinerary-print-title{display:block;margin-bottom:1rem}body.itinerary-print-mode .itinerary-day{break-inside:avoid;box-shadow:none;border:1px solid #bbb}body.itinerary-print-mode .itinerary-row{background:#fff;border-bottom:1px solid #ddd;border-radius:0}body.itinerary-print-mode a{text-decoration:none;color:#000}}
    `;
    document.head.appendChild(style);
  }

  function injectView() {
    const navScroll = document.querySelector(".nav-scroll");
    const routeButton = navScroll?.querySelector('[data-view="route"]');
    if (navScroll && !navScroll.querySelector('[data-view="itinerary"]')) {
      const button = document.createElement("button");
      button.className = "nav-button itinerary-nav";
      button.type = "button";
      button.dataset.view = "itinerary";
      button.textContent = "三日建议";
      navScroll.insertBefore(button, routeButton || null);
    }

    const main = document.getElementById("main-content");
    const routeSection = document.getElementById("view-route");
    if (!main || document.getElementById("view-itinerary")) return;
    const section = document.createElement("section");
    section.id = "view-itinerary";
    section.className = "view-section";
    section.dataset.viewPanel = "itinerary";
    section.hidden = true;
    section.innerHTML = `
      <div class="itinerary-print-title"><h1>名古屋三日推荐路线</h1><p>根据景点、餐厅与交通研究数据整理。实际车次和临时营业以当天导航与官网为准。</p></div>
      <div class="section-heading"><div><p class="eyebrow">把三天先排成可执行骨架</p><h2>三日推荐路线</h2></div><p>先选松弛版；当天体力和天气都好，再切换⚡紧凑版。</p></div>
      <p class="itinerary-legend">⚡ = 可删加项。删掉不会破坏当天主线。</p>
      <div class="itinerary-toolbar">
        <button class="itinerary-mode-button" type="button" data-itinerary-mode="relaxed">松弛版</button>
        <button class="itinerary-mode-button" type="button" data-itinerary-mode="tight">⚡ 紧凑版</button>
        <div class="itinerary-actions">
          <button class="itinerary-action" type="button" id="itinerary-copy">复制路线</button>
          <button class="itinerary-action" type="button" id="itinerary-download">下载路线.txt</button>
          <button class="itinerary-action" type="button" id="itinerary-print">打印 / 存为PDF</button>
        </div>
      </div>
      <p class="itinerary-export-note">这个三日模板不写私人航班或订单信息，可放心保留在公开小程序；具体日期可以在导出后自己标注。</p>
      <div id="itinerary-days"></div>
    `;
    main.insertBefore(section, routeSection || null);
  }

  function routeRows(rows) {
    return rows.map((row) => `<div class="itinerary-row"><time>${escapeHtml(row[0])}</time><div><strong>${escapeHtml(row[1])}</strong><span>${escapeHtml(row[2])}</span></div></div>`).join("");
  }

  function mealRows(meals) {
    return meals.map((meal) => `<div class="itinerary-meal"><strong>${escapeHtml(meal[0])}｜${escapeHtml(meal[1])}</strong><span>${escapeHtml(meal[2])}</span></div>`).join("");
  }

  function render(mode) {
    localStorage.setItem(MODE_KEY, mode);
    document.querySelectorAll("[data-itinerary-mode]").forEach((button) => button.classList.toggle("is-active", button.dataset.itineraryMode === mode));
    const container = document.getElementById("itinerary-days");
    if (!container) return;
    container.innerHTML = days.map((day, index) => `
      <article class="itinerary-day">
        <p class="eyebrow">第${index + 1}天</p>
        <h3>${escapeHtml(day.title)}</h3>
        <p class="itinerary-day-subtitle">${escapeHtml(day.subtitle)}</p>
        <div class="itinerary-route">${routeRows(day[mode])}</div>
        <section class="itinerary-meals"><h4>吃饭备选（尽量少排队）</h4>${mealRows(day.meals)}</section>
        <p class="itinerary-note"><strong>当天判断：</strong>${escapeHtml(day.note)}</p>
      </article>
    `).join("");
  }

  function buildText(mode) {
    const lines = [`名古屋三日推荐路线｜${mode === "tight" ? "⚡紧凑版" : "松弛版"}`, "", "⚡ = 可删加项；实际交通请当天重新导航。", ""];
    days.forEach((day, index) => {
      lines.push(`第${index + 1}天｜${day.title}`);
      day[mode].forEach((row) => lines.push(`${row[0]}  ${row[1]}｜${row[2]}`));
      lines.push("吃饭备选：");
      day.meals.forEach((meal) => lines.push(`- ${meal[0]}：${meal[1]}｜${meal[2]}`));
      lines.push(`当天判断：${day.note}`, "");
    });
    return lines.join("\n");
  }

  async function copyCurrent(mode) {
    const text = buildText(mode);
    try {
      await navigator.clipboard.writeText(text);
      showMiniStatus("已复制三日路线。");
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      showMiniStatus("已复制三日路线。");
    }
  }

  function downloadCurrent(mode) {
    const blob = new Blob([buildText(mode)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `nagoya-3day-${mode}.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function printCurrent() {
    document.body.classList.add("itinerary-print-mode");
    window.print();
    window.setTimeout(() => document.body.classList.remove("itinerary-print-mode"), 1200);
  }

  function showMiniStatus(message) {
    const status = document.getElementById("status-message");
    if (!status) return;
    status.textContent = message;
    status.classList.add("is-visible");
    window.setTimeout(() => status.classList.remove("is-visible"), 2200);
  }

  function bind() {
    let mode = DEFAULT_MODE;
    render(mode);
    document.querySelectorAll("[data-itinerary-mode]").forEach((button) => button.addEventListener("click", () => {
      mode = button.dataset.itineraryMode === "tight" ? "tight" : "relaxed";
      render(mode);
    }));
    document.getElementById("itinerary-copy")?.addEventListener("click", () => copyCurrent(mode));
    document.getElementById("itinerary-download")?.addEventListener("click", () => downloadCurrent(mode));
    document.getElementById("itinerary-print")?.addEventListener("click", printCurrent);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'\"]/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
    })[character]);
  }

  injectStyles();
  injectView();
  document.addEventListener("DOMContentLoaded", bind);
})();
