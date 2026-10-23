// Provides small, handwritten fake Qloo responses; none were copied from the service.
// Called by: tests/unit/qloo-search.test.ts and tests/unit/qloo-insights.test.ts

export const FAKE_BRAND_RESPONSE = {
  results: [
    {
      entity_id: "00000000-0000-4000-8000-000000000001", name: "Fake Outdoor Co", popularity: 0.8,
      properties: { short_description: "A fictional outdoor brand." },
      tags: [
        { tag_id: "urn:tag:keyword:qloo:hiking", name: "Hiking", type: "urn:tag:keyword:qloo" },
        { tag_id: "urn:tag:genre:brand:outdoor", name: "Outdoor", type: "urn:tag:genre:brand" },
        { tag_id: "urn:tag:target_age_group:qloo:fake", name: "Fake restricted tag", type: "urn:tag:target_age_group:qloo" },
      ],
    },
    {
      entity_id: "00000000-0000-4000-8000-000000000002", name: "Fake Coffee Co", popularity: 0.4,
      tags: [{ tag_id: "urn:tag:keyword:qloo:coffee", name: "Coffee", type: "urn:tag:keyword:qloo" }],
    },
  ],
};

export const FAKE_TAG_RESPONSE = {
  results: { tags: [
    { id: "urn:tag:category:place:coffee_shop", name: "Coffee shop", type: "urn:tag:category:place" },
    { id: "urn:tag:category:place:hospital", name: "Hospital", type: "urn:tag:category:place" },
    { id: "not-a-category", name: "Fake invalid category" },
  ] },
};

const WEEKDAY_HOURS = [{ opens: "T10:00:00", closes: "T17:00:00", closed: false }];
export const FAKE_PLACE = {
  entity_id: "00000000-0000-4000-8000-000000000011", name: "Fake Coffee Shop", popularity: 0.7,
  location: { lat: 39.75, lon: -104.99 }, disambiguation: "Fictional coffee shop",
  properties: {
    address: "10 Fictional Lane", phone: "+1-555-0100", website: "https://fake.example",
    hours: {
      monday: WEEKDAY_HOURS, tuesday: WEEKDAY_HOURS, wednesday: WEEKDAY_HOURS,
      thursday: WEEKDAY_HOURS, friday: WEEKDAY_HOURS,
      saturday: [{ opens: "T10:00:00", closes: "T16:00:00", closed: false }], sunday: [{ closed: true }],
    },
    is_closed: false, business_rating: 4.6, price_level: 2,
    short_description: "A fictional neighborhood cafe.", description: "A longer fictional description.",
    unique_selling_points: "Handmade pretend pastries.",
    primary_genre: { id: "urn:tag:genre:place:coffee_shop", name: "Coffee shop" },
    neighborhood: "Fake district", keywords: ["coffee"], customer_demographics_description: "Excluded fake text",
  },
  external: { google_place: [{ place_id: "fake-google-place" }], tripadvisor: [{ rating: 4.5, rating_count: 23 }] },
  query: {
    distance: 120, affinity: 0.18,
    explainability: { "signal.interests.entities": [{ entity_id: "00000000-0000-4000-8000-000000000001", score: 1 }] },
  },
};

export const FAKE_PLACES_RESPONSE = {
  results: { entities: [
    FAKE_PLACE,
    {
      entity_id: "00000000-0000-4000-8000-000000000012", name: "Fake Closed Cafe",
      location: { lat: 39.76, lon: -104.98 }, properties: { is_closed: true, price_level: null },
    },
    { entity_id: "00000000-0000-4000-8000-000000000013", name: "Fake Missing Location" },
  ] },
};

export const FAKE_LOCALITY_RESPONSE = {
  ...FAKE_PLACES_RESPONSE,
  query: { localities: { filter: [{ name: "Fake district", location: { lat: 39.75, lon: -104.99 } }] } },
};
