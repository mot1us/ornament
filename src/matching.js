import { randomInt } from 'node:crypto';

function shuffled(values) {
  const items = [...values];
  for (let i = items.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

export function forbiddenPairs({ year, history = [], exclusions = [] }) {
  return new Set([
    ...exclusions,
    ...history.filter(p => p.year === year - 1 || p.year === year - 2)
  ].map(p => JSON.stringify([p.giver, p.recipient])));
}

export function validateDraw(pairs, people, options) {
  const ids = new Set(people);
  const forbidden = forbiddenPairs(options);
  const errors = [];
  if (pairs.length !== ids.size || new Set(pairs.map(p => p.giver)).size !== ids.size ||
      new Set(pairs.map(p => p.recipient)).size !== ids.size) errors.push('Everyone must give once and receive once.');
  const edges = new Map(pairs.map(p => [p.giver, p.recipient]));
  for (const { giver, recipient } of pairs) {
    if (!ids.has(giver) || !ids.has(recipient)) errors.push('A match contains someone outside this exchange.');
    if (giver === recipient) errors.push('Someone drew themselves.');
    if (forbidden.has(JSON.stringify([giver, recipient]))) errors.push('A match violates an exclusion or the two-year history rule.');
    if (options.noReciprocal !== false && edges.get(recipient) === giver) errors.push('Two people drew each other.');
  }
  return [...new Set(errors)];
}

export function generateDraw(people, options) {
  if (people.length < 3 || people.length > 50 || new Set(people).size !== people.length) {
    throw new Error('Use between 3 and 50 distinct participants.');
  }
  const forbidden = forbiddenPairs(options);
  const edges = new Map();
  const used = new Set();
  let visits = 0;
  const candidates = giver => shuffled(people.filter(recipient => recipient !== giver && !used.has(recipient) &&
    !forbidden.has(JSON.stringify([giver, recipient])) &&
    (options.noReciprocal === false || edges.get(recipient) !== giver)));
  const search = () => {
    if (++visits > 500000) throw new Error('The search limit was reached. Reduce the exchange size or review its restrictions.');
    if (edges.size === people.length) return true;
    const remaining = shuffled(people.filter(id => !edges.has(id)))
      .map(id => ({ id, choices: candidates(id) })).sort((a, b) => a.choices.length - b.choices.length);
    if (remaining.some(p => !p.choices.length)) return false;
    const { id, choices } = remaining[0];
    for (const recipient of choices) {
      edges.set(id, recipient);
      used.add(recipient);
      if (search()) return true;
      edges.delete(id);
      used.delete(recipient);
    }
    return false;
  };
  if (!search()) throw new Error('No valid draw exists with these participants and restrictions. Review the rules; none were relaxed.');
  return [...edges].map(([giver, recipient]) => ({ giver, recipient }));
}
