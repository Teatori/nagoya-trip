(function () {
  "use strict";

  const STORAGE_KEYS = {
    selections: "nagoya-trip.selections.v1",
    fontSize: "nagoya-trip.font-size.v1"
  };

  const FONT_SCALES = {
    default: "1",
    large: "1.12",
    xlarge: "1.24"
  };

  const MEAL_LABELS = {
    breakfast: "早餐",
    lunch: "午餐",
    dinner: "晚餐"
  };

  const DURATION_LABELS = {
    half_day: "半天",
    most_day: "大半天",
    full_day: "一整天"
  };

  const PACE_LABELS = {
    easy: "少走路",
    normal: "普通",
    active: "多逛几个"
  };

  const state = {
    places: [],
    restaurants: [],
    transport: [],
    transitEdges: [],
    transitNodes: [],
    sources: [],
    tripConfig: {},
    areas: [],
    selection: loadSelection(),
    fontSize: localStorage.getItem(STORAGE_KEYS.fontSize) || "default",
    browseMode: "area",
    activeArea: "全部区域",
    activeTag: "推荐",
    activeMeal: "breakfast",
    restaurantFilters: {
      area: "all",
      localOnly: false,
      easyOnly: false
    }
  };

  const elements = {};
  let statusTimer;

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    applyFontSize(state.fontSize, false);

    try {
      const [placesData, restaurantsData, transportData, transitData, sourcesData, tripConfig, areasData] = await Promise.all([
        fetchJson("data/places.json"),
        fetchJson("data/restaurants.json"),
        fetchJson("data/transport.json"),
        fetchJson("data/transit-edges.json"),
        fetchJson("data/sources.json"),
        fetchJson("data/trip-config.json"),
        fetchJson("data/areas.json")
      ]);

      state.places = placesData.places || [];
      state.restaurants = restaurantsData.restaurants || [];
      state.transport = transportData.transport_options || [];
      state.transitEdges = transitData.edges || [];
      state.transitNodes = transitData.nodes || [];
      state.sources = sourcesData.sources || [];
      state.tripConfig = tripConfig;
      state.areas = areasData.areas || [];

      sanitizeSelection();
      configureRouteForm();
      renderAll();
    } catch (error) {
      console.error(error);
      elements.placesList.innerHTML = `
        <div class="empty-state">
          <h3>景点数据读取失败</h3>
          <p>请刷新页面重试；如果仍然失败，请稍后再打开。</p>
        </div>`;
      showStatus("暂时无法读取旅行数据，请刷新后重试。", 6000);
    }
  }

  function cacheElements() {
    elements.status = document.getElementById("status-message");
    elements.selectionCount = document.getElementById("selection-count");
    elements.placesList = document.getElementById("places-list");
    elements.featuredRestaurantsList = document.getElementById("featured-restaurants-list");
    elements.restaurantsList = document.getElementById("restaurants-list");
    elements.moreRestaurants = document.getElementById("more-restaurants");
    elements.moreRestaurantsCount = document.getElementById("more-restaurants-count");
    elements.restaurantsSummary = document.getElementById("restaurants-result-summary");
    elements.restaurantAreaFilter = document.getElementById("restaurant-area-filter");
    elements.restaurantLocalFilter = document.getElementById("restaurant-local-filter");
    elements.restaurantEasyFilter = document.getElementById("restaurant-easy-filter");
    elements.transportList = document.getElementById("transport-list");
    elements.areaButtons = document.getElementById("area-filter-buttons");
    elements.tagButtons = document.getElementById("tag-filter-buttons");
    elements.areaFilters = document.getElementById("area-filters");
    elements.recommendationFilters = document.getElementById("recommendation-filters");
    elements.placesSummary = document.getElementById("places-result-summary");
    elements.restaurantTitle = document.getElementById("restaurant-view-title");
    elements.selectedEmpty = document.getElementById("selected-empty");
    elements.selectedContent = document.getElementById("selected-content");
    elements.selectedPlaces = document.getElementById("selected-places-list");
    elements.selectedRestaurants = document.getElementById("selected-restaurants-list");
    elements.routeForm = document.getElementById("route-form");
    elements.routeResult = document.getElementById("route-result");
    elements.routeDate = document.getElementById("route-date");
    elements.routeDepartureDay = document.getElementById("route-departure-day");
    elements.routeDeadlineField = document.getElementById("route-deadline-field");
    elements.routeEndDeadline = document.getElementById("route-end-deadline");
  }

  function bindEvents() {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => switchView(button.dataset.view));
    });

    document.querySelectorAll("[data-font-size]").forEach((button) => {
      button.addEventListener("click", () => applyFontSize(button.dataset.fontSize, true));
    });

    document.querySelectorAll("[data-browse-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.browseMode = button.dataset.browseMode;
        document.querySelectorAll("[data-browse-mode]").forEach((item) => {
          item.classList.toggle("is-active", item === button);
        });
        elements.areaFilters.hidden = state.browseMode !== "area";
        elements.recommendationFilters.hidden = state.browseMode !== "recommendation";
        renderPlaces();
      });
    });

    elements.placesList.addEventListener("click", handleSelectionClick);
    elements.featuredRestaurantsList.addEventListener("click", handleSelectionClick);
    elements.restaurantsList.addEventListener("click", handleSelectionClick);
    elements.restaurantAreaFilter.addEventListener("change", () => {
      state.restaurantFilters.area = elements.restaurantAreaFilter.value;
      renderRestaurants();
    });
    elements.restaurantLocalFilter.addEventListener("change", () => {
      state.restaurantFilters.localOnly = elements.restaurantLocalFilter.checked;
      renderRestaurants();
    });
    elements.restaurantEasyFilter.addEventListener("change", () => {
      state.restaurantFilters.easyOnly = elements.restaurantEasyFilter.checked;
      renderRestaurants();
    });
    elements.selectedPlaces.addEventListener("click", handleSelectionClick);
    elements.selectedRestaurants.addEventListener("click", handleSelectionClick);
    document.getElementById("clear-selection").addEventListener("click", clearSelection);
    document.getElementById("copy-selection").addEventListener("click", copySelection);
    elements.routeForm.addEventListener("submit", handleRouteAnalysis);
    elements.routeDepartureDay.addEventListener("change", toggleDepartureDayFields);
  }

  async function fetchJson(path) {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
    return response.json();
  }

  function loadSelection() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEYS.selections));
      return {
        placeIds: Array.isArray(parsed?.placeIds) ? parsed.placeIds : [],
        restaurantIds: Array.isArray(parsed?.restaurantIds) ? parsed.restaurantIds : []
      };
    } catch {
      return { placeIds: [], restaurantIds: [] };
    }
  }

  function sanitizeSelection() {
    const placeIds = new Set(state.places.map((item) => item.id));
    const restaurantIds = new Set(state.restaurants.map((item) => item.id));
    state.selection.placeIds = state.selection.placeIds.filter((id) => placeIds.has(id));
    state.selection.restaurantIds = state.selection.restaurantIds.filter((id) => restaurantIds.has(id));
    saveSelection();
  }

  function configureRouteForm() {
    if (!elements.routeDate.value) elements.routeDate.value = todayInTokyo();
    toggleDepartureDayFields();
  }

  function toggleDepartureDayFields() {
    const enabled = elements.routeDepartureDay.checked;
    elements.routeDeadlineField.hidden = !enabled;
    elements.routeEndDeadline.disabled = !enabled;
    if (!enabled) elements.routeEndDeadline.value = "";
  }

  function saveSelection() {
    localStorage.setItem(STORAGE_KEYS.selections, JSON.stringify(state.selection));
  }

  function applyFontSize(size, announce) {
    const validSize = Object.hasOwn(FONT_SCALES, size) ? size : "default";
    state.fontSize = validSize;
    document.documentElement.style.setProperty("--font-scale", FONT_SCALES[validSize]);
    localStorage.setItem(STORAGE_KEYS.fontSize, validSize);
    document.querySelectorAll("[data-font-size]").forEach((button) => {
      const active = button.dataset.fontSize === validSize;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-pressed", String(active));
    });
    if (announce) showStatus(validSize === "default" ? "已恢复默认字号。" : "字号已放大并保存。")
  }

  function renderAll() {
    renderFilters();
    renderPlaces();
    renderRestaurants();
    renderTransport();
    renderSelected();
  }

  function renderFilters() {
    const areas = ["全部区域", ...new Set(state.places.map((item) => item.area))];
    elements.areaButtons.innerHTML = areas.map((area) => filterButton(area, "area", area === state.activeArea)).join("");
    elements.areaButtons.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeArea = button.dataset.filterValue;
        renderFilters();
        renderPlaces();
      });
    });

    const preferredTags = ["推荐", "景色", "室内", "避暑", "少走路", "历史", "公园 / 植物园", "购物", "免费", "拍照", "晚上"];
    const availableTags = new Set(state.places.flatMap((item) => item.tags || []));
    const tags = preferredTags.filter((tag) => availableTags.has(tag));
    elements.tagButtons.innerHTML = tags.map((tag) => filterButton(tag, "tag", tag === state.activeTag)).join("");
    elements.tagButtons.querySelectorAll("button").forEach((button) => {
      button.addEventListener("click", () => {
        state.activeTag = button.dataset.filterValue;
        renderFilters();
        renderPlaces();
      });
    });
  }

  function filterButton(label, type, active) {
    return `<button type="button" class="${active ? "is-active" : ""}" data-filter-type="${type}" data-filter-value="${escapeHtml(label)}" aria-pressed="${active}">${escapeHtml(label)}</button>`;
  }

  function renderPlaces() {
    const filtered = state.places.filter((place) => {
      if (state.browseMode === "area") {
        return state.activeArea === "全部区域" || place.area === state.activeArea;
      }
      return (place.tags || []).includes(state.activeTag);
    });

    const label = state.browseMode === "area" ? state.activeArea : state.activeTag;
    elements.placesSummary.textContent = `${label}：共 ${filtered.length} 个正式候选景点`;
    elements.placesList.innerHTML = filtered.map(renderPlaceCard).join("") || renderNoResult("没有符合当前筛选的景点。");
  }

  function renderPlaceCard(place) {
    const selected = state.selection.placeIds.includes(place.id);
    const duration = place.visit_duration_minutes || {};
    const transit = place.transport_from_hotel || {};
    const tripStatus = place.trip_date_status || {};
    const image = (place.images || []).find((item) => item.url);
    const officialUrl = getVerifiedSourceUrl(place.links?.official_site_source_id);
    const mapLinks = window.NagoyaMaps?.buildLocationLinks({ name: place.names?.ja || place.names?.en, address: place.location?.address }) || {};
    const fare = transit.one_way_fare?.amount;
    return `
      <article class="item-card">
        ${image ? `<img class="place-image" src="${escapeHtml(image.url)}" alt="${escapeHtml(image.alt_zh || place.names?.zh)}" loading="lazy">` : ""}
        <div class="card-topline">
          <div>
            <h3>${escapeHtml(place.names?.zh || place.id)}</h3>
            <span>${escapeHtml(place.area || "待定区域")}</span>
          </div>
          <span class="candidate-badge">正式候选</span>
        </div>
        <div class="tags">${(place.tags || []).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        ${renderRatings(place.ratings)}
        <dl class="fact-list">
          <div><dt>门票</dt><dd>${escapeHtml(place.admission?.display_text || "待确认")}</dd></div>
          <div><dt>游览时间</dt><dd>${duration.recommended ? `${duration.quick} / ${duration.recommended} / ${duration.slow} 分钟（快 / 建议 / 慢，参考估算）` : "待确认"}</dd></div>
          <div><dt>开放 / 休馆</dt><dd>${escapeHtml(place.opening_hours?.display_text || "待确认")}</dd></div>
          <div><dt>名古屋站出发</dt><dd>${transit.duration_minutes ? `约 ${transit.duration_minutes} 分钟 · 单程${fare === 0 ? "步行免费" : `约 ${fare} 日元`}` : "待确认"}</dd></div>
          <div><dt>参考交通</dt><dd>${escapeHtml(generalizeStationReference(transit.reference_route_text) || "待确认")}</dd></div>
          <div><dt>步行强度</dt><dd>${escapeHtml(place.parent_access?.walking_intensity || "待确认")}</dd></div>
          <div><dt>炎热天气</dt><dd>${escapeHtml(heatLabel(place.parent_access?.heat_suitability))} · ${escapeHtml(place.parent_access?.heat_notes || "待确认")}</dd></div>
        </dl>
        ${tripStatus.summary_zh ? `<p class="trip-alert ${tripStatus.status === "closed_on_some_dates" || tripStatus.status === "open_with_area_closures" ? "is-warning" : ""}"><strong>已研究日期参考：</strong>${escapeHtml(generalizeResearchDateSummary(tripStatus.summary_zh))}</p>` : ""}
        <details class="place-details">
          <summary>查看地址与无障碍提醒</summary>
          <p><strong>地址：</strong>${escapeHtml(place.location?.address || "待确认")}</p>
          <p><strong>最近车站：</strong>${escapeHtml((place.location?.nearest_stations || []).join("、") || "待确认")}</p>
          <p><strong>无障碍 / 楼梯：</strong>${escapeHtml(place.parent_access?.barrier_free_notes || "待确认")}</p>
          <p>${escapeHtml(place.summary_zh || "")}</p>
        </details>
        <div class="place-links" aria-label="景点链接">
          ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">官网 / 详情</a>` : `<span class="link-pending">官网待复核</span>`}
          ${mapLinks.amap ? `<a href="${escapeHtml(mapLinks.amap)}" target="_blank" rel="noopener noreferrer">高德地图</a>` : ""}
          ${mapLinks.google_maps ? `<a href="${escapeHtml(mapLinks.google_maps)}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ""}
        </div>
        <button type="button" class="select-button ${selected ? "is-selected" : ""}" data-select-type="place" data-select-id="${escapeHtml(place.id)}" aria-pressed="${selected}">
          ${selected ? "✓ 已想去（点此取消）" : "想去"}
        </button>
      </article>`;
  }

  function renderRestaurants() {
    const openMore = elements.moreRestaurants.open;
    const openDetails = new Set([
      ...elements.featuredRestaurantsList.querySelectorAll("details[data-restaurant-details][open]"),
      ...elements.restaurantsList.querySelectorAll("details[data-restaurant-details][open]")
    ].map((details) => details.dataset.restaurantDetails));
    const mealRestaurants = state.restaurants.filter((restaurant) => (restaurant.meal_types || []).includes(state.activeMeal));
    renderRestaurantAreaOptions(mealRestaurants);
    const restaurants = mealRestaurants
      .filter(matchesRestaurantFilters)
      .sort((a, b) => restaurantDisplayOrder(a) - restaurantDisplayOrder(b));
    const featured = restaurants.filter((restaurant) => (restaurant.parent_display?.featured_meals || []).includes(state.activeMeal));
    const more = restaurants.filter((restaurant) => !(restaurant.parent_display?.featured_meals || []).includes(state.activeMeal));
    const formalCount = mealRestaurants.filter((restaurant) => restaurant.record_status === "verified_candidate").length;
    elements.restaurantTitle.textContent = formalCount
      ? `${MEAL_LABELS[state.activeMeal]}餐厅 · ${formalCount} 家正式候选`
      : `${MEAL_LABELS[state.activeMeal]}餐厅 · 暂无候选`;
    elements.restaurantsSummary.textContent = restaurants.length === mealRestaurants.length
      ? `共 ${restaurants.length} 家；先看 ${featured.length} 家优先推荐`
      : `筛选后 ${restaurants.length} 家；其中 ${featured.length} 家优先推荐`;
    elements.featuredRestaurantsList.innerHTML = featured.map(renderRestaurantCard).join("") || renderNoResult("当前筛选下没有优先推荐，可查看更多选择。");
    elements.restaurantsList.innerHTML = more.map(renderRestaurantCard).join("") || renderNoResult("当前筛选下没有更多餐厅。");
    elements.moreRestaurantsCount.textContent = `${more.length} 家`;
    elements.moreRestaurants.open = openMore && more.length > 0;
    openDetails.forEach((id) => {
      document.querySelectorAll(`details[data-restaurant-details="${CSS.escape(id)}"]`).forEach((details) => {
        details.open = true;
      });
    });
  }

  function renderRestaurantAreaOptions(restaurants) {
    const areas = [...new Set(restaurants.map((restaurant) => restaurant.area).filter(Boolean))];
    if (state.restaurantFilters.area !== "all" && !areas.includes(state.restaurantFilters.area)) {
      state.restaurantFilters.area = "all";
    }
    elements.restaurantAreaFilter.innerHTML = ["all", ...areas].map((area) => `
      <option value="${escapeHtml(area)}" ${area === state.restaurantFilters.area ? "selected" : ""}>
        ${area === "all" ? "全部区域" : escapeHtml(area)}
      </option>`).join("");
    elements.restaurantLocalFilter.checked = state.restaurantFilters.localOnly;
    elements.restaurantEasyFilter.checked = state.restaurantFilters.easyOnly;
  }

  function matchesRestaurantFilters(restaurant) {
    if (state.restaurantFilters.area !== "all" && restaurant.area !== state.restaurantFilters.area) return false;
    if (state.restaurantFilters.localOnly && !(restaurant.parent_display?.badges || []).includes("名古屋特色")) return false;
    if (state.restaurantFilters.easyOnly) {
      const queue = getMealValue(restaurant.queue, state.activeMeal);
      const reservation = getMealValue(restaurant.reservation, state.activeMeal);
      const peakWait = queue?.estimated_wait_minutes?.peak;
      if (queue?.level !== "low" && !(Number.isFinite(peakWait) && peakWait <= 15) && !reservation?.recommended) return false;
    }
    return true;
  }

  function restaurantDisplayOrder(restaurant) {
    return restaurant.parent_display?.display_order_by_meal?.[state.activeMeal] ?? 999;
  }

  function renderRestaurantCard(restaurant) {
    const selected = state.selection.restaurantIds.includes(restaurant.id);
    const display = restaurant.parent_display || {};
    const defaultDishNames = display.default_dish_names_by_meal?.[state.activeMeal] || [];
    const mealDishes = dishesForMeal(restaurant, state.activeMeal);
    const dishes = defaultDishNames
      .map((name) => mealDishes.find((dish) => dish.name_zh === name))
      .filter(Boolean)
      .slice(0, 3);
    const formal = restaurant.record_status === "verified_candidate";
    const officialUrl = getVerifiedSourceUrl(restaurant.links?.official_site_source_id);
    const menuUrl = getVerifiedSourceUrl(restaurant.links?.official_menu_source_id);
    const reservationUrl = getVerifiedSourceUrl(restaurant.links?.official_reservation_source_id);
    const verifiedMapSource = (restaurant.links?.map_source_ids || []).find((sourceId) => getVerifiedSourceUrl(sourceId));
    const mapLinks = verifiedMapSource
      ? window.NagoyaMaps?.buildLocationLinks({ name: restaurant.names?.ja || restaurant.names?.en, address: restaurant.location?.address }) || {}
      : {};
    const tripDateSummary = summarizeRestaurantDates(restaurant.business_hours?.date_exceptions, state.activeMeal);
    const mealLabel = MEAL_LABELS[state.activeMeal] || state.activeMeal;
    const mealPrice = getMealValue(restaurant.price_per_person, state.activeMeal);
    const mealQueue = getMealValue(restaurant.queue, state.activeMeal);
    const mealReservation = getMealValue(restaurant.reservation, state.activeMeal);
    const mealHours = restaurant.business_hours?.display_text_by_meal?.[state.activeMeal]
      || restaurant.business_hours?.display_text;
    const nearbyAccess = restaurant.access_from_nearby_places?.[0]?.display_text;
    const accessLabel = state.activeMeal === "breakfast" ? "位置参考" : "附近景点";
    const accessText = state.activeMeal === "breakfast"
      ? generalizeStationReference(restaurant.access_from_hotel?.display_text)
      : nearbyAccess || generalizeStationReference(restaurant.access_from_hotel?.display_text);
    const cautions = (display.cautions || []).filter((item) => !item.meal_types?.length || item.meal_types.includes(state.activeMeal));
    const featured = (display.featured_meals || []).includes(state.activeMeal);
    return `
      <article class="item-card restaurant-card ${featured ? "is-featured" : ""}">
        <div class="card-topline">
          <div>
            <h3>${escapeHtml(restaurant.names?.zh || restaurant.id)}</h3>
            <span>${escapeHtml([restaurant.names?.branch_zh, restaurant.area].filter(Boolean).join(" · ") || "待定区域")}</span>
          </div>
          ${featured ? `<span class="featured-badge">优先推荐</span>` : ""}
        </div>
        <p class="food-focus">${mealIcon(state.activeMeal)} ${escapeHtml(display.food_focus || restaurant.restaurant_types?.[0] || "餐厅候选")}</p>
        <p class="parent-summary">${escapeHtml(display.summary || "详情待整理")}</p>
        <div class="tags parent-tags">${(display.badges || []).slice(0, 4).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}</div>
        ${display.scene_hint ? `<p class="scene-hint"><strong>特别适合：</strong>${escapeHtml(display.scene_hint)}</p>` : ""}
        ${featured && display.featured_reason ? `<p class="featured-reason">${escapeHtml(display.featured_reason)}</p>` : ""}
        <div class="restaurant-key-facts">
          ${renderRecommendation(restaurant.ratings?.recommendation?.stars)}
          <p><strong>人均</strong><span>${escapeHtml(mealPrice?.display_text || "价格待确认")}</span></p>
          <p><strong>${escapeHtml(mealLabel)}时间</strong><span>${escapeHtml(mealHours || "待确认")}</span></p>
          <p><strong>${escapeHtml(accessLabel)}</strong><span>${escapeHtml(accessText || "待确认")}</span></p>
          <p><strong>排队 / 预约</strong><span>${escapeHtml(compactQueueReservation(mealQueue, mealReservation))}</span></p>
        </div>
        <div class="card-cautions">
          ${cautions.map((item) => `<p class="decision-caution is-${escapeHtml(item.tone)}">${item.tone === "closed" ? "❌" : "⚠"} ${escapeHtml(generalizeParentCaution(item.text))}</p>`).join("")}
          ${tripDateSummary?.warning && !cautions.some((item) => item.tone === "closed") ? `<p class="decision-caution is-warning">⚠ ${escapeHtml(tripDateSummary.text)}</p>` : ""}
        </div>
        <div class="signature-dishes">
          <h3>推荐吃</h3>
          <ul class="dish-list">${dishes.map((dish) => `
            <li>
              <strong>${escapeHtml(dish.name_zh)}</strong>
              <span>${escapeHtml(formatDishPrice(dish))}</span>
            </li>`).join("")}</ul>
        </div>
        <div class="restaurant-actions">
          <button type="button" class="select-button ${selected ? "is-selected" : ""}" data-select-type="restaurant" data-select-id="${escapeHtml(restaurant.id)}" aria-pressed="${selected}">
            ${selected ? "✓ 已想吃（点此取消）" : "♡ 想吃"}
          </button>
        </div>
        ${formal ? `<details class="restaurant-details" data-restaurant-details="${escapeHtml(restaurant.id)}">
          <summary><span class="details-more">查看更多</span><span class="details-less">收起详情</span></summary>
          <div class="restaurant-details-content">
            ${renderMealDetails(restaurant)}
            ${renderAllRestaurantDishes(restaurant)}
            ${renderRestaurantRatings(restaurant.ratings)}
            ${state.activeMeal === "dinner" && restaurant.dining_environment?.display_text
              ? `<section><h4>座席与环境</h4><p>${escapeHtml(restaurant.dining_environment.display_text)}</p></section>`
              : ""}
            <section><h4>到店信息</h4>
              <p><strong>地址：</strong>${escapeHtml(restaurant.location?.address || "待确认")}</p>
              <p><strong>最近车站：</strong>${escapeHtml((restaurant.location?.nearest_stations || []).join("、") || "待确认")}</p>
            </section>
            <div class="place-links" aria-label="餐厅链接">
              ${officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">官网</a>` : `<span class="link-pending">官网待复核</span>`}
              ${menuUrl ? `<a href="${escapeHtml(menuUrl)}" target="_blank" rel="noopener noreferrer">官方菜单</a>` : `<span class="link-pending">暂无已核实官方菜单</span>`}
              ${reservationUrl ? `<a href="${escapeHtml(reservationUrl)}" target="_blank" rel="noopener noreferrer">在线预约</a>` : ""}
              ${mapLinks.amap ? `<a href="${escapeHtml(mapLinks.amap)}" target="_blank" rel="noopener noreferrer">高德地图</a>` : ""}
              ${mapLinks.google_maps ? `<a href="${escapeHtml(mapLinks.google_maps)}" target="_blank" rel="noopener noreferrer">Google Maps</a>` : ""}
            </div>
          </div>
        </details>` : ""}
      </article>`;
  }

  function getMealValue(block, meal) {
    return block?.by_meal?.[meal] || block;
  }

  function dishesForMeal(restaurant, meal) {
    return (restaurant.signature_dishes || []).filter((dish) => !Array.isArray(dish.meal_types) || dish.meal_types.includes(meal));
  }

  function renderRecommendation(stars) {
    return `<p class="recommendation-line"><strong>推荐</strong><span class="recommend-stars">${stars ? `${"★".repeat(stars)}${"☆".repeat(5 - stars)}` : "待评估"}</span></p>`;
  }

  function compactQueueReservation(queue, reservation) {
    const peakWait = queue?.estimated_wait_minutes?.peak;
    const queueLabel = ({ low: "通常较轻松", medium: "饭点可能候位", high: "饭点常排队", very_high: "候位压力很高" })[queue?.level]
      || (Number.isFinite(peakWait) ? (peakWait >= 30 ? "热门时段常排队" : peakWait >= 15 ? "繁忙时可能候位" : "通常较轻松") : "排队待确认");
    const reservationLabel = reservation?.recommended ? "建议预约" : reservation?.walk_in_supported === false ? "预约规则待确认" : "可现场到店";
    return `${queueLabel}｜${reservationLabel}`;
  }

  function renderMealDetails(restaurant) {
    return (restaurant.meal_types || []).map((meal) => {
      const hours = restaurant.business_hours?.display_text_by_meal?.[meal] || restaurant.business_hours?.display_text || "待确认";
      const price = getMealValue(restaurant.price_per_person, meal)?.display_text || "价格待确认";
      const queue = getMealValue(restaurant.queue, meal);
      const reservation = getMealValue(restaurant.reservation, meal);
      const lastOrder = restaurant.business_hours?.last_orders?.[meal];
      return `<section class="meal-detail-block">
        <h4>${escapeHtml(MEAL_LABELS[meal] || meal)}</h4>
        <dl class="fact-list compact-facts">
          <div><dt>时间</dt><dd>${escapeHtml(hours)}</dd></div>
          <div><dt>人均</dt><dd>${escapeHtml(price)}</dd></div>
          <div><dt>Last Order</dt><dd>${escapeHtml(lastOrder || "未单独公布")}</dd></div>
          <div><dt>排队</dt><dd>${escapeHtml(queue?.display_text || "待确认")}</dd></div>
          <div><dt>预约</dt><dd>${escapeHtml(reservation?.recommendation_label || "待确认")}</dd></div>
        </dl>
      </section>`;
    }).join("");
  }

  function renderAllRestaurantDishes(restaurant) {
    return `<section class="all-dishes"><h4>全部代表菜</h4>${(restaurant.meal_types || []).map((meal) => `
      <div class="dish-meal-group">
        ${(restaurant.meal_types || []).length > 1 ? `<h5>${escapeHtml(MEAL_LABELS[meal] || meal)}</h5>` : ""}
        <ul class="dish-list">${dishesForMeal(restaurant, meal).map((dish) => `<li>
          <strong>${escapeHtml(dish.name_zh)}</strong>
          <span>${escapeHtml(formatDishPrice(dish))}</span>
          ${dish.description ? `<small>${escapeHtml(dish.description)}</small>` : ""}
        </li>`).join("")}</ul>
      </div>`).join("")}</section>`;
  }

  function renderRestaurantRatings(ratings = {}) {
    const domestic = formatDomesticRating(ratings.domestic);
    const japanLocal = ratings.japan_local?.display_text || "暂无足够评价";
    const overseas = ratings.overseas?.display_text || "暂无足够评价";
    return `<section class="restaurant-ratings"><h4>口碑参考</h4>
      <div class="detail-rating-list">
        <div><strong>国内平台</strong><p>${escapeHtml(domestic)}</p></div>
        <div><strong>日本本地</strong><p>${escapeHtml(japanLocal)}</p></div>
        <div><strong>海外平台</strong><p>${escapeHtml(overseas)}</p></div>
      </div>
      <p class="rating-note">各平台保留原始尺度，不跨平台平均。</p>
    </section>`;
  }

  function formatDomesticRating(domestic = {}) {
    const summary = domestic.research_summary;
    if (!summary || !summary.sample_count) return "暂无足够分店评价";
    const plainSummary = [summary.taste_summary, summary.queue_summary].filter(Boolean).join(" ") || domestic.display_text || "暂无足够评价";
    const brandOnly = summary.branch_specific_sample_count === 0
      || /brand_level/.test(domestic.research_status || "")
      || /品牌级|同品牌/.test(domestic.display_text || "");
    if (brandOnly) {
      return `品牌口味参考：${plainSummary}`;
    }
    return `本店口碑摘要：${plainSummary}`;
  }

  function mealIcon(meal) {
    return ({ breakfast: "☕", lunch: "🍚", dinner: "🍽" })[meal] || "🍴";
  }

  function formatDishPrice(dish) {
    const amount = dish.price?.amount;
    const typeLabel = {
      official: "官方价",
      recent_reference: "近期参考",
      unknown: "价格待确认"
    }[dish.price_type] || "价格待确认";
    if (amount === 0) return `随饮品附送 · ${typeLabel}`;
    if (Number.isFinite(amount)) return `¥${amount.toLocaleString("zh-CN")} · ${typeLabel}`;
    return typeLabel;
  }

  function summarizeRestaurantDates(dateExceptions = [], meal) {
    if (!dateExceptions.length) return null;
    const relevant = dateExceptions.filter((item) => !item.service || !meal || item.service.split(",").includes(meal));
    const closed = relevant.filter((item) => item.status === "closed");
    const uncertain = relevant.filter((item) => !["expected_open", "open", "closed"].includes(item.status));
    if (closed.length) {
      return { warning: true, text: `已研究日期中，${closed.map((item) => `${Number(item.date.slice(5, 7))}月${Number(item.date.slice(8, 10))}日`).join("、")}休息；选择这些日期时不可安排。` };
    }
    if (uncertain.length) {
      return { warning: true, text: "部分日期仍需出发前复核临时营业公告。" };
    }
    return { warning: false, text: "按当前固定休业规则预计可用；临时变更请在前一晚复核。" };
  }

  function generalizeStationReference(text = "") {
    return text
      .replace(/名古屋万豪酒店\s*\/\s*名古屋站/g, "名古屋站")
      .replace(/^从酒店/g, "从名古屋站周边")
      .replace(/酒店出发/g, "名古屋站出发");
  }

  function generalizeResearchDateSummary(text = "") {
    return text
      .replace(/本次旅行/g, "已研究日期")
      .replace(/旅行日期内/g, "已研究日期内")
      .replace(/旅行期间/g, "已研究日期中");
  }

  function generalizeParentCaution(text = "") {
    return text
      .replace(/，?本次旅行当天不可用/g, "；选择该日期时不可安排")
      .replace(/本次旅行/g, "所选日期");
  }

  function renderRatings(ratings = {}) {
    const recommend = ratings.recommendation?.stars;
    const domestic = ratings.domestic?.display_text || "暂无足够评价";
    const japanLocal = ratings.japan_local?.display_text;
    const overseas = ratings.overseas?.display_text || "暂无足够评价";
    return `
      <div class="rating-grid" aria-label="评价信息">
        <div class="rating-item"><strong>推荐</strong><span class="recommend-stars">${recommend ? `${"★".repeat(recommend)}${"☆".repeat(5 - recommend)}` : "待评估"}</span></div>
        <div class="rating-item"><strong>国内平台口碑</strong><span>${escapeHtml(domestic)}</span></div>
        ${japanLocal && japanLocal !== "暂无足够评价" ? `<div class="rating-item"><strong>日本本地口碑</strong><span>${escapeHtml(japanLocal)}</span></div>` : ""}
        <div class="rating-item"><strong>海外平台口碑</strong><span>${escapeHtml(overseas)}</span></div>
      </div>`;
  }

  function getVerifiedSourceUrl(sourceId) {
    if (!sourceId) return "";
    const source = state.sources.find((item) => item.id === sourceId);
    if (!source?.verification?.verified) return "";
    return source.verification.final_url || source.url || "";
  }

  function heatLabel(value) {
    return ({ high: "适合避暑", medium: "一般", low: "不适合正午" })[value] || "待确认";
  }

  function renderTransport() {
    const formalTransport = state.transport.filter((item) => item.record_status === "researched_transport");
    elements.transportList.innerHTML = formalTransport.map((item) => {
      const officialUrl = getVerifiedSourceUrl(item.links?.official_site_source_id);
      const timetableUrl = getVerifiedSourceUrl(item.links?.official_timetable_source_id);
      const ticketUrl = getVerifiedSourceUrl(item.links?.official_ticket_source_id);
      const links = [
        officialUrl ? `<a href="${escapeHtml(officialUrl)}" target="_blank" rel="noopener noreferrer">官方介绍</a>` : "",
        timetableUrl ? `<a href="${escapeHtml(timetableUrl)}" target="_blank" rel="noopener noreferrer">官方时刻表</a>` : "",
        ticketUrl ? `<a href="${escapeHtml(ticketUrl)}" target="_blank" rel="noopener noreferrer">官方票价 / 票券</a>` : ""
      ].filter(Boolean).join("");
      return `
      <article class="transport-card">
        <div class="card-topline">
          <h3>${escapeHtml(item.names?.zh || item.id)}</h3>
        </div>
        <dl class="fact-list">
          <div><dt>参考票价</dt><dd>${escapeHtml(item.reference_fare?.display_text || "请出发前确认")}</dd></div>
          <div><dt>IC 卡</dt><dd>${escapeHtml(item.ic_card?.display_text || "请现场确认")}</dd></div>
          <div><dt>购票</dt><dd>${escapeHtml(item.purchase?.display_text || "请现场确认")}</dd></div>
          <div><dt>乘车</dt><dd>${escapeHtml(item.boarding?.display_text || "请现场确认")}</dd></div>
        </dl>
        ${links ? `<div class="transport-links" aria-label="交通官方链接">${links}</div>` : ""}
      </article>`;
    }).join("") || renderNoResult("暂无已核实交通信息。");
  }

  function handleSelectionClick(event) {
    const button = event.target.closest("[data-select-type]");
    if (!button) return;
    toggleSelection(button.dataset.selectType, button.dataset.selectId);
  }

  function toggleSelection(type, id) {
    const key = type === "place" ? "placeIds" : "restaurantIds";
    const ids = state.selection[key];
    const index = ids.indexOf(id);
    const removing = index >= 0;
    if (removing) ids.splice(index, 1);
    else ids.push(id);
    saveSelection();
    renderPlaces();
    renderRestaurants();
    renderSelected();
    showStatus(removing ? "已取消选择。" : "已加入“已选择”。");
  }

  function renderSelected() {
    const places = state.selection.placeIds.map((id) => state.places.find((item) => item.id === id)).filter(Boolean);
    const restaurants = state.selection.restaurantIds.map((id) => state.restaurants.find((item) => item.id === id)).filter(Boolean);
    const total = places.length + restaurants.length;
    elements.selectionCount.textContent = String(total);
    elements.selectedEmpty.hidden = total > 0;
    elements.selectedContent.hidden = total === 0;
    elements.selectedPlaces.innerHTML = places.length
      ? places.map((place) => renderCompactItem(place.id, place.names?.zh, "place", place.area)).join("")
      : renderNoResult("还没有想去的景点。")
    elements.selectedRestaurants.innerHTML = restaurants.length
      ? restaurants.map((restaurant) => renderCompactItem(restaurant.id, restaurant.names?.zh, "restaurant", restaurant.area)).join("")
      : renderNoResult("还没有想吃的餐厅。")
  }

  function renderCompactItem(id, name, type, subtitle) {
    return `
      <div class="compact-item">
        <p><strong>${escapeHtml(name || id)}</strong><br><span>${escapeHtml(subtitle || "")}</span></p>
        <button type="button" data-select-type="${type}" data-select-id="${escapeHtml(id)}">取消</button>
      </div>`;
  }

  function clearSelection() {
    const total = state.selection.placeIds.length + state.selection.restaurantIds.length;
    if (!total) {
      showStatus("当前没有已选内容。")
      return;
    }
    if (!window.confirm("确定清空全部已选景点和餐厅吗？")) return;
    state.selection = { placeIds: [], restaurantIds: [] };
    saveSelection();
    renderPlaces();
    renderRestaurants();
    renderSelected();
    showStatus("已清空全部选择。")
  }

  async function copySelection() {
    const text = buildSelectionText();
    if (!text) {
      showStatus("当前没有可复制的内容。")
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      showStatus("已复制清单。")
    } catch {
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      showStatus(copied ? "已复制清单。" : "复制失败，请手动选择文字。")
    }
  }

  function buildSelectionText() {
    const places = state.selection.placeIds.map((id) => state.places.find((item) => item.id === id)).filter(Boolean);
    const restaurants = state.selection.restaurantIds.map((id) => state.restaurants.find((item) => item.id === id)).filter(Boolean);
    if (!places.length && !restaurants.length) return "";
    const lines = ["名古屋旅行已选清单", ""];
    lines.push("想去的景点：", ...(places.length ? places.map((item) => `- ${item.names?.zh}`) : ["- 暂无"]));
    lines.push("", "想吃的餐厅：", ...(restaurants.length ? restaurants.map((item) => `- ${item.names?.zh}`) : ["- 暂无"]));
    return lines.join("\n");
  }

  function switchView(view) {
    const restaurantViews = ["breakfast", "lunch", "dinner"];
    const panel = restaurantViews.includes(view) ? "restaurants" : view;
    if (restaurantViews.includes(view)) {
      state.activeMeal = view;
      renderRestaurants();
    }
    document.querySelectorAll("[data-view-panel]").forEach((section) => {
      section.hidden = section.dataset.viewPanel !== panel;
    });
    document.querySelectorAll(".nav-button[data-view]").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("is-active", active);
      if (active) button.setAttribute("aria-current", "page");
      else button.removeAttribute("aria-current");
    });
    document.getElementById("main-content").focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleRouteAnalysis(event) {
    event.preventDefault();
    const formData = new FormData(elements.routeForm);
    const request = window.NagoyaRoutePlanner.createRequest({
      date: formData.get("route-date"),
      duration: formData.get("duration"),
      pace: formData.get("pace"),
      startTime: formData.get("start-time"),
      originId: formData.get("route-origin") || "nagoya-station",
      isDepartureDay: formData.get("is-departure-day") === "on",
      routeEndDeadline: formData.get("route-end-deadline") || null,
      selectedPlaceIds: state.selection.placeIds,
      selectedRestaurantIds: state.selection.restaurantIds
    });
    const result = window.NagoyaRoutePlanner.analyze(request, {
      places: state.places,
      restaurants: state.restaurants,
      tripConfig: state.tripConfig,
      areas: state.areas,
      transitEdges: state.transitEdges
    });
    elements.routeResult.innerHTML = renderRouteResult(result);
    elements.routeResult.hidden = false;
    elements.routeResult.scrollIntoView({ behavior: "smooth", block: "start" });
    showStatus(result.ok ? "已生成正式参考路线。" : "请先选择想去的景点。")
  }

  function renderRouteResult(result) {
    if (result.code === "INVALID_DATE") {
      return `<div class="route-empty"><p class="route-feasibility is-impossible">🔴 日期无效</p><h3>请先选择游玩日期</h3><p>选择日期后，系统会继续检查星期、休馆和营业时间。</p></div>`;
    }
    if (result.code === "NO_PLACES_SELECTED") {
      return `<div class="route-empty"><p class="route-feasibility is-impossible">🔴 还没有选择景点</p><h3>请先选择想去的地方</h3><p>去“景点”页面点击“想去”，再回来生成路线。</p></div>`;
    }
    const dateText = formatTripDate(result.date);
    const unavailable = result.unavailable_places.map((item) => `<li><strong>${escapeHtml(item.name_zh)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join("");
    const remaining = result.remaining_places.map((item) => `<li><strong>${escapeHtml(item.name_zh)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join("");
    const unarranged = (result.unarranged_restaurants || []).map((item) => `<li><strong>${escapeHtml(item.name_zh)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join("");
    const alternatives = (result.restaurant_alternatives || []).map((item) => `<li><strong>${escapeHtml(item.name_zh)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join("");
    const warnings = result.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join("");
    const tickets = (result.ticket_suggestions || []).map((item) => `<li><strong>${escapeHtml(item.name_zh)} ¥${formatYen(item.price_yen)}</strong><span>${escapeHtml(item.reason)}</span></li>`).join("");
    const feasibilityClass = `is-${escapeHtml(result.feasibility)}`;
    return `
      <div class="route-result-header"><p>${escapeHtml(dateText)}｜${escapeHtml(DURATION_LABELS[result.duration_mode] || result.duration_mode)}｜${escapeHtml(PACE_LABELS[result.pace] || result.pace)}｜${escapeHtml(result.start_time)}左右开始${result.departure_day?.is_departure_day ? "｜离境日" : ""}</p><p>起点：${escapeHtml(result.origin_choice_id === "nagoya-marriott-nearby" ? "名古屋万豪附近" : "名古屋站")}</p><h3 class="route-feasibility ${feasibilityClass}">${escapeHtml(routeHeadline(result))}</h3></div>
      <div class="route-result-facts"><p><strong>预计用时</strong><span>${escapeHtml(result.estimated_duration.display_text)}</span></p><p><strong>步行强度</strong><span>${escapeHtml(result.estimated_walking_level)}</span></p><p><strong>建议安排</strong><span>${result.recommended_subset.length}个景点${result.arranged_restaurants?.length ? `＋${result.arranged_restaurants.length}次用餐` : ""}</span></p></div>
      ${renderRouteBudget(result.budget_estimate)}
      ${result.ordered_stops?.length ? `<section class="route-result-section route-timeline-section"><h3>路线时间线</h3><div class="route-timeline">${renderRouteTimeline(result)}</div></section>` : `<section class="route-result-section is-alert"><h3>暂时无法生成正式顺序</h3><p>请减少景点或调整日期、时长后重试。</p></section>`}
      ${tickets ? `<details class="route-detail"><summary>这条路线可比较交通票券</summary><ul class="route-info-list">${tickets}</ul></details>` : ""}
      ${unavailable ? `<section class="route-result-section is-alert"><h3>这天不能安排</h3><ul class="route-info-list">${unavailable}</ul></section>` : ""}
      ${remaining ? `<section class="route-result-section is-secondary"><h3>这次没有安排</h3><ul class="route-info-list">${remaining}</ul></section>` : ""}
      ${unarranged ? `<section class="route-result-section is-secondary"><h3>这次没有安排的餐厅</h3><ul class="route-info-list">${unarranged}</ul></section>` : ""}
      ${alternatives ? `<details class="route-detail"><summary>查看同餐别备选</summary><ul class="route-info-list">${alternatives}</ul></details>` : ""}
      <section class="route-result-section"><h3>为什么这样安排</h3><ul>${result.feasibility_reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul></section>
      ${warnings ? `<section class="route-result-section route-warnings"><h3>还要注意</h3><ul>${warnings}</ul></section>` : ""}
    `;
  }

  function renderRouteTimeline(result) {
    return result.ordered_stops.map((stop, index) => `${renderTimelineStop(stop)}${result.segments?.[index] ? renderTimelineSegment(result.segments[index]) : ""}`).join("");
  }

  function renderTimelineStop(stop) {
    const icon = stop.stop_type === "restaurant" ? "🍚" : stop.stop_type === "origin" ? "🚉" : stop.stop_type === "destination" ? "🏁" : "📍";
    const meal = stop.meal_type ? `<span class="route-stop-kind">${escapeHtml(MEAL_LABELS[stop.meal_type] || stop.meal_type)}${stop.selection_type === "user_selected" ? " · 已选想吃" : " · 附近推荐"}</span>` : "";
    const duration = stop.duration_display ? `<p>建议停留 ${escapeHtml(stop.duration_display)}</p>` : "";
    const cautions = (stop.cautions || []).map((item) => `<p class="route-stop-caution">⚠ ${escapeHtml(item)}</p>`).join("");
    return `<article class="route-stop ${escapeHtml(stop.stop_type)}"><time>${escapeHtml(stop.time_label)}</time><div><h4>${icon} ${escapeHtml(stop.name_zh)}</h4>${meal}${duration}${cautions}</div></article>`;
  }

  function renderTimelineSegment(segment) {
    const summary = `${routeModeLabel(segment.mode)} ${escapeHtml(segment.duration_display)}｜${escapeHtml(segment.fare_display)}`;
    const details = [segment.line ? `<p><strong>线路</strong> ${escapeHtml(segment.line)}</p>` : "", segment.boarding_station ? `<p><strong>上车</strong> ${escapeHtml(segment.boarding_station)}</p>` : "", segment.alighting_station ? `<p><strong>下车</strong> ${escapeHtml(segment.alighting_station)}</p>` : "", Number.isFinite(segment.transfer_count) ? `<p><strong>换乘</strong> ${segment.transfer_count ? `${segment.transfer_count}次` : "无需换乘"}</p>` : "", segment.walking_minutes ? `<p><strong>其中步行</strong> 约${segment.walking_minutes}分钟</p>` : "", segment.reference_quality === "fallback_estimate" ? `<p class="route-stop-caution">⚠ 这一段目前只有估算，现场请重新导航。</p>` : ""].filter(Boolean).join("");
    return `<details class="route-segment"><summary>${summary}</summary><div class="route-segment-detail">${details}<div class="route-map-links">${routeSegmentLinks(segment)}</div></div></details>`;
  }

  function routeSegmentLinks(segment) {
    const links = window.NagoyaMaps.buildRouteLinks(routeEntityLocation(segment.origin_id, segment.origin_name_zh), routeEntityLocation(segment.destination_id, segment.destination_name_zh), segment.navigation_mode);
    const official = (segment.official_timetable_source_ids || []).map(sourceById).find(Boolean);
    return [links.google_maps ? externalRouteLink(links.google_maps, "Google Maps｜日本现场导航", "route-link-primary") : "", official ? externalRouteLink(official.verification?.final_url || official.url, "官方时刻表｜查实际车次", "") : "", links.amap ? externalRouteLink(links.amap, "高德地图｜出发前查看地点", "") : ""].filter(Boolean).join("");
  }

  function routeEntityLocation(id, fallbackName) {
    const place = state.places.find((item) => item.id === id);
    if (place) return { name: place.names?.zh, address: place.location?.address, latitude: place.location?.latitude, longitude: place.location?.longitude };
    const restaurant = state.restaurants.find((item) => item.id === id);
    if (restaurant) return { name: `${restaurant.names?.zh || ""} ${restaurant.names?.branch_zh || ""}`.trim(), address: restaurant.location?.address, latitude: restaurant.location?.latitude, longitude: restaurant.location?.longitude };
    const node = state.transitNodes.find((item) => item.id === id);
    return { name: fallbackName || node?.name_zh, address: "", latitude: node?.location?.latitude, longitude: node?.location?.longitude };
  }

  function externalRouteLink(url, label, className) {
    return `<a class="route-map-link ${className}" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`;
  }

  function sourceById(id) { return state.sources.find((source) => source.id === id); }

  function renderRouteBudget(budget) {
    const transport = budget?.transport || {};
    const admission = budget?.admission || {};
    const meal = budget?.meal_budget_range || {};
    const transportText = `${Number.isFinite(transport.reference_amount_per_person) ? `约¥${formatYen(transport.reference_amount_per_person)} / 人` : "待确认"}${transport.unknown_segment_count ? `，另有${transport.unknown_segment_count}段待确认` : ""}`;
    const admissionText = `${Number.isFinite(admission.known_amount_per_person) ? `约¥${formatYen(admission.known_amount_per_person)} / 人` : "待确认"}${admission.unknown_place_ids?.length ? `，另有${admission.unknown_place_ids.length}处待确认` : ""}`;
    const mealText = Number.isFinite(meal.min_amount_per_person) && Number.isFinite(meal.max_amount_per_person) ? (meal.min_amount_per_person || meal.max_amount_per_person ? `约¥${formatYen(meal.min_amount_per_person)}～${formatYen(meal.max_amount_per_person)} / 人` : "本路线未正式计入餐费") : "餐费待确认";
    return `<div class="route-budget" aria-label="路线预算参考"><p><strong>🚇 交通</strong><span>${escapeHtml(transportText)}</span></p><p><strong>🎫 门票</strong><span>${escapeHtml(admissionText)}</span></p><p><strong>🍚 吃饭</strong><span>${escapeHtml(mealText)}</span></p></div>`;
  }

  function routeHeadline(result) { return ({ good: "🟢 推荐这样走", moderate: "🟡 可以这样走，但会稍紧凑", poor: "🟠 这组安排比较累", impossible: "🔴 不建议这样安排" })[result.feasibility] || result.feasibility_label; }
  function routeModeLabel(mode) { return ({ walk: "🚶 步行", subway: "🚇 地铁", train: "🚆 电车", sightseeing_bus: "🚌 观光巴士", city_bus: "🚌 巴士", mixed: "🚇 公共交通＋步行", estimated: "↔ 参考转场" })[mode] || "🚇 公共交通"; }
  function formatYen(value) { return Number(value || 0).toLocaleString("zh-CN"); }

  function formatTripDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return "日期待选择";
    const weekday = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"][new Date(`${date}T12:00:00Z`).getUTCDay()];
    const base = `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
    return weekday ? `${base}（${weekday}）` : base;
  }

  function todayInTokyo() {
    return new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Tokyo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  }

  function renderNoResult(message) {
    return `<div class="empty-state"><p>${escapeHtml(message)}</p></div>`;
  }

  function showStatus(message, duration = 2600) {
    clearTimeout(statusTimer);
    elements.status.textContent = message;
    elements.status.classList.add("is-visible");
    statusTimer = setTimeout(() => elements.status.classList.remove("is-visible"), duration);
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "'": "&#39;",
      '"': "&quot;"
    })[character]);
  }
})();
