import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function assertUniqueIds(records, label) {
  const ids = records.map((record) => record.id);
  assert(ids.every(Boolean), `${label}: 存在空 id`);
  assert(new Set(ids).size === ids.length, `${label}: id 不唯一`);
}

function assertStatuses(records, label, allowedStatuses) {
  records.forEach((record) => {
    assert(
      allowedStatuses.includes(record.record_status),
      `${label}/${record.id}: 非法 record_status ${record.record_status}`
    );
  });
}

function assertEvidence(block, label, knownSourceIds) {
  assert(block && typeof block === "object", `${label}: 缺少字段块`);
  assert(Array.isArray(block.source_ids), `${label}: 缺少 source_ids[]`);
  assert(Object.hasOwn(block, "verified_at"), `${label}: 缺少 verified_at`);
  block.source_ids.forEach((sourceId) => {
    assert(knownSourceIds.has(sourceId), `${label}: 未知 source id ${sourceId}`);
  });
}

function assertRatings(ratings, label, knownSourceIds) {
  assertEvidence(ratings.recommendation, `${label}/ratings/recommendation`, knownSourceIds);
  for (const groupName of ["domestic", "japan_local", "overseas"]) {
    const group = ratings[groupName];
    assertEvidence(group, `${label}/ratings/${groupName}`, knownSourceIds);
    assert(Object.hasOwn(group, "score"), `${label}/ratings/${groupName}: 缺少 score`);
    assert(Object.hasOwn(group, "scale"), `${label}/ratings/${groupName}: 缺少 scale`);
    assert(Object.hasOwn(group, "review_count"), `${label}/ratings/${groupName}: 缺少 review_count`);
    assert(group.aggregation_method === "none", `${label}/ratings/${groupName}: 不允许跨平台自动平均`);
    assert(Array.isArray(group.entries), `${label}/ratings/${groupName}: 缺少 entries[]`);
    group.entries.forEach((entry, index) => {
      const entryLabel = `${label}/ratings/${groupName}/entries/${index}`;
      assert(typeof entry.platform === "string" && entry.platform, `${entryLabel}: 缺少 platform`);
      for (const field of ["score", "scale", "review_count"]) {
        assert(Object.hasOwn(entry, field), `${entryLabel}: 缺少 ${field}`);
      }
      if (entry.score !== null) assert(entry.checked_at, `${entryLabel}: 已录入评分必须保存 checked_at`);
      assert(entry.score === null || (Number.isFinite(entry.score) && Number.isFinite(entry.scale)), `${entryLabel}: 原始评分必须同时保存 score 与 scale`);
      assertEvidence(entry, entryLabel, knownSourceIds);
    });
  }
}

const [placesData, restaurantsData, transportData, transitData, sourcesData, tripConfig, areasData] = await Promise.all([
  readJson("data/places.json"),
  readJson("data/restaurants.json"),
  readJson("data/transport.json"),
  readJson("data/transit-edges.json"),
  readJson("data/sources.json"),
  readJson("data/trip-config.json"),
  readJson("data/areas.json")
]);

const places = placesData.places;
const restaurants = restaurantsData.restaurants;
const transport = transportData.transport_options;
const transitEdges = transitData.edges;
const sources = sourcesData.sources;
const areas = areasData.areas;

for (const [label, dataset] of [
  ["places", placesData],
  ["restaurants", restaurantsData],
  ["transport", transportData],
  ["transit-edges", transitData],
  ["sources", sourcesData],
  ["trip-config", tripConfig],
  ["areas", areasData]
]) {
  const expectedVersion = ["transport", "transit-edges", "sources", "trip-config"].includes(label) ? "1.2.0" : "1.1.0";
  assert(dataset.schema_version === expectedVersion, `${label}: schema_version 应为 ${expectedVersion}`);
}

assert(Array.isArray(places) && places.length >= 25 && places.length <= 35, "places: 正式候选应控制在 25～35 个");
assert(Array.isArray(restaurants) && restaurants.length >= 8, "restaurants: 缺少第三阶段A早餐候选");
assert(Array.isArray(transport) && transport.length >= 8, "transport: 交通覆盖不完整");
assert(Array.isArray(transitEdges) && transitEdges.length >= 30, "transit-edges: 高频正式连接覆盖不完整");
assert(Array.isArray(sources) && sources.length >= 1, "sources: 缺少统一来源表");
assert(Array.isArray(areas) && areas.length >= 8, "areas: 区域字典覆盖不完整");
assert(tripConfig.dataset_status === "public_route_config", "trip-config: 数据集状态不正确");

assertUniqueIds(places, "places");
assertUniqueIds(restaurants, "restaurants");
assertUniqueIds(transport, "transport");
assertUniqueIds(transitEdges, "transit-edges");
assertUniqueIds(sources, "sources");
assertUniqueIds(areas, "areas");
assertStatuses(places, "places", ["verified_candidate"]);
assertStatuses(restaurants, "restaurants", ["demo_placeholder", "verified_candidate"]);
assertStatuses(transport, "transport", ["researched_transport", "future_scope"]);
assertStatuses(sources, "sources", ["user_provided", "researched_source"]);
assertStatuses(areas, "areas", ["configured_area"]);
assert(!sources.some((source) => /demo|placeholder/.test(source.record_status)), "sources: 正式候选版不得残留Demo或模板占位来源");
assert(!areas.some((area) => /demo|placeholder/.test(area.record_status)), "areas: 正式候选版不得残留区域占位记录");

const sourceIds = new Set(sources.map((source) => source.id));
const placeIds = new Set(places.map((place) => place.id));
const restaurantIds = new Set(restaurants.map((restaurant) => restaurant.id));
for (const [label, records] of [["places", places], ["restaurants", restaurants], ["transport", transport], ["areas", areas]]) {
  records.forEach((record) => {
    (record.source_ids || []).forEach((sourceId) => {
      assert(sourceIds.has(sourceId), `${label}/${record.id}: 未知 source id ${sourceId}`);
    });
  });
}

const areaIds = new Set(areas.map((area) => area.id));
for (const requiredAreaId of [
  "area-meieki",
  "area-castle-tokugawa",
  "area-higashiyama-sakae",
  "area-atsuta",
  "area-fushimi-osu",
  "area-port",
  "area-kinjo-futo",
  "area-inuyama"
]) {
  assert(areaIds.has(requiredAreaId), `areas: 缺少区域 ${requiredAreaId}`);
}

areas.forEach((area) => assertEvidence(area, `areas/${area.id}`, sourceIds));

assert(tripConfig.timezone === "Asia/Tokyo", "trip-config: 时区必须为 Asia/Tokyo");
assert(tripConfig.dataset_status === "public_route_config", "trip-config: 必须为公开通用配置");
assert(!Object.hasOwn(tripConfig, "trip") && !Object.hasOwn(tripConfig, "lodging") && !Object.hasOwn(tripConfig, "flights") && !Object.hasOwn(tripConfig, "departure_day"), "trip-config: 不得保留固定个人行程、住宿或航班配置");
assert(tripConfig.route_options.date_input?.allow_any_valid_date === true, "trip-config: 日期选择必须允许任意有效日期");
assert(tripConfig.departure_day_option?.default_enabled === false, "trip-config: 离境日不得默认启用");
assert(tripConfig.departure_day_option?.route_end_deadline_default === null, "trip-config: 不得预设离境日结束时间");
assert(Array.isArray(tripConfig.route_origins?.options) && tripConfig.route_origins.options.length >= 1, "trip-config: 缺少路线起点");
const routeOriginIds = new Set(tripConfig.route_origins.options.map((origin) => origin.id));
assert(routeOriginIds.has(tripConfig.route_origins.default_id), "trip-config: 默认起点不存在");
assert(tripConfig.route_origins.default_id === "nagoya-station", "trip-config: 默认起点必须为名古屋站");
assert(tripConfig.default_route.origin_id === "nagoya-station", "trip-config: 默认路线起点必须为名古屋站");
assert(tripConfig.default_route.destination_policy === "return_to_origin", "trip-config: 默认路线应返回所选起点");
tripConfig.route_origins.options.forEach((origin) => assert(areaIds.has(origin.area_id), `trip-config: 起点${origin.id}引用未知区域`));
assert(/^\d{2}:\d{2}$/.test(tripConfig.route_options.default_start_time), "trip-config: 默认开始时间格式错误");
assert(Array.isArray(tripConfig.route_options.start_time_options) && tripConfig.route_options.start_time_options.length >= 2, "trip-config: 缺少上午/下午开始选项");
tripConfig.route_options.pace_profiles.forEach((profile) => {
  assert(Number.isFinite(profile.base_buffer_minutes) && profile.base_buffer_minutes >= 0, `trip-config: ${profile.id}缺少基础buffer`);
  assert(Number.isFinite(profile.per_place_buffer_minutes) && profile.per_place_buffer_minutes >= 0, `trip-config: ${profile.id}缺少每景点buffer`);
  assert(profile.visit_duration_rule, `trip-config: ${profile.id}缺少游览时间规则`);
});
for (const durationId of ["half_day", "most_day", "full_day"]) {
  assert(Number.isFinite(tripConfig.route_options.meal_break_minutes[durationId]), `trip-config: ${durationId}缺少用餐buffer`);
}
for (const meal of ["breakfast", "lunch", "dinner"]) {
  assert(/^\d{2}:\d{2}$/.test(tripConfig.route_options.formal_route.meal_target_times[meal]), `trip-config: ${meal}目标时间格式错误`);
  assert(/^\d{2}:\d{2}$/.test(tripConfig.route_options.formal_route.meal_earliest_times[meal]), `trip-config: ${meal}最早时间格式错误`);
  assert(Number.isFinite(tripConfig.route_options.formal_route.meal_stop_minutes[meal]), `trip-config: ${meal}缺少用餐停留时间`);
}
for (const level of ["low", "medium", "high", "very_high"]) assert(Number.isFinite(tripConfig.route_options.formal_route.queue_planning_margin_minutes[level]), `trip-config: 缺少${level}排队规划缓冲`);
tripConfig.route_options.remote_area_ids.forEach((areaId) => assert(areaIds.has(areaId), `trip-config: 未知远郊区域${areaId}`));

for (const place of places) {
  assert(areaIds.has(place.area_id), `${place.id}: 未知 area_id ${place.area_id}`);
  for (const blockName of ["location", "admission", "opening_hours", "trip_date_status", "visit_duration_minutes", "transport_from_hotel"]) {
    assertEvidence(place[blockName], `${place.id}/${blockName}`, sourceIds);
  }
  assert(Number.isFinite(place.location.latitude) && place.location.latitude >= -90 && place.location.latitude <= 90, `${place.id}: 纬度无效`);
  assert(Number.isFinite(place.location.longitude) && place.location.longitude >= -180 && place.location.longitude <= 180, `${place.id}: 经度无效`);
  assert(place.location.address && !place.location.address.includes("Demo"), `${place.id}: 地址仍是 Demo`);
  assert(Array.isArray(place.location.nearest_stations) && place.location.nearest_stations.length > 0, `${place.id}: 缺少最近车站`);
  assert([3, 4, 5].includes(place.ratings.recommendation.stars), `${place.id}: 推荐星级应为 3～5`);
  assert(place.visit_duration_minutes.quick <= place.visit_duration_minutes.recommended, `${place.id}: quick 不得大于 recommended`);
  assert(place.visit_duration_minutes.recommended <= place.visit_duration_minutes.slow, `${place.id}: recommended 不得大于 slow`);
  assert(place.visit_duration_minutes.estimate_type, `${place.id}: 游览时长缺少估算类型`);
  assert(Object.keys(place.trip_date_status.dates || {}).length === 4, `${place.id}: 旅行日期状态不完整`);
  assert(place.links?.official_site_source_id && sourceIds.has(place.links.official_site_source_id), `${place.id}: 缺少可追溯官网`);
  assert(Array.isArray(place.images), `${place.id}: images 必须是数组`);
  assertRatings(place.ratings, place.id, sourceIds);
}

for (const source of sources.filter((item) => item.record_status === "researched_source")) {
  assert(/^https:\/\//.test(source.url), `${source.id}: 正式来源必须使用 https URL`);
  assert(source.retrieved_at, `${source.id}: 缺少 retrieved_at`);
  assert(source.verification && source.verification.status, `${source.id}: 缺少 verification`);
}

const mealTypes = new Set(restaurants.flatMap((restaurant) => restaurant.meal_types));
assert(mealTypes.has("breakfast"), "restaurants: 缺少早餐餐别");

const formalBreakfastRestaurants = restaurants.filter(
  (restaurant) => restaurant.record_status === "verified_candidate" && restaurant.meal_types.includes("breakfast")
);
const formalLunchRestaurants = restaurants.filter(
  (restaurant) => restaurant.record_status === "verified_candidate" && restaurant.meal_types.includes("lunch")
);
const formalDinnerRestaurants = restaurants.filter(
  (restaurant) => restaurant.record_status === "verified_candidate" && restaurant.meal_types.includes("dinner")
);
assert(
  formalBreakfastRestaurants.length >= 6 && formalBreakfastRestaurants.length <= 10,
  `restaurants: 正式早餐候选应为 6～10 家，当前 ${formalBreakfastRestaurants.length} 家`
);
if (["breakfast_and_lunch_researched", "full_meal_library_researched"].includes(restaurantsData.dataset_status)) {
  assert(
    formalLunchRestaurants.length >= 10 && formalLunchRestaurants.length <= 15,
    `restaurants: 正式午餐候选应为 10～15 家，当前 ${formalLunchRestaurants.length} 家`
  );
  assert(restaurants.every((restaurant) => restaurant.record_status !== "demo_placeholder"), "restaurants: 午餐阶段完成后不得残留餐厅Demo");
}
if (restaurantsData.dataset_status === "full_meal_library_researched") {
  const formalMealRestaurants = restaurants.filter(
    (restaurant) => restaurant.record_status === "verified_candidate" && restaurant.meal_types.some((meal) => meal === "lunch" || meal === "dinner")
  );
  assert(formalDinnerRestaurants.length >= 10 && formalDinnerRestaurants.length <= 15, `restaurants: 正式晚餐候选应为 10～15 家，当前 ${formalDinnerRestaurants.length} 家`);
  assert(formalMealRestaurants.length >= 15 && formalMealRestaurants.length <= 20, `restaurants: 正餐总库应为 15～20 家，当前 ${formalMealRestaurants.length} 家`);
}

for (const restaurant of restaurants) {
  assert(areaIds.has(restaurant.area_id), `${restaurant.id}: 未知 area_id ${restaurant.area_id}`);
  assert(Array.isArray(restaurant.cuisine_types) && restaurant.cuisine_types.length > 0, `${restaurant.id}: 缺少 cuisine_types`);
  assert(Array.isArray(restaurant.dish_tags) && restaurant.dish_tags.length > 0, `${restaurant.id}: 缺少 dish_tags`);
  for (const blockName of ["location", "price_per_person", "business_hours", "reservation", "queue"]) {
    assertEvidence(restaurant[blockName], `${restaurant.id}/${blockName}`, sourceIds);
  }
  assertRatings(restaurant.ratings, restaurant.id, sourceIds);
  const hours = restaurant.business_hours;
  assert(hours.service_periods && ["breakfast", "lunch", "dinner"].every((meal) => Array.isArray(hours.service_periods[meal])), `${restaurant.id}: service_periods 必须分餐别`);
  assert(hours.last_orders && ["breakfast", "lunch", "dinner"].every((meal) => Object.hasOwn(hours.last_orders, meal)), `${restaurant.id}: last_orders 必须分餐别`);
  assert(Array.isArray(hours.date_exceptions), `${restaurant.id}: 缺少 date_exceptions[]`);
  assert(restaurant.internal_research?.service_risk, `${restaurant.id}: 缺少隐藏 service_risk`);
  assertEvidence(restaurant.internal_research.service_risk, `${restaurant.id}/internal_research/service_risk`, sourceIds);
  assert(restaurant.signature_dishes.length >= 3 && restaurant.signature_dishes.length <= 10, `${restaurant.id}: 代表菜总数应为 3～10 道`);
  restaurant.signature_dishes.forEach((dish) => {
    assert(["official", "recent_reference", "unknown"].includes(dish.price_type), `${restaurant.id}: 非法 price_type`);
    assert(Object.hasOwn(dish, "verified_at"), `${restaurant.id}/${dish.name_zh}: 缺少 verified_at`);
  });

  if (restaurant.record_status === "verified_candidate") {
    assertEvidence(restaurant.access_from_hotel, `${restaurant.id}/access_from_hotel`, sourceIds);
    assert(Number.isFinite(restaurant.location.latitude) && restaurant.location.latitude >= -90 && restaurant.location.latitude <= 90, `${restaurant.id}: 纬度无效`);
    assert(Number.isFinite(restaurant.location.longitude) && restaurant.location.longitude >= -180 && restaurant.location.longitude <= 180, `${restaurant.id}: 经度无效`);
    assert(restaurant.location.address && !restaurant.location.address.includes("Demo"), `${restaurant.id}: 地址仍是 Demo`);
    assert(Array.isArray(restaurant.location.nearest_stations) && restaurant.location.nearest_stations.length > 0, `${restaurant.id}: 缺少最近车站`);
    assert(Number.isFinite(restaurant.access_from_hotel.duration_minutes), `${restaurant.id}: 缺少从酒店出发时间`);
    assert(Array.isArray(restaurant.access_from_hotel.modes) && restaurant.access_from_hotel.modes.length > 0, `${restaurant.id}: 缺少酒店出发方式`);
    assert([3, 4, 5].includes(restaurant.ratings.recommendation.stars), `${restaurant.id}: 推荐星级应为 3～5`);
    const parentDisplay = restaurant.parent_display;
    assert(parentDisplay && typeof parentDisplay === "object", `${restaurant.id}: 缺少 parent_display`);
    assert(typeof parentDisplay.summary === "string" && parentDisplay.summary.length >= 10 && parentDisplay.summary.length <= 70, `${restaurant.id}: parent_display.summary 长度不合适`);
    assert(typeof parentDisplay.food_focus === "string" && parentDisplay.food_focus.length >= 4, `${restaurant.id}: 缺少 food_focus`);
    assert(Array.isArray(parentDisplay.featured_meals), `${restaurant.id}: featured_meals 必须是数组`);
    parentDisplay.featured_meals.forEach((meal) => {
      assert(restaurant.meal_types.includes(meal), `${restaurant.id}: featured_meals 包含未供应餐别 ${meal}`);
    });
    assert(parentDisplay.featured_meals.length === 0 || (typeof parentDisplay.featured_reason === "string" && parentDisplay.featured_reason), `${restaurant.id}: 优先推荐必须说明 featured_reason`);
    assert(Array.isArray(parentDisplay.badges) && parentDisplay.badges.length >= 1 && parentDisplay.badges.length <= 4, `${restaurant.id}: badges 应为1～4个`);
    assert(Array.isArray(parentDisplay.cautions), `${restaurant.id}: cautions 必须是数组`);
    parentDisplay.cautions.forEach((caution, index) => {
      assert(["warning", "closed"].includes(caution.tone), `${restaurant.id}/cautions/${index}: 非法 tone`);
      assert(typeof caution.text === "string" && caution.text, `${restaurant.id}/cautions/${index}: 缺少提醒文案`);
      assert(Array.isArray(caution.meal_types) && caution.meal_types.length > 0, `${restaurant.id}/cautions/${index}: 缺少 meal_types`);
      caution.meal_types.forEach((meal) => assert(restaurant.meal_types.includes(meal), `${restaurant.id}/cautions/${index}: 提醒餐别不属于该店`));
    });
    assert(parentDisplay.scene_hint === null || typeof parentDisplay.scene_hint === "string", `${restaurant.id}: scene_hint 必须为字符串或null`);
    assert(parentDisplay.default_dish_names_by_meal && typeof parentDisplay.default_dish_names_by_meal === "object", `${restaurant.id}: 缺少 default_dish_names_by_meal`);
    assert(parentDisplay.display_order_by_meal && typeof parentDisplay.display_order_by_meal === "object", `${restaurant.id}: 缺少 display_order_by_meal`);
    for (const mealType of restaurant.meal_types) {
      assert(
        ["breakfast", "lunch", "dinner"].includes(mealType),
        `${restaurant.id}: 非法 meal_type ${mealType}`
      );
      assert(
        restaurant.business_hours.service_periods[mealType].length > 0,
        `${restaurant.id}: 缺少${mealType}供应时间`
      );
      const mealDishes = restaurant.signature_dishes.filter((dish) => !Array.isArray(dish.meal_types) || dish.meal_types.includes(mealType));
      assert(mealDishes.length >= 3 && mealDishes.length <= 5, `${restaurant.id}: ${mealType}可见代表菜应为3～5道，当前${mealDishes.length}道`);
      const defaultDishes = parentDisplay.default_dish_names_by_meal[mealType];
      assert(Array.isArray(defaultDishes) && defaultDishes.length >= 2 && defaultDishes.length <= 3, `${restaurant.id}: ${mealType}默认代表菜应为2～3道`);
      assert(new Set(defaultDishes).size === defaultDishes.length, `${restaurant.id}: ${mealType}默认代表菜重复`);
      const mealDishNames = new Set(mealDishes.map((dish) => dish.name_zh));
      defaultDishes.forEach((name) => assert(mealDishNames.has(name), `${restaurant.id}: ${mealType}默认代表菜未匹配 signature_dishes: ${name}`));
      assert(Number.isInteger(parentDisplay.display_order_by_meal[mealType]) && parentDisplay.display_order_by_meal[mealType] > 0, `${restaurant.id}: ${mealType}缺少有效展示顺序`);
    }
    assert(restaurant.business_hours.date_exceptions.length === 4, `${restaurant.id}: 旅行日期状态必须覆盖9月1～4日`);
    assert(restaurant.business_hours.date_exceptions.every((item) => /^2026-09-0[1-4]$/.test(item.date)), `${restaurant.id}: 旅行日期状态范围错误`);
    assert(Array.isArray(restaurant.images), `${restaurant.id}: images 必须是数组`);
    assert(restaurant.last_information_verified_at, `${restaurant.id}: 缺少最后核实日期`);

    if (restaurant.meal_types.includes("lunch")) {
      assert(restaurant.domestic_research_status === "pending_manual_xiaohongshu", `${restaurant.id}: 小红书待补状态不明确`);
      assert(Array.isArray(restaurant.nearby_place_ids) && restaurant.nearby_place_ids.length > 0, `${restaurant.id}: 午餐缺少 nearby_place_ids`);
      assert(Array.isArray(restaurant.access_from_nearby_places) && restaurant.access_from_nearby_places.length > 0, `${restaurant.id}: 午餐缺少附近景点步行信息`);
      restaurant.nearby_place_ids.forEach((placeId) => {
        assert(placeIds.has(placeId), `${restaurant.id}: 未知 nearby_place_id ${placeId}`);
      });
      restaurant.access_from_nearby_places.forEach((access, index) => {
        assert(placeIds.has(access.place_id), `${restaurant.id}/access_from_nearby_places/${index}: 未知 place_id`);
        assert(Number.isFinite(access.walking_minutes), `${restaurant.id}/access_from_nearby_places/${index}: 缺少步行分钟`);
        assertEvidence(access, `${restaurant.id}/access_from_nearby_places/${index}`, sourceIds);
      });
      assert(["low", "medium", "high", "very_high"].includes(restaurant.queue.level), `${restaurant.id}: 非法午餐排队等级`);
      assert(typeof restaurant.reservation.lunch_reservation_status === "string", `${restaurant.id}: 缺少午餐预约状态`);
    }
    if (restaurant.meal_types.includes("dinner")) {
      assert(restaurant.domestic_research_status === "pending_manual_xiaohongshu", `${restaurant.id}: 晚餐小红书待补状态不明确`);
      assert(restaurant.price_per_person.by_meal?.dinner, `${restaurant.id}: 缺少独立晚餐预算`);
      assert(restaurant.reservation.by_meal?.dinner, `${restaurant.id}: 缺少独立晚餐预约规则`);
      assert(restaurant.queue.by_meal?.dinner, `${restaurant.id}: 缺少独立晚餐排队信息`);
      assertEvidence(restaurant.price_per_person.by_meal.dinner, `${restaurant.id}/price_per_person/by_meal/dinner`, sourceIds);
      assertEvidence(restaurant.reservation.by_meal.dinner, `${restaurant.id}/reservation/by_meal/dinner`, sourceIds);
      assertEvidence(restaurant.queue.by_meal.dinner, `${restaurant.id}/queue/by_meal/dinner`, sourceIds);
      assert(restaurant.business_hours.display_text_by_meal?.dinner, `${restaurant.id}: 缺少晚餐营业时间展示`);
      assert(restaurant.dining_environment?.display_text, `${restaurant.id}: 缺少晚餐环境提示`);
    }
  }
}

const lunchOnlyRestaurants = restaurants.filter((restaurant) => restaurant.meal_types.includes("lunch") && !restaurant.meal_types.includes("dinner"));
const lunchDinnerRestaurants = restaurants.filter((restaurant) => restaurant.meal_types.includes("lunch") && restaurant.meal_types.includes("dinner"));
const dinnerOnlyRestaurants = restaurants.filter((restaurant) => !restaurant.meal_types.includes("lunch") && restaurant.meal_types.includes("dinner"));
assert(formalBreakfastRestaurants.length === 8, `restaurants: 早餐总数应保持8家，当前${formalBreakfastRestaurants.length}家`);
assert(lunchOnlyRestaurants.length === 5, `restaurants: 仅午餐应保持5家，当前${lunchOnlyRestaurants.length}家`);
assert(lunchDinnerRestaurants.length === 7, `restaurants: 午晚餐共用应保持7家，当前${lunchDinnerRestaurants.length}家`);
assert(dinnerOnlyRestaurants.length === 6, `restaurants: 仅晚餐应保持6家，当前${dinnerOnlyRestaurants.length}家`);

for (const meal of ["breakfast", "lunch", "dinner"]) {
  const mealRestaurants = restaurants.filter((restaurant) => restaurant.meal_types.includes(meal));
  const orders = mealRestaurants.map((restaurant) => restaurant.parent_display.display_order_by_meal[meal]);
  assert(new Set(orders).size === orders.length, `restaurants: ${meal}展示顺序重复`);
  const featuredCount = mealRestaurants.filter((restaurant) => restaurant.parent_display.featured_meals.includes(meal)).length;
  const [min, max] = meal === "breakfast" ? [3, 4] : [5, 6];
  assert(featuredCount >= min && featuredCount <= max, `restaurants: ${meal}优先推荐应为${min}～${max}家，当前${featuredCount}家`);
}

for (const item of transport.filter((option) => option.record_status === "researched_transport")) {
  for (const blockName of ["reference_fare", "ic_card", "purchase", "boarding"]) {
    assertEvidence(item[blockName], `${item.id}/${blockName}`, sourceIds);
  }
  for (const sourceId of Object.values(item.links || {}).filter(Boolean)) assert(sourceIds.has(sourceId), `${item.id}: links引用未知来源 ${sourceId}`);
}

const transportIds = new Set(transport.map((item) => item.id));
const transitNodeIds = new Set([...tripConfig.route_origins.options.map((origin) => origin.transit_node_ref), ...placeIds, ...restaurantIds, ...(transitData.nodes || []).map((node) => node.id)]);
const allowedModes = new Set(["walk", "subway", "train", "city_bus", "sightseeing_bus"]);
const edgePairs = new Set();
for (const edge of transitEdges) {
  assert(transitNodeIds.has(edge.origin_id), `${edge.id}: 未知 origin_id ${edge.origin_id}`);
  assert(transitNodeIds.has(edge.destination_id), `${edge.id}: 未知 destination_id ${edge.destination_id}`);
  assert(edge.origin_id !== edge.destination_id, `${edge.id}: 起终点不得相同`);
  const pairKey = `${edge.origin_id}->${edge.destination_id}`;
  assert(!edgePairs.has(pairKey), `${edge.id}: 重复edge ${pairKey}`);
  edgePairs.add(pairKey);
  assert(Array.isArray(edge.options) && edge.options.length >= 1, `${edge.id}: 缺少options`);
  for (const option of edge.options) {
    assert(allowedModes.has(option.mode), `${edge.id}/${option.id}: 非法mode ${option.mode}`);
    assert(Number.isFinite(option.estimated_minutes) && option.estimated_minutes > 0 && option.estimated_minutes <= 180, `${edge.id}/${option.id}: 时间不合理`);
    assert(Number.isFinite(option.walking_minutes) && option.walking_minutes >= 0 && option.walking_minutes <= option.estimated_minutes, `${edge.id}/${option.id}: 步行分钟不合理`);
    assert(Number.isFinite(option.fare_yen) && option.fare_yen >= 0, `${edge.id}/${option.id}: 票价必须为非负数字`);
    assert(option.operator_id === null || transportIds.has(option.operator_id), `${edge.id}/${option.id}: 未知operator ${option.operator_id}`);
    assert(Array.isArray(option.source_ids) && option.source_ids.length > 0, `${edge.id}/${option.id}: 缺少source_ids`);
    option.source_ids.forEach((sourceId) => assert(sourceIds.has(sourceId), `${edge.id}/${option.id}: 未知source ${sourceId}`));
    if (option.official_timetable_source_id) assert(sourceIds.has(option.official_timetable_source_id), `${edge.id}/${option.id}: 未知时刻表来源`);
    assert(/^\d{4}-\d{2}-\d{2}$/.test(option.verified_at), `${edge.id}/${option.id}: verified_at格式错误`);
  }
}

console.log(`数据验证通过：1 份旅行配置、${areas.length} 区域、${places.length} 景点、${formalBreakfastRestaurants.length} 家正式早餐、${formalLunchRestaurants.length} 家正式午餐、${formalDinnerRestaurants.length} 家正式晚餐、${restaurants.filter((item) => item.record_status === "demo_placeholder").length} 条餐厅 Demo、${transport.length} 交通方式、${transitEdges.length} 条正式交通连接、${sources.length} 来源。`);
