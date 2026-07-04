// The deterministic topic → factors association table. This is the ONLY
// place topic knowledge lives — edit here to tune what a topic maps to.
// Factors must come from FACTOR_VOCABULARY (lib/events/topic.ts); a verify
// check (npm run verify:events) guards the table against typos.
//
// House/sign/point factors are inert while detection is sky-only (events
// carry planet names only) but are kept so natal contacts get topic scoring
// for free when they return.

export interface TopicEntry {
  keywords: readonly string[]; // lowercase stems; matched prefix-tolerantly
  factors: readonly string[];
}

export const TOPIC_TABLE: readonly TopicEntry[] = [
  {
    keywords: ["career", "work", "job", "promotion", "profession", "business",
               "vocation", "ambition", "boss", "employ"],
    factors: ["Saturn", "Sun", "Midheaven", "10th house", "Capricorn"],
  },
  {
    keywords: ["relationship", "love", "partner", "dating", "marriage",
               "romance", "wedding", "crush", "breakup", "divorce", "spouse"],
    factors: ["Venus", "Mars", "7th house", "Libra", "5th house"],
  },
  {
    keywords: ["money", "finance", "income", "salary", "wealth", "debt",
               "invest", "saving", "possession"],
    factors: ["Venus", "Jupiter", "2nd house", "8th house", "Taurus"],
  },
  {
    keywords: ["health", "body", "energy", "fitness", "illness", "healing",
               "diet", "vitality", "exercise"],
    factors: ["Sun", "Mars", "6th house", "1st house", "Virgo"],
  },
  {
    keywords: ["growth", "luck", "opportunity", "travel", "abroad",
               "adventure", "expansion", "university", "philosophy", "legal",
               "law", "faith"],
    factors: ["Jupiter", "9th house", "Sagittarius"],
  },
  {
    keywords: ["home", "family", "house", "parent", "mother", "father",
               "move", "moving", "relocation", "roots"],
    factors: ["Moon", "4th house", "Cancer"],
  },
  {
    keywords: ["communication", "study", "learning", "writing", "sibling",
               "school", "exam", "speaking", "negotiation"],
    factors: ["Mercury", "3rd house", "Gemini"],
  },
  {
    keywords: ["creativity", "art", "children", "child", "play", "hobby",
               "performance", "pleasure"],
    factors: ["Sun", "Venus", "5th house", "Leo"],
  },
  {
    keywords: ["friend", "community", "network", "group", "social", "cause"],
    factors: ["Uranus", "11th house", "Aquarius"],
  },
  {
    keywords: ["spirituality", "spiritual", "dream", "intuition",
               "meditation", "retreat", "solitude", "subconscious"],
    factors: ["Neptune", "Moon", "12th house", "Pisces"],
  },
  {
    keywords: ["transformation", "loss", "grief", "crisis", "rebirth",
               "ending", "power", "secret", "intimacy"],
    factors: ["Pluto", "8th house", "Scorpio"],
  },
  {
    keywords: ["identity", "self", "confidence", "purpose", "direction",
               "appearance"],
    factors: ["Sun", "Ascendant", "1st house", "Aries"],
  },
  {
    keywords: ["emotion", "feeling", "mood", "comfort", "security"],
    factors: ["Moon", "Cancer"],
  },
  {
    keywords: ["change", "freedom", "disruption", "surprise", "rebellion"],
    factors: ["Uranus", "Aquarius"],
  },
];

// Fallback for topics no keyword matches: broad on purpose (luminaries,
// benefic + malefic, greater benefic + malefic, the angles) so an unmatched
// topic still gets the strongest, most personally significant events rather
// than an empty — and therefore junk — ranking.
export const DEFAULT_FACTORS: readonly string[] = [
  "Sun", "Moon", "Venus", "Mars", "Jupiter", "Saturn", "Ascendant", "Midheaven",
];
