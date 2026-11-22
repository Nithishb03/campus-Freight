const axios = require('axios');
const config = require('../utils/config');

/**
 * Campus Vehicle Speed Constants (km/h and meters/min)
 */
const VEHICLE_SPEEDS_M_PER_MIN = {
  VAN: (15 * 1000) / 60,         // 15 km/h = 250 m/min
  ECART: (12 * 1000) / 60,       // 12 km/h = 200 m/min
  CARGO_BIKE: (10 * 1000) / 60,  // 10 km/h = 166.67 m/min
  HAND_TROLLEY: (4 * 1000) / 60  // 4 km/h  = 66.67 m/min
};

class CampusAIService {
  constructor() {
    this.apiKey = config.GEMINI_API_KEY;
    this.modelName = 'gemini-2.0-flash';
    this.baseURL = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent`;
  }

  /**
   * Helper: Calculate distance in meters between two positions.
   * Priority: 3D Grid mapPosition (x, y) scaled at 1 grid unit = 0.8 meters (Euclidean).
   * Fallback: Haversine distance if only geographic { lat, lng } are present.
   */
  calculateDistanceMeters(pos1, pos2) {
    if (!pos1 || !pos2) return 0;

    // 1. Primary: 3D Grid mapPosition (x, y) scaled at 1 grid unit = 0.8 meters
    const getX = (p) => (p.mapPosition?.x !== undefined ? p.mapPosition.x : (p.x !== undefined ? p.x : null));
    const getY = (p) => (p.mapPosition?.y !== undefined ? p.mapPosition.y : (p.y !== undefined ? p.y : null));

    const x1 = getX(pos1);
    const y1 = getY(pos1);
    const x2 = getX(pos2);
    const y2 = getY(pos2);

    if (x1 !== null && y1 !== null && x2 !== null && y2 !== null) {
      const dx = Number(x2) - Number(x1);
      const dy = Number(y2) - Number(y1);
      const gridUnits = Math.sqrt(dx * dx + dy * dy);
      // 1 grid unit = 0.8 meters
      return Math.round(gridUnits * 0.8);
    }

    // 2. Secondary Fallback: Haversine distance using { lat, lng }
    const getLat = (p) => (p.coordinates?.lat !== undefined ? p.coordinates.lat : (p.lat !== undefined ? p.lat : null));
    const getLng = (p) => (p.coordinates?.lng !== undefined ? p.coordinates.lng : (p.lng !== undefined ? p.lng : null));

    const lat1 = getLat(pos1);
    const lng1 = getLng(pos1);
    const lat2 = getLat(pos2);
    const lng2 = getLng(pos2);

    if (lat1 !== null && lng1 !== null && lat2 !== null && lng2 !== null) {
      const nLat1 = Number(lat1);
      const nLng1 = Number(lng1);
      const nLat2 = Number(lat2);
      const nLng2 = Number(lng2);

      if (!isNaN(nLat1) && !isNaN(nLng1) && !isNaN(nLat2) && !isNaN(nLng2)) {
        const R = 6371000; // Earth's mean radius in meters
        const toRad = (deg) => (deg * Math.PI) / 180;
        const dLat = toRad(nLat2 - nLat1);
        const dLng = toRad(nLng2 - nLng1);
        const a =
          Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(nLat1)) * Math.cos(toRad(nLat2)) *
          Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return Math.round(R * c);
      }
    }

    return 0;
  }

  /**
   * Method 1: Optimize campus multi-stop delivery route
   * Uses priority-weighted nearest-neighbor deterministic fallback, optionally enriched by Gemini.
   */
  async optimizeCampusRoute({ startHub, stops = [], vehicleType = 'ECART' }) {
    const effectiveVehicleType = vehicleType || 'ECART';
    const speedMPerMin = VEHICLE_SPEEDS_M_PER_MIN[effectiveVehicleType] || VEHICLE_SPEEDS_M_PER_MIN.ECART;

    // Start position coordinates and 3D mapPosition
    const startPos = {
      hubId: startHub?.hubId || 'MAIN-MAILROOM',
      code: startHub?.code || startHub?.hubId || 'MAIN-MAILROOM',
      name: startHub?.name || startHub?.hubId || 'Main Entrance & Mailroom',
      zone: startHub?.zone || 'ADMIN',
      mapPosition: startHub?.mapPosition || { x: 420, y: 80, z: 0 },
      dimensions: startHub?.dimensions || { width: 90, depth: 45, height: 25 },
      coordinates: startHub?.coordinates || { lat: 12.9258, lng: 77.4983 }
    };
    const startName = startPos.name;

    if (!stops || stops.length === 0) {
      return {
        source: 'fallback',
        vehicleType: effectiveVehicleType,
        orderedStops: [],
        totalDistanceMeters: 0,
        estimatedMinutes: 0,
        reasoning: `No stops provided for route starting from ${startName}.`
      };
    }

    // Normalize stops to include 3D mapPosition and dimensions
    const normalizedStops = stops.map((s) => ({
      orderId: s.orderId,
      trackingId: s.trackingId || s.orderId,
      hubId: s.hubId || s.code,
      code: s.code || s.hubId,
      buildingName: s.buildingName || s.hubId,
      zone: s.zone || 'ACADEMIC',
      mapPosition: s.mapPosition || { x: 420, y: 80, z: 0 },
      dimensions: s.dimensions || { width: 80, depth: 60, height: 35 },
      coordinates: s.coordinates || { lat: 12.9237, lng: 77.4987 },
      priority: s.priority || 'STANDARD',
      isFragile: Boolean(s.isFragile)
    }));

    // --- Deterministic Priority-Weighted Nearest-Neighbor Algorithm ---
    const remainingStops = [...normalizedStops];
    const orderedStops = [];
    let currentPos = startPos;
    let totalDistanceMeters = 0;
    let totalHandlingMinutes = 0;

    while (remainingStops.length > 0) {
      // Find highest priority available among remaining stops
      const hasUrgent = remainingStops.some((s) => s.priority === 'URGENT');
      const candidateIndices = [];

      remainingStops.forEach((stop, index) => {
        if (hasUrgent) {
          if (stop.priority === 'URGENT') candidateIndices.push(index);
        } else {
          candidateIndices.push(index);
        }
      });

      // From candidate stops, find the one with the shortest distance (3D Euclidean scaled)
      let bestCandidateIndex = candidateIndices[0];
      let shortestDistance = this.calculateDistanceMeters(currentPos, remainingStops[bestCandidateIndex]);

      for (let i = 1; i < candidateIndices.length; i++) {
        const idx = candidateIndices[i];
        const dist = this.calculateDistanceMeters(currentPos, remainingStops[idx]);
        if (dist < shortestDistance) {
          shortestDistance = dist;
          bestCandidateIndex = idx;
        }
      }

      const nextStop = remainingStops.splice(bestCandidateIndex, 1)[0];
      orderedStops.push(nextStop);
      totalDistanceMeters += shortestDistance;

      // Handling time: 3 mins baseline + 2 extra mins if fragile
      const handlingTime = 3 + (nextStop.isFragile ? 2 : 0);
      totalHandlingMinutes += handlingTime;

      currentPos = nextStop;
    }

    const travelMinutes = totalDistanceMeters / speedMPerMin;
    const estimatedMinutes = Math.max(1, Math.round(travelMinutes + totalHandlingMinutes));

    const fallbackResult = {
      source: 'fallback',
      vehicleType: effectiveVehicleType,
      orderedStops,
      totalDistanceMeters,
      estimatedMinutes,
      reasoning: `Priority-weighted nearest-neighbor route departing ${startName} via ${effectiveVehicleType}, prioritizing urgent cargo and minimizing intra-campus travel.`
    };

    // --- Optional Gemini AI Enhancement ---
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'your_gemini_api_key') {
      return fallbackResult;
    }

    try {
      const stopsSummary = orderedStops.map((s, i) => ({
        index: i + 1,
        trackingId: s.trackingId || s.orderId,
        buildingName: s.buildingName || s.hubId,
        zone: s.zone,
        mapPosition: s.mapPosition,
        priority: s.priority || 'STANDARD',
        isFragile: Boolean(s.isFragile)
      }));

      const prompt = `You are an AI logistics dispatcher for a university campus.
We are dispatching a ${effectiveVehicleType} starting from ${startName}.
Current planned stops:
${JSON.stringify(stopsSummary, null, 2)}

Provide routing refinement taking into account:
1. Urgent cargo MUST be delivered first.
2. Fragile cargo requires gentler/careful transit.
3. Campus pedestrian walkways and high-traffic class-change zones.

Respond ONLY with valid JSON in this exact structure:
{
  "orderedTrackingIds": ["TRACKING_ID_1", "TRACKING_ID_2"],
  "reasoning": "A single concise sentence explaining why this sequence is optimal for campus delivery."
}`;

      const response = await axios.post(
        `${this.baseURL}?key=${this.apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 600
          }
        },
        { timeout: 4000 }
      );

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return fallbackResult;

      // Clean JSON formatting
      const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      if (Array.isArray(parsed.orderedTrackingIds) && parsed.orderedTrackingIds.length === orderedStops.length) {
        // Re-order stops according to Gemini recommendation while keeping 3D mapPosition & dimensions
        const stopMap = new Map();
        orderedStops.forEach((s) => stopMap.set(s.trackingId || s.orderId, s));

        const geminiOrdered = [];
        for (const id of parsed.orderedTrackingIds) {
          if (stopMap.has(id)) {
            geminiOrdered.push(stopMap.get(id));
          }
        }

        // Validate all stops were accounted for
        if (geminiOrdered.length === orderedStops.length) {
          // Re-calculate distance and time
          let geminiDist = 0;
          let gCurrent = startPos;
          geminiOrdered.forEach((s) => {
            geminiDist += this.calculateDistanceMeters(gCurrent, s);
            gCurrent = s;
          });

          const geminiTravelMins = geminiDist / speedMPerMin;
          const geminiEstMins = Math.max(1, Math.round(geminiTravelMins + totalHandlingMinutes));

          return {
            source: 'gemini',
            vehicleType: effectiveVehicleType,
            orderedStops: geminiOrdered,
            totalDistanceMeters: geminiDist,
            estimatedMinutes: geminiEstMins,
            reasoning: parsed.reasoning || fallbackResult.reasoning
          };
        }
      }

      return fallbackResult;
    } catch (error) {
      // Graceful fallback on network, timeout, or rate-limit issues
      return fallbackResult;
    }
  }

  /**
   * Method 2: Recommend optimal campus vehicle dispatch
   * Filters by pedestrian accessibility and weight capacity, with deterministic fallback and optional Gemini enrichment.
   */
  async recommendDispatch({
    pickupNode,
    dropoffNode,
    weightKg = 0,
    isFragile = false,
    priority = 'STANDARD',
    availableVehicles = []
  }) {
    const weight = Number(weightKg) || 0;
    const fragile = Boolean(isFragile);
    const requiresAdminApproval = fragile || weight > 50;

    // Calculate distance between pickup and dropoff nodes (3D Euclidean scaled, or Haversine fallback)
    const distanceMeters = this.calculateDistanceMeters(
      pickupNode,
      dropoffNode
    );

    // 1. Filter compatible vehicles
    const compatibleVehicles = (availableVehicles || []).filter((v) => {
      if (v.status === 'MAINTENANCE' || v.isActive === false) return false;

      // Accessibility filter: vehicle type must be permitted at BOTH pickup and dropoff nodes
      const allowedAtPickup = pickupNode?.accessibleBy?.includes(v.type);
      const allowedAtDropoff = dropoffNode?.accessibleBy?.includes(v.type);
      if (!allowedAtPickup || !allowedAtDropoff) return false;

      // Weight capacity filter
      const remainingCapacity = Number(v.maxWeightKg || 0) - Number(v.currentLoadKg || 0);
      return remainingCapacity >= weight;
    });

    // If no vehicle satisfies constraints
    if (compatibleVehicles.length === 0) {
      return {
        source: 'fallback',
        recommendedVehicle: null,
        compatibleVehiclesCount: 0,
        distanceMeters,
        estimatedMinutes: 0,
        requiresAdminApproval,
        reasoning: `No active vehicle matches accessibility constraints for ${pickupNode?.name || pickupNode?.hubId} → ${dropoffNode?.name || dropoffNode?.hubId} with payload of ${weight} kg.`
      };
    }

    // 2. Deterministic Vehicle Selection
    // Smallest sufficient capacity to reserve larger vehicles for bulk freight.
    // If fragile, prefer enclosed vehicles (ECART or VAN).
    const sorted = [...compatibleVehicles].sort((a, b) => {
      if (fragile) {
        const getFragileScore = (type) => {
          if (type === 'ECART') return 3;
          if (type === 'VAN') return 2;
          if (type === 'CARGO_BIKE') return 1;
          return 0;
        };
        const scoreDiff = getFragileScore(b.type) - getFragileScore(a.type);
        if (scoreDiff !== 0) return scoreDiff;
      }
      return (a.maxWeightKg || 0) - (b.maxWeightKg || 0);
    });

    const recommendedVehicle = sorted[0];

    // Calculate estimated minutes:
    // Speed + 3 mins pickup handling + 3 mins dropoff handling (+ 2 min extra if fragile)
    const speedMPerMin = VEHICLE_SPEEDS_M_PER_MIN[recommendedVehicle.type] || VEHICLE_SPEEDS_M_PER_MIN.ECART;
    const travelMinutes = distanceMeters / speedMPerMin;
    const handlingMinutes = 6 + (fragile ? 2 : 0);
    const estimatedMinutes = Math.max(1, Math.round(travelMinutes + handlingMinutes));

    const fallbackReasoning = fragile
      ? `Selected ${recommendedVehicle.name} (${recommendedVehicle.type}) to provide vibration-dampened enclosed transit for fragile cargo across ${pickupNode?.hubId} → ${dropoffNode?.hubId}.`
      : `Selected ${recommendedVehicle.name} (${recommendedVehicle.type}) as the most compact, efficient vehicle satisfying ${weight} kg payload and campus zone access.`;

    const fallbackResult = {
      source: 'fallback',
      recommendedVehicle,
      compatibleVehiclesCount: compatibleVehicles.length,
      distanceMeters,
      estimatedMinutes,
      requiresAdminApproval,
      reasoning: fallbackReasoning
    };

    // --- Optional Gemini AI Enrichment ---
    if (!this.apiKey || this.apiKey.trim() === '' || this.apiKey === 'your_gemini_api_key') {
      return fallbackResult;
    }

    try {
      const prompt = `You are a campus freight logistics dispatcher.
Cargo details:
- Pickup: ${pickupNode?.name || pickupNode?.hubId} (Accessible by: ${(pickupNode?.accessibleBy || []).join(', ')})
- Dropoff: ${dropoffNode?.name || dropoffNode?.hubId} (Accessible by: ${(dropoffNode?.accessibleBy || []).join(', ')})
- Weight: ${weight} kg
- Fragile: ${fragile}
- Priority: ${priority}
- Recommended vehicle: ${recommendedVehicle.name} (${recommendedVehicle.type}, max ${recommendedVehicle.maxWeightKg} kg)
- Distance: ${distanceMeters} meters

Respond ONLY with valid JSON in this exact structure:
{
  "reasoning": "A single concise sentence explaining why this vehicle assignment is optimal for this campus route."
}`;

      const response = await axios.post(
        `${this.baseURL}?key=${this.apiKey}`,
        {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 300
          }
        },
        { timeout: 4000 }
      );

      const rawText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) return fallbackResult;

      const cleanedJson = rawText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(cleanedJson);

      if (parsed.reasoning) {
        return {
          ...fallbackResult,
          source: 'gemini',
          reasoning: parsed.reasoning
        };
      }

      return fallbackResult;
    } catch (error) {
      return fallbackResult;
    }
  }
}

module.exports = new CampusAIService();
