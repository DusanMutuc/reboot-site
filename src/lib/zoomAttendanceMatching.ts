export type ZoomMatchPerson = {
  id: string;
  name: string;
  email: string;
};

export type ZoomAttendanceAlias = {
  alias_key: string;
  alias: string;
  user_id: string;
};

export type ZoomAutomaticMatch = {
  key: string;
  raw: string;
  occurrences: number;
  person: ZoomMatchPerson;
  method:
    | 'approved_alias'
    | 'exact'
    | 'strong_fuzzy'
    | 'name_subset'
    | 'unique_single_word';
};

export type ZoomReviewMatch = {
  key: string;
  raw: string;
  occurrences: number;
  kind: 'possible_match' | 'ambiguous' | 'unmatched';
  candidates: ZoomMatchPerson[];
  reason: string;
};

export type ZoomAttendanceAnalysis = {
  totalRows: number;
  uniqueNames: number;
  automatic: ZoomAutomaticMatch[];
  review: ZoomReviewMatch[];
};

export function normalizeZoomName(value: string): string {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rawNameKeys(raw: string): string[] {
  const normalized = normalizeZoomName(raw);
  if (!normalized) return [];

  const keys = new Set<string>([normalized]);
  const commaParts = raw
    .split(',')
    .map(normalizeZoomName)
    .filter(Boolean);

  if (commaParts.length === 2) {
    keys.add(`${commaParts[1]} ${commaParts[0]}`);
    keys.add(`${commaParts[0]} ${commaParts[1]}`);
  }

  const tokens = normalized.split(' ').filter(Boolean);
  if (tokens.length >= 2) {
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    keys.add(`${first} ${last}`);
    keys.add(`${last} ${first}`);
  }

  return [...keys];
}

function canonicalPersonTokens(person: ZoomMatchPerson): string[] {
  return normalizeZoomName(person.name).split(' ').filter(Boolean);
}

function addCandidate(
  candidates: Map<string, ZoomMatchPerson>,
  people: ZoomMatchPerson[] | undefined,
) {
  for (const person of people ?? []) {
    candidates.set(person.id, person);
  }
}

function buildIndexes(people: ZoomMatchPerson[]) {
  const byName = new Map<string, ZoomMatchPerson[]>();
  const byWord = new Map<string, ZoomMatchPerson[]>();

  for (const person of people) {
    const tokens = canonicalPersonTokens(person);
    if (!tokens.length) continue;

    const nameKeys = new Set<string>([tokens.join(' ')]);
    if (tokens.length >= 2) {
      const first = tokens[0];
      const last = tokens[tokens.length - 1];
      nameKeys.add(`${first} ${last}`);
      nameKeys.add(`${last} ${first}`);
      nameKeys.add(tokens.join(''));
    }

    for (const key of nameKeys) {
      const current = byName.get(key) ?? [];
      current.push(person);
      byName.set(key, current);
    }

    const wordKeys = new Set(tokens.filter((token) => token.length >= 2));
    for (const word of wordKeys) {
      const current = byWord.get(word) ?? [];
      current.push(person);
      byWord.set(word, current);
    }
  }

  return { byName, byWord };
}

function levenshteinDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (!left.length) return right.length;
  if (!right.length) return left.length;

  let previous = Array.from({ length: right.length + 1 }, (_, index) => index);

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1;
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + substitutionCost,
      );
    }
    previous = current;
  }

  return previous[right.length];
}

function isStrongTwoTokenMatch(rawTokens: string[], personTokens: string[]): boolean {
  if (rawTokens.length !== 2 || personTokens.length < 2) return false;

  const personPair = [personTokens[0], personTokens[personTokens.length - 1]];
  const pairings = [personPair, [personPair[1], personPair[0]]];

  return pairings.some((candidateTokens) => {
    const distances = rawTokens.map((token, index) =>
      levenshteinDistance(token, candidateTokens[index]),
    );
    const exactCount = distances.filter((distance) => distance === 0).length;
    const typoIndex = distances.findIndex((distance) => distance === 1);

    // One part must agree exactly. The other may contain one edit, but only
    // when both words are long enough for that edit to be meaningful.
    return (
      exactCount === 1 &&
      typoIndex >= 0 &&
      rawTokens[typoIndex].length >= 5 &&
      candidateTokens[typoIndex].length >= 5
    );
  });
}

function findStrongFuzzyCandidates(
  raw: string,
  people: ZoomMatchPerson[],
): ZoomMatchPerson[] {
  const rawTokens = normalizeZoomName(raw).split(' ').filter(Boolean);
  if (rawTokens.length !== 2) return [];

  return people.filter((person) =>
    isStrongTwoTokenMatch(rawTokens, canonicalPersonTokens(person)),
  );
}

function findNameSubsetCandidates(
  raw: string,
  people: ZoomMatchPerson[],
): ZoomMatchPerson[] {
  const rawTokens = normalizeZoomName(raw).split(' ').filter(Boolean);
  if (rawTokens.length < 3) return [];

  const rawCounts = new Map<string, number>();
  for (const token of rawTokens) {
    rawCounts.set(token, (rawCounts.get(token) ?? 0) + 1);
  }

  return people.filter((person) => {
    const personTokens = canonicalPersonTokens(person);
    if (personTokens.length < 2 || personTokens.length >= rawTokens.length) return false;

    const tokenOptions = [personTokens];
    if (personTokens.length > 2) {
      tokenOptions.push([personTokens[0], personTokens[personTokens.length - 1]]);
    }

    return tokenOptions.some((tokens) => {
      const required = new Map<string, number>();
      for (const token of tokens) {
        required.set(token, (required.get(token) ?? 0) + 1);
      }

      return [...required].every(
        ([token, count]) => (rawCounts.get(token) ?? 0) >= count,
      );
    });
  });
}

function findUniqueWordCandidates(
  raw: string,
  byWord: Map<string, ZoomMatchPerson[]>,
): ZoomMatchPerson[] {
  const words = normalizeZoomName(raw)
    .split(' ')
    .filter((word) => word.length >= 2);
  const candidates = new Map<string, ZoomMatchPerson>();

  for (const word of new Set(words)) {
    const peopleForWord = new Map(
      (byWord.get(word) ?? []).map((person) => [person.id, person]),
    );
    if (peopleForWord.size === 1) {
      const person = [...peopleForWord.values()][0];
      candidates.set(person.id, person);
    }
  }

  return [...candidates.values()];
}

function groupNames(names: string[]) {
  const grouped = new Map<string, { key: string; raw: string; occurrences: number }>();

  for (const rawValue of names) {
    const raw = rawValue.trim();
    const key = normalizeZoomName(raw);
    if (!key) continue;

    const existing = grouped.get(key);
    if (existing) {
      existing.occurrences += 1;
    } else {
      grouped.set(key, { key, raw, occurrences: 1 });
    }
  }

  return [...grouped.values()];
}

export function analyzeZoomAttendanceNames(
  names: string[],
  people: ZoomMatchPerson[],
  approvedAliases: ZoomAttendanceAlias[] = [],
): ZoomAttendanceAnalysis {
  const groups = groupNames(names);
  const { byName, byWord } = buildIndexes(people);
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const aliasesByKey = new Map(
    approvedAliases.map((alias) => [alias.alias_key, alias]),
  );
  const automatic: ZoomAutomaticMatch[] = [];
  const review: ZoomReviewMatch[] = [];

  for (const group of groups) {
    const approvedAlias = aliasesByKey.get(group.key);
    const aliasedPerson = approvedAlias
      ? peopleById.get(approvedAlias.user_id)
      : undefined;

    if (aliasedPerson) {
      automatic.push({
        ...group,
        person: aliasedPerson,
        method: 'approved_alias',
      });
      continue;
    }

    let method: ZoomAutomaticMatch['method'] | null = 'exact';
    let candidatesMap = new Map<string, ZoomMatchPerson>();

    for (const key of rawNameKeys(group.raw)) {
      addCandidate(candidatesMap, byName.get(key));
    }

    if (candidatesMap.size === 0) {
      method = 'strong_fuzzy';
      candidatesMap = new Map(
        findStrongFuzzyCandidates(group.raw, people).map((person) => [person.id, person]),
      );
    }

    if (candidatesMap.size === 0) {
      method = 'name_subset';
      candidatesMap = new Map(
        findNameSubsetCandidates(group.raw, people).map((person) => [person.id, person]),
      );
    }

    const strongCandidates = [...candidatesMap.values()];
    if (strongCandidates.length === 1 && method) {
      automatic.push({ ...group, person: strongCandidates[0], method });
      continue;
    }

    if (strongCandidates.length > 1) {
      review.push({
        ...group,
        kind: 'ambiguous',
        candidates: strongCandidates,
        reason: 'More than one person matched with the same confidence.',
      });
      continue;
    }

    const wordCandidates = findUniqueWordCandidates(group.raw, byWord);
    const rawWords = normalizeZoomName(group.raw).split(' ').filter(Boolean);
    if (rawWords.length === 1 && wordCandidates.length === 1) {
      automatic.push({
        ...group,
        person: wordCandidates[0],
        method: 'unique_single_word',
      });
      continue;
    }

    if (wordCandidates.length > 0) {
      review.push({
        ...group,
        kind: wordCandidates.length === 1 ? 'possible_match' : 'ambiguous',
        candidates: wordCandidates,
        reason:
          wordCandidates.length === 1
            ? 'Only one name word matched. Confirm it before attendance is changed.'
            : 'Different name words point to different people.',
      });
      continue;
    }

    review.push({
      ...group,
      kind: 'unmatched',
      candidates: [],
      reason: 'No reliable match was found.',
    });
  }

  return {
    totalRows: names.length,
    uniqueNames: groups.length,
    automatic,
    review,
  };
}
