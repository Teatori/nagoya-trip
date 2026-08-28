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

const [placesData, restaurantsData, tripConfig, areasData, transitData] = await Promise.all([
  readJson("data/places.json"), readJson("data/restaurants.json"), readJson("data/trip-config.json"),
  readJson("data/areas.json"), readJson("data/transit-edges.json")
]);
const data = { places: placesData.places, restaurants: restaurantsData.restaurants, tripConfig, areas: areasData.areas, transitEdges: transitData.edges };

function analyze({ date = "2026-09-02", duration = "most_day", pace = "normal", ids = [], restaurantIds = [], startTime = "09:00", originId = "nagoya-station", departureDay = false, routeEndDeadline = null }) {
  return planner.analyze(planner.createRequest({ date, duration, pace, startTime, originId, isDepartureDay: departureDay, routeEndDeadline, selectedPlaceIds: ids, selectedRestaurantIds: restaurantIds }), data);
}

test("4B CASE 1：热田正式顺序、正式segment与午餐", () => {
  const result = analyze({ ids: ["atsuta-jingu", "shirotori-garden"] });
  assert.equal(result.detailed_route_status, "generated");
  assert.deepEqual(new Set(result.ordered_stops.filter((item) => item.stop_type === "place").map((item) => item.id)), new Set(["atsuta-jingu", "shirotori-garden"]));
  assert(result.segments.some((item) => item.mode === "walk" && [item.origin_id, item.destination_id].some((id) => ["atsuta-jingu", "shirotori-garden"].includes(id))));
  assert(result.arranged_restaurants.some((item) => item.meal_type === "lunch" && item.selection_type === "system_suggested"));
});

test("4B CASE 2：9/1所选蓬莱轩关闭并自动给热田替代", () => {
  const result = analyze({ date: "2026-09-01", ids: ["atsuta-jingu", "shirotori-garden"], restaurantIds: ["lunch-atsuta-horaiken-jingu"] });
  assert(result.unarranged_restaurants.some((item) => item.restaurant_id === "lunch-atsuta-horaiken-jingu" && item.reason_code === "date_closed"));
  assert(result.arranged_restaurants.some((item) => item.restaurant_id === "lunch-miyakishimen-jingu" && item.selection_type === "system_suggested"));
});

test("4B CASE 3：9/2蓬莱轩可加入且显示高排队提醒", () => {
  const result = analyze({ ids: ["atsuta-jingu", "shirotori-garden"], restaurantIds: ["lunch-atsuta-horaiken-jingu"] });
  const meal = result.arranged_restaurants.find((item) => item.restaurant_id === "lunch-atsuta-horaiken-jingu");
  assert(meal);
  assert.equal(meal.queue_level, "very_high");
  assert(meal.cautions.some((item) => item.includes("候位") || item.includes("排队")));
});

test("4B CASE 4：栄三点以步行为主，不地铁绕行", () => {
  const result = analyze({ duration: "full_day", ids: ["oasis21", "hisaya-odori-park", "mirai-tower"] });
  const internal = result.segments.filter((item) => !item.origin_id.startsWith("hotel-") && !item.destination_id.startsWith("hotel-"));
  assert(internal.length >= 2);
  assert(internal.every((item) => item.mode === "walk"));
});

test("4B CASE 5：名古屋城后接德川园与德川美术馆", () => {
  const result = analyze({ duration: "full_day", ids: ["nagoya-castle", "tokugawa-garden", "tokugawa-art"] });
  const order = result.ordered_stops.filter((item) => item.stop_type === "place").map((item) => item.id);
  assert.equal(order[0], "nagoya-castle");
  assert.deepEqual(new Set(order.slice(1)), new Set(["tokugawa-garden", "tokugawa-art"]));
  assert(result.segments.some((item) => item.operator_id === "transport-meguru" || item.steps.some((step) => step.operator_id === "transport-meguru")));
});

test("4B CASE 6：犬山使用名铁往返、内部步行并提示陡楼梯", () => {
  const result = analyze({ ids: ["inuyama-castle", "inuyama-castle-town", "sanko-inari"] });
  assert(result.segments.some((item) => item.operator_id === "transport-meitetsu-inuyama" && item.fare_yen === 630));
  assert(result.segments.filter((item) => item.origin_id !== "hotel-nagoya-marriott-associa" && item.destination_id !== "hotel-nagoya-marriott-associa").some((item) => item.mode === "walk"));
  assert(result.ordered_stops.find((item) => item.id === "inuyama-castle").cautions.some((item) => item.includes("陡")));
});

test("4B CASE 7：水族馆使用专程地铁并插入Arribada午餐", () => {
  const result = analyze({ duration: "full_day", ids: ["nagoya-aquarium"] });
  assert(result.segments.some((item) => item.operator_id === "transport-nagoya-subway" && item.fare_yen === 270));
  assert(result.arranged_restaurants.some((item) => item.restaurant_id === "lunch-arribada-aquarium"));
});

test("4B CASE 8：铁道馆使用Aonami正式时间与票价", () => {
  const result = analyze({ ids: ["scmaglev"] });
  const outbound = result.segments.find((item) => item.destination_id === "scmaglev");
  assert.equal(outbound.operator_id, "transport-aonami-line");
  assert.equal(outbound.fare_yen, 360);
  assert.equal(outbound.estimated_minutes, 30);
  assert.notEqual(outbound.reference_quality, "fallback_estimate");
});

test("4B CASE 9：跨区8景点先由4A裁剪再正式排序", () => {
  const ids = ["atsuta-jingu", "shirotori-garden", "oasis21", "mirai-tower", "nagoya-castle", "nagoya-aquarium", "inuyama-castle", "scmaglev"];
  const result = analyze({ duration: "half_day", pace: "easy", ids });
  assert(result.recommended_subset.length < ids.length);
  assert.equal(result.ordered_stops.filter((item) => item.stop_type === "place").length, result.recommended_subset.length);
});

test("4B CASE 10：两家午餐只安排一家，另一家保留备选", () => {
  const result = analyze({ ids: ["atsuta-jingu", "shirotori-garden"], restaurantIds: ["lunch-miyakishimen-jingu", "lunch-atsuta-horaiken-jingu"] });
  assert.equal(result.arranged_restaurants.filter((item) => item.meal_type === "lunch").length, 1);
  assert(result.restaurant_alternatives.some((item) => ["lunch-miyakishimen-jingu", "lunch-atsuta-horaiken-jingu"].includes(item.restaurant_id)));
});

test("4B CASE 11：跨区域所选餐厅不造成大绕路", () => {
  const result = analyze({ ids: ["atsuta-jingu", "shirotori-garden"], restaurantIds: ["lunch-matsunoya-inuyama"] });
  assert(result.unarranged_restaurants.some((item) => item.restaurant_id === "lunch-matsunoya-inuyama" && item.reason_code === "area_conflict"));
  assert(!result.ordered_stops.some((item) => item.id === "lunch-matsunoya-inuyama"));
});

test("4B CASE 12：9/4犬山全天明确离境日风险且不宣称安全", () => {
  const result = analyze({ date: "2026-09-04", duration: "full_day", ids: ["inuyama-castle", "inuyama-castle-town", "sanko-inari"], departureDay: true });
  assert.equal(result.feasibility, "poor");
  assert.equal(result.departure_day.route_end_deadline, null);
  assert(result.route_warnings.some((item) => item.includes("不代表后续行程绝对安全")));
});

test("4B泛化：用户填写离境日结束时间后参与结果判断", () => {
  const result = analyze({ date: "2026-10-15", duration: "full_day", ids: ["inuyama-castle", "inuyama-castle-town", "sanko-inari"], departureDay: true, routeEndDeadline: "14:00" });
  assert.equal(result.departure_day.is_departure_day, true);
  assert.equal(result.departure_day.route_end_deadline, "14:00");
  assert(result.feasibility_reasons.some((item) => item.includes("14:00")));
});
