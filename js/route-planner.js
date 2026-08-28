(function (root) {
  "use strict";

  const DEFAULT_TRANSIT_ORIGIN = {
    id: "hotel-nagoya-marriott-associa",
    choice_id: "nagoya-station",
    name_zh: "名古屋站",
    address: "Nagoya Station, Nakamura Ward, Nagoya, Aichi",
    area_id: "area-meieki",
    location: { latitude: 35.1709, longitude: 136.8821 }
  };
  const DURATION_DEFAULTS = {
    half_day: { min_minutes: 180, max_minutes: 240 },
    most_day: { min_minutes: 300, max_minutes: 360 },
    full_day: { min_minutes: 420, max_minutes: 540 }
  };
  const PACE_DEFAULTS = {
    easy: { visit_duration_rule: "recommended", base_buffer_minutes: 25, per_place_buffer_minutes: 20 },
    normal: { visit_duration_rule: "recommended", base_buffer_minutes: 20, per_place_buffer_minutes: 15 },
    active: { visit_duration_rule: "quick_or_lower_recommended", base_buffer_minutes: 15, per_place_buffer_minutes: 10 }
  };
  const FEASIBILITY_LABELS = {
    good: "🟢 很合适",
    moderate: "🟡 稍微紧凑",
    poor: "🟠 比较累",
    impossible: "🔴 不建议这样安排"
  };
  const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  const CLOSED_WORDS = /休馆|休园|休息|关闭|不可用|closed/i;
  const REMOTE_DEFAULTS = ["area-port", "area-kinjo-futo", "area-inuyama"];

  function routeOrigin(originId) {
    const choiceId = originId === "nagoya-marriott-nearby" ? originId : "nagoya-station";
    return {
      ...DEFAULT_TRANSIT_ORIGIN,
      choice_id: choiceId,
      name_zh: choiceId === "nagoya-marriott-nearby" ? "名古屋万豪附近" : "名古屋站"
    };
  }

  function createRequest({ date, duration, durationMode, pace, startTime, originId = "nagoya-station", isDepartureDay = false, routeEndDeadline = null, selectedPlaceIds = [], selectedRestaurantIds = [] }) {
    const origin = routeOrigin(originId);
    return {
      request_version: "2.0",
      status: "ready_for_feasibility",
      date,
      duration_mode: durationMode || duration,
      pace,
      start_time: startTime || "09:00",
      origin_choice_id: origin.choice_id,
      origin,
      destination: origin,
      departure_day: {
        is_departure_day: Boolean(isDepartureDay),
        route_end_deadline: /^\d{2}:\d{2}$/.test(routeEndDeadline || "") ? routeEndDeadline : null
      },
      selected_place_ids: [...new Set(selectedPlaceIds)],
      selected_restaurant_ids: [...new Set(selectedRestaurantIds)],
      constraints: {
        check_opening_hours: true,
        check_closures_for_date: true,
        check_last_admission: true,
        prefer_parent_friendly: true,
        exact_visit_order_required: true
      }
    };
  }

  function analyze(request, { places = [], restaurants = [], tripConfig = {}, areas = [], transitEdges = [] } = {}) {
    const durationProfile = getDurationProfile(request.duration_mode, tripConfig);
    const paceProfile = getPaceProfile(request.pace, tripConfig);
    const remoteAreaIds = new Set(tripConfig.route_options?.remote_area_ids || REMOTE_DEFAULTS);
    const placeById = new Map(places.map((place) => [place.id, place]));
    const selectedPlaces = request.selected_place_ids.map((id) => placeById.get(id)).filter(Boolean);
    const unknownPlaceIds = request.selected_place_ids.filter((id) => !placeById.has(id));
    const departureDay = isDepartureDay(request);
    const result = baseResult(request, departureDay, tripConfig);

    if (!isValidIsoDate(request.date)) {
      result.code = "INVALID_DATE";
      result.feasibility_reasons.push("请选择有效日期后再生成路线。");
      return result;
    }

    if (!selectedPlaces.length) {
      result.feasibility_reasons.push("请先选择至少一个想去的景点。");
      if (unknownPlaceIds.length) result.warnings.push("部分已选景点ID不存在，已忽略。");
      return result;
    }

    result.ok = true;
    result.code = "FEASIBILITY_READY";
    const usablePlaces = [];
    for (const place of selectedPlaces) {
      const availability = checkPlaceAvailability(place, request.date);
      if (availability.available) {
        usablePlaces.push(place);
        result.warnings.push(...availability.warnings.map((warning) => `${place.names?.zh || place.id}：${warning}`));
      } else {
        result.unavailable_places.push({ place_id: place.id, name_zh: place.names?.zh || place.id, reason_code: availability.reason_code, reason: availability.reason });
        result.debug.exclusions.push({ place_id: place.id, trigger: availability.reason_code, detail: availability.reason });
      }
    }
    result.usable_place_ids = usablePlaces.map((place) => place.id);
    if (!usablePlaces.length) {
      result.feasibility = "impossible";
      result.feasibility_label = FEASIBILITY_LABELS.impossible;
      result.feasibility_reasons.push("所选景点在这一天均不可安排。");
      return result;
    }

    const clusters = clusterSelectedPlaces(usablePlaces, areas, remoteAreaIds);
    result.clusters = clusters.map(publicCluster);
    const selection = selectRecommendedSubset({ clusters, request, durationProfile, paceProfile, departureDay });
    const openingEvaluation = applyOpeningWindowChecks(selection.recommendedPlaces, request, paceProfile);
    const recommendedPlaces = openingEvaluation.usable;
    const remaining = [...selection.remaining, ...openingEvaluation.removed];
    result.remaining_places = remaining.map((item) => ({ place_id: item.place.id, name_zh: item.place.names?.zh || item.place.id, reason_code: item.reason_code, reason: item.reason }));
    result.debug.exclusions.push(...result.remaining_places.map((item) => ({ place_id: item.place_id, trigger: item.reason_code, detail: item.reason })));
    if (!recommendedPlaces.length) {
      result.feasibility = "impossible";
      result.feasibility_label = FEASIBILITY_LABELS.impossible;
      result.feasibility_reasons.push("按默认开始时间无法在开放时段内安排所选景点。");
      return result;
    }

    const estimate = estimateRouteDuration(recommendedPlaces, request, tripConfig, paceProfile);
    result.recommended_subset = recommendedPlaces.map((place) => place.id);
    result.estimated_duration = estimate.publicEstimate;
    result.estimated_walking_level = estimateWalkingLevel(recommendedPlaces);
    result.debug.duration_breakdown_minutes = estimate.breakdown;
    result.debug.transfer_estimates = estimate.transfers;
    result.budget_estimate = estimateBudget(recommendedPlaces);
    const areaIds = [...new Set(recommendedPlaces.map((place) => place.area_id))];
    result.restaurant_candidates.lunch = findAvailableRestaurants({ restaurants, areaIds, date: request.date, meal: "lunch", time: "12:00" });
    if (request.duration_mode === "full_day" || timeToMinutes(request.start_time) >= timeToMinutes("13:00")) {
      result.restaurant_candidates.dinner = findAvailableRestaurants({ restaurants, areaIds, date: request.date, meal: "dinner", time: "18:30" });
    }

    const feasibility = determineFeasibility({
      selectedPlaces,
      usablePlaces,
      recommendedPlaces,
      request,
      durationProfile,
      estimateMinutes: estimate.breakdown.total,
      walkingLevel: result.estimated_walking_level,
      remoteAreaIds,
      departureDay,
      unavailableCount: result.unavailable_places.length
    });
    result.feasibility = feasibility.status;
    result.feasibility_label = FEASIBILITY_LABELS[feasibility.status];
    result.feasibility_reasons = feasibility.reasons;
    result.warnings.push(...feasibility.warnings);
    if (unknownPlaceIds.length) result.warnings.push("部分已选景点ID不存在，已忽略。");
    if (transitEdges.length) {
      const detailed = buildDetailedRoute({
        request,
        places: recommendedPlaces,
        restaurants,
        tripConfig,
        transitEdges,
        paceProfile,
        durationProfile
      });
      Object.assign(result, detailed);
      result.warnings.push(...detailed.route_warnings);
    }
    result.warnings = [...new Set(result.warnings)];
    return result;
  }

  function baseResult(request, departureDay, tripConfig) {
    return {
      ok: false,
      code: "NO_PLACES_SELECTED",
      date: request.date,
      duration_mode: request.duration_mode,
      pace: request.pace,
      start_time: request.start_time,
      selected_place_ids: [...request.selected_place_ids],
      usable_place_ids: [],
      unavailable_places: [],
      clusters: [],
      recommended_subset: [],
      remaining_places: [],
      estimated_duration: emptyDurationEstimate(),
      estimated_walking_level: "轻松",
      feasibility: "impossible",
      feasibility_label: FEASIBILITY_LABELS.impossible,
      feasibility_reasons: [],
      restaurant_candidates: { lunch: [], dinner: [] },
      ordered_stops: [],
      segments: [],
      arranged_restaurants: [],
      restaurant_alternatives: [],
      unarranged_restaurants: [],
      ticket_suggestions: [],
      route_warnings: [],
      budget_estimate: emptyBudgetEstimate(),
      origin_choice_id: request.origin_choice_id,
      departure_day: {
        is_departure_day: departureDay,
        route_end_deadline: request.departure_day?.route_end_deadline ?? null
      },
      warnings: [],
      debug: { unknown_place_ids: [], exclusions: [], duration_breakdown_minutes: null, transfer_estimates: [] }
    };
  }

  function checkPlaceAvailability(place, date) {
    const warnings = [];
    const explicitStatus = place.trip_date_status?.dates?.[date];
    if (explicitStatus && CLOSED_WORDS.test(explicitStatus)) {
      return { available: false, reason_code: "date_closed", reason: `${dateLabel(date)}明确休馆：${explicitStatus}`, warnings };
    }
    const hours = place.opening_hours || {};
    const dateException = (hours.date_exceptions || []).find((item) => item.date === date);
    if (dateException?.status === "closed") {
      return { available: false, reason_code: "date_exception", reason: dateException.note || `${dateLabel(date)}特别休馆`, warnings };
    }
    const weekday = weekdayForDate(date);
    const explicitOpen = Boolean(explicitStatus && !CLOSED_WORDS.test(explicitStatus)) || ["open", "expected_open"].includes(dateException?.status);
    if (!explicitOpen && (hours.closure_rules?.fixed_weekdays || []).includes(weekday)) {
      return { available: false, reason_code: "fixed_weekday", reason: `${dateLabel(date)}为固定休馆日`, warnings };
    }
    const temporaryClosure = (hours.closure_rules?.temporary_closures || []).find((item) => {
      if (typeof item === "string") return item.includes(date) && CLOSED_WORDS.test(item);
      const start = item.start_date || item.date;
      const end = item.end_date || item.date;
      return start && end && date >= start && date <= end;
    });
    if (temporaryClosure) {
      const reason = typeof temporaryClosure === "string" ? temporaryClosure : temporaryClosure.reason;
      return { available: false, reason_code: "temporary_closure", reason: reason || `${dateLabel(date)}临时关闭`, warnings };
    }
    const periods = openingPeriodsForDate(place, date);
    if (!periods.length) {
      if (Array.isArray(hours.weekly) && hours.weekly.length) return { available: false, reason_code: "no_open_period", reason: `${dateLabel(date)}没有可用开放时段`, warnings };
      warnings.push("缺少机器可读开放时段，需人工复核。");
    } else if (!periods.some((period) => period.open && period.close)) {
      warnings.push("开放状态可确认，但缺少机器可读具体时刻。");
    }
    if (!explicitStatus && !dateException) warnings.push("该日期临时营业信息待确认；固定休馆和常规开放时间已参与判断。");
    if (!explicitStatus && hours.closure_rules?.holiday_shift_rule) warnings.push("节假日顺延规则需结合当年日历复核。");
    return { available: true, reason_code: null, reason: null, warnings };
  }

  function checkOpeningWindow(place, date, arrivalTime, visitMinutes) {
    const availability = checkPlaceAvailability(place, date);
    if (!availability.available) return { feasible: false, ...availability };
    const periods = openingPeriodsForDate(place, date).filter((period) => period.open && period.close);
    const arrival = typeof arrivalTime === "number" ? arrivalTime : timeToMinutes(arrivalTime);
    if (!periods.length) return { feasible: true, adjusted_arrival_minutes: arrival, data_warning: "缺少机器可读开放时段" };
    const lastAdmission = timeToMinutes(place.opening_hours?.last_admission);
    for (const period of periods) {
      const open = timeToMinutes(period.open);
      const close = timeToMinutes(period.close);
      const adjustedArrival = Math.max(arrival, open);
      if (Number.isFinite(lastAdmission) && adjustedArrival > lastAdmission) continue;
      if (adjustedArrival + visitMinutes <= close) return { feasible: true, adjusted_arrival_minutes: adjustedArrival, wait_minutes: Math.max(0, open - arrival) };
    }
    return { feasible: false, reason_code: "opening_window", reason: "按默认开始时间预计赶不上开放时段或最晚入场。" };
  }

  function openingPeriodsForDate(place, date) {
    const hours = place.opening_hours || {};
    const exception = (hours.date_exceptions || []).find((item) => item.date === date);
    if (Array.isArray(exception?.override_service_periods)) return exception.override_service_periods;
    const weekday = weekdayForDate(date);
    return (hours.weekly || []).filter((period) => (period.days || []).includes(weekday));
  }

  function clusterSelectedPlaces(places, areas = [], remoteAreaIds = new Set(REMOTE_DEFAULTS)) {
    const areaNames = new Map(areas.map((area) => [area.id, area.names?.zh || area.id]));
    const grouped = new Map();
    places.forEach((place) => {
      if (!grouped.has(place.area_id)) grouped.set(place.area_id, []);
      grouped.get(place.area_id).push(place);
    });
    const clusters = [];
    for (const [areaId, areaPlaces] of grouped) {
      const pending = new Set(areaPlaces);
      let sequence = 1;
      while (pending.size) {
        const seed = pending.values().next().value;
        pending.delete(seed);
        const component = [seed];
        const queue = [seed];
        while (queue.length) {
          const current = queue.shift();
          for (const candidate of [...pending]) {
            if (haversineKm(current.location, candidate.location) <= 4.5) {
              pending.delete(candidate);
              component.push(candidate);
              queue.push(candidate);
            }
          }
        }
        let maxDistance = 0;
        for (let i = 0; i < component.length; i += 1) {
          for (let j = i + 1; j < component.length; j += 1) maxDistance = Math.max(maxDistance, haversineKm(component[i].location, component[j].location));
        }
        clusters.push({
          id: `${areaId}-${sequence}`,
          area_id: areaId,
          area_name_zh: areaNames.get(areaId) || component[0].area || areaId,
          place_ids: component.map((place) => place.id),
          places: component,
          remote: remoteAreaIds.has(areaId),
          compatibility: maxDistance <= 3 ? "high" : maxDistance <= 5 ? "moderate" : "low",
          centroid: centroid(component)
        });
        sequence += 1;
      }
    }
    return clusters;
  }

  function selectRecommendedSubset({ clusters, request, durationProfile, paceProfile, departureDay }) {
    const caps = {
      half_day: { easy: 2, normal: 3, active: 4 },
      most_day: { easy: 3, normal: 4, active: 5 },
      full_day: { easy: 4, normal: 6, active: 8 }
    };
    let placeCap = caps[request.duration_mode]?.[request.pace] || 3;
    if (departureDay) placeCap = Math.min(placeCap, 3);
    const ranked = [...clusters].sort((a, b) => clusterScore(b, request, departureDay) - clusterScore(a, request, departureDay));
    const primary = ranked[0];
    const allowed = new Set([primary.id]);
    if (!primary.remote && !departureDay && request.duration_mode !== "half_day") {
      const nearby = ranked.slice(1).find((cluster) => !cluster.remote && centroidDistanceKm(primary, cluster) <= (request.duration_mode === "full_day" ? 10 : 7));
      if (nearby) allowed.add(nearby.id);
    }
    const ordered = ranked.flatMap((cluster) => sortPlacesForEvaluation(cluster.places, request.pace).map((place) => ({ place, cluster })));
    const recommendedPlaces = [];
    const remaining = [];
    for (const item of ordered) {
      if (!allowed.has(item.cluster.id)) {
        remaining.push({ place: item.place, reason_code: item.cluster.remote || primary.remote ? "remote_area_conflict" : "area_conflict", reason: "与本次建议主组合距离较远，建议另安排时间。" });
      } else if (recommendedPlaces.length >= placeCap) {
        remaining.push({ place: item.place, reason_code: "too_many_places", reason: "当前时长和体力模式下景点过多，建议留到其他时间。" });
      } else {
        recommendedPlaces.push(item.place);
      }
    }
    while (recommendedPlaces.length > 1) {
      const estimate = estimateRouteDuration(recommendedPlaces, request, { route_options: { meal_break_minutes: {} } }, paceProfile);
      if (estimate.breakdown.total <= durationProfile.max_minutes * 1.6) break;
      remaining.push({ place: recommendedPlaces.pop(), reason_code: "time_budget", reason: "加入后预计明显超过当前时间预算。" });
    }
    return { recommendedPlaces, remaining };
  }

  function applyOpeningWindowChecks(places, request, paceProfile) {
    const usable = [];
    const removed = [];
    let cursor = timeToMinutes(request.start_time);
    let previous = null;
    for (const place of places) {
      cursor += previous ? midpoint(estimateTransfer(previous, place).minutes_range) : (place.transport_from_hotel?.duration_minutes || 30);
      const visitMinutes = visitMinutesForPace(place, request.pace);
      const window = checkOpeningWindow(place, request.date, cursor, visitMinutes);
      if (!window.feasible) {
        removed.push({ place, reason_code: window.reason_code || "opening_window", reason: window.reason || "开放时段不匹配。" });
        continue;
      }
      cursor = (window.adjusted_arrival_minutes ?? cursor) + visitMinutes + paceProfile.per_place_buffer_minutes;
      usable.push(place);
      previous = place;
    }
    return { usable, removed };
  }

  function estimateRouteDuration(places, request, tripConfig = {}, paceProfile = PACE_DEFAULTS.normal) {
    if (!places.length) return { publicEstimate: emptyDurationEstimate(), breakdown: { total: 0, visit: 0, outbound: 0, inbound: 0, transfer: 0, buffer: 0, meal: 0 }, transfers: [] };
    const visit = places.reduce((sum, place) => sum + visitMinutesForPace(place, request.pace), 0);
    const outbound = places[0].transport_from_hotel?.duration_minutes || 30;
    const inbound = places[places.length - 1].transport_from_hotel?.duration_minutes || 30;
    const transfers = [];
    let transferMinutes = 0;
    for (let index = 1; index < places.length; index += 1) {
      const transfer = estimateTransfer(places[index - 1], places[index]);
      transfers.push({ from_place_id: places[index - 1].id, to_place_id: places[index].id, ...transfer });
      transferMinutes += midpoint(transfer.minutes_range);
    }
    const buffer = paceProfile.base_buffer_minutes + (paceProfile.per_place_buffer_minutes * places.length);
    const meal = tripConfig.route_options?.meal_break_minutes?.[request.duration_mode] ?? ({ half_day: 0, most_day: 45, full_day: 60 })[request.duration_mode] ?? 0;
    const total = visit + outbound + inbound + transferMinutes + buffer + meal;
    return {
      publicEstimate: roundedDurationEstimate(total),
      breakdown: { total, visit, outbound, inbound, transfer: transferMinutes, buffer, meal },
      transfers
    };
  }

  function estimateTransfer(fromPlace, toPlace) {
    const distance = haversineKm(fromPlace.location, toPlace.location);
    let minutesRange;
    let category;
    if (fromPlace.area_id === toPlace.area_id) {
      minutesRange = distance <= 1 ? [10, 20] : distance <= 3 ? [15, 30] : [25, 45];
      category = "same_area_estimate";
    } else if (distance <= 3) {
      minutesRange = [20, 35];
      category = "nearby_area_estimate";
    } else if (distance <= 8) {
      minutesRange = [30, 50];
      category = "cross_area_estimate";
    } else if (distance <= 20) {
      minutesRange = [45, 70];
      category = "far_area_estimate";
    } else {
      minutesRange = [60, 100];
      category = "remote_area_estimate";
    }
    return { distance_km_straight: round(distance, 1), minutes_range: minutesRange, category, confidence: "feasibility_only" };
  }

  function findAvailableRestaurants({ restaurants = [], areaIds = [], date, meal, time = null }) {
    const areaSet = new Set(Array.isArray(areaIds) ? areaIds : [areaIds]);
    return restaurants.filter((restaurant) => {
      if (!areaSet.has(restaurant.area_id) || !(restaurant.meal_types || []).includes(meal)) return false;
      const exception = (restaurant.business_hours?.date_exceptions || []).find((item) => item.date === date && serviceMatches(item.service, meal));
      if (exception?.status === "closed") return false;
      const weekday = weekdayForDate(date);
      const explicitOpen = ["open", "expected_open"].includes(exception?.status);
      if (!explicitOpen && (restaurant.business_hours?.closure_rules?.fixed_weekdays || []).includes(weekday)) return false;
      const periods = restaurant.business_hours?.service_periods?.[meal] || [];
      const matching = periods.filter((period) => !(period.days || []).length || period.days.includes(weekday));
      if (!matching.length) return false;
      if (time) {
        const target = timeToMinutes(time);
        const lastOrder = timeToMinutes(restaurant.business_hours?.last_orders?.[meal]);
        if (!matching.some((period) => target >= timeToMinutes(period.start || period.open) && target <= timeToMinutes(period.end || period.close))) return false;
        if (Number.isFinite(lastOrder) && target > lastOrder) return false;
      }
      return true;
    }).sort((a, b) => restaurantCandidateScore(b, meal) - restaurantCandidateScore(a, meal)).map((restaurant) => {
      const queue = restaurant.queue?.by_meal?.[meal] || restaurant.queue || {};
      const reservation = restaurant.reservation?.by_meal?.[meal] || restaurant.reservation || {};
      return {
        restaurant_id: restaurant.id,
        name_zh: restaurant.names?.zh || restaurant.id,
        branch_zh: restaurant.names?.branch_zh || "",
        area_id: restaurant.area_id,
        featured: (restaurant.parent_display?.featured_meals || []).includes(meal),
        parent_summary: restaurant.parent_display?.summary || "",
        queue_level: queue.level || null,
        queue_text: queue.display_text || "排队情况待确认",
        reservation_recommended: Boolean(reservation.recommended)
      };
    });
  }

  function buildDetailedRoute({ request, places, restaurants, tripConfig, transitEdges, paceProfile, durationProfile }) {
    const routeOrigin = request.origin || DEFAULT_TRANSIT_ORIGIN;
    const entityMap = new Map([[routeOrigin.id, routeOrigin]]);
    places.forEach((place) => entityMap.set(place.id, place));
    restaurants.forEach((restaurant) => entityMap.set(restaurant.id, restaurant));
    const graph = buildTransitGraph(transitEdges, request.pace);
    const context = { request, entityMap, graph, paceProfile, tripConfig };
    const orderedPlaces = chooseBestPlaceOrder(places, context);
    const mealPlan = chooseMealAssignments({ request, orderedPlaces, restaurants });
    let plannedStops = orderedPlaces.map((place) => routeStopFromPlace(place, request.pace));
    const arrangedRestaurants = [];
    const unarrangedRestaurants = [...mealPlan.unarranged];

    for (const assignment of mealPlan.assignments) {
      const insertion = chooseMealInsertion(plannedStops, assignment, context);
      if (insertion) {
        plannedStops = insertion.stops;
        arrangedRestaurants.push({
          restaurant_id: assignment.restaurant.id,
          meal_type: assignment.meal,
          selection_type: assignment.selectionType,
          name_zh: restaurantName(assignment.restaurant),
          queue_level: mealSpecific(assignment.restaurant.queue, assignment.meal)?.level || null,
          queue_text: mealSpecific(assignment.restaurant.queue, assignment.meal)?.display_text || "",
          cautions: restaurantCautions(assignment.restaurant, assignment.meal, request.date)
        });
      } else {
        unarrangedRestaurants.push(unarrangedRestaurant(assignment.restaurant, "time_window", `${mealLabel(assignment.meal)}营业或时间窗口无法与主要景点同时满足。`, assignment.meal));
      }
    }

    const simulation = simulateStopSequence(plannedStops, context, true);
    if (!simulation.feasible) {
      return {
        ordered_stops: [], segments: [], arranged_restaurants: [],
        restaurant_alternatives: mealPlan.alternatives,
        unarranged_restaurants: [...unarrangedRestaurants, ...arrangedRestaurants.map((item) => ({ ...item, reason_code: "route_simulation", reason: "正式时间窗复核后无法稳定加入。" }))],
        ticket_suggestions: [], route_warnings: [simulation.reason || "正式路线时间窗无法完成，请调整选择。"],
        transport_coverage: { verified_segments: 0, estimated_segments: 0 },
        detailed_route_status: "not_generated"
      };
    }

    const budget = estimateFormalBudget(simulation, entityMap);
    const totalMinutes = simulation.endMinutes - simulation.startMinutes;
    const actualDuration = roundedDurationEstimate(totalMinutes);
    const walking = estimateFormalWalking(simulation.segments, plannedStops);
    const routeWarnings = [...simulation.warnings];
    const fallbackCount = simulation.segments.filter((segment) => segment.reference_quality === "fallback_estimate").length;
    if (fallbackCount) routeWarnings.push(`${fallbackCount}段尚无正式交通连接，只作为可行性估算；现场请点Google Maps确认。`);
    if (isDepartureDay(request) && request.departure_day?.route_end_deadline == null) {
      routeWarnings.push("你已标记今天是离境日，但尚未设置最晚结束时间；本结果不代表后续行程绝对安全。");
    }
    const formalFeasibility = detailedFeasibility(totalMinutes, durationProfile, fallbackCount, request, tripConfig);

    return {
      ordered_stops: simulation.orderedStops,
      segments: simulation.segments,
      arranged_restaurants: arrangedRestaurants,
      restaurant_alternatives: mealPlan.alternatives,
      unarranged_restaurants: dedupeBy(unarrangedRestaurants, (item) => `${item.restaurant_id}:${item.meal_type || "any"}`),
      ticket_suggestions: suggestTickets(simulation.segments),
      route_warnings: [...new Set(routeWarnings)],
      budget_estimate: budget,
      estimated_duration: actualDuration,
      estimated_walking_level: walking.level,
      estimated_walking_range: walking.range,
      feasibility: formalFeasibility.status,
      feasibility_label: FEASIBILITY_LABELS[formalFeasibility.status],
      feasibility_reasons: formalFeasibility.reasons,
      transport_coverage: {
        verified_segments: simulation.segments.filter((segment) => segment.reference_quality !== "fallback_estimate").length,
        estimated_segments: fallbackCount
      },
      detailed_route_status: "generated"
    };
  }

  function chooseBestPlaceOrder(places, context) {
    if (places.length <= 1) return [...places];
    const candidates = places.length <= 7 ? permutations(places) : [sortPlacesForEvaluation(places, context.request.pace)];
    let best = null;
    for (const order of candidates) {
      const stops = order.map((place) => routeStopFromPlace(place, context.request.pace));
      const simulation = simulateStopSequence(stops, context, false);
      const score = simulation.feasible
        ? simulation.endMinutes - simulation.startMinutes
          + simulation.segments.filter((segment) => segment.reference_quality === "fallback_estimate").length * 90
          + (context.request.pace === "easy" ? simulation.segments.reduce((sum, segment) => sum + segment.walking_minutes * 1.2 + segment.transfer_count * 8, 0) : 0)
        : Number.POSITIVE_INFINITY;
      if (!best || score < best.score) best = { order, score };
    }
    return best && Number.isFinite(best.score) ? best.order : sortPlacesForEvaluation(places, context.request.pace);
  }

  function chooseMealAssignments({ request, orderedPlaces, restaurants }) {
    const routeAreas = new Set(orderedPlaces.map((place) => place.area_id));
    const selected = request.selected_restaurant_ids.map((id) => restaurants.find((restaurant) => restaurant.id === id)).filter(Boolean);
    const grouped = { breakfast: [], lunch: [], dinner: [] };
    const unarranged = [];
    for (const restaurant of selected) {
      const meal = preferredMealForRoute(restaurant, request);
      if (!meal) {
        unarranged.push(unarrangedRestaurant(restaurant, "meal_mismatch", "所选餐厅的供应餐别与本次开始时间不匹配。"));
        continue;
      }
      const availability = checkRestaurantAvailability(restaurant, request.date, meal);
      if (!availability.available) {
        unarranged.push(unarrangedRestaurant(restaurant, availability.reason_code, availability.reason, meal));
        continue;
      }
      const isReturnDinner = meal === "dinner" && restaurant.area_id === "area-meieki";
      if (!routeAreas.has(restaurant.area_id) && !isReturnDinner) {
        unarranged.push(unarrangedRestaurant(restaurant, "area_conflict", "离今天主要游览区域较远，加入后会明显绕路。", meal));
        continue;
      }
      grouped[meal].push({ restaurant, meal, selectionType: "user_selected", score: mealRouteScore(restaurant, orderedPlaces, meal) });
    }

    const assignments = [];
    const alternatives = [];
    for (const meal of ["breakfast", "lunch", "dinner"]) {
      grouped[meal].sort((a, b) => b.score - a.score);
      if (grouped[meal][0]) assignments.push(grouped[meal][0]);
      grouped[meal].slice(1).forEach((item) => alternatives.push({ restaurant_id: item.restaurant.id, name_zh: restaurantName(item.restaurant), meal_type: meal, reason: `同一餐别只安排一家；保留为${mealLabel(meal)}备选。` }));
    }

    const shouldAddLunch = request.duration_mode !== "half_day" && !assignments.some((item) => item.meal === "lunch");
    if (shouldAddLunch) {
      const candidates = findAvailableRestaurants({ restaurants, areaIds: [...routeAreas], date: request.date, meal: "lunch", time: "12:00" });
      const candidate = candidates.map((item) => restaurants.find((restaurant) => restaurant.id === item.restaurant_id)).filter(Boolean)
        .sort((a, b) => systemMealScore(b, orderedPlaces, "lunch") - systemMealScore(a, orderedPlaces, "lunch"))[0];
      if (candidate) assignments.push({ restaurant: candidate, meal: "lunch", selectionType: "system_suggested", score: mealRouteScore(candidate, orderedPlaces, "lunch") });
    }

    return { assignments, alternatives, unarranged };
  }

  function preferredMealForRoute(restaurant, request) {
    const meals = restaurant.meal_types || [];
    const start = timeToMinutes(request.start_time);
    if (meals.includes("breakfast") && start <= timeToMinutes("10:00")) return "breakfast";
    if (meals.includes("lunch") && start < timeToMinutes("14:00")) return "lunch";
    if (meals.includes("dinner")) return "dinner";
    return null;
  }

  function mealRouteScore(restaurant, orderedPlaces, meal) {
    const nearby = new Set(restaurant.nearby_place_ids || []);
    const matchingNearby = orderedPlaces.filter((place) => nearby.has(place.id)).length;
    const sameArea = orderedPlaces.some((place) => place.area_id === restaurant.area_id) ? 1 : 0;
    return matchingNearby * 45 + sameArea * 25 + restaurantCandidateScore(restaurant, meal);
  }

  function systemMealScore(restaurant, orderedPlaces, meal) {
    const queue = mealSpecific(restaurant.queue, meal);
    const practicalPenalty = ({ low: 0, medium: 0, high: 20, very_high: 55 })[queue?.level] || 0;
    return mealRouteScore(restaurant, orderedPlaces, meal) - practicalPenalty;
  }

  function chooseMealInsertion(currentStops, assignment, context) {
    const restaurantStop = routeStopFromRestaurant(assignment.restaurant, assignment.meal, assignment.selectionType, context.request.date, context.tripConfig);
    let best = null;
    for (let index = 0; index <= currentStops.length; index += 1) {
      const stops = [...currentStops.slice(0, index), restaurantStop, ...currentStops.slice(index)];
      const simulation = simulateStopSequence(stops, context, false);
      if (!simulation.feasible) continue;
      const restaurantArrival = simulation.orderedStops.find((stop) => stop.id === assignment.restaurant.id)?.arrival_minutes;
      const configuredTarget = context.tripConfig.route_options?.formal_route?.meal_target_times?.[assignment.meal];
      const target = timeToMinutes(configuredTarget) || ({ breakfast: 510, lunch: 720, dinner: 1080 })[assignment.meal];
      const score = simulation.endMinutes + Math.abs((restaurantArrival || target) - target) * 0.25
        + simulation.segments.filter((segment) => segment.reference_quality === "fallback_estimate").length * 100;
      if (!best || score < best.score) best = { stops, score };
    }
    return best;
  }

  function simulateStopSequence(stops, context, includePublicStops) {
    const startMinutes = timeToMinutes(context.request.start_time);
    const routeOrigin = context.request.origin || DEFAULT_TRANSIT_ORIGIN;
    let cursor = startMinutes;
    let previous = routeOrigin;
    const segments = [];
    const orderedStops = includePublicStops ? [{ id: routeOrigin.id, stop_type: "origin", name_zh: routeOrigin.name_zh, arrival_minutes: cursor, time_label: publicTime(cursor), duration_minutes: 0, area_id: routeOrigin.area_id, cautions: [] }] : [];
    const warnings = [];
    for (const stop of stops) {
      const connection = getTransitConnection(previous, stop.entity, context);
      cursor += connection.estimated_minutes;
      let window;
      if (stop.stop_type === "place") window = checkOpeningWindow(stop.entity, context.request.date, cursor, stop.duration_minutes);
      else window = checkRestaurantServiceWindow(stop.entity, context.request.date, stop.meal_type, cursor, stop.duration_minutes, context.tripConfig);
      if (!window.feasible) return { feasible: false, reason: `${stop.name_zh}：${window.reason || "营业时间不匹配"}`, startMinutes, endMinutes: cursor, segments, orderedStops, warnings };
      if (window.data_warning) warnings.push(`${stop.name_zh}：${window.data_warning}`);
      if (Number.isFinite(window.adjusted_arrival_minutes) && window.adjusted_arrival_minutes > cursor) cursor = window.adjusted_arrival_minutes;
      if (includePublicStops) {
        segments.push(publicSegment(previous, stop.entity, connection));
        orderedStops.push({
          id: stop.id, stop_type: stop.stop_type, meal_type: stop.meal_type || null,
          selection_type: stop.selection_type || null, name_zh: stop.name_zh,
          arrival_minutes: cursor, time_label: stop.stop_type === "restaurant" ? publicMealTime(cursor) : publicTime(cursor),
          duration_minutes: stop.duration_minutes, duration_display: durationText(stop.duration_minutes),
          area_id: stop.entity.area_id, cautions: stop.cautions
        });
      }
      cursor += stop.duration_minutes;
      if (stop.stop_type === "place") cursor += context.paceProfile.per_place_buffer_minutes;
      previous = stop.entity;
    }
    cursor += context.paceProfile.base_buffer_minutes;
    const returnConnection = getTransitConnection(previous, routeOrigin, context);
    cursor += returnConnection.estimated_minutes;
    if (includePublicStops) {
      segments.push(publicSegment(previous, routeOrigin, returnConnection));
      orderedStops.push({ id: routeOrigin.id, stop_type: "destination", name_zh: `返回${routeOrigin.name_zh}`, arrival_minutes: cursor, time_label: publicTime(cursor), duration_minutes: 0, area_id: routeOrigin.area_id, cautions: [] });
      for (const segment of segments) warnings.push(...segment.notes);
    }
    return { feasible: true, startMinutes, endMinutes: cursor, segments, orderedStops, warnings: [...new Set(warnings)] };
  }

  function routeStopFromPlace(place, pace) {
    return { id: place.id, stop_type: "place", name_zh: place.names?.zh || place.id, entity: place, duration_minutes: visitMinutesForPace(place, pace), cautions: placeCautions(place) };
  }

  function routeStopFromRestaurant(restaurant, meal, selectionType, date, tripConfig) {
    const queue = mealSpecific(restaurant.queue, meal);
    const queueMargin = tripConfig.route_options?.formal_route?.queue_planning_margin_minutes?.[queue?.level] ?? ({ high: 10, very_high: 25 })[queue?.level] ?? 0;
    const base = tripConfig.route_options?.formal_route?.meal_stop_minutes?.[meal] ?? ({ breakfast: 45, lunch: 60, dinner: 75 })[meal] ?? 60;
    return { id: restaurant.id, stop_type: "restaurant", meal_type: meal, selection_type: selectionType, name_zh: restaurantName(restaurant), entity: restaurant, duration_minutes: base + queueMargin, cautions: restaurantCautions(restaurant, meal, date) };
  }

  function checkRestaurantAvailability(restaurant, date, meal) {
    const exception = (restaurant.business_hours?.date_exceptions || []).find((item) => item.date === date && serviceMatches(item.service, meal));
    if (exception?.status === "closed") return { available: false, reason_code: "date_closed", reason: exception.note || `${dateLabel(date)}休息。`, warnings: [] };
    const weekday = weekdayForDate(date);
    const explicitOpen = ["open", "expected_open"].includes(exception?.status);
    if (!explicitOpen && (restaurant.business_hours?.closure_rules?.fixed_weekdays || []).includes(weekday)) return { available: false, reason_code: "fixed_weekday", reason: `${dateLabel(date)}为固定休息日。`, warnings: [] };
    const periods = (restaurant.business_hours?.service_periods?.[meal] || []).filter((period) => !(period.days || []).length || period.days.includes(weekday));
    if (!periods.length) return { available: false, reason_code: "meal_not_served", reason: `当天不供应${mealLabel(meal)}。`, warnings: [] };
    const dataWarning = exception ? null : "该日期临时营业信息待确认；固定休业和常规营业时间已参与判断。";
    return { available: true, periods, warnings: dataWarning ? [dataWarning] : [], data_warning: dataWarning };
  }

  function checkRestaurantServiceWindow(restaurant, date, meal, arrivalMinutes, mealMinutes, tripConfig = {}) {
    const availability = checkRestaurantAvailability(restaurant, date, meal);
    if (!availability.available) return { feasible: false, ...availability };
    const lastOrder = timeToMinutes(restaurant.business_hours?.last_orders?.[meal]);
    for (const period of availability.periods) {
      const open = timeToMinutes(period.start || period.open);
      const close = timeToMinutes(period.end || period.close);
      if (!Number.isFinite(open) || !Number.isFinite(close)) continue;
      const configuredEarliest = timeToMinutes(tripConfig.route_options?.formal_route?.meal_earliest_times?.[meal]);
      const adjusted = Math.max(arrivalMinutes, open, Number.isFinite(configuredEarliest) ? configuredEarliest : 0);
      if (Number.isFinite(lastOrder) && adjusted > lastOrder) continue;
      if (adjusted + mealMinutes <= close + 15) return { feasible: true, adjusted_arrival_minutes: adjusted, wait_minutes: Math.max(0, open - arrivalMinutes), data_warning: availability.data_warning };
    }
    return { feasible: false, reason_code: "restaurant_window", reason: `${mealLabel(meal)}营业时间或Last Order赶不上。` };
  }

  function buildTransitGraph(edges, pace) {
    const graph = new Map();
    const add = (from, to, edge, option, reversed) => {
      if (!graph.has(from)) graph.set(from, []);
      graph.get(from).push({ to, edge, option: reversed ? reverseOption(option) : option, cost: optionCost(option, pace) });
    };
    for (const edge of edges) {
      const option = chooseTransitOption(edge.options || [], pace);
      if (!option) continue;
      add(edge.origin_id, edge.destination_id, edge, option, false);
      if (edge.bidirectional) add(edge.destination_id, edge.origin_id, edge, option, true);
    }
    return graph;
  }

  function getTransitConnection(from, to, context) {
    if (from.id === to.id) return zeroConnection();
    const path = shortestTransitPath(from.id, to.id, context.graph);
    if (path) return aggregateTransitPath(path);
    const researchedAccess = getResearchedAccessConnection(from, to);
    if (researchedAccess) return researchedAccess;
    return fallbackConnection(from, to);
  }

  function getResearchedAccessConnection(from, to) {
    const pair = [[from, to, false], [to, from, true]];
    for (const [entity, other, reversed] of pair) {
      if (entity?.meal_types) {
        if (other.id === DEFAULT_TRANSIT_ORIGIN.id && Number.isFinite(entity.access_from_hotel?.duration_minutes)) {
          const modes = entity.access_from_hotel.modes || [];
          return accessConnection(entity.access_from_hotel.duration_minutes, modes.includes("walk") ? "walk" : "mixed", entity.access_from_hotel.duration_minutes, entity.access_from_hotel.source_ids || [], reversed);
        }
        const access = (entity.access_from_nearby_places || []).find((item) => item.place_id === other.id && Number.isFinite(item.walking_minutes));
        if (access) return accessConnection(access.walking_minutes, "walk", access.walking_minutes, access.source_ids || [], reversed);
      }
    }
    if (from.id === DEFAULT_TRANSIT_ORIGIN.id && to.transport_from_hotel?.duration_minutes) return stationPlaceConnection(to, false);
    if (to.id === DEFAULT_TRANSIT_ORIGIN.id && from.transport_from_hotel?.duration_minutes) return stationPlaceConnection(from, true);
    return null;
  }

  function accessConnection(minutes, mode, walkingMinutes, sourceIds) {
    return { mode, operator_id: null, line: null, boarding_station: null, alighting_station: null, transfer_count: 0, estimated_minutes: minutes, walking_minutes: walkingMinutes, fare_yen: mode === "walk" ? 0 : null, fare_type: mode === "walk" ? "free" : "unknown", notes: [], source_ids: sourceIds, official_timetable_source_ids: [], reference_quality: "researched_access", steps: [] };
  }

  function stationPlaceConnection(place) {
    const transport = place.transport_from_hotel || {};
    const route = transport.reference_route_text || "名古屋站至景点参考交通";
    const mode = /步行/.test(route) ? "walk" : /名铁|Aonami|青波|JR/.test(route) ? "train" : /巴士/.test(route) ? "city_bus" : "subway";
    const fare = transport.one_way_fare?.amount;
    return { mode, operator_id: null, line: route, boarding_station: "名古屋站", alighting_station: place.location?.nearest_stations?.[0] || null, transfer_count: transport.transfer_count || 0, estimated_minutes: transport.duration_minutes, walking_minutes: transport.walking_minutes_after_arrival || 0, fare_yen: Number.isFinite(fare) ? fare : null, fare_type: Number.isFinite(fare) ? "researched_place_access" : "unknown", notes: ["该段沿用名古屋站附近出发参考；出发前请用Google Maps确认实际车次。"], source_ids: transport.source_ids || [], official_timetable_source_ids: [], reference_quality: "researched_access", steps: [] };
  }

  function shortestTransitPath(originId, destinationId, graph) {
    if (!graph.has(originId)) return null;
    const distances = new Map([[originId, 0]]);
    const previous = new Map();
    const pending = new Set(graph.keys());
    pending.add(destinationId);
    while (pending.size) {
      let current = null;
      let currentDistance = Number.POSITIVE_INFINITY;
      for (const node of pending) {
        const distance = distances.get(node) ?? Number.POSITIVE_INFINITY;
        if (distance < currentDistance) { current = node; currentDistance = distance; }
      }
      if (current == null || !Number.isFinite(currentDistance)) break;
      pending.delete(current);
      if (current === destinationId) break;
      for (const link of graph.get(current) || []) {
        const candidate = currentDistance + link.cost;
        if (candidate < (distances.get(link.to) ?? Number.POSITIVE_INFINITY)) {
          distances.set(link.to, candidate);
          previous.set(link.to, { from: current, link });
          pending.add(link.to);
        }
      }
    }
    if (!previous.has(destinationId)) return null;
    const path = [];
    let node = destinationId;
    while (node !== originId) {
      const item = previous.get(node);
      if (!item) return null;
      path.unshift(item.link);
      node = item.from;
    }
    return path;
  }

  function aggregateTransitPath(path) {
    const options = path.map((item) => item.option);
    const allWalk = options.every((option) => option.mode === "walk");
    const knownFares = options.map((option) => option.fare_yen);
    const timetableSources = [...new Set(options.map((option) => option.official_timetable_source_id).filter(Boolean))];
    return {
      mode: allWalk ? "walk" : options.length === 1 ? options[0].mode : "mixed",
      operator_id: options.length === 1 ? options[0].operator_id : null,
      line: [...new Set(options.map((option) => option.line).filter(Boolean))].join("＋") || null,
      boarding_station: options.find((option) => option.boarding_station)?.boarding_station || null,
      alighting_station: [...options].reverse().find((option) => option.alighting_station)?.alighting_station || null,
      transfer_count: options.reduce((sum, option) => sum + (option.transfer_count || 0), 0) + Math.max(0, options.filter((option) => option.mode !== "walk").length - 1),
      estimated_minutes: options.reduce((sum, option) => sum + option.estimated_minutes, 0),
      walking_minutes: options.reduce((sum, option) => sum + option.walking_minutes, 0),
      fare_yen: knownFares.every(Number.isFinite) ? knownFares.reduce((sum, fare) => sum + fare, 0) : null,
      fare_type: knownFares.every(Number.isFinite) ? "adult_regular_reference" : "partly_unknown",
      notes: [...new Set(options.flatMap((option) => option.notes || []))],
      source_ids: [...new Set(options.flatMap((option) => option.source_ids || []))],
      official_timetable_source_ids: timetableSources,
      reference_quality: "verified_edge",
      steps: options.map((option) => ({ mode: option.mode, operator_id: option.operator_id, line: option.line, boarding_station: option.boarding_station, alighting_station: option.alighting_station, estimated_minutes: option.estimated_minutes, walking_minutes: option.walking_minutes, fare_yen: option.fare_yen }))
    };
  }

  function fallbackConnection(from, to) {
    const transfer = estimateTransfer(normalizePlace(from), normalizePlace(to));
    return { mode: "estimated", operator_id: null, line: null, boarding_station: null, alighting_station: null, transfer_count: null, estimated_minutes: midpoint(transfer.minutes_range), walking_minutes: 0, fare_yen: null, fare_type: "unknown", notes: ["此段尚无正式交通连接，仅用于可行性估算。"], source_ids: [], official_timetable_source_ids: [], reference_quality: "fallback_estimate", steps: [] };
  }

  function publicSegment(from, to, connection) {
    return {
      origin_id: from.id, origin_name_zh: entityName(from), destination_id: to.id, destination_name_zh: entityName(to),
      mode: connection.mode, operator_id: connection.operator_id, line: connection.line,
      boarding_station: connection.boarding_station, alighting_station: connection.alighting_station,
      transfer_count: connection.transfer_count, estimated_minutes: connection.estimated_minutes,
      duration_display: `约${roundToFive(connection.estimated_minutes)}分钟`, walking_minutes: connection.walking_minutes,
      fare_yen: connection.fare_yen, fare_display: Number.isFinite(connection.fare_yen) ? (connection.fare_yen === 0 ? "免费" : `约¥${connection.fare_yen} / 人`) : "费用待确认",
      fare_type: connection.fare_type, notes: connection.notes, source_ids: connection.source_ids,
      official_timetable_source_ids: connection.official_timetable_source_ids,
      reference_quality: connection.reference_quality, steps: connection.steps,
      navigation_mode: connection.mode === "walk" ? "walking" : "transit"
    };
  }

  function chooseTransitOption(options, pace) {
    return [...options].sort((a, b) => optionCost(a, pace) - optionCost(b, pace))[0] || null;
  }

  function optionCost(option, pace) {
    if (pace === "easy") return option.estimated_minutes + option.walking_minutes * 1.5 + option.transfer_count * 10;
    if (pace === "active") return option.estimated_minutes + option.walking_minutes * 0.15 + option.transfer_count * 3;
    return option.estimated_minutes + option.walking_minutes * 0.6 + option.transfer_count * 6;
  }

  function reverseOption(option) {
    return { ...option, boarding_station: option.alighting_station, alighting_station: option.boarding_station };
  }

  function zeroConnection() {
    return { mode: "walk", operator_id: null, line: null, boarding_station: null, alighting_station: null, transfer_count: 0, estimated_minutes: 0, walking_minutes: 0, fare_yen: 0, fare_type: "free", notes: [], source_ids: [], official_timetable_source_ids: [], reference_quality: "verified_edge", steps: [] };
  }

  function estimateFormalBudget(simulation, entityMap) {
    let transportKnown = 0;
    let transportUnknown = 0;
    for (const segment of simulation.segments) {
      if (Number.isFinite(segment.fare_yen)) transportKnown += segment.fare_yen;
      else transportUnknown += 1;
    }
    let admissionKnown = 0;
    const admissionUnknown = [];
    let mealMin = 0;
    let mealMax = 0;
    const mealUnknown = [];
    for (const stop of simulation.orderedStops) {
      const entity = entityMap.get(stop.id);
      if (!entity) continue;
      if (stop.stop_type === "place") {
        if (Number.isFinite(entity.admission?.adult_amount)) admissionKnown += entity.admission.adult_amount;
        else admissionUnknown.push(stop.id);
      }
      if (stop.stop_type === "restaurant") {
        const budget = entity.price_per_person?.by_meal?.[stop.meal_type] || entity.price_per_person;
        if (Number.isFinite(budget?.min_amount) && Number.isFinite(budget?.max_amount)) {
          mealMin += budget.min_amount;
          mealMax += budget.max_amount;
        } else mealUnknown.push(stop.id);
      }
    }
    return {
      admission: { known_amount_per_person: admissionKnown, currency: "JPY", unknown_place_ids: admissionUnknown },
      transport: { reference_amount_per_person: transportKnown, currency: "JPY", estimate_type: "formal_segments", unknown_segment_count: transportUnknown },
      meal_budget_range: { min_amount_per_person: mealMin, max_amount_per_person: mealMax, currency: "JPY", unknown_restaurant_ids: mealUnknown }
    };
  }

  function suggestTickets(segments) {
    const suggestions = [];
    const subwaySegments = segments.filter((segment) => segment.operator_id === "transport-nagoya-subway");
    const subwayFare = subwaySegments.reduce((sum, segment) => sum + (segment.fare_yen || 0), 0);
    if (subwayFare >= 760) suggestions.push({ ticket_id: "subway-24-hour", name_zh: "地铁全线24小时券", price_yen: 760, reason: "本路线已知地铁单买费用达到或超过票价，可比较后购买。", source_id: "src-transit-day-passes" });
    const meguruSegments = segments.filter((segment) => segment.operator_id === "transport-meguru");
    if (meguruSegments.length >= 3) suggestions.push({ ticket_id: "meguru-one-day", name_zh: "Me～guru 1DAY券", price_yen: 500, reason: "本路线预计乘坐Me～guru至少3次，日票比单次购买更合适。", source_id: "src-transit-meguru-guide" });
    return suggestions;
  }

  function estimateFormalWalking(segments, stops) {
    const walkingMinutes = segments.reduce((sum, segment) => sum + (segment.walking_minutes || 0), 0);
    const placeBurden = stops.filter((stop) => stop.stop_type === "place").reduce((sum, stop) => sum + walkingScore(stop.entity.parent_access?.walking_intensity), 0);
    const score = walkingMinutes / 25 + placeBurden / Math.max(1, stops.length);
    const level = score <= 2.2 ? "轻松" : score <= 4 ? "普通" : "较多";
    const km = walkingMinutes * 0.065;
    return { level, range: walkingMinutes ? { min_km: round(Math.max(0.5, km * 0.8), 1), max_km: round(Math.max(1, km * 1.2), 1), display_text: `约${round(Math.max(0.5, km * 0.8), 1)}～${round(Math.max(1, km * 1.2), 1)}公里（仅转场步行参考）` } : null };
  }

  function detailedFeasibility(totalMinutes, profile, fallbackCount, request, tripConfig) {
    let severity = totalMinutes > profile.max_minutes * 1.3 ? 2 : totalMinutes > profile.max_minutes * 1.08 ? 1 : 0;
    const reasons = [severity === 0 ? "正式交通、开放时间与用餐窗口可以衔接。" : severity === 1 ? "路线可以执行，但按建议停留会稍显紧凑。" : "正式交通与停留合计明显超过所选时长。"];
    if (fallbackCount) { severity = Math.max(severity, 1); reasons.push("部分转场仍是估算，现场需要再次确认。"); }
    if (isDepartureDay(request)) {
      severity = Math.max(severity, request.duration_mode === "full_day" ? 2 : 1);
      const deadline = timeToMinutes(request.departure_day?.route_end_deadline);
      const estimatedEnd = timeToMinutes(request.start_time) + totalMinutes;
      if (!Number.isFinite(deadline)) {
        reasons.push("离境日未设置最晚结束时间，不能据此判断后续安排绝对安全。");
      } else if (estimatedEnd > deadline) {
        severity = 2;
        reasons.push(`预计结束时间晚于你填写的${request.departure_day.route_end_deadline}。`);
      } else {
        reasons.push(`已按你填写的${request.departure_day.route_end_deadline}最晚结束时间检查。`);
      }
    }
    return { status: severity === 0 ? "good" : severity === 1 ? "moderate" : "poor", reasons };
  }

  function placeCautions(place) {
    const notes = [...(place.notes || []), place.parent_access?.barrier_free_notes].filter(Boolean);
    return notes.filter((note) => /不能进入|无法进入|陡|楼梯|暴晒|施工|关闭/.test(note)).slice(0, 2);
  }

  function restaurantCautions(restaurant, meal, date) {
    const currentDateLabel = date ? dateLabel(date) : null;
    const cautions = (restaurant.parent_display?.cautions || [])
      .filter((item) => !item.meal_types?.length || item.meal_types.includes(meal))
      .filter((item) => item.tone !== "closed" || !/\d+月\d+日/.test(item.text) || item.text.includes(currentDateLabel))
      .map((item) => item.text.replace(/，?本次旅行当天不可用/g, "；选择该日期时不可安排").replace(/本次旅行/g, "所选日期"));
    const queue = mealSpecific(restaurant.queue, meal);
    if (["high", "very_high"].includes(queue?.level) && queue.display_text) cautions.push(queue.display_text);
    return [...new Set(cautions)].slice(0, 3);
  }

  function mealSpecific(block, meal) {
    return block?.by_meal?.[meal] || block || {};
  }

  function normalizePlace(entity) {
    return { id: entity.id, area_id: entity.area_id, location: entity.location || DEFAULT_TRANSIT_ORIGIN.location };
  }

  function unarrangedRestaurant(restaurant, reasonCode, reason, meal = null) {
    return { restaurant_id: restaurant.id, name_zh: restaurantName(restaurant), meal_type: meal, reason_code: reasonCode, reason };
  }

  function restaurantName(restaurant) {
    return `${restaurant.names?.zh || restaurant.id}${restaurant.names?.branch_zh ? ` · ${restaurant.names.branch_zh}` : ""}`;
  }

  function entityName(entity) {
    if (entity.id === DEFAULT_TRANSIT_ORIGIN.id) return entity.name_zh || DEFAULT_TRANSIT_ORIGIN.name_zh;
    if (entity.meal_types) return restaurantName(entity);
    return entity.names?.zh || entity.name_zh || entity.id;
  }

  function mealLabel(meal) {
    return ({ breakfast: "早餐", lunch: "午餐", dinner: "晚餐" })[meal] || meal;
  }

  function publicTime(minutes) {
    const rounded = Math.round(minutes / 15) * 15;
    return `约${String(Math.floor(rounded / 60)).padStart(2, "0")}:${String(rounded % 60).padStart(2, "0")}`;
  }

  function publicMealTime(minutes) {
    const rounded = Math.round(minutes / 30) * 30;
    const hour = Math.floor(rounded / 60);
    const minute = rounded % 60;
    return minute ? `约${hour}:${String(minute).padStart(2, "0")}` : `约${hour}点`;
  }

  function durationText(minutes) {
    if (minutes < 60) {
      const lower = Math.max(15, Math.floor(minutes / 15) * 15);
      const upper = Math.ceil(minutes / 15) * 15;
      if (lower === upper) return `约${lower}分钟`;
      return `约${lower}～${upper}分钟`;
    }

    const lower = Math.max(60, Math.floor(minutes / 30) * 30);
    const upper = Math.ceil(minutes / 30) * 30;
    if (lower === upper) return `约${formatHours(lower)}小时`;
    return `约${formatHours(lower)}～${formatHours(upper)}小时`;
  }

  function roundToFive(value) {
    return Math.max(5, Math.round(value / 5) * 5);
  }

  function permutations(items) {
    if (items.length <= 1) return [items];
    const output = [];
    items.forEach((item, index) => {
      const remaining = [...items.slice(0, index), ...items.slice(index + 1)];
      permutations(remaining).forEach((tail) => output.push([item, ...tail]));
    });
    return output;
  }

  function dedupeBy(items, keyFn) {
    const seen = new Set();
    return items.filter((item) => { const key = keyFn(item); if (seen.has(key)) return false; seen.add(key); return true; });
  }

  function determineFeasibility({ selectedPlaces, usablePlaces, recommendedPlaces, request, durationProfile, estimateMinutes, walkingLevel, remoteAreaIds, departureDay, unavailableCount }) {
    const reasons = [];
    const warnings = [];
    const areas = new Set(usablePlaces.map((place) => place.area_id));
    const remoteAreas = [...areas].filter((areaId) => remoteAreaIds.has(areaId));
    const ratio = recommendedPlaces.length / selectedPlaces.length;
    let severity = 0;
    if (areas.size >= 3) {
      severity = Math.max(severity, request.duration_mode === "half_day" ? 2 : 1);
      reasons.push("所选地点分布在多个区域，转场负担较高。");
    } else if (areas.size === 1) {
      reasons.push("建议地点集中在同一片区域，转场较少。");
    } else {
      reasons.push("包含两个区域，建议只保留距离较近的组合。");
    }
    if (remoteAreas.length && areas.size > 1) {
      severity = Math.max(severity, request.duration_mode === "half_day" ? 2 : 1);
      reasons.push("远郊区域不适合与多个市区区域在短时间内混排。");
    }
    if (ratio < 1) {
      severity = Math.max(severity, ratio < 0.5 ? 2 : 1);
      reasons.push(`本次建议安排${recommendedPlaces.length}个，另外${selectedPlaces.length - recommendedPlaces.length}个留作其他时间。`);
    }
    if (estimateMinutes > durationProfile.max_minutes * 1.5) {
      severity = Math.max(severity, 2);
      reasons.push("即使裁剪后，预计时间仍明显超过所选时长。");
    } else if (estimateMinutes > durationProfile.max_minutes * 1.15) {
      severity = Math.max(severity, 1);
      reasons.push("组合本身合理，但按建议停留时间会稍显紧凑。");
    } else {
      reasons.push("时间预算能覆盖游览、转场和必要休息缓冲。");
    }
    if (walkingLevel === "较多" && request.pace === "easy") {
      severity = Math.max(severity, 2);
      reasons.push("当前组合的步行量与“少走路”偏好不太匹配。");
    }
    if (unavailableCount) {
      severity = Math.max(severity, 1);
      reasons.push(`有${unavailableCount}个景点当天不可用，已自动排除。`);
    }
    if (departureDay) {
      const deadline = request.departure_day?.route_end_deadline;
      warnings.push(deadline ? `你已标记今天是离境日；路线将以${deadline}为希望最晚结束时间。` : "你已标记今天是离境日，但尚未填写最晚结束时间；默认只建议轻松活动。");
      if (remoteAreas.length || request.duration_mode === "full_day") {
        severity = Math.max(severity, 2);
        reasons.push("离境日不建议安排远郊或高强度全天活动。");
      }
    }
    if (request.start_time >= "13:00" && request.duration_mode === "full_day") {
      severity = Math.max(severity, 2);
      reasons.push("下午开始无法提供完整的全天游览窗口。");
    }
    return { status: severity === 0 ? "good" : severity === 1 ? "moderate" : "poor", reasons: [...new Set(reasons)], warnings };
  }

  function estimateBudget(places) {
    let admissionKnown = 0;
    const admissionUnknown = [];
    const fareByArea = new Map();
    const transportUnknown = new Set();
    for (const place of places) {
      if (Number.isFinite(place.admission?.adult_amount)) admissionKnown += place.admission.adult_amount;
      else admissionUnknown.push(place.id);
      const fare = place.transport_from_hotel?.one_way_fare?.amount;
      if (Number.isFinite(fare)) fareByArea.set(place.area_id, Math.max(fareByArea.get(place.area_id) || 0, fare));
      else transportUnknown.add(place.area_id);
    }
    return {
      admission: { known_amount_per_person: admissionKnown, currency: "JPY", unknown_place_ids: admissionUnknown },
      transport: { reference_amount_per_person: [...fareByArea.values()].reduce((sum, fare) => sum + fare * 2, 0), currency: "JPY", estimate_type: "hotel_round_trip_proxy", unknown_area_ids: [...transportUnknown] },
      meal_budget_range: null
    };
  }

  function estimateWalkingLevel(places) {
    const average = places.reduce((sum, place) => sum + walkingScore(place.parent_access?.walking_intensity), 0) / places.length;
    const areaPenalty = new Set(places.map((place) => place.area_id)).size > 1 ? 0.5 : 0;
    const countPenalty = places.length >= 4 ? 0.4 : 0;
    const score = average + areaPenalty + countPenalty;
    return score <= 1.6 ? "轻松" : score <= 2.45 ? "普通" : "较多";
  }

  function roundedDurationEstimate(minutes) {
    const lower = Math.max(60, Math.floor((minutes * 0.9) / 30) * 30);
    const upper = Math.max(lower + 30, Math.ceil((minutes * 1.1) / 30) * 30);
    return { internal_minutes: Math.round(minutes), min_minutes: lower, max_minutes: upper, display_text: `约${formatHours(lower)}～${formatHours(upper)}小时` };
  }

  function emptyDurationEstimate() {
    return { internal_minutes: 0, min_minutes: 0, max_minutes: 0, display_text: "待选择景点" };
  }

  function emptyBudgetEstimate() {
    return {
      admission: { known_amount_per_person: 0, currency: "JPY", unknown_place_ids: [] },
      transport: { reference_amount_per_person: 0, currency: "JPY", estimate_type: "hotel_round_trip_proxy", unknown_area_ids: [] },
      meal_budget_range: null
    };
  }

  function getDurationProfile(id, tripConfig) {
    return tripConfig.route_options?.duration_profiles?.find((profile) => profile.id === id) || DURATION_DEFAULTS[id] || DURATION_DEFAULTS.half_day;
  }

  function getPaceProfile(id, tripConfig) {
    return tripConfig.route_options?.pace_profiles?.find((profile) => profile.id === id) || PACE_DEFAULTS[id] || PACE_DEFAULTS.normal;
  }

  function visitMinutesForPace(place, pace) {
    const duration = place.visit_duration_minutes || {};
    return pace === "active" ? Math.max(duration.quick || 30, Math.round((duration.recommended || duration.quick || 45) * 0.8)) : (duration.recommended || duration.quick || 60);
  }

  function sortPlacesForEvaluation(places, pace) {
    return [...places].sort((a, b) => {
      const closeA = timeToMinutes(a.opening_hours?.last_admission || closingTime(a));
      const closeB = timeToMinutes(b.opening_hours?.last_admission || closingTime(b));
      if ((Number.isFinite(closeA) ? closeA : 1440) !== (Number.isFinite(closeB) ? closeB : 1440)) return (Number.isFinite(closeA) ? closeA : 1440) - (Number.isFinite(closeB) ? closeB : 1440);
      const walkDifference = pace === "easy" ? walkingScore(a.parent_access?.walking_intensity) - walkingScore(b.parent_access?.walking_intensity) : 0;
      return walkDifference || (b.ratings?.recommendation?.stars || 0) - (a.ratings?.recommendation?.stars || 0);
    });
  }

  function closingTime(place) {
    return place.opening_hours?.weekly?.find((period) => period.close)?.close || null;
  }

  function clusterScore(cluster, request, departureDay) {
    const recommendation = cluster.places.reduce((sum, place) => sum + (place.ratings?.recommendation?.stars || 3), 0);
    const walkingPenalty = request.pace === "easy" ? cluster.places.reduce((sum, place) => sum + walkingScore(place.parent_access?.walking_intensity), 0) : 0;
    const remotePenalty = cluster.remote && (departureDay || request.duration_mode === "half_day") ? 18 : 0;
    return cluster.places.length * 12 + recommendation - walkingPenalty - remotePenalty;
  }

  function restaurantCandidateScore(restaurant, meal) {
    const featured = (restaurant.parent_display?.featured_meals || []).includes(meal) ? 30 : 0;
    const stars = (restaurant.ratings?.recommendation?.stars || 3) * 5;
    const queue = restaurant.queue?.by_meal?.[meal] || restaurant.queue || {};
    return featured + stars - (({ low: 0, medium: 3, high: 7, very_high: 12 })[queue.level] || 4);
  }

  function publicCluster(cluster) {
    return { id: cluster.id, area_id: cluster.area_id, area_name_zh: cluster.area_name_zh, place_ids: [...cluster.place_ids], compatibility: cluster.compatibility, remote: cluster.remote };
  }

  function isDepartureDay(request) {
    return request?.departure_day?.is_departure_day === true;
  }

  function serviceMatches(service, meal) {
    return !service || service.split(",").map((item) => item.trim()).includes(meal);
  }

  function isValidIsoDate(date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
    const parsed = new Date(`${date}T12:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  }

  function weekdayForDate(date) {
    return WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()];
  }

  function timeToMinutes(value) {
    if (typeof value === "number") return value;
    if (!/^\d{2}:\d{2}$/.test(value || "")) return Number.NaN;
    const [hours, minutes] = value.split(":").map(Number);
    return hours * 60 + minutes;
  }

  function walkingScore(label = "") {
    if (label.includes("普通到较多")) return 2.6;
    if (label.includes("较多")) return 3;
    if (label === "普通") return 2;
    if (label.includes("少到普通")) return 1.5;
    if (label.includes("少")) return 1;
    return 2;
  }

  function haversineKm(a = {}, b = {}) {
    if (![a.latitude, a.longitude, b.latitude, b.longitude].every(Number.isFinite)) return 8;
    const rad = (value) => value * Math.PI / 180;
    const dLat = rad(b.latitude - a.latitude);
    const dLon = rad(b.longitude - a.longitude);
    const lat1 = rad(a.latitude);
    const lat2 = rad(b.latitude);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function centroid(places) {
    const valid = places.filter((place) => Number.isFinite(place.location?.latitude) && Number.isFinite(place.location?.longitude));
    if (!valid.length) return { latitude: null, longitude: null };
    return { latitude: valid.reduce((sum, place) => sum + place.location.latitude, 0) / valid.length, longitude: valid.reduce((sum, place) => sum + place.location.longitude, 0) / valid.length };
  }

  function centroidDistanceKm(a, b) {
    return haversineKm(a.centroid, b.centroid);
  }

  function midpoint(range) {
    return Math.round((range[0] + range[1]) / 2);
  }

  function formatHours(minutes) {
    const value = minutes / 60;
    return Number.isInteger(value) ? String(value) : value.toFixed(1);
  }

  function dateLabel(date) {
    return `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
  }

  function round(value, digits) {
    const factor = 10 ** digits;
    return Math.round(value * factor) / factor;
  }

  root.NagoyaRoutePlanner = {
    version: "route-planner-2.0",
    implemented: "phase-4b",
    createRequest,
    analyze,
    checkPlaceAvailability,
    checkOpeningWindow,
    clusterSelectedPlaces,
    estimateTransfer,
    estimateRouteDuration,
    findAvailableRestaurants,
    checkRestaurantAvailability,
    buildTransitGraph,
    getTransitConnection,
    buildDetailedRoute,
    estimateBudget,
    FEASIBILITY_LABELS
  };
})(typeof window !== "undefined" ? window : globalThis);
