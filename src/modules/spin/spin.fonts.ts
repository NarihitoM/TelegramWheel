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

const SOURCES: FontSource[] = [
  { family: "Noto Sans", weights: [400, 700] },
  { family: "Noto Sans Myanmar", weights: [400, 700], pattern: /[\u1000-\u109F\uA9E0-\uA9FF\uAA60-\uAA7F]/u },
  { family: "Noto Sans Math", weights: [400], pattern: /[\u2100-\u214F\u{1D400}-\u{1D7FF}]/u },
  { family: "Noto Sans Symbols", weights: [400], pattern: /[\u2190-\u2BFF\u{1F100}-\u{1F1FF}]/u },
  { family: "Noto Sans Symbols 2", weights: [400], pattern: /[\u2190-\u2BFF\u{1F100}-\u{1F1FF}]/u },
  { family: "Noto Sans Javanese", weights: [400], pattern: /[\uA980-\uA9DF]/u },
];

export const IMAGE_FONT_FAMILY = SOURCES.map((source) => `"${source.family}"`).join(", ");

const TTF_USER_AGENT =
  "Mozilla/5.0 (Macintosh; U; Intel Mac OS X 10_6_8; de-at) AppleWebKit/533.21.1 (KHTML, like Gecko) Version/5.0.5 Safari/533.21.1";

const cache = new Map<string, Promise<ArrayBuffer | null>>();

async function fetchFont(family: string, weight: FontWeight, text: string): Promise<ArrayBuffer | null> {
  const params = new URLSearchParams({ family: `${family}:wght@${weight}`, text });
  const css = await fetch(`https://fonts.googleapis.com/css2?${params}`, {
    headers: { "User-Agent": TTF_USER_AGENT },
  }).then((response) => (response.ok ? response.text() : ""));

  const url = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/)?.[1];
  if (!url) {
    return null;
  }
  const font = await fetch(url);
  return font.ok ? font.arrayBuffer() : null;
}

function loadFont(family: string, weight: FontWeight, text: string): Promise<ArrayBuffer | null> {
  const key = `${family}|${weight}|${text}`;
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  const pending = fetchFont(family, weight, text).catch(() => null);
  cache.set(key, pending);
  return pending;
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
