(function () {
  "use strict";

  const days = [
    {
      title: "犬山近郊日",
      overview: [
        "Nagoya Station, Nagoya, Japan",
        "Inuyama Castle, Inuyama, Aichi, Japan",
        "Sanko Inari Shrine, Inuyama, Aichi, Japan",
        "Inuyama Castle Town, Inuyama, Aichi, Japan",
        "Nagoya Station, Nagoya, Japan"
      ],
      extras: [
        { label: "下午加项：名站 → 丰田产业技术纪念馆", from: "Nagoya Station, Nagoya, Japan", to: "Toyota Commemorative Museum of Industry and Technology, Nagoya, Aichi, Japan", mode: "transit" },
        { label: "夜景：名站 → Sky Promenade", from: "Nagoya Station, Nagoya, Japan", to: "Midland Square Sky Promenade, Nagoya, Aichi, Japan", mode: "walking" }
      ],
      transport: [
        ["名古屋站 → 犬山", "名铁犬山线｜名铁名古屋 → 犬山｜约50分钟｜¥630｜无需换乘", "普通车厢不必加购特别车票；特别车另加费用。", "Nagoya Station, Nagoya, Japan", "Inuyama Station, Aichi, Japan", "transit"],
        ["犬山站 → 犬山城", "步行约15～20分钟", "城下町方向一路走过去即可。", "Inuyama Station, Aichi, Japan", "Inuyama Castle, Inuyama, Aichi, Japan", "walking"],
        ["犬山城 → 三光稻荷 → 城下町", "全程步行｜城到三光稻荷约3分钟", "针纲神社也在同一片区域，紧凑版顺路加。", "Inuyama Castle, Inuyama, Aichi, Japan", "Inuyama Castle Town, Inuyama, Aichi, Japan", "walking"],
        ["犬山 → 名古屋", "名铁犬山线｜约50分钟｜¥630", "返程实际车次以Google Maps或名铁时刻表为准。", "Inuyama Station, Aichi, Japan", "Nagoya Station, Nagoya, Japan", "transit"],
        ["名站 → 丰田产业技术纪念馆", "Me～guru观光巴士或名铁至栄生＋步行｜约20分钟｜Me～guru ¥210", "紧凑版加项；16:30前必须入馆。", "Nagoya Station, Nagoya, Japan", "Toyota Commemorative Museum of Industry and Technology, Nagoya, Aichi, Japan", "transit"],
        ["名站 → Sky Promenade", "步行约7分钟｜免费", "就在Midland Square，高层夜景适合最后收尾。", "Nagoya Station, Nagoya, Japan", "Midland Square Sky Promenade, Nagoya, Aichi, Japan", "walking"]
      ]
    },
    {
      title: "名古屋城・德川・栄日",
      overview: [
        "Nagoya Station, Nagoya, Japan",
        "Nagoya Castle, Nagoya, Aichi, Japan",
        "Tokugawa Garden, Nagoya, Aichi, Japan",
        "The Tokugawa Art Museum, Nagoya, Aichi, Japan",
        "Oasis 21, Nagoya, Aichi, Japan",
        "Chubu Electric Power MIRAI TOWER, Nagoya, Aichi, Japan"
      ],
      extras: [],
      transport: [
        ["名古屋站 → 名古屋城", "地铁樱通线＋名城线｜约25分钟｜¥240｜换乘1次", "具体换乘站和当班车请直接看Google导航。", "Nagoya Station, Nagoya, Japan", "Nagoya Castle, Nagoya, Aichi, Japan", "transit"],
        ["名古屋城 → 德川园", "Me～guru观光循环巴士｜约22分钟｜¥210｜无需换乘", "名古屋城站上车 → 德川园・德川美术馆・蓬左文库。", "Nagoya Castle, Nagoya, Aichi, Japan", "Tokugawa Garden, Nagoya, Aichi, Japan", "transit"],
        ["德川园 → 德川美术馆", "步行约4分钟｜免费", "紧凑版才进馆；松弛版直接去栄。", "Tokugawa Garden, Nagoya, Aichi, Japan", "The Tokugawa Art Museum, Nagoya, Aichi, Japan", "walking"],
        ["德川区域 → 栄 / Oasis 21", "公共交通约25～30分钟（行程估算）", "这一段让Google当天按车次自动选巴士/地铁组合。", "The Tokugawa Art Museum, Nagoya, Aichi, Japan", "Oasis 21, Nagoya, Aichi, Japan", "transit"],
        ["Oasis 21 → 久屋大通 / MIRAI TOWER", "步行约4～7分钟", "几乎是同一片区域，不需要再坐车。", "Oasis 21, Nagoya, Aichi, Japan", "Chubu Electric Power MIRAI TOWER, Nagoya, Aichi, Japan", "walking"],
        ["栄 → 名古屋站", "地铁东山线｜栄 H10 → 名古屋 H08｜约15分钟｜¥210｜无需换乘", "夜景结束后直接坐回名站。", "Sakae Station, Nagoya, Japan", "Nagoya Station, Nagoya, Japan", "transit"]
      ]
    },
    {
      title: "白鸟庭园・热田・大须日",
      overview: [
        "Nagoya Station, Nagoya, Japan",
        "Shirotori Garden, Nagoya, Aichi, Japan",
        "Atsuta Jingu, Nagoya, Aichi, Japan",
        "Osu Kannon, Nagoya, Aichi, Japan",
        "Osu Shopping Street, Nagoya, Aichi, Japan",
        "Noritake Garden, Nagoya, Aichi, Japan",
        "Nagoya Station, Nagoya, Japan"
      ],
      extras: [],
      transport: [
        ["名古屋站 → 白鸟庭园", "地铁＋步行约30分钟", "这段没有锁死单一路线；当天让Google按实际车次选最快方案。", "Nagoya Station, Nagoya, Japan", "Shirotori Garden, Nagoya, Aichi, Japan", "transit"],
        ["白鸟庭园 → 热田神宫", "推荐短程出租车约5～10分钟；步行约20分钟", "天气凉快也可以走；炎热时更建议打车。", "Shirotori Garden, Nagoya, Aichi, Japan", "Atsuta Jingu, Nagoya, Aichi, Japan", "walking"],
        ["热田神宫 → 草薙馆", "境内步行约5分钟", "紧凑版加项。", "Atsuta Jingu, Nagoya, Aichi, Japan", "Kusanagi-kan, Atsuta Jingu, Nagoya, Japan", "walking"],
        ["热田 → 大须观音", "公共交通约25～30分钟（行程估算）", "当天让Google实时选地铁/巴士；不建议为了省一次换乘暴走。", "Atsuta Jingu, Nagoya, Aichi, Japan", "Osu Kannon, Nagoya, Aichi, Japan", "transit"],
        ["大须观音 → 大须商店街", "步行约5分钟", "下午主要都在有顶棚的商店街范围内。", "Osu Kannon, Nagoya, Aichi, Japan", "Osu Shopping Street, Nagoya, Aichi, Japan", "walking"],
        ["大须 → Noritake之森", "公共交通约25～30分钟（行程估算）", "紧凑版加项；必须赶18:00前仍开放的Gallery / Shop。", "Osu Shopping Street, Nagoya, Aichi, Japan", "Noritake Garden, Nagoya, Aichi, Japan", "transit"],
        ["Noritake之森 → 名古屋站", "步行约18分钟｜免费", "不想走就直接Google看当时巴士/出租车。", "Noritake Garden, Nagoya, Aichi, Japan", "Nagoya Station, Nagoya, Japan", "walking"]
      ]
    }
  ];

  function esc(value) {
    return String(value || "").replace(/[&<>'\"]/g, (c) => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", "'":"&#39;", '"':"&quot;" })[c]);
  }

  function mapsDir(origin, destination, mode) {
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&travelmode=${mode === "walking" ? "walking" : "transit"}`;
  }

  function mapsMulti(stops) {
    if (!stops || stops.length < 2) return "";
    const origin = stops[0];
    const destination = stops[stops.length - 1];
    const waypoints = stops.slice(1, -1).join("|");
    return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(origin)}&destination=${encodeURIComponent(destination)}&waypoints=${encodeURIComponent(waypoints)}&travelmode=transit`;
  }

  function injectStyles() {
    if (document.getElementById("itinerary-maps-style")) return;
    const style = document.createElement("style");
    style.id = "itinerary-maps-style";
    style.textContent = `
      .itinerary-mapbox{margin-top:1rem;padding-top:1rem;border-top:1px dashed #bccdc7}.itinerary-mapbox h4{margin:.1rem 0 .55rem}.itinerary-map-actions{display:flex;gap:.5rem;flex-wrap:wrap;margin:.5rem 0 .9rem}.itinerary-map-link{display:inline-flex;align-items:center;min-height:42px;padding:.55rem .75rem;border-radius:.75rem;background:#eef6f3;border:1px solid #b8cec6;color:#173c35;text-decoration:none;font-weight:800}.itinerary-map-link.primary{background:#183b34;color:#fff;border-color:#183b34}.itinerary-transport-list{display:grid;gap:.55rem}.itinerary-transport-row{padding:.7rem .75rem;border-radius:.75rem;background:#f6f8f7}.itinerary-transport-row strong{display:block}.itinerary-transport-row span{display:block;margin-top:.15rem;color:#53635e}.itinerary-transport-row small{display:block;margin-top:.25rem;color:#6a7672}.itinerary-transport-row a{display:inline-block;margin-top:.4rem;font-weight:800}.itinerary-map-note{font-size:.9em;color:#5d6d68}
      @media print{.itinerary-map-actions,.itinerary-transport-row a{display:none!important}.itinerary-mapbox{break-inside:avoid}.itinerary-map-note{display:block}}
    `;
    document.head.appendChild(style);
  }

  function renderTools() {
    const cards = document.querySelectorAll("#itinerary-days .itinerary-day");
    if (!cards.length) return;
    cards.forEach((card, index) => {
      if (card.querySelector(".itinerary-mapbox")) return;
      const day = days[index];
      if (!day) return;
      const box = document.createElement("section");
      box.className = "itinerary-mapbox";
      const overview = mapsMulti(day.overview);
      const extras = day.extras.map((item) => `<a class="itinerary-map-link" target="_blank" rel="noopener noreferrer" href="${esc(mapsDir(item.from, item.to, item.mode))}">${esc(item.label)}｜Google Maps</a>`).join("");
      const transport = day.transport.map((row) => `
        <div class="itinerary-transport-row">
          <strong>${esc(row[0])}</strong>
          <span>${esc(row[1])}</span>
          <small>${esc(row[2])}</small>
          <a target="_blank" rel="noopener noreferrer" href="${esc(mapsDir(row[3], row[4], row[5]))}">打开这一段 Google Maps</a>
        </div>
      `).join("");
      box.innerHTML = `
        <h4>Google 路线图＋交通方式</h4>
        <p class="itinerary-map-note">总览图用于看一天的方向；真正坐车时建议点下面“这一段 Google Maps”，它会按当时车次重新计算。</p>
        <div class="itinerary-map-actions">
          <a class="itinerary-map-link primary" target="_blank" rel="noopener noreferrer" href="${esc(overview)}">🗺 打开当天 Google Maps 总路线</a>
          ${extras}
        </div>
        <div class="itinerary-transport-list">${transport}</div>
      `;
      card.appendChild(box);
    });
  }

  function init() {
    injectStyles();
    const container = document.getElementById("itinerary-days");
    if (!container) {
      window.setTimeout(init, 200);
      return;
    }
    renderTools();
    const observer = new MutationObserver(() => renderTools());
    observer.observe(container, { childList: true, subtree: true });
  }

  document.addEventListener("DOMContentLoaded", init);
})();