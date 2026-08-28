import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readJson = async (relative) => JSON.parse(await readFile(path.join(root, relative), "utf8"));
const writeJson = async (relative, value) => writeFile(path.join(root, relative), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const checkedDate = "2026-08-28";
const checkedAt = "2026-08-28T01:00:00+08:00";

const [placesData, restaurantsData, transportData, sourcesData, areasData] = await Promise.all([
  readJson("data/places.json"),
  readJson("data/restaurants.json"),
  readJson("data/transport.json"),
  readJson("data/sources.json"),
  readJson("data/areas.json")
]);

const pushUnique = (list, value) => {
  if (!list.includes(value)) list.push(value);
};

const factVerified = (record) => {
  if (record.admission) record.admission.verified_at = checkedDate;
  if (record.opening_hours) record.opening_hours.verified_at = checkedDate;
  if (record.trip_date_status) record.trip_date_status.verified_at = checkedDate;
  record.last_information_verified_at = checkedDate;
};

const reviewedPlaceIds = new Set([
  "nagoya-aquarium", "nagoya-science", "nagoya-castle", "tokugawa-garden", "tokugawa-art",
  "higashiyama-zoo", "kusanagi-kan", "atsuta-treasure-hall", "shirotori-garden", "scmaglev", "inuyama-castle"
]);
for (const place of placesData.places) {
  if (!reviewedPlaceIds.has(place.id)) continue;
  factVerified(place);
  if (place.id === "nagoya-castle") {
    const sourceId = "src-pretrip-nagoya-castle-guide-suspension";
    pushUnique(place.source_ids, sourceId);
    pushUnique(place.trip_date_status.source_ids, sourceId);
    place.trip_date_status.summary_zh = "旅行日期内预计开放；主天守不能进入，酷暑期间志愿导览暂停至9月23日。";
    pushUnique(place.notes, "官方因酷暑暂停志愿导览至2026-09-23；城内仍开放。" );
  }
  if (place.id === "tokugawa-garden") {
    place.trip_date_status.summary_zh = "旅行日期内预计开放；官方因酷暑暂停志愿庭园导览至9月18日。";
  }
  if (place.id === "nagoya-aquarium") {
    const sourceId = "src-pretrip-port-facilities-closure";
    pushUnique(place.source_ids, sourceId);
    pushUnique(place.trip_date_status.source_ids, sourceId);
    place.trip_date_status.summary_zh = "水族馆预计正常开放；港口大楼全馆（含海洋博物馆与展望室）、南极观测船富士、Port House于8月1日至11月30日关闭。";
    place.notes = [
      "2026-08-01至11-30，港口大楼全馆（含海洋博物馆与展望室）、南极观测船富士及Port House关闭；水族馆本身预计开放。"
    ];
  }
}

const reviewedRestaurantIds = new Set([
  "breakfast-pergola", "lunch-torigotetsu", "lunch-torikai-esca", "lunch-yamamotoya-esca",
  "lunch-torishige-nishiki", "lunch-atsuta-horaiken-jingu", "lunch-matsunoya-inuyama",
  "dinner-furaibo-esca", "dinner-kyoto-tsuruya"
]);
for (const restaurant of restaurantsData.restaurants) {
  if (!reviewedRestaurantIds.has(restaurant.id)) continue;
  restaurant.last_information_verified_at = checkedDate;
  for (const exception of restaurant.business_hours?.date_exceptions || []) exception.verified_at = checkedDate;
  if (restaurant.business_hours) restaurant.business_hours.verified_at = checkedDate;
  if (restaurant.reservation) restaurant.reservation.verified_at = checkedDate;
}

for (const option of transportData.transport_options) {
  if (option.record_status !== "researched_transport") continue;
  option.last_information_verified_at = checkedDate;
  if (option.reference_fare) option.reference_fare.verified_at = checkedDate;
  for (const ticket of option.ticket_types || []) ticket.verified_at = checkedDate;
  for (const block of [option.ic_card, option.purchase, option.boarding]) {
    if (block) block.verified_at = checkedDate;
  }
}

const newSources = [
  {
    id: "src-pretrip-nagoya-castle-guide-suspension",
    record_status: "researched_source",
    label: "名古屋城官方｜酷暑期间志愿导览暂停",
    url: "https://www.nagoyajo.city.nagoya.jp/other/2026/04/20260418_4866.html",
    source_type: "official",
    purpose: ["temporary_notice", "trip_date_check"],
    entity_refs: ["nagoya-castle"],
    verification: {
      status: "verified", verified: true, verified_at: checkedAt, checked_by: "pre_trip_official_recheck",
      http_status: 200, redirected: false,
      final_url: "https://www.nagoyajo.city.nagoya.jp/other/2026/04/20260418_4866.html",
      content_matches_purpose: true, entity_or_branch_matches: true, mobile_checked: true,
      mobile_accessible: true, login_required: false, access_restrictions: [],
      notes: "官方公告确认7月1日至9月23日因酷暑暂停志愿导览；名古屋城本身未因此闭园。"
    },
    retrieved_at: checkedDate, archived_url: "", notes: []
  },
  {
    id: "src-pretrip-port-facilities-closure",
    record_status: "researched_source",
    label: "名古屋港官方｜2026赛事筹备期间三处设施关闭",
    url: "https://nagoyaaqua.jp/garden-pier/news2/porthouse/29959/",
    source_type: "official",
    purpose: ["temporary_closure", "trip_date_check"],
    entity_refs: ["nagoya-aquarium"],
    verification: {
      status: "verified", verified: true, verified_at: checkedAt, checked_by: "pre_trip_official_recheck",
      http_status: 200, redirected: false,
      final_url: "https://nagoyaaqua.jp/garden-pier/news2/porthouse/29959/",
      content_matches_purpose: true, entity_or_branch_matches: true, mobile_checked: true,
      mobile_accessible: true, login_required: false, access_restrictions: [],
      notes: "官方公告确认8月1日至11月30日关闭港口大楼全馆、南极观测船富士与Port House；不包含水族馆。"
    },
    retrieved_at: checkedDate, archived_url: "", notes: []
  }
];

sourcesData.sources = sourcesData.sources.filter((source) => !["src-demo-dataset", "src-template-official-link"].includes(source.id));
for (const source of newSources) {
  if (!sourcesData.sources.some((item) => item.id === source.id)) sourcesData.sources.push(source);
}

const reviewedSourceIds = new Set([
  "src-castle", "src-tokugawa-garden", "src-tokugawa-museum", "src-higashiyama", "src-atsuta-kusanagi",
  "src-atsuta-treasure", "src-shirotori", "src-science", "src-science-calendar", "src-aquarium", "src-railway", "src-inuyama-castle",
  "src-breakfast-pergola-official", "src-breakfast-pergola-restaurant", "src-lunch-torigotetsu-official",
  "src-lunch-torikai-esca-official", "src-lunch-torikai-esca-menu", "src-lunch-yamamotoya-esca-official",
  "src-lunch-yamamotoya-esca-menu", "src-lunch-torishige-nishiki-official", "src-lunch-torishige-nishiki-menu",
  "src-lunch-atsuta-horaiken-jingu-official", "src-lunch-atsuta-horaiken-jingu-menu",
  "src-lunch-matsunoya-inuyama-official", "src-lunch-matsunoya-inuyama-menu", "src-dinner-furaibo-esca-official",
  "src-dinner-furaibo-esca-menu", "src-dinner-kyoto-tsuruya-official", "src-dinner-kyoto-tsuruya-menu",
  "src-dinner-kyoto-tsuruya-reservation", "src-city-transport", "src-transit-subway-network",
  "src-transit-subway-timetable", "src-transit-day-passes", "src-meguru", "src-transit-meguru-guide",
  "src-meitetsu", "src-transit-meitetsu-timetable", "src-aonami", "src-transit-aonami-timetable"
]);
for (const source of sourcesData.sources) {
  if (!reviewedSourceIds.has(source.id) || !source.verification) continue;
  source.verification.verified_at = checkedAt;
  source.retrieved_at = checkedDate;
}

areasData.dataset_status = "configured_areas";
areasData.description = "区域用于浏览与路线聚类，表示地点相对接近，不代表固定路线。";
for (const area of areasData.areas) {
  area.record_status = "configured_area";
  area.description_zh = `${area.names.zh}浏览与路线聚类范围；具体路线由用户选择后生成。`;
  area.source_ids = ["src-user-trip-requirements"];
  area.verified_at = checkedDate;
}

await Promise.all([
  writeJson("data/places.json", placesData),
  writeJson("data/restaurants.json", restaurantsData),
  writeJson("data/transport.json", transportData),
  writeJson("data/sources.json", sourcesData),
  writeJson("data/areas.json", areasData)
]);

console.log(JSON.stringify({
  reviewed_places: reviewedPlaceIds.size,
  reviewed_restaurants: reviewedRestaurantIds.size,
  reviewed_transport_options: transportData.transport_options.filter((item) => item.record_status === "researched_transport").length,
  sources: sourcesData.sources.length,
  areas: areasData.areas.length
}));
