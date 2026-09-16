import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

const fixturesRoot = resolve(process.cwd(), 'fixtures/blackjack');

export interface ShoeFixtureCard {
  cardId: string;
  rank: string;
  suit: string;
}

export interface ShoeFixture {
  description: string;
  cards: ShoeFixtureCard[];
  // shoe-near-cut 전용: 이 판 시작 시점의 잔여 카드 수(재셔플 경계 검증용).
  remainingBeforeDeal?: number;
  // low-balance 전용: cards 대신 세션 잔액을 직접 구성할 때 사용.
  balanceCents?: number;
}

export function fixturePath(name: string): string {
  return join(fixturesRoot, `${name}.json`);
}

export async function loadFixture(name: string): Promise<ShoeFixture> {
  const raw = await readFile(fixturePath(name), 'utf-8');
  return JSON.parse(raw) as ShoeFixture;
}
