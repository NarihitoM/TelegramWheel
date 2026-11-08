type FontWeight = 400 | 700;

export interface ImageFont {
  name: string;
  data: ArrayBuffer;
  weight: FontWeight;
  style: "normal";
}

interface FontSource {
  family: string;
  weights: FontWeight[];
  pattern?: RegExp;
}

const SYMBOL_PATTERN = /[\u2000-\u2BFF\u{1F000}-\u{1F2FF}\u{1F650}-\u{1F67F}\u{1F780}-\u{1F8FF}\u{1FB00}-\u{1FBFF}]/u;

function script(family: string, pattern: RegExp): FontSource {
  return { family, weights: [400], pattern };
}

const SOURCES: FontSource[] = [
  { family: "Noto Sans", weights: [400, 700] },
  { family: "Noto Sans Myanmar", weights: [400, 700], pattern: /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/u },
  script("Noto Sans Math", /[\u2100-\u214F\u27C0-\u27EF\u2980-\u2AFF\u{1D400}-\u{1D7FF}]/u),
  script("Noto Sans Symbols", SYMBOL_PATTERN),
  script("Noto Sans Symbols 2", SYMBOL_PATTERN),
  script("Noto Music", /[\u2669-\u266F\u{1D000}-\u{1D24F}]/u),
  script("Noto Sans Armenian", /[\u0530-\u058F\uFB13-\uFB17]/u),
  script("Noto Sans Georgian", /[\u10A0-\u10FF\u1C90-\u1CBF\u2D00-\u2D2F]/u),
  script("Noto Sans Ethiopic", /[\u1200-\u139F\u2D80-\u2DDF\uAB00-\uAB2F]/u),
  script("Noto Sans Cherokee", /[\u13A0-\u13FF\uAB70-\uABBF]/u),
  script("Noto Sans Canadian Aboriginal", /[\u1400-\u167F\u18B0-\u18FF]/u),
  script("Noto Sans Ogham", /[\u1680-\u169F]/u),
  script("Noto Sans Runic", /[\u16A0-\u16FF]/u),
  script("Noto Sans Khmer", /[\u1780-\u17FF\u19E0-\u19FF]/u),
  script("Noto Sans Lao", /[\u0E80-\u0EFF]/u),
  script("Noto Serif Tibetan", /[\u0F00-\u0FFF]/u),
  script("Noto Sans Sinhala", /[\u0D80-\u0DFF]/u),
  script("Noto Sans Gujarati", /[\u0A80-\u0AFF]/u),
  script("Noto Sans Gurmukhi", /[\u0A00-\u0A7F]/u),
  script("Noto Sans Oriya", /[\u0B00-\u0B7F]/u),
  script("Noto Sans Mongolian", /[\u1800-\u18AF]/u),
  script("Noto Sans Syriac", /[\u0700-\u074F]/u),
  script("Noto Sans Thaana", /[\u0780-\u07BF]/u),
  script("Noto Sans NKo", /[\u07C0-\u07FF]/u),
  script("Noto Sans Tifinagh", /[\u2D30-\u2D7F]/u),
  script("Noto Sans Coptic", /[\u2C80-\u2CFF]/u),
  script("Noto Sans Glagolitic", /[\u2C00-\u2C5F]/u),
  script("Noto Sans Vai", /[\uA500-\uA63F]/u),
  script("Noto Sans Lisu", /[\uA4D0-\uA4FF]/u),
  script("Noto Sans Yi", /[\uA000-\uA4CF]/u),
  script("Noto Sans Javanese", /[\uA980-\uA9DF]/u),
  script("Noto Sans Balinese", /[\u1B00-\u1B7F]/u),
  script("Noto Sans Sundanese", /[\u1B80-\u1BBF]/u),
  script("Noto Sans Old Italic", /[\u{10300}-\u{1032F}]/u),
  script("Noto Sans Gothic", /[\u{10330}-\u{1034F}]/u),
  script("Noto Sans Egyptian Hieroglyphs", /[\u{13000}-\u{1342F}]/u),
];

export const IMAGE_FONT_FAMILY = SOURCES.map((source) => `"${source.family}"`).join(", ");

const TTF_USER_AGENT =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

const FETCH_TIMEOUT_MS = 5000;
const FETCH_ATTEMPTS = 3;

const cache = new Map<string, ArrayBuffer>();

async function fetchFont(family: string, weight: FontWeight, text: string): Promise<ArrayBuffer | null> {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text });
  const css = await fetch(`https://fonts.googleapis.com/css2?${params}`, {
    headers: { "User-Agent": TTF_USER_AGENT },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  }).then((response) => (response.ok ? response.text() : ""));

  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) {
    return null;
  }
  const font = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
  return font.ok ? font.arrayBuffer() : null;
}

async function fetchWithRetry(family: string, weight: FontWeight, text: string): Promise<ArrayBuffer | null> {
  for (let attempt = 0; attempt < FETCH_ATTEMPTS; attempt++) {
    const data = await fetchFont(family, weight, text).catch(() => null);
    if (data) {
      return data;
    }
  }
  return null;
}

async function loadFont(family: string, weight: FontWeight, text: string): Promise<ArrayBuffer | null> {
  const key = `${family}|${weight}|${text}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const data = await fetchWithRetry(family, weight, text);
  if (data) {
    cache.set(key, data);
  }
  return data;
}

const MYANMAR_SYLLABLE = /([\u1000-\u1021\u103F])(\u1039[\u1000-\u1021])?([\u103B-\u103E]*)(\u1031)?/gu;
const MEDIAL_RA = "\u103C";
const VOWEL_E = "\u1031";

export function toVisualOrder(text: string): string {
  return text.replace(MYANMAR_SYLLABLE, (_, consonant: string, stacked = "", medials: string, vowelE = "") => {
    const ra = medials.includes(MEDIAL_RA) ? MEDIAL_RA : "";
    return `${vowelE ? VOWEL_E : ""}${ra}${consonant}${stacked}${medials.replace(MEDIAL_RA, "")}`;
  });
}

export async function loadImageFonts(texts: string[]): Promise<ImageFont[] | undefined> {
  const text = [...new Set([...texts.join("")])].sort().join("");
  const wanted = SOURCES.filter((source) => !source.pattern || source.pattern.test(text));

  const fonts = await Promise.all(
    wanted.flatMap((source) =>
      source.weights.map(async (weight) => {
        const data = await loadFont(source.family, weight, text);
        return data ? { name: source.family, data, weight, style: "normal" as const } : null;
      }),
    ),
  );

  const loaded = fonts.filter((font): font is ImageFont => font !== null);
  return loaded.some((font) => font.name === "Noto Sans") ? loaded : undefined;
}
