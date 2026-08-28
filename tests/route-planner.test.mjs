import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await import("../js/route-planner.js");
const planner = globalThis.NagoyaRoutePlanner;

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

const [placesData, restaurantsData, tripConfig, areasData] = await Promise.all([
  readJson("data/places.json"),
  readJson("data/restaurants.json"),
  readJson("data/trip-config.json"),
  readJson("data/areas.json")
]);

const data = {
  places: placesData.places,
  restaurants: restaurantsData.restaurants,
  tripConfig,
  areas: areasData.areas
};
const appSource = await readFile(path.join(root, "js/app.js"), "utf8");

function analyze({ date, duration = "half_day", pace = "normal", ids = [], startTime = "09:00", originId = "nagoya-station", departureDay = false, routeEndDeadline = null }) {
  return planner.analyze(planner.createRequest({
    date,
    duration,
    pace,
    startTime,
    originId,
    isDepartureDay: departureDay,
    routeEndDeadline,
    selectedPlaceIds: ids
  }), data);
}

test("CASE 1：热田同区域大半天为合适组合，并返回热田午餐", () => {
  const result = analyze({
    date: "2026-09-02",
    duration: "most_day",
    ids: ["atsuta-jingu", "shirotori-garden"]
  });
  assert.equal(result.feasibility, "good");
  assert.equal(result.clusters.length, 1);
  assert.deepEqual(new Set(result.recommended_subset), new Set(["atsuta-jingu", "shirotori-garden"]));
  assert(result.restaurant_candidates.lunch.some((item) => item.restaurant_id === "lunch-miyakishimen-jingu"));
});

test("CASE 2：9月1日科学馆休馆并从建议子集中排除", () => {
  const result = analyze({
    date: "2026-09-01",
    ids: ["nagoya-science", "osu-kannon"]
  });
  assert(result.unavailable_places.some((item) => item.place_id === "nagoya-science"));
  assert(!result.recommended_subset.includes("nagoya-science"));
  assert(result.recommended_subset.includes("osu-kannon"));
});

test("CASE 3：9月1日热田午餐排除蓬莱轩并保留替代", () => {
  const candidates = planner.findAvailableRestaurants({
    restaurants: data.restaurants,
    areaIds: ["area-atsuta"],
    date: "2026-09-01",
    meal: "lunch",
    time: "12:00"
  });
  assert(!candidates.some((item) => item.restaurant_id === "lunch-atsuta-horaiken-jingu"));
  assert(candidates.some((item) => item.restaurant_id === "lunch-miyakishimen-jingu"));
});

test("CASE 4：9月3日犬山午餐排除松野屋", () => {
  const candidates = planner.findAvailableRestaurants({
    restaurants: data.restaurants,
    areaIds: ["area-inuyama"],
    date: "2026-09-03",
    meal: "lunch",
    time: "12:00"
  });
  assert(!candidates.some((item) => item.restaurant_id === "lunch-matsunoya-inuyama"));
});

test("CASE 5：半天少走路且跨区选择8处会主动裁剪", () => {
  const ids = [
    "atsuta-jingu",
    "shirotori-garden",
    "oasis21",
    "mirai-tower",
    "nagoya-castle",
    "nagoya-aquarium",
    "inuyama-castle",
    "scmaglev"
  ];
  const result = analyze({ date: "2026-09-02", duration: "half_day", pace: "easy", ids });
  assert(result.recommended_subset.length < ids.length);
  assert(result.remaining_places.length > 0);
  assert(["poor", "moderate"].includes(result.feasibility));
  assert(result.remaining_places.every((item) => item.reason));
});

test("CASE 6：Oasis 21、久屋大通与MIRAI TOWER识别为紧凑组合", () => {
  const result = analyze({
    date: "2026-09-02",
    duration: "full_day",
    ids: ["oasis21", "hisaya-odori-park", "mirai-tower"]
  });
  assert.equal(result.clusters.length, 1);
  assert.equal(result.clusters[0].compatibility, "high");
  assert.equal(result.feasibility, "good");
});

test("CASE 7：犬山、名古屋港与东山半天判定为高负担", () => {
  const result = analyze({
    date: "2026-09-02",
    ids: ["inuyama-castle", "nagoya-aquarium", "higashiyama-zoo"]
  });
  assert.equal(result.feasibility, "poor");
  assert(result.feasibility_reasons.some((reason) => reason.includes("远郊") || reason.includes("多个区域")));
  assert(result.remaining_places.length >= 2);
});

test("CASE 8：犬山城、城下町、三光稻荷为合理犬山组合", () => {
  const result = analyze({
    date: "2026-09-02",
    duration: "most_day",
    ids: ["inuyama-castle", "inuyama-castle-town", "sanko-inari"]
  });
  assert.equal(result.clusters.length, 1);
  assert.equal(result.recommended_subset.length, 3);
  assert(["good", "moderate"].includes(result.feasibility));
});

test("CASE 9：9月4日多个远郊全天触发离境日风险", () => {
  const result = analyze({
    date: "2026-09-04",
    duration: "full_day",
    ids: ["inuyama-castle", "nagoya-aquarium", "scmaglev"],
    departureDay: true
  });
  assert.equal(result.departure_day.is_departure_day, true);
  assert.equal(result.feasibility, "poor");
  assert(result.warnings.some((warning) => warning.includes("离境日")));
  assert.equal(result.departure_day.route_end_deadline, null);
});

test("泛化 CASE 11：任意有效日期可生成并提示临时营业信息待确认", () => {
  const result = analyze({ date: "2026-10-15", ids: ["atsuta-jingu"] });
  assert.equal(result.ok, true);
  assert.equal(result.date, "2026-10-15");
  assert(result.warnings.some((warning) => warning.includes("临时营业信息待确认")));
});

test("泛化 CASE 12：普通日期不会自动成为离境日", () => {
  const result = analyze({ date: "2026-09-04", duration: "full_day", ids: ["inuyama-castle"] });
  assert.equal(result.departure_day.is_departure_day, false);
  assert(!result.warnings.some((warning) => warning.includes("离境日")));
});

test("泛化 CASE 13：仅显式勾选后启用离境日限制", () => {
  const normal = analyze({ date: "2026-10-15", duration: "full_day", ids: ["inuyama-castle"] });
  const departure = analyze({ date: "2026-10-15", duration: "full_day", ids: ["inuyama-castle"], departureDay: true });
  assert.equal(normal.departure_day.is_departure_day, false);
  assert.equal(departure.departure_day.is_departure_day, true);
  assert(departure.warnings.some((warning) => warning.includes("离境日")));
  assert.equal(departure.feasibility, "poor");
});

test("泛化 CASE 14：默认起点为名古屋站", () => {
  const request = planner.createRequest({ date: "2026-09-02", duration: "half_day", pace: "normal", selectedPlaceIds: ["atsuta-jingu"] });
  assert.equal(request.origin_choice_id, "nagoya-station");
  assert.equal(request.origin.name_zh, "名古屋站");
});

test("泛化 CASE 15：没有航班配置时路线仍可生成", () => {
  assert(!Object.hasOwn(tripConfig, "flights"));
  assert(!Object.hasOwn(tripConfig, "trip"));
  const result = analyze({ date: "2026-09-02", ids: ["atsuta-jingu"] });
  assert.equal(result.ok, true);
});

test("泛化 CASE 16：旧版想去和想吃localStorage键继续兼容", () => {
  assert(appSource.includes('selections: "nagoya-trip.selections.v1"'));
  assert(appSource.includes("Array.isArray(parsed?.placeIds)"));
  assert(appSource.includes("Array.isArray(parsed?.restaurantIds)"));
});

test("CASE 10：空选择返回友好状态而非抛错", () => {
  const result = analyze({ date: "2026-09-02", ids: [] });
  assert.equal(result.ok, false);
  assert.equal(result.code, "NO_PLACES_SELECTED");
  assert.equal(result.feasibility, "impossible");
  assert(result.feasibility_reasons[0].includes("先选择"));
});
