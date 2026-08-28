(function (root) {
  "use strict";

  function buildGoogleMapsSearchUrl(location) {
    const query = [location?.name, location?.address].filter(Boolean).join(" ");
    return query
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
      : "";
  }

  function buildAmapSearchUrl(location) {
    const query = [location?.name, location?.address].filter(Boolean).join(" ");
    return query
      ? `https://uri.amap.com/search?keyword=${encodeURIComponent(query)}&city=${encodeURIComponent("日本名古屋")}&src=nagoya-family-trip&callnative=0`
      : "";
  }

  function routePoint(location) {
    const latitude = location?.latitude ?? location?.location?.latitude;
    const longitude = location?.longitude ?? location?.location?.longitude;
    if (Number.isFinite(latitude) && Number.isFinite(longitude)) return `${latitude},${longitude}`;
    return [location?.name, location?.name_zh, location?.address || location?.location?.address].filter(Boolean).join(" ");
  }

  root.NagoyaMaps = {
    buildLocationLinks(location) {
      return {
        amap: buildAmapSearchUrl(location),
        google_maps: buildGoogleMapsSearchUrl(location)
      };
    },

    buildRouteLinks(origin, destination, travelMode = "transit") {
      const originText = routePoint(origin);
      const destinationText = routePoint(destination);

      return {
        amap: buildAmapSearchUrl(destination),
        google_maps: originText && destinationText
          ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(originText)}&destination=${encodeURIComponent(destinationText)}&travelmode=${travelMode === "walking" ? "walking" : "transit"}`
          : ""
      };
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
